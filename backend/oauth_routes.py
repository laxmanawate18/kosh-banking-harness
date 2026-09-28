"""Kosh BFF authorization-code callbacks and chat OAuth handoff."""

from __future__ import annotations

import asyncio
import urllib.parse

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from auth_service import COOKIE_NAME, secure_cookie_enabled


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=secure_cookie_enabled(),
        samesite="lax",
        max_age=8 * 60 * 60,
        path="/",
    )


def make_oauth_router(oauth_service, db, limiter):
    router = APIRouter()

    @router.get("/api/auth/start")
    @limiter.limit("20/minute")
    async def start_auth(request: Request, return_to: str = Query(default="/")):
        del request
        try:
            url = oauth_service.begin_authorization(kind="web", return_to=return_to)
        except PermissionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return RedirectResponse(url, status_code=302)

    @router.get("/api/chat/auth/start")
    @limiter.limit("20/minute")
    async def start_chat_auth(
        request: Request,
        session_id: str = Query(min_length=8, max_length=80),
        return_to: str = Query(default="/"),
    ):
        del request
        try:
            url = oauth_service.begin_authorization(
                kind="chat", return_to=return_to, chat_session_id=session_id
            )
        except PermissionError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return RedirectResponse(url, status_code=302)

    async def finish(request: Request, code: str, state: str, *, chat: bool):
        try:
            state_row = oauth_service.consume_state(state)
            expected_chat = state_row.client_id == oauth_service.chat_client_id
            if expected_chat != chat:
                raise PermissionError("OAuth callback does not match the initiating client")
            tokens = await asyncio.to_thread(oauth_service.exchange_code, code, state_row)
            context, raw_cookie, _ = oauth_service.establish_bff_session(
                tokens,
                state_row,
                ip=request.client.host if request.client else "",
                user_agent=request.headers.get("user-agent", ""),
            )
            redirect_target = state_row.return_to
            if chat:
                oauth_service.transfer_chat(state_row.chat_session_id, context)
                ticket = oauth_service.create_websocket_ticket(context, state_row.chat_session_id)
                separator = "&" if "?" in redirect_target else "?"
                redirect_target = (
                    f"{redirect_target}{separator}chat_session_id="
                    f"{urllib.parse.quote(state_row.chat_session_id or '')}&ws_ticket={urllib.parse.quote(ticket)}"
                )
            response = RedirectResponse(redirect_target, status_code=302)
            _set_session_cookie(response, raw_cookie)
            db.append_audit(
                "OAUTH_AUTHENTICATION_SUCCEEDED",
                actor=context.role.lower(),
                session_id=context.session_id,
                summary="OIDC authorization code exchanged by Kosh BFF",
                details={
                    "user_id": context.user_id,
                    "client_id": state_row.client_id,
                    "scopes": list(context.scopes),
                    "chat_session_id": state_row.chat_session_id,
                },
            )
            return response
        except ConnectionError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @router.get("/api/auth/callback")
    @limiter.limit("30/minute")
    async def auth_callback(request: Request, code: str, state: str):
        return await finish(request, code, state, chat=False)

    @router.get("/api/chat/oauth/callback")
    @limiter.limit("30/minute")
    async def chat_callback(request: Request, code: str, state: str):
        return await finish(request, code, state, chat=True)

    return router
