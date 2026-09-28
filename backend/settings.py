"""Runtime settings shared by the FastAPI app and agent configuration."""

from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or "project-3da8cb5f-328e-44d3-b7a"
DEFAULT_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION") or "us-central1"
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
