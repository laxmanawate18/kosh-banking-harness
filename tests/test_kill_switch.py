"""Admin kill switches: pause Mitra per channel or block single tools, instantly and with an audit record."""
import asyncio
import unittest

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend.agent_config import SecureToolGateHook


def _client(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


def _turn(ws, prompt):
    ws.send_json({"type": "prompt", "prompt": prompt})
    events = []
    while not events or events[-1]["type"] not in {"turn_complete", "error"}:
        events.append(ws.receive_json())
    return "".join(e.get("text", "") for e in events if e["type"] == "text_delta"), events[-1]


class KillSwitchTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        self.admin, self.ah = _client("admin.kosh")
        self.addCleanup(lambda: dev_ui.db.set_controls(disabled_channels=[], disabled_tools=[], reason="test cleanup",
                                                       officer_user_id="USR-OFFICER-001"))

    def set(self, **body):
        return self.admin.put("/api/admin/controls", headers=self.ah, json={"reason": "Incident drill", **body})

    def test_only_the_admin_changes_switches_and_unknown_names_are_rejected(self):
        for user in ("aarav", "officer.mumbai"):  # neither customers nor bank officers
            other, h = _client(user)
            self.assertEqual(other.put("/api/admin/controls", headers=h, json={"reason": "nope nope"}).status_code, 403)
        self.assertEqual(self.set(disabled_tools=["rm_rf"]).status_code, 400)
        self.assertEqual(self.set(disabled_channels=["CUSTOMER"]).status_code, 200)
        audit = [e for e in dev_ui.db.get_audit_events(limit=20) if e["event_type"] == "HARNESS_CONTROL_CHANGED"]
        self.assertTrue(audit and audit[0]["details"]["disabled_channels"] == ["CUSTOMER"])

    def test_paused_tool_is_denied_by_the_gate(self):
        self.assertEqual(self.set(disabled_tools=["freeze_card"]).status_code, 200)
        result = asyncio.run(SecureToolGateHook({"session_id": "S-KS", "customer_id": "CUST-1001"}).run(
            None, types.ToolCall(name="freeze_card", args={"card_id": "CARD-DEBIT-5521", "reason": "lost"})))
        self.assertFalse(result.allow)
        self.assertIn("TOOL_PAUSED", result.message)

    def test_paused_channels_answer_without_the_model_but_fraud_script_still_runs(self):
        self.assertEqual(self.set(disabled_channels=["CUSTOMER", "VISITOR"]).status_code, 200)
        customer, ch = _client("aarav")
        session_id = customer.post("/api/sessions", headers=ch, json={"title": "Paused"}).json()["id"]
        with customer.websocket_connect(f"/ws/chat?session_id={session_id}") as ws:
            ws.receive_json()
            text, done = _turn(ws, "Show my accounts")
            self.assertIn("paused", text)
            self.assertEqual(done["stop_reason"], "PAUSED")
            text, done = _turn(ws, "I got scammed, someone took my OTP and money is gone")
            self.assertIn("1930", text)
        with TestClient(dev_ui.app).websocket_connect("/ws/chat") as ws:
            ws.receive_json()
            text, _ = _turn(ws, "What savings accounts do you have?")
            self.assertIn("paused", text)


if __name__ == "__main__":
    unittest.main()
