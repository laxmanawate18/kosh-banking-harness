"""Automatic pause of the money tools when Sentinel refuses an unusual number of payments in a short time.

Only the two tools that move money are paused, so chat, sales and enquiries keep working, and the pause ends by itself after a
cooldown. It sits beside the admin's own kill switches and never overwrites them. The limits are deliberately high: a person
testing a few refusals must not pause the bank for everyone. They are set here, not in policy.json, so the prompt version does not
change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from banking_db import new_id

MONEY_TOOLS = ("propose_transfer", "propose_bill_payment")
TRIP_AT_REFUSALS = 15      # refusals ...
WITHIN_MINUTES = 10        # ... within this time start a pause
PAUSE_MINUTES = 15         # how long the pause lasts unless the admin resumes earlier
REASON = "Sentinel refused an unusual number of payments in a short time"


def _when(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def active(controls: Dict[str, Any], now: Optional[datetime] = None) -> List[str]:
    """The tools paused automatically right now, from a controls record."""
    now = now or _now()
    return [tool for tool, trip in (controls.get("auto_trips") or {}).items() if (_when(trip.get("until")) or now) > now]


def pauses(db) -> List[Dict[str, Any]]:
    """What the admin page shows: each automatic pause that has not ended, with its reason and when it ends."""
    controls = db.get_controls()
    now = _now()
    return [{"tool": tool, "reason": trip.get("reason"), "since": trip.get("since"), "until": trip.get("until")}
            for tool, trip in sorted((controls.get("auto_trips") or {}).items()) if (_when(trip.get("until")) or now) > now]


def after_refusal(db, now: Optional[datetime] = None) -> bool:
    """Called after Sentinel stores a refusal. Starts a pause when the recent refusals reach the limit. True if it started one."""
    now = now or _now()
    since = now - timedelta(minutes=WITHIN_MINUTES)
    refused = sum(1 for d in db.snapshot().get("sentinel_decisions", [])
                  if d.get("decision") == "DENY" and (_when(d.get("created_at")) or since) > since)
    if refused < TRIP_AT_REFUSALS or any(t in active(db.get_controls(), now) for t in MONEY_TOOLS):
        return False
    until = (now + timedelta(minutes=PAUSE_MINUTES)).isoformat()
    trips = {tool: {"reason": REASON, "since": now.isoformat(), "until": until} for tool in MONEY_TOOLS}

    def mutate(data: Dict[str, Any]) -> None:
        current = data.setdefault("harness_controls", {}).setdefault("current", {"disabled_channels": [], "disabled_tools": []})
        current["auto_trips"] = {**(current.get("auto_trips") or {}), **trips}
        data.setdefault("audit_events", []).append({
            "id": new_id("AUD"), "event_type": "AUTO_PAUSE_STARTED", "actor": "system", "severity": "WARNING",
            "summary": f"Money tools paused automatically for {PAUSE_MINUTES} minutes",
            "details": {"refusals": refused, "within_minutes": WITHIN_MINUTES, "tools": list(MONEY_TOOLS), "until": until},
            "created_at": now.isoformat()})
    db.transaction(mutate)
    return True


def resume(db, admin_id: str) -> int:
    """The admin ends every automatic pause now. Returns how many tools were paused."""
    ended: List[str] = []

    def mutate(data: Dict[str, Any]) -> None:
        current = (data.get("harness_controls") or {}).get("current") or {}
        ended.extend(current.pop("auto_trips", None) or {})
        if ended:
            data.setdefault("audit_events", []).append({
                "id": new_id("AUD"), "event_type": "AUTO_PAUSE_ENDED", "actor": "officer", "approver_id": admin_id,
                "severity": "WARNING", "summary": "The admin resumed the money tools", "details": {"tools": sorted(ended)},
                "created_at": _now().isoformat()})
    db.transaction(mutate)
    return len(ended)
