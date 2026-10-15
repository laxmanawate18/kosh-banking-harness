"""A burst of refusals pauses the two money tools for a while, on their own, without touching the admin's switches."""
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'pause.sqlite3'}"

from fastapi.testclient import TestClient

import dev_ui
from backend import auto_controls
from banking_db import BankingDatabase
from banking_tools import SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "banking_seed.json"


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


class AutoPauseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = BankingDatabase(Path(self.temp.name) / "store.json", SEED)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.service = SecureBankingService(self.repo, SentinelService(self.repo, "test-secret"))
        self.resolver = IntentResolver(self.repo)
        self.limit = patch.object(auto_controls, "TRIP_AT_REFUSALS", 3)
        self.limit.start()

    def tearDown(self):
        self.limit.stop()
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def refused_transfer(self, n: int):
        session = f"S-PAUSE-{n}"
        intent = self.resolver.resolve("Transfer ₹5,000 to Fast Cash Services", session, f"turn-{session}")
        context = {"session_id": session, "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01",
                   "untrusted_content_detected": False}
        result = self.service.propose_transfer(context, "BEN-FASTCASH", 500_000, "ACC-SAL-001")
        self.assertEqual(result["status"], "DENIED")

    def events(self, kind: str):
        return [e for e in self.repo.snapshot()["audit_events"] if e["event_type"] == kind]

    def test_fewer_refusals_than_the_limit_pause_nothing(self):
        for n in range(2):
            self.refused_transfer(n)
        self.assertEqual(self.repo.effective_disabled_tools(), [])
        self.assertEqual(self.events("AUTO_PAUSE_STARTED"), [])

    def test_reaching_the_limit_pauses_only_the_money_tools_and_leaves_the_admins_switches_alone(self):
        for n in range(3):
            self.refused_transfer(n)
        self.assertEqual(self.repo.effective_disabled_tools(), sorted(auto_controls.MONEY_TOOLS))
        self.assertEqual(self.repo.get_controls()["disabled_tools"], [])
        self.assertEqual(self.repo.get_controls()["disabled_channels"], [])
        started = self.events("AUTO_PAUSE_STARTED")
        self.assertEqual(len(started), 1)
        self.assertEqual(started[0]["details"]["refusals"], 3)

    def test_more_refusals_while_paused_do_not_start_a_second_pause(self):
        for n in range(3):
            self.refused_transfer(n)
        self.assertFalse(auto_controls.after_refusal(self.repo))
        self.assertEqual(len(self.events("AUTO_PAUSE_STARTED")), 1)

    def test_the_admin_saving_switches_keeps_the_automatic_pause(self):
        for n in range(3):
            self.refused_transfer(n)
        self.repo.set_controls(disabled_channels=[], disabled_tools=["record_customer_lead"], reason="Testing", officer_user_id="USR-ADMIN")
        self.assertEqual(self.repo.effective_disabled_tools(), sorted({*auto_controls.MONEY_TOOLS, "record_customer_lead"}))

    def test_the_pause_ends_by_itself(self):
        for n in range(3):
            self.refused_transfer(n)
        controls = self.repo.get_controls()
        later = datetime.now(timezone.utc) + timedelta(minutes=auto_controls.PAUSE_MINUTES + 1)
        self.assertEqual(auto_controls.active(controls, later), [])
        self.assertEqual(sorted(auto_controls.active(controls)), sorted(auto_controls.MONEY_TOOLS))

    def test_refusals_older_than_the_window_do_not_count(self):
        for n in range(2):
            self.refused_transfer(n)
        later = datetime.now(timezone.utc) + timedelta(minutes=auto_controls.WITHIN_MINUTES + 1)
        self.assertFalse(auto_controls.after_refusal(self.repo, later))  # the two old ones fell out of the window
        self.assertEqual(self.repo.effective_disabled_tools(), [])

    def test_the_admin_can_resume_at_once_and_it_is_recorded(self):
        for n in range(3):
            self.refused_transfer(n)
        self.assertEqual(auto_controls.resume(self.repo, "USR-ADMIN"), len(auto_controls.MONEY_TOOLS))
        self.assertEqual(self.repo.effective_disabled_tools(), [])
        self.assertEqual(len(self.events("AUTO_PAUSE_ENDED")), 1)
        self.assertEqual(auto_controls.resume(self.repo, "USR-ADMIN"), 0)  # nothing left to end
        self.assertEqual(len(self.events("AUTO_PAUSE_ENDED")), 1)

    def test_every_tool_gate_reads_the_combined_list(self):
        for name in ("backend/agent_config.py", "backend/mcp_gateway.py"):
            self.assertNotIn('get("disabled_tools"', (ROOT / name).read_text(encoding="utf-8"), name)

    def test_the_defaults_are_high_enough_not_to_trip_on_a_few_refusals(self):
        self.limit.stop()
        try:
            self.assertGreaterEqual(auto_controls.TRIP_AT_REFUSALS, 10)
        finally:
            self.limit.start()


class AutoPauseAdminTests(unittest.TestCase):
    def test_the_admin_sees_the_rule_and_only_the_admin_can_resume(self):
        admin, headers = login("admin.kosh")
        shown = admin.get("/api/admin/controls").json()
        self.assertEqual(shown["auto_pauses"], [])
        self.assertEqual(shown["auto_pause_rule"]["refusals"], auto_controls.TRIP_AT_REFUSALS)
        self.assertNotIn("auto_trips", shown)
        self.assertEqual(admin.post("/api/admin/controls/resume", headers=headers).json(), {"resumed": 0})
        for user in ("officer.mumbai", "aarav"):
            other, other_headers = login(user)
            self.assertEqual(other.post("/api/admin/controls/resume", headers=other_headers).status_code, 403, user)


if __name__ == "__main__":
    unittest.main()
