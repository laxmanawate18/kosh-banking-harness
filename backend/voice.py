"""Mitra voice: Cloud Text-to-Speech reads replies, Cloud Speech-to-Text transcribes voice messages.

Both are Google Cloud speech services under the project's own Cloud terms, not a generative model: a customer's voice
and Mitra's spoken replies (which carry their real balances) never go to an LLM. A transcript is treated exactly like typed
text: it goes through the normal chat guards and the LLM boundary, so a voice message can never do more than a typed one.
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
from functools import lru_cache

from backend.settings import DEFAULT_PROJECT_ID

MAX_AUDIO_BYTES = 2_000_000  # ~60 s of Opus/AAC speech
MAX_SPEECH_CHARS = 2500      # one chat reply; longer text is trimmed at a sentence boundary
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac", "audio/aiff"}
LANGUAGES = {"en": "en-IN", "hi": "hi-IN", "mr": "mr-IN"}
# Speech-to-Text v2 runs in a region. Mumbai (asia-south1) no longer serves a model for en-IN/hi-IN/mr-IN (checked
# 2026-10-07: short, long, chirp_2, chirp_3 and telephony all refused), so the nearest region that does is used:
# Singapore with chirp_2. Switch back with these two settings when Mumbai offers one.
SPEECH_LOCATION = os.getenv("KOSH_SPEECH_LOCATION", "asia-southeast1")
SPEECH_MODEL = os.getenv("KOSH_SPEECH_MODEL", "chirp_2")
STREAM_RATE = 24000  # LINEAR16 sample rate requested from Text-to-Speech (16-bit mono)
_MARATHI = re.compile(r"(आहे|आहेत|नाही|तुमच|माझ|करा|झाले|मिळेल|साठी)")


@lru_cache(maxsize=1)
def _session():
    """An authorised HTTP session with the service's own credentials (no API keys)."""
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return AuthorizedSession(credentials)


def _project() -> str:
    return os.getenv("GOOGLE_CLOUD_PROJECT") or DEFAULT_PROJECT_ID


def speech_language(text: str) -> str:
    """Devanagari is read as Marathi or Hindi, anything else as Indian English (same rule as the website)."""
    if re.search(r"[\u0900-\u097F]", text):
        return "mr-IN" if _MARATHI.search(text) else "hi-IN"
    return "en-IN"


def _recognize(audio: bytes, language: str) -> str:
    url = (f"https://{SPEECH_LOCATION}-speech.googleapis.com/v2/projects/{_project()}/locations/{SPEECH_LOCATION}"
           "/recognizers/_:recognize")
    body = {"config": {"autoDecodingConfig": {}, "languageCodes": [language], "model": SPEECH_MODEL,
                       "features": {"enableAutomaticPunctuation": True}},
            "content": base64.b64encode(audio).decode()}
    response = _session().post(url, json=body, timeout=30)
    response.raise_for_status()
    results = response.json().get("results") or []
    return " ".join(r["alternatives"][0]["transcript"].strip() for r in results if r.get("alternatives")).strip()


async def transcribe(audio: bytes, mime_type: str, language: str = "en") -> str:
    """The words in a voice message, in the chat's language (en, hi or mr). The browser's container format is auto-detected."""
    del mime_type  # Speech-to-Text v2 detects WebM/Opus, Ogg, MP4/AAC, MP3 and WAV itself
    return await asyncio.to_thread(_recognize, audio, LANGUAGES.get(language, "en-IN"))


def _trim(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= MAX_SPEECH_CHARS:
        return text
    cut = text[:MAX_SPEECH_CHARS]
    end = max(cut.rfind(". "), cut.rfind("। "), cut.rfind("? "), cut.rfind("! "))
    return cut[: end + 1] if end > MAX_SPEECH_CHARS // 2 else cut


def _synthesize_linear16(words: str) -> bytes:
    response = _session().post("https://texttospeech.googleapis.com/v1/text:synthesize", timeout=30, json={
        "input": {"text": words},
        "voice": {"languageCode": speech_language(words)},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": STREAM_RATE},
    })
    response.raise_for_status()
    return base64.b64decode(response.json()["audioContent"])  # a complete WAV file (LINEAR16 comes with its header)


_speech_cache: dict[str, bytes] = {}


async def synthesize(text: str) -> bytes:
    """Speak one reply with Cloud Text-to-Speech; returns a WAV file. Language (English, Hindi, Marathi) follows the text."""
    words = _trim(text)
    if not words:
        raise ValueError("Nothing to read aloud")
    if words in _speech_cache:
        return _speech_cache[words]
    audio = await asyncio.to_thread(_synthesize_linear16, words)
    if len(_speech_cache) > 200:  # ponytail: tiny in-process cache; move to a shared store if replies are replayed across instances
        _speech_cache.clear()
    _speech_cache[words] = audio
    return audio


async def synthesize_stream(text: str):
    """Yield raw 16-bit PCM in chunks. Synthesis is one call, then playback starts; replies are spoken in short pieces."""
    wav = await synthesize(text)
    pcm = wav[44:] if wav[:4] == b"RIFF" else wav  # drop the WAV header: the stream route sends raw PCM
    for i in range(0, len(pcm), 32_000):
        yield pcm[i:i + 32_000]
