"""Shared test fixtures."""
import socket
import threading
import time

import pytest
import uvicorn


@pytest.fixture(scope="module")
def cbs_url():
    """The mock core-banking (CBS) web app on a free local port, for RPA tests."""
    from rpa.cbs_mock_server import mock_cbs_app
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(mock_cbs_app, host="127.0.0.1", port=port, log_level="error"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
