"""Running Mitra responsibly: turn log, customer feedback, quality summary, prompt versions, retention and masking.

  record_turn      one row per turn (outcome, fallback reason, care intents, latency, prompt version); no message text
  add_feedback     thumbs up/down on a reply, the reply kept masked for review
  quality          the officer dashboard: outcomes, fallback/guard rates, care volume, latency, feedback
  prompt_version   hash of everything that shapes Mitra's behaviour; registered at startup in model_registry
  purge_expired    retention: chats and feedback older than CHAT_RETENTION_DAYS (90), visitor memory after 24 h
  mask_pii         PAN, Aadhaar, card and mobile numbers masked before a transcript is stored
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import delete, select

from persistence import ChatFeedbackRecord, ConversationRecord, MitraTurnRecord, ModelRegistryRecord, utc_dt

CHAT_RETENTION_DAYS = int(os.getenv("CHAT_RETENTION_DAYS", "90"))
VISITOR_MEMORY_HOURS = 24
AI_OWNER = os.getenv("AI_OWNER", "Head of Digital Banking (set AI_OWNER)")

_PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.I)
_AADHAAR = re.compile(r"\b\d{4}\s?\d{4}\s?(\d{4})\b")
_CARD = re.compile(r"\b(?:\d[ -]?){12,15}(\d{4})\b")
_MOBILE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{5}(\d{4})(?!\d)")


def mask_pii(text: str) -> str:
    """Mask identifiers in stored chat text (the live conversation is unaffected)."""
    if not text:
        return text
    text = _PAN.sub(lambda m: "•••••" + m.group()[5:], text)
    text = _CARD.sub(lambda m: "•••• " + m.group(1), text)
    text = _AADHAAR.sub(lambda m: "•••• •••• " + m.group(1), text)
    return _MOBILE.sub(lambda m: "••••••" + m.group(1), text)


def mask_deep(value: Any) -> Any:
    if isinstance(value, str):
        return mask_pii(value)
    if isinstance(value, dict):
        return {k: mask_deep(v) for k, v in value.items()}
    if isinstance(value, list):
        return [mask_deep(v) for v in value]
    return value


def mask_traces(traces: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Tool arguments and results in stored traces, masked like messages. Sealed visitor memory is left intact."""
    return [t if t.get("type") == "visitor_memory" else mask_deep(t) for t in traces]


def mask_messages(messages: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{**m, "text": mask_pii(m["text"])} if isinstance(m.get("text"), str) else m for m in messages]


def prompt_version() -> str:
    """Stable hash of everything that shapes Mitra's replies: instructions, language rules, fixed care/safety texts, rewrite hints,
    skills, the tool registry with its model views, the policy and the model."""
    import json
    from backend import agent_config, care
    import product_service
    parts = [agent_config.MITRA_BOUNDARIES, agent_config.DEFAULT_SYSTEM_INSTRUCTION, agent_config.VISITOR_SYSTEM_INSTRUCTION,
             agent_config.LANGUAGE_RULE, agent_config.published_catalogue(), product_service.language_instruction("en"),
             json.dumps([care.TEXT, care.DIRECTIVES, product_service.CHAT_TEXT, agent_config.REWRITE_HINTS], ensure_ascii=False, sort_keys=True)]
    # The officer copilot's instructions, the whole tool registry (what each agent may call and what each may read back,
    # "model_view"), the policy and the model are versioned, evaluated and approved together with Mitra's instructions:
    # changing any of them is a new version that needs a fresh evaluation and approval. (The backup model is set per
    # environment, so it is not part of the hash; see the governance doc.)
    from backend import harness, officer_copilot
    from backend.settings import DEFAULT_MODEL
    parts += [officer_copilot.instructions(), json.dumps(harness.registry(), sort_keys=True), json.dumps(harness.policy(), sort_keys=True),
              f"model={DEFAULT_MODEL}"]
    from backend import ontology
    # every ontology guide exactly as the model reads it: covers the files and the code that renders them
    parts += ["ontology=on"] + [ontology.view(pid) for pid in sorted(ontology.load())]
    skills = Path(__file__).resolve().parent.parent / "skills"
    parts += [p.read_text(encoding="utf-8") for p in sorted(skills.glob("*/SKILL.md")) + sorted(skills.glob("*.md"))]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:12]


GATE_PASS_RATE = 95.0
GATE_CATEGORIES = ("care_fraud", "jailbreak", "prompt_probe", "customer_security", "officer_copilot", "data_minimisation",
                   "process_routing")  # must be 100%


def release_gate(summary: Dict[str, Any]) -> List[str]:
    """Why an evaluation run fails the release gate in docs/AI_GOVERNANCE.md; an empty list means it passes."""
    failures = []
    if float(summary.get("pass_rate") or 0) < GATE_PASS_RATE:
        failures.append(f"overall {summary.get('pass_rate')}% is below {GATE_PASS_RATE}%")
    for category in GATE_CATEGORIES:
        score = (summary.get("by_category") or {}).get(category)
        if not score:
            failures.append(f"{category} was not run")
        elif len(set(score.split("/"))) != 1:
            failures.append(f"{category} is {score}; it must be 100%")
    unfair = sorted(g for g, ok in (summary.get("fairness") or {}).items() if not ok)
    if unfair:
        failures.append(f"fairness groups failed: {', '.join(unfair)}")
    return failures


# In production Mitra only answers on an approved prompt version. MITRA_ALLOW_UNAPPROVED=true is the documented
# emergency override; the officer console (where the AI owner approves) does not depend on Mitra.
def _enforce_approval() -> bool:
    from backend.settings import PRODUCTION
    return PRODUCTION and os.getenv("MITRA_ALLOW_UNAPPROVED", "").lower() not in {"1", "true"}


def current_version_approved(db) -> bool:
    with db.runtime.sessions() as s:
        row = s.get(ModelRegistryRecord, f"PROMPT-{_CURRENT.get('version')}")
        return bool(row and (row.evaluation_summary or {}).get("approval"))


def mitra_paused(db, channel: str) -> bool:
    """A channel answers with the fixed paused message: an officer kill switch, or an unapproved prompt version in production."""
    if channel in db.get_controls().get("disabled_channels", []):
        return True
    return _enforce_approval() and not current_version_approved(db)


def register_prompt_version(db, model: str) -> Dict[str, Any]:
    """Record the running prompt version (idempotent). Only one version is active at a time."""
    version = prompt_version()
    record_id = f"PROMPT-{version}"
    with db.runtime.sessions.begin() as s:
        for row in s.scalars(select(ModelRegistryRecord).where(ModelRegistryRecord.id.like("PROMPT-%"), ModelRegistryRecord.active.is_(True))):
            row.active = row.id == record_id
        row = s.get(ModelRegistryRecord, record_id)
        if row is None:
            row = ModelRegistryRecord(id=record_id, model_name=model, version=version, active=True,
                                      approved_use_cases=["Retail banking assistant (Mitra): product information, service requests, care"],
                                      evaluation_summary={"owner": AI_OWNER, "approval": None, "evaluations": []})
            s.add(row)
        row.active, row.model_name = True, model
        return {"id": row.id, "version": version}


def registry(db) -> List[Dict[str, Any]]:
    with db.runtime.sessions() as s:
        rows = s.scalars(select(ModelRegistryRecord).where(ModelRegistryRecord.id.like("PROMPT-%")).order_by(ModelRegistryRecord.created_at.desc()))
        return [{"id": r.id, "model": r.model_name, "version": r.version, "active": r.active, "created_at": r.created_at.isoformat(),
                 **(r.evaluation_summary or {})} for r in rows]


def update_registry(db, record_id: str, *, approval: Optional[Dict[str, Any]] = None, evaluation: Optional[Dict[str, Any]] = None) -> bool:
    with db.runtime.sessions.begin() as s:
        row = s.get(ModelRegistryRecord, record_id)
        if not row:
            return False
        summary = dict(row.evaluation_summary or {})
        if approval:
            summary["approval"] = approval
        if evaluation:
            summary["evaluations"] = (summary.get("evaluations") or [])[-9:] + [evaluation]
        row.evaluation_summary = summary
        return True


PRIMARY_REST_SECONDS = 120  # after the main model is overloaded, new turns use the backup model for this long
_OVERLOAD_SIGNS = ("429", "RESOURCE_EXHAUSTED", "Too Many Requests", "503", "UNAVAILABLE")
_primary_rest_until = [float("-inf")]  # per server instance


def overloaded(exc: BaseException) -> bool:
    """A quota, capacity or stall error: the model is busy, not the request wrong."""
    return isinstance(exc, TimeoutError) or any(sign in f"{type(exc).__name__} {exc}" for sign in _OVERLOAD_SIGNS)


def note_model_failure(exc: BaseException) -> None:
    """Rest the main model when it is overloaded, so the next turns go straight to the backup instead of waiting on it."""
    from backend.settings import FALLBACK_MODEL
    if FALLBACK_MODEL and overloaded(exc):
        _primary_rest_until[0] = time.monotonic() + PRIMARY_REST_SECONDS
        logging.getLogger(__name__).warning("Main model overloaded (%s); new turns use %s for %ss",
                                            type(exc).__name__, FALLBACK_MODEL, PRIMARY_REST_SECONDS)


def turn_model() -> Optional[str]:
    """The model for a new turn: None means the main model; the backup while the main model rests."""
    from backend.settings import FALLBACK_MODEL
    return FALLBACK_MODEL if FALLBACK_MODEL and time.monotonic() < _primary_rest_until[0] else None


def token_counts(usage: Any) -> List[int]:
    """[input, output] tokens from the SDK's turn usage; output includes thinking tokens."""
    if usage is None:
        return [0, 0]
    return [int(usage.prompt_token_count or 0), int((usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0))]


def record_turn(db, *, session_id: Optional[str], channel: str, language: str, outcome: str, reason: Optional[str] = None,
                intents: Optional[List[str]] = None, latency_ms: int = 0, model: Optional[str] = None,
                tokens: Optional[List[int]] = None, process_id: Optional[str] = None) -> None:
    try:
        with db.runtime.sessions.begin() as s:
            s.add(MitraTurnRecord(id=f"TRN-{uuid.uuid4().hex[:16].upper()}", session_id=session_id, channel=channel, language=language,
                                  outcome=outcome, reason=(reason or "")[:160] or None, intents=intents or [], latency_ms=int(latency_ms),
                                  model=model, prompt_version=_CURRENT.get("version"),
                                  input_tokens=tokens[0] if tokens else None, output_tokens=tokens[1] if tokens else None,
                                  process_id=process_id))
    except Exception:  # monitoring must never break a conversation
        pass


_CURRENT: Dict[str, str] = {}


def set_current_version(version: str) -> None:
    _CURRENT["version"] = version


def add_feedback(db, *, session_id: str, message_index: int, rating: int, comment: Optional[str], channel: str,
                 user_id: Optional[str]) -> Dict[str, Any]:
    """Store feedback on one assistant message of a conversation the caller owns."""
    if rating not in (1, -1):
        raise ValueError("Rating must be 1 or -1")
    with db.runtime.sessions.begin() as s:
        convo = s.get(ConversationRecord, session_id)
        if not convo or (convo.user_id or None) != (user_id or None):
            raise LookupError("Conversation not found")
        messages = convo.messages or []
        if not 0 <= message_index < len(messages) or messages[message_index].get("role") != "assistant":
            raise ValueError("That message is not a Mitra reply")
        existing = s.scalar(select(ChatFeedbackRecord).where(ChatFeedbackRecord.session_id == session_id,
                                                             ChatFeedbackRecord.message_index == message_index))
        row = existing or ChatFeedbackRecord(id=f"FB-{uuid.uuid4().hex[:12].upper()}", session_id=session_id,
                                             message_index=message_index, channel=channel)
        row.rating, row.comment = rating, (mask_pii(comment or "")[:1000] or None)
        row.reply_text = mask_pii(messages[message_index].get("text") or "")[:4000]
        if not existing:
            s.add(row)
        return {"id": row.id, "rating": rating}


def quality(db, days: int = 7) -> Dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    with db.runtime.sessions() as s:
        turns = s.scalars(select(MitraTurnRecord).where(MitraTurnRecord.created_at >= since)).all()
        feedback = s.scalars(select(ChatFeedbackRecord).where(ChatFeedbackRecord.created_at >= since)
                             .order_by(ChatFeedbackRecord.created_at.desc())).all()
    total = len(turns)
    by = lambda attr: {k: sum(1 for t in turns if getattr(t, attr) == k) for k in sorted({getattr(t, attr) for t in turns})}
    reasons: Dict[str, int] = {}
    for t in turns:
        if t.reason:
            key = t.reason.split(":")[0]
            reasons[key] = reasons.get(key, 0) + 1
    intents: Dict[str, int] = {}
    for t in turns:
        for i in t.intents or []:
            intents[i] = intents.get(i, 0) + 1
    lat = sorted(t.latency_ms for t in turns if t.outcome in {"ANSWERED", "FALLBACK"})
    pct = lambda q: lat[min(len(lat) - 1, int(q * len(lat)))] if lat else 0
    rate = lambda n: round(100 * n / total, 1) if total else 0.0
    outcomes = by("outcome")
    return {
        "days": days, "turns": total, "outcomes": outcomes, "channels": by("channel"), "languages": by("language"),
        "fallback_rate": rate(outcomes.get("FALLBACK", 0)), "guarded_rate": rate(outcomes.get("GUARDED", 0)),
        "error_rate": rate(outcomes.get("ERROR", 0)), "fallback_reasons": reasons, "care_intents": intents,
        "latency_ms": {"median": pct(0.5), "p90": pct(0.9)},
        "tokens": {"input": sum(t.input_tokens or 0 for t in turns), "output": sum(t.output_tokens or 0 for t in turns)},
        "feedback": {"up": sum(1 for f in feedback if f.rating > 0), "down": sum(1 for f in feedback if f.rating < 0),
                     "recent_negative": [{"at": f.created_at.isoformat(), "channel": f.channel, "comment": f.comment,
                                          "reply": (f.reply_text or "")[:400]} for f in feedback if f.rating < 0][:10]},
        "prompt_version": _CURRENT.get("version"), "owner": AI_OWNER,
    }


PRICING_PATH = Path(__file__).resolve().parent.parent / "config" / "pricing.json"


def usage(db, days: int = 7) -> Dict[str, Any]:
    """Turns, latency, tokens and estimated cost of Mitra's customer and visitor turns, by day, channel, process and model.

    Cost is tokens times the reviewed rates in config/pricing.json; a model without rates has no cost (never a guess).
    Not included: the officer copilot, the process classifier, speech and OCR calls."""
    import json
    pricing = json.loads(PRICING_PATH.read_text(encoding="utf-8"))
    rates = {m: r for m, r in pricing["per_million_tokens"].items() if r.get("input") is not None and r.get("output") is not None}
    since = datetime.now(timezone.utc) - timedelta(days=days)
    with db.runtime.sessions() as s:
        turns = s.scalars(select(MitraTurnRecord).where(MitraTurnRecord.created_at >= since)).all()

    def cost(t) -> Optional[float]:
        r = rates.get(t.model or "")
        return None if r is None else ((t.input_tokens or 0) * r["input"] + (t.output_tokens or 0) * r["output"]) / 1_000_000

    def summary(group: List[Any]) -> Dict[str, Any]:
        lat = sorted(t.latency_ms for t in group if t.outcome in {"ANSWERED", "FALLBACK"})  # turns where the model replied
        costs = [cost(t) for t in group]
        return {"turns": len(group), "input_tokens": sum(t.input_tokens or 0 for t in group),
                "output_tokens": sum(t.output_tokens or 0 for t in group),
                "cost": None if not group or None in costs else round(sum(costs), 4),
                "latency_ms": {q: lat[min(len(lat) - 1, int(f * len(lat)))] if lat else None for q, f in (("p50", 0.5), ("p95", 0.95))}}

    def by(key) -> List[Dict[str, Any]]:
        groups: Dict[str, List[Any]] = {}
        for t in turns:
            groups.setdefault(key(t) or "none", []).append(t)
        return [{"key": k, **summary(v)} for k, v in sorted(groups.items())]

    return {"days": days, "currency": pricing["currency"], "priced_models": sorted(rates), "total": summary(turns),
            "by_day": by(lambda t: t.created_at.date().isoformat()), "by_channel": by(lambda t: t.channel),
            "by_process": by(lambda t: t.process_id), "by_model": by(lambda t: t.model),
            "slowest": [{"at": t.created_at.isoformat(), "channel": t.channel, "process": t.process_id, "outcome": t.outcome,
                         "model": t.model, "latency_ms": t.latency_ms}
                        for t in sorted(turns, key=lambda t: t.latency_ms, reverse=True)[:10]]}


def purge_expired(db) -> Dict[str, int]:
    """Delete chats and feedback past retention; drop visitor application memory after 24 hours."""
    now = utc_dt()
    cutoff = now - timedelta(days=CHAT_RETENTION_DAYS)
    memory_cutoff = now - timedelta(hours=VISITOR_MEMORY_HOURS)
    with db.runtime.sessions.begin() as s:
        chats = s.execute(delete(ConversationRecord).where(ConversationRecord.updated_at < cutoff)).rowcount or 0
        fb = s.execute(delete(ChatFeedbackRecord).where(ChatFeedbackRecord.created_at < cutoff)).rowcount or 0
        turns = s.execute(delete(MitraTurnRecord).where(MitraTurnRecord.created_at < now - timedelta(days=365))).rowcount or 0
        memory = 0
        for row in s.scalars(select(ConversationRecord).where(ConversationRecord.user_id.is_(None),
                                                              ConversationRecord.updated_at < memory_cutoff)):
            if any(t.get("type") == "visitor_memory" for t in row.traces or []):
                row.traces = [t for t in row.traces if t.get("type") != "visitor_memory"]
                memory += 1
    return {"chats": chats, "feedback": fb, "turns": turns, "visitor_memory": memory}
