"""Mitra takes real applications in chat: prepare -> visitor confirms -> submit once; companion offers shown once."""
import os
import tempfile
import unittest
import uuid
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'mitra-apps.sqlite3'}")

import dev_ui  # noqa: E402  (binds the live application services)
from product_service import SalesSessionContext, build_public_sales_tools, sales_advisor, validate_sales_response  # noqa: E402


class MitraVisitorApplicationTests(unittest.TestCase):
    def setUp(self):
        self.context = SalesSessionContext()
        self.tools = {tool.__name__: tool for tool in build_public_sales_tools(lambda: self.context)}
        self.phone = f"98{uuid.uuid4().int % 100000000:08d}"

    def prepare(self, **extra):
        return self.tools["prepare_product_application"](
            "PROD-SAV-PREMIER", "Laxman Awate", self.phone, "laxman@example.com", employment_type="Salaried", **extra)

    def test_submission_needs_the_visitors_own_confirmation(self):
        self.assertEqual(self.prepare()["status"], "AWAITING_VISITOR_CONFIRMATION")
        refused = self.tools["submit_product_application"]()
        self.assertFalse(refused["ok"])
        self.context.update("Laxman Awate 9820515974")  # more details is not a confirmation
        self.assertFalse(self.tools["submit_product_application"]()["ok"])
        self.context.update("confirm")
        submitted = self.tools["submit_product_application"]()
        self.assertTrue(submitted["ok"], submitted)
        self.assertTrue(submitted["application_ref"].startswith("SAV-APP-"))
        lead = next(l for l in dev_ui.db.list_leads() if (l.get("preferences") or {}).get("app_ref") == submitted["application_ref"])
        self.assertEqual(lead["preferences"]["email"], "laxman@example.com")
        self.assertEqual(lead["status"], "PENDING_APPROVAL")

    def test_same_product_is_never_submitted_twice(self):
        self.prepare(); self.context.update("yes, submit it")
        first = self.tools["submit_product_application"]()
        again = self.prepare()
        self.assertEqual(again["already_submitted"]["application_ref"], first["application_ref"])
        refs = [l for l in dev_ui.db.list_leads() if (l.get("preferences") or {}).get("phone_number", "").endswith(self.phone)]
        self.assertEqual(len(refs), 1)

    def test_missing_details_are_asked_for_not_invented(self):
        result = self.tools["prepare_product_application"]("PROD-SAV-PREMIER", "Laxman Awate", self.phone, "")
        self.assertEqual(result["missing_fields"], ["email"])
        card = self.tools["prepare_product_application"]("PROD-CARD-CASHBACK", "Laxman Awate", self.phone, "l@example.com")
        self.assertEqual(set(card["missing_fields"]), {"pan_number", "employment_type", "monthly_income"})

    def test_invalid_details_come_back_as_a_correctable_error(self):
        self.tools["prepare_product_application"]("PROD-SAV-PREMIER", "Laxman Awate", "12345", "l@example.com")
        self.context.update("confirm")
        result = self.tools["submit_product_application"]()
        self.assertFalse(result["ok"])
        self.assertIn("mobile", result["error"].lower())

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
