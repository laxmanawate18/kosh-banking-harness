import unittest
from datetime import date, timedelta
from banking_db import db
from backend import stp
from service_requests import ServiceRequestService

class TestExecutionAdapters(unittest.TestCase):
    def setUp(self):
        db.reset_to_seed()
        self.svc = ServiceRequestService(db)

    def tearDown(self):
        db.reset_to_seed()

    def test_stp_statement_adapter(self):
        fulfilment, referral = stp.fulfil(
            db, "statement", "CUST-1001",
            {"account_id": "ACC-SAL-001", "start": "2026-09-01", "end": "2026-09-30"},
            "REQ-STMT-001"
        )
        self.assertIsNone(referral)
        self.assertIsNotNone(fulfilment)
        self.assertIn("Statement for", fulfilment["summary"])
        self.assertIn("download", fulfilment)
        self.assertIn("ACC-SAL-001", fulfilment["download"])

    def test_stp_appointment_adapter(self):
        future_date = (date.today() + timedelta(days=5)).isoformat()
        fulfilment, referral = stp.fulfil(
            db, "appointment", "CUST-1001",
            {"branch": "FORT", "appointment_date": future_date, "time_window": "10:00–12:00", "purpose": "Wealth management"},
            "REQ-APT-001"
        )
        self.assertIsNone(referral)
        self.assertIsNotNone(fulfilment)
        self.assertIn("Branch appointment booked at Fort", fulfilment["summary"])
        self.assertEqual(fulfilment["appointment"]["status"], "CONFIRMED")
        state = db.snapshot()
        self.assertIn(fulfilment["appointment"]["id"], state.get("appointments", {}))

    def test_stp_nominee_update_adapter(self):
        fulfilment, referral = stp.fulfil(
            db, "nominee_update", "CUST-1001",
            {"account_id": "ACC-SAL-001", "nominee_name": "Rohan Mehta", "relationship": "CHILD", "nominee_dob": "2015-06-12", "nominee_address": "Worli, Mumbai"},
            "REQ-NOM-001"
        )
        self.assertIsNone(referral)
        self.assertIsNotNone(fulfilment)
        self.assertIn("Rohan Mehta", fulfilment["summary"])
        acc = db.snapshot()["accounts"]["ACC-SAL-001"]
        self.assertEqual(acc["nominee"]["name"], "Rohan Mehta")
        self.assertEqual(acc["nominee"]["relationship"], "CHILD")

    def test_officer_debit_card_reissue_adapter(self):
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-08",
            data={"reason": "Damaged chip"}, consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        result = self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Card chip damaged, issuing replacement")
        self.assertEqual(result["status"], "APPROVED")
        self.assertIn("issued_card", result["collected_data"])
        cards = db.snapshot()["cards"]
        new_card_id = result["collected_data"]["card_id"]
        self.assertIn(new_card_id, cards)
        self.assertEqual(cards[new_card_id]["status"], "ACTIVE")

    def test_officer_contact_update_adapter(self):
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-11",
            data={"email": "aarav.new@example.com", "mobile": "9876543219"},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Contact details verified")
        cust = db.snapshot()["customer"]
        self.assertEqual(cust["email"], "aarav.new@example.com")
        self.assertEqual(cust["phone_number"], "9876543219")

    def test_officer_address_update_adapter(self):
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-12",
            data={"address": "Flat 402, Sea Green Apt", "city": "Mumbai", "state": "Maharashtra", "pincode": "400018"},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Electricity bill verified")
        cust = db.snapshot()["customer"]
        self.assertEqual(cust["address"], "Flat 402, Sea Green Apt")
        self.assertEqual(cust["pincode"], "400018")

    def test_officer_pan_update_adapter(self):
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-15",
            data={"pan_number": "ABCDE1234F"}, consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="PAN card copy verified")
        cust = db.snapshot()["customer"]
        self.assertEqual(cust["pan_masked"], "AB••••4F")

    def test_officer_inoperative_account_and_lien_adapters(self):
        # Mark account inoperative and add lien
        def mark_inoperative(state):
            acc = state["accounts"]["ACC-SAL-001"]
            acc["status"] = "INOPERATIVE"
            acc["inoperative"] = True
            acc["has_lien"] = True
            acc["lien_amount_minor"] = 500000
        db.transaction(mark_inoperative)

        # Test P2-06 Inoperative activation
        req_inop = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P2-06",
            data={"account_id": "ACC-SAL-001"}, consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req_inop["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Customer re-activated account in person")
        acc = db.snapshot()["accounts"]["ACC-SAL-001"]
        self.assertEqual(acc["status"], "ACTIVE")
        self.assertFalse(acc["inoperative"])

        # Test P2-09 Lien removal
        req_lien = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P2-09",
            data={"account_id": "ACC-SAL-001"}, consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req_lien["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Lien dispute settled")
        acc = db.snapshot()["accounts"]["ACC-SAL-001"]
        self.assertFalse(acc["has_lien"])
        self.assertEqual(acc["lien_amount_minor"], 0)

    def test_officer_safe_deposit_locker_adapter(self):
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P2-13",
            data={"branch": "Mumbai Fort", "locker_size": "LARGE"},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        result = self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Locker allocated")
        self.assertIn("locker", result["collected_data"])
        self.assertEqual(result["collected_data"]["locker"]["size"], "LARGE")
        lockers = db.snapshot()["lockers"]
        self.assertIn(result["collected_data"]["locker"]["id"], lockers)

if __name__ == "__main__":
    unittest.main()
