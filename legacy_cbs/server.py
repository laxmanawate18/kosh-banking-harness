"""Start the legacy core inside Kosh's container, listening only on 127.0.0.1. The only legacy module Kosh may import."""

from __future__ import annotations

import os
import threading
import time

PORT = int(os.getenv("LEGACY_CBS_PORT", "8995"))


def base_url() -> str:
    return f"http://127.0.0.1:{PORT}"


def start_in_background() -> str:
    """Run the legacy core's screens on 127.0.0.1:PORT in a daemon thread; return its address for the robot."""
    import uvicorn
    from legacy_cbs.app import app
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, name="legacy-cbs", daemon=True).start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)
    return base_url()
