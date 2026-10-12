"""Tests for Google Cloud Sensitive Data Protection (Cloud DLP) integration.

Validates Indian banking PII discovery, infoType matching, non-overlapping span resolution,
de-identification masking rules, and admin diagnostic endpoints.
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui
from backend import dlp_service, mitra_ops


class CloudDLPTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.client = TestClient(dev_ui.app)

    def admin(self):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("admin.kosh")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        return client, {"X-CSRF-Token": csrf}

    def test_pan_discovery_and_masking(self):
        text = "Customer PAN is ABCDE1234F for verification"
        findings = dlp_service.inspect_text_local(text)
        self.assertTrue(any(f["info_type"] == "INDIA_PAN_NUMBER" and f["quote"] == "ABCDE1234F" for f in findings))

        masked, _ = dlp_service.deidentify_text(text)
        self.assertNotIn("ABCDE1234F", masked)
        self.assertIn("•••••1234F", masked)

    def test_aadhaar_discovery_and_masking(self):
        text = "Aadhaar number: 1234 5678 9012"
        findings = dlp_service.inspect_text_local(text)
        self.assertTrue(any(f["info_type"] == "INDIA_AADHAAR_NUMBER" for f in findings))

        masked, _ = dlp_service.deidentify_text(text)
        self.assertNotIn("1234 5678 9012", masked)
        self.assertIn("•••• •••• 9012", masked)

    def test_credit_card_discovery_and_masking(self):
        text = "Card payment 4111 1111 1111 1111 was authorized"
        findings = dlp_service.inspect_text_local(text)
        self.assertTrue(any(f["info_type"] == "CREDIT_CARD_NUMBER" for f in findings))

        masked, _ = dlp_service.deidentify_text(text)
        self.assertNotIn("4111 1111 1111 1111", masked)
        self.assertIn("•••• 1111", masked)

    def test_indian_banking_rails_ifsc_and_upi(self):
        text = "Pay via UPI aarav@okhdfcbank to IFSC HDFC0001234"
        findings = dlp_service.inspect_text_local(text)
        types = {f["info_type"] for f in findings}
        self.assertIn("INDIAN_UPI_VPA", types)
        self.assertIn("INDIAN_IFSC_CODE", types)

        masked, _ = dlp_service.deidentify_text(text)
        self.assertNotIn("aarav@okhdfcbank", masked)
        self.assertIn("aa•••@okhdfcbank", masked)
        self.assertNotIn("HDFC0001234", masked)
        self.assertIn("•••••••1234", masked)

    def test_phone_number_and_toll_free_separation(self):
        private_mobile = "Contact me at 9876543210 tomorrow"
        toll_free = "Call bank helpline 1800 000 5674 about ₹98,00,000"

        findings_private = dlp_service.inspect_text_local(private_mobile)
        self.assertTrue(any(f["info_type"] == "PHONE_NUMBER" and f["quote"] == "9876543210" for f in findings_private))

        findings_toll = dlp_service.inspect_text_local(toll_free)
        self.assertFalse(any(f["info_type"] == "PHONE_NUMBER" for f in findings_toll))

        masked_private, _ = dlp_service.deidentify_text(private_mobile)
        self.assertNotIn("9876543210", masked_private)
        self.assertIn("••••••3210", masked_private)

        masked_toll, _ = dlp_service.deidentify_text(toll_free)
        self.assertEqual(masked_toll, toll_free)

    def test_non_overlapping_spans(self):
        # A 10-digit mobile number must not be duplicated or corrupted by bank account number matching
        text = "Primary mobile 9820515974"
        findings = dlp_service.inspect_text_local(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["info_type"], "PHONE_NUMBER")

    def test_dlp_status_metadata(self):
        stat = dlp_service.dlp_status()
        self.assertIn(stat["status"], {"ACTIVE", "LOCAL_FALLBACK"})
        self.assertIn("INDIA_PAN_INDIVIDUAL", stat["supported_infotypes"])
        self.assertIn("INDIAN_IFSC_CODE", stat["custom_infotypes"])
        self.assertIn("project_id", stat)

    def test_mitra_ops_uses_dlp_engine(self):
        text = "PAN ABCDE1234F, Aadhaar 1234 5678 9012, card 4111 1111 1111 1111, mobile 9876543210"
        masked = mitra_ops.mask_pii(text)
        for raw in ("ABCDE1234F", "1234 5678 9012", "4111 1111 1111 1111", "9876543210"):
            self.assertNotIn(raw, masked)
        self.assertIn("1234F", masked)

    def test_admin_dlp_endpoints(self):
        admin, _ = self.admin()
        status_res = admin.get("/api/admin/dlp/status")
        self.assertEqual(status_res.status_code, 200)
        status_json = status_res.json()
        self.assertIn("supported_infotypes", status_json)

        inspect_res = admin.post(
            "/api/admin/dlp/inspect",
            json={"text": "Review customer PAN ABCDE1234F and mobile 9876543210"}
        )
        self.assertEqual(inspect_res.status_code, 200)
        inspect_json = inspect_res.json()
        self.assertEqual(inspect_json["total_findings"], 2)
        self.assertNotIn("ABCDE1234F", inspect_json["deidentified"])
        self.assertIn("•••••1234F", inspect_json["deidentified"])

    def test_live_google_cloud_dlp_api_call(self):
        # Validates direct live connectivity to Google Cloud DLP API on project-5fc303c2-29cb-4e5d-9f9
        with patch.dict("os.environ", {"ENABLE_CLOUD_DLP": "true"}):
            findings = dlp_service.inspect_text("Customer email aarav@example.com, PAN ABCPE1234F, IFSC HDFC0001234")
            self.assertTrue(len(findings) >= 2)
            # Live GCP API executed
            self.assertTrue(any(f["engine"] == "google_cloud_dlp" for f in findings))
