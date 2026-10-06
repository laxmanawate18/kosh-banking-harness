"""Runtime settings shared by the FastAPI app and agent configuration."""

from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

DEFAULT_MODEL = "gemini-3.8-flash"
# Used for one retry when the main model still fails after the SDK's own retries (quota or outage). Unset = no switch.
FALLBACK_MODEL = os.getenv("MITRA_FALLBACK_MODEL") or None
DEFAULT_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or "project-5fc303c2-29cb-4e5d-9f9"
# gemini-3.8-flash is served from the Vertex "global" endpoint (not us-central1).
DEFAULT_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION") or "global"
USE_VERTEXAI = (
    os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {"true", "1"}
    or os.getenv("GOOGLE_GENAI_USE_ENTERPRISE", "").lower() in {"true", "1"}
    or not bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
)

ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "SENTINEL_ALLOWED_ORIGINS",
        "http://127.0.0.1:8017,http://localhost:8017,http://127.0.0.1:3000,http://localhost:3000",
    ).split(",")
    if item.strip()
]

# Cloud Run sets K_SERVICE; a deployed service is production even if ENVIRONMENT was never set.
PRODUCTION = os.getenv("ENVIRONMENT", "").lower() in {"production", "prod"} or bool(os.getenv("K_SERVICE"))


def required_secret(name: str, development_default: str) -> str:
    """A signing key from the environment. In production a missing key stops startup instead of using a known default."""
    value = os.getenv(name)
    if value:
        return value
    if PRODUCTION:
        raise RuntimeError(f"{name} must be set in production")
    return development_default
