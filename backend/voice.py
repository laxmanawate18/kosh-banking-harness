"""Mitra voice: Gemini text-to-speech for replies, Gemini speech-to-text for voice messages.

A transcript is treated exactly like typed text: it goes through the normal chat guards,
so a voice message can never do more than a typed one.
"""

from __future__ import annotations

import io
import os
import wave
from functools import lru_cache

from backend.settings import DEFAULT_LOCATION, DEFAULT_MODEL, DEFAULT_PROJECT_ID, USE_VERTEXAI

MAX_AUDIO_BYTES = 2_000_000  # ~60 s of Opus/AAC speech
MAX_SPEECH_CHARS = 2500      # one chat reply; longer text is trimmed at a sentence boundary
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac", "audio/aiff"}
# Gemini 3.8 Flash has no audio output; Gemini's dedicated TTS model reads Mitra's replies.
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-tts")
TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Kore")

TRANSCRIBE_PROMPT = (
    "Transcribe this voice message word for word. The speaker may use English, Hindi, Marathi "
    "or a mix of them. Write Hindi and Marathi words in Devanagari and English words in Latin "
    "script, exactly as spoken. Do not translate, summarise, answer or add anything. "
    "Return only the transcript. If there is no clear speech, return nothing."
)


@lru_cache(maxsize=1)
def _client():
    from google import genai

    if USE_VERTEXAI:
        return genai.Client(vertexai=True, project=os.getenv("GOOGLE_CLOUD_PROJECT") or DEFAULT_PROJECT_ID,
                            location=os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION)
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


async def transcribe(audio: bytes, mime_type: str) -> str:
    from google.genai import types

    response = await _client().aio.models.generate_content(
        model=DEFAULT_MODEL,
        contents=[types.Part.from_bytes(data=audio, mime_type=mime_type), TRANSCRIBE_PROMPT],
        config=types.GenerateContentConfig(temperature=0, max_output_tokens=1024),
    )
    return (response.text or "").strip()


def _trim(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= MAX_SPEECH_CHARS:
        return text
    cut = text[:MAX_SPEECH_CHARS]
    end = max(cut.rfind(". "), cut.rfind("। "), cut.rfind("? "), cut.rfind("! "))
    return cut[: end + 1] if end > MAX_SPEECH_CHARS // 2 else cut


def _wav(pcm: bytes, rate: int) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)  # Gemini TTS returns 16-bit little-endian PCM
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return out.getvalue()


_speech_cache: dict[str, bytes] = {}


async def synthesize(text: str) -> bytes:
    """Speak one reply with Gemini TTS; returns a WAV file. Language (English, Hindi, Marathi) follows the text."""
    from google.genai import types

    words = _trim(text)
    if not words:
        raise ValueError("Nothing to read aloud")
    if words in _speech_cache:
        return _speech_cache[words]
    response = await _client().aio.models.generate_content(
        model=TTS_MODEL,
        contents=words,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=TTS_VOICE))),
        ),
    )
    part = response.candidates[0].content.parts[0].inline_data
    rate = int(part.mime_type.split("rate=")[-1]) if "rate=" in (part.mime_type or "") else 24000
    audio = _wav(part.data, rate)
    if len(_speech_cache) > 200:  # ponytail: tiny in-process cache; move to a shared store if replies are replayed across instances
        _speech_cache.clear()
    _speech_cache[words] = audio
    return audio
