from __future__ import annotations

from fastapi.testclient import TestClient

from yyt1771_g3.api.main import app


def test_vite_fallback_port_5177_is_allowed_by_cors() -> None:
    client = TestClient(app)

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://127.0.0.1:5177",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5177"
