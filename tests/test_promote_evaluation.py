"""Copying a local evaluation to production only works for the same prompt version, a passing run, and a deployed version."""
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import mitra_ops
from persistence import Base, ModelRegistryRecord
from scripts.promote_evaluation import promote

RUN = {"at": "2026-10-05T18:14:12Z", "passed": 283, "total": 284, "pass_rate": 99.6, "fairness": {"g": True},
       "by_category": {"care_fraud": "14/14", "jailbreak": "27/27", "prompt_probe": "14/14", "customer_security": "8/8",
                       "officer_copilot": "24/24", "data_minimisation": "10/10", "process_routing": "10/10"}}


class PromoteEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.version = mitra_ops.prompt_version()
        self.local, self.prod = (f"sqlite+pysqlite:///{Path(self.tmp.name) / n}" for n in ("local.db", "prod.db"))
        for url in (self.local, self.prod):
            Base.metadata.create_all(create_engine(url))

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, url, summary):
        with sessionmaker(bind=create_engine(url))() as s:
            s.add(ModelRegistryRecord(id=f"PROMPT-{self.version}", model_name="m", version=self.version, active=True,
                                      approved_use_cases=[], evaluation_summary=summary))
            s.commit()

    def prod_runs(self):
        with sessionmaker(bind=create_engine(self.prod))() as s:
            return s.get(ModelRegistryRecord, f"PROMPT-{self.version}").evaluation_summary.get("evaluations") or []

    def test_copies_a_passing_run_without_approving(self):
        self.put(self.local, {"evaluations": [RUN]})
        self.put(self.prod, {"approval": None, "evaluations": []})
        self.assertEqual(promote(self.local, self.prod, self.version, apply=False), 0)
        self.assertEqual(self.prod_runs(), [])  # dry run writes nothing
        self.assertEqual(promote(self.local, self.prod, self.version, apply=True), 0)
        self.assertEqual(self.prod_runs()[0]["passed"], 283)
        with sessionmaker(bind=create_engine(self.prod))() as s:
            self.assertIsNone(s.get(ModelRegistryRecord, f"PROMPT-{self.version}").evaluation_summary["approval"])
        self.assertEqual(promote(self.local, self.prod, self.version, apply=True), 0)
        self.assertEqual(len(self.prod_runs()), 1)  # re-running does not duplicate

    def test_refusals(self):
        self.put(self.local, {"evaluations": [{**RUN, "pass_rate": 90.0}]})
        self.put(self.prod, {"evaluations": []})
        self.assertEqual(promote(self.local, self.prod, self.version, apply=True), 1)  # fails the gate
        self.assertEqual(promote(self.local, self.prod, "000000000000", apply=True), 1)  # another version
        empty = f"sqlite+pysqlite:///{Path(self.tmp.name) / 'empty.db'}"
        Base.metadata.create_all(create_engine(empty))
        self.put(empty, {"evaluations": [RUN]})
        fresh_prod = f"sqlite+pysqlite:///{Path(self.tmp.name) / 'fresh.db'}"
        Base.metadata.create_all(create_engine(fresh_prod))
        self.assertEqual(promote(empty, fresh_prod, self.version, apply=True), 1)  # not deployed yet


if __name__ == "__main__":
    unittest.main()
