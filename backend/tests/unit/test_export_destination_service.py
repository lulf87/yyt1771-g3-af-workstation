from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core.user_preferences import save_export_directory_preference
from yyt1771_g3.services import export_destination_service
from yyt1771_g3.services.export_destination_service import (
    DEFAULT_EXPORT_FOLDER_NAME,
    choose_export_destination,
    export_destination_status,
    reset_export_destination,
)


class FakeAdapter:
    def __init__(self, selected: Path | None) -> None:
        self.selected = selected
        self.opened: list[Path] = []

    def choose_directory(self, initial_dir: Path) -> Path | None:
        return self.selected

    def open_directory(self, directory: Path) -> None:
        self.opened.append(directory)


def test_default_export_destination_uses_documents_folder(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_DOCUMENTS_DIR", str(tmp_path / "Documents"))
    monkeypatch.setenv("YYT1771_G3_USER_PREFERENCES_DIR", str(tmp_path / "prefs"))

    status = export_destination_status()

    assert status.directory == tmp_path / "Documents" / DEFAULT_EXPORT_FOLDER_NAME
    assert status.writable
    assert not status.is_custom


def test_choose_export_destination_persists_custom_path(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_DOCUMENTS_DIR", str(tmp_path / "Documents"))
    monkeypatch.setenv("YYT1771_G3_USER_PREFERENCES_DIR", str(tmp_path / "prefs"))
    selected = tmp_path / "我的导出"

    status = choose_export_destination(FakeAdapter(selected))

    assert status.directory == selected
    assert status.is_custom
    assert export_destination_status().directory == selected


def test_reset_export_destination_returns_to_default(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_DOCUMENTS_DIR", str(tmp_path / "Documents"))
    monkeypatch.setenv("YYT1771_G3_USER_PREFERENCES_DIR", str(tmp_path / "prefs"))
    save_export_directory_preference(tmp_path / "custom")

    status = reset_export_destination()

    assert status.directory == tmp_path / "Documents" / DEFAULT_EXPORT_FOLDER_NAME
    assert not status.is_custom


def test_unique_destination_path_avoids_overwrite(tmp_path: Path) -> None:
    directory = tmp_path / "exports"
    directory.mkdir()
    (directory / "bundle.zip").write_text("first", encoding="utf-8")

    assert export_destination_service._unique_destination_path(directory, "bundle.zip") == directory / "bundle (1).zip"


def test_atomic_copy_uses_part_and_installs_final(tmp_path: Path) -> None:
    source = tmp_path / "source.zip"
    target = tmp_path / "exports" / "bundle.zip"
    target.parent.mkdir()
    source.write_bytes(b"zip-bytes")

    export_destination_service._atomic_copy(source, target)

    assert target.read_bytes() == b"zip-bytes"
    assert list(target.parent.glob("*.part")) == []
