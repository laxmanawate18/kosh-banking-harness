"""Applicants track status with reference + mobile; customers cannot act on other people's leads."""
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'tracking.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from product_service import SalesSessionContext, build_public_sales_tools  # noqa: E402


class ApplicationTrackingTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.client = TestClient(dev_ui.app)
        self.phone = f"+9197{uuid.uuid4().int % 100000000:08d}"
        applied = self.client.post("/api/products/apply", json={
            "product_id": "PROD-SAV-PREMIER", "full_name": "Track Tester", "phone_number": self.phone, "email": "track@example.com"})
        self.assertEqual(applied.status_code, 200, applied.text)
        self.ref = applied.json()["application_ref"]

    def status(self, ref, mobile):
        return self.client.post("/api/applications/status", json={"reference": ref, "mobile": mobile})

    def officer(self):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("officer.mumbai")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        return client, {"X-CSRF-Token": csrf}

    def lead_id(self):
        return next(l["id"] for l in dev_ui.db.list_leads() if (l.get("preferences") or {}).get("app_ref") == self.ref)

    def test_reference_and_mobile_show_status(self):
        res = self.status(self.ref.lower(), self.phone[3:])  # case and +91 prefix are forgiven
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["status"], "UNDER_REVIEW")
        self.assertEqual(body["email"], "tr•••@example.com")
        self.assertNotIn("phone_number", body)

    def test_wrong_mobile_and_unknown_reference_look_identical(self):
        wrong_mobile = self.status(self.ref, "+919000000001")
        unknown_ref = self.status("SAV-APP-ZZZZZZ", self.phone)
        self.assertEqual(wrong_mobile.status_code, 404)
        self.assertEqual(wrong_mobile.json(), unknown_ref.json())

    def test_status_follows_officer_approval_and_rejection(self):
        client, headers = self.officer()
        with patch("backend.session_routes._auth_server", return_value=True):
            self.assertEqual(client.post(f"/api/officer/leads/{self.lead_id()}/approve", headers=headers, json={}).status_code, 200)
        approved = self.status(self.ref, self.phone).json()
        self.assertEqual(approved["status"], "APPROVED")
        self.assertIn("tr•••@example.com", approved["next_step"])
        client.post(f"/api/officer/leads/{self.lead_id()}/status", headers=headers, json={"status": "REJECTED"})
        self.assertEqual(self.status(self.ref, self.phone).json()["status"], "NOT_APPROVED")

    def test_mitra_can_check_status(self):
        tools = {t.__name__: t for t in build_public_sales_tools(lambda: SalesSessionContext())}
        self.assertTrue(tools["check_application_status"](self.ref, self.phone)["found"])
        self.assertFalse(tools["check_application_status"](self.ref, "+919000000001")["found"])

    def test_customer_cannot_change_someone_elses_lead(self):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        res = client.post(f"/api/leads/{self.lead_id()}/action", headers={"X-CSRF-Token": csrf}, json={"action": "DECLINE"})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.status(self.ref, self.phone).json()["status"], "UNDER_REVIEW")


if __name__ == "__main__":
    unittest.main()
