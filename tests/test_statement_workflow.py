"""Submitting the statement workflow completes it with a download; it creates no service request and must not crash."""
import os
import tempfile
import unittest
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'statement.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402

import dev_ui  # noqa: E402


class StatementWorkflowTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        self.client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.h = {"X-CSRF-Token": csrf}
        self.client.post("/api/consent", headers=self.h, json={"accepted": True})
        dev_ui.auth_service.elevate_session(cookie, "L3")

    def test_a_statement_request_completes_with_a_download(self):
        w = self.client.post("/api/ai/workflows", headers=self.h, json={"skill_id": "statement"}).json()
        fields = {"account_id": "ACC-SAL-001", "start": "2026-09-01", "end": "2026-09-30"}
        w = self.client.patch(f"/api/ai/workflows/{w['id']}", headers=self.h, json={"revision": w["revision"], "fields": fields}).json()
        reviewed = self.client.post(f"/api/ai/workflows/{w['id']}/review", headers=self.h, json={"revision": w["revision"], "fields": {}})
        self.assertEqual(reviewed.status_code, 200, reviewed.text)
        w = reviewed.json()
        done = self.client.post(f"/api/ai/workflows/{w['id']}/submit", headers=self.h,
                                json={"revision": w["revision"], "review_digest": w["review_digest"], "confirmed": True})
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()["status"], "COMPLETED")


if __name__ == "__main__":
    unittest.main()
