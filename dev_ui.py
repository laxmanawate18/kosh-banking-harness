#!/usr/bin/env python3
"""Kosh: secure agentic banking powered by Mitra and Kavach."""

from __future__ import annotations

import asyncio
import mimetypes
import os
import urllib.parse
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from dotenv import load_dotenv
if os.getenv("SKIP_DOTENV") != "1":
    load_dotenv()

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from google.antigravity import Agent

from backend.auth_routes import make_auth_router
from backend.oauth_routes import make_oauth_router
from backend.chat_runtime import serve_chat_websocket
from backend.public_routes import make_public_router
from backend.session_routes import make_session_router
from backend.settings import ALLOWED_ORIGINS, DEFAULT_MODEL, FRONTEND_DIST
from banking_db import db
from banking_tools import banking_service
from auth_service import AuthContext, AuthService, COOKIE_NAME
from oauth_service import OAuthService
from service_requests import ServiceRequestService
from banking_workflows import WorkflowService, make_workflow_router
from rpa.cbs_mock_server import cbs_router
from rpa.job_dispatcher import get_job_queue
from account_applications import AccountApplicationService, link_existing_customers
from backend.mcp_gateway import mount as mount_mcp_gateway


@asynccontextmanager
async def lifespan(application: FastAPI):
    del application
    try:
        from knowledge_service import ingest_documents
        ingest_documents()
    except Exception as exc:
        print(f"Bank knowledge ingestion warning: {exc}")
    port = int(os.getenv("PORT", "8000"))
    cbs_base_url = os.getenv("CBS_BASE_URL", f"http://127.0.0.1:{port}")
    get_job_queue().start_worker(cbs_base_url=cbs_base_url, result_handler=request_service.apply_rpa_result,
                                 claim_handler=request_service.claim_for_rpa)
    try:
        requeued = request_service.requeue_rpa()
        if requeued:
            print(f"RPA: re-queued {len(requeued)} approved request(s) after restart")
    except Exception as exc:
        print(f"RPA requeue notice: {exc}")
    start_account_opening()
    from backend import mitra_ops
    try:
        mitra_ops.set_current_version(mitra_ops.register_prompt_version(db, DEFAULT_MODEL)["version"])
    except Exception as exc:
        print(f"Prompt registry notice: {exc}")

    async def retention_loop():
        while True:
            try:
                from backend import rate_limit
                rate_limit.purge(db)
                purged = mitra_ops.purge_expired(db)
                if any(purged.values()):
                    print(f"Retention purge: {purged}")
            except Exception as exc:
                print(f"Retention purge notice: {exc}")
            await asyncio.sleep(24 * 3600)
    retention_task = asyncio.create_task(retention_loop())

    async def reconciliation_loop():
        # Settles payments left mid-post within minutes, and reports any mismatch with the core's journal.
        from core_banking import reconcile
        while True:
            await asyncio.sleep(300)
            try:
                report = await asyncio.to_thread(reconcile, db, banking_service.core)
                if not report["balanced"] or report["settled"]:
                    print(f"Reconciliation: {len(report['issues'])} issue(s), {len(report['settled'])} settled")
            except Exception as exc:
                print(f"Reconciliation notice: {exc}")
    reconciliation_task = asyncio.create_task(reconciliation_loop())

    async def loop_watchdog():
        # Logs when something blocks the event loop (every chat on this instance waits while it is blocked).
        loop = asyncio.get_running_loop()
        while True:
            started = loop.time()
            await asyncio.sleep(1)
            lag = loop.time() - started - 1
            if lag > 2:
                print(f"Event loop blocked for {lag:.1f}s")
    watchdog_task = asyncio.create_task(loop_watchdog())
    sync_worker = None
    if os.getenv("ENABLE_CLOUD_SQL_SYNC", "false").lower() in ("1", "true", "yes"):
        try:
            from scripts.sync_db import start_background_replicator
            cloud_url = os.getenv("CLOUD_SQL_DATABASE_URL")
            local_url = os.getenv("SENTINEL_DATABASE_URL")
            if cloud_url and local_url and cloud_url != local_url:
                sync_worker = start_background_replicator(cloud_url=cloud_url, local_url=local_url, interval=10)
        except Exception as exc:
            print(f"Cloud SQL replicator notice: {exc}")

    async with mcp_gateway.session_manager.run():
        yield
    retention_task.cancel()
    reconciliation_task.cancel()
    watchdog_task.cancel()
    if sync_worker:
        sync_worker.stop()
    get_job_queue().stop_worker()


app = FastAPI(title="Kosh Digital Banking", lifespan=lifespan)
app.include_router(cbs_router)
limiter = Limiter(key_func=get_remote_address, headers_enabled=True)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"],
                   allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"])

mimetypes.add_type("image/webp", ".webp")  # slim Linux images lack it; with nosniff, Safari would refuse the photos
# Everything Vite copies into dist/ (hashed assets, public/ photos, favicon, icon sprite) is served as-is.
for _item in sorted(FRONTEND_DIST.iterdir()) if FRONTEND_DIST.exists() else []:
    if _item.is_dir():
        app.mount(f"/{_item.name}", StaticFiles(directory=str(_item)), name=f"frontend_{_item.name}")
    elif _item.name != "index.html":
        app.add_api_route(f"/{_item.name}", lambda _path=_item: FileResponse(_path), methods=["GET"], include_in_schema=False)
auth_service = AuthService(db.runtime)
oauth_service = OAuthService(auth_service)
mcp_gateway = mount_mcp_gateway(app, oauth_service, public_url=os.getenv("SENTINEL_PUBLIC_URL", "http://127.0.0.1:8017"))

request_service = ServiceRequestService(db)
workflow_service = WorkflowService(db)
account_applications = AccountApplicationService(db, auth_service=auth_service)


def start_account_opening() -> None:
    """The legacy core (127.0.0.1 only) and the robot that keys approved applications into it. In production the core
    needs its own database (LEGACY_CBS_DATABASE_URL); without it the robot stays off and approved applications wait,
    visibly queued, instead of the app failing to start."""
    try:
        linked = link_existing_customers(db)
        if linked:
            print(f"Account opening: linked {linked} existing record(s) to their core identifiers")
        from legacy_cbs import server as legacy_core
        from rpa.account_worker import AccountRobotWorker
        worker = AccountRobotWorker(account_applications, db, legacy_core.start_in_background())
        account_applications.on_queued = worker.enqueue
        account_applications.worker = worker
        worker.start()
        requeued = account_applications.requeue_stale()
        if requeued:
            print(f"Account opening: re-queued {len(requeued)} application(s) for the core")
    except Exception as exc:
        print(f"Account opening robot is OFF: {exc}")
app.include_router(make_public_router(db, auth_service, limiter, account_applications))

_CANONICAL = urllib.parse.urlsplit(os.getenv("SENTINEL_PUBLIC_URL", ""))


@app.middleware("http")
async def canonical_host(request: Request, call_next):
    # Browsers that open the service's run.app address go to the public domain (SENTINEL_PUBLIC_URL). Google Safe
    # Browsing has flagged the run.app address; APIs, the agent gateway and service-to-service calls are left alone.
    host = request.headers.get("host", "")
    if (_CANONICAL.netloc and host.endswith(".run.app") and host != _CANONICAL.netloc and request.method in ("GET", "HEAD")
            and not request.url.path.startswith(("/api/", "/mcp", "/.well-known/"))):
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"{_CANONICAL.scheme}://{_CANONICAL.netloc}{request.url.path}{query}", status_code=301)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Camera (UPI QR scan) and microphone (Mitra voice messages) for this origin only; never for embedded sites.
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' ws: wss: https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.gstatic.com https://recaptchaenterprise.googleapis.com; "
        "frame-src 'self' https://www.google.com https://www.recaptcha.net https://*.firebaseapp.com; "
        "img-src 'self' data: https://www.gstatic.com; "
        "media-src 'self' blob:; "  # Mitra's Gemini voice replies play from same-origin blob URLs
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    return response


def _resolve_request_auth(request: Request, sentinel_session: Optional[str]) -> AuthContext | None:
    authorization = request.headers.get("authorization", "")
    if authorization:
        scheme, _, credential = authorization.partition(" ")
        if scheme.lower() != "bearer" or not credential:
            return None
        try:
            return oauth_service.context_from_access_token(credential)
        except PermissionError:
            return None
    if not sentinel_session:
        return None
    context = auth_service.resolve(sentinel_session)
    if not context:
        return None
    context = oauth_service.enrich_cookie_context(context)
    if not context.client_id:
        return None
    return context


def require_auth(request: Request, sentinel_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)) -> AuthContext:
    context = _resolve_request_auth(request, sentinel_session)
    if not context:
        raise HTTPException(status_code=401, detail="Authentication required")
    return context


def require_customer(context: AuthContext = Depends(require_auth)) -> AuthContext:
    if context.role != "CUSTOMER" or not context.customer_id:
        raise HTTPException(status_code=403, detail="Customer access required")
    if "banking.read" not in context.scopes:
        raise HTTPException(status_code=403, detail="banking.read scope required")
    return context


def require_officer(context: AuthContext = Depends(require_auth)) -> AuthContext:
    if context.role != "OFFICER":
        raise HTTPException(status_code=403, detail="Officer access required")
    return context


def require_admin(context: AuthContext = Depends(require_auth)) -> AuthContext:
    """The AI and platform admin. Separate from bank officers: neither can do the other's approvals."""
    if context.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return context


def require_csrf(request: Request,
                 sentinel_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
                 x_csrf_token: Optional[str] = Header(default=None, alias="X-CSRF-Token")) -> AuthContext:
    context = _resolve_request_auth(request, sentinel_session)
    if not context:
        raise HTTPException(status_code=401, detail="Authentication required")
    if "banking.propose" not in context.scopes:
        raise HTTPException(status_code=403, detail="banking.propose scope required")
    if not request.headers.get("authorization") and (
        not sentinel_session or not auth_service.verify_csrf(sentinel_session, x_csrf_token)
    ):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    return context


def require_customer_csrf(context: AuthContext = Depends(require_csrf)) -> AuthContext:
    return require_customer(context)


def active_consent(context: AuthContext) -> Dict[str, Any]:
    consent = auth_service.active_consent(context.customer_id)
    if not consent:
        raise HTTPException(status_code=403, detail={"code": "CONSENT_REQUIRED", "message": "Explicit digital banking consent is required"})
    return consent


app.include_router(make_auth_router(
    db,
    banking_service,
    auth_service,
    limiter,
    require_auth,
    require_csrf,
    require_customer,
    require_customer_csrf,
    active_consent,
    oauth_service,
))
app.include_router(make_oauth_router(oauth_service, db, limiter))
app.include_router(make_session_router(
    db,
    request_service,
    require_auth,
    require_csrf,
    require_customer,
    require_customer_csrf,
    require_officer,
    active_consent,
    auth_service=auth_service,
    agent_factory=lambda config: Agent(config),  # looked up at call time, so tests can substitute the model
))


@app.get("/")
async def get_index(request: Request):
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    host = request.url.hostname or "localhost"
    return RedirectResponse(f"http://{host}:3000/", status_code=307)

from backend.admin_routes import make_admin_router
app.include_router(make_admin_router(db, require_admin, require_csrf))

from portal import make_portal_router
app.include_router(make_portal_router(db, banking_service, auth_service, request_service,
    require_customer, require_customer_csrf, require_officer, active_consent, limiter))
app.include_router(make_workflow_router(workflow_service, require_customer, require_customer_csrf,
    active_consent, require_officer, limiter))
from backend.ekyc import make_ekyc_router
app.include_router(make_ekyc_router(db, require_customer, require_customer_csrf, limiter))
from backend.account_application_routes import make_account_application_router
app.include_router(make_account_application_router(account_applications, db, require_officer, require_csrf))
from backend.applicant_routes import make_applicant_router
app.include_router(make_applicant_router(account_applications, db, auth_service, limiter, require_customer,
                                         require_customer_csrf, active_consent))


@app.websocket("/ws/chat")
async def chat_websocket(
    websocket: WebSocket,
    session_id: Optional[str] = None,
    ws_ticket: Optional[str] = None,
    visitor: Optional[str] = None,
):
    await serve_chat_websocket(
        websocket,
        session_id,
        db=db,
        auth_service=auth_service,
        workflow_service=workflow_service,
        agent_factory=lambda config: Agent(config),
        oauth_service=oauth_service,
        ws_ticket=ws_ticket,
        visitor=(str(visitor).lower() in ("true", "1", "yes") if visitor else False),
    )

def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("K_SERVICE") else "127.0.0.1")
    print(f"\nKosh digital banking: http://{host}:{port}\n")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
