"""Automated unit & integration tests for the Kosh (Mitra) sales advisor and onboarding."""

import unittest
import uuid
from unittest.mock import patch
from tests.test_visitor_chat import FakeVisitorAgent
from fastapi.testclient import TestClient

from dev_ui import app, auth_service
from banking_db import db
from auth_service import COOKIE_NAME, normalize_phone
from product_service import (
    BANK_PRODUCTS, SalesSessionContext, build_public_sales_tools, get_all_products,
    get_product_by_id, sales_advisor, validate_sales_response,
)


class SalesOnboardingTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_all_products_catalogue(self):
        """Verify the products catalogue API returns categorized bank products with rates."""
        response = self.client.get("/api/products")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("products", data)
        self.assertIn("categories", data)
        self.assertGreaterEqual(len(data["products"]), 6)

        # Check key product fields
        premier = next(p for p in data["products"] if p["id"] == "PROD-SAV-PREMIER")
        self.assertEqual(premier["headline_rate"], "7.20% p.a.")
        self.assertEqual(premier["category"], "savings")
        self.assertNotIn("competitor_comparison", premier)
        self.assertEqual(premier["fact_metadata"]["source"], "kosh_demo_catalogue")
        self.assertTrue(premier["fact_metadata"]["illustrative"])

        # Check category filter
        cards_resp = self.client.get("/api/products?category=cards")
        self.assertEqual(cards_resp.status_code, 200)
        cards_data = cards_resp.json()
        self.assertTrue(all(p["category"] == "cards" for p in cards_data["products"]))

    def test_sales_advisor_builds_a_progressive_grounded_journey(self):
        context = SalesSessionContext()
        clarify = sales_advisor.answer_query("Help me choose a credit card", context=context)
        self.assertEqual(clarify["stage"], "CLARIFY")
        self.assertTrue(clarify["follow_up_question"])

        card_res = sales_advisor.answer_query("Travel and lounge access matter", context=context)
        self.assertEqual(card_res["stage"], "RECOMMEND")
        self.assertEqual(card_res["products"][0]["id"], "PROD-CARD-OBSIDIAN")
        self.assertIn("travel", card_res["summary"]["preferences"])

        apply_res = sales_advisor.answer_query("I want to apply for the Obsidian Metal card", context=context)
        self.assertEqual(apply_res["action"], "offer_onboarding")
        self.assertEqual(apply_res["product_id"], "PROD-CARD-OBSIDIAN")
        self.assertEqual(apply_res["next_action"]["label"], "Review application")

    def test_public_tools_are_read_only_and_brand_validator_blocks_bad_claims(self):
        context = SalesSessionContext(goal="savings")
        tools = {tool.__name__: tool for tool in build_public_sales_tools(lambda: context)}
        result = tools["search_public_products"]("savings", "zero balance")
        self.assertTrue(result["products"])
        self.assertNotIn("competitor_comparison", result["products"][0])
        self.assertEqual(result["fact_metadata"]["last_reviewed_at"], "2026-09-22")
        self.assertIsNotNone(validate_sales_response("Guaranteed approval at 99.9%."))
        self.assertIsNotNone(validate_sales_response("HDFC offers a worse deal."))

    def test_existing_customer_cannot_be_overwritten_from_public_application(self):
        before = db.snapshot()
        response = self.client.post('/api/products/apply', json={
            'product_id':'PROD-SAV-PREMIER', 'full_name':'Other Person',
            'phone_number':'+919899887766', 'username':'officer.mumbai', 'auto_login':False})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(db.snapshot(), before)

    def test_savings_application_is_queued_without_creating_a_customer(self):
        """The public form records a lead for officer review; no customer, account or login exists yet."""
        phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
        customers_before = set(db.snapshot().get("customers", {}))
        res = self.client.post("/api/products/apply", json={
            "product_id": "PROD-SAV-PREMIER", "full_name": "Rajesh Singhania", "phone_number": phone,
            "email": "rajesh@example.com"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "PENDING_APPROVAL")
        self.assertTrue(data["application_ref"].startswith("SAV-APP-"))
        self.assertNotIn("credentials", data)
        self.assertEqual(set(db.snapshot().get("customers", {})), customers_before)
        self.assertFalse(auth_service.profile_exists(phone))
        lead = next(l for l in db.list_leads() if (l.get("preferences") or {}).get("app_ref") == data["application_ref"])
        self.assertEqual(lead["status"], "PENDING_APPROVAL")
        self.assertEqual(lead["preferences"]["phone_number"], normalize_phone(phone))

    def test_officer_approved_customer_is_ready_for_oidc_authentication(self):
        """After officer approval, the provisioned profile links to an OIDC subject and gets a banking session."""
        phone = f"+9197{uuid.uuid4().int % 100000000:08d}"
        applied = self.client.post("/api/products/apply", json={
            "product_id": "PROD-SAV-PREMIER", "full_name": "Kavita Nair", "phone_number": phone,
            "email": "kavita@example.com"}).json()
        lead = next(l for l in db.list_leads() if (l.get("preferences") or {}).get("app_ref") == applied["application_ref"])
        officer = TestClient(app)
        _, cookie, csrf = auth_service.create_direct_session("officer.mumbai")
        officer.cookies.set(COOKIE_NAME, cookie)
        with patch("backend.session_routes._auth_server", return_value=True):
            approved = officer.post(f"/api/officer/leads/{lead['id']}/approve", headers={"X-CSRF-Token": csrf}, json={})
        self.assertEqual(approved.status_code, 200, approved.text)
        customer_id = approved.json()["customer_id"]
        self.assertEqual(db.get_customer(customer_id)["kyc"]["status"], "NOT_DONE")

        sub_id = f"oidc-sub-{uuid.uuid4().hex[:8]}"
        context, raw_cookie, _ = auth_service.create_session_for_subject(
            auth_subject=sub_id, sentinel_user_id=customer_id, ip="127.0.0.1", user_agent="testclient",
            scopes=("openid", "banking.read", "banking.propose"))
        self.assertEqual(context.customer_id, customer_id)
        resolved = auth_service.resolve(raw_cookie)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.customer_id, customer_id)

    @patch("dev_ui.Agent", FakeVisitorAgent)
    def test_visitor_websocket_chat_streaming(self):
        """Verify WebSocket accepts unauthenticated visitors and streams sales advisor turn."""
        guest_client = TestClient(app)
        # Connect without any auth cookie
        with guest_client.websocket_connect("/ws/chat?session_id=visitor-ws-test") as ws:
            init_msg = ws.receive_json()
            self.assertEqual(init_msg["type"], "connection_ready")
            self.assertTrue(init_msg.get("visitor_mode"))

            # Send sales prompt
            ws.send_json({
                "type": "prompt",
                "prompt": "Tell me about the Sovereign Premier Savings account"
            })

            # Receive turn start
            start_msg = ws.receive_json()
            self.assertEqual(start_msg["type"], "turn_start")

            # Receive validated text delta
            delta_msg = ws.receive_json()
            self.assertEqual(delta_msg["type"], "text_delta")
            self.assertTrue(delta_msg["text"].startswith("LLM answer:"))

            # The reply streams in checked sentences; then optional companion card and sales action, then turn complete
            rest = [ws.receive_json()]
            while rest[-1]["type"] != "turn_complete":
                rest.append(ws.receive_json())
            self.assertTrue(set(m["type"] for m in rest) <= {"text_delta", "presentation", "sales_action", "message_saved", "turn_complete"})
            streamed = delta_msg["text"] + "".join(m.get("text", "") for m in rest if m["type"] == "text_delta")
            self.assertEqual(streamed, "LLM answer: demo rates are 7.20% and 8.10% p.a.")
            action = next((m for m in rest if m["type"] == "sales_action"), None)
            if action:
                self.assertIn("products", action)


if __name__ == "__main__":
    unittest.main()
