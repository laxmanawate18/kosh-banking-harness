"""Customers see and withdraw the assistant apps they allowed; Kosh asks the authorization server with its service token."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui
import portal


class ConnectedAppsTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.client = TestClient(dev_ui.app)
        _, cookie, self.csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)

    def test_list_and_withdraw(self):
        calls = []

        def fake(method, path, payload=None):
            calls.append((method, path, payload))
            if method == "GET":
                return {"apps": [{"client_id": "kosh-agent-claude", "name": "Claude", "scopes": ["banking.read"], "connected_at": "2026-10-05"}]}
            return {"revoked": True}
        with patch.object(portal, "_auth_internal", side_effect=fake):
            apps = self.client.get("/api/portal/security/apps").json()["apps"]
            done = self.client.delete("/api/portal/security/apps/kosh-agent-claude", headers={"X-CSRF-Token": self.csrf}).json()
        self.assertEqual(apps[0]["name"], "Claude")
        self.assertTrue(done["revoked"])
        self.assertIn("sentinelUserId=USR-CUSTOMER-001", calls[0][1])  # only the signed-in customer's own apps
        self.assertEqual(calls[1][2], {"sentinelUserId": "USR-CUSTOMER-001", "clientId": "kosh-agent-claude"})
        audit = [e for e in dev_ui.db.get_audit_events(limit=10) if e["event_type"] == "AGENT_ACCESS_REVOKED"]
        self.assertTrue(audit)

    def test_withdrawing_needs_csrf(self):
        self.assertEqual(self.client.delete("/api/portal/security/apps/kosh-agent-claude").status_code, 403)


if __name__ == "__main__":
    unittest.main()
