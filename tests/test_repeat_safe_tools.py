"""Write tools are repeat-safe: the same call twice in a session has one effect; reads and different calls are untouched."""
import unittest

import dev_ui
from banking_tools import build_banking_tools


class RepeatSafeToolTests(unittest.TestCase):
    def setUp(self):
        dev_ui.db.reset_to_seed()
        self.ctx = {"session_id": "S-REPEAT", "customer_id": "CUST-1001"}
        self.tools = {t.__name__: t for t in build_banking_tools(lambda: self.ctx)}

    def test_same_complaint_twice_registers_once(self):
        first = self.tools["register_complaint"](summary="Charged twice for my card fee", category="charges")
        second = self.tools["register_complaint"](summary="Charged twice for my card fee", category="charges")
        self.assertEqual(first["reference"], second["reference"])
        self.assertTrue(second["repeated_request"])
        third = self.tools["register_complaint"](summary="A different problem with my statement", category="statement")
        self.assertNotEqual(third["reference"], first["reference"])

    def test_another_session_is_not_deduplicated(self):
        first = self.tools["request_callback"](reason="Talk about my loan")
        self.ctx = {"session_id": "S-OTHER", "customer_id": "CUST-1001"}
        other = {t.__name__: t for t in build_banking_tools(lambda: self.ctx)}["request_callback"](reason="Talk about my loan")
        self.assertNotEqual(first["reference"], other["reference"])

    def test_read_tools_are_not_wrapped(self):
        self.assertNotIn("repeated_request", self.tools["get_customer_summary"]())
        self.assertNotIn("repeated_request", self.tools["get_customer_summary"]())


if __name__ == "__main__":
    unittest.main()
