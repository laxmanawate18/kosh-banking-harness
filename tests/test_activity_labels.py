"""Every event type a customer's activity feed can return must have a label on the Security page.

The page looks the label up by event type and destructures it, so an event with no label breaks the whole page."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class ActivityLabelTests(unittest.TestCase):
    def test_every_customer_event_type_has_a_label(self):
        portal = (ROOT / "portal.py").read_text(encoding="utf-8")
        block = re.search(r"CUSTOMER_EVENT_TYPES = \{(.*?)\}", portal, re.S).group(1)
        allowed = set(re.findall(r'"([A-Z_]+)"', block))
        page = (ROOT / "frontend" / "src" / "components" / "pages" / "SecurityPage.tsx").read_text(encoding="utf-8")
        labelled = set(re.findall(r"^\s{2}([A-Z_]+): \[", page, re.M))
        self.assertTrue(allowed, "found no customer event types")
        self.assertEqual(sorted(allowed - labelled), [], "events the feed can return but the Security page cannot label")

    def test_a_locked_step_up_is_shown_to_the_customer_but_sentinel_decisions_are_not(self):
        portal = (ROOT / "portal.py").read_text(encoding="utf-8")
        block = re.search(r"CUSTOMER_EVENT_TYPES = \{(.*?)\}", portal, re.S).group(1)
        self.assertIn('"STEP_UP_LOCKED"', block)
        self.assertNotIn("SENTINEL_DECISION", block)


if __name__ == "__main__":
    unittest.main()
