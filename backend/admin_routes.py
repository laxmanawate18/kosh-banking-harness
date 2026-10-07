"""Admin Panel API: the AI and platform admin governs Mitra; bank officers never see or approve any of it.

Skills and tools, connected systems, the banking ontology (with per-process approval), usage, latency and estimated cost,
Mitra quality, prompt-version approval, kill switches, the audit-chain check, and the second approval on customer
deletions that an officer requested. Every route needs the ADMIN role; every change needs the CSRF token and is audited.
"""

from __future__ import annotations

import asyncio
import os
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from backend import harness, mitra_ops, ontology
from backend.api_models import HarnessControlsRequest
from persistence import Base, CustomerDeletionRecord, MitraTurnRecord, OntologyApprovalRecord, utc_dt


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _note(req: dict, minimum: int = 5) -> str:
    note = str(req.get("note", "")).strip()[:500]
    if len(note) < minimum:
        raise HTTPException(status_code=400, detail=f"Add a note on what you reviewed (at least {minimum} characters)")
    return note


def _reachable(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2):
            return True
    except Exception:
        return False


def data_sources(db) -> list:
    """The systems Kosh is connected to, with how each is configured. Names and settings only, never secrets or URLs
    with credentials."""
    from backend.settings import DEFAULT_LOCATION, DEFAULT_MODEL, DEFAULT_PROJECT_ID, FALLBACK_MODEL, USE_VERTEXAI
    from knowledge_service import DOCS_DIR
    env = os.getenv
    database = "PostgreSQL (Cloud SQL)" if db.runtime.url.startswith("postgres") else "SQLite (local development)"
    auth_url = env("BETTER_AUTH_URL", "http://127.0.0.1:8020").rstrip("/")
    vertex = USE_VERTEXAI or not (env("GEMINI_API_KEY") or env("GOOGLE_API_KEY"))
    processor = env("SENTINEL_DOCUMENT_AI_PROCESSOR", "")
    channels = {c: len(harness.tools(c)) for c in harness.registry()["channels"]}
    rows = [
        ("Kosh banking database", "Database", f"{database} · {len(Base.metadata.tables)} tables", "connected"),
        ("Sign-in server (Better Auth)", "Identity", "Customer, officer and admin sign-in; OAuth for outside agents",
         "connected" if _reachable(f"{auth_url}/healthz") else "unreachable"),
        ("Gemini" + (" on Vertex AI" if vertex else " API (consumer endpoint)"), "AI model",
         f"{DEFAULT_MODEL} · project {DEFAULT_PROJECT_ID} · {DEFAULT_LOCATION}" + (f" · backup {FALLBACK_MODEL}" if FALLBACK_MODEL else " · no backup model"),
         "configured"),
        ("Cloud Speech-to-Text", "Voice", f"{env('KOSH_SPEECH_MODEL', 'chirp_2')} · {env('KOSH_SPEECH_LOCATION', 'asia-southeast1')}", "configured"),
        ("Cloud Text-to-Speech", "Voice", "Reads Mitra's replies aloud", "configured"),
        ("Document AI" if processor else "Cloud Vision OCR", "Documents", "Reads uploaded KYC documents; the text never reaches Gemini", "configured"),
        ("eKYC provider", "Identity verification", env("EKYC_PROVIDER", "sandbox"), "configured" if env("EKYC_PROVIDER", "sandbox") != "sandbox" else "sandbox"),
        ("Core banking", "Core banking", f"Adapter: {env('CORE_BANKING_ADAPTER', 'mock')} · account opening entered by the RPA robot", "configured"),
        ("Bank knowledge base", "Documents", f"{len(list(DOCS_DIR.glob('*.md')))} policy and help documents · full-text search", "connected"),
        ("Notifications", "Messaging", env("NOTIFY_PROVIDER", "") or "Outbox only (nothing sent)", "configured" if env("NOTIFY_PROVIDER") else "not configured"),
        ("Cloud SQL sync", "Database", "Copies local changes to Cloud SQL", "on" if env("ENABLE_CLOUD_SQL_SYNC", "").lower() == "true" else "off"),
        ("MCP gateway", "Outside AI agents", f"{channels.get('customer', 0)} customer tools, OAuth and the same gate as Mitra", "configured"),
    ]
    return [dict(zip(("name", "kind", "detail", "status"), r)) for r in rows]


def skills() -> dict:
    """Mitra's skills (guided forms and chat guides) and the tools each agent may call, from the code and the registry."""
    from pathlib import Path
    from workflow_catalogue import CORE_SKILLS, WORKFLOWS
    root = Path(__file__).resolve().parent.parent / "skills"
    owner = lambda key: next((p.id for p in ontology.load().values() if key in p.skills), None)
    items = [{"id": k, "name": v["name"], "kind": "Guided form", "description": v["description"], "level": v["level"],
              "service_id": v["service_id"], "process": owner(k), "guide": (root / v["skill"] / "SKILL.md").exists()}
             for k, v in WORKFLOWS.items()]
    items += [{"id": k, "name": v["name"], "kind": "Chat guide", "description": v["description"], "level": None, "service_id": None,
               "process": owner(k), "guide": (root / v["skill"] / "SKILL.md").exists()} for k, v in CORE_SKILLS.items()]
    tools = [{"channel": channel, "name": name, "description": spec["description"], "effect": spec["effect"], "risk": spec["risk"],
              "approval": spec["approval"], "consent": spec.get("consent"),
              # what the model may read back: "public" catalogue data in full, or the declared fields only
              "model_view": spec["model_view"] if isinstance(spec["model_view"], str) else f"{len(spec['model_view'].get('fields', []))} fields"}
             for channel, specs in harness.registry()["channels"].items() for name, spec in specs.items()]
    return {"skills": items, "tools": tools, "registry_version": harness.registry()["version"]}


def make_admin_router(db, require_admin, require_csrf):
    router = APIRouter(prefix="/api/admin")

    @router.get("/skills")
    async def admin_skills(context=Depends(require_admin)):
        return {**skills(), "disabled_tools": db.get_controls().get("disabled_tools", [])}

    @router.get("/data-sources")
    async def admin_data_sources(context=Depends(require_admin)):
        return {"sources": await asyncio.to_thread(data_sources, db)}

    @router.get("/ontology")
    async def admin_ontology(context=Depends(require_admin)):
        from backend.settings import PRODUCTION
        since = datetime.now(timezone.utc) - timedelta(days=7)
        with db.runtime.sessions() as s:
            used = Counter(s.scalars(select(MitraTurnRecord.process_id).where(MitraTurnRecord.created_at >= since)).all())
            approvals = s.scalars(select(OntologyApprovalRecord).order_by(OntologyApprovalRecord.approved_at.desc())).all()
        latest = {}
        for a in approvals:
            latest.setdefault((a.process_id, a.content_hash), a)
        processes = []
        for p in ontology.load().values():
            current = latest.get((p.id, ontology.content_hash(p.id)))
            processes.append({"id": p.id, "name": p.name, "domain": p.domain, "kosh_status": p.kosh_status, "file_status": p.status,
                              "channels": sorted(p.channels), "tools": sorted(p.tools), "skills": sorted(p.skills),
                              "content_hash": ontology.content_hash(p.id), "turns_7d": used.get(p.id, 0),
                              "approval": current and {"by": current.approved_by, "at": current.approved_at.isoformat(), "note": current.note},
                              "earlier_version_approved": any(k[0] == p.id for k in latest) and not current})
        return {"mode": ontology.MODE, "production": PRODUCTION, "version": ontology.version(),
                "unrouted_turns_7d": used.get(None, 0), "processes": sorted(processes, key=lambda x: (x["domain"], x["name"]))}

    @router.get("/ontology/{process_id}")
    async def admin_ontology_process(process_id: str, context=Depends(require_admin)):
        if process_id not in ontology.load():
            raise HTTPException(status_code=404, detail="Process not found")
        p = ontology.load()[process_id]
        return {"id": p.id, "name": p.name, "model_view": ontology.view(p.id), "note": p.note, "tables": list(p.tables),
                "services": sorted(p.services), "care": list(p.care), "activities": list(p.activities)}

    @router.post("/ontology/{process_id}/approve")
    async def admin_approve_process(process_id: str, req: dict, context=Depends(require_csrf)):
        require_admin(context)
        if process_id not in ontology.load():
            raise HTTPException(status_code=404, detail="Process not found")
        return ontology.record_approval(db, process_id, context.user_id, _note(req))

    @router.get("/usage")
    async def admin_usage(days: int = 7, context=Depends(require_admin)):
        return await asyncio.to_thread(mitra_ops.usage, db, max(1, min(days, 90)))

    @router.get("/quality")
    async def admin_quality(days: int = 7, context=Depends(require_admin)):
        return {**mitra_ops.quality(db, max(1, min(days, 90))), "registry": mitra_ops.registry(db)[:10]}

    @router.post("/ai-registry/{record_id}/approve")
    async def admin_approve_prompt(record_id: str, req: dict, context=Depends(require_csrf)):
        require_admin(context)
        note = str(req.get("note", "")).strip()[:500]
        version = next((v for v in mitra_ops.registry(db) if v["id"] == record_id), None)
        if not version:
            raise HTTPException(status_code=404, detail="Version not found")
        latest = (version.get("evaluations") or [None])[-1]
        if not latest or mitra_ops.release_gate(latest):
            raise HTTPException(status_code=400, detail="This version cannot be approved: its latest evaluation run is missing or "
                                f"fails the release gate ({'; '.join(mitra_ops.release_gate(latest)) if latest else 'no run recorded'}).")
        mitra_ops.update_registry(db, record_id, approval={"by": context.user_id, "at": _now(), "note": note})
        db.append_audit("PROMPT_VERSION_APPROVED", actor="admin", approver_id=context.user_id, summary=f"Admin approved {record_id}",
                        details={"version": record_id, "evaluation": {k: latest.get(k) for k in ("at", "passed", "total", "pass_rate")}})
        return {"approved": record_id}

    @router.get("/controls")
    async def admin_get_controls(context=Depends(require_admin)):
        from banking_tools import BANKING_TOOL_NAMES
        from product_service import PUBLIC_SALES_TOOL_NAMES, VISITOR_APPLICATION_TOOL_NAMES
        return {**db.get_controls(), "channels": ["VISITOR", "CUSTOMER", "MCP", "OFFICER"],
                "tools": sorted(BANKING_TOOL_NAMES | PUBLIC_SALES_TOOL_NAMES | VISITOR_APPLICATION_TOOL_NAMES)}

    @router.put("/controls")
    async def admin_set_controls(req: HarnessControlsRequest, context=Depends(require_csrf)):
        require_admin(context)
        from banking_tools import BANKING_TOOL_NAMES
        from product_service import PUBLIC_SALES_TOOL_NAMES, VISITOR_APPLICATION_TOOL_NAMES
        unknown = (set(req.disabled_channels) - {"VISITOR", "CUSTOMER", "MCP", "OFFICER"}) | (
            set(req.disabled_tools) - BANKING_TOOL_NAMES - PUBLIC_SALES_TOOL_NAMES - VISITOR_APPLICATION_TOOL_NAMES)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown channels or tools: {sorted(unknown)}")
        return db.set_controls(disabled_channels=req.disabled_channels, disabled_tools=req.disabled_tools,
                               reason=req.reason.strip(), officer_user_id=context.user_id)

    @router.get("/audit/verify")
    async def admin_verify_audit(context=Depends(require_admin)):
        return await asyncio.to_thread(db.verify_audit_chain)

    @router.get("/approvals")
    async def admin_approvals(context=Depends(require_admin)):
        prompts = [{"id": v["id"], "version": v["version"], "model": v["model"], "created_at": v["created_at"],
                    "evaluation": (v.get("evaluations") or [None])[-1],
                    "gate": mitra_ops.release_gate(v["evaluations"][-1]) if v.get("evaluations") else ["no evaluation recorded"]}
                   for v in mitra_ops.registry(db) if v["active"] and not v.get("approval")]
        processes = [{"id": p.id, "name": p.name, "kosh_status": p.kosh_status} for p in ontology.load().values()
                     if not ontology.approved(p.id)]
        with db.runtime.sessions() as s:
            deletions = s.scalars(select(CustomerDeletionRecord).order_by(CustomerDeletionRecord.created_at.desc()).limit(50)).all()
        return {"prompt_versions": prompts, "processes": processes,
                "deletions": [{"id": d.id, "customer_id": d.customer_id, "status": d.status, "requested_by": d.requested_by,
                               "reason": d.reason, "created_at": d.created_at.isoformat(), "decided_by": d.decided_by,
                               "decision_note": d.decision_note, "result": d.result} for d in deletions]}

    @router.post("/deletions/{request_id}/decision")
    async def admin_decide_deletion(request_id: str, req: dict, context=Depends(require_csrf)):
        """The second person: approve to remove the customer's access and contact details, or reject."""
        require_admin(context)
        decision = str(req.get("decision", "")).upper()
        if decision not in {"APPROVE", "REJECT"}:
            raise HTTPException(status_code=400, detail="decision must be APPROVE or REJECT")
        note = _note(req)
        with db.runtime.sessions.begin() as s:
            row = s.get(CustomerDeletionRecord, request_id, with_for_update=True)
            if not row:
                raise HTTPException(status_code=404, detail="Request not found")
            if row.status != "PENDING":
                raise HTTPException(status_code=409, detail=f"This request is already {row.status.lower()}")
            if row.requested_by == context.user_id:
                raise HTTPException(status_code=403, detail="The person who asked cannot approve their own request")
            row.status = "IN_PROGRESS" if decision == "APPROVE" else "REJECTED"  # claimed: a second click cannot run it twice
            row.decided_by, row.decision_note, row.decided_at = context.user_id, note, utc_dt()
            customer_id = row.customer_id
        if decision == "REJECT":
            db.append_audit("CUSTOMER_DELETION_REJECTED", actor="admin", approver_id=context.user_id, approval_request_id=request_id,
                            customer_id=customer_id, summary="Admin rejected a customer deletion request", details={"request": request_id})
            return {"id": request_id, "status": "REJECTED"}
        from backend.session_routes import _auth_server
        result = await asyncio.to_thread(db.remove_customer_access, customer_id)
        logins = result.pop("_logins")
        signed_out = True  # the sign-in server matches the customer id, and each login's username and phone
        for login in logins or [{"username": "", "phone": ""}]:
            signed_out &= _auth_server("wipe-user", {"sentinelUserId": customer_id, "username": login["username"] or "",
                                                     "phoneNumber": login["phone"] or ""})
        result["sign_in_server"] = "removed" if signed_out else "FAILED: retry from the sign-in server"
        with db.runtime.sessions.begin() as s:
            row = s.get(CustomerDeletionRecord, request_id)
            row.status, row.result = "COMPLETED", result
        db.append_audit("CUSTOMER_ACCESS_REMOVED", actor="admin", approver_id=context.user_id, approval_request_id=request_id,
                        customer_id=customer_id, severity="WARNING",
                        summary="Customer access and contact details removed; regulated records kept",
                        details={"request": request_id, **result})  # counts only, no personal data
        return {"id": request_id, "status": "COMPLETED", "result": result}

    return router
