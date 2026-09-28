"""e-KYC / V-CIP: only a signed provider result changes KYC; the sandbox is labelled and one-shot."""
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'ekyc.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import ekyc, notifications  # noqa: E402


class EkycTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "NOT_DONE")
        self.client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        self.h = {"X-CSRF-Token": csrf}
        self.client.post("/api/consent", headers=self.h, json={"accepted": True})

    def kyc(self):
        return dev_ui.db.get_kyc_profile("CUST-1001")

    def start(self):
        r = self.client.post("/api/portal/ekyc/sessions", headers=self.h)
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def test_sandbox_pass_verifies_kyc_and_is_labelled(self):
        s = self.start()
        self.assertTrue(s["sandbox"])
        token = re.search(r"token=([^&]+)", s["url"]).group(1)
        page = self.client.get(s["url"])
        self.assertIn("SANDBOX", page.text)
        self.assertEqual(self.client.get(f"/ekyc/sandbox/{s['session_id']}?token=wrong").status_code, 404)
        done = self.client.post(f"/ekyc/sandbox/{s['session_id']}", data={"token": token, "outcome": "pass"}, follow_redirects=False)
        self.assertEqual(done.status_code, 303)
        kyc = self.kyc()
        self.assertEqual(kyc["status"], "VERIFIED")
        self.assertIn("sandbox", kyc["verification"]["method"])
        self.assertTrue(any(n["event"] == "kyc_verified" and n["reference"] == s["session_id"] for n in notifications.recent(dev_ui.db, 20)))
        # a second submission cannot change the recorded result
        dev_ui.db.update_kyc_status("CUST-1001", "NOT_DONE")
        self.client.post(f"/ekyc/sandbox/{s['session_id']}", data={"token": token, "outcome": "pass"}, follow_redirects=False)
        self.assertEqual(self.kyc()["status"], "NOT_DONE")

    def test_failed_face_match_leaves_kyc_unchanged(self):
        s = self.start()
        token = re.search(r"token=([^&]+)", s["url"]).group(1)
        self.client.post(f"/ekyc/sandbox/{s['session_id']}", data={"token": token, "outcome": "face_mismatch"}, follow_redirects=False)
        self.assertEqual(self.kyc()["status"], "NOT_DONE")
        latest = self.client.get("/api/portal/ekyc/sessions/latest").json()["session"]
        self.assertEqual(latest["status"], "NOT_VERIFIED")
        self.assertIn("agent_approved", latest["failed_checks"])

    def test_verified_customers_and_production_cannot_start_the_sandbox(self):
        with patch.dict(os.environ, {"KOSH_ENV": "production"}):
            self.assertEqual(self.client.post("/api/portal/ekyc/sessions", headers=self.h).status_code, 503)
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        self.assertEqual(self.client.post("/api/portal/ekyc/sessions", headers=self.h).status_code, 409)

    def test_vendor_result_needs_a_valid_signature(self):
        env = {"EKYC_PROVIDER": "vendor", "EKYC_WEBHOOK_SECRET": "whsec-test", "EKYC_API_URL": "https://kyc.example", "EKYC_API_KEY": "k"}
        with patch.dict(os.environ, env), patch.object(ekyc, "_vendor_session", return_value=("VND-123", "https://kyc.example/s/VND-123")):
            s = self.start()
            self.assertEqual(s["url"], "https://kyc.example/s/VND-123")
            self.assertEqual(self.client.get(f"/ekyc/sandbox/{s['session_id']}?token=x").status_code, 404)
            body = json.dumps({"reference": "VND-123", "status": "completed", "agent_id": "VKYC-OFF-7",
                               "checks": {**{c: True for c in ekyc.CHECKS}, "face_match_score": 0.91}}).encode()
            self.assertEqual(self.client.post("/api/ekyc/webhook", content=body, headers={"X-Ekyc-Signature": "bad"}).status_code, 401)
            self.assertEqual(self.kyc()["status"], "NOT_DONE")
            ok = self.client.post("/api/ekyc/webhook", content=body, headers={"X-Ekyc-Signature": ekyc.sign(body)})
            self.assertEqual(ok.json()["status"], "VERIFIED", ok.text)
        self.assertEqual(self.kyc()["verification"]["method"], "V-CIP")
        self.assertEqual(self.client.post("/api/ekyc/webhook", content=body, headers={"X-Ekyc-Signature": "x"}).status_code, 404)  # sandbox mode


if __name__ == "__main__":
    unittest.main()
