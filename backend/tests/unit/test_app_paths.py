from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core import app_paths


def test_runtime_paths_honor_environment_overrides(monkeypatch, tmp_path: Path) -> None:
    data = tmp_path / "中文 data"
    config = tmp_path / "config with spaces"
    runs = tmp_path / "runs"
    logs = tmp_path / "logs"
    cache = tmp_path / "cache"
    hardware = config / "hardware.yaml"
    monkeypatch.setenv("YYT1771_G3_DATA_DIR", str(data))
    monkeypatch.setenv("YYT1771_G3_CONFIG_DIR", str(config))
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(runs))
    monkeypatch.setenv("YYT1771_G3_LOG_DIR", str(logs))
    monkeypatch.setenv("YYT1771_G3_CACHE_DIR", str(cache))
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware))

    assert app_paths.data_dir() == data
    assert app_paths.config_dir() == config
    assert app_paths.run_store_dir() == runs
    assert app_paths.log_dir() == logs
    assert app_paths.cache_dir() == cache
    assert app_paths.hardware_config_path() == hardware
    app_paths.ensure_runtime_directories()
    assert all(path.is_dir() for path in (data, config, runs, logs, cache))


def test_preferences_dir_uses_environment_override(monkeypatch, tmp_path: Path) -> None:
    configured = tmp_path / "prefs"
    monkeypatch.setenv("YYT1771_G3_USER_PREFERENCES_DIR", str(configured))
    assert app_paths.preferences_dir() == configured


def test_windows_defaults_separate_program_data_and_user_logs(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(app_paths.sys, "platform", "win32")
    monkeypatch.setenv("PROGRAMDATA", str(tmp_path / "ProgramData"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    for name in (
        "YYT1771_G3_DATA_DIR",
        "YYT1771_G3_CONFIG_DIR",
        "YYT1771_G3_RUN_STORE_DIR",
        "YYT1771_G3_LOG_DIR",
        "YYT1771_G3_CACHE_DIR",
        "YYT1771_G3_HARDWARE_CONFIG",
    ):
        monkeypatch.delenv(name, raising=False)

    assert app_paths.data_dir() == tmp_path / "ProgramData" / "YYT1771-G3"
    assert app_paths.run_store_dir() == tmp_path / "ProgramData" / "YYT1771-G3" / "data" / "runs"
    assert app_paths.log_dir() == tmp_path / "LocalAppData" / "YYT1771-G3" / "logs"
    assert app_paths.preferences_dir() == tmp_path / "LocalAppData" / "YYT1771-G3" / "preferences"


def test_preferences_dir_uses_macos_application_support(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(app_paths.sys, "platform", "darwin")
    monkeypatch.setattr(app_paths.Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.delenv("YYT1771_G3_USER_PREFERENCES_DIR", raising=False)

    assert app_paths.preferences_dir() == tmp_path / "Library" / "Application Support" / "YYT1771-G3" / "preferences"


def test_source_defaults_preserve_existing_project_locations(monkeypatch) -> None:
    monkeypatch.setattr(app_paths.sys, "platform", "darwin")
    monkeypatch.setattr(app_paths, "is_frozen", lambda: False)
    for name in ("YYT1771_G3_RUN_STORE_DIR", "YYT1771_G3_HARDWARE_CONFIG"):
        monkeypatch.delenv(name, raising=False)

    assert app_paths.run_store_dir() == app_paths.project_root() / "output" / "runs"
    assert app_paths.hardware_config_path() == (
        app_paths.project_root() / "configs" / "local" / "realcamera_temp.local.yaml"
    )
