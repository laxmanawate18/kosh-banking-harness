"""Security and state-machine tests for the Sentinel banking boundary."""

import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

_SUITE_DATABASE = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
os.environ["SENTINEL_DATABASE_URL"] = f"sqlite+pysqlite:///{Path(_SUITE_DATABASE.name) / 'suite.sqlite3'}"

from banking_db import BankingDatabase
from banking_tools import BANKING_TOOL_NAMES, SecureBankingService, build_banking_tools
from sentinel import CUSTOMER_ID, IntentResolver, SentinelService


class SentinelBankingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Path(self.temp.name) / "store.json"
        seed = Path(__file__).resolve().parent.parent / "data" / "banking_seed.json"
        self.repo = BankingDatabase(self.store, seed)
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.sentinel = SentinelService(self.repo, "test-secret")
        self.resolver = IntentResolver(self.repo)
        self.service = SecureBankingService(self.repo, self.sentinel)

    def tearDown(self):
        self.repo.runtime.engine.dispose()
        self.temp.cleanup()

    def record(self, result):
        """The full Sentinel decision from the store: the customer's result carries only the outcome and plain words."""
        return next(d for d in self.repo.snapshot()["sentinel_decisions"] if d["id"] == result["sentinel"]["reference"])

    def context(self, text, session="TEST-SESSION", device="DEVICE-KNOWN-01"):
        intent = self.resolver.resolve(text, session, f"turn-{len(self.repo.snapshot()['intents']) + 1}")
        return {"session_id": session, "turn_id": intent["turn_id"], "intent": intent,
                "device_id": device, "untrusted_content_detected": False}

    def test_seed_reset_is_deterministic_and_money_is_integer(self):
        self.repo.reset_to_seed()
        original = self.repo.snapshot()
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        self.service.propose_bill_payment(self.context("Pay my Tata Power electricity bill"), "BILL-TATA-001", "ACC-SAL-001")
        self.repo.reset_to_seed()
        self.assertEqual(self.repo.snapshot(), original)
        self.assertTrue(all(isinstance(a["balance_minor"], int) for a in original["accounts"].values()))

    def test_initial_kyc_not_done_blocks_transfers_and_bill_payments(self):
        self.repo.update_kyc_status(CUSTOMER_ID, "NOT_DONE")
        context = self.context("Transfer ₹75,000 to Vikram")
        result = self.service.propose_transfer(context, "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["sentinel"]["decision"], "DENY")
        self.assertIn("KYC_NON_COMPLIANT", self.record(result)["reason_codes"])

        bill_result = self.service.propose_bill_payment(self.context("Pay my Tata Power electricity bill"), "BILL-TATA-001", "ACC-SAL-001")
        self.assertEqual(bill_result["status"], "DENIED")
        self.assertEqual(bill_result["sentinel"]["decision"], "DENY")
        self.assertIn("KYC_NON_COMPLIANT", self.record(bill_result)["reason_codes"])

    def test_initial_kyc_status_presentation_and_validation(self):
        self.repo.update_kyc_status(CUSTOMER_ID, "NOT_DONE")
        status = self.service.get_kyc_status(CUSTOMER_ID)
        self.assertEqual(status["kyc_status"], "NOT_DONE")
        self.assertTrue(status["is_initial_kyc"])
        self.assertIn("OUTWARD_TRANSFERS_BLOCKED", status["account_restrictions"])
        self.assertEqual(status["presentation"]["type"], "INITIAL_KYC_FORM")

        pan_val = self.service.validate_kyc_document("PAN", "AAAPM1001M", customer_id=CUSTOMER_ID)
        self.assertTrue(pan_val["is_valid"])
        self.assertEqual(pan_val["verification_status"], "FORMAT_ONLY")
        self.assertFalse(pan_val["issuer_verified"])

    def test_kyc_status_when_submitted_for_review(self):
        # Agent text is never sufficient to submit a KYC dossier.
        result = self.service.submit_kyc_application(self.context("Submit my KYC"), pan_number="AAAPM1001M")
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "TRUSTED_REVIEW_REQUIRED")
        self.repo.update_kyc_status(CUSTOMER_ID, "SUBMITTED_FOR_REVIEW")
        status = self.service.get_kyc_status(CUSTOMER_ID)
        self.assertFalse(status["requires_kyc"])
        self.assertEqual(status["presentation"]["type"], "KYC_IN_REVIEW")
        self.assertIn("Awaiting Bank Officer", status["pending_requirements"][0])

    def test_exact_session_bound_tools(self):
        context = self.context("Show my accounts")
        tools = build_banking_tools(lambda: context)
        self.assertEqual({tool.__name__ for tool in tools}, BANKING_TOOL_NAMES)
        self.assertEqual(len(tools), len(BANKING_TOOL_NAMES))
        for tool in tools:
            self.assertNotIn("session_id", tool.__annotations__)

    def test_customer_summary_exposes_safe_beneficiary_directory(self):
        summary = self.service.get_customer_summary()
        vikram = next(item for item in summary["beneficiaries"] if item["display_name"] == "Vikram")
        self.assertEqual(vikram["id"], "BEN-VIKRAM")
        self.assertEqual(vikram["availability"], "AVAILABLE")
        self.assertNotIn("upi_id", vikram)
        mule = next(item for item in summary["beneficiaries"] if item["id"] == "BEN-FASTCASH")
        self.assertEqual(mule["availability"], "BLOCKED")

    def pay_bill_with_approval(self, context, bill_id="BILL-TATA-001", account="ACC-SAL-001", amount_minor=None):
        result = self.service.propose_bill_payment(context, bill_id, account, amount_minor=amount_minor)
        if result["status"] != "CHALLENGE_REQUIRED":
            return result
        return self.service.approve_challenge(result["challenge"]["id"], result["challenge"]["transaction_digest"])

    def test_partial_bill_payment_reduces_balance_and_leaves_remaining_due(self):
        bill = self.repo.get_bill("BILL-TATA-001")
        self.assertEqual(bill["amount_minor"], 243000)
        self.assertEqual(bill["status"], "DUE")
        before_balance = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]

        context = self.context("Pay ₹2,000 for Tata Power bill")
        res = self.pay_bill_with_approval(context, amount_minor=200000)
        self.assertEqual(res["status"], "EXECUTED")
        self.assertEqual(res["receipt"]["amount_minor"], 200000)

        after_balance = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]
        self.assertEqual(before_balance - after_balance, 200000)

        updated_bill = self.repo.get_bill("BILL-TATA-001")
        self.assertEqual(updated_bill["amount_minor"], 43000)
        self.assertEqual(updated_bill["status"], "DUE")

    def test_bill_payment_always_needs_customer_approval(self):
        result = self.service.propose_bill_payment(self.context("Pay my Tata Power electricity bill"), "BILL-TATA-001", "ACC-SAL-001")
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertEqual(self.record(result)["risk_score"], 0)  # low risk still needs the customer's own approval
        self.assertEqual(self.repo.get_bill("BILL-TATA-001")["status"], "DUE")

    def test_daily_limit_counts_money_already_moved_today(self):
        self.repo.transaction(lambda data: data["delegations"]["DLG-BANKING-001"].update({"max_daily_minor": 300000}))
        self.assertEqual(self.pay_bill_with_approval(self.context("Pay my Tata Power electricity bill"))["status"], "EXECUTED")
        self.assertEqual(self.sentinel.spent_today_minor(CUSTOMER_ID), 243000)
        second = self.service.propose_transfer(self.context("Transfer ₹1,000 to Vikram"), "BEN-VIKRAM", 100000, "ACC-SAL-001")
        self.assertEqual(second["status"], "DENIED")  # 2,430 + 1,000 exceeds the 3,000 daily limit
        self.assertIn("DELEGATION_SCOPE_EXCEEDED", self.record(second)["reason_codes"])

    def test_known_bill_allows_executes_once_and_replays_receipt(self):
        context = self.context("Pay my Tata Power electricity bill")
        before = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]
        results = [self.pay_bill_with_approval(context) for _ in range(5)]
        references = {result["receipt"]["reference"] for result in results}
        self.assertEqual(references.__len__(), 1)
        self.assertIn("KNOWN_RECURRING_BILL", self.repo.snapshot()["sentinel_decisions"][0]["reason_codes"])
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["available_balance_minor"], before - 243000)
        self.assertEqual(len([t for t in self.repo.snapshot()["transactions"] if t.get("reference") in references]), 1)
        self.assertEqual(self.repo.get_bill("BILL-TATA-001")["status"], "PAID")

    def test_concurrent_identical_bill_has_one_ledger_effect(self):
        context = self.context("Pay my Tata Power electricity bill")
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.pay_bill_with_approval(context), range(4)))
        refs = {result.get("receipt", {}).get("reference") for result in results}
        self.assertEqual(len(refs), 1)
        self.assertEqual(len([t for t in self.repo.snapshot()["transactions"] if t.get("reference") in refs]), 1)

    def test_reviewed_source_account_cannot_be_substituted(self):
        context = self.context("Transfer ₹75000 to Vikram")
        context["intent"]["fields"]["source_account_id"] = "ACC-SAL-001"
        before = self.repo.dashboard()["total_available_minor"]
        result = self.service.propose_transfer(context, "BEN-VIKRAM", 7500000, "ACC-SAV-002")
        self.assertEqual(result["sentinel"]["decision"], "DENY")
        self.assertIn("INTENT_SOURCE_MISMATCH", self.record(result)["reason_codes"])
        self.assertEqual(self.repo.dashboard()["total_available_minor"], before)

    def test_high_value_new_beneficiary_requires_bound_approval(self):
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertEqual(result["sentinel"]["decision"], "CHALLENGE")
        self.assertEqual(self.record(result)["risk_score"], 60)
        self.assertIn("HIGH_VALUE_TRANSFER", self.record(result)["reason_codes"])
        payment = self.repo.get_payment_intent(result["challenge"]["id"].replace("CHL", "PAYINT"))
        self.assertIsNone(payment)  # IDs are intentionally unrelated and unguessable.

    def test_transfer_above_75000_opens_trusted_approval_challenge(self):
        result = self.service.propose_transfer(
            self.context("Transfer ₹90,000 to Vikram"), "BEN-VIKRAM", 9_000_000, "ACC-SAL-001"
        )
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertEqual(result["presentation"]["type"], "PAYMENT_CHALLENGE")
        self.assertEqual(result["challenge"]["amount_minor"], 9_000_000)
        approved = self.service.approve_challenge(result["challenge"]["id"], result["challenge"]["transaction_digest"]
        )
        self.assertEqual(approved["status"], "EXECUTED")
        self.assertEqual(approved["receipt"]["amount_minor"], 9_000_000)

    def test_approval_reevaluates_and_executes_exactly_once(self):
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        challenge = result["challenge"]
        approved = self.service.approve_challenge(challenge["id"], challenge["transaction_digest"])
        replay = self.service.approve_challenge(challenge["id"], challenge["transaction_digest"])
        self.assertEqual(approved["status"], "EXECUTED")
        self.assertEqual(approved["receipt"]["reference"], replay["receipt"]["reference"])
        self.assertEqual(len([t for t in self.repo.snapshot()["transactions"] if t.get("reference") == approved["receipt"]["reference"]]), 1)

    def test_kyc_blocked_attempts_do_not_count_toward_velocity(self):
        self.repo.update_kyc_status(CUSTOMER_ID, "NOT_DONE")
        for amount in (500_000, 600_000, 700_000):
            blocked = self.service.propose_transfer(self.context(f"Transfer ₹{amount // 100:,} to Vikram"), "BEN-VIKRAM", amount, "ACC-SAL-001")
            self.assertEqual(self.record(blocked)["reason_codes"], ["KYC_NON_COMPLIANT"])
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        self.assertEqual(result["status"], "CHALLENGE_REQUIRED")
        self.assertNotIn("VELOCITY_LIMIT", self.record(result)["reason_codes"])

    def test_repeated_real_payment_attempts_still_trigger_velocity(self):
        for amount in (100_000, 110_000, 120_000):
            self.service.propose_transfer(self.context(f"Transfer ₹{amount // 100:,} to Vikram"), "BEN-VIKRAM", amount, "ACC-SAL-001")
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        self.assertIn("VELOCITY_LIMIT", self.record(result)["reason_codes"])

    def test_challenge_digest_tampering_denied_without_debit(self):
        before = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        denied = self.service.approve_challenge(result["challenge"]["id"], "changed-digest")
        self.assertEqual(denied["status"], "DENIED")
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["available_balance_minor"], before)

    def test_stored_parameters_cannot_change_after_challenge(self):
        before_salary = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]
        before_savings = self.repo.get_account("ACC-SAV-002")["available_balance_minor"]
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        challenge = result["challenge"]
        challenge_row = self.repo.get_challenge(challenge["id"])
        self.repo.transaction(lambda data: next(p for p in data["payment_intents"] if p["id"] == challenge_row["payment_intent_id"])["action"].update({"source_account_id": "ACC-SAV-002"}))
        denied = self.service.approve_challenge(challenge["id"], challenge["transaction_digest"])
        self.assertEqual(denied["status"], "DENIED")
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["available_balance_minor"], before_salary)
        self.assertEqual(self.repo.get_account("ACC-SAV-002")["available_balance_minor"], before_savings)

    def test_expired_challenge_cannot_execute(self):
        result = self.service.propose_transfer(self.context("Transfer ₹75,000 to Vikram"), "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        challenge = result["challenge"]
        expired = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
        self.repo.transaction(lambda data: next(c for c in data["challenges"] if c["id"] == challenge["id"]).update({"expires_at": expired}))
        response = self.service.approve_challenge(challenge["id"], challenge["transaction_digest"])
        self.assertEqual(response["status"], "EXPIRED")

    def test_intent_mismatch_and_mule_are_hard_denies(self):
        context = self.context("Pay my Tata Power electricity bill")
        mismatch = self.service.propose_transfer(context, "BEN-FASTCASH", 4_500_000, "ACC-SAL-001")
        self.assertEqual(mismatch["status"], "DENIED")
        self.assertIn("INTENT_ACTION_MISMATCH", self.record(mismatch)["reason_codes"])
        self.assertIn("KNOWN_MULE_DESTINATION", self.record(mismatch)["reason_codes"])

    def test_ambiguous_transfer_needs_clarification(self):
        result = self.service.propose_transfer(self.context("Transfer money to Vikram"), "BEN-VIKRAM", 100_000, "ACC-SAL-001")
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("INTENT_INCOMPLETE", self.record(result)["reason_codes"])

    def test_poisoned_replay_is_explainable_and_non_mutating(self):
        before = self.repo.get_account("ACC-SAL-001")["available_balance_minor"]
        result = self.service.replay_scenario("prompt-injection", "attack-session")
        self.assertEqual(result["status"], "DENY")
        self.assertIn("SUSPECTED_INDIRECT_PROMPT_INJECTION", self.record(result)["reason_codes"])
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["available_balance_minor"], before)

    def test_new_device_and_velocity_raise_score(self):
        context = self.context("Transfer ₹8,000 to Vikram", device="DEVICE-NEW-99")
        for _ in range(2):
            self.service.propose_transfer(context, "BEN-VIKRAM", 800_000, "ACC-SAL-001")
        result = self.service.propose_transfer(context, "BEN-VIKRAM", 800_000, "ACC-SAL-001")
        self.assertIn("NEW_DEVICE", self.record(result)["reason_codes"])
        self.assertIn("VELOCITY_LIMIT", self.record(result)["reason_codes"])

    def test_revoked_delegation_denies(self):
        self.repo.transaction(lambda data: data["delegations"]["DLG-BANKING-001"].update({"status": "REVOKED"}))
        result = self.service.propose_bill_payment(self.context("Pay my Tata Power electricity bill"), "BILL-TATA-001", "ACC-SAL-001")
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("DELEGATION_SCOPE_EXCEEDED", self.record(result)["reason_codes"])

    def test_expired_delegation_denies(self):
        self.repo.transaction(lambda data: data["delegations"]["DLG-BANKING-001"].update({"expires_at": "2020-01-01T00:00:00Z"}))
        result = self.service.propose_bill_payment(self.context("Pay my Tata Power electricity bill"), "BILL-TATA-001", "ACC-SAL-001")
        self.assertEqual(result["status"], "DENIED")
        self.assertIn("DELEGATION_SCOPE_EXCEEDED", self.record(result)["reason_codes"])

    def test_insufficient_funds_has_no_partial_state(self):
        self.repo.transaction(lambda data: data["accounts"]["ACC-SAL-001"].update({"balance_minor": 100, "available_balance_minor": 100}))
        initial_transactions = len(self.repo.snapshot()["transactions"])
        result = self.pay_bill_with_approval(self.context("Pay my Tata Power electricity bill"))
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(self.repo.get_account("ACC-SAL-001")["available_balance_minor"], 100)
        self.assertEqual(self.repo.get_bill("BILL-TATA-001")["status"], "DUE")
        self.assertEqual(len(self.repo.snapshot()["transactions"]), initial_transactions)

    def test_same_idempotency_key_with_changed_amount_denies(self):
        context = self.context("Transfer ₹75,000 to Vikram")
        first = self.service.propose_transfer(context, "BEN-VIKRAM", 7_500_000, "ACC-SAL-001")
        approved = self.service.approve_challenge(first["challenge"]["id"], first["challenge"]["transaction_digest"])
        changed = self.service.propose_transfer(context, "BEN-VIKRAM", 7_400_000, "ACC-SAL-001")
        self.assertEqual(changed["status"], "DENIED")
        self.assertIn("IDEMPOTENCY_CONFLICT", self.record(changed)["reason_codes"])
        self.assertEqual(len([t for t in self.repo.snapshot()["transactions"] if t.get("reference") == approved["receipt"]["reference"]]), 1)

    def test_corrupt_store_fails_closed(self):
        broken = Path(self.temp.name) / "broken-seed.json"
        broken.write_text("{not-json", encoding="utf-8")
        with self.assertRaises(RuntimeError):
            BankingDatabase(Path(self.temp.name) / "broken-store.json", broken)
        self.assertEqual(broken.read_text(encoding="utf-8"), "{not-json")

    def test_token_wrong_digest_and_reuse_are_denied(self):
        context = self.context("Pay my Tata Power electricity bill")
        bill = self.repo.get_bill("BILL-TATA-001")
        action = {"action_type": "PAY_BILL", "source_account_id": "ACC-SAL-001", "beneficiary_id": bill["biller_id"],
                  "bill_id": bill["id"], "amount_minor": bill["amount_minor"], "currency": "INR"}
        payment = self.service._create_payment_intent(context, action)
        decision = self.sentinel.evaluate({**self.service._context(context, payment), "step_up_verified": True})
        self.assertFalse(self.sentinel.verify_token(decision["authorization_token"], "wrong")[0])
        self.service._execute_payment(payment, decision, decision["authorization_token"])
        self.assertFalse(self.sentinel.verify_token(decision["authorization_token"], decision["request_digest"])[0])

    def test_multi_turn_transfer_intent_resolution(self):
        sess = "MULTI-TURN-TEST-SESS"
        turn1 = self.resolver.resolve("transfer 10k to rahul", sess, "turn-1", "CUST-1002")
        self.assertEqual(turn1["action_family"], "TRANSFER")
        self.assertEqual(turn1["fields"]["amount_minor"], 1_000_000)
        self.assertEqual(turn1["fields"]["beneficiary_id"], "BEN-RAHUL")

        turn2 = self.resolver.resolve("High Yield Term Deposit", sess, "turn-2", "CUST-1002")
        self.assertEqual(turn2["action_family"], "TRANSFER")
        self.assertEqual(turn2["fields"]["amount_minor"], 1_000_000)
        self.assertEqual(turn2["fields"]["beneficiary_id"], "BEN-RAHUL")
        self.assertEqual(turn2["fields"]["source_account_id"], "ACC-FD-104")

    def test_verified_kyc_compliance_check_detail_indicates_good_standing(self):
        self.repo.update_kyc_status(CUSTOMER_ID, "VERIFIED")
        context = self.context("Transfer ₹75,000 to Vikram")
        action = {
            "action_type": "TRANSFER",
            "amount_minor": 7_500_000,
            "beneficiary_id": "BEN-VIKRAM",
            "source_account_id": "ACC-SAL-001",
        }
        proposal_ctx = {
            **context,
            "action": action,
            "delegation": self.repo.get_delegation(CUSTOMER_ID),
            "device": self.repo.get_device("DEVICE-KNOWN-01"),
        }
        res = self.sentinel.evaluate(proposal_ctx, persist=False)
        kyc_check = next(c for c in res["checks"] if c["name"] == "Regulatory KYC compliance")
        self.assertEqual(kyc_check["status"], "PASS")
        self.assertIn("in good standing", kyc_check["detail"])
        self.assertNotIn("restricted", kyc_check["detail"])


if __name__ == "__main__":
    unittest.main()
