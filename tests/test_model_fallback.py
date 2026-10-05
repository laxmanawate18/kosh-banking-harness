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
