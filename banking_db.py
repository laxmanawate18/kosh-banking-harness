"""PostgreSQL-backed repository for Kosh banking and audit state."""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypeVar

from sqlalchemy import delete, select

import banking_store
from banking_store import TYPED_MARKER
from persistence import (
    ApprovalActionRecord,
    AuditEventRecord,
    AuthSessionRecord,
    BankingStateRecord,
    BankingWorkflowRecord,
    ConsentRecord,
    ConversationRecord,
    CrossSellLeadRecord,
    DatabaseRuntime,
    DocumentRecord,
    OAuthGrantRecord,
    ServiceRequestRecord,
    UserRecord,
    WebSocketTicketRecord,
    utc_dt,
)



T = TypeVar("T")
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SEED_PATH = BASE_DIR / "data" / "banking_seed.json"


def utc_now() -> str:
    return utc_dt().isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def _parse_time(value: str | None) -> datetime:
    if not value:
        return utc_dt()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class BankingDatabase:
    """Atomic repository whose mutable domain snapshot lives in PostgreSQL JSONB.

    A single row is locked for each banking transaction, which keeps the existing
    deterministic policy engine simple while providing cross-process atomicity.
    High-volume CBS integrations would replace this adapter with typed tables and
    native prepare/commit calls without changing the Kosh contract.
    """

    def __init__(
        self,
        database_url: str | Path | None = None,
        seed_path: str | Path = DEFAULT_SEED_PATH,
    ) -> None:
        self.seed_path = Path(seed_path)
        if database_url is not None and "://" not in str(database_url):
            path = Path(database_url)
            path.parent.mkdir(parents=True, exist_ok=True)
            resolved_url = f"sqlite+pysqlite:///{path.with_suffix('.sqlite3').as_posix()}"
        else:
            resolved_url = str(database_url) if database_url else None
        self.runtime = DatabaseRuntime(resolved_url)
        self.runtime.initialize()
        self._lock = threading.RLock()
        self._ensure_seeded()

    def _seed(self) -> Dict[str, Any]:
        try:
            with self.seed_path.open("r", encoding="utf-8") as handle:
                seed = json.load(handle)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Banking seed is corrupt: {self.seed_path}") from exc
        if not isinstance(seed, dict) or seed.get("schema_version") != 2:
            raise RuntimeError("Unsupported banking seed schema")
        return seed

    def _ensure_seeded(self) -> None:
        with self._lock, self.runtime.sessions.begin() as session:
            row = session.execute(select(BankingStateRecord).where(BankingStateRecord.id == 1).with_for_update()).scalar_one_or_none()
            seed = copy.deepcopy(self._seed())
            if row is None:
                session.add(BankingStateRecord(id=1, schema_version=2, version=1, payload=dict(TYPED_MARKER)))
                session.flush()
                banking_store.replace(session, seed)
            else:
                if row.payload.get("storage") != "typed":  # one-time move off the legacy single JSON record
                    banking_store.replace(session, row.payload)
                    row.payload = dict(TYPED_MARKER)
                    row.version += 1
                payload = banking_store.load(session)
                before = copy.deepcopy(payload)
                changed = False
                if "customers" in seed:
                    payload.setdefault("customers", {})
                    for cid, cdata in seed["customers"].items():
                        if cid not in payload["customers"]:
                            payload["customers"][cid] = cdata
                            changed = True
                        elif "kyc" in cdata and "kyc" not in payload["customers"][cid]:
                            payload["customers"][cid]["kyc"] = copy.deepcopy(cdata["kyc"])
                            changed = True
                if "customer" in seed and "kyc" in seed["customer"] and "kyc" not in payload.get("customer", {}):
                    payload.setdefault("customer", {})
                    payload["customer"]["kyc"] = copy.deepcopy(seed["customer"]["kyc"])
                    changed = True
                for aid, adata in seed.get("accounts", {}).items():
                    if aid not in payload.get("accounts", {}):
                        payload.setdefault("accounts", {})[aid] = adata
                        changed = True
                for cid, cdata in seed.get("cards", {}).items():
                    if cid not in payload.get("cards", {}):
                        payload.setdefault("cards", {})[cid] = cdata
                        changed = True
                for bid, bdata in seed.get("bills", {}).items():
                    if bid not in payload.get("bills", {}):
                        payload.setdefault("bills", {})[bid] = bdata
                        changed = True
                for ben_id, ben_data in seed.get("beneficiaries", {}).items():
                    if ben_id not in payload.get("beneficiaries", {}):
                        payload.setdefault("beneficiaries", {})[ben_id] = ben_data
                        changed = True
                for did, ddata in seed.get("delegations", {}).items():
                    if did not in payload.get("delegations", {}):
                        payload.setdefault("delegations", {})[did] = ddata
                        changed = True
                for dev_id, dev_data in seed.get("devices", {}).items():
                    if dev_id not in payload.get("devices", {}):
                        payload.setdefault("devices", {})[dev_id] = dev_data
                        changed = True
                existing_tx_ids = {t["id"] for t in payload.get("transactions", [])}
                for t in seed.get("transactions", []):
                    if t["id"] not in existing_tx_ids:
                        payload.setdefault("transactions", []).append(t)
                        changed = True
                existing_alert_ids = {a["id"] for a in payload.get("security_alerts", [])}
                for a in seed.get("security_alerts", []):
                    if a["id"] not in existing_alert_ids:
                        payload.setdefault("security_alerts", []).append(a)
                        changed = True
                if changed:
                    banking_store.save(session, before, payload)
                    row.version += 1

    def _persist_audit(self, session: Any, event: Dict[str, Any]) -> None:
        existing = session.scalar(select(AuditEventRecord.sequence).where(AuditEventRecord.event_id == event["id"]))
        if existing is not None:
            return
        details = copy.deepcopy(event.get("details") or {})
        policy_version = details.get("policy_version")
        previous = session.scalar(select(AuditEventRecord).order_by(AuditEventRecord.sequence.desc()).limit(1))
        previous_hash = previous.integrity_hash if previous and previous.integrity_hash else "0" * 64
        canonical = json.dumps({"previous_hash": previous_hash, "event": event}, sort_keys=True,
                               separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        integrity_hash = hmac.new(os.getenv("SENTINEL_AUDIT_HMAC_KEY", "sentinel-demo-audit-key").encode("utf-8"),
                                  canonical, hashlib.sha256).hexdigest()
        session.add(
            AuditEventRecord(
                event_id=event["id"],
                session_id=event.get("session_id"),
                customer_id_token=hashlib.sha256(str(event.get("customer_id", "CUST-1001")).encode()).hexdigest()[:24],
                event_type=event.get("event_type", "UNKNOWN"),
                service_id=event.get("service_id"),
                actor=event.get("actor", "system"),
                model_version=event.get("model_version"),
                prompt_version=event.get("prompt_version"),
                policy_version=event.get("policy_version") or policy_version,
                consent_id=event.get("consent_id"),
                approval_request_id=event.get("approval_request_id"),
                approver_id=event.get("approver_id"),
                severity=event.get("severity", "INFO"),
                summary=event.get("summary", ""),
                details=details,
                previous_hash=previous_hash,
                integrity_hash=integrity_hash,
                created_at=_parse_time(event.get("created_at")),
            )
        )

    def reset_to_seed(self) -> Dict[str, Any]:
        seed = copy.deepcopy(self._seed())
        with self._lock, self.runtime.sessions.begin() as session:
            row = self._lock_state(session)
            banking_store.replace(session, seed)
            row.version += 1
            row.updated_at = utc_dt()
        return self.dashboard()

    @staticmethod
    def _lock_state(session: Any) -> BankingStateRecord:
        # ponytail: one lock row serialises every banking write; per-customer locks if write throughput matters
        return session.execute(select(BankingStateRecord).where(BankingStateRecord.id == 1).with_for_update()).scalar_one()

    def snapshot(self) -> Dict[str, Any]:
        # A snapshot must never see half a transaction: one REPEATABLE READ read on Postgres; on SQLite (one
        # process) the process lock keeps writers out while the tables are read.
        if self.runtime.engine.dialect.name == "postgresql":
            with self.runtime.sessions() as session:
                session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
                return banking_store.load(session)
        with self._lock, self.runtime.sessions() as session:
            return banking_store.load(session)

    def open_state(self, session: Any) -> Dict[str, Any]:
        """Lock and load the state inside the caller's session; finish with save_state(session, before, after)."""
        self._lock_state(session)
        return banking_store.load(session)

    def save_state(self, session: Any, before: Dict[str, Any], after: Dict[str, Any]) -> None:
        if after.get("schema_version") != 2:
            raise RuntimeError("Banking transaction attempted to change schema")
        banking_store.save(session, before, after)
        row = self._lock_state(session)
        row.version += 1
        row.updated_at = utc_dt()
        existing_audit_ids = {item.get("id") for item in before.get("audit_events", [])}
        for event in after.get("audit_events", []):
            if event.get("id") not in existing_audit_ids:
                self._persist_audit(session, event)

    def transaction(self, mutator: Callable[[Dict[str, Any]], T]) -> T:
        with self._lock, self.runtime.sessions.begin() as session:
            before = self.open_state(session)
            candidate = copy.deepcopy(before)
            result = mutator(candidate)
            self.save_state(session, before, candidate)
            return copy.deepcopy(result)

    def get_customer(self, customer_id: str = "CUST-1001") -> Optional[Dict[str, Any]]:
        snapshot = self.snapshot()
        customers = snapshot.get("customers", {})
        if customer_id in customers:
            return customers[customer_id]
        customer = snapshot.get("customer", {})
        return customer if customer.get("id") == customer_id else None

    def get_accounts(self, customer_id: str = "CUST-1001") -> List[Dict[str, Any]]:
        return [a for a in self.snapshot().get("accounts", {}).values() if a.get("customer_id") == customer_id]

    def get_account(self, account_id: str) -> Optional[Dict[str, Any]]:
        return self.snapshot().get("accounts", {}).get(account_id.upper())

    def get_cards(self, customer_id: str = "CUST-1001") -> List[Dict[str, Any]]:
        return [c for c in self.snapshot().get("cards", {}).values() if c.get("customer_id") == customer_id]

    def get_card(self, card_id: str) -> Optional[Dict[str, Any]]:
        return self.snapshot().get("cards", {}).get(card_id.upper())

    def get_bills(self, customer_id: str = "CUST-1001", due_only: bool = True) -> List[Dict[str, Any]]:
        bills = [b for b in self.snapshot().get("bills", {}).values() if b.get("customer_id") == customer_id]
        return [b for b in bills if b.get("status") == "DUE"] if due_only else bills

    def get_bill(self, bill_id: str) -> Optional[Dict[str, Any]]:
        return self.snapshot().get("bills", {}).get(bill_id.upper())

    def get_beneficiary(self, beneficiary_id: str) -> Optional[Dict[str, Any]]:
        return self.snapshot().get("beneficiaries", {}).get(beneficiary_id.upper())

    def get_transactions(self, customer_id: str = "CUST-1001", account_id: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        txns = [t for t in self.snapshot().get("transactions", []) if t.get("customer_id") == customer_id and (not account_id or t.get("account_id") == account_id.upper())]
        txns.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return txns[: max(1, min(int(limit), 50))]

    def get_security_alerts(self, customer_id: str = "CUST-1001") -> List[Dict[str, Any]]:
        return [a for a in self.snapshot().get("security_alerts", []) if a.get("customer_id") == customer_id]

    def get_delegation(self, customer_id: str = "CUST-1001") -> Optional[Dict[str, Any]]:
        return next((d for d in self.snapshot().get("delegations", {}).values() if d.get("customer_id") == customer_id), None)

    def get_kyc_profile(self, customer_id: str = "CUST-1001") -> Dict[str, Any]:
        customer = self.get_customer(customer_id) or {}
        kyc = copy.deepcopy(customer.get("kyc") or {
            "status": "VERIFIED",
            "due_date": "2028-01-01",
            "risk_category": "LOW",
            "pan_masked": "••••••••••",
            "aadhaar_masked": "•••• •••• ••••",
            "address": customer.get("city", "India"),
            "pending_requirements": [],
        })
        # KYC changes are explicit workflow/officer actions. A read must never
        # turn a newer pending dossier into VERIFIED from an older approval.
        return kyc

    def update_kyc_profile(self, customer_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            target = None
            if "customers" in data and customer_id in data["customers"]:
                target = data["customers"][customer_id]
            elif data.get("customer", {}).get("id") == customer_id:
                target = data["customer"]
            if not target:
                raise KeyError(f"Customer {customer_id} not found")
            target.setdefault("kyc", {})
            target["kyc"].update(updates)
            target["kyc"]["updated_at"] = utc_now()
            return target["kyc"]
        return self.transaction(mutate)

    def update_kyc_status(self, customer_id: str, status: str) -> Dict[str, Any]:
        updates = {"status": status}
        if status == "VERIFIED":
            updates["account_restrictions"] = []
            updates["pending_requirements"] = []
        elif status == "NOT_DONE":
            updates["account_restrictions"] = ["OUTWARD_TRANSFERS_BLOCKED", "DEBIT_CARD_RESTRICTED"]
        return self.update_kyc_profile(customer_id, updates)

    def reset_kyc(self, customer_id: str = "CUST-1001") -> Dict[str, Any]:
        try:
            with self.runtime.sessions.begin() as session:
                session.execute(
                    delete(ServiceRequestRecord).where(
                        ServiceRequestRecord.customer_id == customer_id,
                        ServiceRequestRecord.service_id == "P1-17",
                    )
                )
        except Exception:
            pass

        initial_kyc = {
            "status": "NOT_DONE",
            "kyc_type": "INITIAL_KYC",
            "due_date": "2026-09-15",
            "risk_category": "HIGH",
            "pan_masked": "UNVERIFIED",
            "aadhaar_masked": "UNVERIFIED",
            "address": "12B, Sea Green Apartments, Worli, Mumbai, Maharashtra 400018",
            "occupation": "Not Specified",
            "annual_income_slab": "15L_TO_50L",
            "is_pep": False,
            "last_verified_at": None,
            "pending_request_id": None,
            "pending_requirements": [
                "Original PAN Card Scan & Live OCR Verification",
                "Aadhaar / Address Proof Document Upload",
                "Live Face Selfie / Liveness Verification",
                "Customer Regulatory & FATCA Declaration",
            ],
            "account_restrictions": [
                "OUTWARD_TRANSFERS_BLOCKED",
                "DEBIT_CARD_RESTRICTED",
                "High-Value Transactions Blocked",
            ],
        }
        return self.update_kyc_profile(customer_id, initial_kyc)

    def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        return self.snapshot().get("devices", {}).get(device_id)

    def get_intent(self, intent_id: str) -> Optional[Dict[str, Any]]:
        return next((i for i in self.snapshot().get("intents", []) if i.get("id") == intent_id), None)

    def get_payment_intent(self, payment_intent_id: str) -> Optional[Dict[str, Any]]:
        return next((i for i in self.snapshot().get("payment_intents", []) if i.get("id") == payment_intent_id), None)

    def get_challenge(self, challenge_id: str) -> Optional[Dict[str, Any]]:
        return next((c for c in self.snapshot().get("challenges", []) if c.get("id") == challenge_id), None)

    def get_idempotency(self, key: str) -> Optional[Dict[str, Any]]:
        return next((i for i in self.snapshot().get("idempotency_records", []) if i.get("key") == key), None)

    def append_audit(self, event_type: str, *, session_id: Optional[str] = None, intent_id: Optional[str] = None,
                     decision_id: Optional[str] = None, summary: str = "", details: Optional[Dict[str, Any]] = None,
                     severity: str = "INFO", actor: str = "system", service_id: Optional[str] = None,
                     consent_id: Optional[str] = None, approval_request_id: Optional[str] = None,
                     approver_id: Optional[str] = None, model_version: Optional[str] = None,
                     prompt_version: Optional[str] = None, policy_version: Optional[str] = None) -> Dict[str, Any]:
        event = {
            "id": new_id("AUD"), "event_type": event_type, "session_id": session_id,
            "intent_id": intent_id, "decision_id": decision_id, "summary": summary,
            "details": details or {}, "severity": severity, "actor": actor, "service_id": service_id,
            "consent_id": consent_id, "approval_request_id": approval_request_id, "approver_id": approver_id,
            "model_version": model_version, "prompt_version": prompt_version, "policy_version": policy_version,
            "created_at": utc_now(),
        }
        self.transaction(lambda data: data.setdefault("audit_events", []).append(event))
        return event

    def get_audit_events(self, session_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        with self.runtime.sessions() as session:
            statement = select(AuditEventRecord)
            if session_id:
                statement = statement.where(AuditEventRecord.session_id == session_id)
            rows = session.scalars(statement.order_by(AuditEventRecord.sequence.desc()).limit(max(1, min(limit, 250)))).all()
            return [{
                "id": row.event_id, "event_type": row.event_type, "session_id": row.session_id,
                "summary": row.summary, "details": row.details, "severity": row.severity,
                "service_id": row.service_id, "actor": row.actor, "consent_id": row.consent_id,
                "approval_request_id": row.approval_request_id, "approver_id": row.approver_id,
                "model_version": row.model_version, "prompt_version": row.prompt_version,
                "policy_version": row.policy_version,
                "previous_hash": row.previous_hash, "integrity_hash": row.integrity_hash,
                "created_at": row.created_at.isoformat().replace("+00:00", "Z"),
            } for row in rows]

    def dashboard(self, customer_id: str = "CUST-1001") -> Dict[str, Any]:
        snap = self.snapshot()
        customers = snap.get("customers", {})
        customer = customers.get(customer_id) or (snap.get("customer") if snap.get("customer", {}).get("id") == customer_id else None) or snap.get("customer", {})
        accounts = [a for a in snap.get("accounts", {}).values() if a.get("customer_id") == customer_id]
        cards = [c for c in snap.get("cards", {}).values() if c.get("customer_id") == customer_id]
        bills = [b for b in snap.get("bills", {}).values() if b.get("customer_id") == customer_id]
        security_alerts = [a for a in snap.get("security_alerts", []) if a.get("customer_id") == customer_id]
        txns = [t for t in snap.get("transactions", []) if t.get("customer_id") == customer_id]
        txns.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return {
            "customer": customer, "accounts": accounts, "cards": cards,
            "bills": bills, "security_alerts": security_alerts,
            "recent_transactions": txns[:6],
            "total_available_minor": sum(a.get("available_balance_minor", 0) for a in accounts),
            "currency": "INR", "simulation": True
        }

    # Conversation persistence belongs in the same database as domain state.
    def list_conversations(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self.runtime.sessions() as session:
            statement = select(ConversationRecord)
            if user_id:
                statement = statement.where(ConversationRecord.user_id == user_id)
            rows = session.scalars(statement.order_by(ConversationRecord.updated_at.desc())).all()
            return [self._conversation_dict(row, include_content=False) for row in rows]

    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        with self.runtime.sessions() as session:
            row = session.get(ConversationRecord, conversation_id)
            return self._conversation_dict(row, include_content=True) if row else None

    def save_conversation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.runtime.sessions.begin() as session:
            row = session.get(ConversationRecord, data["id"])
            now = utc_dt()
            if row is None:
                row = ConversationRecord(id=data["id"], user_id=data.get("user_id"), customer_id=data.get("customer_id"),
                                         title=data.get("title", "New Chat"), product=data.get("product", "sentinel-v2"),
                                         messages=copy.deepcopy(data.get("messages", [])), traces=copy.deepcopy(data.get("traces", [])),
                                         created_at=datetime.fromtimestamp(data.get("created_at", now.timestamp()), timezone.utc), updated_at=now)
                session.add(row)
            else:
                row.title = data.get("title", row.title)
                row.messages = copy.deepcopy(data.get("messages", []))
                row.traces = copy.deepcopy(data.get("traces", []))
                row.updated_at = now
            return self._conversation_dict(row, include_content=True)

    def delete_conversation(self, conversation_id: str, user_id: Optional[str] = None) -> bool:
        with self.runtime.sessions.begin() as session:
            row = session.get(ConversationRecord, conversation_id)
            if not row or (user_id and row.user_id != user_id):
                return False
            session.delete(row)
            return True

    @staticmethod
    def _conversation_dict(row: ConversationRecord, include_content: bool) -> Dict[str, Any]:
        result = {"id": row.id, "title": row.title, "product": row.product, "user_id": row.user_id,
                  "customer_id": row.customer_id, "created_at": row.created_at.timestamp(),
                  "updated_at": row.updated_at.timestamp(), "message_count": len(row.messages or [])}
        if include_content:
            result.update({"messages": copy.deepcopy(row.messages or []), "traces": copy.deepcopy(row.traces or [])})
        return result


    def onboard_customer_with_product(
        self,
        product: Dict[str, Any],
        full_name: str,
        phone_number: str,
        username: str,
        email: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Atomically create a new customer record, accounts, cards, and starting bonus."""
        prod_id = product.get("id", "PROD-SAV-PREMIER")
        initial_deposit = product.get("initial_deposit", 100000)
        initial_limit = product.get("initial_credit_limit", 15000000)

        def _mutate(payload: Dict[str, Any]) -> tuple[Dict[str, Any], Dict[str, Any]]:
            customers = payload.setdefault("customers", {})
            accounts = payload.setdefault("accounts", {})
            cards = payload.setdefault("cards", {})
            transactions = payload.setdefault("transactions", [])
            audit_events = payload.setdefault("audit_events", [])

            # Generate new customer ID
            existing_cids = [int(cid.split("-")[1]) for cid in customers.keys() if cid.startswith("CUST-") and cid.split("-")[1].isdigit()]
            next_num = (max(existing_cids) + 1) if existing_cids else 1003
            cust_id = f"CUST-{next_num}"

            display_name = full_name.strip()
            first_name = display_name.split()[0] if display_name else "Valued"

            customer_record = {
                "id": cust_id,
                "first_name": first_name,
                "full_name": display_name,
                "display_name": display_name,
                "phone_number": phone_number,
                "phone_masked": "+91 ••••• " + phone_number[-5:],
                "email": email or f"{username}@kosh.bank",
                "city": "Mumbai",
                "status": "ACTIVE",
                "tier": "Personal",
                "member_since": utc_now()[:10],
                "normal_transfer_minor": 800000,
                "primary_device_id": f"DEVICE-{cust_id}",
                "relationship_tier": "PREMIER" if ("PREMIER" in prod_id or "OBSIDIAN" in prod_id) else "STANDARD",
                "kyc": {
                    "status": "NOT_DONE",
                    "kyc_type": "INITIAL_KYC",
                    "due_date": "2029-01-01",
                    "risk_category": "LOW",
                    "pan_masked": "UNVERIFIED",
                    "aadhaar_masked": "UNVERIFIED",
                    "address": "",
                    "pending_requirements": ["Identity document", "Address proof", "Customer declarations", "Bank verification"],
                    "account_restrictions": ["OUTWARD_TRANSFERS_BLOCKED", "DEBIT_CARD_RESTRICTED"],
                },
            }
            customers[cust_id] = customer_record

            # Primary Savings Account
            acc_num = f"{next_num}012345"
            acc_id = f"ACC-SAV-{next_num}"
            dep_amount = initial_deposit if product.get("category") == "savings" else 50000
            prod_title = product.get("title", "Kosh Suvarna Savings")
            primary_account = {
                "id": acc_id,
                "customer_id": cust_id,
                "account_number": acc_num,
                "account_number_masked": f"•••• {acc_num[-4:]}",
                "name": prod_title,
                "account_name": prod_title,
                "type": "SAVINGS",
                "account_type": "SAVINGS",
                "currency": "INR",
                "balance_minor": dep_amount,
                "available_balance_minor": dep_amount,
                "ledger_balance_minor": dep_amount,
                "status": "ACTIVE",
                "is_primary": True,
                "created_at": utc_now(),
            }
            accounts[acc_id] = primary_account
            payload.setdefault("devices", {})[f"DEVICE-{cust_id}"] = {
                "id": f"DEVICE-{cust_id}", "customer_id": cust_id, "status": "NEW",
                "first_seen_at": utc_now(), "label": "New customer device"}
            payload.setdefault("delegations", {})[f"DLG-{cust_id}"] = {
                "id": f"DLG-{cust_id}", "customer_id": cust_id, "agent_id": "banking-agent-v1", "status": "ACTIVE",
                "allowed_actions": ["READ_ACCOUNTS", "READ_TRANSACTIONS", "READ_BILLS", "READ_ALERTS", "PAY_BILL", "TRANSFER", "FREEZE_CARD"],
                "allowed_accounts": [acc_id], "max_autonomous_bill_minor": 500000,
                "max_daily_minor": 20000000, "expires_at": "2027-12-31T23:59:59Z"}

            # Cards
            card_id = f"CARD-{uuid.uuid4().hex[:8].upper()}"
            is_credit = product.get("category") == "cards"
            card_tier = "OBSIDIAN" if "OBSIDIAN" in prod_id else ("NEO" if "CASHBACK" in prod_id else "PLATINUM")
            card_record = {
                "id": card_id,
                "customer_id": cust_id,
                "account_id": acc_id,
                "card_number_masked": f"•••• •••• •••• {uuid.uuid4().int % 9000 + 1000}",
                "card_type": "CREDIT" if is_credit else "DEBIT",
                "card_tier": card_tier,
                "cardholder_name": display_name.upper(),
                "expiry": "12/29",
                "status": "ACTIVE",
                "daily_limit_minor": 20000000,
                "international_enabled": True,
                "online_tx_enabled": True,
                "contactless_enabled": True,
                "credit_limit_minor": initial_limit if is_credit else None,
                "available_credit_minor": initial_limit if is_credit else None,
            }
            cards[card_id] = card_record

            # Welcome credit transaction
            txn_id = f"TXN-WELCOME-{uuid.uuid4().hex[:8].upper()}"
            welcome_txn = {
                "id": txn_id,
                "customer_id": cust_id,
                "account_id": acc_id,
                "direction": "CREDIT",
                "amount_minor": primary_account["available_balance_minor"],
                "currency": "INR",
                "counterparty": "KOSH WELCOME REWARD",
                "reference": f"WELCOME-{cust_id}",
                "category": "salary",
                "description": f"Welcome reward credit: {product.get('title')}",
                "created_at": utc_now(),
                "status": "SETTLED",
            }
            transactions.append(welcome_txn)

            # Audit event
            audit_id = f"AUDIT-ONBOARD-{uuid.uuid4().hex[:8].upper()}"
            audit_events.append({
                "id": audit_id,
                "event_type": "CUSTOMER_ONBOARDED_SALES_AI",
                "actor": "kosh_mitra",
                "customer_id": cust_id,
                "created_at": utc_now(),
                "details": {
                    "product_id": prod_id,
                    "product_title": product.get("title"),
                    "account_id": acc_id,
                    "card_id": card_id,
                    "phone_number": phone_number,
                    "username": username,
                }
            })

            result_data = {
                "customer_id": cust_id,
                "full_name": display_name,
                "account_id": acc_id,
                "account_number": acc_num,
                "card_id": card_id,
                "card_masked": card_record["card_number_masked"],
                "initial_balance_minor": primary_account["available_balance_minor"],
                "credit_limit_minor": card_record.get("credit_limit_minor"),
                "product_title": product.get("title"),
            }
            return result_data

        return self.transaction(_mutate)

    def record_lead(
        self,
        customer_id: Optional[str],
        session_id: Optional[str],
        category: str,
        sub_type: Optional[str] = None,
        amount_requested_minor: Optional[int] = None,
        tenure_months: Optional[int] = None,
        employment_type: Optional[str] = None,
        monthly_income_minor: Optional[int] = None,
        preferences: Optional[Dict[str, Any]] = None,
        status: str = "QUALIFIED",
        recommended_product_id: Optional[str] = None,
        special_offer_note: Optional[str] = None,
        follow_up_pitch: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record or update a customer sales inquiry / lead in the relational store."""
        lead_id = f"LEAD-{uuid.uuid4().hex[:8].upper()}"
        prefs = preferences or {}
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            existing = None
            if customer_id:
                existing = session.scalar(
                    select(CrossSellLeadRecord).where(
                        CrossSellLeadRecord.customer_id == customer_id,
                        CrossSellLeadRecord.category == category.upper(),
                        CrossSellLeadRecord.status.notin_(["CONVERTED", "DECLINED"]),
                    ).order_by(CrossSellLeadRecord.created_at.desc())
                )
            if existing:
                if sub_type:
                    existing.sub_type = sub_type
                if amount_requested_minor is not None:
                    existing.amount_requested_minor = amount_requested_minor
                if tenure_months is not None:
                    existing.tenure_months = tenure_months
                if employment_type:
                    existing.employment_type = employment_type
                if monthly_income_minor is not None:
                    existing.monthly_income_minor = monthly_income_minor
                if preferences:
                    updated_prefs = dict(existing.preferences)
                    updated_prefs.update(preferences)
                    existing.preferences = updated_prefs
                if status:
                    existing.status = status
                if recommended_product_id:
                    existing.recommended_product_id = recommended_product_id
                if special_offer_note:
                    existing.special_offer_note = special_offer_note
                if follow_up_pitch:
                    existing.follow_up_pitch = follow_up_pitch
                if notes:
                    existing.notes = f"{existing.notes}\n{notes}".strip() if existing.notes else notes
                existing.updated_at = now
                target = existing
            else:
                lead = CrossSellLeadRecord(
                    id=lead_id,
                    customer_id=customer_id,
                    session_id=session_id,
                    category=category.upper(),
                    sub_type=sub_type,
                    amount_requested_minor=amount_requested_minor,
                    tenure_months=tenure_months,
                    employment_type=employment_type,
                    monthly_income_minor=monthly_income_minor,
                    preferences=prefs,
                    status=status,
                    recommended_product_id=recommended_product_id,
                    special_offer_note=special_offer_note,
                    follow_up_pitch=follow_up_pitch,
                    notes=notes,
                    created_at=now,
                    updated_at=now,
                )
                session.add(lead)
                target = lead

            lead_dict = {
                "id": target.id,
                "customer_id": target.customer_id,
                "session_id": target.session_id,
                "category": target.category,
                "sub_type": target.sub_type,
                "amount_requested_minor": target.amount_requested_minor,
                "tenure_months": target.tenure_months,
                "employment_type": target.employment_type,
                "monthly_income_minor": target.monthly_income_minor,
                "preferences": target.preferences,
                "status": target.status,
                "recommended_product_id": target.recommended_product_id,
                "special_offer_note": target.special_offer_note,
                "follow_up_pitch": target.follow_up_pitch,
                "notes": target.notes,
                "created_at": target.created_at.isoformat(),
                "updated_at": target.updated_at.isoformat(),
            }
        return lead_dict

    def get_active_leads_for_customer(self, customer_id: str) -> List[Dict[str, Any]]:
        """Retrieve active unconverted leads for return-login follow-ups."""
        with self.runtime.sessions() as session:
            rows = session.scalars(
                select(CrossSellLeadRecord).where(
                    CrossSellLeadRecord.customer_id == customer_id,
                    CrossSellLeadRecord.status.notin_(["CONVERTED", "DECLINED"]),
                ).order_by(CrossSellLeadRecord.created_at.desc())
            ).all()
            return [
                {
                    "id": r.id,
                    "customer_id": r.customer_id,
                    "session_id": r.session_id,
                    "category": r.category,
                    "sub_type": r.sub_type,
                    "amount_requested_minor": r.amount_requested_minor,
                    "tenure_months": r.tenure_months,
                    "employment_type": r.employment_type,
                    "monthly_income_minor": r.monthly_income_minor,
                    "preferences": r.preferences,
                    "status": r.status,
                    "recommended_product_id": r.recommended_product_id,
                    "special_offer_note": r.special_offer_note,
                    "follow_up_pitch": r.follow_up_pitch,
                    "notes": r.notes,
                    "created_at": r.created_at.isoformat(),
                    "updated_at": r.updated_at.isoformat(),
                }
                for r in rows
            ]

    def get_lead(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single lead by its ID."""
        with self.runtime.sessions() as session:
            row = session.get(CrossSellLeadRecord, lead_id)
            if not row:
                return None
            return {
                "id": row.id,
                "customer_id": row.customer_id,
                "session_id": row.session_id,
                "category": row.category,
                "sub_type": row.sub_type,
                "amount_requested_minor": row.amount_requested_minor,
                "tenure_months": row.tenure_months,
                "employment_type": row.employment_type,
                "monthly_income_minor": row.monthly_income_minor,
                "preferences": row.preferences,
                "status": row.status,
                "recommended_product_id": row.recommended_product_id,
                "special_offer_note": row.special_offer_note,
                "follow_up_pitch": row.follow_up_pitch,
                "notes": row.notes,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }

    def update_lead_status(
        self,
        lead_id: str,
        status: str,
        notes: Optional[str] = None,
        customer_id: Optional[str] = None,
        preferences: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a lead's stage, customer response, and optional customer_id / preferences."""
        with self.runtime.sessions.begin() as session:
            row = session.get(CrossSellLeadRecord, lead_id)
            if not row:
                return None
            row.status = status
            if customer_id:
                row.customer_id = customer_id
            if preferences:
                updated_pref = dict(row.preferences or {})
                updated_pref.update(preferences)
                row.preferences = updated_pref
            if notes:
                row.notes = f"{row.notes}\n{notes}".strip() if row.notes else notes
            row.updated_at = utc_dt()
            return {
                "id": row.id,
                "customer_id": row.customer_id,
                "category": row.category,
                "status": row.status,
                "notes": row.notes,
                "preferences": row.preferences,
            }

    def list_leads(self, status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """List recent captured leads for bank officer CRM."""
        with self.runtime.sessions() as session:
            query = select(CrossSellLeadRecord)
            if status:
                query = query.where(CrossSellLeadRecord.status == status)
            query = query.order_by(CrossSellLeadRecord.created_at.desc()).limit(limit)
            rows = session.scalars(query).all()
            return [
                {
                    "id": r.id,
                    "customer_id": r.customer_id,
                    "session_id": r.session_id,
                    "category": r.category,
                    "sub_type": r.sub_type,
                    "amount_requested_minor": r.amount_requested_minor,
                    "tenure_months": r.tenure_months,
                    "employment_type": r.employment_type,
                    "monthly_income_minor": r.monthly_income_minor,
                    "preferences": r.preferences,
                    "status": r.status,
                    "recommended_product_id": r.recommended_product_id,
                    "special_offer_note": r.special_offer_note,
                    "follow_up_pitch": r.follow_up_pitch,
                    "notes": r.notes,
                    "created_at": r.created_at.isoformat(),
                    "updated_at": r.updated_at.isoformat(),
                }
                for r in rows
            ]

    def list_customers_summary(self) -> List[Dict[str, Any]]:
        """List all onboarded customers with accounts, balances, and digital user bindings."""
        snapshot = self.snapshot()
        customers_dict = snapshot.get("customers", {})
        accounts_dict = snapshot.get("accounts", {})
        cards_dict = snapshot.get("cards", {})

        user_map: Dict[str, Dict[str, Any]] = {}
        with self.runtime.sessions() as session:
            users = session.scalars(select(UserRecord)).all()
            for u in users:
                if u.customer_id:
                    user_map[u.customer_id] = {
                        "user_id": u.id,
                        "username": u.username,
                        "phone_number": u.phone_number,
                        "display_name": u.display_name,
                        "role": u.role,
                        "active": u.active,
                    }

        result = []
        for cust_id, cust in customers_dict.items():
            cust_accounts = [a for a in accounts_dict.values() if a.get("customer_id") == cust_id]
            primary_acc = next((a for a in cust_accounts if a.get("is_primary")), cust_accounts[0] if cust_accounts else None)
            total_balance_minor = sum(int(a.get("balance_minor") or a.get("available_balance_minor") or 0) for a in cust_accounts)

            cust_cards = [c for c in cards_dict.values() if c.get("customer_id") == cust_id]
            primary_card = cust_cards[0] if cust_cards else None
            user_info = user_map.get(cust_id, {})

            phone = user_info.get("phone_number") or cust.get("phone_number") or ""
            phone_masked = f"{phone[:3]} ••••• {phone[-5:]}" if len(phone) >= 10 else phone

            result.append({
                "id": cust_id,
                "customer_id": cust_id,
                "full_name": cust.get("full_name") or cust.get("display_name") or user_info.get("display_name") or "Customer",
                "phone_number": phone,
                "phone_masked": phone_masked,
                "email": cust.get("email") or "",
                "username": user_info.get("username") or "",
                "user_id": user_info.get("user_id") or "",
                "tier": cust.get("relationship_tier") or cust.get("tier") or "STANDARD",
                "status": cust.get("status") or "ACTIVE",
                "primary_account_number": primary_acc.get("account_number") if primary_acc else "N/A",
                "primary_account_id": primary_acc.get("id") if primary_acc else None,
                "account_count": len(cust_accounts),
                "total_balance_minor": total_balance_minor,
                "total_balance_formatted": f"₹{total_balance_minor / 100:,.2f}",
                "primary_card_masked": primary_card.get("card_number_masked") if primary_card else None,
                "member_since": cust.get("member_since") or "",
                "kyc_status": (cust.get("kyc") or {}).get("status") or "NOT_DONE",
            })

        result.sort(key=lambda x: x["customer_id"], reverse=True)
        return result

    def wipe_customer(self, customer_id: str, phone_number: Optional[str] = None) -> Dict[str, Any]:
        """Completely wipe out a customer profile, user logins, credentials, accounts, and leads."""
        cleaned_users: List[Dict[str, Any]] = []
        with self.runtime.sessions.begin() as session:
            # 1. Gather all users by customer_id or phone_number
            query = select(UserRecord).where(UserRecord.customer_id == customer_id)
            users = list(session.scalars(query).all())
            if phone_number:
                for pu in session.scalars(select(UserRecord).where(UserRecord.phone_number == phone_number)).all():
                    if pu not in users:
                        users.append(pu)

            # 2. Delete associated auth & chat records for each user
            for user in users:
                cleaned_users.append({
                    "id": user.id,
                    "username": user.username,
                    "phone": user.phone_number,
                    "customer_id": user.customer_id,
                })
                uid = user.id
                session.execute(delete(OAuthGrantRecord).where(OAuthGrantRecord.user_id == uid))
                session.execute(delete(WebSocketTicketRecord).where(WebSocketTicketRecord.user_id == uid))
                session.execute(delete(AuthSessionRecord).where(AuthSessionRecord.user_id == uid))
                session.execute(delete(ConversationRecord).where(ConversationRecord.user_id == uid))
                session.execute(delete(BankingWorkflowRecord).where(BankingWorkflowRecord.user_id == uid))
                session.delete(user)

            # 3. Clean records tied directly to customer_id & their service requests
            session.execute(delete(ConsentRecord).where(ConsentRecord.customer_id == customer_id))
            session.execute(delete(ConversationRecord).where(ConversationRecord.customer_id == customer_id))
            session.execute(delete(BankingWorkflowRecord).where(BankingWorkflowRecord.customer_id == customer_id))

            req_ids = list(session.scalars(select(ServiceRequestRecord.id).where(ServiceRequestRecord.customer_id == customer_id)).all())
            if req_ids:
                session.execute(delete(ApprovalActionRecord).where(ApprovalActionRecord.request_id.in_(req_ids)))
                session.execute(delete(DocumentRecord).where(DocumentRecord.request_id.in_(req_ids)))
                session.execute(delete(ServiceRequestRecord).where(ServiceRequestRecord.id.in_(req_ids)))


            # 4. Clean leads matching customer_id or phone_number
            for lead in session.scalars(select(CrossSellLeadRecord).where(CrossSellLeadRecord.customer_id == customer_id)).all():
                session.delete(lead)
            if phone_number:
                for lead in session.scalars(select(CrossSellLeadRecord)).all():
                    if (lead.preferences or {}).get("phone_number") == phone_number:
                        session.delete(lead)

        # 5. Clean in-memory/JSON snapshot inside an atomic transaction
        def _mutate(payload: dict):
            customers = payload.setdefault("customers", {})
            accounts = payload.setdefault("accounts", {})
            cards = payload.setdefault("cards", {})
            bills = payload.setdefault("bills", {})
            devices = payload.setdefault("devices", {})
            delegations = payload.setdefault("delegations", {})

            removed_customer = customers.pop(customer_id, None)

            acc_ids = [aid for aid, acc in accounts.items() if acc.get("customer_id") == customer_id]
            for aid in acc_ids:
                accounts.pop(aid, None)

            card_ids = [cid for cid, card in cards.items() if card.get("customer_id") == customer_id]
            for cid in card_ids:
                cards.pop(cid, None)

            bill_ids = [bid for bid, bill in bills.items() if bill.get("customer_id") == customer_id]
            for bid in bill_ids:
                bills.pop(bid, None)

            dev_ids = [did for did, dev in devices.items() if dev.get("customer_id") == customer_id]
            for did in dev_ids:
                devices.pop(did, None)

            dlg_ids = [did for did, dlg in delegations.items() if dlg.get("customer_id") == customer_id]
            for did in dlg_ids:
                delegations.pop(did, None)

            payload["transactions"] = [
                t for t in payload.get("transactions", []) if t.get("customer_id") != customer_id
            ]

            return {
                "customer_id": customer_id,
                "removed_customer": removed_customer,
                "removed_accounts": acc_ids,
                "removed_cards": card_ids,
                "cleaned_users": cleaned_users,
            }

        res = self.transaction(_mutate)
        return res


db = BankingDatabase()
