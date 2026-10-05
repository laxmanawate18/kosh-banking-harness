"""Every tool call leaves a masked, tamper-evident audit record, and the chain can be re-verified."""
import asyncio
import tempfile
import unittest
from pathlib import Path

from google.antigravity import types

import backend.agent_config as agent_config
from backend.agent_config import SecureToolGateHook, SessionPostToolCallHook
from banking_db import DEFAULT_SEED_PATH, BankingDatabase
from persistence import AuditEventRecord


class ToolAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = BankingDatabase(f"sqlite+pysqlite:///{Path(self.tmp.name) / 'audit.sqlite3'}", DEFAULT_SEED_PATH)
        self.real_db, agent_config.db = agent_config.db, self.db

    def tearDown(self):
        agent_config.db = self.real_db
        self.db.runtime.engine.dispose()
        self.tmp.cleanup()

    def events(self, session_id):
        return [e for e in self.db.get_audit_events(session_id) if e["event_type"].startswith("AGENT_TOOL_")]

    def test_allowed_denied_and_completed_calls_are_recorded_masked(self):
        gate = SecureToolGateHook({"session_id": "S-AUDIT", "customer_id": "CUST-1001"})
        asyncio.run(gate.run(None, types.ToolCall(name="propose_transfer", id="c1",
            args={"beneficiary_id": "BEN-VIKRAM", "amount_minor": 100, "source_account_id": "ACC-SAL-001", "note": "PAN ABCDE1234F"})))
        asyncio.run(gate.run(None, types.ToolCall(name="run_command", id="c2", args={"command": "id"})))
        asyncio.run(SessionPostToolCallHook("S-AUDIT", "CUST-1001").run(None, types.ToolResult(
            name="propose_transfer", id="c1", result={"status": "CHALLENGE_REQUIRED", "authorization_token": "secret-tok"})))
        by_type = {e["event_type"]: e for e in self.events("S-AUDIT")}
        self.assertEqual(set(by_type), {"AGENT_TOOL_ALLOWED", "AGENT_TOOL_DENIED", "AGENT_TOOL_COMPLETED"})
        allowed = by_type["AGENT_TOOL_ALLOWED"]["details"]
        self.assertIn("BEN-VIKRAM", allowed["arguments"])
        self.assertNotIn("ABCDE1234F", allowed["arguments"])  # PAN masked
        self.assertIn("unregistered", by_type["AGENT_TOOL_DENIED"]["details"]["gate_message"])
        self.assertNotIn("secret-tok", by_type["AGENT_TOOL_COMPLETED"]["details"]["result"])
        self.assertEqual(by_type["AGENT_TOOL_COMPLETED"]["details"]["tool_call_id"], "c1")

    def test_chain_verifies_and_detects_tampering(self):
        gate = SecureToolGateHook({"session_id": "S-CHAIN", "customer_id": "CUST-1001"})
        for i in range(3):
            asyncio.run(gate.run(None, types.ToolCall(name="get_accounts", id=f"c{i}", args={})))
        report = self.db.verify_audit_chain()
        self.assertTrue(report["valid"], report)
        self.assertGreaterEqual(report["verified"], 3)
        with self.db.runtime.sessions.begin() as s:
            row = s.query(AuditEventRecord).filter(AuditEventRecord.session_id == "S-CHAIN").first()
            row.summary = "Nothing happened here"
        broken = self.db.verify_audit_chain()
        self.assertFalse(broken["valid"])
        self.assertEqual(broken["reason"], "RECORD_ALTERED")


if __name__ == "__main__":
    unittest.main()
