from __future__ import annotations

from pathlib import Path

import pytest

from yyt1771_g3.core import user_preferences
from yyt1771_g3.core.user_preferences import (
    UserPreferenceError,
    clear_export_directory_preference,
    load_export_directory_preference,
    save_export_directory_preference,
)


def test_export_preference_round_trips_unicode_absolute_path(tmp_path: Path) -> None:
    preference_path = tmp_path / "preferences" / "export.json"
    selected = tmp_path / "测量 导出"

    save_export_directory_preference(selected, path=preference_path)

    loaded = load_export_directory_preference(path=preference_path)
    assert loaded is not None
    assert loaded.directory == selected.resolve(strict=False)


def test_missing_export_preference_returns_none(tmp_path: Path) -> None:
    assert load_export_directory_preference(path=tmp_path / "missing.json") is None


def test_malformed_export_preference_raises(tmp_path: Path) -> None:
    preference_path = tmp_path / "export.json"
    preference_path.write_text("{bad json", encoding="utf-8")

    with pytest.raises(UserPreferenceError):
        load_export_directory_preference(path=preference_path)


def test_unsupported_export_preference_schema_raises(tmp_path: Path) -> None:
    preference_path = tmp_path / "export.json"
    preference_path.write_text('{"schema_version": 999, "directory": "/tmp"}', encoding="utf-8")

    with pytest.raises(UserPreferenceError):
        load_export_directory_preference(path=preference_path)


def test_relative_export_preference_path_raises(tmp_path: Path) -> None:
    preference_path = tmp_path / "export.json"
    preference_path.write_text('{"schema_version": 1, "directory": "relative"}', encoding="utf-8")

    with pytest.raises(UserPreferenceError):
        load_export_directory_preference(path=preference_path)


def test_failed_preference_replace_preserves_previous_file(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    preference_path = tmp_path / "export.json"
    save_export_directory_preference(tmp_path / "first", path=preference_path)
    before = preference_path.read_bytes()
    monkeypatch.setattr(
        user_preferences.os,
        "replace",
        lambda source, target: (_ for _ in ()).throw(OSError("denied")),
    )

    with pytest.raises(OSError, match="denied"):
        save_export_directory_preference(tmp_path / "second", path=preference_path)

    assert preference_path.read_bytes() == before
    assert list(tmp_path.glob(".export.json.*.tmp")) == []


def test_clear_export_preference_removes_file(tmp_path: Path) -> None:
    preference_path = tmp_path / "export.json"
    save_export_directory_preference(tmp_path / "first", path=preference_path)

    clear_export_directory_preference(path=preference_path)

    assert not preference_path.exists()
