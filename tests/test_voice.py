"""Mitra voice routes: Gemini TTS reply audio and voice-message transcription."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'voice.sqlite3'}")

from fastapi.testclient import TestClient  # noqa: E402
import dev_ui  # noqa: E402
from backend import voice  # noqa: E402


class VoiceRouteTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        self.client = TestClient(dev_ui.app)

    def test_speak_returns_wav_from_gemini_tts(self):
        wav = voice._wav(b"\x00\x00" * 2400, 24000)
        with patch.object(voice, "synthesize", AsyncMock(return_value=wav)) as tts:
            res = self.client.post("/api/chat/speak", json={"text": "आपका आवेदन जमा हो गया है।"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "audio/wav")
        self.assertTrue(res.content.startswith(b"RIFF"))
        tts.assert_awaited_once()

    def test_stream_forwards_pcm_chunks_as_they_arrive(self):
        async def fake_stream(text):
            for chunk in (b"\x01\x00" * 100, b"\x02\x00" * 100):
                yield chunk
        with patch.object(voice, "synthesize_stream", fake_stream):
            res = self.client.post("/api/chat/speak/stream", json={"text": "Namaste"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.headers["content-type"].startswith("audio/L16"))
        self.assertEqual(res.headers["x-sample-rate"], "24000")
        self.assertEqual(len(res.content), 400)

    def test_stream_reports_voice_outage_before_sending_audio(self):
        async def broken(text):
            raise RuntimeError("tts down")
            yield b""
        with patch.object(voice, "synthesize_stream", broken):
            self.assertEqual(self.client.post("/api/chat/speak/stream", json={"text": "Namaste"}).status_code, 502)

    def test_speak_rejects_empty_or_huge_text(self):
        self.assertEqual(self.client.post("/api/chat/speak", json={"text": ""}).status_code, 422)
        self.assertEqual(self.client.post("/api/chat/speak", json={"text": "x" * 7000}).status_code, 422)

    def test_long_replies_are_trimmed_at_a_sentence(self):
        text = ("Kosh savings pays monthly interest. " * 120).strip()
        trimmed = voice._trim(text)
        self.assertLessEqual(len(trimmed), voice.MAX_SPEECH_CHARS)
        self.assertTrue(trimmed.endswith("."))

    def test_transcribe_accepts_audio_only(self):
        with patch.object(voice, "transcribe", AsyncMock(return_value="Show my balance")):
            ok = self.client.post("/api/chat/transcribe", content=b"fake-opus", headers={"Content-Type": "audio/webm"})
        self.assertEqual(ok.json(), {"text": "Show my balance"})
        self.assertEqual(self.client.post("/api/chat/transcribe", content=b"x", headers={"Content-Type": "text/plain"}).status_code, 415)
        too_big = b"0" * (voice.MAX_AUDIO_BYTES + 1)
        self.assertEqual(self.client.post("/api/chat/transcribe", content=too_big, headers={"Content-Type": "audio/webm"}).status_code, 413)


if __name__ == "__main__":
    unittest.main()
