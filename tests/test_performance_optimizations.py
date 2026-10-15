"""Unit tests for performance optimizations:
1. Resilient Dual-Mode Cache Service (In-memory + Redis fallback)
2. Pre-Turn Ontology Classification Cache
3. Admin Copilot Audit Result Cache
4. Officer Copilot SSE Streaming & Backward-Compatible JSON
"""

import asyncio
import hashlib
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from google.antigravity import types

import dev_ui
from backend.cache_service import CacheService, InMemoryCache, cache
from backend import ontology


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
            yield types.Text(step_index=0, text="Request analysis: approved for production use.")
        return SimpleNamespace(chunks=chunks())


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


class CacheServiceTests(unittest.TestCase):
    def test_in_memory_cache_crud_and_ttl(self):
        c = InMemoryCache(maxsize=10)
        c.set("k1", "v1", ttl_seconds=10)
        self.assertEqual(c.get("k1"), "v1")

        # Test delete
        c.delete("k1")
        self.assertIsNone(c.get("k1"))

        # Test prefix clear
        c.set("prefix:a", "1", ttl_seconds=10)
        c.set("prefix:b", "2", ttl_seconds=10)
        c.set("other:c", "3", ttl_seconds=10)
        c.clear("prefix:")
        self.assertIsNone(c.get("prefix:a"))
        self.assertIsNone(c.get("prefix:b"))
        self.assertEqual(c.get("other:c"), "3")

    def test_async_cache_operations(self):
        async def run():
            svc = CacheService()
            await svc.aset("async_key", {"status": "ok"}, ttl_seconds=60)
            res = await svc.aget("async_key")
            self.assertEqual(res, {"status": "ok"})

            await svc.adelete("async_key")
            self.assertIsNone(await svc.aget("async_key"))
        asyncio.run(run())


class PreTurnClassificationCacheTests(unittest.TestCase):
    def setUp(self):
        cache.clear("classify:")

    def test_classification_caches_and_returns_fast(self):
        async def run():
            text = "my debit card was lost in mumbai"
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
            cache.set(f"classify:customer:{digest}", "proc.card_lifecycle", ttl_seconds=3600)
            res = await ontology.classify(text, "customer")
            self.assertEqual(res, "proc.card_lifecycle")
        asyncio.run(run())


class AdminAuditCacheTests(unittest.TestCase):
    def setUp(self):
        self.admin, self.ah = login("admin.kosh")
        cache.clear("admin_copilot:")

    def test_admin_copilot_second_call_hits_cache(self):
        pid = "proc.payment_authorisation"
        with patch.object(dev_ui, "Agent", FakeCopilot):
            # First call: computes
            res1 = self.admin.post(
                f"/api/admin/ontology/{pid}/copilot",
                headers=self.ah,
                json={"quick_action": "compliance", "message": ""},
            )
            self.assertEqual(res1.status_code, 200)
            data1 = res1.json()
            self.assertIn("reply", data1)

            # Second call: should return fast with cached=True
            res2 = self.admin.post(
                f"/api/admin/ontology/{pid}/copilot",
                headers=self.ah,
                json={"quick_action": "compliance", "message": ""},
            )
            self.assertEqual(res2.status_code, 200)
            data2 = res2.json()
            self.assertTrue(data2.get("cached"), "Expected cached flag to be True on second call")
            self.assertEqual(data1["reply"], data2["reply"])


class OfficerCopilotStreamingTests(unittest.TestCase):
    def setUp(self):
        self.officer, self.oh = login("officer.mumbai")

    def test_officer_copilot_non_streaming_json_backward_compatibility(self):
        with patch.object(dev_ui, "Agent", FakeCopilot):
            res = self.officer.post(
                "/api/officer/copilot",
                headers=self.oh,
                json={"message": "Summarise recent requests", "stream": False},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertIn("reply", data)
            self.assertIn("tools", data)

    def test_officer_copilot_sse_streaming_returns_event_stream(self):
        with patch.object(dev_ui, "Agent", FakeCopilot):
            res = self.officer.post(
                "/api/officer/copilot",
                headers=self.oh,
                json={"message": "Summarise recent requests", "stream": True},
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/event-stream", res.headers.get("content-type", ""))
            self.assertIn("data:", res.text)
            self.assertIn("[DONE]", res.text)


if __name__ == "__main__":
    unittest.main()
