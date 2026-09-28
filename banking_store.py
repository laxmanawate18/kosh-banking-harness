"""Banking state <-> typed tables.

The domain code keeps working on one state dict (`db.snapshot()`, `db.transaction(mutator)`); this module loads that
dict from the typed bank_* tables and writes back only the rows a transaction changed. Collections without a
dedicated table (policy config, cheque books, standing instructions, anything new) live in bank_documents.

Ordering: every collection reads back in its list/dict order (seq), including rows added with insert(0).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from sqlalchemy import delete, func, select

from persistence import (
    BankAccountRecord, BankBeneficiaryRecord, BankBillRecord, BankCardRecord, BankChallengeRecord, BankCustomerRecord,
    BankDelegationRecord, BankDeviceRecord, BankDocumentRecord, BankIdempotencyRecord, BankIntentRecord,
    BankPaymentIntentRecord, BankPreferenceRecord, BankSecurityAlertRecord, BankSentinelDecisionRecord,
    BankStateAuditRecord, BankTransactionRecord,
)

TYPED_MARKER = {"schema_version": 2, "storage": "typed"}  # banking_state row 1 is now only the lock/version row


def _time(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def _int(value: Any) -> Optional[int]:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


@dataclass(frozen=True)
class Spec:
    model: Any
    kind: str                      # "dict": {id: record}; "list": [record, ...]
    columns: Callable[[Dict[str, Any]], Dict[str, Any]]
    key: str = "id"


SPECS: Dict[str, Spec] = {
    "customers": Spec(BankCustomerRecord, "dict", lambda r: dict(display_name=r.get("display_name"), email=r.get("email"),
                                                              tier=r.get("tier"), kyc_status=(r.get("kyc") or {}).get("status"))),
    "accounts": Spec(BankAccountRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), type=r.get("type"), status=r.get("status"),
                                                            currency=r.get("currency"), balance_minor=_int(r.get("balance_minor")),
                                                            available_balance_minor=_int(r.get("available_balance_minor")))),
    "cards": Spec(BankCardRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), account_id=r.get("account_id"),
                                                      type=r.get("type"), status=r.get("status"))),
    "bills": Spec(BankBillRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), biller_id=r.get("biller_id"), status=r.get("status"),
                                                      amount_minor=_int(r.get("amount_minor")), due_date=r.get("due_date"))),
    "beneficiaries": Spec(BankBeneficiaryRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), kind=r.get("kind"),
                                                                     risk_status=r.get("risk_status"))),
    "delegations": Spec(BankDelegationRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), agent_id=r.get("agent_id"),
                                                                  status=r.get("status"))),
    "devices": Spec(BankDeviceRecord, "dict", lambda r: dict(customer_id=r.get("customer_id"), status=r.get("status"))),
    "preferences": Spec(BankPreferenceRecord, "dict", lambda r: dict(whatsapp_updates=bool(r.get("whatsapp_updates")),
                                                                  marketing_offers=bool(r.get("marketing_offers"))), key="customer_id"),
    "transactions": Spec(BankTransactionRecord, "list", lambda r: dict(customer_id=r.get("customer_id"), account_id=r.get("account_id"),
                                                                    created_at=_time(r.get("created_at")), category=r.get("category"),
                                                                    amount_minor=_int(r.get("amount_minor")), status=r.get("status"))),
    "security_alerts": Spec(BankSecurityAlertRecord, "list", lambda r: dict(customer_id=r.get("customer_id"), card_id=r.get("card_id"),
                                                                         severity=r.get("severity"), status=r.get("status"))),
    "intents": Spec(BankIntentRecord, "list", lambda r: dict(customer_id=r.get("customer_id"), session_id=r.get("session_id"),
                                                          status=r.get("status"))),
    "payment_intents": Spec(BankPaymentIntentRecord, "list", lambda r: dict(customer_id=r.get("customer_id"), session_id=r.get("session_id"),
                                                                         action=(r.get("action") or {}).get("action_type") if isinstance(r.get("action"), dict) else r.get("action"),
                                                                         status=r.get("status"))),
    "sentinel_decisions": Spec(BankSentinelDecisionRecord, "list", lambda r: dict(payment_intent_id=r.get("payment_intent_id"),
                                                                               decision=r.get("decision"), policy_version=r.get("policy_version"))),
    "challenges": Spec(BankChallengeRecord, "list", lambda r: dict(payment_intent_id=r.get("payment_intent_id"), status=r.get("status"))),
    "idempotency_records": Spec(BankIdempotencyRecord, "list", lambda r: {}, key="key"),
    "audit_events": Spec(BankStateAuditRecord, "list", lambda r: dict(customer_id=r.get("customer_id"), event_type=r.get("event_type"),
                                                                   created_at=_time(r.get("created_at")))),
}
_HEADER = ""  # bank_documents row saying a collection exists and its shape: {"kind": "dict"|"list"|"value", "value": ...}


def _pk(spec: Spec, record: Any, index: int) -> str:
    return str(record.get(spec.key)) if isinstance(record, dict) and record.get(spec.key) is not None else f"#{index}"


def load(session) -> Dict[str, Any]:
    state: Dict[str, Any] = {"schema_version": 2}
    generic: Dict[str, list] = {}
    for row in session.scalars(select(BankDocumentRecord).order_by(BankDocumentRecord.collection, BankDocumentRecord.seq)):
        generic.setdefault(row.collection, []).append(row)
    for name, spec in SPECS.items():
        if name not in generic:  # the header row records that the collection exists, even when empty
            continue
        model = spec.model
        if spec.kind == "dict":
            state[name] = {row_key(model, r): r.data for r in session.scalars(select(model).order_by(model.seq))}
        else:
            state[name] = [r.data for r in session.scalars(select(model).order_by(model.seq))]
    for name, rows in generic.items():
        if name in SPECS:
            continue
        header = next((r.data for r in rows if r.key == _HEADER), {"kind": "dict"})
        items = [r for r in rows if r.key != _HEADER]
        if header["kind"] == "value":
            state[name] = header.get("value")
        elif header["kind"] == "list":
            state[name] = [r.data for r in items]
        else:
            state[name] = {r.key: r.data for r in items}
    return state


def row_key(model, row) -> str:
    return row.customer_id if model is BankPreferenceRecord else row.id


def _save_typed(session, name: str, spec: Spec, before: Any, after: Any) -> None:
    model = spec.model
    old = {_pk(spec, r, i): r for i, r in enumerate(before.values() if isinstance(before, dict) else before or [])}
    items = list(after.items()) if isinstance(after, dict) else list(enumerate(after or []))
    new: Dict[str, Any] = {}
    for key, record in items:
        pk = key if spec.kind == "dict" and isinstance(after, dict) else _pk(spec, record, key)
        if str(pk) in new:
            raise RuntimeError(f"Duplicate {name} key {pk}")
        new[str(pk)] = record
    gone = [k for k in old if k not in new]
    if gone:
        column = model.customer_id if model is BankPreferenceRecord else model.id
        session.execute(delete(model).where(column.in_(gone)))
    # New rows keep their list position: rows placed before every existing row (insert(0)) go below the lowest
    # seq, the rest go above the highest. Dict collections always append.
    keys = list(new)
    first_old = next((i for i, k in enumerate(keys) if k in old), len(keys))
    added = [k for k in keys if k not in old]
    front = [k for k in added if keys.index(k) < first_old] if old and spec.kind == "list" else []
    seqs: Dict[str, int] = {}
    if added:
        low = session.scalar(select(func.min(model.seq))) or 0
        high = session.scalar(select(func.max(model.seq))) or 0
        seqs.update({k: low - len(front) + i for i, k in enumerate(front)})
        seqs.update({k: high + 1 + i for i, k in enumerate(k for k in added if k not in seqs)})
    for pk, record in new.items():
        if pk in old and old[pk] == record:
            continue
        cols = spec.columns(record) if isinstance(record, dict) else {}
        row = session.get(model, pk)
        if row is None:
            row = model(**({"customer_id": pk} if model is BankPreferenceRecord else {"id": pk}), seq=seqs[pk])
            session.add(row)
        for column, value in cols.items():
            setattr(row, column, None if isinstance(value, (dict, list)) else value)  # columns are projections; data is the record
        row.data = record


def _save_generic(session, name: str, before: Any, after: Any) -> None:
    if before == after:
        return
    session.execute(delete(BankDocumentRecord).where(BankDocumentRecord.collection == name))
    # ponytail: generic collections are small (config, cheque books, standing instructions); rewritten whole on change
    kind = "dict" if isinstance(after, dict) else "list" if isinstance(after, list) else "value"
    session.add(BankDocumentRecord(collection=name, key=_HEADER, seq=0, data={"kind": kind, "value": after if kind == "value" else None}))
    entries = after.items() if kind == "dict" else enumerate(after) if kind == "list" else []
    for seq, (key, value) in enumerate(entries, start=1):
        session.add(BankDocumentRecord(collection=name, key=str(key) if kind == "dict" else f"{seq:08d}", seq=seq, data=value))


def save(session, before: Dict[str, Any], after: Dict[str, Any]) -> None:
    """Write the difference between two states: only changed rows are touched."""
    for name in set(before) | set(after):
        if name == "schema_version":
            continue
        if name in SPECS:
            _save_typed(session, name, SPECS[name], before.get(name), after.get(name))
            if (name in before) != (name in after):
                session.execute(delete(BankDocumentRecord).where(BankDocumentRecord.collection == name))
                if name in after:
                    session.add(BankDocumentRecord(collection=name, key=_HEADER, seq=0, data={"kind": SPECS[name].kind}))
        elif name not in after:
            session.execute(delete(BankDocumentRecord).where(BankDocumentRecord.collection == name))
        else:
            _save_generic(session, name, before.get(name), after[name])


def replace(session, state: Dict[str, Any]) -> None:
    """Replace the whole banking state (seed, reset, migration from the legacy JSON record)."""
    for spec in SPECS.values():
        session.execute(delete(spec.model))
    session.execute(delete(BankDocumentRecord))
    session.flush()
    save(session, {}, json.loads(json.dumps(state)))
