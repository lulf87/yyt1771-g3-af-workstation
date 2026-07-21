# Native Export Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser directory handles with a writable per-user default/custom export directory that is selected by the operating system, remembered across restart/upgrade, and used for atomic non-overwriting ZIP saves.

**Architecture:** Resolve the system Documents known folder in the backend and persist a versioned absolute custom path under the current user's application-data directory. Small Windows/macOS adapters invoke the operating system's folder chooser/open operation without accepting arbitrary frontend paths; the export service validates actual writes, generates the existing bundle, copies through a same-directory `.part`, and atomically installs a conflict-free final filename.

**Tech Stack:** Python 3.11 standard library (`ctypes`, `subprocess`, `tempfile`, `os.replace`), FastAPI/Pydantic, existing export service, React 18 + TypeScript, Node test runner, pytest, Playwright/real Chromium, Windows PowerShell/.NET system dialog, macOS AppleScript system dialog, PyInstaller/Inno Setup.

---

## File map

- `backend/src/yyt1771_g3/core/app_paths.py`: per-user preferences directory and environment override used by tests.
- `backend/src/yyt1771_g3/core/user_preferences.py`: versioned export-directory preference with atomic JSON writes.
- `backend/src/yyt1771_g3/services/native_directory.py`: Windows/macOS choose/open adapters and Windows Documents known-folder resolution.
- `backend/src/yyt1771_g3/services/export_destination_service.py`: path status, write validation, choose/reset/open, conflict handling, and atomic bundle placement.
- `backend/src/yyt1771_g3/api/main.py`: local-only destination and save endpoints; existing blob-download endpoint remains for compatibility.
- `frontend/src/api/client.ts`: typed destination actions.
- `frontend/src/exportDestination.ts`: pure display/action state helpers; no filesystem handle types.
- `frontend/src/main.tsx`: complete-path display and Change/Open/Restore/Export actions.
- `frontend/src/i18n.ts`, `frontend/src/styles.css`: operator copy and path layout.
- `packaging/windows/build_release.ps1`, `backend/tests/unit/test_windows_packaging.py`: packaged default-destination smoke without opening an unattended dialog.

### Task 1: Add per-user preference paths and atomic versioned storage

**Files:**
- Modify: `backend/src/yyt1771_g3/core/app_paths.py`
- Create: `backend/src/yyt1771_g3/core/user_preferences.py`
- Modify: `backend/tests/unit/test_app_paths.py`
- Create: `backend/tests/unit/test_user_preferences.py`

- [ ] **Step 1: Write failing path and preference tests**

Cover Windows LocalAppData, macOS Application Support, environment override, missing preference, valid Unicode path, malformed JSON, unsupported schema, and replace failure that preserves the prior file:

```python
def test_preferences_dir_uses_windows_local_app_data(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(app_paths.sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "本地应用数据"))
    assert app_paths.preferences_dir() == tmp_path / "本地应用数据" / "YYT1771-G3" / "preferences"


def test_preferences_dir_uses_macos_application_support(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(app_paths.sys, "platform", "darwin")
    monkeypatch.setattr(app_paths.Path, "home", classmethod(lambda cls: tmp_path))
    assert app_paths.preferences_dir() == tmp_path / "Library" / "Application Support" / "YYT1771-G3" / "preferences"
```

```python
def test_export_preference_round_trips_unicode_absolute_path(tmp_path: Path) -> None:
    preference_path = tmp_path / "preferences" / "export.json"
    selected = tmp_path / "测量 导出"
    save_export_directory_preference(selected, path=preference_path)
    assert load_export_directory_preference(path=preference_path).directory == selected.resolve()


def test_failed_preference_replace_preserves_previous_file(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    preference_path = tmp_path / "export.json"
    save_export_directory_preference(tmp_path / "first", path=preference_path)
    before = preference_path.read_bytes()
    monkeypatch.setattr(user_preferences.os, "replace", lambda source, target: (_ for _ in ()).throw(OSError("denied")))
    with pytest.raises(OSError, match="denied"):
        save_export_directory_preference(tmp_path / "second", path=preference_path)
    assert preference_path.read_bytes() == before
    assert list(tmp_path.glob(".export.json.*.tmp")) == []
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_app_paths.py \
  backend/tests/unit/test_user_preferences.py
```

Expected: collection FAIL because `preferences_dir()` and `user_preferences.py` do not exist.

- [ ] **Step 3: Add the per-user preferences directory**

Add an environment override and explicit platform behavior. Do not use the machine-wide `ProgramData` path:

```python
def preferences_dir() -> Path:
    configured = _environment_path("YYT1771_G3_USER_PREFERENCES_DIR")
    if configured is not None:
        return configured
    if sys.platform == "win32":
        root = _environment_path("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return root / APP_DIR_NAME / "preferences"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME / "preferences"
    root = _environment_path("XDG_CONFIG_HOME") or (Path.home() / ".config")
    return root / APP_DIR_NAME / "preferences"
```

Include `preferences_dir()` in `ensure_runtime_directories()` so the launcher creates it without modifying any existing preference file.

- [ ] **Step 4: Implement versioned atomic preference storage**

Create the module with schema version 1 and an absolute-path invariant:

```python
EXPORT_PREFERENCE_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class ExportDirectoryPreference:
    schema_version: int
    directory: Path


class UserPreferenceError(RuntimeError):
    pass


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
    return ExportDirectoryPreference(EXPORT_PREFERENCE_SCHEMA_VERSION, directory.resolve(strict=False))
```

Use `tempfile.mkstemp(dir=target.parent)`, `json.dump(..., ensure_ascii=False, indent=2)`, `flush`, `os.fsync`, and `os.replace` in `save_export_directory_preference()`. Implement `clear_export_directory_preference()` as `unlink(missing_ok=True)`; no installer file is allowed to overwrite this directory.

- [ ] **Step 5: Run preference tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_app_paths.py \
  backend/tests/unit/test_user_preferences.py
```

Expected: all application-path and preference tests PASS.

- [ ] **Step 6: Commit preference storage**

```bash
git add backend/src/yyt1771_g3/core/app_paths.py \
  backend/src/yyt1771_g3/core/user_preferences.py \
  backend/tests/unit/test_app_paths.py \
  backend/tests/unit/test_user_preferences.py
git commit -m "feat(export): persist per-user destination"
```

### Task 2: Implement operating-system Documents, choose, and open adapters

**Files:**
- Create: `backend/src/yyt1771_g3/services/native_directory.py`
- Create: `backend/tests/unit/test_native_directory.py`

- [ ] **Step 1: Write failing adapter tests**

Use injected command runners and known-folder resolvers; no test may display a real dialog:

```python
def test_system_documents_uses_windows_known_folder(tmp_path: Path) -> None:
    expected = tmp_path / "OneDrive - 实验室" / "文档"
    assert system_documents_dir(
        platform_name="win32",
        windows_resolver=lambda: expected,
    ) == expected


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
```

Add macOS command-shape tests asserting `osascript` receives the initial directory as an argument rather than interpolating it into executable script text. Add open tests asserting only the adapter's provided validated path is used.

- [ ] **Step 2: Run adapter tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_native_directory.py
```

Expected: collection FAIL because `native_directory.py` does not exist.

- [ ] **Step 3: Resolve Windows Documents through `FOLDERID_Documents`**

Define a Windows GUID structure and call `SHGetKnownFolderPath` with `{FDD39AD0-238F-46AF-ADB4-6C85480369C7}`; free the returned memory with `CoTaskMemFree`. `system_documents_dir()` uses that resolver on Windows, `~/Documents` on macOS, and supports `YYT1771_G3_DOCUMENTS_DIR` only as a test/deployment override:

```python
def system_documents_dir(
    *,
    platform_name: str | None = None,
    windows_resolver: Callable[[], Path] = windows_documents_known_folder,
) -> Path:
    configured = os.environ.get("YYT1771_G3_DOCUMENTS_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve(strict=False)
    platform_value = platform_name or sys.platform
    if platform_value == "win32":
        return windows_resolver().resolve(strict=False)
    return (Path.home() / "Documents").resolve(strict=False)
```

Never derive Documents by joining the system drive, `Users`, the account name, and a literal `Documents`; the known-folder result is authoritative for OneDrive and redirected profiles.

Implement the resolver with the exact Windows Known Folder GUID and free the shell allocation:

```python
class _Guid(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
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
    folder_id = _guid("FDD39AD0-238F-46AF-ADB4-6C85480369C7")
    result = ctypes.c_wchar_p()
    status = ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(folder_id), 0, None, ctypes.byref(result))
    if status != 0 or not result.value:
        raise NativeDirectoryError(f"Windows Documents known folder lookup failed: HRESULT 0x{status & 0xffffffff:08x}")
    try:
        return Path(result.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(ctypes.cast(result, ctypes.c_void_p))
```

- [ ] **Step 4: Implement the small platform adapter contract**

Define:

```python
NATIVE_DIALOG_CANCELLED = 2


class NativeDirectoryError(RuntimeError):
    pass


class NativeDirectoryAdapter(Protocol):
    def choose_directory(self, initial_directory: Path) -> Path | None:
        ...

    def open_directory(self, directory: Path) -> None:
        ...
```

For Windows, invoke built-in Windows PowerShell in STA mode with `shell=False`. Pass the initial path through `G3_INITIAL_DIRECTORY`; the fixed script loads `System.Windows.Forms`, sets `FolderBrowserDialog.SelectedPath`, prints UTF-8 on OK, and exits with `NATIVE_DIALOG_CANCELLED = 2` on Cancel:

```python
WINDOWS_FOLDER_PICKER_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 YY/T 1771 G3 导出文件夹'
$dialog.ShowNewFolderButton = $true
$dialog.SelectedPath = $env:G3_INITIAL_DIRECTORY
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($dialog.SelectedPath)
    exit 0
}
exit 2
"""
```

Use `subprocess.run([...], shell=False, capture_output=True, encoding="utf-8", timeout=300, env=env)` and map non-cancel failures to `NativeDirectoryError` with stderr. Open a validated Windows directory with `os.startfile(directory)`.

```python
CommandRunner = Callable[[list[str], dict[str, str]], subprocess.CompletedProcess[str]]


def _run_native_command(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        shell=False,
        capture_output=True,
        encoding="utf-8",
        timeout=300,
        env=env,
        check=False,
    )


class WindowsNativeDirectoryAdapter:
    def __init__(self, *, run_command: CommandRunner = _run_native_command) -> None:
        self._run_command = run_command

    def choose_directory(self, initial_directory: Path) -> Path | None:
        env = {**os.environ, "G3_INITIAL_DIRECTORY": str(initial_directory)}
        executable = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        completed = self._run_command(
            [str(executable), "-NoLogo", "-NoProfile", "-STA", "-Command", WINDOWS_FOLDER_PICKER_SCRIPT],
            env,
        )
        if completed.returncode == NATIVE_DIALOG_CANCELLED:
            return None
        if completed.returncode != 0:
            raise NativeDirectoryError(completed.stderr.strip() or "Windows folder chooser failed.")
        selected = completed.stdout.strip()
        if not selected:
            raise NativeDirectoryError("Windows folder chooser returned an empty path.")
        return Path(selected).expanduser().resolve(strict=False)

    def open_directory(self, directory: Path) -> None:
        os.startfile(directory)  # type: ignore[attr-defined]
```

For macOS, use fixed AppleScript with `on run argv`, `choose folder default location POSIX file (item 1 of argv)`, and `POSIX path`; pass the initial directory after the script argument. Open with `subprocess.run(["open", str(directory)], shell=False, check=True)`.

```python
MACOS_FOLDER_PICKER_SCRIPT = """
on run argv
  try
    set selectedFolder to choose folder with prompt "选择 YY/T 1771 G3 导出文件夹" default location POSIX file (item 1 of argv)
    return POSIX path of selectedFolder
  on error number -128
    return "__G3_CANCELLED__"
  end try
end run
"""


class MacOsNativeDirectoryAdapter:
    def __init__(self, *, run_command: CommandRunner = _run_native_command) -> None:
        self._run_command = run_command

    def choose_directory(self, initial_directory: Path) -> Path | None:
        completed = self._run_command(
            ["osascript", "-e", MACOS_FOLDER_PICKER_SCRIPT, str(initial_directory)],
            dict(os.environ),
        )
        if completed.returncode != 0:
            raise NativeDirectoryError(completed.stderr.strip() or "macOS folder chooser failed.")
        selected = completed.stdout.strip()
        return None if selected == "__G3_CANCELLED__" else Path(selected).resolve(strict=False)

    def open_directory(self, directory: Path) -> None:
        subprocess.run(["open", str(directory)], shell=False, check=True)


def get_native_directory_adapter(*, platform_name: str | None = None) -> NativeDirectoryAdapter:
    platform_value = platform_name or sys.platform
    if platform_value == "win32":
        return WindowsNativeDirectoryAdapter()
    if platform_value == "darwin":
        return MacOsNativeDirectoryAdapter()
    raise NativeDirectoryError(f"Native directory actions are unsupported on {platform_value}.")
```

- [ ] **Step 5: Run adapter tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_native_directory.py
```

Expected: known-folder, Unicode path, cancel, command safety, unsupported-platform, and open tests PASS without a visible dialog.

- [ ] **Step 6: Commit native adapters**

```bash
git add backend/src/yyt1771_g3/services/native_directory.py \
  backend/tests/unit/test_native_directory.py
git commit -m "feat(export): add native directory adapters"
```

### Task 3: Validate destinations and atomically place conflict-free export bundles

**Files:**
- Create: `backend/src/yyt1771_g3/services/export_destination_service.py`
- Create: `backend/tests/unit/test_export_destination_service.py`
- Modify: `backend/tests/integration/test_export_service.py`

- [ ] **Step 1: Write failing destination-service tests**

Cover default path, remembered custom path, cancellation, write denial, lost custom path, reset, open, Chinese/spaced paths, conflicts, and failed replace cleanup:

```python
def test_default_export_destination_is_documents_subdirectory(tmp_path: Path) -> None:
    status = get_export_destination_status(
        documents_dir=tmp_path / "Documents",
        preference_path=tmp_path / "prefs" / "export.json",
    )
    assert status.path == tmp_path / "Documents" / "YYT1771-G3" / "Exports"
    assert status.source == "default"
    assert status.writable is True


@dataclass
class FakeNativeDirectoryAdapter:
    selection: Path | None
    opened: list[Path] = field(default_factory=list)

    def choose_directory(self, initial_directory: Path) -> Path | None:
        return self.selection

    def open_directory(self, directory: Path) -> None:
        self.opened.append(directory)


def test_cancelled_selection_keeps_previous_destination(tmp_path: Path) -> None:
    previous = tmp_path / "已有 导出"
    save_export_directory_preference(previous, path=tmp_path / "export.json")
    result = choose_export_destination(
        FakeNativeDirectoryAdapter(selection=None),
        documents_dir=tmp_path / "Documents",
        preference_path=tmp_path / "export.json",
    )
    assert result.cancelled is True
    assert result.status.path == previous.resolve()


def test_atomic_bundle_save_avoids_conflicts_and_cleans_failed_part(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    source = tmp_path / "source.zip"
    source.write_bytes(b"zip-data")
    target = tmp_path / "导出 结果"
    first = atomic_copy_export_bundle(source, target)
    second = atomic_copy_export_bundle(source, target)
    assert first.name == "source.zip"
    assert second.name == "source (2).zip"
    monkeypatch.setattr(export_destination_service.os, "replace", lambda source, target: (_ for _ in ()).throw(OSError("replace failed")))
    with pytest.raises(OSError, match="replace failed"):
        atomic_copy_export_bundle(source, target)
    assert list(target.glob("*.part")) == []
    assert (target / "source.zip").read_bytes() == b"zip-data"
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_export_destination_service.py
```

Expected: collection FAIL because `export_destination_service.py` does not exist.

- [ ] **Step 3: Implement status and actual write validation**

Define status/action result dataclasses. If no preference exists, use `system_documents_dir()/YYT1771-G3/Exports`; if a custom preference exists, never fall back silently when it is unavailable:

```python
class ExportDestinationError(RuntimeError):
    def __init__(self, message: str, *, stage: str, path: Path) -> None:
        super().__init__(message)
        self.stage = stage
        self.path = path


@dataclass(frozen=True)
class ExportDestinationStatus:
    path: Path
    default_path: Path
    source: Literal["default", "custom"]
    writable: bool
    error: str = ""


@dataclass(frozen=True)
class ExportDestinationChoice:
    status: ExportDestinationStatus
    cancelled: bool


@dataclass(frozen=True)
class SavedExportBundle:
    path: Path
    filename: str
    size: int


def validate_export_directory(directory: Path) -> Path:
    normalized = directory.expanduser().resolve(strict=False)
    normalized.mkdir(parents=True, exist_ok=True)
    fd, probe_name = tempfile.mkstemp(prefix=".g3-write-probe-", dir=normalized)
    probe = Path(probe_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(b"g3")
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        probe.unlink(missing_ok=True)
    return normalized
```

Do not call `iterdir`, glob, recursive scans, or reject a directory because it already contains files.

Implement status so a malformed preference raises `UserPreferenceError`, an absent preference chooses default, and an invalid custom path is returned as `writable=False` with its own path rather than default:

```python
def get_export_destination_status(
    *,
    documents_dir: Path | None = None,
    preference_path: Path | None = None,
) -> ExportDestinationStatus:
    default_path = (documents_dir or system_documents_dir()) / "YYT1771-G3" / "Exports"
    preference = load_export_directory_preference(path=preference_path)
    path = preference.directory if preference else default_path
    source: Literal["default", "custom"] = "custom" if preference else "default"
    try:
        validated = validate_export_directory(path)
    except OSError as exc:
        return ExportDestinationStatus(path.resolve(strict=False), default_path.resolve(strict=False), source, False, str(exc))
    return ExportDestinationStatus(validated, default_path.resolve(strict=False), source, True, "")
```

- [ ] **Step 4: Implement choose/reset/open without arbitrary paths**

`choose_export_destination(adapter, ...)` calls `adapter.choose_directory(current.path)`, validates the selected path, and only then saves the preference. Cancel returns the unchanged status. `reset_export_destination()` validates the default first, then clears the custom preference. `open_export_destination(adapter, ...)` takes no frontend path; it loads and revalidates the current status before calling `adapter.open_directory(status.path)`.

```python
def choose_export_destination(
    adapter: NativeDirectoryAdapter,
    *,
    documents_dir: Path | None = None,
    preference_path: Path | None = None,
) -> ExportDestinationChoice:
    current = get_export_destination_status(documents_dir=documents_dir, preference_path=preference_path)
    selected = adapter.choose_directory(current.path if current.path.exists() else current.default_path)
    if selected is None:
        return ExportDestinationChoice(current, True)
    validated = validate_export_directory(selected)
    save_export_directory_preference(validated, path=preference_path)
    return ExportDestinationChoice(
        get_export_destination_status(documents_dir=documents_dir, preference_path=preference_path),
        False,
    )


def reset_export_destination(*, documents_dir: Path | None = None, preference_path: Path | None = None) -> ExportDestinationStatus:
    default_path = validate_export_directory((documents_dir or system_documents_dir()) / "YYT1771-G3" / "Exports")
    clear_export_directory_preference(path=preference_path)
    return ExportDestinationStatus(default_path, default_path, "default", True, "")


def open_export_destination(
    adapter: NativeDirectoryAdapter,
    *,
    documents_dir: Path | None = None,
    preference_path: Path | None = None,
) -> ExportDestinationStatus:
    status = get_export_destination_status(documents_dir=documents_dir, preference_path=preference_path)
    _require_writable_status(status)
    adapter.open_directory(status.path)
    return status
```

Use this exact failure rule:

```python
def _require_writable_status(status: ExportDestinationStatus) -> None:
    if not status.writable:
        raise ExportDestinationError(
            "Configured export directory is unavailable or not writable; change it or restore the default.",
            stage="validate_destination",
            path=status.path,
        )
```

- [ ] **Step 5: Implement no-overwrite same-directory atomic copy**

Reserve the final candidate with `os.open(..., O_CREAT | O_EXCL | O_WRONLY)`, write a unique `.part` in the same directory, flush and `fsync`, then `os.replace()` the `.part` over the placeholder created by this call. Try `name.zip`, `name (2).zip`, `name (3).zip` in order:

```python
def atomic_copy_export_bundle(source: Path, destination: Path) -> Path:
    directory = validate_export_directory(destination)
    final_path, reservation_fd = _reserve_conflict_free_path(directory, source.name)
    os.close(reservation_fd)
    part_path: Path | None = None
    installed = False
    try:
        part_fd, part_name = tempfile.mkstemp(prefix=f".{final_path.name}.", suffix=".part", dir=directory)
        part_path = Path(part_name)
        with source.open("rb") as reader, os.fdopen(part_fd, "wb") as writer:
            shutil.copyfileobj(reader, writer, length=1024 * 1024)
            writer.flush()
            os.fsync(writer.fileno())
        os.replace(part_path, final_path)
        installed = True
        return final_path
    finally:
        if part_path is not None:
            part_path.unlink(missing_ok=True)
        if not installed:
            final_path.unlink(missing_ok=True)
```

`save_run_export_bundle()` calls existing `export_run_bundle(run_store, run_id)` first, then this copy function, and returns final absolute path, filename, and size.

```python
def _reserve_conflict_free_path(directory: Path, filename: str) -> tuple[Path, int]:
    source_name = Path(filename)
    for index in itertools.count(1):
        candidate_name = source_name.name if index == 1 else f"{source_name.stem} ({index}){source_name.suffix}"
        candidate = directory / candidate_name
        try:
            descriptor = os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            continue
        return candidate, descriptor


def save_run_export_bundle(run_store: RunStore, run_id: str) -> SavedExportBundle:
    status = get_export_destination_status()
    _require_writable_status(status)
    generated = export_run_bundle(run_store, run_id)
    final_path = atomic_copy_export_bundle(generated, status.path)
    return SavedExportBundle(final_path, final_path.name, final_path.stat().st_size)
```

- [ ] **Step 6: Run service/export tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_export_destination_service.py \
  backend/tests/integration/test_export_service.py
```

Expected: destination and existing ZIP content tests PASS; conflicts never overwrite; failure leaves no `.part` or empty reservation.

- [ ] **Step 7: Commit destination service**

```bash
git add backend/src/yyt1771_g3/services/export_destination_service.py \
  backend/tests/unit/test_export_destination_service.py \
  backend/tests/integration/test_export_service.py
git commit -m "feat(export): save bundles atomically to destination"
```

### Task 4: Add local destination APIs while preserving download compatibility

**Files:**
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Create: `backend/tests/integration/test_export_destination_api.py`
- Modify: `backend/tests/integration/test_export_api.py`

- [ ] **Step 1: Write failing endpoint tests with a fake native adapter**

Monkeypatch `get_native_directory_adapter()` so tests never open an OS window. Cover status, choose, cancel, reset, open, save, missing run, invalid custom destination, and prove open accepts no path body:

```python
def test_export_destination_api_chooses_opens_and_saves(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_USER_PREFERENCES_DIR", str(tmp_path / "prefs"))
    monkeypatch.setenv("YYT1771_G3_DOCUMENTS_DIR", str(tmp_path / "Documents"))
    selected = tmp_path / "自定义 导出"
    adapter = FakeNativeDirectoryAdapter(selection=selected)
    monkeypatch.setattr(api_main, "get_native_directory_adapter", lambda: adapter)
    client = TestClient(api_main.app)

    initial = client.get("/api/export-destination")
    chosen = client.post("/api/export-destination/choose")
    opened = client.post("/api/export-destination/open")
    saved = client.post(f"/api/runs/{run_id}/exports/save")

    assert initial.json()["source"] == "default"
    assert chosen.json()["path"] == str(selected.resolve())
    assert opened.json()["opened"] is True
    assert adapter.opened == [selected.resolve()]
    assert Path(saved.json()["path"]).parent == selected.resolve()
    assert Path(saved.json()["path"]).is_file()
```

```python
def test_open_destination_ignores_arbitrary_frontend_path(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    response = TestClient(api_main.app).post(
        "/api/export-destination/open",
        json={"path": str(tmp_path / "not-configured")},
    )
    assert response.status_code == 200
    assert adapter.opened == [configured_path]
```

- [ ] **Step 2: Run endpoint tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/integration/test_export_destination_api.py
```

Expected: all new endpoints return HTTP 404.

- [ ] **Step 3: Add response serialization and five destination actions**

Add these routes with no user-supplied path model:

```python
def export_destination_status_payload(status: ExportDestinationStatus) -> dict[str, Any]:
    return {
        "path": str(status.path),
        "default_path": str(status.default_path),
        "source": status.source,
        "writable": status.writable,
        "error": status.error,
    }


@app.get("/api/export-destination")
def get_export_destination() -> dict[str, Any]:
    return export_destination_status_payload(get_export_destination_status())


@app.post("/api/export-destination/choose")
def choose_export_destination_endpoint() -> dict[str, Any]:
    result = choose_export_destination(get_native_directory_adapter())
    return {**export_destination_status_payload(result.status), "cancelled": result.cancelled}


@app.post("/api/export-destination/reset")
def reset_export_destination_endpoint() -> dict[str, Any]:
    return export_destination_status_payload(reset_export_destination())


@app.post("/api/export-destination/open")
def open_export_destination_endpoint() -> dict[str, Any]:
    status = open_export_destination(get_native_directory_adapter())
    return {**export_destination_status_payload(status), "opened": True}


@app.post("/api/runs/{run_id}/exports/save")
def save_run_export_bundle_endpoint(run_id: str) -> dict[str, Any]:
    saved = save_run_export_bundle(_run_store(), run_id)
    return {"run_id": run_id, "path": str(saved.path), "filename": saved.filename, "size": saved.size}
```

Map `ExportDestinationError` to status 422 for invalid/unwritable destinations, native cancel to a 200 response with `cancelled=true`, missing run to 404, and unexpected generation/copy failures to a structured 500 containing `stage` and the configured path. Never silently call the old browser download endpoint as fallback.

- [ ] **Step 4: Keep `/exports/download` as explicit compatibility only**

Retain the existing endpoint and tests so older clients/import tools still work. Add a test that `/exports/save` returns JSON rather than `FileResponse`, and that invoking it does not set a browser-download `Content-Disposition` header.

```python
saved = client.post(f"/api/runs/{run_id}/exports/save")
download = client.post(f"/api/runs/{run_id}/exports/download")
assert saved.status_code == 200
assert saved.headers["content-type"].startswith("application/json")
assert "content-disposition" not in saved.headers
assert download.status_code == 200
assert download.headers["content-type"].startswith("application/zip")
```

- [ ] **Step 5: Run export API tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/integration/test_export_destination_api.py \
  backend/tests/integration/test_export_api.py
```

Expected: all destination API and compatibility download tests PASS.

- [ ] **Step 6: Commit backend APIs**

```bash
git add backend/src/yyt1771_g3/api/main.py \
  backend/tests/integration/test_export_destination_api.py \
  backend/tests/integration/test_export_api.py
git commit -m "feat(api): manage native export destination"
```

### Task 5: Replace browser directory handles with backend destination actions

**Files:**
- Delete: `frontend/src/exportSaveTarget.ts`
- Create: `frontend/src/exportDestination.ts`
- Delete: `frontend/tests/exportSaveTarget.test.mjs`
- Create: `frontend/tests/exportDestination.test.mjs`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/tests/apiClientUrls.test.mjs`
- Modify: `frontend/tests/operatorRegionResults.test.mjs`

- [ ] **Step 1: Write failing API-client and no-browser-handle tests**

Assert methods/URLs and scan all frontend source for forbidden browser filesystem authority:

```javascript
test("frontend contains no browser directory handle authority", () => {
  const files = ["src/main.tsx", "src/api/client.ts", "src/exportDestination.ts"];
  const combined = files.map((file) => readFileSync(resolve(rootDir, file), "utf8")).join("\n");
  assert.doesNotMatch(combined, /showDirectoryPicker/);
  assert.doesNotMatch(combined, /indexedDB/);
  assert.doesNotMatch(combined, /FileSystemDirectoryHandle/);
  assert.doesNotMatch(combined, /writeBlobToDirectory/);
});


test("export destination client uses backend-managed actions", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    return Response.json({ path: "C:\\Users\\测试\\Documents\\YYT1771-G3\\Exports", default_path: "C:\\Users\\测试\\Documents\\YYT1771-G3\\Exports", source: "default", writable: true, error: "" });
  };
  await getExportDestination();
  await chooseExportDestination();
  await resetExportDestination();
  await openExportDestination();
  await saveRunExportBundle("run-1");
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "POST", "POST", "POST"]);
  assert.match(calls[4].url, /\/api\/runs\/run-1\/exports\/save$/);
});
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```bash
cd frontend && node --test \
  tests/exportDestination.test.mjs \
  tests/apiClientUrls.test.mjs \
  tests/operatorRegionResults.test.mjs
```

Expected: FAIL because the new module/client functions do not exist and the old picker/IndexedDB code is still present.

- [ ] **Step 3: Add typed client actions**

Define exact response types and methods:

```typescript
export type ExportDestinationStatus = {
  path: string;
  default_path: string;
  source: "default" | "custom";
  writable: boolean;
  error: string;
  cancelled?: boolean;
  opened?: boolean;
};

export type SavedExportBundle = {
  run_id: string;
  path: string;
  filename: string;
  size: number;
};

export const getExportDestination = () => requestJson<ExportDestinationStatus>("/api/export-destination");
export const chooseExportDestination = () => requestJson<ExportDestinationStatus>("/api/export-destination/choose", { method: "POST" });
export const resetExportDestination = () => requestJson<ExportDestinationStatus>("/api/export-destination/reset", { method: "POST" });
export const openExportDestination = () => requestJson<ExportDestinationStatus>("/api/export-destination/open", { method: "POST" });
export const saveRunExportBundle = (runId: string) => requestJson<SavedExportBundle>(`/api/runs/${runId}/exports/save`, { method: "POST" });
```

Keep `fetchRunExportBundle()`/`downloadRunExportBundle()` only for compatibility call sites unrelated to the guided local save dialog.

- [ ] **Step 4: Replace the helper module**

Delete directory-handle code. Create pure state helpers that never store or accept a path outside the backend response:

```typescript
export type ExportDestinationViewState = {
  status: ExportDestinationStatus | null;
  busy: "idle" | "loading" | "choosing" | "opening" | "resetting" | "exporting";
  message: string;
  error: string;
};

export function canSaveExport(state: ExportDestinationViewState, runId: string | null): boolean {
  return Boolean(runId && state.status?.writable && state.busy === "idle");
}

export function applyDestinationResponse(
  state: ExportDestinationViewState,
  status: ExportDestinationStatus
): ExportDestinationViewState {
  return {
    ...state,
    status,
    busy: "idle",
    error: status.error,
    message: status.cancelled ? "Export folder selection cancelled" : "Export folder ready"
  };
}
```

Test cancel keeps the existing path and does not become an error; unwritable status disables export and preserves the exact backend error.

- [ ] **Step 5: Rebuild `ExportSaveDialog` around backend state**

On open, call `getExportDestination()`. Render the full `status.path` in a selectable/path-wrapping element, show `default/custom` and writable state, and wire four actions:

```tsx
<div className="exportDestinationPath" title={destination.path}>{destination.path}</div>
<div className="buttonPair">
  <button className="secondaryButton" disabled={busy} onClick={changeLocation} type="button">{t("Change location")}</button>
  <button className="secondaryButton" disabled={busy || !destination.writable} onClick={openLocation} type="button">{t("Open export folder")}</button>
  <button className="secondaryButton" disabled={busy || destination.source === "default"} onClick={restoreDefault} type="button">{t("Restore default location")}</button>
  <button className="primaryButton" disabled={busy || !runId || !destination.writable} onClick={exportRun} type="button">{t("Export")}</button>
</div>
```

`changeLocation()` calls the backend picker and leaves the prior destination on `cancelled=true`. `exportRun()` calls `saveRunExportBundle(runId)`, displays the returned absolute path/filename, calls `onComplete(filename)`, and closes only after success. An unavailable custom directory stays visible with its error and does not trigger browser download.

- [ ] **Step 6: Add localized copy and long-path styling**

Add these keys in both language maps:

```typescript
"Export destination": "导出位置",
"Change location": "更改位置",
"Open export folder": "打开导出文件夹",
"Restore default location": "恢复默认位置",
"Default export location": "默认导出位置",
"Custom export location": "自定义导出位置",
"Export folder selection cancelled": "已取消选择导出文件夹",
"Export saved to": "导出已保存到",
"Configured export folder is unavailable": "配置的导出文件夹不可用"
```

Use `overflow-wrap: anywhere`, selectable text, and a monospace fallback for `.exportDestinationPath`; do not truncate the authoritative path to a basename.

- [ ] **Step 7: Run frontend tests and production build and verify GREEN**

Run:

```bash
cd frontend && npm test && npm run build
```

Expected: all frontend tests/build PASS and `rg -n "showDirectoryPicker|FileSystemDirectoryHandle|indexedDB|writeBlobToDirectory" frontend/src` returns no matches.

- [ ] **Step 8: Commit the frontend replacement**

```bash
git add frontend/src/api/client.ts frontend/src/exportDestination.ts \
  frontend/src/main.tsx frontend/src/i18n.ts frontend/src/styles.css \
  frontend/tests/exportDestination.test.mjs frontend/tests/apiClientUrls.test.mjs \
  frontend/tests/operatorRegionResults.test.mjs
git rm frontend/src/exportSaveTarget.ts frontend/tests/exportSaveTarget.test.mjs
git commit -m "feat(ui): use persistent native export destination"
```

### Task 6: Packaged smoke, browser verification, and Windows handoff

**Files:**
- Modify: `packaging/windows/build_release.ps1`
- Modify: `backend/tests/unit/test_windows_packaging.py`
- Modify: `problem.md`
- Create evidence under: `output/playwright/p0117-native-export-destination-20260721/`

- [ ] **Step 1: Add a non-interactive packaged default-path smoke**

After health/profile checks, call the status endpoint only; do not call `choose` in GitHub Actions:

```powershell
$ExportDestination = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/api/export-destination" -TimeoutSec 2
$SmokeExportDestinationReady = $ExportDestination.source -eq "default" `
    -and $ExportDestination.writable `
    -and $ExportDestination.path -like "*YYT1771-G3*Exports"
if (-not $SmokeExportDestinationReady) {
    throw "Packaged G3Workstation.exe did not initialize a writable default export destination"
}
```

Add source assertions in `test_windows_packaging.py` for the endpoint, `writable`, and the failure message. No PyInstaller spec change is needed because the Windows implementation uses OS-provided PowerShell/.NET and the macOS implementation is not packaged into the Windows runtime as an external library.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests
cd frontend && npm test && npm run build
rg -n "showDirectoryPicker|FileSystemDirectoryHandle|indexedDB|writeBlobToDirectory" frontend/src
git diff --check
```

Expected: tests/build/diff check PASS and `rg` exits 1 with no forbidden browser-directory matches.

- [ ] **Step 3: Perform required macOS real-browser and native-dialog verification**

Start the application with a temporary user-preferences directory and open the real browser:

```bash
YYT1771_G3_USER_PREFERENCES_DIR="$PWD/output/playwright/p0117-native-export-destination-20260721/preferences" \
scripts/g3_fast_start.sh sim-sim
```

Using a completed run, verify default Documents path, native Change dialog, Cancel, selection of a Chinese/spaced writable folder, full path display, Open Folder, export, second export conflict suffix, browser reload, backend restart persistence, Restore Default, and an intentionally unwritable location error. Confirm no browser “system files” directory error and no silent fallback.

- [ ] **Step 4: Update P-0117 truthfully**

Record browser, macOS version, URLs, selected directories, restart step, final files, expected/actual results, screenshot/log paths, and console state. Set:

```text
Status: FIXED_PENDING_BROWSER_RETEST
```

Mac browser/native-dialog PASS does not close P-0117; Windows Known Folder, Windows native dialog, ACL errors, removable-drive loss, restart, and in-place upgrade still require target Windows verification.

- [ ] **Step 5: Commit verification and packaging checks**

```bash
git add packaging/windows/build_release.ps1 \
  backend/tests/unit/test_windows_packaging.py \
  problem.md
git add -f output/playwright/p0117-native-export-destination-20260721
git commit -m "test(export): verify persistent native destination"
```

If repository policy excludes screenshot binaries, commit the textual evidence log and retain local screenshot paths in `problem.md`.

- [ ] **Step 6: Build and verify the next Windows package**

Trigger `.github/workflows/windows-release.yml`, install the generated Setup on a clean Windows 11 x64 user account, and verify:

```text
Default path resolves the actual Documents known folder, including OneDrive/redirection.
The Windows native chooser accepts ordinary local, Chinese/spaced, and writable removable-drive paths.
Cancel keeps the prior path; system/Program Files/read-only paths show actionable permission errors.
Open Folder opens only the configured directory.
Repeated export creates conflict-free names and leaves no .part files.
Restart and installer upgrade preserve the custom path.
Disconnecting a configured removable drive shows unavailable status and does not fall back.
Restore Default returns to Documents/YYT1771-G3/Exports.
```

Only after the Windows evidence is recorded may P-0117 become `RESOLVED_BROWSER_VERIFIED`.
