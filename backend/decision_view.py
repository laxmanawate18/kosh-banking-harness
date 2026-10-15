"""Why Sentinel decided what it did, in words an officer or admin can read.

The customer, Mitra and outside agents never see this: the reason codes and the score stay out of their reach (guardrail G8, no
tipping off). It reads the stored decision record only, so it changes nothing Mitra reads and nothing in the prompt version."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import sentinel
from backend import harness

REASONS: Dict[str, str] = {
    "NEW_BENEFICIARY": "The payee was added recently.",
    "TRUSTED_PRIOR_BENEFICIARY": "The customer has paid this payee before.",
    "AMOUNT_ABOVE_BASELINE": "The amount is well above what this customer normally sends.",
    "HIGH_VALUE_TRANSFER": "The amount is at or above the high-value line.",
    "NEW_DEVICE": "The request came from a device the customer has not used before.",
    "KNOWN_BOUND_DEVICE": "The request came from a device already bound to the customer.",
    "SUSPECTED_INDIRECT_PROMPT_INJECTION": "Content the assistant read looked like instructions hidden for the AI.",
    "KNOWN_RECURRING_BILL": "The bill matches a recurring bill the customer already pays.",
    "BILL_ABOVE_AUTONOMY_LIMIT": "The bill is above what the assistant may pay without the customer.",
    "UNUSUAL_TRANSACTION_TIME": "The request was made at an unusual hour for this customer.",
    "VELOCITY_LIMIT": "Several payments were requested in a short time.",
    "PROPOSED_BY_EXTERNAL_AGENT": "The payment was proposed by an outside AI agent, not by the customer's own assistant.",
    "EXCEEDS_AGENT_PAYMENT_LIMIT": "The amount is above what an agent may complete alone.",
    "COOLING_OFF_PERIOD_ACTIVE": "The payee is still inside its cooling-off period.",
    "NEW_PAYEE_LIMIT_EXCEEDED": "Hard limit: a new payee may receive only a capped total during its cooling-off period.",
    "RECENT_CONTACT_CHANGE": "Hard limit: the mobile number or email changed recently, so transfers are capped for a while.",
    "DELEGATION_SCOPE_EXCEEDED": "Hard limit: the customer's daily amount for assistant payments would be exceeded.",
    "KYC_NON_COMPLIANT": "Hard stop: the customer's KYC is not complete.",
    "INVALID_AMOUNT": "Hard stop: the amount is not valid.",
    "KNOWN_MULE_DESTINATION": "Hard stop: the destination is a known mule account.",
    "BLOCKED_MULE": "Hard stop: the destination is a known mule account.",
    "STEP_UP_AUTH_VERIFIED": "The customer passed fresh verification, so the payment was re-assessed.",
    "ACTION_NOT_REGISTERED": "Hard stop: this action is not one Sentinel governs.",
    "BILL_BINDING_MISMATCH": "Hard stop: the bill does not match what the customer asked to pay.",
    "IDEMPOTENCY_CONFLICT": "Hard stop: the same request key was reused with different details.",
    "CARD_NOT_AUTHORIZED": "Hard stop: the card is not covered by the customer's delegation.",
    "SOURCE_ACCOUNT_NOT_AUTHORIZED": "Hard stop: the source account is not covered by the customer's delegation.",
    "DESTINATION_NOT_AUTHORIZED": "Hard stop: the destination is not covered by the customer's delegation.",
    "INTENT_ACTION_MISMATCH": "Hard stop: the payment does not match what the customer asked for (action).",
    "INTENT_AMOUNT_MISMATCH": "Hard stop: the payment does not match what the customer asked for (amount).",
    "INTENT_DESTINATION_MISMATCH": "Hard stop: the payment does not match what the customer asked for (payee).",
    "INTENT_SOURCE_MISMATCH": "Hard stop: the payment does not match what the customer asked for (account).",
    "INTENT_INCOMPLETE": "Hard stop: the customer's request was incomplete.",
    "INTENT_EXPIRED": "Hard stop: the customer's request expired.",
}


def _reason(code: str, weights: Dict[str, Any]) -> Dict[str, Any]:
    weight = weights.get(code)
    return {"code": code, "meaning": REASONS.get(code, "No description recorded for this reason."),
            "points": weight, "kind": "signal" if weight is not None else "rule"}


def explain(record: Dict[str, Any], payment: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """One decision, explained. `record` is a stored sentinel decision, `payment` its payment intent when it is still on file."""
    policy = harness.policy()["sentinel"]
    weights = policy.get("weights", {})
    codes: List[str] = list(record.get("reason_codes") or [])
    said = next((t for t in map(sentinel.customer_reason_text, codes) if t), None)
    action = (payment or {}).get("action") or {}
    return {
        "id": record["id"],
        "at": record.get("created_at"),
        "decision": record.get("decision"),
        "risk_score": record.get("risk_score"),
        "challenge_at": policy.get("challenge_at_score"),
        "deny_at": policy.get("deny_at_score"),
        "action": {"type": action.get("action_type"), "amount_minor": action.get("amount_minor")} if action else None,
        "reasons": [_reason(c, weights) for c in codes],
        "checks": [{"name": c.get("name"), "status": c.get("status"), "detail": c.get("detail")} for c in record.get("checks") or []],
        "obligations": [o.get("type") for o in record.get("obligations") or []],
        "customer_was_told": (said or "Nothing about the reason.") if record.get("decision") == "DENY" else "Only the outcome and a reference.",
        "policy_version": record.get("policy_version"),
        "session_id": record.get("session_id"),
    }


def recent(state: Dict[str, Any], *, limit: int = 30, decision: Optional[str] = None) -> List[Dict[str, Any]]:
    """The newest decisions first, each explained. `decision` filters to ALLOW, CHALLENGE or DENY."""
    payments = {p["id"]: p for p in state.get("payment_intents", [])}
    records = [r for r in state.get("sentinel_decisions", []) if not decision or r.get("decision") == decision]
    records.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return [explain(r, payments.get(r.get("payment_intent_id"))) for r in records[:max(1, min(limit, 200))]]


def one(state: Dict[str, Any], decision_id: str) -> Optional[Dict[str, Any]]:
    record = next((r for r in state.get("sentinel_decisions", []) if r.get("id") == decision_id), None)
    if not record:
        return None
    payment = next((p for p in state.get("payment_intents", []) if p.get("id") == record.get("payment_intent_id")), None)
    return explain(record, payment)
