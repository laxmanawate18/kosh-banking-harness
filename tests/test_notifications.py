"""SMS / WhatsApp notifications: outbox for every alert, opt-in WhatsApp, real providers only when configured."""
import json
import os
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'notify.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import notifications  # noqa: E402


class NotificationTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
        self.client = TestClient(dev_ui.app)
        _, self.cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
        self.client.cookies.set(dev_ui.COOKIE_NAME, self.cookie)
        self.h = {"X-CSRF-Token": csrf}
        self.client.post("/api/consent", headers=self.h, json={"accepted": True})

    def outbox(self, event):
        return [n for n in notifications.recent(dev_ui.db, 500) if n["event"] == event]

    def test_application_received_sms_has_reference_and_tracking_link(self):
        phone = f"+9197{uuid.uuid4().int % 100000000:08d}"
        ref = self.client.post("/api/products/apply", json={"product_id": "PROD-SAV-PREMIER", "full_name": "Notify Me",
                                                            "phone_number": phone, "email": "n@example.com"}).json()["application_ref"]
        sms = next(n for n in self.outbox("application_submitted") if n["reference"] == ref)
        self.assertEqual((sms["channel"], sms["status"], sms["provider"]), ("SMS", "QUEUED_LOCAL", "local"))
        self.assertIn(f"/#/track/{ref}", sms["body"])
        self.assertTrue(sms["recipient"].endswith(phone[-4:]) and "•" in sms["recipient"])

    def test_bill_payment_sends_a_debit_alert(self):
        before = len(self.outbox("money_debited"))
        r = self.client.post("/api/portal/payments", headers=self.h, json={
            "request_key": "notify-bill-000001", "action": "PAY_BILL", "source_account_id": "ACC-SAL-001", "bill_id": "BILL-TATA-001"})
        challenge = r.json()["challenge"]
        dev_ui.auth_service.elevate_session(self.cookie, "L3")
        r = self.client.post(f"/api/challenges/{challenge['id']}/verify", headers=self.h,
                             json={"transaction_digest": challenge["transaction_digest"]})
        self.assertEqual(r.json()["status"], "EXECUTED", r.text)
        alerts = self.outbox("money_debited")
        self.assertEqual(len(alerts), before + 1)
        self.assertIn("Rs 2,430.00", alerts[0]["body"])
        self.assertIn("Tata Power", alerts[0]["body"])

    def test_whatsapp_only_after_opt_in(self):
        prefs = {"email_updates": True, "payment_alerts": True, "monthly_statement": True, "whatsapp_updates": True}
        self.assertEqual(self.client.patch("/api/portal/preferences", headers=self.h, json=prefs).status_code, 200)
        ids = notifications.notify(dev_ui.db, "kyc_verified", "+919876543210", customer_id="CUST-1001", reference="REQ-X")
        channels = {n["channel"] for n in notifications.recent(dev_ui.db, 10) if n["id"] in ids}
        self.assertEqual(channels, {"SMS", "WHATSAPP"})
        prefs["whatsapp_updates"] = False
        self.client.patch("/api/portal/preferences", headers=self.h, json=prefs)
        ids = notifications.notify(dev_ui.db, "kyc_verified", "+919876543210", customer_id="CUST-1001", reference="REQ-Y")
        self.assertEqual(len(ids), 1)

    def test_twilio_is_used_only_when_configured_and_failures_are_recorded(self):
        env = {"NOTIFY_PROVIDER": "twilio", "TWILIO_ACCOUNT_SID": "ACtest", "TWILIO_AUTH_TOKEN": "tok", "TWILIO_SMS_FROM": "+15550001111"}
        response = MagicMock(); response.read.return_value = json.dumps({"sid": "SM123"}).encode()
        response.__enter__.return_value = response
        with patch.dict(os.environ, env), patch("urllib.request.urlopen", return_value=response) as urlopen:
            [sent] = notifications.notify(dev_ui.db, "card_frozen", "+919876543210", reference="CARD-1", last4="5521")
            for _ in range(50):
                row = next(n for n in notifications.recent(dev_ui.db, 20) if n["id"] == sent)
                if row["status"] != "SENDING":
                    break
                time.sleep(0.05)
        self.assertEqual((row["provider"], row["status"]), ("twilio", "SENT"))
        request = urlopen.call_args[0][0]
        self.assertIn("/Accounts/ACtest/Messages.json", request.full_url)
        self.assertIn(b"To=%2B919876543210", request.data)
        with patch.dict(os.environ, env), patch("urllib.request.urlopen", side_effect=OSError("network down")):
            [failed] = notifications.notify(dev_ui.db, "card_frozen", "+919876543210", reference="CARD-2", last4="5521")
            for _ in range(50):
                row = next(n for n in notifications.recent(dev_ui.db, 20) if n["id"] == failed)
                if row["status"] != "SENDING":
                    break
                time.sleep(0.05)
        self.assertEqual(row["status"], "FAILED")
        self.assertIn("network down", row["error"])

    def test_officer_sees_notification_outbox(self):
        notifications.notify(dev_ui.db, "kyc_verified", "+919876543210", customer_id="CUST-1001", reference="REQ-Z")
        officer = TestClient(dev_ui.app)
        _, cookie, _ = dev_ui.auth_service.create_direct_session("officer.mumbai")
        officer.cookies.set(dev_ui.COOKIE_NAME, cookie)
        items = officer.get("/api/officer/notifications").json()["notifications"]
        self.assertTrue(any(n["reference"] == "REQ-Z" for n in items))
        self.assertEqual(self.client.get("/api/officer/notifications").status_code, 403)


if __name__ == "__main__":
    unittest.main()
