"""Signed-out product catalogue, onboarding, application tracking, voice and feedback routes."""

from __future__ import annotations

import os
from asyncio import timeout as async_timeout

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from backend import voice
from backend.settings import PRODUCTION
from backend.api_models import ApplicationStatusRequest, ProductApplyRequest, SpeakRequest
from backend.applications import application_status, bind as bind_applications, submit_application
from auth_service import AuthService
from product_service import get_all_products


def make_public_router(db, auth_service: AuthService, limiter):
    router = APIRouter()
    bind_applications(db, auth_service)

    @router.post("/api/chat/feedback")
    @limiter.limit("30/minute")
    async def chat_feedback(req: dict, request: Request, response: Response):
        del response
        from auth_service import COOKIE_NAME
        from backend.mitra_ops import add_feedback
        auth = auth_service.resolve(request.cookies.get(COOKIE_NAME), touch=False)
        try:
            return add_feedback(db, session_id=str(req.get("session_id", ""))[:80], message_index=int(req.get("message_index", -1)),
                                rating=int(req.get("rating", 0)), comment=req.get("comment"), channel="CUSTOMER" if auth else "VISITOR",
                                user_id=auth.user_id if auth else None)
        except LookupError:
            raise HTTPException(404, "Conversation not found")
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, str(exc))

    @router.get("/api/auth/public-config")
    async def auth_public_config(request: Request):
        config = {
            "gcp_project_id": os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or "project-5fc303c2-29cb-4e5d-9f9",
            "firebase_api_key": os.getenv("FIREBASE_WEB_API_KEY") or os.getenv("GCP_IDENTITY_API_KEY") or "",
            "firebase_auth_domain": os.getenv("FIREBASE_AUTH_DOMAIN") or f"{os.getenv('FIREBASE_PROJECT_ID') or os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('PROJECT_ID') or ''}.firebaseapp.com",
            "recaptcha_site_key": os.getenv("RECAPTCHA_ENTERPRISE_SITE_KEY") or "",
            "oauth_start_url": "/api/auth/start",
            "is_local": False,
        }
        # The Firebase console test number/code is a local-development convenience only.
        production = PRODUCTION
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

    return router
