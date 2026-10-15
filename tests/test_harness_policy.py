"""Sentinel's thresholds and weights come from config/harness/policy.json, and its version is stamped on every decision."""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import harness
from banking_db import BankingDatabase
from banking_tools import SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = BankingDatabase(Path(self.temp.name) / "s.json", Path(__file__).parent.parent / "data" / "banking_seed.json")
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.service = SecureBankingService(self.repo, SentinelService(self.repo, "test-secret"))
        self.resolver = IntentResolver(self.repo)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def transfer(self):
        intent = self.resolver.resolve("Transfer ₹75,000 to Vikram", "S-POL", f"t-{len(self.repo.snapshot()['intents'])}")
        context = {"session_id": "S-POL", "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01"}
        result = self.service.propose_transfer(context, "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        # the full stored record: the customer's result carries only the outcome and plain words
        return next(d for d in self.repo.snapshot()["sentinel_decisions"] if d["id"] == result["sentinel"]["reference"])

    def test_decision_records_the_policy_version(self):
        self.assertEqual(self.transfer()["policy_version"], harness.policy_version())
        self.assertRegex(harness.policy_version(), r"^\d{4}-\d{2}-\d{2}\.\d+\+[0-9a-f]{8}$")

    def test_weights_in_the_file_drive_the_score(self):
        base = self.transfer()["risk_score"]
        stricter = copy.deepcopy(harness.policy())
        stricter["sentinel"]["weights"]["HIGH_VALUE_TRANSFER"] = 60
        with patch.object(harness, "policy", return_value=stricter):
            harsher = self.transfer()
        self.assertEqual(harsher["decision"], "DENY")  # 60 + 40 more crosses deny_at_score
        self.assertGreater(harsher["risk_score"], base)

    def test_every_weight_is_a_known_reason(self):
        self.assertEqual(set(harness.policy()["sentinel"]["weights"]), {
            "NEW_BENEFICIARY", "TRUSTED_PRIOR_BENEFICIARY", "AMOUNT_ABOVE_BASELINE", "HIGH_VALUE_TRANSFER", "NEW_DEVICE",
            "KNOWN_BOUND_DEVICE", "SUSPECTED_INDIRECT_PROMPT_INJECTION", "KNOWN_RECURRING_BILL", "BILL_ABOVE_AUTONOMY_LIMIT",
            "UNUSUAL_TRANSACTION_TIME", "VELOCITY_LIMIT"})


if __name__ == "__main__":
    unittest.main()
