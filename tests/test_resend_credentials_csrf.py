"""Resetting a customer's password needs the CSRF token, and only an officer may do it."""
import os
import tempfile
import unittest
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'resend.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402

import dev_ui  # noqa: E402

URL = "/api/officer/customers/CUST-1001/resend-credentials"


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


class ResendCredentialsCsrfTests(unittest.TestCase):
    def test_a_forged_request_without_the_token_is_refused_before_anything_happens(self):
        officer, _ = login("officer.mumbai")
        self.assertEqual(officer.post(URL).status_code, 403)

    def test_a_customer_or_admin_with_a_token_is_still_refused(self):
        for user in ("aarav", "admin.kosh"):
            other, headers = login(user)
            self.assertEqual(other.post(URL, headers=headers).status_code, 403, user)

    def test_an_officer_with_the_token_gets_past_the_gate(self):
        officer, headers = login("officer.mumbai")
        self.assertNotIn(officer.post(URL, headers=headers).status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
