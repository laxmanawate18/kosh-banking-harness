"""Demo OTP mode: payment step-up sends the customer's own number and the demo code to the auth server; no Firebase."""
import json
import unittest
from unittest.mock import MagicMock, patch

import dev_ui


class DemoStepUpTests(unittest.TestCase):
    def test_step_up_sends_number_and_code_instead_of_a_firebase_token(self):
        oauth = dev_ui.oauth_service
        sent = {}

        def fake_urlopen(request, timeout=10):
            sent.update(json.loads(request.data))
            response = MagicMock(status=200)
            response.__enter__.return_value = response
            return response
        grant = MagicMock(provider_session_id="PSID", id="G1")
        with patch.object(oauth.runtime, "sessions") as sessions, patch("oauth_service.urllib.request.urlopen", fake_urlopen), \
                patch.object(oauth, "_refresh_grant", return_value=(None, "L3")), patch.object(oauth, "_refuse_while_locked"), \
                patch.object(oauth, "_step_up_succeeded"):  # this test is about the request sent; the lock has its own tests
            sessions.return_value.__enter__.return_value.scalar.return_value = grant
            try:
                oauth.step_up_with_firebase("S1", None, code="246810", phone="+919876543210")
            except Exception:
                pass  # what happens after the auth server call is covered elsewhere
        self.assertEqual(sent, {"phoneNumber": "+919876543210", "code": "246810", "sessionId": "PSID"})

    def test_public_config_flags_demo_mode(self):
        from fastapi.testclient import TestClient
        with patch.dict("os.environ", {"AUTH_DEMO_OTP": "246810"}):
            config = TestClient(dev_ui.app).get("/api/auth/public-config").json()
        self.assertTrue(config.get("demo_otp"))


if __name__ == "__main__":
    unittest.main()
