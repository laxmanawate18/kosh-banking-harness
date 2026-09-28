import os
import time
import unittest
from fastapi.testclient import TestClient
from dev_ui import app

class TestStandaloneApplications(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_credit_card_standalone_application(self):
        """Applying for a credit card must NOT create an account or return credentials."""
        payload = {
            "product_id": "PROD-CARD-OBSIDIAN",
            "full_name": "Aarav Sharma",
            "phone_number": "+919876543210",
            "pan_number": "ABCDE1234F",
            "employment_type": "Salaried",
            "employer_or_college": "Sentinel Tech Labs",
            "monthly_income": 125000.0,
            "pincode": "400001",
        }
        resp = self.client.post("/api/products/apply", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("application_type"), "credit_card")
        self.assertTrue(data.get("application_ref", "").startswith("CC-APP-"))
        self.assertEqual(data.get("status"), "IN_PRINCIPLE_SANCTIONED")
        self.assertEqual(data.get("applicant_name"), "Aarav Sharma")
        
        # Verify NO bank account or login credentials generated
        self.assertNotIn("credentials", data)
        self.assertNotIn("account", data)

        # Verify optional post-application cross-sell
        self.assertIn("cross_sell_offer", data)
        self.assertEqual(data["cross_sell_offer"]["product_id"], "PROD-SAV-PREMIER")

    def test_loan_standalone_application(self):
        """Applying for a loan must calculate EMI and must NOT create a bank account or credentials."""
        payload = {
            "product_id": "PROD-LOAN-EXPRESS",
            "full_name": "Priya Patel",
            "phone_number": "+919876543211",
            "pan_number": "XYZAB5678C",
            "employment_type": "Salaried",
            "monthly_income": 95000.0,
            "loan_amount": 600000.0,
            "loan_tenure_months": 36,
            "loan_purpose": "Home Renovation",
            "pincode": "560001",
        }
        resp = self.client.post("/api/products/apply", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("application_type"), "loan")
        self.assertTrue(data.get("application_ref", "").startswith("LN-APP-"))
        self.assertEqual(data.get("status"), "IN_PRINCIPLE_SANCTIONED")
        self.assertEqual(data.get("tenure_months"), 36)
        self.assertIn("estimated_emi", data)
        self.assertTrue(data["estimated_emi"].startswith("₹"))

        # Verify NO bank account or login credentials generated
        self.assertNotIn("credentials", data)
        self.assertNotIn("account", data)

        # Verify optional post-application cross-sell
        self.assertIn("cross_sell_offer", data)
        self.assertEqual(data["cross_sell_offer"]["product_id"], "PROD-SAV-PREMIER")

    def test_savings_account_officer_queued_application(self):
        """Savings onboarding queues application for officer approval without immediate profile or credentials."""
        payload = {
            "product_id": "PROD-SAV-PREMIER",
            "full_name": "Rohan Verma",
            "phone_number": f"+91987{int(time.time() * 1000) % 10000000:07d}",
            "email": "rohan.verma@example.com",
        }
        resp = self.client.post("/api/products/apply", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("application_type"), "savings_account")
        self.assertEqual(data.get("status"), "PENDING_APPROVAL")
        self.assertTrue(data.get("application_ref", "").startswith("SAV-APP-"))
        self.assertNotIn("credentials", data)
        self.assertNotIn("session", data)
        self.assertNotIn("profile", data)
        self.assertNotIn("account", data)
        self.assertEqual(data.get("email"), "rohan.verma@example.com")

if __name__ == "__main__":
    unittest.main()
