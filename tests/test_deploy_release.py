"""The release script keeps plain settings, turns every password or key into a secret reference, and drops DEMO_OTP."""
import unittest

from scripts.deploy_release import APP, AUTH, split_env

APP_ENV = [{"name": "SENTINEL_DATABASE_URL", "value": "postgresql://u:p@/db"}, {"name": "OAUTH_WEB_CLIENT_SECRET", "value": "w"},
           {"name": "SMTP_PASSWORD", "value": "s"}, {"name": "SMTP_USER", "value": "ops@example.com"},
           {"name": "DEMO_OTP", "value": "246810"}, {"name": "AUTH_MODE", "value": "oidc"}]
AUTH_ENV = [{"name": "AUTH_TRUSTED_ORIGINS", "value": "https://a,https://b"}, {"name": "BETTER_AUTH_SECRET", "value": "x"},
            {"name": "SENTINEL_WEB_CLIENT_SECRET", "value": "w"}]


class DeployReleaseTests(unittest.TestCase):
    def test_app_secrets_become_references_and_demo_otp_goes(self):
        plain, refs = split_env(APP_ENV, APP)
        self.assertEqual(plain, {"SMTP_USER": "ops@example.com", "AUTH_MODE": "oidc"})
        self.assertEqual(refs["SENTINEL_DATABASE_URL"], "kosh-banking-database-url")
        self.assertEqual(refs["SMTP_PASSWORD"], "kosh-smtp-password")
        for key in ("SENTINEL_DEMO_SECRET", "SENTINEL_AUDIT_HMAC_KEY", "SENTINEL_DOCUMENT_KEY"):
            self.assertIn(key, refs)
        self.assertNotIn("password", " ".join(plain.values()))

    def test_auth_keeps_commas_and_shares_the_client_secret(self):
        plain, refs = split_env(AUTH_ENV, AUTH)
        self.assertEqual(plain, {"AUTH_TRUSTED_ORIGINS": "https://a,https://b"})
        self.assertEqual(refs["SENTINEL_WEB_CLIENT_SECRET"], "kosh-oauth-web-client-secret")  # same secret as the app's
        self.assertNotIn("SENTINEL_DEMO_SECRET", refs)


if __name__ == "__main__":
    unittest.main()
