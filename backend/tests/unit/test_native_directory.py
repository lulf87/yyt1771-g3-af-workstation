from __future__ import annotations

from pathlib import Path
from subprocess import CompletedProcess

from yyt1771_g3.services.native_directory import (
    NATIVE_DIALOG_CANCELLED,
    MacNativeDirectoryAdapter,
    WindowsNativeDirectoryAdapter,
    system_documents_dir,
)


def test_system_documents_uses_windows_known_folder(tmp_path: Path) -> None:
    expected = tmp_path / "OneDrive - 实验室" / "文档"

    assert system_documents_dir(platform_name="win32", windows_resolver=lambda: expected) == expected


def test_system_documents_honors_override(monkeypatch, tmp_path: Path) -> None:
    expected = tmp_path / "自定义文档"
    monkeypatch.setenv("YYT1771_G3_DOCUMENTS_DIR", str(expected))

    assert system_documents_dir(platform_name="win32", windows_resolver=lambda: tmp_path / "ignored") == expected


def test_windows_choose_directory_uses_sta_and_preserves_unicode(tmp_path: Path) -> None:
    calls: list[tuple[list[str], dict[str, str]]] = []
    selected = tmp_path / "导出 结果"
    adapter = WindowsNativeDirectoryAdapter(
        run_command=lambda args, env: calls.append((args, env)) or CompletedProcess(args, 0, f"{selected}\n", "")
    )

    assert adapter.choose_directory(tmp_path) == selected
    assert "-STA" in calls[0][0]
    assert calls[0][1]["G3_INITIAL_DIRECTORY"] == str(tmp_path)


def test_cancelled_native_picker_returns_none(tmp_path: Path) -> None:
    adapter = WindowsNativeDirectoryAdapter(
        run_command=lambda args, env: CompletedProcess(args, NATIVE_DIALOG_CANCELLED, "", "")
    )

    assert adapter.choose_directory(tmp_path) is None


def test_macos_choose_directory_passes_initial_path_as_argument(tmp_path: Path) -> None:
    calls: list[tuple[list[str], dict[str, str]]] = []
    selected = tmp_path / "导出"
    adapter = MacNativeDirectoryAdapter(
        run_command=lambda args, env: calls.append((args, env)) or CompletedProcess(args, 0, f"{selected}\n", "")
    )

    assert adapter.choose_directory(tmp_path) == selected
    assert calls[0][0][0] == "osascript"
    assert calls[0][0][-1] == str(tmp_path)
    assert str(tmp_path) not in calls[0][0][2]


def test_open_directory_uses_validated_adapter_path(tmp_path: Path) -> None:
    calls: list[tuple[list[str], dict[str, str]]] = []
    adapter = WindowsNativeDirectoryAdapter(
        run_command=lambda args, env: calls.append((args, env)) or CompletedProcess(args, 0, "", "")
    )

    adapter.open_directory(tmp_path / "exports")

    assert calls == [(["explorer.exe", str(tmp_path / "exports")], calls[0][1])]
