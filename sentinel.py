"""Deterministic intent binding, fraud scoring, and authorization for the demo."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from backend import harness
from backend.settings import required_secret
from banking_db import BankingDatabase, db, new_id, utc_now


AGENT_ID = "banking-agent-v1"
CUSTOMER_ID = "CUST-1001"
KNOWN_DEVICE_ID = "DEVICE-KNOWN-01"
IST = ZoneInfo("Asia/Kolkata")


def _canonical_digest(payload: Dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _money_from_text(text: str) -> Optional[int]:
    lowered = text.lower()
    # Check for 'k' / thousand suffix, e.g. "10k", "10 k", "₹10k"
    k_match = re.search(r"(?:₹|inr|rs\.?|rupees?|\b)\s*([0-9]+(?:\.[0-9]+)?)\s*k\b", lowered)
    if k_match:
        return int(float(k_match.group(1)) * 1000 * 100)

    # Check for 'lakh' suffix, e.g. "1.5 lakh", "2 lakhs"
    lakh_match = re.search(r"(?:₹|inr|rs\.?|rupees?|\b)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lakhs|lac|lacs)\b", lowered)
    if lakh_match:
        return int(float(lakh_match.group(1)) * 100000 * 100)

    patterns = [
        r"₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        r"(?:inr|rs\.?|rupees?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        r"(?:transfer|send|pay)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, lowered, flags=re.IGNORECASE)
        if match:
            amount = match.group(1).replace(",", "")
            major, _, decimal = amount.partition(".")
            return int(major) * 100 + int((decimal + "00")[:2])
    return None


# ---- Limits that must hold when Sentinel decides AND again when the payment is posted -------------------------------------
_COUNTED = {"POSTING", "EXECUTED"}  # money moved or being posted; a payment still awaiting approval has taken nothing yet


def _when(value: Any) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _customer_in(state: Dict[str, Any], customer_id: Optional[str]) -> Dict[str, Any]:
    customers = state.get("customers", {})
    if customer_id in customers:
        return customers[customer_id]
    legacy = state.get("customer", {})
    return legacy if legacy.get("id") == customer_id else {}


def _amount_of(payment: Dict[str, Any]) -> int:
    receipt = payment.get("receipt") or {}
    return int(receipt.get("amount_minor") or (payment.get("action") or {}).get("amount_minor") or 0)


def _counted_payments(state: Dict[str, Any], customer_id: Optional[str], exclude: Optional[str]):
    for payment in state.get("payment_intents", []):
        action = payment.get("action") or {}
        if (payment.get("customer_id") == customer_id and payment.get("status") in _COUNTED and payment.get("id") != exclude
                and action.get("action_type") in {"PAY_BILL", "TRANSFER"}):
            yield payment, action


def money_out_today_minor(state: Dict[str, Any], customer_id: Optional[str], exclude: Optional[str] = None) -> int:
    """Money this customer has moved, or is posting, through the agent today (India calendar day)."""
    today = datetime.now(IST).date()
    total = 0
    for payment, _ in _counted_payments(state, customer_id, exclude):
        when = _when((payment.get("receipt") or {}).get("executed_at") or payment.get("updated_at") or payment.get("created_at"))
        if when and when.astimezone(IST).date() == today:
            total += _amount_of(payment)
    return total


def _transfers_since_minor(state: Dict[str, Any], customer_id: Optional[str], since: datetime, *, beneficiary_id: Optional[str] = None,
                           exclude: Optional[str] = None) -> int:
    total = 0
    for payment, action in _counted_payments(state, customer_id, exclude):
        if action.get("action_type") != "TRANSFER" or (beneficiary_id and action.get("beneficiary_id") != beneficiary_id):
            continue
        when = _when(payment.get("created_at"))
        if when and when >= since:
            total += _amount_of(payment)
    return total


def limit_checks(state: Dict[str, Any], *, customer_id: Optional[str], action: Dict[str, Any], delegation: Dict[str, Any],
                 payment_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """The hard money limits as check records: {name, ok, detail, reason}. Sentinel runs them to decide, and the payment runs
    them again, on the live state, in the transaction that claims the approval, so two approvals cannot both pass."""
    action_type = action.get("action_type")
    if action_type not in {"PAY_BILL", "TRANSFER"}:
        return []
    amount = action.get("amount_minor", 0)
    valid = isinstance(amount, int) and not isinstance(amount, bool) and amount > 0
    now = datetime.now(timezone.utc)
    checks: List[Dict[str, Any]] = []

    spent = money_out_today_minor(state, customer_id, payment_id)
    max_daily = int(delegation.get("max_daily_minor", 0))
    checks.append({"name": "Delegated daily amount", "ok": bool(valid and spent + amount <= max_daily), "reason": "DELEGATION_SCOPE_EXCEEDED",
                   "detail": f"Spent today {spent}; this payment {amount}; daily limit {max_daily}"})
    if action_type != "TRANSFER" or not valid:
        return checks

    beneficiary = state.get("beneficiaries", {}).get(str(action.get("beneficiary_id", "")).upper()) or {}
    added = _when(beneficiary.get("created_at"))
    cooling = timedelta(hours=float(harness.parameter("PARAM_NEW_PAYEE_COOLING_HOURS", 24)))
    if added and now - added < cooling:
        limit = int(harness.parameter("PARAM_NEW_PAYEE_LIMIT", 2500000))
        sent = _transfers_since_minor(state, customer_id, added, beneficiary_id=beneficiary.get("id"), exclude=payment_id)
        checks.append({"name": "New-payee limit", "ok": sent + amount <= limit, "reason": "NEW_PAYEE_LIMIT_EXCEEDED",
                       "detail": f"Payee added within {int(cooling.total_seconds() // 3600)} hours; already sent {sent}; this payment {amount}; limit {limit}"})

    changed = _when(_customer_in(state, customer_id).get("contact_changed_at"))
    window = timedelta(hours=float(harness.parameter("PARAM_CONTACT_CHANGE_COOLING_HOURS", 24)))
    if changed and now - changed < window:
        limit = int(harness.parameter("PARAM_CONTACT_CHANGE_LIMIT", 2500000))
        sent = _transfers_since_minor(state, customer_id, changed, exclude=payment_id)
        checks.append({"name": "Recent contact change", "ok": sent + amount <= limit, "reason": "RECENT_CONTACT_CHANGE",
                       "detail": f"Mobile or email changed within {int(window.total_seconds() // 3600)} hours; sent since {sent}; this payment {amount}; limit {limit}"})
    return checks


def _rupees(minor: Any) -> str:
    return "₹" + f"{int(minor) // 100:,}"


def customer_reason_text(reason: str) -> Optional[str]:
    """Plain words for a refusal the customer can act on. Fraud and risk reasons (a flagged payee, velocity, a new device,
    injected content) return None on purpose: telling the person what tripped the alarm teaches them how to avoid it."""
    hours = int(float(harness.parameter("PARAM_NEW_PAYEE_COOLING_HOURS", 24)))
    return {
        "KYC_NON_COMPLIANT": "Complete your KYC to send money.",
        "DELEGATION_SCOPE_EXCEEDED": "This is above the daily limit for payments made through Mitra.",
        "NEW_PAYEE_LIMIT_EXCEEDED": f"A new payee can receive up to {_rupees(harness.parameter('PARAM_NEW_PAYEE_LIMIT', 2500000))} in the first {hours} hours.",
        "RECENT_CONTACT_CHANGE": (f"For your safety, payments are limited to {_rupees(harness.parameter('PARAM_CONTACT_CHANGE_LIMIT', 2500000))} for "
                                  f"{int(float(harness.parameter('PARAM_CONTACT_CHANGE_COOLING_HOURS', 24)))} hours after your mobile number or email changes."),
        "INVALID_AMOUNT": "Enter a valid amount.",
        "INTENT_ACTION_MISMATCH": "The payment details did not match what you asked for. Please start again.",
        "INTENT_AMOUNT_MISMATCH": "The payment details did not match what you asked for. Please start again.",
        "INTENT_DESTINATION_MISMATCH": "The payment details did not match what you asked for. Please start again.",
        "INTENT_SOURCE_MISMATCH": "The payment details did not match what you asked for. Please start again.",
        "INTENT_INCOMPLETE": "Tell Mitra the amount and who to pay, then try again.",
        "INTENT_EXPIRED": "That request has expired. Please start again.",
        "BILL_BINDING_MISMATCH": "That bill could not be matched. Please start again.",
        "CARD_NOT_AUTHORIZED": "That card cannot be changed from here.",
        "SOURCE_ACCOUNT_NOT_AUTHORIZED": "That account cannot be used for this payment.",
        "DESTINATION_NOT_AUTHORIZED": "That payee cannot be used for this payment.",
        "IDEMPOTENCY_CONFLICT": "This request clashes with an earlier one. Please start again.",
        "ACTION_NOT_REGISTERED": "That action is not available.",
    }.get(reason)


def waiting_period_reason(state: Dict[str, Any], customer_id: Optional[str], beneficiary: Dict[str, Any]) -> Optional[str]:
    """Why a new standing instruction must wait, in the customer's words, or None when it may go ahead. A recurring payment to
    a payee added minutes ago, or set up right after the mobile or email changed, is the shape of an account takeover."""
    now = datetime.now(timezone.utc)
    added = _when((beneficiary or {}).get("created_at"))
    hours = float(harness.parameter("PARAM_NEW_PAYEE_COOLING_HOURS", 24))
    if added and now - added < timedelta(hours=hours):
        return f"This payee was added in the last {int(hours)} hours. A regular payment to a new payee can be set up after that."
    changed = _when(_customer_in(state, customer_id).get("contact_changed_at"))
    window = float(harness.parameter("PARAM_CONTACT_CHANGE_COOLING_HOURS", 24))
    if changed and now - changed < timedelta(hours=window):
        return f"Your mobile number or email changed in the last {int(window)} hours. For your safety, new regular payments can be set up after that."
    return None


class IntentResolver:
    """Small deterministic resolver for the explicitly supported demo grammar."""

    def __init__(self, repository: BankingDatabase = db) -> None:
        self.db = repository

    def bind_external(self, action_family: str, fields: Dict[str, Any], session_id: str, customer_id: str, agent: str) -> Dict[str, Any]:
        """An intent proposed by an external agent through the MCP gateway. It is bound to exactly what the agent asked for,
        and only the customer's own Kavach approval of that exact transaction can authorise money movement."""
        intent = {
            "id": new_id("INT"), "customer_id": customer_id, "session_id": session_id, "turn_id": new_id("EXT"),
            "action_family": action_family, "fields": fields, "source": "EXTERNAL_AGENT", "agent": agent,
            "raw_user_message_digest": None, "status": "AWAITING_CUSTOMER_APPROVAL", "version": 1, "created_at": utc_now(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=harness.policy()["sentinel"]["challenge_ttl_seconds"])).isoformat().replace("+00:00", "Z"),
        }

        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            data.setdefault("intents", []).append(intent)
            data.setdefault("audit_events", []).append({
                "id": new_id("AUD"), "event_type": "INTENT_PROPOSED_BY_AGENT", "session_id": session_id, "customer_id": customer_id,
                "intent_id": intent["id"], "actor": "agent", "summary": f"{agent} proposed {action_family}",
                "details": {"fields": fields}, "severity": "INFO", "created_at": utc_now()})
            return intent
        return self.db.transaction(mutate)

    def resolve(self, user_text: str, session_id: str, turn_id: str, customer_id: str = CUSTOMER_ID) -> Dict[str, Any]:
        lowered = user_text.casefold()
        fields: Dict[str, Any] = {}
        action_family = "UNKNOWN"

        # Check if an account is referenced in user text
        for acc in self.db.get_accounts(customer_id):
            acc_name = acc.get("name", "").casefold()
            acc_id = acc.get("id", "").casefold()
            if (acc_name and acc_name in lowered) or (acc_id and acc_id in lowered):
                fields["source_account_id"] = acc["id"]
                break

        words = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", lowered))

        if any(term in lowered for term in ("freeze", "block card", "block my card")):
            action_family = "FREEZE_CARD"
            card = next(iter(self.db.get_cards(customer_id)), None)
            if card:
                fields["card_id"] = card["id"]
        elif any(term in lowered for term in ("transfer", "send ₹", "send inr", "send rs", "send rupees", "send money")):
            action_family = "TRANSFER"
            fields["amount_minor"] = _money_from_text(user_text)
            for beneficiary in self.db.snapshot().get("beneficiaries", {}).values():
                if beneficiary.get("customer_id") and beneficiary.get("customer_id") != customer_id:
                    continue
                aliases = {
                    beneficiary.get("id", "").casefold(),
                    beneficiary.get("display_name", "").casefold(),
                    beneficiary.get("upi_id", "").casefold(),
                }
                first_name = beneficiary.get("display_name", "").split()[0].casefold() if beneficiary.get("display_name") else ""
                if any(alias and alias in lowered for alias in aliases) or (first_name and len(first_name) >= 3 and first_name in words):
                    fields["beneficiary_id"] = beneficiary["id"]
                    break
        elif any(term in lowered for term in ("bill", "electricity", "tata power", "bescom", "airtel")):
            action_family = "PAY_BILL"
            for bill in self.db.get_bills(customer_id):
                biller_name = bill.get("biller_name", "").casefold()
                if any(k in lowered for k in biller_name.split() if len(k) > 3):
                    fields["biller_id"] = bill["biller_id"]
                    fields["bill_id"] = bill["id"]
                    break
            if not fields.get("bill_id"):
                bill = next(iter(self.db.get_bills(customer_id)), None)
                if bill:
                    fields["biller_id"] = bill["biller_id"]
                    fields["bill_id"] = bill["id"]
            if any(term in lowered for term in ("poison", "attack", "compromised")):
                fields["demo_scenario"] = "prompt-injection"
        elif any(term in lowered for term in ("fraud", "security alert", "suspicious", "unusual charge")):
            action_family = "READ_ALERTS"
        elif any(term in lowered for term in ("transaction", "spending", "spent", "recent activity", "did rahul", "get the money", "payment done", "payment status", "transfer status", "did the payment", "did transfer", "is payment", "is the transfer")):
            action_family = "READ_TRANSACTIONS"
        elif any(term in lowered for term in ("account", "balance", "money do i have")):
            action_family = "READ_ACCOUNTS"

        # Multi-turn context resolution: if user is answering a follow-up question
        # in an existing session (e.g. choosing source account, confirming amount/beneficiary),
        # inherit active unconsumed intent and merge newly specified fields.
        if action_family == "UNKNOWN" and session_id:
            prior_intents = [
                i for i in self.db.snapshot().get("intents", [])
                if i.get("session_id") == session_id and i.get("action_family") in {"TRANSFER", "PAY_BILL"}
            ]
            if prior_intents:
                last_intent = prior_intents[-1]
                try:
                    exp = last_intent.get("expires_at", "").replace("Z", "+00:00")
                    fresh = datetime.fromisoformat(exp) >= datetime.now(timezone.utc)
                except Exception:
                    fresh = False
                if fresh:
                    action_family = last_intent["action_family"]
                    merged_fields = dict(last_intent.get("fields", {}))
                    merged_fields.update({k: v for k, v in fields.items() if v is not None})
                    fields = merged_fields

        created_at = utc_now()
        intent = {
            "id": new_id("INT"),
            "customer_id": customer_id,
            "session_id": session_id,
            "turn_id": turn_id,
            "action_family": action_family,
            "fields": fields,
            "raw_user_message_digest": hashlib.sha256(user_text.encode("utf-8")).hexdigest(),
            "status": "BOUND" if action_family != "UNKNOWN" else "UNKNOWN",
            "version": 1,
            "created_at": created_at,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat().replace("+00:00", "Z"),
        }

        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            data.setdefault("intents", []).append(intent)
            data.setdefault("audit_events", []).append(
                {
                    "id": new_id("AUD"),
                    "event_type": "INTENT_BOUND",
                    "session_id": session_id,
                    "intent_id": intent["id"],
                    "decision_id": None,
                    "summary": f"Customer intent resolved as {action_family}",
                    "details": {"action_family": action_family, "fields": fields},
                    "severity": "INFO" if action_family != "UNKNOWN" else "WARNING",
                    "created_at": created_at,
                }
            )
            return intent

        return self.db.transaction(mutate)


class SentinelService:
    """Non-LLM policy decision point for every consequential proposal."""

    def __init__(self, repository: BankingDatabase = db, secret: Optional[str] = None) -> None:
        self.db = repository
        self.secret = (secret or required_secret("SENTINEL_DEMO_SECRET", "sentinel-local-demo-only")).encode("utf-8")

    def request_digest(self, context: Dict[str, Any]) -> str:
        """Return the transaction binding used by decisions and idempotency records."""
        intent = context.get("intent") or {}
        return _canonical_digest({
            "customer_id": context.get("customer_id"),
            "session_id": context.get("session_id"),
            "intent_id": intent.get("id"),
            "action": context.get("action", {}),
            "agent_id": context.get("agent_id"),
            "idempotency_key": context.get("idempotency_key"),
        })

    def _token(self, decision_id: str, request_digest: str, audience: str = "mock-ledger") -> str:
        payload = {
            "decision_id": decision_id,
            "request_digest": request_digest,
            "audience": audience,
            "nonce": new_id("NONCE"),
            "exp": int((datetime.now(timezone.utc) + timedelta(seconds=60)).timestamp()),
        }
        encoded = base64.urlsafe_b64encode(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).decode("ascii").rstrip("=")
        signature = hmac.new(self.secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{encoded}.{signature}"

    def verify_token(self, token: str, request_digest: str, audience: str = "mock-ledger") -> Tuple[bool, str]:
        try:
            encoded, signature = token.split(".", 1)
            expected = hmac.new(self.secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                return False, "AUTHORIZATION_SIGNATURE_INVALID"
            padded = encoded + "=" * (-len(encoded) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            if payload.get("audience") != audience:
                return False, "AUTHORIZATION_AUDIENCE_INVALID"
            if payload.get("request_digest") != request_digest:
                return False, "AUTHORIZATION_DIGEST_MISMATCH"
            if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
                return False, "AUTHORIZATION_EXPIRED"
            decision = next(
                (
                    item
                    for item in self.db.snapshot().get("sentinel_decisions", [])
                    if item.get("id") == payload.get("decision_id")
                ),
                None,
            )
            if not decision or decision.get("consumed_at"):
                return False, "AUTHORIZATION_REUSED_OR_UNKNOWN"
            return True, payload["decision_id"]
        except Exception:
            return False, "AUTHORIZATION_MALFORMED"

    def spent_today_minor(self, customer_id: Optional[str]) -> int:
        """Money already moved by this customer through the agent today (India calendar day)."""
        return money_out_today_minor(self.db.snapshot(), customer_id)

    def evaluate(self, context: Dict[str, Any], *, persist: bool = True) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        action = context.get("action", {})
        intent = context.get("intent") or {}
        delegation = context.get("delegation") or {}
        device = context.get("device") or {}
        checks: List[Dict[str, Any]] = []
        reasons: List[str] = []
        score = 0

        request_digest = self.request_digest(context)
        state = self.db.snapshot()

        def check(name: str, passed: bool, detail: str, reason: Optional[str] = None) -> None:
            checks.append({"name": name, "status": "PASS" if passed else "FAIL", "detail": detail})
            if not passed and reason and reason not in reasons:
                reasons.append(reason)

        valid_actions = {"PAY_BILL", "TRANSFER", "FREEZE_CARD"}
        action_type = action.get("action_type")
        check("Registered action", action_type in valid_actions, str(action_type), "ACTION_NOT_REGISTERED")

        # Regulatory KYC Compliance Check
        customer_id = context.get("customer_id")
        kyc = self.db.get_kyc_profile(customer_id) if customer_id else {}
        kyc_status = kyc.get("status", "VERIFIED")
        initial_pending = kyc.get("kyc_type") == "INITIAL_KYC" and kyc_status != "VERIFIED"
        kyc_ok = (action_type == "FREEZE_CARD") or (
            kyc_status not in {"NOT_DONE", "EXPIRED", "ACTION_REQUIRED"} and not initial_pending
        )
        kyc_detail = (
            f"Account compliance status is {kyc_status}. Customer identity and account operations are in good standing."
            if kyc_ok
            else f"Account compliance status is {kyc_status}. Outward financial operations are restricted until initial KYC verification is completed under RBI/PMLA guidelines."
        )
        check(
            "Regulatory KYC compliance",
            kyc_ok,
            kyc_detail,
            "KYC_NON_COMPLIANT"
        )

        delegation_fresh = False
        try:
            del_exp = delegation.get("expires_at", "").replace("Z", "+00:00")
            delegation_fresh = datetime.fromisoformat(del_exp) >= datetime.now(timezone.utc)
        except (TypeError, ValueError):
            pass
        delegation_ok = (
            delegation.get("status") == "ACTIVE"
            and delegation_fresh
            and delegation.get("agent_id") == context.get("agent_id") == AGENT_ID
            and action_type in delegation.get("allowed_actions", [])
        )
        check("Delegated authority", delegation_ok, delegation.get("id", "No delegation"), "DELEGATION_SCOPE_EXCEEDED")

        source = self.db.get_account(str(action.get("source_account_id", ""))) if action.get("source_account_id") else None
        source_ok = bool(
            action_type == "FREEZE_CARD"
            or (
                source
                and source.get("customer_id") == context.get("customer_id")
                and source.get("status") == "ACTIVE"
                and source.get("id") in delegation.get("allowed_accounts", [])
            )
        )
        check("Source account", source_ok, source.get("name", "Not applicable") if source else "Not found", "SOURCE_ACCOUNT_NOT_AUTHORIZED")
        bound_source = intent.get("fields", {}).get("source_account_id")
        if bound_source:
            check("Intent source match", bound_source == action.get("source_account_id"),
                  "Source account must match the customer's reviewed instruction", "INTENT_SOURCE_MISMATCH")

        expected_action = intent.get("action_family")
        intent_action_ok = expected_action == action_type
        check("Intent action match", intent_action_ok, f"Expected {expected_action}; proposed {action_type}", "INTENT_ACTION_MISMATCH")

        if intent.get("expires_at"):
            intent_exp = intent["expires_at"].replace("Z", "+00:00")
            intent_fresh = datetime.fromisoformat(intent_exp) >= datetime.now(timezone.utc)
        else:
            intent_fresh = False
        check("Intent freshness", intent_fresh, intent.get("expires_at", "Missing"), "INTENT_EXPIRED")

        amount_minor = action.get("amount_minor", 0)
        valid_amount = isinstance(amount_minor, int) and not isinstance(amount_minor, bool) and amount_minor >= 0
        if action_type in {"PAY_BILL", "TRANSFER"}:
            valid_amount = valid_amount and amount_minor > 0
        check("Money precision", valid_amount, "Integer paise required", "INVALID_AMOUNT")
        for item in limit_checks(state, customer_id=customer_id, action=action, delegation=delegation,
                                 payment_id=context.get("payment_intent_id")):
            check(item["name"], item["ok"], item["detail"], item["reason"])

        beneficiary = None
        bill = None
        if action_type == "TRANSFER":
            beneficiary = self.db.get_beneficiary(str(action.get("beneficiary_id", "")))
            intended_amount = intent.get("fields", {}).get("amount_minor")
            intended_beneficiary = intent.get("fields", {}).get("beneficiary_id")
            complete = intended_amount is not None and intended_beneficiary is not None
            check("Intent completeness", complete, "Amount and beneficiary must be explicit", "INTENT_INCOMPLETE")
            check(
                "Intent amount match",
                complete and intended_amount == amount_minor,
                f"Bound {intended_amount}; proposed {amount_minor}",
                "INTENT_AMOUNT_MISMATCH",
            )
            check(
                "Intent destination match",
                complete and intended_beneficiary == action.get("beneficiary_id"),
                f"Bound {intended_beneficiary}; proposed {action.get('beneficiary_id')}",
                "INTENT_DESTINATION_MISMATCH",
            )
        elif action_type == "PAY_BILL":
            bill = self.db.get_bill(str(action.get("bill_id", "")))
            beneficiary = self.db.get_beneficiary(str(action.get("beneficiary_id", "")))
            bill_ok = bool(
                bill
                and bill.get("status") == "DUE"
                and 0 < amount_minor <= int(bill.get("amount_minor", 0))
                and bill.get("biller_id") == action.get("beneficiary_id")
            )
            check("Trusted bill binding", bill_ok, bill.get("biller_name", "Bill not found") if bill else "Bill not found", "BILL_BINDING_MISMATCH")

        if action_type == "FREEZE_CARD":
            card = self.db.get_card(str(action.get("card_id", "")))
            card_ok = bool(card and card.get("customer_id") == context.get("customer_id") and card.get("status") in {"ACTIVE", "FROZEN"})
            check("Card ownership", card_ok, card.get("card_number_masked", "Card not found") if card else "Card not found", "CARD_NOT_AUTHORIZED")

        beneficiary_owned = not beneficiary or beneficiary.get("customer_id") == context.get("customer_id")
        check("Destination ownership", beneficiary_owned, beneficiary.get("id", "Not applicable") if beneficiary else "Not applicable", "DESTINATION_NOT_AUTHORIZED")
        beneficiary_safe = not beneficiary or beneficiary.get("risk_status") != "BLOCKED_MULE"
        check(
            "Destination reputation",
            beneficiary_safe,
            beneficiary.get("risk_status", "Not applicable") if beneficiary else "Not applicable",
            "KNOWN_MULE_DESTINATION",
        )

        existing = self.db.get_idempotency(str(context.get("idempotency_key", "")))
        idempotency_ok = not existing or existing.get("request_digest") == request_digest
        check("Replay and idempotency", idempotency_ok, "No conflicting replay", "IDEMPOTENCY_CONFLICT")

        if intent.get("source") == "EXTERNAL_AGENT":
            reasons.append("PROPOSED_BY_EXTERNAL_AGENT")
        if context.get("untrusted_content_detected"):
            reasons.append("SUSPECTED_INDIRECT_PROMPT_INJECTION")
            checks.append({"name": "Untrusted-content provenance", "status": "SIGNAL", "detail": "Instruction-like external content was involved"})

        hard_failed = any(item["status"] == "FAIL" for item in checks)
        if hard_failed:
            score = 100
            decision = "DENY"
        else:
            policy = harness.policy()["sentinel"]
            weights = policy["weights"]

            def signal(code: str) -> None:
                nonlocal score
                score += weights[code]
                reasons.append(code)

            if beneficiary and beneficiary.get("relationship") == "NEW":
                signal("NEW_BENEFICIARY")
            if beneficiary and beneficiary.get("relationship") == "TRUSTED":
                signal("TRUSTED_PRIOR_BENEFICIARY")

            # A payee added inside the cooling window is a risk signal; what it may receive is a hard check (limit_checks).
            cooling_hours = harness.parameter("PARAM_NEW_PAYEE_COOLING_HOURS", 24)
            agent_payment_limit = harness.parameter("PARAM_AGENT_PAYMENT_LIMIT", 2500000)
            added = _when((beneficiary or {}).get("created_at"))
            if added and (now - added).total_seconds() < cooling_hours * 3600:
                reasons.append("COOLING_OFF_PERIOD_ACTIVE")
                if "NEW_BENEFICIARY" not in reasons:
                    signal("NEW_BENEFICIARY")

            if action_type == "TRANSFER" and amount_minor > agent_payment_limit:
                if "AMOUNT_ABOVE_BASELINE" not in reasons:
                    signal("AMOUNT_ABOVE_BASELINE")
                reasons.append("EXCEEDS_AGENT_PAYMENT_LIMIT")
            customer = self.db.get_customer(context.get("customer_id", CUSTOMER_ID)) or {}
            normal = int(customer.get("normal_transfer_minor", policy["default_normal_transfer_minor"]))
            # The agent-limit check above may already have raised this signal; one amount must not be charged twice.
            if action_type == "TRANSFER" and amount_minor > normal * policy["baseline_multiple"] and "AMOUNT_ABOVE_BASELINE" not in reasons:
                signal("AMOUNT_ABOVE_BASELINE")
            if amount_minor > policy["high_value_minor"]:
                signal("HIGH_VALUE_TRANSFER")
            # Only a device the bank has bound to this customer is known; a missing or unrecognised one counts as new.
            known = device.get("status") == "TRUSTED" and device.get("customer_id") == context.get("customer_id")
            signal("KNOWN_BOUND_DEVICE" if known else "NEW_DEVICE")
            if context.get("untrusted_content_detected"):
                signal("SUSPECTED_INDIRECT_PROMPT_INJECTION")
            if action_type == "PAY_BILL" and bill and bill.get("autopay_eligible"):
                signal("KNOWN_RECURRING_BILL")
                if amount_minor > int(delegation.get("max_autonomous_bill_minor", 0)):
                    signal("BILL_ABOVE_AUTONOMY_LIMIT")

            # The browser/device can provide a trusted local-hour signal. The demo
            # defaults to a normal daytime hour so outcomes remain reproducible.
            local_hour = int(context.get("local_hour", 14))
            if action_type in {"PAY_BILL", "TRANSFER"} and local_hour < policy["unusual_hours_before"]:
                signal("UNUSUAL_TRANSACTION_TIME")

            recent_attempts = 0
            now = datetime.now(timezone.utc)
            # Attempts refused only because initial KYC was incomplete are compliance blocks, not fraud signals.
            kyc_blocked = {d["id"] for d in state.get("sentinel_decisions", []) if d.get("reason_codes") == ["KYC_NON_COMPLIANT"]}
            for proposal in state.get("payment_intents", []):
                try:
                    created_at_str = proposal["created_at"].replace("Z", "+00:00")
                    age = (now - datetime.fromisoformat(created_at_str)).total_seconds()
                    # Only money movement counts; protective actions such as freezing a card must not raise payment risk.
                    moves_money = (proposal.get("action") or {}).get("action_type") in {"PAY_BILL", "TRANSFER"}
                    if proposal.get("decision_id") in kyc_blocked:
                        continue
                    if moves_money and proposal.get("customer_id") == context.get("customer_id") and 0 <= age <= policy["velocity_window_seconds"]:
                        recent_attempts += 1
                except Exception:
                    continue
            if recent_attempts >= policy["velocity_count"]:
                signal("VELOCITY_LIMIT")

            score = max(0, min(score, 100))
            if score >= policy["deny_at_score"]:
                decision = "DENY"
            elif context.get("step_up_verified"):
                decision = "ALLOW"
                reasons.append("STEP_UP_AUTH_VERIFIED")
            elif action_type in policy["always_customer_approval"] or score >= policy["challenge_at_score"]:
                decision = "CHALLENGE"
            else:
                decision = "ALLOW"

        decision_id = new_id("DEC")
        created_at = utc_now()
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat().replace("+00:00", "Z")
        token = self._token(decision_id, request_digest) if decision == "ALLOW" else None
        obligations: List[Dict[str, Any]] = []
        if decision == "CHALLENGE":
            obligations.append({"type": "STEP_UP_AUTH", "method": "FIREBASE_REAUTH", "transaction_digest": request_digest})
        if decision == "DENY":
            obligations.append({"type": "DO_NOT_EXECUTE"})

        record = {
            "id": decision_id,
            "request_id": context.get("request_id"),
            "session_id": context.get("session_id"),
            "intent_id": intent.get("id"),
            "payment_intent_id": context.get("payment_intent_id"),
            "decision": decision,
            "risk_score": score,
            "reason_codes": list(dict.fromkeys(reasons)),
            "checks": checks,
            "obligations": obligations,
            "request_digest": request_digest,
            "policy_version": harness.policy_version(),
            "authorization_token_hash": hashlib.sha256(token.encode()).hexdigest() if token else None,
            "created_at": created_at,
            "expires_at": expires_at,
            "consumed_at": None,
        }

        if persist:
            def mutate(data: Dict[str, Any]) -> None:
                data.setdefault("sentinel_decisions", []).append(record)
                data.setdefault("audit_events", []).append(
                    {
                        "id": new_id("AUD"),
                        "event_type": "SENTINEL_DECISION",
                        "session_id": context.get("session_id"),
                        "intent_id": intent.get("id"),
                        "decision_id": decision_id,
                        "summary": f"Sentinel returned {decision} at risk {score}",
                        "details": {
                            "decision": decision,
                            "risk_score": score,
                            "reason_codes": record["reason_codes"],
                            "checks": checks,
                            "request_digest": request_digest,
                            "policy_version": record["policy_version"],
                        },
                        "severity": "CRITICAL" if decision == "DENY" else ("WARNING" if decision == "CHALLENGE" else "INFO"),
                        "created_at": created_at,
                    }
                )

            self.db.transaction(mutate)
            if decision == "DENY":
                try:  # a burst of refusals pauses the money tools for a while (backend/auto_controls.py)
                    from backend import auto_controls
                    auto_controls.after_refusal(self.db)
                except Exception:  # monitoring must never break a decision
                    pass

        response = dict(record)
        response["authorization_token"] = token
        return response


intent_resolver = IntentResolver(db)
sentinel = SentinelService(db)
