from __future__ import annotations

from pathlib import Path

from yyt1771_g3.web_assets import frontend_dist_dir


def test_frontend_dist_environment_override(monkeypatch, tmp_path: Path) -> None:
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("YYT1771_G3_FRONTEND_DIST", str(dist))

    assert frontend_dist_dir() == dist.resolve()
