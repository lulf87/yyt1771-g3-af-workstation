from __future__ import annotations

import os
import sys
from pathlib import Path


APP_DIR_NAME = "YYT1771-G3"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def project_root() -> Path:
    return Path(__file__).resolve().parents[4]


def program_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return project_root()


def data_dir() -> Path:
    configured = _environment_path("YYT1771_G3_DATA_DIR")
    if configured is not None:
        return configured
    if sys.platform == "win32" or is_frozen():
        program_data = _environment_path("PROGRAMDATA") or (Path.home() / "AppData" / "Local")
        return program_data / APP_DIR_NAME
    return project_root() / "output" / "windows-dev"


def config_dir() -> Path:
    return _environment_path("YYT1771_G3_CONFIG_DIR") or data_dir() / "config"


def run_store_dir() -> Path:
    configured = _environment_path("YYT1771_G3_RUN_STORE_DIR")
    if configured is not None:
        return configured
    if sys.platform != "win32" and not is_frozen():
        return project_root() / "output" / "runs"
    return data_dir() / "data" / "runs"


def log_dir() -> Path:
    configured = _environment_path("YYT1771_G3_LOG_DIR")
    if configured is not None:
        return configured
    if sys.platform == "win32" or is_frozen():
        local_app_data = _environment_path("LOCALAPPDATA") or data_dir()
        return local_app_data / APP_DIR_NAME / "logs"
    return data_dir() / "logs"


def cache_dir() -> Path:
    return _environment_path("YYT1771_G3_CACHE_DIR") or data_dir() / "cache"


def preferences_dir() -> Path:
    configured = _environment_path("YYT1771_G3_USER_PREFERENCES_DIR")
    if configured is not None:
        return configured
    if sys.platform == "win32":
        local_app_data = _environment_path("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return local_app_data / APP_DIR_NAME / "preferences"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME / "preferences"
    root = _environment_path("XDG_CONFIG_HOME") or (Path.home() / ".config")
    return root / APP_DIR_NAME / "preferences"


def hardware_config_path() -> Path:
    configured = _environment_path("YYT1771_G3_HARDWARE_CONFIG")
    if configured is not None:
        return configured
    if sys.platform != "win32" and not is_frozen():
        return project_root() / "configs" / "local" / "realcamera_temp.local.yaml"
    return config_dir() / "hardware.yaml"


def ensure_runtime_directories() -> tuple[Path, ...]:
    paths = (data_dir(), config_dir(), run_store_dir(), log_dir(), cache_dir(), preferences_dir())
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)
    return paths


def _environment_path(name: str) -> Path | None:
    value = str(os.environ.get(name, "") or "").strip()
    return Path(value).expanduser() if value else None
