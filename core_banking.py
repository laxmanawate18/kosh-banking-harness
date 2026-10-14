"""Core banking boundary: the only place where Kosh changes money or card state in the bank's system of record.

Kosh decides (Sentinel, Kavach approval, officer queue); the core posts. A real bank implements `CoreBanking` for its
core (Finacle, FLEXCUBE, ...) and selects it with CORE_BANKING_ADAPTER. Every call carries Kosh's idempotency key, so a
retried or replayed post never moves money twice, and `reconcile` compares Kosh's records with the core's journal.

`MockCoreBanking` is the demo core: it keeps balances, transactions and its own posting journal in Kosh's database.
Account opening already reaches the core through the RPA worker (rpa/), which drives the core's maker screens.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Protocol

from banking_db import BankingDatabase, new_id, utc_now


class CoreBanking(Protocol):
    name: str

    def post_payment(self, posting: Dict[str, Any]) -> Dict[str, Any]:
        """Debit the source account for a Kosh-approved payment. Idempotent on posting["idempotency_key"].
        Raises ValueError (e.g. insufficient funds) or PermissionError (e.g. blocked destination) when the core refuses."""

    def set_card_status(self, card_id: str, status: str, *, idempotency_key: str, reason: str) -> Dict[str, Any]:
        """Change a card's status (FROZEN). Idempotent on idempotency_key."""

    def postings(self) -> Dict[str, Dict[str, Any]]:
        """The core's journal of Kosh postings by idempotency key (a real core would page this by date)."""


class MockCoreBanking:
    name = "mock-core"

    def __init__(self, database: BankingDatabase):
        self.db = database

    def post_payment(self, posting: Dict[str, Any]) -> Dict[str, Any]:
        key = posting["idempotency_key"]

        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            journal = data.setdefault("core_postings", {})
            if key in journal:
                return journal[key]
            source = data["accounts"].get(posting["source_account_id"])
            amount = int(posting["amount_minor"])
            if not source or source.get("status") != "ACTIVE":
                raise ValueError("Source account unavailable")
            if source.get("available_balance_minor", 0) < amount:
                raise ValueError("Insufficient funds")
            reference = new_id("TXNREF")
            transaction = {"id": new_id("TXN"), "customer_id": posting["customer_id"], "account_id": source["id"],
                           "created_at": utc_now(), "amount_minor": -amount, "currency": "INR",
                           "beneficiary_id": posting.get("beneficiary_id"), "status": "COMPLETED", "reference": reference}
            if posting["action_type"] == "PAY_BILL":
                bill = data["bills"].get(posting["bill_id"])
                if not bill or bill.get("status") != "DUE":
                    raise ValueError("Bill is no longer payable")
                if bill["biller_id"] != posting["beneficiary_id"]:
                    raise PermissionError("BILL_BINDING_MISMATCH")
                if amount > bill["amount_minor"]:
                    raise ValueError("Payment amount exceeds outstanding bill balance")
                if amount < bill["amount_minor"]:
                    bill["amount_minor"] -= amount
                    bill["status"] = "DUE"
                    bill["last_payment_reference"] = reference
                else:
                    bill.update(status="PAID", paid_at=utc_now(), payment_reference=reference)
                transaction.update(description=f"BBPS • {bill['biller_name']}", category="UTILITIES")
                payee_name = bill["biller_name"]
            else:
                beneficiary = data["beneficiaries"].get(posting["beneficiary_id"])
                if not beneficiary or beneficiary.get("risk_status") == "BLOCKED_MULE":
                    raise PermissionError("KNOWN_MULE_DESTINATION")
                beneficiary["relationship"] = "TRUSTED"
                transaction.update(description=f"UPI • {beneficiary['display_name']}", category="P2P_TRANSFER")
                payee_name = beneficiary["display_name"]
            source["balance_minor"] -= amount
            source["available_balance_minor"] -= amount
            data.setdefault("transactions", []).insert(0, transaction)
            journal[key] = {"core_reference": reference, "status": "POSTED", "posted_at": utc_now(), "amount_minor": amount,
                            "source_account_id": source["id"], "customer_id": posting["customer_id"], "payee_name": payee_name,
                            "source_account_name": source["name"], "source_account_masked": source["account_number_masked"],
                            "remaining_balance_minor": source["available_balance_minor"], "kosh_payment_id": posting["payment_id"]}
            return journal[key]
        return self.db.transaction(mutate)

    def set_card_status(self, card_id: str, status: str, *, idempotency_key: str, reason: str) -> Dict[str, Any]:
        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            journal = data.setdefault("core_postings", {})
            card = data["cards"][card_id]
            if idempotency_key not in journal:
                from backend import ontology
                curr_status = card.get("status", "ACTIVE")
                valid, err = ontology.validate_transition("obj.card", curr_status, status)
                if not valid:
                    raise ValueError(f"ILLEGAL_CARD_STATE_TRANSITION: {err}")
                card.update(status=status, frozen_reason=reason[:160], frozen_at=utc_now())
                journal[idempotency_key] = {"core_reference": new_id("CARDREF"), "status": "POSTED", "posted_at": utc_now(),
                                            "card_id": card_id, "card_status": status, "amount_minor": 0}
            return dict(card)
        return self.db.transaction(mutate)

    def postings(self) -> Dict[str, Dict[str, Any]]:
        return dict(self.db.snapshot().get("core_postings", {}))


ADAPTERS = {"mock": MockCoreBanking}


def core_for(database: BankingDatabase) -> CoreBanking:
    name = os.getenv("CORE_BANKING_ADAPTER", "mock")
    if name not in ADAPTERS:
        raise RuntimeError(f"Unknown CORE_BANKING_ADAPTER {name!r}; available: {sorted(ADAPTERS)}")
    return ADAPTERS[name](database)


def reconcile(database: BankingDatabase, core: CoreBanking, *, stale_after_seconds: int = 120) -> Dict[str, Any]:
    """Match Kosh's money records with the core's journal. Settles payments left mid-post (core answered, Kosh did not
    record it, or the post never reached the core) and reports any mismatch for an officer to investigate."""
    postings = core.postings()
    payments = [p for p in database.snapshot().get("payment_intents", [])
                if (p.get("action") or {}).get("action_type") in {"PAY_BILL", "TRANSFER"}]
    stale_before = datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)
    issues: List[Dict[str, Any]] = []
    settled: List[Dict[str, Any]] = []
    legacy = 0
    for payment in payments:
        key, status = payment["idempotency_key"], payment.get("status")
        posting = postings.get(key)
        if status == "EXECUTED":
            if not (payment.get("receipt") or {}).get("core_adapter"):
                legacy += 1  # executed before the core boundary existed; the mock ledger has no journal entry for it
                continue
            if not posting:
                issues.append({"type": "EXECUTED_NOT_POSTED", "payment_id": payment["id"], "key": key})
            elif posting["amount_minor"] != int(payment["action"]["amount_minor"]) or posting["source_account_id"] != payment["action"]["source_account_id"]:
                issues.append({"type": "AMOUNT_OR_ACCOUNT_MISMATCH", "payment_id": payment["id"], "key": key})
        elif status == "FAILED" and posting:  # e.g. a slow core posted after Kosh gave up: money moved, Kosh says it did not
            issues.append({"type": "POSTED_BUT_MARKED_FAILED", "payment_id": payment["id"], "key": key,
                           "core_reference": posting["core_reference"]})
        elif status == "POSTING" and datetime.fromisoformat(payment["updated_at"].replace("Z", "+00:00")) < stale_before:
            outcome = _settle(database, core, payment, posting)
            settled.append({"payment_id": payment["id"], "outcome": outcome})
    kosh_keys = {p["idempotency_key"] for p in payments}
    for key, posting in postings.items():
        if posting.get("kosh_payment_id") and key not in kosh_keys:
            issues.append({"type": "POSTED_WITHOUT_KOSH_PAYMENT", "key": key, "core_reference": posting["core_reference"]})
    report = {"at": utc_now(), "adapter": core.name, "payments_checked": len(payments), "legacy_skipped": legacy,
              "settled": settled, "issues": issues, "balanced": not issues}
    database.append_audit("RECONCILIATION_RUN", actor="system", severity="INFO" if not issues else "CRITICAL",
                          summary=f"Reconciliation: {len(issues)} issue(s), {len(settled)} settled", details=report)
    return report


def _settle(database: BankingDatabase, core: CoreBanking, payment: Dict[str, Any], posting: Optional[Dict[str, Any]]) -> str:
    def mutate(data: Dict[str, Any]) -> str:
        stored = next(p for p in data["payment_intents"] if p["id"] == payment["id"])
        if stored.get("status") != "POSTING":
            return "ALREADY_SETTLED"
        stored["updated_at"] = utc_now()
        if posting:  # the core posted it: record the receipt Kosh never wrote
            stored["status"] = "EXECUTED"
            stored["receipt"] = {"reference": posting["core_reference"], "payment_intent_id": stored["id"],
                                 "action_type": stored["action"]["action_type"], "amount_minor": posting["amount_minor"],
                                 "currency": "INR", "payee_name": posting.get("payee_name"), "executed_at": posting["posted_at"],
                                 "status": "COMPLETED", "core_adapter": core.name, "settled_by_reconciliation": True}
            return "RECORDED_AS_EXECUTED"
        stored["status"] = "FAILED"  # never reached the core: no money moved
        return "MARKED_FAILED_NOT_POSTED"
    return database.transaction(mutate)
