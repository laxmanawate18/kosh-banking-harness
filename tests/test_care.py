"""Customer care in Mitra: fraud, distress, complaints, callbacks, disclaimers and responsible lending."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'care.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import care, notifications, offers  # noqa: E402
from product_service import SalesSessionContext, build_public_sales_tools, loan_affordability  # noqa: E402
from tests.test_visitor_chat import FakeVisitorAgent  # noqa: E402


class DetectionTests(unittest.TestCase):
    def test_intents(self):
        cases = {
            "Someone called from the bank and I shared my OTP": ["FRAUD"],
            "I didn't make this transaction of ₹5,000": ["FRAUD"],
            "my account got hacked": ["FRAUD"],
            "maine otp de diya, fraud ho gaya": ["FRAUD"],
            "मैंने ओटीपी बताया, धोखाधड़ी हुई": ["FRAUD"],
            "I lost my job and can't pay my EMI": ["DISTRESS"],
            "My father passed away, what about his account?": ["DISTRESS"],
            "I want to file a complaint about wrong charges": ["COMPLAINT"],
            "मुझे शिकायत दर्ज करनी है": ["COMPLAINT"],
            "Can I talk to a human please": ["HUMAN"],
            "please call me back": ["HUMAN"],
            "I want to end my life": ["SELF_HARM"],
        }
        for prompt, expected in cases.items():
            self.assertEqual(care.detect(prompt)[:1], expected, prompt)

    def test_ordinary_questions_are_not_care_cases(self):
        for prompt in ("What fraud protection does the Neo card have?", "What is the PIN code field for?",
                       "Compare the Neo and Vajra cards", "How do I reset my net banking password?", "Is the FD rate fixed?"):
            self.assertEqual(care.detect(prompt), [], prompt)

    def test_investment_and_insurance_notes(self):
        self.assertIn("not investment advice", care.with_disclaimers("Nivesh lets you invest in mutual funds."))
        self.assertIn("never a condition", care.with_disclaimers("Add Loan Shield insurance to your loan."))
        plain = "The Neo card is lifetime free."
        self.assertEqual(care.with_disclaimers(plain), plain)
        once = care.with_disclaimers("Mutual funds via Nivesh.")
        self.assertEqual(care.with_disclaimers(once), once)


class LendingTests(unittest.TestCase):
    def test_emi_and_verdicts(self):
        ok = loan_affordability("PROD-LOAN-EXPRESS", 500000, 60, 100000)
        self.assertEqual(ok["monthly_emi"], "₹10,685")
        self.assertEqual(ok["verdict"], "comfortable")
        self.assertIn("Key Fact Statement", ok["key_facts"])
        high = loan_affordability("PROD-LOAN-EXPRESS", 2000000, 36, 60000, existing_emi=10000)
        self.assertEqual(high["verdict"], "above the safe limit")
        self.assertLess(int(high["max_affordable_loan"].replace("₹", "").replace(",", "")), 2000000)
        self.assertFalse(loan_affordability("PROD-CARD-CASHBACK", 1, 12, 1)["ok"])
        self.assertFalse(loan_affordability("PROD-LOAN-EXPRESS", 500000, 120, 100000)["ok"])  # tenure out of range


class CaseTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()

    def test_visitor_complaint_needs_a_valid_mobile_and_texts_the_reference(self):
        tools = {t.__name__: t for t in build_public_sales_tools(lambda: self.context)}
        self.context = SalesSessionContext()
        bad = tools["register_complaint"](full_name="Asha", mobile="12345", summary="Charged twice for my card fee")
        self.assertFalse(bad["registered"])
        good = tools["register_complaint"](full_name="Asha", mobile="98765 43210", summary="Charged twice for my card fee")
        self.assertTrue(good["registered"] and good["reference"].startswith("CMP-"))
        self.assertIn("cms.rbi.org.in", good["timeline"])
        self.assertTrue(self.context.no_selling)
        sms = [n for n in notifications.recent(dev_ui.db, 20) if n["reference"] == good["reference"]]
        self.assertTrue(sms and "registered" in sms[0]["body"])

    def test_officer_queue_and_status_update(self):
        case = care.open_case(dev_ui.db, "CALLBACK", "Please call about my home loan", name="Ravi", phone="9876500000")
        officer = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("officer.mumbai")
        officer.cookies.set(dev_ui.COOKIE_NAME, cookie)
        rows = officer.get("/api/officer/care-cases").json()["cases"]
        row = next(r for r in rows if r["id"] == case["reference"])
        self.assertEqual((row["kind"], row["status"], row["overdue"]), ("CALLBACK", "OPEN", False))
        self.assertIn("•", row["phone"])
        done = officer.post(f"/api/officer/care-cases/{case['reference']}", headers={"X-CSRF-Token": csrf},
                            json={"status": "RESOLVED", "resolution": "Called and explained"})
        self.assertEqual(done.json()["status"], "RESOLVED")
        customer = TestClient(dev_ui.app)
        _, c2, _ = dev_ui.auth_service.create_direct_session("aarav")
        customer.cookies.set(dev_ui.COOKIE_NAME, c2)
        self.assertEqual(customer.get("/api/officer/care-cases").status_code, 403)

    def test_hardship_pauses_offers(self):
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        dev_ui.db.transaction(lambda s: s.setdefault("preferences", {}).update({"CUST-1001": {"marketing_offers": True}}))
        care.pause_offers(dev_ui.db, "CUST-1001")
        self.assertEqual(offers.next_best_offers(dev_ui.db, "CUST-1001", "DASHBOARD", record=False)["blocked"], "PAUSED_FOR_HARDSHIP")


class VisitorChatCareTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        FakeVisitorAgent.instances = []
        FakeVisitorAgent.fail = FakeVisitorAgent.empty = False
        FakeVisitorAgent.output_text = "I'm sorry about this. Could you share your name and mobile so I can register it?"
        self.patch = patch.object(dev_ui, "Agent", FakeVisitorAgent)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = TestClient(dev_ui.app)

    def turn(self, ws, prompt):
        ws.send_json({"type": "prompt", "prompt": prompt})
        events = []
        while not events or events[-1]["type"] not in {"turn_complete", "error"}:
            events.append(ws.receive_json())
        return events

    def test_fraud_gets_the_fixed_safety_script_without_the_model(self):
        with self.client.websocket_connect("/ws/chat") as ws:
            ws.receive_json()
            events = self.turn(ws, "Someone called me and I shared my OTP, money is gone")
        text = "".join(e.get("text", "") for e in events if e["type"] == "text_delta")
        self.assertIn("1930", text)
        self.assertIn("cybercrime.gov.in", text)
        self.assertEqual(FakeVisitorAgent.instances, [])
        self.assertTrue(any(e["type"] == "presentation" and e["presentation"]["type"] == "CHOICE_SELECTION" for e in events))

    def test_complaint_reaches_the_model_with_a_care_directive_and_no_cross_sell(self):
        with self.client.websocket_connect("/ws/chat") as ws:
            ws.receive_json()
            events = self.turn(ws, "I want to complain, I was charged wrongly on my card")
        sent = FakeVisitorAgent.instances[0].prompts[-1]
        self.assertIn("CARE DIRECTIVE", sent)
        self.assertIn("register_complaint", sent)
        self.assertFalse(any(e.get("companion_cross_sell") for e in events))
        self.assertFalse(any(e["type"] == "presentation" and e["presentation"].get("type") == "CROSS_SELL_OFFER" for e in events))

    def test_self_harm_shows_the_helpline_first(self):
        with self.client.websocket_connect("/ws/chat") as ws:
            ws.receive_json()
            events = self.turn(ws, "I have lost everything and want to end my life")
        text = "".join(e.get("text", "") for e in events if e["type"] == "text_delta")
        self.assertTrue(text.startswith("I'm really sorry"))
        self.assertIn("14416", text)
        self.assertIn("CARE DIRECTIVE", FakeVisitorAgent.instances[0].prompts[-1])


if __name__ == "__main__":
    unittest.main()
