"""Consent per action: each tool needs the consent scope the registry names; the consent id is on the audit record."""
import asyncio
import tempfile
import unittest
from pathlib import Path

from google.antigravity import types

import backend.agent_config as agent_config
from auth_service import CONSENT_SCOPE
from backend import harness
from backend.agent_config import SecureToolGateHook
from banking_db import DEFAULT_SEED_PATH, BankingDatabase
from tests.consent_helpers import grant_consent


class ConsentPerActionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = BankingDatabase(f"sqlite+pysqlite:///{Path(self.tmp.name) / 'consent.sqlite3'}", DEFAULT_SEED_PATH)
        self.real_db, agent_config.db = agent_config.db, self.db
        self.gate = SecureToolGateHook({"session_id": "S-CONSENT", "customer_id": "CUST-1001", "scopes": ["banking.read", "banking.propose"]})

    def tearDown(self):
        agent_config.db = self.real_db
        self.db.runtime.engine.dispose()
        self.tmp.cleanup()

    def call(self, name, args=None):
        return asyncio.run(self.gate.run(None, types.ToolCall(name=name, args=args or {})))

    def test_registry_names_a_valid_consent_for_every_tool(self):
        for channel in ("customer", "visitor", "officer"):
            for name, spec in harness.tools(channel).items():
                self.assertIn(spec["consent"], {"none", "marketing", *CONSENT_SCOPE}, f"{channel}.{name}")

    def test_no_consent_blocks_personal_data_but_never_a_complaint(self):
        self.assertIn("CONSENT_REQUIRED", self.call("get_customer_summary").message)
        self.assertTrue(self.call("register_complaint", {"summary": "Charged twice for my card fee"}).allow)

    def test_scope_is_checked_per_action_and_recorded(self):
        grant_consent(self.db, scope=["accounts:read"])
        self.assertTrue(self.call("get_customer_summary").allow)
        denied = self.call("propose_transfer", {"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100, "source_account_id": "ACC-SAL-001"})
        self.assertIn("CONSENT_SCOPE_MISSING:payments:propose", denied.message)
        allowed = next(e for e in self.db.get_audit_events(limit=20) if e["event_type"] == "AGENT_TOOL_ALLOWED")
        self.assertTrue(allowed["consent_id"].startswith("CNS-"))

    def test_marketing_needs_its_own_consent(self):
        grant_consent(self.db)
        self.assertIn("MARKETING_CONSENT_REQUIRED", self.call("get_next_best_offer").message)
        self.db.transaction(lambda d: d.setdefault("preferences", {}).setdefault("CUST-1001", {}).update(marketing_offers=True))
        self.assertTrue(self.call("get_next_best_offer").allow)


if __name__ == "__main__":
    unittest.main()
