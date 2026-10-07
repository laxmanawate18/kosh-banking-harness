"""The Admin Panel: only the admin sees Mitra's internals; approvals are bound to exact content; cost is never guessed."""
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui
from backend import mitra_ops, ontology


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


ADMIN_PAGES = ("skills", "data-sources", "ontology", "ontology/proc.payment_authorisation", "usage", "quality", "controls",
               "audit/verify", "approvals")


class AdminPanelTests(unittest.TestCase):
    def setUp(self):
        self.admin, self.ah = login("admin.kosh")

    def test_only_the_admin_sees_it_and_the_admin_does_no_banking(self):
        for page in ADMIN_PAGES:
            self.assertEqual(self.admin.get(f"/api/admin/{page}").status_code, 200, page)
        for user in ("officer.mumbai", "aarav"):
            other, _ = login(user)
            for page in ADMIN_PAGES:
                self.assertEqual(other.get(f"/api/admin/{page}").status_code, 403, (user, page))
        for banking in ("/api/officer/customers", "/api/officer/leads", "/api/officer/care-cases"):
            self.assertEqual(self.admin.get(banking).status_code, 403, banking)

    def test_skills_and_tools_come_from_the_code_and_the_registry(self):
        data = self.admin.get("/api/admin/skills").json()
        skills = {s["id"]: s for s in data["skills"]}
        self.assertEqual(skills["kyc"]["process"], "proc.perpetual_kyc")
        self.assertIsNone(skills["account_insights"]["process"])  # an enquiry, not a process
        money = [t for t in data["tools"] if t["effect"] == "money"]
        self.assertTrue(money and all(t["approval"] == "customer" for t in money))

    def test_data_sources_show_settings_never_secrets(self):
        listed = json.dumps(self.admin.get("/api/admin/data-sources").json())
        for secret in ("sqlite+pysqlite", "postgresql://", "password", "kosh-internal-development-token", "AUTH_INTERNAL_TOKEN"):
            self.assertNotIn(secret, listed)
        self.assertIn("Kosh banking database", listed)

    def test_a_process_approval_holds_only_for_the_content_that_was_approved(self):
        pid = "proc.card_lifecycle"
        self.assertEqual(self.admin.post(f"/api/admin/ontology/{pid}/approve", headers=self.ah, json={"note": "ok"}).status_code, 400)
        approved = self.admin.post(f"/api/admin/ontology/{pid}/approve", headers=self.ah, json={"note": "Read the steps and the model view"})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertTrue(ontology.approved(pid))
        with patch("backend.settings.PRODUCTION", True):
            self.assertTrue(ontology.usable(pid))
            self.assertFalse(ontology.usable("proc.payment_authorisation"))  # never approved
            with patch.object(ontology, "content_hash", return_value="edited-content"):
                self.assertFalse(ontology.usable(pid))  # an edited process needs a new approval
        row = next(p for p in self.admin.get("/api/admin/ontology").json()["processes"] if p["id"] == pid)
        self.assertEqual(row["approval"]["by"], "USR-ADMIN-001")
        officer, oh = login("officer.mumbai")
        self.assertEqual(officer.post(f"/api/admin/ontology/{pid}/approve", headers=oh, json={"note": "I am not the admin"}).status_code, 403)

    def test_cost_needs_reviewed_rates_and_latency_comes_from_turns(self):
        mitra_ops.record_turn(dev_ui.db, session_id="S-COST", channel="CUSTOMER", language="en", outcome="ANSWERED", latency_ms=2500,
                              model="gemini-3.8-flash", tokens=[1_000_000, 500_000], process_id="proc.payment_authorisation")
        priced = self.admin.get("/api/admin/usage").json()  # config/pricing.json: $0.75 in, $3.75 out per million
        self.assertGreater(priced["total"]["latency_ms"]["p95"], 0)
        row = next(r for r in priced["by_process"] if r["key"] == "proc.payment_authorisation")
        self.assertGreaterEqual(row["cost"], 2.625)  # 1M input at 0.75 + 0.5M output at 3.75
        unpriced = {"currency": "USD", "per_million_tokens": {"gemini-3.8-flash": {"input": None, "output": None}}}
        with patch("pathlib.Path.read_text", return_value=json.dumps(unpriced)):
            self.assertIsNone(mitra_ops.usage(dev_ui.db, 7)["total"]["cost"])  # no rates: no money figure, never a guess


class CardFreezeIsReviewed(unittest.TestCase):
    def test_every_protective_freeze_opens_an_internal_review_case(self):
        from tests.consent_helpers import grant_consent
        from banking_tools import banking_service
        from backend import care
        dev_ui.db.reset_to_seed()
        grant_consent(dev_ui.db)
        from sentinel import KNOWN_DEVICE_ID, intent_resolver
        card = next(c for c in dev_ui.db.snapshot()["cards"].values() if c["customer_id"] == "CUST-1001")
        context = {"customer_id": "CUST-1001", "session_id": "S-FRZ", "turn_id": "T1", "device_id": KNOWN_DEVICE_ID,
                   "intent": intent_resolver.resolve("Freeze my debit card", "S-FRZ", "T1", customer_id="CUST-1001")}
        with patch("backend.notifications.notify") as notify:
            result = banking_service.freeze_card(context, card["id"], "lost wallet")
        self.assertTrue(result.get("success"), result)
        review = [c for c in care.list_cases(dev_ui.db) if c["kind"] == "CARD_FREEZE" and c["customer_id"] == "CUST-1001"]
        self.assertTrue(review and review[0]["priority"] == "HIGH")
        self.assertFalse([c for c in notify.call_args_list if c.args and c.args[1] == "care_case_registered"])


if __name__ == "__main__":
    unittest.main()
