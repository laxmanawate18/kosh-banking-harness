"""What a Sentinel decision tells the customer, Mitra and outside agents (guardrail G8: no tipping off).

The outcome, a reference and, when the customer can act on it, plain words. Never the score, the checks or the reason codes. The full
record stays in the audit trail for officers."""
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'disclosure.sqlite3'}"

from backend import harness
from banking_db import BankingDatabase
from banking_tools import GENERIC_REFUSAL, SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService

SEED = Path(__file__).resolve().parent.parent / "data" / "banking_seed.json"
SECRET_WORDS = ("reason_codes", "risk_score", "KNOWN_MULE_DESTINATION", "VELOCITY_LIMIT", "NEW_DEVICE", "NEW_BENEFICIARY",
                "KYC_NON_COMPLIANT", "DELEGATION_SCOPE_EXCEEDED", "NEW_PAYEE_LIMIT_EXCEEDED", "checks")


class DecisionDisclosureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = BankingDatabase(Path(self.temp.name) / "store.json", SEED)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.service = SecureBankingService(self.repo, SentinelService(self.repo, "test-secret"))
        self.resolver = IntentResolver(self.repo)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def transfer(self, payee: str, rupees: int, said: str = "Vikram", session: str = "S-DISCLOSE") -> dict:
        intent = self.resolver.resolve(f"Transfer ₹{rupees:,} to {said}", session, f"turn-{session}-{payee}")
        context = {"session_id": session, "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01",
                   "untrusted_content_detected": False}
        return self.service.propose_transfer(context, payee, rupees * 100, "ACC-SAL-001")

    def stored(self, result: dict) -> dict:
        return next(d for d in self.repo.snapshot()["sentinel_decisions"] if d["id"] == result["sentinel"]["reference"])

    def assert_nothing_leaks(self, result: dict):
        text = json.dumps(result, ensure_ascii=False)
        for word in SECRET_WORDS:
            self.assertNotIn(word, text)

    def test_a_flagged_payee_gets_a_generic_refusal_and_a_reference(self):
        result = self.transfer("BEN-FASTCASH", 5_000, said="Fast Cash Services")
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(set(result["sentinel"]), {"reference", "decision", "customer_message"})
        self.assertEqual(result["sentinel"]["customer_message"], GENERIC_REFUSAL)
        self.assertEqual(result["presentation"]["message"], GENERIC_REFUSAL)
        self.assert_nothing_leaks(result)

    def test_officers_still_have_the_full_reasons(self):
        result = self.transfer("BEN-FASTCASH", 5_000, said="Fast Cash Services")
        record = self.stored(result)
        self.assertIn("KNOWN_MULE_DESTINATION", record["reason_codes"])
        self.assertTrue(record["checks"])
        audit = [e for e in self.repo.snapshot()["audit_events"] if e.get("decision_id") == record["id"] and e["event_type"] == "SENTINEL_DECISION"]
        self.assertIn("KNOWN_MULE_DESTINATION", audit[0]["details"]["reason_codes"])

    def test_what_the_customer_can_fix_is_said_in_plain_words(self):
        self.repo.update_kyc_status(CUSTOMER_ID, "NOT_DONE")
        kyc = self.transfer("BEN-VIKRAM", 5_000)
        self.assertEqual(kyc["sentinel"]["customer_message"], "Complete your KYC to send money.")
        self.assert_nothing_leaks(kyc)

    def test_the_new_payee_limit_names_the_amount(self):
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.repo.transaction(lambda data: data["beneficiaries"].update({"BEN-TODAY": {
            "id": "BEN-TODAY", "customer_id": CUSTOMER_ID, "display_name": "Added Today", "destination_masked": "•••• 4321",
            "relationship": "NEW", "created_at": now, "risk_status": "NORMAL"}}))
        result = self.transfer("BEN-TODAY", 30_000, said="Added Today")
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("₹25,000", result["sentinel"]["customer_message"])
        self.assertIn("24 hours", result["sentinel"]["customer_message"])
        self.assert_nothing_leaks(result)

    def test_a_request_for_approval_carries_no_score_or_reasons_either(self):
        result = self.transfer("BEN-VIKRAM", 75_000)
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertEqual(set(result["sentinel"]), {"reference", "decision"})
        self.assert_nothing_leaks(result)
        self.assertGreater(self.stored(result)["risk_score"], 0)  # still recorded for officers

    def test_no_tool_lets_the_model_read_the_reasons_or_the_score(self):
        allowed = {"sentinel.decision", "sentinel.customer_message"}
        for channel, tools in harness.registry()["channels"].items():
            for name, spec in tools.items():
                view = spec.get("model_view")
                for field in (view.get("fields", []) if isinstance(view, dict) else []):  # some tools declare a keyword, not a field list
                    self.assertNotIn("reason_codes", field, f"{channel}/{name}")
                    self.assertNotIn("risk_score", field, f"{channel}/{name}")
                    if field.startswith("sentinel."):
                        self.assertIn(field, allowed, f"{channel}/{name}")

    def test_the_model_may_read_the_plain_words_so_mitra_can_pass_them_on(self):
        spec = harness.tool_spec("customer", "propose_transfer")
        self.assertIn("sentinel.customer_message", spec["model_view"]["fields"])


if __name__ == "__main__":
    unittest.main()
