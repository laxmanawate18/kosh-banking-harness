"""Officer copilot: the second agent on the banking harness, built from config.

Its tools are declared in the `officer` channel of config/harness/tools.json, its instructions live in
config/harness/agents/officer_copilot.md, and it runs through the shared gate, audit, kill switch and model settings.
It reads the queue and drafts recommendations; only the officer decides. Results are masked before the model sees them.
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import uuid
from typing import Any, Callable, Dict, List

from sqlalchemy import select

from backend import care
from backend.agent_config import create_harness_agent_config
from backend.harness import REGISTRY_PATH
from backend.mitra_ops import mask_deep
from persistence import ServiceRequestRecord, utc_dt

CHANNEL = "officer"
INSTRUCTIONS_PATH = REGISTRY_PATH.parent / "agents" / "officer_copilot.md"
SCOPES = ["officer.read", "officer.draft"]
TURN_SECONDS = 60


def instructions() -> str:
    return INSTRUCTIONS_PATH.read_text(encoding="utf-8")


def instructions_version() -> str:
    return hashlib.sha256(INSTRUCTIONS_PATH.read_bytes()).hexdigest()[:12]


def build_officer_tools(db, request_service, officer_user_id: str) -> List[Callable[..., Dict[str, Any]]]:
    def masked(fn):  # data minimisation: identifiers are masked before results reach the model
        @functools.wraps(fn)
        def call(**kwargs):
            return mask_deep(fn(**kwargs))
        return call

    def list_pending_requests(status: str = "", limit: int = 20) -> dict:
        """Service requests waiting for an officer decision, newest first."""
        statuses = [status] if status else ["PENDING_APPROVAL", "ESCALATED", "MORE_INFO_REQUIRED", "RPA_FAILED"]
        with db.runtime.sessions() as session:
            rows = session.scalars(select(ServiceRequestRecord).where(ServiceRequestRecord.status.in_(statuses))
                                   .order_by(ServiceRequestRecord.updated_at.desc()).limit(limit)).all()
            return {"requests": [{"id": r.id, "customer_id": r.customer_id, "service_id": r.service_id, "status": r.status,
                                  "discrepancies": len(r.discrepancy_flags or []), "updated_at": r.updated_at.isoformat()} for r in rows]}

    def get_request_details(request_id: str) -> dict:
        """Collected data, findings, discrepancies, confidence scores and status of one request."""
        request = request_service.get(request_id.upper())
        if not request:
            return {"error": "Request not found"}
        request.pop("rpa_job", None)
        return request

    def get_customer_profile(customer_id: str) -> dict:
        """A customer's KYC standing, risk category and accounts."""
        customer = db.get_customer(customer_id.upper())
        if not customer:
            return {"error": "Customer not found"}
        kyc = db.get_kyc_profile(customer["id"])
        accounts = [a for a in db.snapshot().get("accounts", {}).values() if a.get("customer_id") == customer["id"]]
        return {"customer_id": customer["id"], "name": customer.get("full_name") or customer.get("display_name"),
                "kyc_status": kyc.get("status"), "kyc_type": kyc.get("kyc_type"), "risk_category": kyc.get("risk_category"),
                "pending_requirements": kyc.get("pending_requirements"),
                "accounts": [{"id": a["id"], "type": a.get("type"), "status": a.get("status"),
                              "account_number_masked": a.get("account_number_masked")} for a in accounts]}

    def list_care_cases(status: str = "OPEN") -> dict:
        """Customer-care cases (complaints, fraud reports, callbacks, hardship)."""
        return {"cases": care.list_cases(db, status=status or None, limit=30)}

    def get_last_reconciliation() -> dict:
        """The latest reconciliation report between Kosh and the core banking journal."""
        runs = [e for e in db.get_audit_events(limit=250) if e["event_type"] == "RECONCILIATION_RUN"]
        return runs[0]["details"] if runs else {"message": "No reconciliation has run yet"}

    def verify_audit_trail() -> dict:
        """Re-check the tamper-evident audit chain."""
        return db.verify_audit_chain()

    def query_bank_knowledge(query: str, category: str = "") -> dict:
        """Search Kosh's policy and help documents."""
        from knowledge_service import query_bank_knowledge as search
        return search(query, category)

    def draft_decision_note(request_id: str, recommendation: str, reasoning: str) -> dict:
        """Record a draft recommendation on a request for the officer. It is not a decision."""
        with db.runtime.sessions.begin() as session:
            row = session.get(ServiceRequestRecord, request_id.upper())
            if not row:
                return {"error": "Request not found"}
            note = {"type": "COPILOT_DRAFT", "recommendation": recommendation, "reasoning": reasoning[:1000],
                    "for_officer": officer_user_id, "at": utc_dt().isoformat(), "status": "DRAFT_NOT_A_DECISION"}
            row.findings = [*(row.findings or []), note]
        db.append_audit("COPILOT_DRAFT_RECORDED", actor="agent", approval_request_id=request_id.upper(), approver_id=officer_user_id,
                        summary=f"Officer copilot drafted {recommendation} (not a decision)", details=note)
        return {"recorded": True, "note": "Draft saved for the officer. Only the officer can decide."}

    return [masked(fn) for fn in (list_pending_requests, get_request_details, get_customer_profile, list_care_cases,
                                  get_last_reconciliation, verify_audit_trail, query_bank_knowledge)] + [draft_decision_note]


async def ask(agent_factory, db, request_service, *, officer_user_id: str, message: str,
              history: List[Dict[str, str]], request_id: str | None = None) -> Dict[str, Any]:
    """One copilot turn. The server keeps no conversation: the console sends the last few messages back."""
    session_id = f"OFFICER-{officer_user_id}-{uuid.uuid4().hex[:8]}"
    context = {"session_id": session_id, "user_id": officer_user_id, "customer_id": None, "scopes": SCOPES, "tool_calls_this_turn": 0}
    config = create_harness_agent_config(CHANNEL, session_id, instructions(), build_officer_tools(db, request_service, officer_user_id), context)
    lines = [f"{m.get('role')}: {str(m.get('text', ''))[:800]}" for m in history[-10:] if m.get("text")]
    prompt = ((("Earlier in this conversation (context only):\n" + "\n".join(lines) + "\n\n") if lines else "")
              + (f"The officer is looking at request {request_id}.\n\n" if request_id else "") + f"Officer: {message}")
    from google.antigravity import types
    text, tools_used = "", []
    async with agent_factory(config) as agent:
        async def run():
            nonlocal text
            response = await agent.chat(prompt)
            async for chunk in response.chunks:
                if isinstance(chunk, types.Text) and chunk.text:
                    text += chunk.text
                elif isinstance(chunk, types.ToolCall):
                    tools_used.append(str(chunk.name))
        await asyncio.wait_for(run(), TURN_SECONDS)
    db.append_audit("COPILOT_TURN", actor="officer", approver_id=officer_user_id, session_id=session_id,
                    summary="Officer copilot answered", details={"tools": tools_used, "instructions_version": instructions_version()})
    return {"reply": mask_deep(text.strip()), "tools": tools_used, "instructions_version": instructions_version()}
