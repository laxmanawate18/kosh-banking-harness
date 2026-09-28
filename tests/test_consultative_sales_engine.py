import os
import unittest
import tempfile
from banking_db import BankingDatabase
import banking_tools

class TestConsultativeSalesEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_sales.sqlite3")
        self.db = BankingDatabase(self.db_path)

    def tearDown(self):
        if hasattr(self.db, "engine"):
            self.db.engine.dispose()
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_record_lead_and_lifecycle(self):
        lead = self.db.record_lead(
            customer_id="CUST-001",
            session_id="sess-123",
            category="PERSONAL_LOAN",
            sub_type="EXPRESS_PERSONAL_LOAN",
            amount_requested_minor=50000000, # 5 Lakhs
            tenure_months=36,
            employment_type="SALARIED",
            monthly_income_minor=8500000, # 85k
            preferences="Needs lowest interest rate and fast approval",
            special_offer_note="Special 10.25% p.a. pre-approved rate (0.5% rate cut)",
            follow_up_pitch="Welcome back! We have an exclusive 10.25% p.a. pre-approved rate ready for your 5 Lakh loan.",
            notes="Customer inquired about urgent home renovation loan",
        )

        self.assertTrue(lead["id"].startswith("LEAD-"))
        self.assertEqual(lead["customer_id"], "CUST-001")
        self.assertEqual(lead["category"], "PERSONAL_LOAN")
        self.assertEqual(lead["amount_requested_minor"], 50000000)
        self.assertEqual(lead["status"], "QUALIFIED")

        # Verify active leads query
        active_leads = self.db.get_active_leads_for_customer("CUST-001")
        self.assertEqual(len(active_leads), 1)
        self.assertEqual(active_leads[0]["id"], lead["id"])

        # Verify officer list leads
        all_leads = self.db.list_leads()
        self.assertEqual(len(all_leads), 1)
        self.assertEqual(all_leads[0]["id"], lead["id"])

        # Update status to CONTACTED
        updated = self.db.update_lead_status(lead["id"], "CONTACTED", notes="Officer called applicant")
        self.assertIsNotNone(updated)
        self.assertEqual(updated["status"], "CONTACTED")
        self.assertIn("Officer called applicant", updated["notes"])

        # Update status to CONVERTED
        converted = self.db.update_lead_status(lead["id"], "CONVERTED", notes="Loan disbursed!")
        self.assertIsNotNone(converted)
        self.assertEqual(converted["status"], "CONVERTED")

        # Now active leads should be empty (since status is CONVERTED)
        active_leads_after = self.db.get_active_leads_for_customer("CUST-001")
        self.assertEqual(len(active_leads_after), 0)

    def test_banking_tools_record_customer_lead(self):
        original_db = banking_tools.db
        try:
            banking_tools.db = self.db

            tools = banking_tools.build_banking_tools(
                context_provider=lambda: {"customer_id": "CUST-002", "session_id": "sess-turn-1"}
            )
            tool_map = {t.__name__: t for t in tools}
            record_customer_lead = tool_map["record_customer_lead"]
            get_lead_reengagement_offer = tool_map["get_lead_reengagement_offer"]

            result = record_customer_lead(
                category="CREDIT_CARD",
                sub_type="TRAVEL_ELITE",
                amount_minor=0,
                tenure_months=0,
                employment_type="SALARIED",
                monthly_income_minor=12000000,
                preferences_summary="Frequent international flyer, loves airport lounge access",
                notes="Needs complimentary priority pass and zero foreign currency markup",
            )

            self.assertTrue(result["success"])
            self.assertIn("lead_id", result)
            self.assertEqual(result["category"], "CREDIT_CARD")
            self.assertEqual(result["presentation"]["type"], "CROSS_SELL_OFFER")
            self.assertTrue("Taj" in result["special_offer"] or "Complimentary" in result["special_offer"])

            # Check loan lead recording
            loan_result = record_customer_lead(
                category="LOAN",
                sub_type="PERSONAL",
                amount_minor=50000000,
                tenure_months=36,
                employment_type="SALARIED",
                monthly_income_minor=8500000,
                preferences_summary="Home renovation loan",
                notes="Urgent loan requirement",
            )
            self.assertTrue(loan_result["success"])
            self.assertEqual(loan_result["category"], "LOAN")
            self.assertEqual(loan_result["presentation"]["type"], "CROSS_SELL_OFFER")
            self.assertIn("10.25%", loan_result["special_offer"])

            # Check that tool get_lead_reengagement_offer works
            reengage = get_lead_reengagement_offer()
            self.assertTrue(reengage["has_active_lead"])
            self.assertEqual(reengage["lead_id"], loan_result["lead_id"])
            self.assertIn("follow_up_pitch", reengage)
        finally:
            banking_tools.db = original_db


if __name__ == "__main__":
    unittest.main()
