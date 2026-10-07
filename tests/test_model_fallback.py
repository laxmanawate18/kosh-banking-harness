"""Model resilience: a failed turn retries once on the backup model when nothing ran yet, and never shows raw errors."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend import chat_runtime
from persistence import MitraTurnRecord


class FlakyAgent:
    instances = []

    def __init__(self, config):
        self.model = config.model.name
        self.instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def chat(self, prompt):
        if self.model != "backup-model":
            raise RuntimeError("429 RESOURCE_EXHAUSTED private-provider-details")

        async def chunks():
            yield types.Text(step_index=0, text="Your salary account is active.")
        usage = types.UsageMetadata(prompt_token_count=100, candidates_token_count=20, thoughts_token_count=5)
        return SimpleNamespace(chunks=chunks(), usage_metadata=usage)


class ModelFallbackTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        FlakyAgent.instances = []
        for p in (patch.object(dev_ui, "Agent", FlakyAgent),):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.h = {"X-CSRF-Token": csrf}

    def turn(self, prompt):
        session_id = self.client.post("/api/sessions", headers=self.h, json={"title": "Fallback"}).json()["id"]
        with self.client.websocket_connect(f"/ws/chat?session_id={session_id}") as ws:
            ws.receive_json()
            ws.send_json({"type": "prompt", "prompt": prompt})
            events = []
            while not events or events[-1]["type"] not in {"turn_complete", "error"}:
                events.append(ws.receive_json())
        return events

    def test_switches_to_backup_model_when_main_model_fails(self):
        with patch.object(chat_runtime, "FALLBACK_MODEL", "backup-model"):
            events = self.turn("Is my salary account active?")
        self.assertEqual([a.model for a in FlakyAgent.instances], ["gemini-3.8-flash", "backup-model"])
        self.assertEqual(events[-1]["type"], "turn_complete")
        self.assertIn("salary account is active", "".join(e.get("text", "") for e in events))
        with dev_ui.db.runtime.sessions() as s:
            last = s.query(MitraTurnRecord).order_by(MitraTurnRecord.created_at.desc()).first()
        self.assertEqual((last.model, last.input_tokens, last.output_tokens), ("backup-model", 100, 25))

    def test_without_backup_the_customer_sees_a_safe_message(self):
        with patch.object(chat_runtime, "FALLBACK_MODEL", None):
            events = self.turn("Is my salary account active?")
        self.assertEqual(events[-1]["type"], "error")
        self.assertNotIn("private-provider-details", events[-1]["message"])


if __name__ == "__main__":
    unittest.main()


class MainModelRests(unittest.TestCase):
    """After the main model is overloaded, new turns go straight to the backup for a while, then back."""

    def setUp(self):
        from backend import mitra_ops
        self.ops = mitra_ops
        self.addCleanup(lambda: mitra_ops._primary_rest_until.__setitem__(0, float("-inf")))

    def test_overload_rests_the_main_model_other_errors_do_not(self):
        with patch("backend.settings.FALLBACK_MODEL", "gemini-2.5-flash"):
            self.ops.note_model_failure(ValueError("400 bad request"))
            self.assertIsNone(self.ops.turn_model())
            self.ops.note_model_failure(RuntimeError("model response error: 429 Too Many Requests"))
            self.assertEqual(self.ops.turn_model(), "gemini-2.5-flash")
            with patch("backend.mitra_ops.time.monotonic", return_value=10**9):
                self.assertIsNone(self.ops.turn_model())  # the rest is over: back to the main model
        with patch("backend.settings.FALLBACK_MODEL", None):
            self.assertIsNone(self.ops.turn_model())  # no backup configured: always the main model

    def test_gemini_2_gets_no_thinking_level(self):
        from backend.agent_config import _options
        self.assertIsNone(_options("gemini-2.5-flash").thinking_level)  # Vertex rejects it for 2.x
        self.assertIsNotNone(_options("gemini-3.8-flash").thinking_level)
