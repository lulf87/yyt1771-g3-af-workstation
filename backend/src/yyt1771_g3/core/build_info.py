"""Build identity reported by ``/api/health``.

Values are resolved in this order:

1. ``YYT1771_G3_BUILD_VERSION`` / ``YYT1771_G3_BUILD_SHA`` / ``YYT1771_G3_BUILD_TIME``;
2. ``build_info.json`` next to the frozen executable, or at the repository root in a source checkout;
3. ``git rev-parse --short HEAD`` when running from a source checkout (never for frozen builds).

Every lookup is best-effort. A missing or malformed ``build_info.json`` degrades to
``"unknown"`` and never raises, because ``/api/health`` must keep returning 200 (the
launcher and the packaging smoke test both depend on it).
"""

from __future__ import annotations

import json
import os
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any

from yyt1771_g3.core.app_paths import is_frozen, program_dir, project_root


UNKNOWN = "unknown"
BUILD_INFO_FILENAME = "build_info.json"
BUILD_INFO_FIELDS = ("version", "git_sha", "build_time")

_ENV_VARS = {
    "version": "YYT1771_G3_BUILD_VERSION",
    "git_sha": "YYT1771_G3_BUILD_SHA",
    "build_time": "YYT1771_G3_BUILD_TIME",
}

_FILE_KEYS = {
    "version": ("version", "app_version"),
    "git_sha": ("git_sha", "sha", "commit"),
    "build_time": ("build_time", "built_at", "build_time_utc"),
}


@lru_cache(maxsize=1)
def build_info() -> dict[str, str]:
    """Return ``{version, git_sha, build_time}``, each falling back to ``"unknown"``."""

    payload = _load_payload()
    resolved: dict[str, str] = {}
    for field in BUILD_INFO_FIELDS:
        resolved[field] = _from_environment(field) or _from_payload(payload, field)
    if not resolved["git_sha"] and not is_frozen():
        resolved["git_sha"] = _git_short_sha()
    return {field: value or UNKNOWN for field, value in resolved.items()}


def _from_environment(field: str) -> str:
    return str(os.environ.get(_ENV_VARS[field], "") or "").strip()


def _from_payload(payload: dict[str, Any], field: str) -> str:
    for key in _FILE_KEYS[field]:
        value = payload.get(key)
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (str, int, float)):
            text = str(value).strip()
            if text:
                return text
    return ""


def _load_payload() -> dict[str, Any]:
    for path in _candidate_paths():
        try:
            if not path.is_file():
                continue
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            return payload
    return {}


def _candidate_paths() -> tuple[Path, ...]:
    paths: list[Path] = []
    if is_frozen():
        paths.append(program_dir() / BUILD_INFO_FILENAME)
    paths.append(project_root() / BUILD_INFO_FILENAME)
    return tuple(dict.fromkeys(paths))


def _git_short_sha() -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(project_root()),
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except Exception:
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()
