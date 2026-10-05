"""On Cloud Run a missing signing key stops startup instead of silently using a known demo key."""
import os
import unittest
from unittest.mock import patch

from backend import settings


class ProductionSecretTests(unittest.TestCase):
    def test_missing_key_fails_in_production_and_defaults_locally(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SENTINEL_AUDIT_HMAC_KEY", None)
            with patch.object(settings, "PRODUCTION", True), self.assertRaises(RuntimeError):
                settings.required_secret("SENTINEL_AUDIT_HMAC_KEY", "demo")
            with patch.object(settings, "PRODUCTION", False):
                self.assertEqual(settings.required_secret("SENTINEL_AUDIT_HMAC_KEY", "demo"), "demo")
            os.environ["SENTINEL_AUDIT_HMAC_KEY"] = "real-key"
            with patch.object(settings, "PRODUCTION", True):
                self.assertEqual(settings.required_secret("SENTINEL_AUDIT_HMAC_KEY", "demo"), "real-key")


if __name__ == "__main__":
    unittest.main()
