"""Browsers on the flagged run.app address are sent to the public domain; APIs and the gateway are not redirected."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui


class CanonicalHostTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch.object(dev_ui, "_CANONICAL", dev_ui.urllib.parse.urlsplit("https://kosh.example.com"))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = TestClient(dev_ui.app, base_url="https://sentinel-banking-123.us-central1.run.app", follow_redirects=False)

    def test_pages_on_run_app_redirect_to_the_domain(self):
        r = self.client.get("/products?x=1")
        self.assertEqual((r.status_code, r.headers["location"]), (301, "https://kosh.example.com/products?x=1"))

    def test_api_gateway_and_the_domain_itself_are_untouched(self):
        self.assertEqual(self.client.get("/api/products").status_code, 200)
        self.assertNotEqual(self.client.get("/.well-known/oauth-protected-resource/mcp").status_code, 301)
        on_domain = TestClient(dev_ui.app, base_url="https://kosh.example.com", follow_redirects=False)
        self.assertNotEqual(on_domain.get("/").status_code, 301)


if __name__ == "__main__":
    unittest.main()
