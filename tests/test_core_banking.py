"""Core banking boundary: posts are idempotent, and reconciliation settles payments left mid-post and reports mismatches."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from banking_db import BankingDatabase
from banking_tools import SecureBankingService
from core_banking import MockCoreBanking, reconcile
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService


# reconcile(stale_after_seconds=-1) means "older than now by any amount": with 0, a coarse clock (Windows) can return equal timestamps
# for the payment and the check, and the stuck payment is not seen as stale.
class CoreBankingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = BankingDatabase(Path(self.temp.name) / "c.json", Path(__file__).parent.parent / "data" / "banking_seed.json")
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.core = MockCoreBanking(self.repo)
        self.service = SecureBankingService(self.repo, SentinelService(self.repo, "test-secret"), self.core)
        self.resolver = IntentResolver(self.repo)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def pay_bill(self):
        intent = self.resolver.resolve("Pay my Tata Power electricity bill", "S-CORE", f"t-{len(self.repo.snapshot()['intents'])}")
        context = {"session_id": "S-CORE", "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01"}
        proposed = self.service.propose_bill_payment(context, "BILL-TATA-001", "ACC-SAL-001")
        return self.service.approve_challenge(proposed["challenge"]["id"], proposed["challenge"]["transaction_digest"])

    def balance(self):
        return self.repo.get_account("ACC-SAL-001")["available_balance_minor"]

    def test_executed_payment_is_in_the_core_journal_and_reconciles(self):
        receipt = self.pay_bill()["receipt"]
        self.assertEqual(receipt["core_adapter"], "mock-core")
        report = reconcile(self.repo, self.core)
        self.assertTrue(report["balanced"], report)

    def test_repeated_post_with_the_same_key_moves_money_once(self):
        posting = {"idempotency_key": "K-1", "payment_id": "P-1", "customer_id": CUSTOMER_ID, "action_type": "TRANSFER",
                   "source_account_id": "ACC-SAL-001", "amount_minor": 1000, "beneficiary_id": "BEN-VIKRAM", "bill_id": None}
        before = self.balance()
        first, second = self.core.post_payment(posting), self.core.post_payment(posting)
        self.assertEqual(first["core_reference"], second["core_reference"])
        self.assertEqual(self.balance(), before - 1000)

    def test_crash_after_the_core_posted_is_settled_as_executed(self):
        before = self.balance()
        original = self.repo.transaction

        def crash_on_record(mutator):
            if getattr(mutator, "__name__", "") == "record":
                raise ConnectionError("instance died after the core posted")
            return original(mutator)
        with patch.object(self.repo, "transaction", side_effect=crash_on_record), self.assertRaises(ConnectionError):
            self.pay_bill()
        self.assertEqual(self.balance(), before - 243000)  # the core did move the money
        payment = next(p for p in self.repo.snapshot()["payment_intents"] if p["status"] == "POSTING")
        report = reconcile(self.repo, self.core, stale_after_seconds=-1)
        self.assertEqual(report["settled"], [{"payment_id": payment["id"], "outcome": "RECORDED_AS_EXECUTED"}])
        self.assertEqual(self.repo.get_payment_intent(payment["id"])["status"], "EXECUTED")

    def test_crash_before_the_core_posted_is_settled_as_failed(self):
        before = self.balance()
        with patch.object(self.core, "post_payment", side_effect=RuntimeError("network to core lost")), self.assertRaises(RuntimeError):
            self.pay_bill()
        report = reconcile(self.repo, self.core, stale_after_seconds=-1)
        self.assertEqual(report["settled"][0]["outcome"], "MARKED_FAILED_NOT_POSTED")
        self.assertEqual(self.balance(), before)

    def test_a_core_posting_kosh_never_made_is_reported(self):
        self.pay_bill()
        self.repo.transaction(lambda d: d["core_postings"].update({"K-ROGUE": {
            "core_reference": "TXNREF-X", "status": "POSTED", "amount_minor": 5, "source_account_id": "ACC-SAL-001", "kosh_payment_id": "P-?"}}))
        report = reconcile(self.repo, self.core)
        self.assertFalse(report["balanced"])
        self.assertEqual(report["issues"][0]["type"], "POSTED_WITHOUT_KOSH_PAYMENT")


if __name__ == "__main__":
    unittest.main()
