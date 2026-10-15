"""A payment re-checks the money limits on live state in the transaction that claims its approval.

Sentinel checked them when it decided. Two approvals handled at the same moment can each pass that check, so the second one is
stopped when it is posted, not just when it was decided."""
import os
import tempfile
import unittest
from pathlib import Path

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'recheck.sqlite3'}"

from banking_db import BankingDatabase
from banking_tools import LimitExceeded, SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService

DAILY_LIMIT = 10_000_000  # 1 lakh
SEED = Path(__file__).resolve().parent.parent / "data" / "banking_seed.json"


class PaymentRecheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = BankingDatabase(Path(self.temp.name) / "store.json", SEED)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.repo.transaction(lambda data: data["delegations"]["DLG-BANKING-001"].update(max_daily_minor=DAILY_LIMIT))
        self.sentinel = SentinelService(self.repo, "test-secret")
        self.resolver = IntentResolver(self.repo)
        self.service = SecureBankingService(self.repo, self.sentinel)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def propose(self, session: str, amount_rupees: int) -> dict:
        intent = self.resolver.resolve(f"Transfer ₹{amount_rupees:,} to Vikram", session, f"turn-{session}")
        context = {"session_id": session, "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01",
                   "untrusted_content_detected": False}
        result = self.service.propose_transfer(context, "BEN-VIKRAM", amount_rupees * 100, "ACC-SAL-001")
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED", result)
        return result

    def decision_made_before_the_other_approval(self, payment_id: str) -> tuple:
        """What Sentinel would have decided for this payment's approval, as it does in approve_challenge."""
        payment = self.repo.get_payment_intent(payment_id)
        intent = self.repo.get_intent(payment["intent_id"])
        context = self.service._context({"session_id": payment["session_id"], "turn_id": intent.get("turn_id"), "intent": intent,
                                         "customer_id": CUSTOMER_ID, **payment.get("security_context", {})}, payment)
        context["step_up_verified"] = True
        decision = self.sentinel.evaluate(context)
        self.assertEqual(decision["decision"], "ALLOW", decision["reason_codes"])
        return payment, decision

    def test_the_second_of_two_approvals_is_stopped_when_it_is_posted(self):
        first = self.propose("S-FIRST", 60_000)
        second = self.propose("S-SECOND", 60_000)  # each alone is inside the 1 lakh daily limit
        payment2, decision2 = self.decision_made_before_the_other_approval(second["payment_intent_id"])

        done = self.service.approve_challenge(first["challenge_id"], first["challenge"]["transaction_digest"])
        self.assertEqual(done["status"], "EXECUTED")
        balance = self.repo.get_account("ACC-SAL-001")["balance_minor"]

        with self.assertRaises(LimitExceeded) as caught:
            self.service._execute_payment(payment2, decision2, decision2["authorization_token"])
        self.assertEqual(caught.exception.reason, "DELEGATION_SCOPE_EXCEEDED")
        self.assertIn("Nothing was sent", caught.exception.customer_message)
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["balance_minor"], balance)  # no second debit
        self.assertEqual(self.repo.get_payment_intent(payment2["id"])["status"], "DENIED")
        blocked = [e for e in self.repo.snapshot()["audit_events"] if e.get("event_type") == "PAYMENT_BLOCKED_AT_POSTING"]
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]["details"]["reason"], "DELEGATION_SCOPE_EXCEEDED")

    def test_the_refused_approval_tells_the_customer_in_plain_words(self):
        first = self.propose("S-FIRST", 60_000)
        second = self.propose("S-SECOND", 60_000)
        self.service.approve_challenge(first["challenge_id"], first["challenge"]["transaction_digest"])
        refused = self.service.approve_challenge(second["challenge_id"], second["challenge"]["transaction_digest"])
        self.assertEqual(refused["status"], "DENIED")
        self.assertNotIn("DELEGATION_SCOPE_EXCEEDED", str(refused.get("presentation", "")) + str(refused.get("error", "")))

    def test_a_token_is_not_spent_by_a_refused_posting(self):
        first = self.propose("S-FIRST", 60_000)
        second = self.propose("S-SECOND", 60_000)
        payment2, decision2 = self.decision_made_before_the_other_approval(second["payment_intent_id"])
        self.service.approve_challenge(first["challenge_id"], first["challenge"]["transaction_digest"])
        with self.assertRaises(LimitExceeded):
            self.service._execute_payment(payment2, decision2, decision2["authorization_token"])
        stored = next(d for d in self.repo.snapshot()["sentinel_decisions"] if d["id"] == decision2["id"])
        self.assertIsNone(stored.get("consumed_at"))


if __name__ == "__main__":
    unittest.main()
