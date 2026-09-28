"""Typed banking tables: the legacy JSON state migrates losslessly, order is kept, and only changed rows are written."""
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import event, func, select

from banking_db import DEFAULT_SEED_PATH, TYPED_MARKER, BankingDatabase
from persistence import BankAccountRecord, BankDocumentRecord, BankingStateRecord, BankTransactionRecord


class TypedStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.url = f"sqlite+pysqlite:///{Path(self.tmp.name) / 'typed.sqlite3'}"

    def tearDown(self):
        self.tmp.cleanup()

    def test_legacy_json_record_migrates_losslessly(self):
        legacy = json.loads(Path(DEFAULT_SEED_PATH).read_text())
        legacy["preferences"] = {"CUST-1001": {"whatsapp_updates": True, "marketing_offers": False}}
        legacy["cheque_books"] = {"CHQ-1": {"id": "CHQ-1", "leaves": 25}}
        first = BankingDatabase(self.url)
        with first.runtime.sessions.begin() as s:  # put the state back the way the old code stored it
            row = s.get(BankingStateRecord, 1)
            row.payload = copy.deepcopy(legacy)
        db = BankingDatabase(self.url)  # restart: migrates once
        self.assertEqual(db.snapshot(), legacy)
        with db.runtime.sessions() as s:
            self.assertEqual(s.get(BankingStateRecord, 1).payload, TYPED_MARKER)
            acc = s.get(BankAccountRecord, "ACC-SAL-001")
            self.assertEqual((acc.customer_id, acc.balance_minor), ("CUST-1001", legacy["accounts"]["ACC-SAL-001"]["balance_minor"]))
            self.assertEqual(s.get(BankDocumentRecord, ("cheque_books", "CHQ-1")).data["leaves"], 25)
        self.assertEqual(BankingDatabase(self.url).snapshot(), legacy)  # a second start changes nothing

    def test_order_is_kept_and_only_changed_rows_are_written(self):
        db = BankingDatabase(self.url)
        before = db.snapshot()
        new = {"id": "TXN-NEW", "customer_id": "CUST-1001", "account_id": "ACC-SAL-001", "amount_minor": -100,
               "created_at": "2026-09-28T10:00:00Z", "status": "COMPLETED", "category": "OTHER"}
        writes = []
        event.listen(db.runtime.engine, "before_cursor_execute", lambda *a: writes.append(a[2]) if a[2].split()[0] in {"INSERT", "UPDATE", "DELETE"} else None)

        def pay(state):
            state["transactions"].insert(0, new)
            state["accounts"]["ACC-SAL-001"]["balance_minor"] -= 100
            state["transactions"].append({**new, "id": "TXN-LAST"})
        db.transaction(pay)
        after = db.snapshot()
        self.assertEqual([t["id"] for t in after["transactions"]], ["TXN-NEW"] + [t["id"] for t in before["transactions"]] + ["TXN-LAST"])
        self.assertEqual(list(after["accounts"]), list(before["accounts"]))
        touched = [w.split()[2] if w.startswith("INSERT") else w.split()[1] for w in writes]
        self.assertEqual(sorted(touched), ["bank_accounts", "bank_transactions", "bank_transactions", "banking_state"])
        with db.runtime.sessions() as s:
            self.assertEqual(s.scalar(select(func.count()).select_from(BankTransactionRecord)), len(after["transactions"]))
            self.assertEqual(s.get(BankTransactionRecord, "TXN-NEW").amount_minor, -100)

    def test_reset_and_new_collections(self):
        db = BankingDatabase(self.url)
        db.transaction(lambda s: s.setdefault("standing_instructions", {}).update({"SI-1": {"id": "SI-1"}}))
        self.assertEqual(db.snapshot()["standing_instructions"], {"SI-1": {"id": "SI-1"}})
        db.transaction(lambda s: s["standing_instructions"].clear())
        self.assertEqual(db.snapshot()["standing_instructions"], {})
        db.reset_to_seed()
        self.assertNotIn("standing_instructions", db.snapshot())
        self.assertEqual(db.snapshot(), json.loads(Path(DEFAULT_SEED_PATH).read_text()))


if __name__ == "__main__":
    unittest.main()
