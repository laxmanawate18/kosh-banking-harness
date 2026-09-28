import time
import unittest
from fastapi.testclient import TestClient

from auth_service import COOKIE_NAME
from dev_ui import app, auth_service, db


class TestOfficerCredentialApproval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _get_officer_cookies_and_csrf(self):
        # Create an officer direct session
        context, token, csrf = auth_service.create_direct_session("officer.mumbai")
        cookies = {COOKIE_NAME: token}
        headers = {"x-csrf-token": csrf}
        return cookies, headers

    def test_visitor_application_queued_for_officer_approval(self):
        """When a visitor without relationship applies, no credentials or account are created immediately."""
        unique_phone = f"+91987{int(time.time() * 1000) % 10000000:07d}"
        applicant_email = f"applicant_{int(time.time())}@example.com"
        payload = {
            "product_id": "PROD-SAV-PREMIER",
            "full_name": "Arjun Kapoor",
            "phone_number": unique_phone,
            "email": applicant_email,
            "pan_number": "ABCDE1234F",
            "employment_type": "Salaried",
            "monthly_income": 95000.0,
            "pincode": "400001",
        }

        resp = self.client.post("/api/products/apply", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("status"), "PENDING_APPROVAL")
        self.assertTrue(data.get("application_ref", "").startswith("SAV-APP-"))
        self.assertNotIn("credentials", data)
        self.assertNotIn("profile", data)
        self.assertNotIn("account", data)
        self.assertEqual(data.get("email"), applicant_email)

    def test_officer_approves_and_credentials_emailed(self):
        """Officer reviews pending application, approves it, and system generates credentials and emails them."""
        # 1. Visitor applies
        unique_phone = f"+91988{int(time.time() * 1000) % 10000000:07d}"
        applicant_email = f"deepak_{int(time.time())}@sentinel-test.com"
        apply_payload = {
            "product_id": "PROD-SAV-PREMIER",
            "full_name": "Deepak Chopra",
            "phone_number": unique_phone,
            "email": applicant_email,
            "pan_number": "DCPRA9999K",
            "employment_type": "Self-Employed",
            "monthly_income": 150000.0,
            "pincode": "110001",
        }
        apply_resp = self.client.post("/api/products/apply", json=apply_payload)
        self.assertEqual(apply_resp.status_code, 200)
        app_ref = apply_resp.json()["application_ref"]

        # 2. Officer fetches leads
        cookies, headers = self._get_officer_cookies_and_csrf()
        leads_resp = self.client.get("/api/officer/leads", cookies=cookies)
        self.assertEqual(leads_resp.status_code, 200)
        leads = leads_resp.json().get("leads", [])
        
        target_lead = next((l for l in leads if l.get("preferences", {}).get("app_ref") == app_ref), None)
        self.assertIsNotNone(target_lead, f"Lead with app_ref {app_ref} not found in officer leads list")
        self.assertEqual(target_lead["status"], "PENDING_APPROVAL")
        lead_id = target_lead["id"]

        # 3. Officer approves lead
        approve_resp = self.client.post(
            f"/api/officer/leads/{lead_id}/approve",
            json={"email": applicant_email},
            cookies=cookies,
            headers=headers,
        )
        self.assertEqual(approve_resp.status_code, 200)
        approve_data = approve_resp.json()

        self.assertTrue(approve_data.get("success"))
        self.assertIn("customer_id", approve_data)
        self.assertIn("username", approve_data)
        self.assertEqual(approve_data.get("email_sent_to"), applicant_email)
        self.assertIn(approve_data.get("delivery_status"), ("SENT", "SIMULATED_LOGGED"))

        customer_id = approve_data["customer_id"]
        username = approve_data["username"]

        # 4. Verify lead is now marked CONVERTED
        updated_lead = db.get_lead(lead_id)
        self.assertEqual(updated_lead["status"], "CONVERTED")
        self.assertEqual(updated_lead["customer_id"], customer_id)
        self.assertIn(updated_lead["preferences"].get("delivery_status"), ("SENT", "SIMULATED_LOGGED"))

        # 5. Verify customer profile was created in DB
        cust = db.get_customer(customer_id)
        self.assertIsNotNone(cust)
        self.assertEqual(cust["full_name"], "Deepak Chopra")

        # 6. Verify cannot approve twice
        double_approve = self.client.post(
            f"/api/officer/leads/{lead_id}/approve",
            json={},
            cookies=cookies,
            headers=headers,
        )
        self.assertEqual(double_approve.status_code, 400)

    def test_non_officer_cannot_approve_lead(self):
        """A customer or visitor without officer credentials cannot approve leads."""
        # Unauthenticated
        resp1 = self.client.post("/api/officer/leads/LEAD-999/approve", json={})
        self.assertIn(resp1.status_code, (401, 403))

        # Authenticated as customer
        context, token, csrf = auth_service.create_direct_session("aarav")
        resp2 = self.client.post(
            "/api/officer/leads/LEAD-999/approve",
            json={},
            cookies={COOKIE_NAME: token},
            headers={"x-csrf-token": csrf},
        )
        self.assertEqual(resp2.status_code, 403)


if __name__ == "__main__":
    unittest.main()
