"""Abuse limits: chat messages per minute per user or client, and tool calls per turn."""
import asyncio
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend import agent_config, chat_runtime
from backend.agent_config import SecureToolGateHook


class ChatLimitTests(unittest.TestCase):
    def test_visitor_is_slowed_down_after_the_per_minute_limit(self):
        with patch.object(chat_runtime, "CHAT_MESSAGES_PER_MINUTE", 2), \
                TestClient(dev_ui.app).websocket_connect("/ws/chat", headers={"x-forwarded-for": "203.0.113.9"}) as ws:
            ws.receive_json()
            for _ in range(2):
                chat_runtime._RECENT_MESSAGES["ip:203.0.113.9"].append(time.monotonic())
            ws.send_json({"type": "prompt", "prompt": "Tell me about savings accounts"})
            event = ws.receive_json()
        self.assertEqual(event["type"], "error")
        self.assertIn("quickly", event["message"])

    def test_tool_calls_stop_after_the_per_turn_cap(self):
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
