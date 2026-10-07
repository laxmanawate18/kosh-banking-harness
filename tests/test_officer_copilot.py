"""Officer copilot: a second agent built only from harness config; it reads and drafts, the officer decides."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend import harness, officer_copilot
from backend.agent_config import HarnessGateHook, create_harness_agent_config
from service_requests import ServiceRequestService


class FakeCopilot:
    prompts = []

    def __init__(self, config):
        self.config = config

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def chat(self, prompt):
        FakeCopilot.prompts.append(prompt)

        async def chunks():
            yield types.Text(step_index=0, text="Request REQ-1 has one discrepancy: the PAN ABCDE1234F name differs.")
        return SimpleNamespace(chunks=chunks())


class OfficerCopilotTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.svc = ServiceRequestService(dev_ui.db)
        self.request = self.svc.create(customer_id="CUST-1001", user_id="aarav", service_id="P1-08", consent_id="C", session_id="S",
                                       data={"card": "1234", "pan_number": "ABCDE1234F", "mobile": "9876543210"})
        self.tools = {t.__name__: t for t in officer_copilot.build_officer_tools(dev_ui.db, self.svc, "USR-OFFICER-001")}

    def test_tools_are_exactly_the_registry_channel(self):
        self.assertEqual(set(self.tools), set(harness.tools("officer")))
        with self.assertRaises(ValueError):
            create_harness_agent_config("officer", "S", "x", [*self.tools.values(), lambda: None], {})

    def test_results_are_masked_before_the_model_sees_them(self):
        from backend.llm_boundary import Vault, guarded_tools
        model_tools = {t.__name__: t for t in guarded_tools(self.tools.values(), "officer", Vault())}
        details = model_tools["get_request_details"](request_id=self.request["id"])
        self.assertNotIn("ABCDE1234F", str(details))
        self.assertNotIn("9876543210", str(details))
        # The copilot learns which details were collected, never their values.
        self.assertEqual(details["collected_fields"], ["card", "mobile", "pan_number"])
        self.assertNotIn("collected_data", details)

    def test_a_draft_is_never_a_decision(self):
        result = self.tools["draft_decision_note"](request_id=self.request["id"], recommendation="APPROVE", reasoning="All checks match.")
        self.assertTrue(result["recorded"])
        after = self.svc.get(self.request["id"])
        self.assertEqual(after["status"], "PENDING_APPROVAL")
        self.assertEqual(after["findings"][-1]["status"], "DRAFT_NOT_A_DECISION")

    def test_gate_enforces_the_officer_channel_and_scopes(self):
        read_only = HarnessGateHook("officer", {"session_id": "S-OC", "scopes": ["officer.read"]})
        run = lambda gate, name, args: asyncio.run(gate.run(None, types.ToolCall(name=name, args=args)))
        self.assertTrue(run(read_only, "list_pending_requests", {}).allow)
        self.assertFalse(run(read_only, "draft_decision_note", {"request_id": "REQ-1", "recommendation": "APPROVE", "reasoning": "x"}).allow)
        self.assertFalse(run(read_only, "propose_transfer", {}).allow)  # customer tools do not exist for this agent
        self.assertFalse(run(read_only, "get_request_details", {"request_id": "../x"}).allow)

    def test_endpoint_officers_only_masked_reply_and_kill_switch(self):
        officer = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("officer.mumbai")
        officer.cookies.set(dev_ui.COOKIE_NAME, cookie)
        with patch.object(dev_ui, "Agent", FakeCopilot):
            r = officer.post("/api/officer/copilot", headers={"X-CSRF-Token": csrf},
                             json={"message": "What should I check?", "request_id": self.request["id"],
                                   "history": [{"role": "officer", "text": "Hi"}]})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertNotIn("ABCDE1234F", r.json()["reply"])
            self.assertIn(self.request["id"], FakeCopilot.prompts[-1])
            customer = TestClient(dev_ui.app)
            _, c_cookie, c_csrf = dev_ui.auth_service.create_direct_session("aarav")
            customer.cookies.set(dev_ui.COOKIE_NAME, c_cookie)
            self.assertEqual(customer.post("/api/officer/copilot", headers={"X-CSRF-Token": c_csrf}, json={"message": "x"}).status_code, 403)
            dev_ui.db.set_controls(disabled_channels=["OFFICER"], disabled_tools=[], reason="drill", officer_user_id="USR-OFFICER-001")
            try:
                self.assertEqual(officer.post("/api/officer/copilot", headers={"X-CSRF-Token": csrf}, json={"message": "x"}).status_code, 503)
            finally:
                dev_ui.db.set_controls(disabled_channels=[], disabled_tools=[], reason="drill over", officer_user_id="USR-OFFICER-001")


if __name__ == "__main__":
    unittest.main()
