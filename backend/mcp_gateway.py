"""Kosh MCP gateway: the one controlled entry point through which any external agent (Claude, Copilot, an officer
copilot) can use Kosh's banking tools.

Every call goes through the same controls as Mitra:
  OAuth bearer token from Kosh's authorization server, bound to one customer, with per-tool scopes
  the tool registry (declared tools only, typed and bounded arguments), the bank's kill switch and rate limits
  the tamper-evident audit trail (masked arguments, allow/deny, result)
  Sentinel for every money movement: an agent can only *propose*; the customer approves in Kavach on Kosh's own app.
"""

from __future__ import annotations

import asyncio
import contextvars
import functools
import uuid
from typing import Any, Callable, Dict

from google.antigravity import types
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

from backend import harness
from backend.agent_config import SecureToolGateHook, SessionPostToolCallHook, audit_tool_decision
from backend.chat_runtime import over_rate_limit
from banking_db import db
from banking_tools import build_banking_tools
from product_service import SalesSessionContext, build_public_sales_tools
from sentinel import IntentResolver

CHANNEL = "MCP"
# Tools Sentinel authorises, and the intent fields Sentinel compares with the proposed action.
SENTINEL_ACTIONS: Dict[str, Callable[[Dict[str, Any]], tuple]] = {
    "propose_transfer": lambda a: ("TRANSFER", {"amount_minor": a.get("amount_minor"), "beneficiary_id": a.get("beneficiary_id"),
                                                "source_account_id": str(a.get("source_account_id", "")).upper()}),
    "propose_bill_payment": lambda a: ("PAY_BILL", {"bill_id": a.get("bill_id"), "source_account_id": str(a.get("source_account_id", "")).upper()}),
    "freeze_card": lambda a: ("FREEZE_CARD", {"card_id": a.get("card_id")}),
}
_CALLER: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar("kosh_mcp_caller")


class KoshTokenVerifier:
    """Accepts only Kosh-issued access tokens that belong to a signed-in customer."""

    def __init__(self, oauth_service):
        self.oauth = oauth_service

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            context = await asyncio.to_thread(self.oauth.context_from_access_token, token, agent=True)
        except PermissionError:
            return None
        if not context or not context.customer_id:
            return None
        return AccessToken(token=token, client_id=context.client_id or "unknown", scopes=list(context.scopes),
                           subject=context.user_id, resource=self.oauth.mcp_audience,
                           claims={"customer_id": context.customer_id, "assurance_level": context.assurance_level})


def _caller() -> Dict[str, Any]:
    token = get_access_token()
    if token is None or not (token.claims or {}).get("customer_id"):
        raise PermissionError("AUTH_REQUIRED")
    return {"session_id": f"MCP-{token.client_id}-{token.subject}"[:80], "user_id": token.subject,
            "customer_id": token.claims["customer_id"], "scopes": list(token.scopes),
            "device_id": f"MCP-CLIENT-{token.client_id}", "channel": CHANNEL}


def _refused(message: str) -> Dict[str, Any]:
    return {"success": False, "error": message}


def _expose(server: MCPServer, name: str, fn: Callable[..., Any], spec: Dict[str, Any]) -> None:
    @functools.wraps(fn)  # the MCP schema is the real tool's signature; the registry then checks values
    async def call(**kwargs: Any) -> Any:
        caller = _caller()
        if CHANNEL in db.get_controls().get("disabled_channels", []):
            return _refused("TOOL_PAUSED: The bank has paused agent access. Try again later or use the Kosh app.")
        if over_rate_limit(f"mcp:{caller['user_id']}"):
            return _refused("RATE_LIMITED: Too many requests. Wait a minute and try again.")
        request = types.ToolCall(name=name, args=kwargs, id=f"mcp-{uuid.uuid4().hex[:12]}")
        result = SecureToolGateHook(caller).decide(request)
        decision = audit_tool_decision(caller["session_id"], caller["customer_id"], request, result, caller.pop("last_consent_id", None))
        if not decision.allow:
            return _refused(decision.message or "Denied")
        if name in SENTINEL_ACTIONS:  # no customer text exists in Kosh, so the intent is the agent's exact request
            family, fields = SENTINEL_ACTIONS[name](kwargs)
            caller["intent"] = await asyncio.to_thread(IntentResolver().bind_external, family, fields, caller["session_id"],
                                                       caller["customer_id"], f"assistant app {caller['session_id']}")
        token = _CALLER.set(caller)
        try:
            result = await asyncio.to_thread(fn, **kwargs)  # to_thread copies the context, so the tool sees the caller
            outcome = types.ToolResult(name=name, id=request.id, result=result)
        except Exception as exc:
            result, outcome = _refused(type(exc).__name__), types.ToolResult(name=name, id=request.id, error=str(exc))
        finally:
            _CALLER.reset(token)
        await SessionPostToolCallHook(caller["session_id"], caller["customer_id"]).run(None, outcome)
        return result

    note = {"customer": " The customer must approve it in Kavach on the Kosh app; this tool only proposes it.",
            "officer": " A bank officer reviews it before it takes effect."}.get(spec["approval"], "")
    server.add_tool(call, name=name, description=spec["description"] + "." + note, annotations=ToolAnnotations(
        readOnlyHint=spec["effect"] == "read", destructiveHint=spec["effect"] == "money", openWorldHint=False))


def build_gateway(oauth_service) -> MCPServer:
    server = MCPServer(
        name="kosh-banking",
        instructions="Kosh banking tools for one signed-in customer. Money can only be proposed; the customer approves "
                     "every payment in Kavach on the Kosh app. Never ask the customer for an OTP, PIN or password.",
        token_verifier=KoshTokenVerifier(oauth_service),
        auth=AuthSettings(issuer_url=oauth_service.issuer, resource_server_url=oauth_service.mcp_audience,
                          required_scopes=["banking.read"], validate_token_resource=False),  # the verifier checks the Kosh API audience
    )
    functions = {t.__name__: t for t in build_public_sales_tools(lambda: SalesSessionContext())}
    functions.update({t.__name__: t for t in build_banking_tools(lambda: _CALLER.get())})
    for name, spec in harness.tools("customer").items():
        _expose(server, name, functions[name], spec)
    return server


def mount(app, oauth_service, *, public_url: str) -> MCPServer:
    """Serve the gateway at /mcp on the main app (stateless, so any instance can answer). Run `session_manager` in the lifespan."""
    from urllib.parse import urlparse
    from mcp.server.transport_security import TransportSecuritySettings
    server = build_gateway(oauth_service)
    public = urlparse(public_url)
    hosts = [public.netloc, "127.0.0.1:*", "localhost:*", "testserver"]  # DNS-rebinding protection: Kosh's own hosts only
    gateway = server.streamable_http_app(streamable_http_path="/mcp", stateless_http=True, transport_security=TransportSecuritySettings(
        allowed_hosts=hosts, allowed_origins=[f"{public.scheme}://{public.netloc}", "http://127.0.0.1:*", "http://localhost:*"]))
    from starlette.routing import Route
    routes = []
    for route in gateway.routes:  # each route keeps the gateway's own middleware (bearer authentication)
        endpoint = route.app
        for middleware in reversed(gateway.user_middleware):
            endpoint = middleware.cls(endpoint, *middleware.args, **middleware.kwargs)
        routes.append(Route(route.path, endpoint=endpoint, methods=route.methods))
    app.router.routes[0:0] = routes  # ahead of the SPA catch-all
    return server
