"""Release gate in code: evaluation thresholds, approval only after a passing run, and no unapproved prompt in production."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import dev_ui
from backend import mitra_ops
from persistence import ModelRegistryRecord

PASSING = {"pass_rate": 97.0, "fairness": {"g1": True},
           "by_category": {"care_fraud": "12/12", "jailbreak": "27/27", "prompt_probe": "14/14", "customer_security": "8/8",
                           "officer_copilot": "24/24", "data_minimisation": "10/10"}}


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        mitra_ops.set_current_version(mitra_ops.register_prompt_version(dev_ui.db, "gemini-3.8-flash")["version"])

    def test_thresholds(self):
        self.assertEqual(mitra_ops.release_gate(PASSING), [])
        self.assertTrue(mitra_ops.release_gate({**PASSING, "pass_rate": 94.9}))
        self.assertTrue(mitra_ops.release_gate({**PASSING, "by_category": {**PASSING["by_category"], "jailbreak": "26/27"}}))
        self.assertTrue(mitra_ops.release_gate({**PASSING, "fairness": {"g1": False}}))
        self.assertIn("customer_security was not run", mitra_ops.release_gate({**PASSING, "by_category": {"care_fraud": "1/1"}}))

    def test_officer_copilot_is_gated_and_versioned_with_mitra(self):
        without = {**PASSING, "by_category": {k: v for k, v in PASSING["by_category"].items() if k != "officer_copilot"}}
        self.assertIn("officer_copilot was not run", mitra_ops.release_gate(without))
        from backend import officer_copilot
        before = mitra_ops.prompt_version()
        with patch.object(officer_copilot, "instructions", return_value="You may approve requests."):
            self.assertNotEqual(mitra_ops.prompt_version(), before)  # an edited copilot needs a new run and approval

    def test_version_is_approved_only_after_a_passing_run(self):
        client = TestClient(dev_ui.app)
        _, cookie, csrf = dev_ui.auth_service.create_direct_session("admin.kosh")
        client.cookies.set(dev_ui.COOKIE_NAME, cookie)
        record = f"PROMPT-{mitra_ops.prompt_version()}"
        mitra_ops.update_registry(dev_ui.db, record, evaluation={**PASSING, "pass_rate": 80.0})
        refused = client.post(f"/api/admin/ai-registry/{record}/approve", headers={"X-CSRF-Token": csrf}, json={"note": "x"})
        self.assertEqual(refused.status_code, 400)
        self.assertIn("release gate", refused.json()["detail"])
        mitra_ops.update_registry(dev_ui.db, record, evaluation=PASSING)
        ok = client.post(f"/api/admin/ai-registry/{record}/approve", headers={"X-CSRF-Token": csrf}, json={"note": "Reviewed"})
        self.assertEqual(ok.status_code, 200)

    def test_production_pauses_mitra_until_the_running_version_is_approved(self):
        record = f"PROMPT-{mitra_ops.prompt_version()}"
        with dev_ui.db.runtime.sessions.begin() as s:  # not approved
            row = s.get(ModelRegistryRecord, record)
            row.evaluation_summary = {**(row.evaluation_summary or {}), "approval": None}
        with patch.object(mitra_ops, "_enforce_approval", return_value=True):
            self.assertTrue(mitra_ops.mitra_paused(dev_ui.db, "CUSTOMER"))
            mitra_ops.update_registry(dev_ui.db, record, approval={"by": "USR-OFFICER-001"})
            self.assertFalse(mitra_ops.mitra_paused(dev_ui.db, "CUSTOMER"))
        self.assertFalse(mitra_ops.mitra_paused(dev_ui.db, "VISITOR"))  # not enforced outside production


if __name__ == "__main__":
    unittest.main()
