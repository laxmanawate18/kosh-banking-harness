"""The explanation view: officers and admins can read why Sentinel decided, the customer cannot."""
import os
import tempfile
import unittest
from pathlib import Path

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'view.sqlite3'}"

from fastapi.testclient import TestClient

import dev_ui
from backend import decision_view
from banking_db import BankingDatabase
from banking_tools import GENERIC_REFUSAL, SecureBankingService
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService

SEED = Path(__file__).resolve().parent.parent / "data" / "banking_seed.json"


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client


class DecisionViewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.repo = BankingDatabase(Path(self.temp.name) / "store.json", SEED)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.service = SecureBankingService(self.repo, SentinelService(self.repo, "test-secret"))
        self.resolver = IntentResolver(self.repo)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def transfer(self, payee: str, rupees: int, said: str, session: str) -> dict:
        intent = self.resolver.resolve(f"Transfer ₹{rupees:,} to {said}", session, f"turn-{session}")
        context = {"session_id": session, "turn_id": intent["turn_id"], "intent": intent, "device_id": "DEVICE-KNOWN-01",
                   "untrusted_content_detected": False}
        return self.service.propose_transfer(context, payee, rupees * 100, "ACC-SAL-001")

    def test_a_refusal_is_explained_with_its_reasons_and_what_the_customer_was_told(self):
        result = self.transfer("BEN-FASTCASH", 5_000, "Fast Cash Services", "S-VIEW-1")
        found = decision_view.one(self.repo.snapshot(), result["sentinel"]["reference"])
        self.assertEqual(found["decision"], "DENY")
        self.assertTrue(found["reasons"])
        self.assertTrue(all(r["meaning"] and r["meaning"] != "No description recorded for this reason." for r in found["reasons"]),
                        [r["code"] for r in found["reasons"]])
        self.assertTrue(found["checks"])
        self.assertEqual(found["customer_was_told"], "Nothing about the reason.")
        self.assertEqual(result["sentinel"]["customer_message"], GENERIC_REFUSAL)  # and that really is all they got
        self.assertEqual(found["action"]["type"], "TRANSFER")
        self.assertEqual(found["action"]["amount_minor"], 500_000)

    def test_a_signal_shows_its_points_and_a_rule_does_not(self):
        result = self.transfer("BEN-VIKRAM", 75_000, "Vikram", "S-VIEW-2")
        found = decision_view.one(self.repo.snapshot(), result["sentinel"]["reference"])
        by_code = {r["code"]: r for r in found["reasons"]}
        self.assertTrue(found["decision"] in {"CHALLENGE", "DENY"})
        signals = [r for r in found["reasons"] if r["kind"] == "signal"]
        self.assertTrue(signals, by_code)
        self.assertTrue(all(isinstance(r["points"], int) for r in signals))
        self.assertTrue(all(r["points"] is None for r in found["reasons"] if r["kind"] == "rule"))
        self.assertLess(found["challenge_at"], found["deny_at"])

    def test_recent_lists_newest_first_filters_and_caps(self):
        for n in range(3):
            self.transfer("BEN-FASTCASH", 5_000, "Fast Cash Services", f"S-VIEW-L{n}")
        state = self.repo.snapshot()
        everything = decision_view.recent(state, limit=50)
        self.assertEqual([d["at"] for d in everything], sorted((d["at"] for d in everything), reverse=True))
        self.assertTrue(all(d["decision"] == "DENY" for d in decision_view.recent(state, decision="DENY")))
        self.assertEqual(len(decision_view.recent(state, limit=2)), 2)
        self.assertEqual(len(decision_view.recent(state, limit=0)), 1)  # never an empty page by accident

    def test_an_unknown_decision_is_not_found(self):
        self.assertIsNone(decision_view.one(self.repo.snapshot(), "DEC-DOES-NOT-EXIST"))

    def test_every_reason_sentinel_can_give_has_a_description(self):
        source = (Path(__file__).resolve().parent.parent / "sentinel.py").read_text(encoding="utf-8")
        import re
        used = set(re.findall(r'reasons\.append\("([A-Z_]+)"\)', source))
        used |= {m for m in re.findall(r'"reason": "([A-Z_]+)"', source)}
        used |= set(re.findall(r'check\([^)]*?"([A-Z][A-Z_]{6,})"\)', source))
        missing = sorted(code for code in used if code not in decision_view.REASONS)
        self.assertEqual(missing, [], "reason codes with no description for the officer view")


class DecisionViewAccessTests(unittest.TestCase):
    def test_only_the_admin_can_read_decisions(self):
        self.assertEqual(login("admin.kosh").get("/api/admin/decisions").status_code, 200)
        self.assertEqual(login("admin.kosh").get("/api/admin/decisions?decision=BOGUS").status_code, 400)
        self.assertEqual(login("admin.kosh").get("/api/admin/decisions/DEC-NOPE").status_code, 404)
        for user in ("officer.mumbai", "aarav"):
            client = login(user)
            self.assertEqual(client.get("/api/admin/decisions").status_code, 403, user)
            self.assertEqual(client.get("/api/admin/decisions/DEC-NOPE").status_code, 403, user)

if __name__ == "__main__":
    unittest.main()
