"""Visitor applications: Mitra opens the secure form (details never pass through chat); companion offers shown once."""
import os
import tempfile
import unittest
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'mitra-apps.sqlite3'}")

import dev_ui  # noqa: E402  (binds the live application services)
from product_service import SalesSessionContext, build_public_sales_tools, sales_advisor, validate_sales_response  # noqa: E402


class MitraVisitorApplicationTests(unittest.TestCase):
    def setUp(self):
        self.context = SalesSessionContext()
        self.tools = {tool.__name__: tool for tool in build_public_sales_tools(lambda: self.context)}

    def test_mitra_opens_the_secure_form_and_never_collects_details_in_chat(self):
        opened = self.tools["open_application_form"]("PROD-SAV-PREMIER")
        self.assertTrue(opened["ok"])
        self.assertEqual(self.context.form_product_id, "PROD-SAV-PREMIER")
        self.assertIn("Never ask for", opened["instruction"])
        self.assertFalse(self.tools["open_application_form"]("PROD-NOPE")["ok"])
        # The applicant's details go from the form to /api/products/apply; the chat tools take none of them.
        self.assertNotIn("prepare_product_application", self.tools)
        self.assertNotIn("submit_product_application", self.tools)

    def test_the_trusted_context_sent_each_turn_holds_no_personal_details(self):
        self.tools["open_application_form"]("PROD-CARD-CASHBACK")
        self.context.update("My PAN is ABCDE1234F and mobile 9820515974")
        snapshot = str(self.context.snapshot())
        self.assertIn("PROD-CARD-CASHBACK", snapshot)
        self.assertNotIn("ABCDE1234F", snapshot.replace(" ", ""))
        self.assertNotIn("9820515974", snapshot)

    def turn(self, context, prompt):  # same order as the chat runtime: update context, then build the sales action
        context.update(prompt)
        return sales_advisor.build_action(prompt, context).get("companion_cross_sell")

    def test_companion_offer_is_shown_once_and_never_after_a_no(self):
        offers = [self.turn(self.context, p) for p in ("Help me compare your savings accounts", "Tell me about Suvarna savings",
                                                       "What about the debit card?", "Open account online")]
        self.assertEqual(sum(1 for offer in offers if offer), 1)
        declined = SalesSessionContext()
        self.turn(declined, "savings account please")
        self.turn(declined, "no thanks, not interested in the card")
        self.assertIsNone(self.turn(declined, "compare savings accounts"))

    def test_rates_are_compared_by_value(self):
        self.assertIsNone(validate_sales_response("Flat 2% cashback and 7.2% interest"))
        self.assertIsNotNone(validate_sales_response("Guaranteed 9% returns"))


if __name__ == "__main__":
    unittest.main()
