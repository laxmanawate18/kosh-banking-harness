"""MCP gateway: external agents reach Kosh only with a customer-bound token, through the registry, audit and Sentinel."""
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui
from auth_service import AuthContext

HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18"}
TOKENS = {
    "full": ("CUST-1001", ("banking.read", "banking.propose")),
    "read-only": ("CUST-1001", ("banking.read",)),
    "no-customer": (None, ("banking.read", "banking.propose")),  # e.g. an officer
}


def _context(token, required_scopes=()):
    if token not in TOKENS:
        raise PermissionError("OAuth token validation failed")
    customer_id, scopes = TOKENS[token]
    return AuthContext(session_id="s", user_id=f"USR-{token}", username=token, display_name=token, role="CUSTOMER",
                       customer_id=customer_id, assurance_level="L2", client_id="kosh-mcp-test", scopes=scopes)


class McpGatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patch = patch.object(dev_ui.oauth_service, "context_from_access_token", side_effect=_context)
        cls.patch.start()
        cls.client = TestClient(dev_ui.app).__enter__()  # runs the lifespan, which starts the MCP session manager

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        cls.patch.stop()

    def setUp(self):
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")

    def call(self, name, arguments=None, token="full"):
        response = self.client.post("/mcp", headers={**HEADERS, "Authorization": f"Bearer {token}"}, json={
            "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments or {}}})
        if response.status_code != 200:
            return response.status_code, None
        data = [line[5:] for line in response.text.splitlines() if line.startswith("data:")][-1]
        result = json.loads(data)["result"]
        return 200, json.loads(result["content"][0]["text"])

    def test_requires_a_valid_customer_bound_token(self):
        self.assertEqual(self.client.get("/.well-known/oauth-protected-resource/mcp").status_code, 200)
        self.assertEqual(self.call("get_customer_summary", token="forged")[0], 401)
        self.assertEqual(self.call("get_customer_summary", token="no-customer")[0], 401)

    def test_read_tool_returns_the_callers_own_data_and_is_audited(self):
        status, result = self.call("get_customer_summary")
        self.assertEqual(status, 200)
        self.assertEqual(result["customer"]["display_name"], "Aarav Mehta")
        events = [e for e in dev_ui.db.get_audit_events(limit=20) if e["event_type"] == "AGENT_TOOL_ALLOWED"]
        self.assertTrue(events and events[0]["session_id"].startswith("MCP-kosh-mcp-test"))

    def test_scopes_and_registry_are_enforced(self):
        _, denied = self.call("freeze_card", {"card_id": "CARD-DEBIT-5521", "reason": "lost"}, token="read-only")
        self.assertFalse(denied["success"])
        self.assertIn("banking.propose", denied["error"])
        _, bad = self.call("propose_transfer", {"beneficiary_id": "BEN-VIKRAM", "amount_minor": -5, "source_account_id": "ACC-SAL-001"})
        self.assertFalse(bad["success"])

    def test_an_agent_can_only_propose_money_movement(self):
        before = dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"]
        _, result = self.call("propose_transfer", {"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100000, "source_account_id": "ACC-SAL-001"})
        self.assertIn(result["status"], {"CHALLENGE_REQUIRED", "DENIED"})
        self.assertEqual(dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"], before)

    def test_customer_approves_an_agent_proposed_payment_in_kavach(self):
        _, proposed = self.call("propose_bill_payment", {"bill_id": "BILL-TATA-001", "source_account_id": "ACC-SAL-001"})
        self.assertEqual(proposed["status"], "CHALLENGE_REQUIRED")
        web = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        web.cookies.set(dev_ui.COOKIE_NAME, cookie)
        inbox = web.get("/api/portal/approvals").json()["approvals"]
        item = next(a for a in inbox if a["id"] == proposed["challenge_id"])
        self.assertEqual((item["requested_via"], item["amount_minor"], item["payee_name"]), ("ASSISTANT_APP", 243000, "Tata Power Mumbai"))
        before = dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"]
        dev_ui.auth_service.elevate_session(cookie, "L3")
        done = web.post(f"/api/challenges/{item['id']}/verify", headers={"X-CSRF-Token": csrf},
                        json={"transaction_digest": item["transaction_digest"]}).json()
        self.assertEqual(done["status"], "EXECUTED", done)
        self.assertEqual(dev_ui.db.get_account("ACC-SAL-001")["available_balance_minor"], before - 243000)
        self.assertFalse(any(a["id"] == item["id"] for a in web.get("/api/portal/approvals").json()["approvals"]))

    def test_bank_can_pause_agent_access(self):
        dev_ui.db.set_controls(disabled_channels=["MCP"], disabled_tools=[], reason="drill", officer_user_id="USR-OFFICER-001")
        try:
            _, result = self.call("get_customer_summary")
        finally:
            dev_ui.db.set_controls(disabled_channels=[], disabled_tools=[], reason="drill over", officer_user_id="USR-OFFICER-001")
        self.assertIn("TOOL_PAUSED", result["error"])


if __name__ == "__main__":
    unittest.main()
