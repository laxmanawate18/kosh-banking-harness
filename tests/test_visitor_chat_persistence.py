"""A visitor's chat and Mitra's memory survive a reconnect (24 h); weak or stale ids never reopen a chat."""
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'visitor-persist.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend.conversations import load_session  # noqa: E402
from backend.chat_runtime import restore_sales_context  # noqa: E402
from tests.test_visitor_chat import FakeVisitorAgent  # noqa: E402


def turn(ws, prompt):
    ws.send_json({"type": "prompt", "prompt": prompt})
    while (msg := ws.receive_json())["type"] not in ("turn_complete", "error"):
        pass
    return msg


@patch("dev_ui.Agent", FakeVisitorAgent)
class VisitorChatPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(dev_ui.app)

    def connect(self, session_id=None):
        url = "/ws/chat?visitor=true" + (f"&session_id={session_id}" if session_id else "")
        return self.client.websocket_connect(url)

    def test_reconnect_restores_history_and_memory(self):
        with self.connect() as ws:
            ready = ws.receive_json()
            sid = ready["session_id"]
            self.assertRegex(sid, r"^GUEST-[A-Za-z0-9_-]{32}$")
            turn(ws, "Help me compare your savings accounts")
        with self.connect(sid) as ws:
            ready = ws.receive_json()
        self.assertEqual(ready["session_id"], sid)
        self.assertEqual([m["role"] for m in ready["history"]][:2], ["user", "assistant"])
        memory = load_session(sid)["traces"][0]
        self.assertEqual(memory["type"], "visitor_memory")
        self.assertNotIn("state", memory)  # encrypted at rest
        restored = restore_sales_context(load_session(sid))
        self.assertEqual(restored.goal, "savings")
        self.assertIn("PROD-SAV-PREMIER", restored.shown_companions)  # the one companion offer is remembered

    def test_weak_or_unknown_ids_start_a_new_chat(self):
        for weak in ("GUEST-1234abcd", "visitor-ws-test", "GUEST-" + "A" * 32):
            with self.connect(weak) as ws:
                ready = ws.receive_json()
            self.assertNotEqual(ready["session_id"], weak)
            self.assertEqual(ready["history"], [])

    def test_stale_or_signed_in_chats_are_not_reopened(self):
        with self.connect() as ws:
            sid = ws.receive_json()["session_id"]
            turn(ws, "Tell me about fixed deposits")
        session = load_session(sid)
        with patch("time.time", return_value=time.time() + 25 * 3600):
            with self.connect(sid) as ws:
                self.assertNotEqual(ws.receive_json()["session_id"], sid)
        from persistence import ConversationRecord
        with dev_ui.db.runtime.sessions.begin() as db_session:  # what the sign-in handoff (transfer_chat) records
            db_session.get(ConversationRecord, sid).user_id = "USR-CUSTOMER-001"
        del session
        with self.connect(sid) as ws:
            self.assertNotEqual(ws.receive_json()["session_id"], sid)


if __name__ == "__main__":
    unittest.main()
