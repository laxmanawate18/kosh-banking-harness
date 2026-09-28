"""HTTP, UI contract, and Antigravity configuration tests."""

import asyncio
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_SUITE_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'suite.sqlite3'}")

from fastapi.testclient import TestClient
from google.antigravity import Agent, types

import dev_ui
from backend.agent_config import SecureToolGateHook, create_agent_config
from backend.conversations import create_session_data, save_session
from backend.settings import DEFAULT_MODEL
from banking_tools import BANKING_TOOL_NAMES, build_banking_tools
from product_service import PUBLIC_SALES_TOOL_NAMES


class SentinelAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(dev_ui.app)

    def login_as(self, client: TestClient, username: str = "aarav", assurance_level: str = "L2") -> str:
        context, raw_cookie, csrf_token = dev_ui.auth_service.create_direct_session(
            username, assurance_level=assurance_level
        )
        client.cookies.set(dev_ui.COOKIE_NAME, raw_cookie)
        self._raw_cookie = raw_cookie
        return csrf_token

    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        self.csrf = self.login_as(self.client, "aarav")
        consent = self.client.post("/api/consent", headers={"X-CSRF-Token": self.csrf}, json={"accepted": True})
        self.assertEqual(consent.status_code, 200)

    def post(self, url, **kwargs):
        kwargs.setdefault("headers", {})["X-CSRF-Token"] = self.csrf
        return self.client.post(url, **kwargs)

    def test_banking_portal_has_no_developer_controls_or_thoughts(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn('<div id="root"></div>', response.text)
        script = re.search(r'src="(/assets/[^"]+\.js)"', response.text)
        self.assertIsNotNone(script, "Build the React frontend before running UI contract tests")
        bundle = self.client.get(script.group(1))
        self.assertEqual(bundle.status_code, 200)
        for removed in ("modelSelect", "toolsToggle", "thought-panel", "Replay poisoned biller"):
            self.assertNotIn(removed, bundle.text)

    def test_dashboard_is_masked_and_inr(self):
        data = self.client.get("/api/dashboard").json()
        self.assertEqual(data["currency"], "INR")
        self.assertTrue(data["simulation"])
        self.assertTrue(all("•" in item["account_number_masked"] for item in data["accounts"]))
        self.assertNotIn("account_number", data["accounts"][0])

    def test_agent_config_has_exact_tools_and_no_builtins_or_subagents(self):
        config = create_agent_config("config-test")
        tool_names = [tool.__name__ for tool in config.tools]
        self.assertEqual(len(tool_names), len(set(tool_names)), "Agent config must not contain duplicate tool names")
        self.assertEqual(set(tool_names), BANKING_TOOL_NAMES | PUBLIC_SALES_TOOL_NAMES)
        self.assertEqual(config.capabilities.enabled_tools, [])
        self.assertFalse(config.capabilities.enable_subagents)
        self.assertEqual(config.model.name, "gemini-3.8-flash")
        self.assertEqual([type(h).__name__ for h in config.hooks], ["SecureToolGateHook", "SessionPostToolCallHook"])

        async def _check_agent_startup():
            async with Agent(config):
                pass
        asyncio.run(_check_agent_startup())

    def test_pre_tool_gate_denies_unregistered_and_otp_arguments(self):
        gate = SecureToolGateHook()
        denied = asyncio.run(gate.run(None, types.ToolCall(name="run_command", args={"command": "id"})))
        otp = asyncio.run(gate.run(None, types.ToolCall(name="freeze_card", args={"card_id": "CARD-DEBIT-5521", "reason": "x", "otp": "123"})))
        allowed = asyncio.run(gate.run(None, types.ToolCall(name="propose_transfer", args={"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100, "source_account_id": "ACC-SAL-001"})))
        self.assertFalse(denied.allow)
        self.assertFalse(otp.allow)
        self.assertTrue(allowed.allow)

        unauth_gate = SecureToolGateHook(trusted_context={"customer_id": None})
        auth_req = asyncio.run(unauth_gate.run(None, types.ToolCall(name="propose_transfer", args={"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100, "source_account_id": "ACC-SAL-001"})))
        self.assertFalse(auth_req.allow)
        self.assertIn("AUTH_REQUIRED", auth_req.message)

    def test_session_crud_and_websocket_connection(self):
        created = self.post("/api/sessions", json={"title": "Secure demo"}).json()
        session_id = created["id"]
        with self.client.websocket_connect(f"/ws/chat?session_id={session_id}") as websocket:
            ready = websocket.receive_json()
            self.assertEqual(ready["type"], "connection_ready")
            self.assertEqual(ready["session_id"], session_id)
        updated = self.client.patch(f"/api/sessions/{session_id}", headers={"X-CSRF-Token": self.csrf}, json={"title": "Renamed"}).json()
        self.assertEqual(updated["title"], "Renamed")
        self.assertTrue(self.client.delete(f"/api/sessions/{session_id}", headers={"X-CSRF-Token": self.csrf}).json()["deleted"])

    def test_session_creation_with_migrated_messages(self):
        migrated = [
            {"role": "user", "text": "i want a chequebook", "timestamp": 1234567890},
            {"role": "assistant", "text": "Please sign in securely to access account services.", "timestamp": 1234567891},
        ]
        created = self.post("/api/sessions", json={"title": "Chequebook request", "messages": migrated}).json()
        session_id = created["id"]
        detail = self.client.get(f"/api/sessions/{session_id}").json()
        self.assertEqual(len(detail["messages"]), 2)
        self.assertEqual(detail["messages"][0]["text"], "i want a chequebook")
        self.assertEqual(detail["messages"][1]["text"], "Please sign in securely to access account services.")
        self.client.delete(f"/api/sessions/{session_id}", headers={"X-CSRF-Token": self.csrf})

    def test_authenticated_agent_initialization_on_chat_prompt(self):
        created = self.post("/api/sessions", json={"title": "Accounts inquiry"}).json()
        session_id = created["id"]
        with self.client.websocket_connect(f"/ws/chat?session_id={session_id}") as websocket:
            ready = websocket.receive_json()
            self.assertEqual(ready["type"], "connection_ready")
            websocket.send_json({"type": "prompt", "prompt": "Show my accounts and recent spending."})
            first_event = websocket.receive_json()
            self.assertEqual(first_event["type"], "intent_bound")
            second_event = websocket.receive_json()
            self.assertEqual(second_event["type"], "turn_start")
            saw_duplicate_error = False
            for _ in range(15):
                try:
                    event = websocket.receive_json()
                    if event.get("type") == "error" and "Duplicate custom tool" in event.get("message", ""):
                        saw_duplicate_error = True
                        break
                    if event.get("type") in ("tool_result", "text_delta", "turn_complete"):
                        break
                except Exception:
                    break
            self.assertFalse(saw_duplicate_error, "Should not encounter duplicate custom tool error")
        self.client.delete(f"/api/sessions/{session_id}", headers={"X-CSRF-Token": self.csrf})

    def test_reset_and_replay_never_change_balance(self):
        before = self.client.get("/api/dashboard").json()["total_available_minor"]
        session_id = self.post("/api/sessions", json={"title": "Replay"}).json()["id"]
        replay = self.post(f"/api/demo/replay/prompt-injection?session_id={session_id}").json()
        after = self.client.get("/api/dashboard").json()["total_available_minor"]
        self.assertEqual(replay["status"], "DENY")
        self.assertEqual(before, after)
        self.assertNotIn("authorization_token", replay["sentinel"])
        reset = self.post("/api/demo/reset").json()
        self.assertTrue(reset["reset"])

    def test_customer_event_contract_omits_secrets_and_raw_thoughts(self):
        session_id = self.post("/api/sessions", json={"title": "Event contract"}).json()["id"]
        self.post(f"/api/demo/replay/prompt-injection?session_id={session_id}")
        payload = self.client.get(f"/api/sentinel/events?session_id={session_id}").json()
        raw = str(payload).lower()
        self.assertNotIn("authorization_token", raw)
        self.assertNotIn("chain_of_thought", raw)
        self.assertNotIn("246810", raw)
        self.assertTrue(payload["events"])
        self.assertTrue(all(len(event["integrity_hash"]) == 64 for event in payload["events"]))

    def test_loaded_session_is_sanitized(self):
        stored = create_session_data("Sanitize me", user_id="USR-CUSTOMER-001", customer_id="CUST-1001")
        stored["messages"].append({"role": "assistant", "text": "Safe answer", "thought": "private reasoning", "tool_calls": [{"args": {"otp": "246810"}}]})
        stored["traces"].append({"type": "thought", "text": "private reasoning"})
        save_session(stored)
        response = self.client.get(f"/api/sessions/{stored['id']}")
        raw = response.text.lower()
        self.assertNotIn("private reasoning", raw)
        self.assertNotIn("tool_calls", raw)
        self.client.delete(f"/api/sessions/{stored['id']}", headers={"X-CSRF-Token": self.csrf})

    def test_demo_config_does_not_advertise_an_otp(self):
        data = self.client.get("/api/demo/config").json()
        self.assertTrue(data["simulated"])
        self.assertNotIn("demo_otp", data)
        self.assertEqual(data["model"], DEFAULT_MODEL)

    def test_auth_consent_csrf_and_officer_separation(self):
        anonymous = TestClient(dev_ui.app)
        self.assertEqual(anonymous.get("/api/dashboard").status_code, 401)
        self.assertEqual(self.client.post("/api/demo/reset").status_code, 403)
        request = self.post("/api/service-requests", json={"service_id": "P1-08", "data": {}})
        self.assertEqual(request.status_code, 403)  # L3 required before submission.

        officer = TestClient(dev_ui.app)
        officer_csrf = self.login_as(officer, "officer.mumbai")
        self.assertEqual(officer.get("/api/dashboard").status_code, 403)
        self.assertEqual(officer.get("/api/officer/queue").status_code, 200)
        self.assertEqual(officer.post("/api/service-requests", headers={"X-CSRF-Token": officer_csrf}, json={"service_id": "P1-23", "data": {}}).status_code, 403)

    def test_login_endpoint_is_rate_limited(self):
        attempts = [self.client.get("/api/auth/start", follow_redirects=False) for _ in range(25)]
        self.assertIn(429, [response.status_code for response in attempts])

    def test_service_request_and_named_officer_decision(self):
        # Use a human-approval L2 workflow so no transaction challenge is needed.
        created = self.post("/api/service-requests", json={"service_id": "P2-14", "data": {"summary": "Escalate complaint"}})
        self.assertEqual(created.status_code, 200)
        request_id = created.json()["id"]
        officer = TestClient(dev_ui.app)
        officer_csrf = self.login_as(officer, "officer.mumbai")
        decided = officer.post(f"/api/officer/requests/{request_id}/decision",
                               headers={"X-CSRF-Token": officer_csrf},
                               json={"action": "APPROVE", "reason": "Evidence reviewed"})
        self.assertEqual(decided.status_code, 200)
        self.assertEqual(decided.json()["status"], "APPROVED")
        self.assertEqual(decided.json()["approver_id"], "USR-OFFICER-001")

    def test_general_step_up_is_rate_limited_and_enables_l3_service(self):
        dev_ui.auth_service.elevate_session(self._raw_cookie, "L3")
        created = self.post("/api/service-requests", json={"service_id": "P1-08", "data": {"reason": "Damaged card"}})
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["status"], "PENDING_APPROVAL")

    def test_phone_login_and_public_config(self):
        config = self.client.get("/api/auth/public-config").json()  # TestClient host is not loopback
        self.assertEqual(config["oauth_start_url"], "/api/auth/start")
        self.assertIn("gcp_project_id", config)
        self.assertFalse(config["is_local"])
        self.assertNotIn("firebase_test_code", config)
        local = TestClient(dev_ui.app, base_url="http://127.0.0.1:8019").get("/api/auth/public-config").json()
        self.assertTrue(local["is_local"])
        self.assertEqual(local["firebase_test_code"], "246810")
        self.assertEqual(local["firebase_test_phone"], "+919876543210")

        # Verify start auth redirects to Better Auth provider with PKCE query
        start = self.client.get("/api/auth/start", follow_redirects=False)
        self.assertEqual(start.status_code, 302)
        self.assertIn("response_type=code", start.headers["location"])
        self.assertIn("client_id=sentinel-web", start.headers["location"])


    def test_multitenant_customer_and_chatbot_isolation(self):
        # 1. Sudhir Jaiswal login
        sudhir_client = TestClient(dev_ui.app)
        sudhir_csrf = self.login_as(sudhir_client, "sudhir")
        sudhir_client.post("/api/consent", headers={"X-CSRF-Token": sudhir_csrf}, json={"accepted": True})

        # Dashboard check for Sudhir
        sudhir_dash = sudhir_client.get("/api/dashboard").json()
        self.assertEqual(sudhir_dash["customer"]["display_name"], "Sudhir Jaiswal")
        self.assertEqual(sudhir_dash["total_available_minor"], 290500000)
        self.assertEqual(len(sudhir_dash["accounts"]), 3)

        # Chatbot tools check for Sudhir
        tools_sudhir = {t.__name__: t for t in build_banking_tools(lambda: {"customer_id": "CUST-1002"})}
        summary_sudhir = tools_sudhir["get_customer_summary"]()
        self.assertEqual(summary_sudhir["customer"]["display_name"], "Sudhir Jaiswal")
        self.assertEqual(summary_sudhir["total_available_minor"], 290500000)
        self.assertEqual({b["display_name"] for b in summary_sudhir["beneficiaries"]}, {"BESCOM Bengaluru", "Airtel Fiber Broadband", "Ananya Verma", "Rahul Sharma"})

        # 2. Aarav Mehta login
        aarav_client = TestClient(dev_ui.app)
        aarav_csrf = self.login_as(aarav_client, "aarav")
        aarav_client.post("/api/consent", headers={"X-CSRF-Token": aarav_csrf}, json={"accepted": True})

        aarav_dash = aarav_client.get("/api/dashboard").json()
        self.assertEqual(aarav_dash["customer"]["display_name"], "Aarav Mehta")
        self.assertEqual(aarav_dash["total_available_minor"], 41000000)
        self.assertEqual(len(aarav_dash["accounts"]), 2)

        # Chatbot tools check for Aarav
        tools_aarav = {t.__name__: t for t in build_banking_tools(lambda: {"customer_id": "CUST-1001"})}
        summary_aarav = tools_aarav["get_customer_summary"]()
        self.assertEqual(summary_aarav["customer"]["display_name"], "Aarav Mehta")
        self.assertEqual(summary_aarav["total_available_minor"], 41000000)
        self.assertEqual({b["display_name"] for b in summary_aarav["beneficiaries"]}, {"Tata Power Mumbai", "Home Rent", "Vikram", "Fast Cash Services"})

        # 3. Verify Agent Config System Instructions include customer context
        config_sudhir = create_agent_config("sess-sudhir", session_context={"customer_id": "CUST-1002"})
        self.assertIn("Sudhir Jaiswal", config_sudhir.system_instructions)
        self.assertIn("CUST-1002", config_sudhir.system_instructions)

        config_aarav = create_agent_config("sess-aarav", session_context={"customer_id": "CUST-1001"})
        self.assertIn("Aarav Mehta", config_aarav.system_instructions)
        self.assertIn("CUST-1001", config_aarav.system_instructions)

    def test_kyc_compliance_workflow_and_officer_approval(self):
        from workflow_test_support import submit_kyc, VERIFICATION
        client = TestClient(dev_ui.app)
        client_csrf = self.login_as(client, "sudhir")
        headers = {"X-CSRF-Token": client_csrf}
        client.post("/api/consent", headers=headers, json={"accepted":True})
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1002")["status"], "PENDING_RE_KYC")
        dossier = submit_kyc(client, headers, customer_name="Sudhir Jaiswal", update_type="DETAILS_CHANGED")
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1002")["status"], "SUBMITTED_FOR_REVIEW")
        officer = TestClient(dev_ui.app)
        officer_csrf = self.login_as(officer, "officer.mumbai")
        decision = officer.post(f"/api/officer/requests/{dossier['request_id']}/decision",
            headers={"X-CSRF-Token": officer_csrf},
            json={"action":"APPROVE","reason":"Synthetic evidence independently reviewed", **VERIFICATION})
        self.assertEqual(decision.status_code, 200, decision.text)
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1002")["status"], "VERIFIED")

    def test_kyc_request_cancellation_reverts_status_to_pending(self):
        from workflow_test_support import submit_kyc
        client = TestClient(dev_ui.app)
        client_csrf = self.login_as(client, "sudhir")
        headers = {"X-CSRF-Token": client_csrf}
        client.post("/api/consent", headers=headers, json={"accepted":True})
        dossier = submit_kyc(client, headers, customer_name="Sudhir Jaiswal", update_type="DETAILS_CHANGED")
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1002")["status"], "SUBMITTED_FOR_REVIEW")
        cancelled = client.post(f"/api/portal/requests/{dossier['request_id']}/cancel", headers=headers)
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1002")["status"], "PENDING_RE_KYC")

    def test_aarav_initial_kyc_onboarding_scanner_and_compliance_flow(self):
        from workflow_test_support import kyc_draft
        headers = {"X-CSRF-Token":self.csrf}
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1001")["status"], "NOT_DONE")
        draft = kyc_draft(self.client, headers)
        self.assertEqual(len(draft["documents"]), 2)
        self.assertEqual(dev_ui.db.get_kyc_profile("CUST-1001")["status"], "NOT_DONE")
        self.assertTrue(draft["review_digest"])
        # OCR can prefill evidence, but it must never fabricate issuer verification.
        validation = dev_ui.banking_service.validate_kyc_document("PAN", "AAAPM1001M")
        self.assertEqual(validation["verification_status"], "FORMAT_ONLY")
        self.assertFalse(validation["issuer_verified"])
        self.assertNotIn("holder_name", validation)
        self.assertNotIn("ocr_confidence", validation)

    def test_kosh_ai_banker_page_contract(self):
        """The served React assets (entry + lazy chunks) contain the shared chat UI and navigation."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        entry = re.findall(r'(?:src|href)="(/assets/[^"]+)"', response.text)
        self.assertTrue(any(asset.endswith(".js") for asset in entry))
        self.assertTrue(any(asset.endswith(".css") for asset in entry))
        contents = {"js": "", "css": ""}
        for built in sorted((dev_ui.FRONTEND_DIST / "assets").glob("*")):
            if built.suffix[1:] in contents:
                result = self.client.get(f"/assets/{built.name}")
                self.assertEqual(result.status_code, 200)
                contents[built.suffix[1:]] += result.text
        for selector in (".ai-workbench-grid", ".ai-main-workspace", ".ai-chat-header",
                         ".ai-messages-scroll", ".ai-input-box", ".assistant-dialog"):
            self.assertIn(selector, contents["css"])
        for text in ("ai-banker", "Mitra, Kosh AI banker", "aiPageMessages", "Message Mitra",
                     "Close assistant", "Reconnect", "Sign in for account services"):
            self.assertIn(text, contents["js"])

    def test_portal_kyc_reset_endpoint(self):
        # 1. Aarav resets his KYC state via portal endpoint
        res = self.client.post("/api/portal/kyc/reset", headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["kyc"]["status"], "NOT_DONE")
        self.assertEqual(data["kyc"]["kyc_type"], "INITIAL_KYC")
        self.assertEqual(data["kyc"]["pan_masked"], "UNVERIFIED")
        self.assertIn("OUTWARD_TRANSFERS_BLOCKED", data["kyc"]["account_restrictions"])

        # 2. Portal overview reflects NOT_DONE
        overview = self.client.get("/api/portal/overview", headers={"X-CSRF-Token": self.csrf}).json()
        self.assertEqual(overview["kyc"]["status"], "NOT_DONE")
        self.assertEqual(overview["kyc"]["kyc_type"], "INITIAL_KYC")

    def test_multimodal_websocket_attachment_handling(self):
        created = self.post("/api/sessions", json={"title":"Unbound attachment test"}).json()
        with self.client.websocket_connect(f"/ws/chat?session_id={created['id']}") as websocket:
            self.assertEqual(websocket.receive_json()["type"], "connection_ready")
            websocket.send_json({"type":"prompt", "prompt":"Read my PAN", "attachments":[
                {"name":"pan.png","mime_type":"image/png","data_base64":"UNBOUND"}]})
            event = websocket.receive_json()
            self.assertEqual(event["type"], "error")
            self.assertIn("workflow upload", event["message"])
        saved = self.client.get(f"/api/sessions/{created['id']}").json()
        self.assertFalse(saved["messages"])


if __name__ == "__main__":
    unittest.main()
