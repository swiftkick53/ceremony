"""Server-side Whisper transcription (build plan, "voice quality vs. cost").

The browser's live transcript is Chrome-only and rough; the raw audio is
already shipped with every dump. When OPENAI_API_KEY is set, an audio-only
dump (or any dump whose transcript came back empty) is transcribed here
before filing. Without the key everything behaves as before.
"""
import logging
import os

import httpx

log = logging.getLogger("ceremony.transcribe")

WHISPER_URL = os.environ.get(
    "CEREMONY_WHISPER_URL", "https://api.openai.com/v1/audio/transcriptions")
WHISPER_MODEL = os.environ.get("CEREMONY_WHISPER_MODEL", "whisper-1")

MIME_BY_EXT = {"webm": "audio/webm", "m4a": "audio/mp4", "mp3": "audio/mpeg",
               "ogg": "audio/ogg", "wav": "audio/wav"}


def available() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def transcribe(audio: bytes, ext: str) -> str | None:
    """Audio bytes -> transcript, or None (unavailable / failed). Never raises —
    a failed transcription must not lose the dump; the audio is kept regardless."""
    if not available():
        return None
    try:
        resp = httpx.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
            files={"file": (f"dump.{ext}", audio, MIME_BY_EXT.get(ext, "application/octet-stream"))},
            data={"model": WHISPER_MODEL},
            timeout=120,
        )
        resp.raise_for_status()
        text = (resp.json().get("text") or "").strip()
        return text or None
    except Exception as e:
        log.warning("transcription failed: %s", e)
        return None
