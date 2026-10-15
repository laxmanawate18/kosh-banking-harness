"""A governed parameter that the admin page says is enforced must have code that reads it; the others must say they are not."""
import os
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'params.sqlite3'}"

from backend import care, harness, ontology
from banking_db import BankingDatabase

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "banking_seed.json"


def source_files():
    for folder in (ROOT, ROOT / "backend"):
        for path in folder.glob("*.py"):
            if path.name not in {"ontology.py"} and not path.name.startswith("test_"):
                yield path


class ParametersEnforcedTests(unittest.TestCase):
    def test_every_parameter_marked_enforced_is_read_by_code(self):
        code = "\n".join(p.read_text(encoding="utf-8") for p in source_files())
        for parameter in ontology.ontology_parameters():
            if parameter["enforced"]:
                self.assertRegex(code, rf'["\']{re.escape(parameter["id"])}["\']', f'{parameter["id"]} claims to be enforced but no code reads it')

    def test_every_parameter_in_the_policy_file_is_listed_for_the_admin(self):
        listed = {p["id"] for p in ontology.ontology_parameters()}
        self.assertEqual(set(harness.policy()["ontology_parameters"]), listed)

    def test_a_parameter_no_code_reads_says_so(self):
        for parameter in ontology.ontology_parameters():
            if not parameter["enforced"]:
                self.assertTrue(parameter["enforced_in"].startswith("Not enforced"), parameter["id"])

    def test_one_reader_exists_for_a_new_payee_limit_so_the_name_cannot_drift(self):
        code = "\n".join(p.read_text(encoding="utf-8") for p in source_files())
        self.assertNotIn("PARAM_NEW_PAYEE_COOLING_LIMIT_MINOR", code)  # the old, unread name

    def test_a_complaint_is_due_after_the_governed_number_of_days(self):
        repo = BankingDatabase(Path(_SUITE_DATABASE.name) / "care.json", SEED)
        real = harness.parameter
        with patch.object(harness, "parameter", lambda name, default=None: 7 if name == "PARAM_DISPUTE_TAT_DAYS" else real(name, default)):
            case = care.open_case(repo, "GRIEVANCE", "The statement is wrong", customer_id="CUST-1001")
        due = datetime.fromisoformat(case["due_by"].replace("Z", "+00:00"))
        self.assertLess(abs((due - (datetime.now(timezone.utc) + timedelta(days=7))).total_seconds()), 60)

    def test_other_kinds_of_case_keep_their_own_due_times(self):
        self.assertEqual(care._due("FRAUD"), timedelta(hours=4))
        self.assertEqual(care._due("CALLBACK"), timedelta(hours=24))


if __name__ == "__main__":
    unittest.main()
