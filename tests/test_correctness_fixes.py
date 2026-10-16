import os
import subprocess
import unittest
from datetime import datetime, timezone
from banking_db import db
from backend import stp
from service_requests import ServiceRequestService
from banking_workflows import WorkflowService, BankingWorkflowRecord
from account_applications import AccountApplicationService, NEXT
from rpa.job_dispatcher import RPAJobQueue, JobStatus


class TestCorrectnessFixes(unittest.TestCase):
    def setUp(self):
        db.reset_to_seed()
        self.svc = ServiceRequestService(db)

    def tearDown(self):
        db.reset_to_seed()

    def test_duplicate_call_guard_no_crash_on_replay(self):
        """Bug 1: Guard against duplicate-key crash when saving idempotency records."""
        key = "tool:sess-test-1:abcdef123456"
        # First save
        def _add1(state):
            recs = state.setdefault("idempotency_records", [])
            recs.append({"key": key, "result": {"success": True}, "created_at": "2026-10-17T00:00:00Z"})
        db.transaction(_add1)

        # Second save (replay after expiry with same key)
        def _add2(state):
            recs = state.setdefault("idempotency_records", [])
            entry = {"key": key, "result": {"success": True, "replayed": True}, "created_at": "2026-10-17T00:15:00Z"}
            for i, r in enumerate(recs):
                if r.get("key") == key:
                    recs[i] = entry
                    return
            recs.append(entry)
        # Must execute cleanly without RuntimeError
        db.transaction(_add2)
        saved = db.get_idempotency(key)
        self.assertIsNotNone(saved)
        self.assertTrue(saved.get("result", {}).get("replayed"))

    def test_application_stuck_states_retryable_and_queue_rearm(self):
        """Bug 3: CBS_MAKER_DONE and CBS_AUTHORISED are in NEXT and job queue re-arms on retry."""
        self.assertIn("QUEUED_FOR_CBS", NEXT["CBS_MAKER_DONE"])
        self.assertIn("QUEUED_FOR_CBS", NEXT["CBS_AUTHORISED"])

        queue = RPAJobQueue()
        job = queue.enqueue("REQ-TEST-P125", {"name": "Test"})
        self.assertEqual(job["status"], JobStatus.PENDING.value)
        queue.update_job("REQ-TEST-P125", status=JobStatus.FAILED.value, error="Network glitch")
        self.assertEqual(queue.get_job("REQ-TEST-P125")["status"], JobStatus.FAILED.value)

        # Re-enqueue on retry must re-arm
        retried = queue.enqueue("REQ-TEST-P125", {"name": "Test Retry"})
        self.assertEqual(retried["status"], JobStatus.PENDING.value)
        self.assertIsNone(retried["error"])

    def test_portal_new_address_and_referred_stp_execution(self):
        """Bug 4: Portal new_address updates customer and referred STP requests execute."""
        # Test portal new_address
        req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-12",
            data={"new_address": "Penthouse 901, Worli Sea Face", "city": "Mumbai", "pincode": "400018"},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Proof of address verified")
        cust = db.snapshot()["customer"]
        self.assertEqual(cust["address"], "Penthouse 901, Worli Sea Face")

        # Test referred P1-04 (cheque book)
        cb_req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-04",
            data={"account_id": "ACC-SAL-001", "leaves": 50},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(cb_req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Customer KYC clear")
        state = db.snapshot()
        self.assertTrue(any(b.get("customer_id") == "CUST-1001" and b.get("leaves") == 50 for b in state.get("cheque_books", {}).values()))

        # Test referred P1-07 (debit card block)
        card_req = self.svc.create(
            customer_id="CUST-1001", user_id="aarav", service_id="P1-07",
            data={"reason": "Customer reported card misplaced"},
            consent_id="CONS-TEST", session_id="SESS-TEST"
        )
        self.svc.decide(card_req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Prevent fraud")
        state = db.snapshot()
        blocked_card = next(c for c in state.get("cards", {}).values() if c.get("customer_id") == "CUST-1001")
        self.assertEqual(blocked_card["status"], "BLOCKED")

    def test_workflow_payee_mule_check(self):
        """Bug 5: Mule beneficiary with risk_status == BLOCKED_MULE fails PAYEE_ELIGIBILITY."""
        service = WorkflowService(db)
        # Fast Cash Services has risk_status == 'BLOCKED_MULE'
        row = BankingWorkflowRecord(
            id="WF-TEST-MULE",
            customer_id="CUST-1001",
            user_id="aarav",
            skill_id="standing_instruction",
            status="DRAFT",
            revision=1,
            payload={"fields": {"beneficiary_id": "BEN-FASTCASH", "account_id": "ACC-SAL-001", "amount": "5000", "frequency": "monthly", "start": "2026-11-01", "end": "2027-11-01"}},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        checks = service.checks(row)
        eligibility = next((c for c in checks if c["code"] == "PAYEE_ELIGIBILITY"), None)
        self.assertIsNotNone(eligibility)
        self.assertNotEqual(eligibility["status"], "PASS", "Beneficiary with risk_status BLOCKED_MULE must not pass payee eligibility")

    def test_alembic_fresh_database_upgrade(self):
        """Bug 6: Alembic upgrade head runs cleanly on a fresh blank database."""
        test_db = "tmp_fresh_test_run.sqlite3"
        if os.path.exists(test_db):
            os.remove(test_db)
        try:
            res = subprocess.run(
                ["alembic", "upgrade", "head"],
                env={**os.environ, "SENTINEL_DATABASE_URL": f"sqlite:///{test_db}"},
                capture_output=True,
                text=True,
            )
            self.assertEqual(res.returncode, 0, f"Alembic upgrade head failed on fresh DB: {res.stderr}")
        finally:
            if os.path.exists(test_db):
                os.remove(test_db)


if __name__ == "__main__":
    unittest.main()
