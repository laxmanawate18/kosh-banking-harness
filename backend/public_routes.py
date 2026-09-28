"""Signed-out product catalogue, onboarding, and sales-chat routes."""

from __future__ import annotations

import os
import uuid
from typing import Callable

try:
    from asyncio import timeout as async_timeout
except ImportError:
    from async_timeout import timeout as async_timeout


from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from backend import voice
from backend.agent_config import create_agent_config, visitor_reply
from backend.api_models import ApplicationStatusRequest, ProductApplyRequest, PublicChatRequest, SpeakRequest
from backend.applications import application_status, bind as bind_applications, submit_application
from auth_service import AuthService
from product_service import (
    SalesSessionContext,
    auth_challenge_presentation,
    chat_text,
    extract_dynamic_suggestions,
    get_all_products,
    guarded_sales_prompt_reply,
    is_auth_required_reply,
    is_personal_banking_inquiry,
    leaks_internal_prompt,
    sales_advisor,
)


def make_public_router(db, auth_service: AuthService, limiter, agent_factory: Callable):
    router = APIRouter()
    bind_applications(db, auth_service)

    @router.get("/api/auth/public-config")
    async def auth_public_config(request: Request):
        config = {
            "gcp_project_id": os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or "project-3da8cb5f-328e-44d3-b7a",
            "firebase_api_key": os.getenv("FIREBASE_WEB_API_KEY") or os.getenv("GCP_IDENTITY_API_KEY") or "",
            "firebase_auth_domain": os.getenv("FIREBASE_AUTH_DOMAIN") or f"{os.getenv('FIREBASE_PROJECT_ID') or os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('PROJECT_ID') or ''}.firebaseapp.com",
            "recaptcha_site_key": os.getenv("RECAPTCHA_ENTERPRISE_SITE_KEY") or "",
            "oauth_start_url": "/api/auth/start",
            "is_local": False,
        }
        # The Firebase console test number/code is a local-development convenience only.
        production = os.getenv("ENVIRONMENT", "development").lower() in {"production", "prod"}
        if not production and request.url.hostname in {"127.0.0.1", "localhost", "::1"}:
            config.update(is_local=True,
                          firebase_test_phone=os.getenv("AUTH_FIREBASE_TEST_PHONE", "+919876543210"),
                          firebase_test_code=os.getenv("AUTH_FIREBASE_TEST_CODE", "246810"))
        return config

    @router.get("/api/products")
    async def get_products(category: str | None = None):
        products = get_all_products(category)
        return {
            "products": products,
            "categories": [
                {"id": "all", "label": "All Products"},
                {"id": "savings", "label": "Savings Accounts"},
                {"id": "cards", "label": "Credit Cards"},
                {"id": "deposits", "label": "Fixed Deposits"},
                {"id": "loans", "label": "Loans & Credit"},
                {"id": "wealth", "label": "Investments & Demat"},
            ],
            "total_count": len(products),
        }

    @router.post("/api/products/apply")
    @limiter.limit("10/minute")
    async def apply_product(req: ProductApplyRequest, request: Request, response: Response):
        del response
        return submit_application(db, auth_service, req)


    @router.post("/api/applications/status")
    @limiter.limit("10/minute")
    async def track_application(req: ApplicationStatusRequest, request: Request, response: Response):
        """Applicant status by reference + the mobile number used to apply (no sign-in needed)."""
        del request, response
        status = application_status(db, req.reference, req.mobile)
        if not status:
            raise HTTPException(404, "No application matches that reference and mobile number.")
        return status

    @router.post("/api/chat/speak")
    @limiter.limit("30/minute")
    async def speak_reply(req: SpeakRequest, request: Request, response: Response):
        """Read one Mitra reply aloud with Gemini text-to-speech (WAV)."""
        del request, response
        try:
            async with async_timeout(45):
                audio = await voice.synthesize(req.text)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, "Mitra's voice is unavailable right now.") from exc
        return Response(audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})

    @router.post("/api/chat/speak/stream")
    @limiter.limit("30/minute")
    async def speak_reply_stream(req: SpeakRequest, request: Request, response: Response):
        """Stream Mitra's spoken reply as raw 16-bit PCM (24 kHz mono) while Gemini generates it."""
        del request, response
        chunks = voice.synthesize_stream(req.text)
        try:
            first = await chunks.__anext__()  # fail before headers are sent if Gemini is unavailable
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, "Mitra's voice is unavailable right now.") from exc

        async def body():
            yield first
            async for chunk in chunks:
                yield chunk

        return StreamingResponse(body(), media_type="audio/L16; rate=24000; channels=1",
                                 headers={"Cache-Control": "no-store", "X-Sample-Rate": str(voice.STREAM_RATE)})

    @router.post("/api/chat/transcribe")
    @limiter.limit("20/minute")
    async def transcribe_voice_message(request: Request, response: Response):
        """Voice message → text for Mitra. Raw audio body; the transcript is then sent like typed text."""
        del response
        mime_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if mime_type not in voice.AUDIO_TYPES:
            raise HTTPException(415, "Send the voice message as audio.")
        audio = await request.body()
        if not audio:
            raise HTTPException(422, "The recording was empty. Please try again.")
        if len(audio) > voice.MAX_AUDIO_BYTES:
            raise HTTPException(413, "Voice messages can be up to about one minute long.")
        try:
            async with async_timeout(30):
                text = await voice.transcribe(audio, mime_type)
        except Exception as exc:
            raise HTTPException(502, "Mitra could not listen to that just now. Please try again or type your message.") from exc
        if not text:
            raise HTTPException(422, "Mitra could not hear any speech. Please try again closer to the microphone.")
        return {"text": text[:4000]}

    @router.post("/api/public/chat")
    @limiter.limit("30/minute")
    async def public_sales_chat(req: PublicChatRequest, request: Request, response: Response):
        del response
        if not req.prompt.strip():
            raise HTTPException(422, "Enter a non-empty message.")
        sales_context = SalesSessionContext()
        answer = sales_advisor.answer_query(req.prompt, context=sales_context)
        try:
            async with async_timeout(90):
                guarded = guarded_sales_prompt_reply(req.prompt)

                if guarded:
                    answer["text"] = guarded
                elif is_personal_banking_inquiry(req.prompt):
                    answer["text"] = chat_text("auth_prompt")
                    answer["presentation"] = auth_challenge_presentation()
                    answer["action"] = None
                else:
                    async with agent_factory(create_agent_config(
                        "public-chat", visitor=True, session_context={"sales_context": sales_context}
                    )) as agent:
                        raw_reply = "".join([
                            text async for text in visitor_reply(agent, req.prompt, sales_context)
                        ])
                    clean_reply, suggestions = extract_dynamic_suggestions(raw_reply)
                    answer["text"] = chat_text("guarded") if leaks_internal_prompt(clean_reply) else clean_reply
                    if suggestions:
                        answer["suggested_queries"] = suggestions
                    if answer.get("companion_cross_sell"):
                        answer["presentation"] = answer["companion_cross_sell"]
                    if is_auth_required_reply(answer.get("text", "")):
                        answer["presentation"] = auth_challenge_presentation()
                        answer["action"] = None
        except Exception as exc:
            raise HTTPException(503, chat_text("advisor_error")) from exc
        return {
            "role": "assistant",
            "session_id": req.session_id or f"GUEST-{uuid.uuid4().hex[:8]}",
            "response": answer,
        }

    return router
