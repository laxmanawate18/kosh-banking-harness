"""Start the legacy core inside Kosh's container, listening only on 127.0.0.1. The only legacy module Kosh may import."""

from __future__ import annotations

import os
import threading
import time

PORT = int(os.getenv("LEGACY_CBS_PORT", "8995"))


def base_url() -> str:
    return f"http://127.0.0.1:{PORT}"


_started: dict[int, str] = {}


def start_in_background() -> str:
    """Run the legacy core's screens on 127.0.0.1:PORT in a daemon thread; return its address for the robot. Starting
    twice in one process returns the running core; a port taken by another process is refused, never shared."""
    if PORT in _started:
        return _started[PORT]
    import socket
    import uvicorn
    from legacy_cbs.app import app
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", PORT))
        except OSError as exc:
            raise RuntimeError(f"Port {PORT} is already in use; set LEGACY_CBS_PORT to a free port") from exc
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, name="legacy-cbs", daemon=True).start()
    for _ in range(50):
        if server.started:
            _started[PORT] = base_url()
            return _started[PORT]
        time.sleep(0.1)
    raise RuntimeError("The legacy core did not start")
