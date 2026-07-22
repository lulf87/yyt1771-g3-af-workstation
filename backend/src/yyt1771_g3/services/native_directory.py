from __future__ import annotations

import ctypes
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from subprocess import CompletedProcess
from uuid import UUID


NATIVE_DIALOG_CANCELLED = 70


class NativeDirectoryError(RuntimeError):
    """Raised when a native directory operation cannot be completed."""


def system_documents_dir(
    *,
    platform_name: str | None = None,
    windows_resolver: Callable[[], Path] | None = None,
) -> Path:
    configured = os.environ.get("YYT1771_G3_DOCUMENTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve(strict=False)
    platform_value = platform_name or sys.platform
    if platform_value == "win32":
        resolver = windows_resolver or windows_documents_known_folder
        return resolver().expanduser().resolve(strict=False)
    return (Path.home() / "Documents").resolve(strict=False)


class _Guid(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _guid(value: str) -> _Guid:
    raw = UUID(value).bytes_le
    return _Guid(
        int.from_bytes(raw[0:4], "little"),
        int.from_bytes(raw[4:6], "little"),
        int.from_bytes(raw[6:8], "little"),
        (ctypes.c_ubyte * 8)(*raw[8:16]),
    )


def windows_documents_known_folder() -> Path:
    if sys.platform != "win32":
        raise NativeDirectoryError("Windows Documents known folder can only be resolved on Windows.")
    folder_id = _guid("FDD39AD0-238F-46AF-ADB4-6C85480369C7")
    result = ctypes.c_wchar_p()
    status = ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(folder_id), 0, None, ctypes.byref(result))
    try:
        if status != 0 or not result.value:
            raise NativeDirectoryError(f"SHGetKnownFolderPath failed with status {status}")
        return Path(result.value)
    finally:
        if result:
            ctypes.windll.ole32.CoTaskMemFree(result)


def native_directory_adapter(*, platform_name: str | None = None) -> "NativeDirectoryAdapter":
    platform_value = platform_name or sys.platform
    if platform_value == "win32":
        return WindowsNativeDirectoryAdapter()
    if platform_value == "darwin":
        return MacNativeDirectoryAdapter()
    return NoopNativeDirectoryAdapter()


class NativeDirectoryAdapter:
    def choose_directory(self, initial_dir: Path) -> Path | None:
        raise NotImplementedError

    def open_directory(self, directory: Path) -> None:
        raise NotImplementedError


class WindowsNativeDirectoryAdapter(NativeDirectoryAdapter):
    def __init__(
        self,
        *,
        run_command: Callable[[list[str], dict[str, str]], CompletedProcess[str]] | None = None,
    ) -> None:
        self._run_command = run_command or _run_text_command

    def choose_directory(self, initial_dir: Path) -> Path | None:
        script = r"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 YY/T 1771 G3 导出保存文件夹'
$dialog.ShowNewFolderButton = $true
if ($env:G3_INITIAL_DIRECTORY -and [System.IO.Directory]::Exists($env:G3_INITIAL_DIRECTORY)) {
  $dialog.SelectedPath = $env:G3_INITIAL_DIRECTORY
}
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.WriteLine($dialog.SelectedPath)
  exit 0
}
exit 70
"""
        args = [
            "powershell.exe",
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]
        env = dict(os.environ)
        env["G3_INITIAL_DIRECTORY"] = str(initial_dir)
        result = self._run_command(args, env)
        if result.returncode == NATIVE_DIALOG_CANCELLED:
            return None
        if result.returncode != 0:
            raise NativeDirectoryError(result.stderr.strip() or "Windows folder picker failed.")
        selected = result.stdout.strip()
        return Path(selected).expanduser().resolve(strict=False) if selected else None

    def open_directory(self, directory: Path) -> None:
        result = self._run_command(["explorer.exe", str(directory)], dict(os.environ))
        if result.returncode != 0:
            raise NativeDirectoryError(result.stderr.strip() or "Could not open export folder.")


class MacNativeDirectoryAdapter(NativeDirectoryAdapter):
    def __init__(
        self,
        *,
        run_command: Callable[[list[str], dict[str, str]], CompletedProcess[str]] | None = None,
    ) -> None:
        self._run_command = run_command or _run_text_command

    def choose_directory(self, initial_dir: Path) -> Path | None:
        script = (
            'on run argv\n'
            '  set initialPath to POSIX file (item 1 of argv)\n'
            '  try\n'
            '    set chosenFolder to choose folder with prompt "选择 YY/T 1771 G3 导出保存文件夹" default location initialPath\n'
            '    return POSIX path of chosenFolder\n'
            '  on error number -128\n'
            f'    error number {NATIVE_DIALOG_CANCELLED}\n'
            '  end try\n'
            'end run\n'
        )
        result = self._run_command(["osascript", "-e", script, str(initial_dir)], dict(os.environ))
        if result.returncode == NATIVE_DIALOG_CANCELLED:
            return None
        if result.returncode != 0:
            raise NativeDirectoryError(result.stderr.strip() or "macOS folder picker failed.")
        selected = result.stdout.strip()
        return Path(selected).expanduser().resolve(strict=False) if selected else None

    def open_directory(self, directory: Path) -> None:
        result = self._run_command(["open", str(directory)], dict(os.environ))
        if result.returncode != 0:
            raise NativeDirectoryError(result.stderr.strip() or "Could not open export folder.")


class NoopNativeDirectoryAdapter(NativeDirectoryAdapter):
    def choose_directory(self, initial_dir: Path) -> Path | None:
        raise NativeDirectoryError("Native folder picker is not supported on this platform.")

    def open_directory(self, directory: Path) -> None:
        raise NativeDirectoryError("Opening folders is not supported on this platform.")


def _run_text_command(args: list[str], env: dict[str, str]) -> CompletedProcess[str]:
    return subprocess.run(args, env=env, capture_output=True, check=False, text=True)
