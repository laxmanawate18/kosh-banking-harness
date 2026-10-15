"""The hard money limits in sentinel.limit_checks: the daily amount, what a new payee may receive, and the cap after a contact change.

They run on a plain state dict, so they test the rules themselves. The same function runs again when a payment is posted."""
import unittest
from datetime import datetime, timedelta, timezone

from sentinel import limit_checks, money_out_today_minor

CUSTOMER = "CUST-1001"
DELEGATION = {"max_daily_minor": 20_000_000}


def iso(delta: timedelta = timedelta(0)) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat().replace("+00:00", "Z")


def transfer(amount: int, payee: str = "BEN-NEW", payment_id: str = "PAYINT-THIS") -> dict:
    return {"action_type": "TRANSFER", "beneficiary_id": payee, "amount_minor": amount, "source_account_id": "ACC-SAL-001"}


def paid(payment_id: str, amount: int, payee: str = "BEN-NEW", status: str = "EXECUTED", at: str | None = None) -> dict:
    return {"id": payment_id, "customer_id": CUSTOMER, "status": status, "created_at": at or iso(), "updated_at": at or iso(),
            "action": {"action_type": "TRANSFER", "beneficiary_id": payee, "amount_minor": amount}}


def state(payee_age: timedelta = timedelta(hours=1), payments=(), contact_changed: str | None = None) -> dict:
    customer = {"id": CUSTOMER, **({"contact_changed_at": contact_changed} if contact_changed else {})}
    return {"customers": {CUSTOMER: customer}, "payment_intents": list(payments),
            "beneficiaries": {"BEN-NEW": {"id": "BEN-NEW", "customer_id": CUSTOMER, "created_at": iso(-payee_age)}}}


def failed(checks: list) -> list:
    return [c["reason"] for c in checks if not c["ok"]]


def run(st: dict, action: dict) -> list:
    return limit_checks(st, customer_id=CUSTOMER, action=action, delegation=DELEGATION, payment_id="PAYINT-THIS")


class NewPayeeLimit(unittest.TestCase):
    def test_a_new_payee_may_receive_up_to_the_limit_and_no_more(self):
        self.assertEqual(failed(run(state(), transfer(2_500_000))), [])  # exactly 25,000
        self.assertEqual(failed(run(state(), transfer(2_500_001))), ["NEW_PAYEE_LIMIT_EXCEEDED"])

    def test_the_limit_is_for_everything_sent_to_that_payee_not_per_payment(self):
        earlier = [paid("P1", 1_500_000)]
        self.assertEqual(failed(run(state(payments=earlier), transfer(1_000_000))), [])
        self.assertEqual(failed(run(state(payments=earlier), transfer(1_000_001))), ["NEW_PAYEE_LIMIT_EXCEEDED"])

    def test_a_payment_still_posting_counts_so_two_approvals_cannot_both_pass(self):
        posting = [paid("P1", 2_000_000, status="POSTING")]
        self.assertEqual(failed(run(state(payments=posting), transfer(600_000))), ["NEW_PAYEE_LIMIT_EXCEEDED"])

    def test_payments_awaiting_approval_or_refused_have_taken_nothing(self):
        waiting = [paid("P1", 2_000_000, status="PROPOSED"), paid("P2", 2_000_000, status="DENIED")]
        self.assertEqual(failed(run(state(payments=waiting), transfer(2_500_000))), [])

    def test_the_payment_being_checked_does_not_count_against_itself(self):
        itself = [paid("PAYINT-THIS", 2_500_000, status="POSTING")]
        self.assertEqual(failed(run(state(payments=itself), transfer(2_500_000))), [])

    def test_an_established_payee_has_no_cap_from_this_rule(self):
        self.assertEqual(failed(run(state(payee_age=timedelta(days=30)), transfer(9_000_000))), [])

    def test_the_cap_ends_with_the_cooling_window(self):
        self.assertEqual(failed(run(state(payee_age=timedelta(hours=23, minutes=59)), transfer(2_500_001))), ["NEW_PAYEE_LIMIT_EXCEEDED"])
        self.assertEqual(failed(run(state(payee_age=timedelta(hours=24, minutes=1)), transfer(2_500_001))), [])

    def test_bill_payments_are_not_capped_by_it(self):
        bill = {"action_type": "PAY_BILL", "beneficiary_id": "BEN-NEW", "amount_minor": 9_000_000, "bill_id": "BILL-1"}
        names = [c["name"] for c in run(state(), bill)]
        self.assertEqual(names, ["Delegated daily amount"])


class DailyLimit(unittest.TestCase):
    def test_the_daily_amount_counts_money_already_posting(self):
        st = state(payee_age=timedelta(days=30), payments=[paid("P1", 19_000_000, status="POSTING")])
        self.assertEqual(failed(run(st, transfer(1_000_001))), ["DELEGATION_SCOPE_EXCEEDED"])
        self.assertEqual(failed(run(st, transfer(1_000_000))), [])

    def test_money_moved_yesterday_does_not_count_today(self):
        old = [paid("P1", 19_000_000, at=iso(timedelta(days=-2)))]
        st = state(payee_age=timedelta(days=30), payments=old)
        self.assertEqual(money_out_today_minor(st, CUSTOMER), 0)

    def test_another_customers_payments_do_not_count(self):
        other = paid("P1", 19_000_000)
        other["customer_id"] = "CUST-1002"
        self.assertEqual(money_out_today_minor(state(payments=[other]), CUSTOMER), 0)


class ContactChange(unittest.TestCase):
    def test_after_a_mobile_or_email_change_transfers_are_capped_for_a_day(self):
        st = state(payee_age=timedelta(days=30), contact_changed=iso(timedelta(hours=-2)))
        self.assertEqual(failed(run(st, transfer(2_500_001))), ["RECENT_CONTACT_CHANGE"])
        self.assertEqual(failed(run(st, transfer(2_500_000))), [])

    def test_the_cap_counts_everything_sent_since_the_change(self):
        st = state(payee_age=timedelta(days=30), contact_changed=iso(timedelta(hours=-2)), payments=[paid("P1", 2_000_000, payee="BEN-OLD")])
        self.assertEqual(failed(run(st, transfer(600_000, payee="BEN-OLD"))), ["RECENT_CONTACT_CHANGE"])

    def test_the_cap_lifts_after_the_window(self):
        st = state(payee_age=timedelta(days=30), contact_changed=iso(timedelta(hours=-25)))
        self.assertEqual(failed(run(st, transfer(9_000_000))), [])


if __name__ == "__main__":
    unittest.main()
