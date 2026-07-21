# Hik Exposure Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add camera-reported Hik exposure controls to Device Setup and Operator preview, persist only successfully applied values, and freeze the actual exposure for every real-camera run.

**Architecture:** Add an optional exposure-capability contract to the camera adapter, with the Hik implementation reading and writing the `ExposureTime` node only after disabling `ExposureAuto`. A focused backend service coordinates apply/re-read/persist/rollback while the existing camera-operation lock remains the ownership authority; a shared React control uses a last-write-wins request coordinator in both UI locations.

**Tech Stack:** Python 3.11, FastAPI/Pydantic, Hik MVS Python binding, YAML with atomic `os.replace`, React 18 + TypeScript, Node test runner, pytest, Playwright/real Chromium, PyInstaller/Inno Setup.

---

## File map

- `backend/src/yyt1771_g3/camera/base.py`: exposure capability value object and optional camera-control protocol.
- `backend/src/yyt1771_g3/camera/hik_mvs_source.py`: Hik node discovery, `ExposureAuto=Off`, validated setting, and actual-value re-read.
- `backend/src/yyt1771_g3/core/hardware_config.py`: preserve exposure as a floating-point microsecond value in profiles and run snapshots.
- `backend/src/yyt1771_g3/services/hardware_setup_service.py`: atomically persist the last camera-accepted exposure.
- `backend/src/yyt1771_g3/services/camera_control_service.py`: apply/persist/rollback transaction and structured failure stages.
- `backend/src/yyt1771_g3/api/main.py`: thin read/update exposure endpoints, camera-lock integration, preview-source reuse, and run-profile actualization.
- `frontend/src/api/client.ts`: typed exposure API contract.
- `frontend/src/exposureControl.ts`: validation and debounced last-write-wins coordinator independent of React.
- `frontend/src/components/camera/ExposureControl.tsx`: shared slider/number/status UI.
- `frontend/src/main.tsx`: mount the shared control in Device Setup and Operator preview.
- `frontend/src/styles.css`, `frontend/src/i18n.ts`: layout and Chinese/English operator copy.
- Targeted tests listed in each task protect adapter, transaction, API, client state, UI placement, and packaged behavior.

### Task 1: Add the camera exposure contract and Hik implementation

**Files:**
- Modify: `backend/src/yyt1771_g3/camera/base.py`
- Modify: `backend/src/yyt1771_g3/camera/hik_mvs_source.py`
- Modify: `backend/tests/unit/test_camera_lazy_import.py`

- [ ] **Step 1: Write failing Hik capability tests**

Extend `_FakeFloatValue` and `_FakeOfficialCamera` so the fake SDK reports current/minimum/maximum values and an optional increment, then add tests for manual mode, range discovery, successful set/re-read, and out-of-range rejection:

```python
class _FakeFloatValue:
    def __init__(self) -> None:
        self.fCurValue = 0.0
        self.fMin = 0.0
        self.fMax = 0.0
        self.fInc = 0.0


def test_hik_exposure_capability_and_set_use_camera_reported_values(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_sdk = _FakeOfficialSdk()
    fake_sdk.exposure_us = 10000.0
    monkeypatch.setattr("importlib.import_module", lambda name: fake_sdk)
    source = HikMvsCameraSource(profile={"serial_number": "DEV-001", "exposure_us": 10000.0})

    initial = source.read_exposure_capability()
    actual = source.set_exposure_us(12345.0)
    updated = source.read_exposure_capability()

    assert initial.supported is True
    assert (initial.minimum_us, initial.maximum_us, initial.increment_us) == (100.0, 100000.0, 1.0)
    assert actual == 12345.0
    assert updated.actual_us == 12345.0
    assert fake_sdk.created[0].configured["ExposureAuto"] == "Off"


def test_hik_exposure_rejects_nonfinite_and_out_of_range_values(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_sdk = _FakeOfficialSdk()
    monkeypatch.setattr("importlib.import_module", lambda name: fake_sdk)
    source = HikMvsCameraSource(profile={"serial_number": "DEV-001"})

    with pytest.raises(ValueError, match="finite"):
        source.set_exposure_us(float("nan"))
    with pytest.raises(ValueError, match="100.0.*100000.0"):
        source.set_exposure_us(100001.0)
```

Make `_FakeOfficialCamera.MV_CC_GetFloatValue()` return `100.0`, `100000.0`, and `1.0` for `ExposureTime`; make `MV_CC_SetFloatValue()` update `fake_sdk.exposure_us` so the test proves the implementation re-reads the device rather than echoing the request.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_camera_lazy_import.py::test_hik_exposure_capability_and_set_use_camera_reported_values \
  backend/tests/unit/test_camera_lazy_import.py::test_hik_exposure_rejects_nonfinite_and_out_of_range_values
```

Expected: FAIL with `AttributeError: 'HikMvsCameraSource' object has no attribute 'read_exposure_capability'`.

- [ ] **Step 3: Define the optional exposure contract**

Add these exact types to `camera/base.py` without adding exposure methods to the existing `CameraSource` protocol, so offline/simulated adapters remain valid:

```python
@dataclass(frozen=True)
class CameraExposureCapability:
    supported: bool
    minimum_us: float | None = None
    maximum_us: float | None = None
    increment_us: float | None = None
    requested_us: float | None = None
    actual_us: float | None = None


class ExposureCapableCameraSource(Protocol):
    def read_exposure_capability(self) -> CameraExposureCapability:
        ...

    def set_exposure_us(self, value: float) -> float:
        ...
```

- [ ] **Step 4: Implement Hik read/set behavior**

Import `math` and `CameraExposureCapability`, add delegation methods to `HikMvsCameraSource`, and add these methods to `_OfficialMvsCameraSession`:

```python
def read_exposure_capability(self) -> CameraExposureCapability:
    if not self._opened:
        self._open()
    values = self._read_float_values("ExposureTime")
    if values is None:
        return CameraExposureCapability(supported=False, requested_us=_finite_float(self.profile.get("exposure_us")))
    minimum, maximum, increment, actual = values
    return CameraExposureCapability(
        supported=True,
        minimum_us=minimum,
        maximum_us=maximum,
        increment_us=increment,
        requested_us=_finite_float(self.profile.get("exposure_us")),
        actual_us=actual,
    )

def set_exposure_us(self, value: float) -> float:
    capability = self.read_exposure_capability()
    requested = float(value)
    if not math.isfinite(requested):
        raise ValueError("Exposure must be finite.")
    if capability.minimum_us is None or capability.maximum_us is None:
        raise ValueError("Hik camera did not report an exposure range.")
    if requested < capability.minimum_us or requested > capability.maximum_us:
        raise ValueError(
            f"Exposure must be between {capability.minimum_us} and {capability.maximum_us} microseconds."
        )
    if capability.increment_us is not None and capability.increment_us > 0:
        steps = (requested - capability.minimum_us) / capability.increment_us
        if abs(steps - round(steps)) > 1e-6:
            raise ValueError(f"Exposure must follow the camera increment of {capability.increment_us} microseconds.")
    self._disable_automatic_exposure()
    self._configure_float("ExposureTime", requested)
    actual = self._read_float("ExposureTime")
    if actual is None or not math.isfinite(actual):
        raise RuntimeError("Hik camera did not return the applied exposure value.")
    self.profile["exposure_us"] = actual
    return actual
```

Use the binding fields that MVS actually exposes. `MVCC_FLOATVALUE` always exposes `fMin`, `fMax`, and `fCurValue`; some bindings do not expose an increment. Return `increment_us=None` in that case and let the browser use `step="any"`—do not invent a numeric step:

```python
def _read_float_values(self, key: str) -> tuple[float, float, float | None, float] | None:
    getter = getattr(self.camera, "MV_CC_GetFloatValue", None)
    value_type = getattr(self.sdk, "MVCC_FLOATVALUE", None)
    if not callable(getter) or value_type is None:
        return None
    value = value_type()
    if int(getter(key, value)) != 0:
        return None
    increment = next(
        (float(getattr(value, name)) for name in ("fInc", "fIncrement", "fIncValue") if hasattr(value, name)),
        None,
    )
    return float(value.fMin), float(value.fMax), increment if increment and increment > 0 else None, float(value.fCurValue)

def _finite_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None

def _disable_automatic_exposure(self) -> None:
    string_setter = getattr(self.camera, "MV_CC_SetEnumValueByString", None)
    if callable(string_setter):
        self._sdk_call(string_setter("ExposureAuto", "Off"), "disable automatic exposure")
        return
    enum_setter = getattr(self.camera, "MV_CC_SetEnumValue", None)
    if callable(enum_setter):
        self._sdk_call(enum_setter("ExposureAuto", 0), "disable automatic exposure")
```

Call `_disable_automatic_exposure()` immediately before the initial `_configure_float("ExposureTime", ...)` in `_open()`.

- [ ] **Step 5: Run adapter regression tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_camera_lazy_import.py
```

Expected: all camera lazy-import and official-SDK-flow tests PASS, including the new exposure cases.

- [ ] **Step 6: Commit the adapter contract**

```bash
git add backend/src/yyt1771_g3/camera/base.py \
  backend/src/yyt1771_g3/camera/hik_mvs_source.py \
  backend/tests/unit/test_camera_lazy_import.py
git commit -m "feat(camera): expose Hik exposure capability"
```

### Task 2: Make exposure persistence transactional and atomic

**Files:**
- Modify: `backend/src/yyt1771_g3/core/hardware_config.py`
- Modify: `backend/src/yyt1771_g3/services/hardware_setup_service.py`
- Create: `backend/src/yyt1771_g3/services/camera_control_service.py`
- Create: `backend/tests/unit/test_camera_control_service.py`
- Modify: `backend/tests/unit/test_hardware_config.py`

- [ ] **Step 1: Write failing transaction tests**

Create a fake exposure source and cover success, persistence failure with successful rollback, and persistence failure with failed rollback:

```python
class FakeExposureSource:
    def __init__(self, actual: float = 10000.0, *, rollback_fails: bool = False) -> None:
        self.actual = actual
        self.rollback_fails = rollback_fails
        self.calls: list[float] = []

    def read_exposure_capability(self) -> CameraExposureCapability:
        return CameraExposureCapability(True, 100.0, 100000.0, 1.0, self.actual, self.actual)

    def set_exposure_us(self, value: float) -> float:
        self.calls.append(value)
        if self.rollback_fails and len(self.calls) > 1:
            raise RuntimeError("rollback rejected")
        self.actual = value
        return value


def test_apply_camera_exposure_persists_actual_value() -> None:
    saved: list[float] = []
    result = apply_camera_exposure(FakeExposureSource(), 12345.0, persist=saved.append)
    assert result.actual_us == 12345.0
    assert result.saved is True
    assert saved == [12345.0]


def test_apply_camera_exposure_rolls_back_when_persistence_fails() -> None:
    source = FakeExposureSource()
    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(source, 12345.0, persist=lambda value: (_ for _ in ()).throw(OSError("disk full")))
    assert exc_info.value.stage == "persist"
    assert source.calls == [12345.0, 10000.0]
    assert exc_info.value.details["rollback_status"] == "restored"


def test_apply_camera_exposure_reports_failed_rollback() -> None:
    source = FakeExposureSource(rollback_fails=True)
    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(source, 12345.0, persist=lambda value: (_ for _ in ()).throw(OSError("read only")))
    assert exc_info.value.details["rollback_status"] == "failed"
    assert "rollback rejected" in exc_info.value.details["rollback_error"]
```

- [ ] **Step 2: Run the transaction tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_camera_control_service.py
```

Expected: collection FAIL because `yyt1771_g3.services.camera_control_service` does not exist.

- [ ] **Step 3: Preserve fractional actual exposure values**

Change `CameraConfig.exposure_us` and `_camera_config()` from `int` to `float`, and add a config test proving `12345.5` survives load and `to_profile()`:

```python
@dataclass(frozen=True)
class CameraConfig:
    exposure_us: float = 10000.0
```

```python
exposure_us=float(payload.get("exposure_us", 10000.0) or 10000.0),
```

```python
def test_hardware_config_preserves_fractional_exposure(tmp_path: Path) -> None:
    path = tmp_path / "hardware.yaml"
    path.write_text("camera:\n  exposure_us: 12345.5\n", encoding="utf-8")
    assert load_hardware_config(path).camera.to_profile()["exposure_us"] == 12345.5
```

- [ ] **Step 4: Add atomic YAML exposure persistence**

Add `save_camera_exposure()` and replace `_write_yaml_mapping()` with a same-directory temporary file, `fsync`, and `os.replace`:

```python
def save_camera_exposure(exposure_us: float, *, path: str | Path | None = None) -> dict[str, Any]:
    value = float(exposure_us)
    if not math.isfinite(value) or value <= 0:
        raise HardwareSetupError("Camera exposure must be a positive finite value.")
    config_path = local_hardware_profile_path(path)
    _assert_writable_hardware_profile_path(config_path)
    payload = _load_save_base_mapping(config_path)
    _ensure_mapping(payload, "camera")["exposure_us"] = value
    _write_yaml_mapping(config_path, payload)
    return {"saved": True, "config_path": str(config_path), "exposure_us": value}


def _write_yaml_mapping(path: Path, payload: dict[str, Any]) -> None:
    import yaml  # type: ignore

    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, allow_unicode=True, sort_keys=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise
```

Import `math` and `tempfile`. Add a test that monkeypatches `os.replace` to fail and asserts the previous YAML remains byte-for-byte unchanged and the temporary file is removed.

- [ ] **Step 5: Implement the apply/persist/rollback service**

Create the service with one public result type and one structured exception:

```python
@dataclass(frozen=True)
class CameraExposureUpdate:
    capability: CameraExposureCapability
    actual_us: float
    saved: bool


class CameraControlError(RuntimeError):
    def __init__(self, message: str, *, stage: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.details = details or {}


def apply_camera_exposure(
    source: ExposureCapableCameraSource,
    requested_us: float,
    *,
    persist: Callable[[float], object],
) -> CameraExposureUpdate:
    previous = source.read_exposure_capability()
    if not previous.supported or previous.actual_us is None:
        raise CameraControlError("Camera does not expose manual exposure control.", stage="capability")
    try:
        actual = source.set_exposure_us(requested_us)
    except Exception as exc:
        raise CameraControlError(str(exc), stage="apply", details={"requested_us": requested_us}) from exc
    try:
        persist(actual)
    except Exception as persist_error:
        details: dict[str, Any] = {"requested_us": requested_us, "actual_us": actual}
        try:
            source.set_exposure_us(previous.actual_us)
            details["rollback_status"] = "restored"
        except Exception as rollback_error:
            details["rollback_status"] = "failed"
            details["rollback_error"] = str(rollback_error)
        raise CameraControlError(str(persist_error), stage="persist", details=details) from persist_error
    capability = source.read_exposure_capability()
    return CameraExposureUpdate(capability=capability, actual_us=actual, saved=True)
```

- [ ] **Step 6: Run the persistence and service tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_camera_control_service.py \
  backend/tests/unit/test_hardware_config.py
```

Expected: all targeted tests PASS, including unchanged-file behavior after a simulated atomic-replace failure.

- [ ] **Step 7: Commit the transaction layer**

```bash
git add backend/src/yyt1771_g3/core/hardware_config.py \
  backend/src/yyt1771_g3/services/hardware_setup_service.py \
  backend/src/yyt1771_g3/services/camera_control_service.py \
  backend/tests/unit/test_camera_control_service.py \
  backend/tests/unit/test_hardware_config.py
git commit -m "feat(camera): persist applied exposure atomically"
```

### Task 3: Expose locked camera-control APIs and freeze actual run exposure

**Files:**
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Modify: `backend/tests/integration/test_camera_api.py`

- [ ] **Step 1: Extend the API fake and write failing endpoint tests**

Give `FakeApiCameraSource` deterministic exposure methods, then test saved-profile reads, selected-camera reads, updates, preview-source reuse, run-lock rejection, and persistence failure mapping:

```python
def read_exposure_capability(self) -> CameraExposureCapability:
    actual = float(self.profile.get("exposure_us", 10000.0))
    return CameraExposureCapability(True, 100.0, 100000.0, 1.0, actual, actual)

def set_exposure_us(self, value: float) -> float:
    self.profile["exposure_us"] = float(value)
    return float(value)
```

```python
def test_camera_exposure_api_reuses_preview_source_and_persists_actual(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "hardware.yaml"))
    sources: list[FakeApiCameraSource] = []

    class CountingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingSource)
    client = TestClient(api_main.app)
    assert client.get("/api/camera/preview").status_code == 200

    response = client.put("/api/camera/exposure", json={"exposure_us": 12345.0})

    assert response.status_code == 200
    assert response.json()["actual_us"] == 12345.0
    assert response.json()["saved"] is True
    assert len(sources) == 1
    assert load_hardware_config(tmp_path / "hardware.yaml").camera.exposure_us == 12345.0


def test_camera_exposure_update_is_rejected_while_real_run_owns_camera(monkeypatch) -> None:  # noqa: ANN001
    api_main._camera_operation_lock.acquire()
    api_main._camera_operation_owner = "real_camera_run"
    try:
        response = TestClient(api_main.app).put("/api/camera/exposure", json={"exposure_us": 12000.0})
    finally:
        api_main._camera_operation_owner = None
        api_main._camera_operation_lock.release()
    assert response.status_code == 409
    assert response.json()["detail"]["details"]["active_operation"] == "real_camera_run"
```

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/integration/test_camera_api.py -k exposure
```

Expected: FAIL with HTTP 404 for `/api/camera/exposure`.

- [ ] **Step 3: Add typed request and response helpers**

Add a request model after `HardwareCameraBindingRequest` and a payload helper that never claims support when the adapter does not report it:

```python
class CameraExposureRequest(BaseModel):
    camera: HardwareCameraBindingRequest | None = None
    exposure_us: float | None = None


def _camera_exposure_payload(
    capability: CameraExposureCapability,
    *,
    saved: bool,
    editable: bool = True,
    lock_reason: str = "",
) -> dict[str, Any]:
    return {
        "supported": capability.supported,
        "minimum_us": capability.minimum_us,
        "maximum_us": capability.maximum_us,
        "increment_us": capability.increment_us,
        "requested_us": capability.requested_us,
        "actual_us": capability.actual_us,
        "saved": saved,
        "editable": editable,
        "lock_reason": lock_reason,
    }
```

Build a camera profile by merging the saved profile with non-empty identity values from `request.camera`; this lets Device Setup address its selected camera while Operator omits the camera and uses the saved binding.

```python
def _camera_profile_for_exposure_request(
    camera: HardwareCameraBindingRequest | None,
) -> dict[str, Any]:
    profile = _hardware_config().camera.to_profile()
    if camera is None:
        return profile
    identity = camera.model_dump()
    return {
        **profile,
        **{key: value for key, value in identity.items() if value not in (None, "")},
        "target_frame_rate_hz": SETUP_PREVIEW_TARGET_FRAME_RATE_HZ,
    }


def _require_exposure_source(source: CameraSource) -> ExposureCapableCameraSource:
    if not callable(getattr(source, "read_exposure_capability", None)) or not callable(
        getattr(source, "set_exposure_us", None)
    ):
        raise CameraControlError(
            "Camera does not expose manual exposure control.",
            stage="capability",
        )
    return cast(ExposureCapableCameraSource, source)
```

- [ ] **Step 4: Add lock-aware read and update endpoints**

Add `POST /api/camera/exposure/read` and `PUT /api/camera/exposure`. Both must use `_camera_operation(..., blocking=False)` and `_camera_preview_lock`; the update endpoint calls the transaction service and maps `CameraControlError.stage` into a structured HTTP 422/500 response:

```python
@app.post("/api/camera/exposure/read")
def read_camera_exposure(request: CameraExposureRequest) -> dict[str, Any]:
    profile = _camera_profile_for_exposure_request(request.camera)
    with _camera_operation("exposure_read", blocking=False):
        with _camera_preview_lock:
            source = _get_preview_camera_source(profile)
            reader = getattr(source, "read_exposure_capability", None)
            capability = reader() if callable(reader) else CameraExposureCapability(supported=False)
    return _camera_exposure_payload(capability, saved=True)


@app.put("/api/camera/exposure")
def update_camera_exposure(request: CameraExposureRequest) -> dict[str, Any]:
    if request.exposure_us is None:
        raise HTTPException(status_code=422, detail={"message": "exposure_us is required", "stage": "validate"})
    profile = _camera_profile_for_exposure_request(request.camera)
    try:
        with _camera_operation("exposure_update", blocking=False):
            with _camera_preview_lock:
                source = _require_exposure_source(_get_preview_camera_source(profile))
                result = apply_camera_exposure(
                    source,
                    request.exposure_us,
                    persist=lambda actual: save_camera_exposure(actual),
                )
    except CameraControlError as exc:
        if exc.details.get("rollback_status") == "failed":
            logger.critical("Exposure persistence and rollback both failed: %s", exc.details)
        status = 422 if exc.stage in {"capability", "apply"} else 500
        raise HTTPException(
            status_code=status,
            detail={"message": str(exc), "stage": exc.stage, "details": exc.details},
        ) from exc
    return _camera_exposure_payload(result.capability, saved=result.saved)
```

- [ ] **Step 5: Make real runs snapshot the actual device value**

Add one helper used by both `/api/real-camera-runs` and `/api/real-camera-runs/stream`; it opens the source under the existing run lock, reads the actual exposure, and returns an updated copy of the profile passed to `run_real_camera`/`iter_real_camera_run_events`:

```python
def _build_real_camera_source_with_actual_profile(
    camera_profile: dict[str, Any],
) -> tuple[CameraSource, dict[str, Any]]:
    source = _build_camera_source(camera_profile)
    capability_reader = getattr(source, "read_exposure_capability", None)
    if not callable(capability_reader):
        return source, camera_profile
    capability = capability_reader()
    if not capability.supported or capability.actual_us is None:
        source.close()
        raise CameraUnavailableError("Real camera did not report its actual exposure.")
    actual_profile = {**camera_profile, "exposure_us": capability.actual_us}
    return source, actual_profile
```

Update the existing integration assertion so `run_manifest.config_snapshot.camera_profile.exposure_us` equals the fake source's re-read actual value, not merely the request value.

- [ ] **Step 6: Run API and run-snapshot tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/integration/test_camera_api.py \
  backend/tests/integration/test_real_camera_run_service.py
```

Expected: all targeted camera API, concurrency, preview reuse, and run snapshot tests PASS.

- [ ] **Step 7: Commit the backend API**

```bash
git add backend/src/yyt1771_g3/api/main.py \
  backend/tests/integration/test_camera_api.py
git commit -m "feat(api): control and lock camera exposure"
```

### Task 4: Add a tested last-write-wins frontend exposure coordinator

**Files:**
- Create: `frontend/src/exposureControl.ts`
- Create: `frontend/tests/exposureControl.test.mjs`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/tests/apiClientUrls.test.mjs`

- [ ] **Step 1: Write failing coordinator tests**

Use an injected scheduler to prove 200 ms debounce, immediate numeric commit, abort of an older request, actual-value callback, and failure callback:

```javascript
test("exposure coordinator debounces sliders and ignores stale responses", async () => {
  const pending = [];
  const successes = [];
  const timers = new Map();
  let timerId = 0;
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: (value, signal) => new Promise((resolve, reject) => pending.push({ value, signal, resolve, reject })),
    onSuccess: (value) => successes.push(value),
    onError: (error) => assert.fail(error),
    setTimer: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimer: (id) => timers.delete(id)
  });

  coordinator.schedule(11000);
  coordinator.schedule(12000);
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(pending[0].value, 12000);
  coordinator.commit(13000);
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ actual_us: 12999.5 });
  await Promise.resolve();
  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
  assert.deepEqual(successes, [12999.5]);
});
```

- [ ] **Step 2: Run coordinator and client tests and verify RED**

Run:

```bash
cd frontend && node --test tests/exposureControl.test.mjs tests/apiClientUrls.test.mjs
```

Expected: FAIL because `src/exposureControl.ts` and exposure client functions do not exist.

- [ ] **Step 3: Implement the coordinator**

Export `createExposureCommitCoordinator()` with `schedule`, `commit`, and `dispose`. Use one timer, one `AbortController`, and a monotonically increasing request ID:

```typescript
export type ExposureApplyResponse = { actual_us: number };

export type ExposureCoordinatorOptions<T extends ExposureApplyResponse = ExposureApplyResponse> = {
  delayMs: number;
  apply: (value: number, signal: AbortSignal) => Promise<T>;
  onPending?: (value: number) => void;
  onSuccess: (actualUs: number, response: T) => void;
  onError: (error: unknown) => void;
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

export type ExposureCommitCoordinator = {
  schedule: (value: number) => void;
  commit: (value: number) => void;
  dispose: () => void;
};

export function createExposureCommitCoordinator<T extends ExposureApplyResponse>(
  options: ExposureCoordinatorOptions<T>
): ExposureCommitCoordinator {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;
  let requestId = 0;

  async function apply(value: number) {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const currentId = ++requestId;
    options.onPending?.(value);
    try {
      const response = await options.apply(value, controller.signal);
      if (controller.signal.aborted || currentId !== requestId) return;
      options.onSuccess(response.actual_us, response);
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId) return;
      options.onError(error);
    }
  }

  function clearPendingTimer() {
    if (timer !== null) options.clearTimer(timer);
    timer = null;
  }

  return {
    schedule(value) {
      clearPendingTimer();
      timer = options.setTimer(() => { timer = null; void apply(value); }, options.delayMs);
    },
    commit(value) {
      clearPendingTimer();
      void apply(value);
    },
    dispose() {
      clearPendingTimer();
      requestId += 1;
      activeController?.abort();
    }
  };
}
```

- [ ] **Step 4: Add typed API methods**

Define `CameraExposureState`, `CameraExposureIdentity`, and these methods in `api/client.ts`:

```typescript
export type CameraExposureIdentity = Pick<
  HardwareCameraDevice,
  "backend" | "transport" | "model" | "serial_number" | "ip" | "user_defined_name"
>;

export type CameraExposureState = {
  supported: boolean;
  minimum_us: number | null;
  maximum_us: number | null;
  increment_us: number | null;
  requested_us: number | null;
  actual_us: number | null;
  saved: boolean;
  editable: boolean;
  lock_reason: string;
};

export async function readCameraExposure(
  camera: CameraExposureIdentity | null,
  signal?: AbortSignal
): Promise<CameraExposureState> {
  return requestJson<CameraExposureState>("/api/camera/exposure/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera }),
    signal
  });
}

export async function updateCameraExposure(
  exposureUs: number,
  camera: CameraExposureIdentity | null,
  signal?: AbortSignal
): Promise<CameraExposureState> {
  return requestJson<CameraExposureState>("/api/camera/exposure", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera, exposure_us: exposureUs }),
    signal
  });
}
```

Add URL tests that assert method, JSON body, signal forwarding, and structured 409 errors.

- [ ] **Step 5: Run frontend helper/client tests and verify GREEN**

Run:

```bash
cd frontend && node --test tests/exposureControl.test.mjs tests/apiClientUrls.test.mjs
```

Expected: all exposure coordinator and client contract tests PASS.

- [ ] **Step 6: Commit the frontend control state**

```bash
git add frontend/src/exposureControl.ts \
  frontend/src/api/client.ts \
  frontend/tests/exposureControl.test.mjs \
  frontend/tests/apiClientUrls.test.mjs
git commit -m "feat(frontend): coordinate exposure updates"
```

### Task 5: Mount one shared exposure control in both camera workflows

**Files:**
- Create: `frontend/src/components/camera/ExposureControl.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/tests/hardwareSetupWizard.test.mjs`
- Modify: `frontend/tests/operatorActualUseUi.test.mjs`

- [ ] **Step 1: Write failing shared-component placement tests**

Assert the component has one definition, Device Setup passes `selectedCamera`, Operator passes `camera={null}`, run state disables editing, and status copy is present:

```javascript
test("device setup and operator preview share ExposureControl", () => {
  const app = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const component = readFileSync(resolve(rootDir, "src/components/camera/ExposureControl.tsx"), "utf8");
  assert.match(app, /<ExposureControl[\s\S]*camera=\{selectedCamera\}/);
  assert.match(app, /<ExposureControl[\s\S]*camera=\{null\}[\s\S]*runActive=\{operatorRunActive\}/);
  assert.match(component, /createExposureCommitCoordinator/);
  assert.match(component, /step=\{capability\.increment_us \?\? "any"\}/);
  assert.match(component, /disabled=\{disabled \|\| runActive/);
});
```

- [ ] **Step 2: Run placement tests and verify RED**

Run:

```bash
cd frontend && node --test tests/hardwareSetupWizard.test.mjs tests/operatorActualUseUi.test.mjs
```

Expected: FAIL because `ExposureControl` is absent.

- [ ] **Step 3: Implement the shared component**

The component owns capability loading, the editable number draft, and one coordinator. Slider `onChange` calls `schedule`; number `Enter`/`blur` calls `commit`; success replaces the draft with backend `actual_us`; failure restores the last confirmed value:

```tsx
export type ExposureControlProps = {
  camera: CameraExposureIdentity | null;
  disabled: boolean;
  runActive: boolean;
};

function cameraIdentityKey(camera: CameraExposureIdentity | null): string {
  return camera
    ? [camera.backend, camera.transport, camera.model, camera.serial_number, camera.ip].join("|")
    : "saved-camera";
}

export function ExposureControl({ camera, disabled, runActive }: ExposureControlProps) {
  const t = useUiText();
  const [capability, setCapability] = useState<CameraExposureState | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "applying" | "saved" | "error">("loading");
  const [error, setError] = useState("");
  const coordinatorRef = useRef<ExposureCommitCoordinator | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    readCameraExposure(camera, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setCapability(next);
      setConfirmed(next.actual_us);
      setDraft(next.actual_us === null ? "" : String(next.actual_us));
      setStatus("idle");
    }).catch((reason) => {
      if (!controller.signal.aborted) { setStatus("error"); setError(String(reason)); }
    });
    return () => controller.abort();
  }, [cameraIdentityKey(camera), runActive]);

  useEffect(() => {
    coordinatorRef.current?.dispose();
    coordinatorRef.current = createExposureCommitCoordinator({
      delayMs: 200,
      apply: (value, signal) => updateCameraExposure(value, camera, signal),
      onPending: () => { setStatus("applying"); setError(""); },
      onSuccess: (actual, response) => {
        setCapability(response); setConfirmed(actual); setDraft(String(actual)); setStatus("saved");
      },
      onError: (reason) => {
        setDraft(confirmed === null ? "" : String(confirmed)); setStatus("error"); setError(String(reason));
      },
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer)
    });
    return () => coordinatorRef.current?.dispose();
  }, [cameraIdentityKey(camera), confirmed]);

  const locked = disabled || runActive || !capability?.supported || capability.editable === false;
  return capability ? (
    <section className="cameraExposureControl" aria-label={t("Camera exposure")}>
      <input
        aria-label={t("Camera exposure slider")}
        disabled={locked}
        min={capability.minimum_us ?? undefined}
        max={capability.maximum_us ?? undefined}
        step={capability.increment_us ?? "any"}
        type="range"
        value={draft}
        onChange={(event) => { setDraft(event.target.value); coordinatorRef.current?.schedule(Number(event.target.value)); }}
      />
      <label><span>{t("Exposure (μs)")}</span><input disabled={locked} type="number" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => coordinatorRef.current?.commit(Number(draft))} onKeyDown={(event) => { if (event.key === "Enter") coordinatorRef.current?.commit(Number(draft)); }} /></label>
      <small>{status === "saved" ? t("Applied and saved") : status === "applying" ? t("Applying exposure") : error}</small>
    </section>
  ) : null;
}
```

Keep the component's real implementation formatted with existing JSX conventions; guard `Number(draft)` with finite/min/max checks before calling the coordinator.

- [ ] **Step 4: Mount and style both instances**

In Device Setup step 1, render the control after a supported camera is selected and camera test succeeds, with `disabled={testingCamera || testingBinding || savingBinding}`. In Operator real-camera preview, render it beside the existing camera controls with `runActive={operatorRunActive}` and `disabled={cameraPreviewRefreshStatus !== "ok"}`. Add compact two-column slider/number styles that collapse to one column at the existing mobile breakpoint:

```css
.cameraExposureControl {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(132px, 0.35fr);
  gap: 12px;
  align-items: end;
}

@media (max-width: 760px) {
  .cameraExposureControl { grid-template-columns: 1fr; }
}
```

Add translations for these exact keys in both language maps:

```typescript
"Camera exposure": "相机曝光",
"Camera exposure slider": "相机曝光滑杆",
"Exposure (μs)": "曝光（μs）",
"Applying exposure": "正在应用曝光",
"Applied and saved": "已应用并保存",
"Exposure locked during a formal run": "正式测量期间曝光已锁定",
"Camera does not expose manual exposure control": "相机未提供手动曝光能力"
```

- [ ] **Step 5: Run UI tests and production build and verify GREEN**

Run:

```bash
cd frontend && node --test \
  tests/exposureControl.test.mjs \
  tests/hardwareSetupWizard.test.mjs \
  tests/operatorActualUseUi.test.mjs \
  tests/apiClientUrls.test.mjs
npm run build
```

Expected: targeted tests and TypeScript/Vite production build PASS.

- [ ] **Step 6: Commit the shared UI**

```bash
git add frontend/src/components/camera/ExposureControl.tsx \
  frontend/src/main.tsx frontend/src/styles.css frontend/src/i18n.ts \
  frontend/tests/hardwareSetupWizard.test.mjs \
  frontend/tests/operatorActualUseUi.test.mjs
git commit -m "feat(ui): add shared camera exposure control"
```

### Task 6: Regression, browser verification, issue update, and Windows handoff

**Files:**
- Modify: `problem.md`
- Modify: `backend/tests/unit/test_windows_packaging.py`
- Modify: `packaging/windows/build_release.ps1`
- Create evidence under: `output/playwright/p0115-exposure-control-20260721/`

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests
cd frontend && npm test && npm run build
git diff --check
```

Expected: all backend tests, frontend tests, production build, and whitespace check PASS; no gain/FPS/auto-exposure UI is introduced.

- [ ] **Step 2: Add a packaged profile smoke assertion**

Do not access Hik hardware on GitHub Actions. In `build_release.ps1`, extend the existing `/api/hardware/profile` smoke to require a finite positive serialized `camera.exposure_us`, then add matching source assertions to `test_windows_packaging.py`:

```powershell
$HardwareProfile = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/api/hardware/profile" -TimeoutSec 2
$SmokeExposureSerialized = $null -ne $HardwareProfile.camera.exposure_us `
    -and [double]$HardwareProfile.camera.exposure_us -gt 0
if (-not $SmokeExposureSerialized) {
    throw "Packaged G3Workstation.exe did not serialize camera exposure"
}
```

- [ ] **Step 3: Perform the required Mac real-browser flow with a fake camera adapter**

Start the approved development profile, use a deterministic fake camera capability `[100, 100000]` with actual-value rounding, and drive Chrome/Playwright through Device Setup and Operator:

```bash
scripts/g3_fast_start.sh sim-sim
```

Verify slider debounce, Enter/blur exact commit, actual-value re-display, persistence across reload, failure rollback, run-time disabled state, and re-read after stop. Save screenshots and browser console/network logs under `output/playwright/p0115-exposure-control-20260721/`.

- [ ] **Step 4: Update P-0115 truthfully**

Record date, browser, OS, URLs, fake adapter parameters, steps, expected/actual result, and evidence paths in `problem.md`. Use:

```text
Status: FIXED_PENDING_BROWSER_RETEST
```

Keep that status even after Mac browser PASS because Hik MVS range/current/brightness behavior and run locking still require the target Windows camera.

- [ ] **Step 5: Commit verification records**

```bash
git add problem.md backend/tests/unit/test_windows_packaging.py packaging/windows/build_release.ps1
git add -f output/playwright/p0115-exposure-control-20260721
git commit -m "test(camera): verify exposure control workflow"
```

If evidence policy excludes binary screenshots, commit only the textual log path and keep the local evidence path recorded in `problem.md`.

- [ ] **Step 6: Run the Windows release workflow and target-machine checklist**

Trigger `.github/workflows/windows-release.yml`, install the resulting Setup on Windows 11 x64 with Hik MVS, and verify:

```text
Device Setup and Operator report identical camera min/max/current values.
Changing exposure visibly changes the live image and returns the device actual value.
Restart preserves the last successfully applied exposure.
A real run disables both controls and stores the actual exposure in its config snapshot.
Stopping the run re-reads the device and enables the controls.
```

Only after this Windows evidence is recorded may P-0115 become `RESOLVED_BROWSER_VERIFIED`.
