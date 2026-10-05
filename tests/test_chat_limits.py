"""Abuse limits: chat messages per minute per user or client, and tool calls per turn."""
import asyncio
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend import agent_config, chat_runtime
from backend.agent_config import SecureToolGateHook
from tests.consent_helpers import grant_consent


class ChatLimitTests(unittest.TestCase):
    def test_visitor_is_slowed_down_after_the_per_minute_limit_and_a_forged_address_does_not_help(self):
        with patch.object(chat_runtime, "CHAT_MESSAGES_PER_MINUTE", 0), \
                TestClient(dev_ui.app).websocket_connect("/ws/chat", headers={"x-forwarded-for": "203.0.113.9"}) as ws:
            ws.receive_json()
            ws.send_json({"type": "prompt", "prompt": "Tell me about savings accounts"})
            event = ws.receive_json()
        self.assertEqual(event["type"], "error")
        self.assertIn("quickly", event["message"])

    def test_the_limit_is_shared_by_every_instance(self):
        from backend.rate_limit import hit
        from banking_db import BankingDatabase
        with tempfile.TemporaryDirectory() as tmp:
            url = f"sqlite+pysqlite:///{Path(tmp) / 'shared.sqlite3'}"
            first, second = BankingDatabase(url), BankingDatabase(url)  # two instances, one database
            try:
                self.assertFalse(hit(first, "user:U1", 2))
                self.assertFalse(hit(second, "user:U1", 2))
                self.assertTrue(hit(first, "user:U1", 2))
                self.assertFalse(hit(second, "user:U2", 2))  # another caller has its own count
            finally:
                first.runtime.engine.dispose()
                second.runtime.engine.dispose()

    def test_tool_calls_stop_after_the_per_turn_cap(self):
        grant_consent(dev_ui.db)
        context = {"session_id": "S-CAP", "customer_id": "CUST-1001", "tool_calls_this_turn": 0}
        gate = SecureToolGateHook(context)
        call = types.ToolCall(name="get_customer_summary", args={})
        with patch.object(agent_config, "MAX_TOOL_CALLS_PER_TURN", 3):
            results = [asyncio.run(gate.run(None, call)) for _ in range(4)]
        self.assertEqual([r.allow for r in results], [True, True, True, False])
        self.assertIn("TURN_TOOL_LIMIT", results[-1].message)
        context["tool_calls_this_turn"] = 0  # the next turn starts a fresh count
        self.assertTrue(asyncio.run(gate.run(None, call)).allow)


if __name__ == "__main__":
    unittest.main()
