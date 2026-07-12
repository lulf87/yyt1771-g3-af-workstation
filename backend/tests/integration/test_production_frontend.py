from __future__ import annotations

from fastapi.testclient import TestClient

from yyt1771_g3.api.main import app


def test_backend_serves_built_frontend_and_spa_fallback() -> None:
    client = TestClient(app)
    home = client.get("/")
    route = client.get("/analysis/example-run")
    health = client.get("/api/health")

    assert home.status_code == 200
    assert "text/html" in home.headers["content-type"]
    assert route.status_code == 200
    assert route.text == home.text
    assert health.json() == {"status": "ok"}
