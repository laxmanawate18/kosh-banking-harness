"""Straight-through processing: the five common requests complete without an officer when every rule passes."""
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'stp.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import notifications  # noqa: E402


class StraightThroughTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        self.client = TestClient(dev_ui.app)
        _, self.cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, self.cookie)
        self.h = {"X-CSRF-Token": csrf}
        self.client.post("/api/consent", headers=self.h, json={"accepted": True})
        dev_ui.auth_service.elevate_session(self.cookie, "L3")

    def submit(self, skill, fields):
        w = self.client.post("/api/ai/workflows", headers=self.h, json={"skill_id": skill}).json()
        w = self.client.patch(f"/api/ai/workflows/{w['id']}", headers=self.h, json={"revision": w["revision"], "fields": fields}).json()
        w = self.client.post(f"/api/ai/workflows/{w['id']}/review", headers=self.h, json={"revision": w["revision"], "fields": {}})
        self.assertEqual(w.status_code, 200, w.text)
        w = w.json()
        done = self.client.post(f"/api/ai/workflows/{w['id']}/submit", headers=self.h,
                                json={"revision": w["revision"], "review_digest": w["review_digest"], "confirmed": True})
        self.assertEqual(done.status_code, 200, done.text)
        return done.json(), dev_ui.request_service.get(done.json()["request_id"])

    def balance(self, account_id):
        return dev_ui.db.get_account(account_id)["available_balance_minor"]

    def test_cheque_book_is_issued_instantly_but_not_twice_in_30_days(self):
        wf, req = self.submit("cheque_book", {"account_id": "ACC-SAL-001", "leaves": "25", "delivery": "REGISTERED_ADDRESS"})
        self.assertEqual((wf["status"], req["status"]), ("COMPLETED", "COMPLETED"))
        self.assertEqual(req["collected_data"]["fulfilment"]["cheque_book"]["leaves"], 25)
        self.assertTrue(any(n["reference"] == req["id"] for n in notifications.recent(dev_ui.db, 20)))
        _, second = self.submit("cheque_book", {"account_id": "ACC-SAL-001", "leaves": "50", "delivery": "BRANCH_COLLECTION"})
        self.assertEqual(second["status"], "PENDING_APPROVAL")
        self.assertIn("STP_REFERRED", second["discrepancy_flags"])

    def test_stop_cheque_must_belong_to_an_issued_book(self):
        _, book = self.submit("cheque_book", {"account_id": "ACC-SAL-001", "leaves": "25", "delivery": "BRANCH_COLLECTION"})
        first = book["collected_data"]["fulfilment"]["cheque_book"]["first_cheque"]
        _, stop = self.submit("stop_cheque", {"account_id": "ACC-SAL-001", "cheque_number": first, "reason": "LOST"})
        self.assertEqual(stop["status"], "COMPLETED")
        _, foreign = self.submit("stop_cheque", {"account_id": "ACC-SAL-001", "cheque_number": "999999", "reason": "LOST"})
        self.assertEqual(foreign["status"], "PENDING_APPROVAL")

    def test_fixed_deposit_moves_money_once_and_large_amounts_need_an_officer(self):
        before = self.balance("ACC-SAV-002")
        _, req = self.submit("deposit", {"account_id": "ACC-SAV-002", "deposit_type": "FIXED", "amount": "50000",
                                         "tenure_months": "12", "maturity_instruction": "CREDIT_ACCOUNT"})
        self.assertEqual(req["status"], "COMPLETED", req.get("collected_data", {}).get("stp_referral"))
        fd = req["collected_data"]["fulfilment"]["deposit"]
        self.assertEqual(self.balance("ACC-SAV-002"), before - 5_000_000)
        self.assertEqual(dev_ui.db.get_account(fd["id"])["balance_minor"], 5_000_000)
        self.assertGreater(fd["maturity_amount_minor"], 5_000_000)
        _, big = self.submit("deposit", {"account_id": "ACC-SAV-002", "deposit_type": "FIXED", "amount": "1500000",
                                         "tenure_months": "12", "maturity_instruction": "CREDIT_ACCOUNT"})
        self.assertEqual(big["status"], "PENDING_APPROVAL")
        self.assertEqual(self.balance("ACC-SAV-002"), before - 5_000_000)  # nothing moved for the referred one

    def test_deposit_needs_verified_kyc(self):
        dev_ui.db.update_kyc_status("CUST-1001", "NOT_DONE")
        before = self.balance("ACC-SAV-002")
        _, req = self.submit("deposit", {"account_id": "ACC-SAV-002", "deposit_type": "FIXED", "amount": "10000",
                                         "tenure_months": "6", "maturity_instruction": "CREDIT_ACCOUNT"})
        self.assertEqual(req["status"], "PENDING_APPROVAL")
        self.assertEqual(self.balance("ACC-SAV-002"), before)

    def test_standing_instruction_to_trusted_payee(self):
        start = (date.today() + timedelta(days=3)).isoformat()
        end = (date.today() + timedelta(days=365)).isoformat()
        _, req = self.submit("standing_instruction", {"account_id": "ACC-SAL-001", "beneficiary_id": "BEN-HOME-RENT", "amount": "8000",
                                                      "frequency": "MONTHLY", "start": start, "end": end, "purpose": "House rent"})
        self.assertEqual(req["status"], "COMPLETED", req.get("collected_data", {}).get("stp_referral"))
        self.assertEqual(req["collected_data"]["fulfilment"]["standing_instruction"]["payee_name"], "Home Rent")

    def test_interest_certificate_downloads_as_csv(self):
        _, req = self.submit("certificate", {"account_id": "ACC-SAL-001", "certificate_type": "INTEREST", "financial_year": "2025-2026"})
        self.assertEqual(req["status"], "COMPLETED")
        csv = self.client.get(f"/api/portal/certificates/{req['id']}.csv")
        self.assertEqual(csv.status_code, 200)
        self.assertIn("Kosh Interest Certificate", csv.text)
        other = TestClient(dev_ui.app)
        _, cookie, _ = dev_ui.auth_service.create_direct_session("sudhir")
        other.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.assertEqual(other.get(f"/api/portal/certificates/{req['id']}.csv").status_code, 404)


if __name__ == "__main__":
    unittest.main()
