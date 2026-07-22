from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from yyt1771_g3.core.user_preferences import (
    clear_export_directory_preference,
    load_export_directory_preference,
    save_export_directory_preference,
)
from yyt1771_g3.services.export_service import export_run_bundle
from yyt1771_g3.services.native_directory import (
    NativeDirectoryAdapter,
    NativeDirectoryError,
    native_directory_adapter,
    system_documents_dir,
)
from yyt1771_g3.storage.run_store import RunStore


DEFAULT_EXPORT_FOLDER_NAME = "YYT1771-G3 Exports"


class ExportDestinationError(RuntimeError):
    """Raised when the configured export destination cannot be used."""


@dataclass(frozen=True)
class ExportDestinationStatus:
    directory: Path
    is_custom: bool
    exists: bool
    writable: bool
    error: str = ""


@dataclass(frozen=True)
class SavedExportBundle:
    filename: str
    path: Path
    size: int
    directory: Path


def default_export_directory() -> Path:
    return (system_documents_dir() / DEFAULT_EXPORT_FOLDER_NAME).resolve(strict=False)


def current_export_directory() -> tuple[Path, bool]:
    preference = load_export_directory_preference()
    if preference is not None:
        return preference.directory, True
    return default_export_directory(), False


def export_destination_status() -> ExportDestinationStatus:
    directory, is_custom = current_export_directory()
    try:
        _ensure_writable_directory(directory)
    except Exception as exc:
        return ExportDestinationStatus(
            directory=directory,
            is_custom=is_custom,
            exists=directory.exists(),
            writable=False,
            error=str(exc),
        )
    return ExportDestinationStatus(directory=directory, is_custom=is_custom, exists=True, writable=True)


def choose_export_destination(adapter: NativeDirectoryAdapter | None = None) -> ExportDestinationStatus:
    selected = (adapter or native_directory_adapter()).choose_directory(current_export_directory()[0])
    if selected is None:
        return export_destination_status()
    _ensure_writable_directory(selected)
    save_export_directory_preference(selected)
    return export_destination_status()


def reset_export_destination() -> ExportDestinationStatus:
    clear_export_directory_preference()
    return export_destination_status()


def open_export_destination(adapter: NativeDirectoryAdapter | None = None) -> ExportDestinationStatus:
    status = export_destination_status()
    if not status.writable:
        raise ExportDestinationError(status.error or "Export destination is not writable.")
    (adapter or native_directory_adapter()).open_directory(status.directory)
    return status


def save_run_export_bundle_to_destination(run_store: RunStore, run_id: str) -> SavedExportBundle:
    status = export_destination_status()
    if not status.writable:
        raise ExportDestinationError(status.error or "Export destination is not writable.")
    bundle_path = export_run_bundle(run_store, run_id)
    final_path = _unique_destination_path(status.directory, bundle_path.name)
    _atomic_copy(bundle_path, final_path)
    return SavedExportBundle(
        filename=final_path.name,
        path=final_path,
        size=final_path.stat().st_size,
        directory=status.directory,
    )


def _ensure_writable_directory(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    if not directory.is_dir():
        raise ExportDestinationError(f"Export destination is not a directory: {directory}")
    fd, tmp_name = tempfile.mkstemp(prefix=".g3-write-test-", suffix=".tmp", dir=directory)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(b"ok")
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        tmp_path.unlink(missing_ok=True)


def _unique_destination_path(directory: Path, filename: str) -> Path:
    candidate = directory / _safe_filename(filename)
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(1, 1000):
        numbered = directory / f"{stem} ({index}){suffix}"
        if not numbered.exists():
            return numbered
    raise ExportDestinationError(f"Could not choose a unique export filename in {directory}")


def _safe_filename(filename: str) -> str:
    clean = filename.strip().replace("/", "_").replace("\\", "_").replace(":", "_")
    return clean or "yyt1771-g3-export.zip"


def _atomic_copy(source: Path, target: Path) -> None:
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".part", dir=target.parent)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle, source.open("rb") as source_handle:
            shutil.copyfileobj(source_handle, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, target)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
