from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from yyt1771_g3.core.app_paths import preferences_dir


EXPORT_PREFERENCE_SCHEMA_VERSION = 1


class UserPreferenceError(RuntimeError):
    """Raised when a user preference file is unreadable or unsupported."""


@dataclass(frozen=True)
class ExportDirectoryPreference:
    schema_version: int
    directory: Path


def export_preference_path() -> Path:
    return preferences_dir() / "export.json"


def load_export_directory_preference(*, path: Path | None = None) -> ExportDirectoryPreference | None:
    target = path or export_preference_path()
    if not target.exists():
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UserPreferenceError(f"Export preference cannot be read: {target}") from exc
    if not isinstance(payload, dict) or payload.get("schema_version") != EXPORT_PREFERENCE_SCHEMA_VERSION:
        raise UserPreferenceError(f"Unsupported export preference schema: {target}")
    directory = Path(str(payload.get("directory", ""))).expanduser()
    if not directory.is_absolute():
        raise UserPreferenceError(f"Export preference path must be absolute: {directory}")
    return ExportDirectoryPreference(
        schema_version=EXPORT_PREFERENCE_SCHEMA_VERSION,
        directory=directory.resolve(strict=False),
    )


def save_export_directory_preference(directory: Path, *, path: Path | None = None) -> ExportDirectoryPreference:
    target = path or export_preference_path()
    resolved = directory.expanduser().resolve(strict=False)
    if not resolved.is_absolute():
        raise UserPreferenceError(f"Export preference path must be absolute: {resolved}")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=target.parent,
        text=True,
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(
                {
                    "schema_version": EXPORT_PREFERENCE_SCHEMA_VERSION,
                    "directory": str(resolved),
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, target)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        finally:
            pass
        raise
    return ExportDirectoryPreference(EXPORT_PREFERENCE_SCHEMA_VERSION, resolved)


def clear_export_directory_preference(*, path: Path | None = None) -> None:
    target = path or export_preference_path()
    target.unlink(missing_ok=True)
