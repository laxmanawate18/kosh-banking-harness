"""Root fixtures shared by every test module."""
import sys

import pytest


@pytest.fixture(autouse=True)
def _reset_chat_rate_limit():
    # Looked up lazily: importing the app here would create the database before tests choose theirs.
    runtime = sys.modules.get("backend.chat_runtime")
    if runtime:
        runtime._RECENT_MESSAGES.clear()
    yield
