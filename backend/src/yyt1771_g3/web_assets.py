from __future__ import annotations

import os
import sys
from pathlib import Path


FRONTEND_DIST_ENV = "YYT1771_G3_FRONTEND_DIST"


def frontend_dist_dir() -> Path | None:
    configured = str(os.environ.get(FRONTEND_DIST_ENV, "") or "").strip()
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured).expanduser())
    bundle_dir = getattr(sys, "_MEIPASS", None)
    if bundle_dir:
        candidates.append(Path(bundle_dir) / "frontend" / "dist")
    if bool(getattr(sys, "frozen", False)):
        candidates.append(Path(sys.executable).resolve().parent / "frontend" / "dist")
    candidates.append(Path(__file__).resolve().parents[3] / "frontend" / "dist")
    candidates.append(Path(__file__).resolve().parents[4] / "frontend" / "dist")

    for candidate in candidates:
        resolved = candidate.resolve()
        if (resolved / "index.html").is_file():
            return resolved
    return None
