"""Customer SMS / WhatsApp notifications.

Every message is written to the notification_outbox table first. A real provider sends it only when
configured (NOTIFY_PROVIDER=twilio|msg91 plus its keys); otherwise it stays QUEUED_LOCAL and nothing
leaves the machine. Sending happens on a background thread so a slow provider never delays banking.

Templates are fixed texts with variables, as Indian DLT registration requires. Register each template
with your provider (and DLT) before switching a provider on.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Iterable, Optional

from persistence import NotificationRecord, utc_dt

logger = logging.getLogger(__name__)
HELPLINE = "1800 000 5674"

TEMPLATES: Dict[str, str] = {
    "application_submitted": "Kosh: Your {product} application {ref} is received. Track it at {site}/#/track/{ref}. Kosh never asks for your OTP or PIN.",
    "application_approved": "Kosh: Your {product} application {ref} is approved. Sign-in details are emailed to {email}. Never share your password or OTP.",
    "application_rejected": "Kosh: We could not approve application {ref}. See {site}/#/track/{ref} or call " + HELPLINE + ".",
    "money_debited": "Kosh: Rs {amount} debited from A/c {account} to {payee}. Ref {ref}. Not you? Call " + HELPLINE + " or freeze your card in Kosh.",
    "card_frozen": "Kosh: Your card ending {last4} is frozen as you asked. Not you? Call " + HELPLINE + ".",
    "service_request_update": "Kosh: Your request {ref} ({service}) is now {status}. Details in Kosh > My requests.",
    "kyc_verified": "Kosh: Your KYC is verified. UPI, IMPS, NEFT and RTGS transfers are now enabled.",
    "kyc_not_verified": "Kosh: We could not verify your KYC documents. Please re-submit them with Mitra in the Kosh app.",
}


def render(event: str, **params: Any) -> str:
    return TEMPLATES[event].format(site=os.getenv("SENTINEL_PUBLIC_URL", "http://127.0.0.1:8019").rstrip("/"), **params)


def _provider() -> str:
    name = os.getenv("NOTIFY_PROVIDER", "").strip().lower()
    if name == "twilio" and os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        return "twilio"
    if name == "msg91" and os.getenv("MSG91_AUTH_KEY"):
        return "msg91"
    return "local"


def _send_twilio(channel: str, to: str, body: str) -> str:
    sid, token = os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]
    sender = os.getenv("TWILIO_WHATSAPP_FROM" if channel == "WHATSAPP" else "TWILIO_SMS_FROM", "")
    if not sender:
        raise RuntimeError(f"Twilio {channel} sender is not configured")
    prefix = "whatsapp:" if channel == "WHATSAPP" else ""
    data = urllib.parse.urlencode({"To": prefix + to, "From": prefix + sender.removeprefix("whatsapp:"), "Body": body}).encode()
    req = urllib.request.Request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data, method="POST",
                                 headers={"Authorization": "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read()).get("sid", "")


def _send_msg91(channel: str, to: str, body: str, event: str, params: Dict[str, Any]) -> str:
    """MSG91 Flow API (SMS). Each event needs a DLT-approved template id in MSG91_TEMPLATE_<EVENT>."""
    if channel != "SMS":
        raise RuntimeError("WhatsApp through MSG91 is not configured; use Twilio for WhatsApp")
    template = os.getenv(f"MSG91_TEMPLATE_{event.upper()}")
    if not template:
        raise RuntimeError(f"MSG91_TEMPLATE_{event.upper()} is not set")
    payload = {"template_id": template, "short_url": "0",
               "recipients": [{"mobiles": to.lstrip("+"), **{k.upper(): str(v) for k, v in params.items()}}]}
    req = urllib.request.Request("https://control.msg91.com/api/v5/flow/", data=json.dumps(payload).encode(), method="POST",
                                 headers={"authkey": os.environ["MSG91_AUTH_KEY"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read() or b"{}").get("request_id", "")


def _dispatch(db, record_id: str, provider: str, channel: str, to: str, body: str, event: str, params: Dict[str, Any]) -> None:
    status, ref, error = "SENT", None, None
    try:
        ref = _send_twilio(channel, to, body) if provider == "twilio" else _send_msg91(channel, to, body, event, params)
    except Exception as exc:  # delivery failures are recorded, never raised into the banking flow
        status, error = "FAILED", str(exc)[:500]
        logger.warning("Notification %s via %s failed: %s", record_id, provider, exc)
    with db.runtime.sessions.begin() as session:
        row = session.get(NotificationRecord, record_id)
        row.status, row.provider_ref, row.error, row.updated_at = status, ref, error, utc_dt()


def phone_for(db, customer_id: Optional[str]) -> Optional[str]:
    """A customer's mobile: the banking record keeps only a masked copy, the sign-in profile holds the number."""
    if not customer_id:
        return None
    from sqlalchemy import select
    from persistence import UserRecord
    number = (db.get_customer(customer_id) or {}).get("phone_number")
    if number:
        return number
    with db.runtime.sessions() as session:
        return session.scalar(select(UserRecord.phone_number).where(UserRecord.customer_id == customer_id,
                                                                     UserRecord.phone_number.is_not(None)))


def _channels(db, customer_id: Optional[str]) -> Iterable[str]:
    yield "SMS"
    if customer_id and (db.snapshot().get("preferences", {}).get(customer_id) or {}).get("whatsapp_updates"):
        yield "WHATSAPP"


def notify(db, event: str, phone: Optional[str], *, customer_id: Optional[str] = None,
           reference: Optional[str] = None, **params: Any) -> list[str]:
    """Record (and, with a provider configured, send) one customer notification. Never raises."""
    try:
        if not phone:
            return []
        body = render(event, ref=reference or "", **params)
        provider = _provider()
        ids = []
        for channel in _channels(db, customer_id):
            record_id = f"NTF-{uuid.uuid4().hex[:16].upper()}"
            with db.runtime.sessions.begin() as session:
                session.add(NotificationRecord(id=record_id, event=event, channel=channel, recipient=phone, customer_id=customer_id,
                                               reference=reference, body=body, provider=provider,
                                               status="QUEUED_LOCAL" if provider == "local" else "SENDING"))
            if provider != "local":
                threading.Thread(target=_dispatch, args=(db, record_id, provider, channel, phone, body, event, params), daemon=True).start()
            ids.append(record_id)
        return ids
    except Exception as exc:
        logger.warning("Notification %s not recorded: %s", event, exc)
        return []


def recent(db, limit: int = 100, customer_id: Optional[str] = None) -> list[dict]:
    from sqlalchemy import select
    with db.runtime.sessions() as session:
        query = select(NotificationRecord).order_by(NotificationRecord.created_at.desc()).limit(limit)
        if customer_id:
            query = query.where(NotificationRecord.customer_id == customer_id)
        mask = lambda number: number[:3] + "•" * max(0, len(number) - 7) + number[-4:]
        return [{"id": r.id, "event": r.event, "channel": r.channel, "recipient": mask(r.recipient),
                 "reference": r.reference, "body": r.body, "provider": r.provider, "status": r.status, "error": r.error,
                 "created_at": r.created_at.isoformat()} for r in session.scalars(query)]
