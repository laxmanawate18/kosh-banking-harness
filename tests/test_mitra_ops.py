"""Mitra operations: PII masking at rest, feedback on owned chats, quality dashboard, prompt registry, retention."""
import os
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'ops.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import mitra_ops  # noqa: E402
from persistence import ConversationRecord, utc_dt  # noqa: E402


def chat(chat_id, user_id=None, text="Your Neo card is lifetime free."):
    dev_ui.db.save_conversation({"id": chat_id, "user_id": user_id, "created_at": time.time(), "traces": [{"type": "visitor_memory", "state": {}}],
                                 "messages": [{"role": "user", "text": "My PAN is ABCDE1234F and mobile 9876543210"},
                                              {"role": "assistant", "text": text}]})


class MitraOpsTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.client = TestClient(dev_ui.app)

    def admin(self):  # Mitra's quality and approvals live in the Admin Panel, not the bank officer's console
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("admin.kosh")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        return client, {"X-CSRF-Token": csrf}

    def test_identifiers_are_masked_when_a_chat_is_stored(self):
        masked = mitra_ops.mask_pii("PAN ABCDE1234F, Aadhaar 1234 5678 9012, card 4111 1111 1111 1111, mobile 9876543210")
        for raw in ("ABCDE1234F", "1234 5678 9012", "4111 1111 1111 1111", "9876543210"):
            self.assertNotIn(raw, masked)
        self.assertIn("1234F", masked)
        self.assertEqual(mitra_ops.mask_pii("Call 1800 000 5674 about ₹98,00,000"), "Call 1800 000 5674 about ₹98,00,000")
        chat("GUEST-mask-test")
        stored = dev_ui.db.get_conversation("GUEST-mask-test")["messages"][0]["text"]
        self.assertNotIn("ABCDE1234F", stored)
        self.assertNotIn("9876543210", stored)

    def test_feedback_only_on_own_chat_and_on_a_mitra_reply(self):
        chat("GUEST-feedback-test")
        ok = self.client.post("/api/chat/feedback", json={"session_id": "GUEST-feedback-test", "message_index": 1, "rating": -1,
                                                          "comment": "Wrong, my number is 9876543210"})
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(self.client.post("/api/chat/feedback", json={"session_id": "GUEST-feedback-test", "message_index": 0, "rating": 1}).status_code, 422)
        chat("owned-by-aarav", user_id="aarav")
        self.assertEqual(self.client.post("/api/chat/feedback", json={"session_id": "owned-by-aarav", "message_index": 1, "rating": 1}).status_code, 404)
        admin, _ = self.admin()
        quality = admin.get("/api/admin/quality").json()
        negative = quality["feedback"]["recent_negative"][0]
        self.assertNotIn("9876543210", negative["comment"])
        self.assertIn("lifetime free", negative["reply"])

    def test_turns_feed_the_dashboard(self):
        mitra_ops.record_turn(dev_ui.db, session_id="S1", channel="VISITOR", language="en", outcome="FALLBACK",
                              reason="unverified competitor comparison", latency_ms=4000)
        mitra_ops.record_turn(dev_ui.db, session_id="S1", channel="VISITOR", language="hi", outcome="ANSWERED", latency_ms=2000)
        admin, _ = self.admin()
        q = admin.get("/api/admin/quality").json()
        self.assertGreaterEqual(q["turns"], 2)
        self.assertIn("unverified competitor comparison", q["fallback_reasons"])
        self.assertGreater(q["latency_ms"]["p90"], 0)
        self.assertEqual(self.client.get("/api/admin/quality").status_code, 401)

    def test_prompt_version_is_registered_and_can_be_approved_and_evaluated(self):
        import subprocess, sys
        other = subprocess.run([sys.executable, "-c", "from backend.mitra_ops import prompt_version; print(prompt_version())"],
                               capture_output=True, text=True, env={**os.environ, "PYTHONHASHSEED": "random"}).stdout.split()[-1]
        self.assertEqual(other, mitra_ops.prompt_version())  # stable across processes (set order must not leak in)
        registered = mitra_ops.register_prompt_version(dev_ui.db, "gemini-3.8-flash")
        self.assertEqual(registered["version"], mitra_ops.prompt_version())
        self.assertEqual(mitra_ops.register_prompt_version(dev_ui.db, "gemini-3.8-flash"), registered)  # idempotent
        mitra_ops.update_registry(dev_ui.db, registered["id"], evaluation={"at": "2026-09-29", "passed": 100, "total": 103, "pass_rate": 97.1,
            "by_category": {"care_fraud": "12/12", "jailbreak": "27/27", "prompt_probe": "14/14", "customer_security": "8/8",
                            "officer_copilot": "24/24", "data_minimisation": "10/10", "process_routing": "10/10"}})
        admin, h = self.admin()
        self.assertEqual(admin.post(f"/api/admin/ai-registry/{registered['id']}/approve", headers=h, json={"note": "Eval 100/107 reviewed"}).status_code, 200)
        row = next(r for r in admin.get("/api/admin/quality").json()["registry"] if r["id"] == registered["id"])
        self.assertTrue(row["active"])
        self.assertEqual(row["approval"]["note"], "Eval 100/107 reviewed")
        self.assertEqual(row["evaluations"][-1]["passed"], 100)

    def test_retention_purges_old_chats_and_stale_visitor_memory(self):
        chat("GUEST-old-chat")
        chat("GUEST-yesterday")
        with dev_ui.db.runtime.sessions.begin() as s:
            s.get(ConversationRecord, "GUEST-old-chat").updated_at = utc_dt() - timedelta(days=mitra_ops.CHAT_RETENTION_DAYS + 1)
            s.get(ConversationRecord, "GUEST-yesterday").updated_at = utc_dt() - timedelta(hours=30)
        purged = mitra_ops.purge_expired(dev_ui.db)
        self.assertGreaterEqual(purged["chats"], 1)
        self.assertIsNone(dev_ui.db.get_conversation("GUEST-old-chat"))
        kept = dev_ui.db.get_conversation("GUEST-yesterday")
        self.assertTrue(kept and not any(t.get("type") == "visitor_memory" for t in kept.get("traces", [])))


if __name__ == "__main__":
    unittest.main()
