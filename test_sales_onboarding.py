"""Automated unit & integration tests for Sentinel AI Sales Advisor and Onboarding."""

import unittest
import uuid
from unittest.mock import patch
from tests.test_visitor_chat import FakeVisitorAgent
from fastapi.testclient import TestClient

from dev_ui import app, auth_service
from banking_db import db
from auth_service import normalize_phone, DEMO_OTP
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
        self.assertEqual(premier["fact_metadata"]["source"], "sentinel_demo_catalogue")
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

    @patch("dev_ui.Agent", FakeVisitorAgent)
    def test_public_sales_chat_endpoint(self):
        """Verify REST public chat endpoint allows non-relationship visitors to consult AI."""
        payload = {
            "prompt": "What are your fixed deposit rates and why should I choose Sentinel?",
            "session_id": "test-guest-session-123"
        }
        res = self.client.post("/api/public/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["role"], "assistant")
        self.assertIn("response", data)
        self.assertIn("8.10% p.a.", data["response"]["text"])

    def test_instant_product_onboarding_and_profile_provisioning(self):
        """Verify instant onboarding creates real DB records, allocates account/card, and provisions banking profile."""
        applicant_name = "Rajesh Singhania"
        phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
        req = {
            "product_id": "PROD-SAV-PREMIER",
            "full_name": applicant_name,
            "phone_number": phone,
            "auto_login": False
        }
        res = self.client.post("/api/products/apply", json=req)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])

        # Check banking profile
        profile = data["profile"]
        self.assertEqual(profile["display_name"], applicant_name)
        self.assertTrue(profile["customer_id"].startswith("CUST-"))
        self.assertEqual(profile["phone_number"], normalize_phone(phone))
        self.assertTrue(bool(profile["username"]))
        self.assertNotIn("credentials", data)

        # Check allocated banking account
        acc = data["account"]
        self.assertTrue(acc["id"].startswith("ACC-SAV-"))
        self.assertEqual(acc["initial_balance_minor"], 100000)  # ₹1,000 welcome bonus

        # Verify customer exists in database
        cust_in_db = db.get_customer(profile["customer_id"])
        self.assertIsNotNone(cust_in_db)
        self.assertEqual(cust_in_db["display_name"], applicant_name)
        self.assertEqual(cust_in_db["kyc"]["status"], "NOT_DONE")
        self.assertIn("OUTWARD_TRANSFERS_BLOCKED", cust_in_db["kyc"]["account_restrictions"])

        # Verify allocated account exists in database
        acc_in_db = db.get_account(acc["id"])
        self.assertIsNotNone(acc_in_db)
        self.assertEqual(acc_in_db["customer_id"], profile["customer_id"])
        self.assertEqual(acc_in_db["available_balance_minor"], 100000)

        # Verify welcome bonus transaction was recorded
        txns = db.get_transactions(profile["customer_id"])
        self.assertGreaterEqual(len(txns), 1)
        self.assertEqual(txns[0]["direction"], "CREDIT")

    def test_onboarded_customer_profile_is_ready_for_oidc_authentication(self):
        """Verify the newly onboarded user can link to an OIDC subject and establish a banking session."""
        applicant_name = "Kavita Nair"
        phone = f"+9197{uuid.uuid4().int % 100000000:08d}"
        res = self.client.post("/api/products/apply", json={
            "product_id": "PROD-SAV-PREMIER",
            "full_name": applicant_name,
            "phone_number": phone,
            "auto_login": False
        })
        self.assertEqual(res.status_code, 200)
        profile = res.json()["profile"]

        # Link OIDC subject and establish BFF session
        sub_id = f"oidc-sub-{uuid.uuid4().hex[:8]}"
        context, raw_cookie, csrf_token = auth_service.create_session_for_subject(
            auth_subject=sub_id,
            sentinel_user_id=profile["user_id"],
            ip="127.0.0.1",
            user_agent="testclient",
            scopes=("openid", "banking.read", "banking.propose"),
        )
        self.assertEqual(context.customer_id, profile["customer_id"])
        self.assertEqual(context.user_id, profile["user_id"])

        # Verify session resolution via cookie
        resolved = auth_service.resolve(raw_cookie)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.customer_id, profile["customer_id"])

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

            # Receive sales action or turn complete
            next_msg = ws.receive_json()
            if next_msg["type"] == "sales_action":
                self.assertIn("products", next_msg)
                complete_msg = ws.receive_json()
                self.assertEqual(complete_msg["type"], "turn_complete")
            else:
                self.assertEqual(next_msg["type"], "turn_complete")


if __name__ == "__main__":
    unittest.main()
