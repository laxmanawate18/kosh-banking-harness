"""Next-best offer: offers come from the customer's own data, obey consent/suppression/caps, and feed the funnel."""
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'offers.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402
import dev_ui  # noqa: E402
from backend import offers  # noqa: E402
from banking_tools import build_banking_tools  # noqa: E402
from persistence import CrossSellLeadRecord, OfferEventRecord  # noqa: E402

PREFS = {"email_updates": True, "payment_alerts": True, "monthly_statement": True, "whatsapp_updates": False}


class OfferTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        with dev_ui.db.runtime.sessions.begin() as s:
            s.execute(delete(OfferEventRecord))
            s.execute(delete(CrossSellLeadRecord))
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        def fresh_salary(state):  # keep the signals inside the 45-day window whatever the seed dates are
            for t in state["transactions"]:
                if t["customer_id"] == "CUST-1001":
                    t["created_at"] = now
        dev_ui.db.transaction(fresh_salary)
        self.client, self.h = self.login("aarav")

    def login(self, user):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session(user)
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        h = {"X-CSRF-Token": csrf}
        client.post("/api/consent", headers=h, json={"accepted": True})
        return client, h

    def consent(self, on=True, client=None, h=None):
        r = (client or self.client).patch("/api/portal/preferences", headers=h or self.h, json={**PREFS, "marketing_offers": on})
        self.assertEqual(r.status_code, 200, r.text)

    def offer_ids(self, client=None):
        return [o["product_id"] for o in (client or self.client).get("/api/portal/offers").json()["offers"]]

    def test_nothing_is_pushed_without_marketing_consent_and_consent_is_audited(self):
        self.assertEqual(self.client.get("/api/portal/offers").json(), {"offers": [], "blocked": "MARKETING_CONSENT_REQUIRED"})
        self.consent()
        body = self.client.get("/api/portal/offers").json()
        fd = next(o for o in body["offers"] if o["product_id"] == "PROD-FD-SMART")
        self.assertIn("8.10%", fd["reason"])  # the reason quotes the customer's own idle balance and the real rate
        kinds = [e["event_type"] for e in dev_ui.db.snapshot()["audit_events"] if e.get("customer_id") == "CUST-1001"]
        self.assertIn("MARKETING_CONSENT_GRANTED", kinds)
        self.consent(False)
        self.assertEqual(self.offer_ids(), [])

    def test_no_offers_until_kyc_is_verified(self):
        self.consent()
        dev_ui.db.update_kyc_status("CUST-1001", "NOT_DONE")
        self.assertEqual(self.client.get("/api/portal/offers").json()["blocked"], "KYC_NOT_VERIFIED")

    def test_holdings_decide_the_offer(self):
        other, h = self.login("sudhir")
        self.consent(client=other, h=h)
        ids = self.offer_ids(other)
        self.assertNotIn("PROD-FD-SMART", ids)  # already holds a fixed deposit
        self.assertIn("PROD-WEALTH-ALPHA", ids)

    def test_dismissed_offer_rests_and_apply_needs_an_eligible_offer(self):
        self.consent()
        self.offer_ids()
        self.client.post("/api/portal/offers/PROD-FD-SMART", headers=self.h, json={"action": "DISMISSED"})
        self.assertNotIn("PROD-FD-SMART", self.offer_ids())
        self.assertEqual(self.client.post("/api/portal/offers/PROD-FD-SMART", headers=self.h, json={"action": "APPLY"}).status_code, 409)

    def test_frequency_cap_rests_an_ignored_offer(self):
        self.consent()
        with dev_ui.db.runtime.sessions.begin() as s:
            for days in (1, 2, 3):
                s.add(OfferEventRecord(id=f"OFR-CAP-{days}", customer_id="CUST-1001", product_id="PROD-FD-SMART", channel="DASHBOARD",
                                       event="SHOWN", created_at=datetime.now(timezone.utc) - timedelta(days=days)))
        self.assertNotIn("PROD-FD-SMART", self.offer_ids())

    def test_funnel_follows_an_offer_from_shown_to_approved(self):
        self.consent()
        self.assertIn("PROD-FD-SMART", self.offer_ids())
        self.offer_ids()  # a second dashboard load the same day is not a second impression
        self.client.post("/api/portal/offers/PROD-FD-SMART", headers=self.h, json={"action": "CLICKED"})
        applied = self.client.post("/api/portal/offers/PROD-FD-SMART", headers=self.h, json={"action": "APPLY"}).json()
        self.assertNotIn("PROD-FD-SMART", self.offer_ids())  # open application suppresses it
        officer, oh = self.login("officer.mumbai")
        self.assertEqual(officer.post(f"/api/officer/leads/{applied['lead_id']}/status", headers=oh, json={"status": "APPROVED"}).status_code, 200)
        row = next(r for r in officer.get("/api/officer/offers/funnel").json()["rows"]
                   if (r["product_id"], r["channel"]) == ("PROD-FD-SMART", "DASHBOARD"))
        self.assertEqual((row["shown"], row["clicked"], row["applied"], row["approved"]), (1, 1, 1, 1))
        self.assertEqual(row["conversion_rate"], 100.0)
        self.assertEqual(self.client.get("/api/officer/offers/funnel").status_code, 403)

    def test_mitra_pitches_one_offer_a_day_and_records_declines_and_applications(self):
        self.consent()
        tools = {t.__name__: t for t in build_banking_tools(lambda: {"customer_id": "CUST-1001", "user_id": "aarav", "session_id": "S1"})}
        first = tools["get_next_best_offer"]()
        self.assertTrue(first["has_offer"])
        self.assertEqual(first["presentation"]["type"], "CROSS_SELL_OFFER")
        self.assertFalse(tools["get_next_best_offer"]()["has_offer"])  # daily cap
        lead = tools["record_customer_lead"](category="DEPOSIT", sub_type="FD")
        events = {e.event for e in dev_ui.db.runtime.sessions().scalars(
            __import__("sqlalchemy").select(OfferEventRecord).where(OfferEventRecord.reference == lead["lead_id"]))}
        self.assertEqual(events, {"APPLIED"} if first["product_id"] == "PROD-FD-SMART" else set())
        self.assertTrue(tools["decline_offer"](product_id="PROD-CARD-CASHBACK")["recorded"])
        self.assertIsNotNone(offers._suppressed(dev_ui.db.runtime.sessions(), "CUST-1001", "PROD-CARD-CASHBACK", "cards"))


if __name__ == "__main__":
    unittest.main()
