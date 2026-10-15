"""After the mobile number or email really changes, payments and new regular payments wait: the account-takeover pattern.

The change goes through the real path: a customer request, an officer's approval, then a transfer."""
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'contact.sqlite3'}"

from backend import stp
from banking_db import BankingDatabase
from banking_tools import SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService, waiting_period_reason
from service_requests import ServiceRequestService

SEED = Path(__file__).resolve().parent.parent / "data" / "banking_seed.json"


class ContactChangeGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = BankingDatabase(Path(self.temp.name) / "store.json", SEED)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.sentinel = SentinelService(self.repo, "test-secret")
        self.resolver = IntentResolver(self.repo)
        self.service = SecureBankingService(self.repo, self.sentinel)
        self.requests = ServiceRequestService(self.repo)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def change_contact(self, **data) -> None:
        request = self.requests.create(customer_id=CUSTOMER_ID, user_id="aarav", service_id="P1-11", consent_id="C", session_id="S", data=data)
        self.requests.decide(request["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Identity checked")

    def customer(self) -> dict:
        return self.repo.get_customer(CUSTOMER_ID)

    def transfer(self, session: str, payee: str, rupees: int) -> tuple:
        intent = self.resolver.resolve(f"Transfer ₹{rupees:,} to Home Rent", session, f"turn-{session}")
        context = {"session_id": session, "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01",
                   "untrusted_content_detected": False}
        result = self.service.propose_transfer(context, payee, rupees * 100, "ACC-SAL-001")
        return result, self.repo.snapshot()["sentinel_decisions"][-1]

    def test_an_approved_mobile_change_stamps_the_customer(self):
        self.assertIsNone(self.customer().get("contact_changed_at"))
        self.change_contact(mobile="9000011111")
        self.assertTrue(self.customer().get("contact_changed_at"))
        self.assertEqual(self.customer()["phone_number"], "9000011111")

    def test_an_email_change_stamps_it_too(self):
        self.change_contact(email="new.address@example.com")
        self.assertTrue(self.customer().get("contact_changed_at"))

    def test_submitting_the_same_number_again_changes_nothing(self):
        self.change_contact(mobile="9000011111")
        self.repo.transaction(lambda data: [c.pop("contact_changed_at", None) for c in (data.get("customers", {}).get(CUSTOMER_ID), data.get("customer")) if c])
        self.assertIsNone(self.customer().get("contact_changed_at"))
        self.change_contact(mobile="9000011111")  # the number on file is already this one
        self.assertIsNone(self.customer().get("contact_changed_at"))

    def test_a_large_transfer_right_after_a_mobile_change_is_refused(self):
        self.change_contact(mobile="9000011111")
        result, decision = self.transfer("S-BIG", "BEN-HOME-RENT", 30_000)  # a long-standing payee, so only the contact change applies
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("RECENT_CONTACT_CHANGE", decision["reason_codes"])

    def test_a_small_transfer_after_the_change_still_goes_to_approval(self):
        self.change_contact(mobile="9000011111")
        result, decision = self.transfer("S-SMALL", "BEN-HOME-RENT", 10_000)
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertNotIn("RECENT_CONTACT_CHANGE", decision["reason_codes"])

    def test_the_same_large_transfer_without_a_change_is_not_refused_for_it(self):
        result, decision = self.transfer("S-NOCHANGE", "BEN-HOME-RENT", 30_000)
        self.assertNotIn("RECENT_CONTACT_CHANGE", decision["reason_codes"])
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")

    def instruction(self, payee: str):
        state = self.repo.snapshot()
        fields = {"account_id": "ACC-SAL-001", "beneficiary_id": payee, "amount_minor": 800_000, "frequency": "monthly",
                  "start": (date.today() + timedelta(days=1)).isoformat(), "end": (date.today() + timedelta(days=365)).isoformat()}
        return stp._standing_instruction(state, CUSTOMER_ID, state["customers"].get(CUSTOMER_ID) or state["customer"], fields, "REQ-TESTSI01")

    def test_a_new_standing_instruction_waits_after_a_contact_change(self):
        done, error = self.instruction("BEN-HOME-RENT")
        self.assertIsNotNone(done, error)  # allowed before the change
        self.change_contact(mobile="9000011111")
        done, error = self.instruction("BEN-HOME-RENT")
        self.assertIsNone(done)
        self.assertIn("mobile number or email changed", error)

    def test_a_standing_instruction_to_a_payee_added_today_waits(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.repo.transaction(lambda data: data["beneficiaries"].update({"BEN-JUST-ADDED": {
            "id": "BEN-JUST-ADDED", "customer_id": CUSTOMER_ID, "display_name": "Just Added", "destination_masked": "•••• 1111",
            "relationship": "NEW", "created_at": now, "risk_status": "NORMAL"}}))
        done, error = self.instruction("BEN-JUST-ADDED")
        self.assertIsNone(done)
        self.assertIn("payee was added", error)

    def test_the_waiting_rule_reads_the_same_state_the_cap_does(self):
        state = self.repo.snapshot()
        self.assertIsNone(waiting_period_reason(state, CUSTOMER_ID, state["beneficiaries"]["BEN-HOME-RENT"]))


if __name__ == "__main__":
    unittest.main()
