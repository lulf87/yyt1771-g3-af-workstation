from __future__ import annotations

import asyncio
import io
import json
import logging
import threading
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from yyt1771_g3.camera.base import CameraExposureCapability, CameraFrame, CameraUnavailableError
from yyt1771_g3.services.camera_control_service import CameraControlError
from yyt1771_g3.temperature.base import TemperatureReading


def test_camera_preview_endpoint_returns_clear_error_without_sdk(monkeypatch) -> None:  # noqa: ANN001
    import importlib

    original_import_module = importlib.import_module

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise ModuleNotFoundError(name)
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)
    monkeypatch.setattr(
        "yyt1771_g3.camera.hik_mvs_source._import_sdk_with_library_override",
        lambda profile: None,
    )

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.get("/api/camera/preview")

    assert response.status_code == 503
    assert response.json()["detail"]["camera_status"] == "unavailable"
    assert "Hik MVS SDK is not available" in response.json()["detail"]["message"]


def test_camera_preview_endpoint_uses_simulated_camera_backend(monkeypatch) -> None:  # noqa: ANN001
    import importlib

    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, DeviceRoiConfig, HardwareConfig

    api_main._reset_preview_camera_source()
    original_import_module = importlib.import_module

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise AssertionError("simulated camera backend must not import Hik MVS SDK")
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="simulated",
                pixel_format="mono8",
                device_roi=DeviceRoiConfig(width=120, height=80),
            )
        ),
    )

    client = TestClient(api_main.app)
    response = client.get("/api/camera/preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["camera_status"] == "ok"
    assert payload["shape"] == [80, 120]
    assert payload["pixel_format"] == "mono8"
    assert payload["camera_meta"]["backend"] == "simulated"
    assert payload["provenance"]["camera_is_simulated"] is True
    assert payload["provenance"]["overall_kind"] == "mixed"
    assert payload["image_data_url"].startswith("data:image/png;base64,")


def test_real_camera_run_endpoint_returns_clear_error_without_sdk(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    import importlib

    original_import_module = importlib.import_module

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise ModuleNotFoundError(name)
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)
    monkeypatch.setattr(
        "yyt1771_g3.camera.hik_mvs_source._import_sdk_with_library_override",
        lambda profile: None,
    )
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "target_fps": 8.0,
            "measurement_definition": {
                "measurement_id": "real-api",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
            },
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["camera_status"] == "unavailable"
    assert "Hik MVS SDK is not available" in response.json()["detail"]["message"]


def test_real_camera_run_endpoint_uses_simulated_camera_backend(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    import importlib

    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    original_import_module = importlib.import_module

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise AssertionError("simulated camera backend must not import Hik MVS SDK")
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)

    from yyt1771_g3.api import main as api_main

    api_main._reset_preview_camera_source()
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: None)

    client = TestClient(api_main.app)
    response = client.post(
        "/api/real-camera-runs",
        json={
            "max_frames": 2,
            "target_fps": 8.0,
            "camera_profile": {
                "backend": "simulated",
                "pixel_format": "mono8",
                "device_roi": {"width": 120, "height": 80},
            },
            "measurement_definition": {
                "measurement_id": "simulated-camera-api",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 2},
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["run_manifest"]["frame_records"]) == 2
    assert payload["run_manifest"]["frame_records"][0]["source"] == "simulated"
    assert payload["run_manifest"]["frame_records"][0]["camera_meta"]["backend"] == "simulated"
    assert payload["run_manifest"]["config_snapshot"]["camera_profile"]["backend"] == "simulated"
    assert payload["run_manifest"]["operator_data_source"] == "real_camera"
    assert payload["run_manifest"]["provenance"]["camera_is_simulated"] is True


def test_camera_preview_png_endpoint_returns_frame_from_lazy_sdk(monkeypatch) -> None:  # noqa: ANN001
    import importlib

    original_import_module = importlib.import_module
    fake_frame = np.full((8, 10), 120, dtype=np.uint8)
    fake_sdk = SimpleNamespace(
        create_camera=lambda profile=None: SimpleNamespace(
            preview_frame=lambda: CameraFrame(
                array=fake_frame,
                timestamp_ms=1234,
                camera_meta={"frame_id": 1},
            ),
            close=lambda: None,
        )
    )

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            return fake_sdk
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.get("/api/camera/preview.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


class FakeApiCameraSource:
    def __init__(self, profile=None) -> None:  # noqa: ANN001
        self.profile = profile or {}
        self.closed = False

    def preview_frame(self) -> CameraFrame:
        frame = np.full((80, 120), 245, dtype=np.uint8)
        frame[25:46, 35:86] = 30
        return CameraFrame(
            array=frame,
            timestamp_ms=1100,
            camera_meta={
                "backend": "hik_gige_mvs",
                "pixel_format": self.profile.get("pixel_format", "mono8"),
                "exposure_us": self.profile.get("exposure_us"),
            },
        )

    def read_exposure_capability(self) -> CameraExposureCapability:
        actual = float(self.profile.get("exposure_us", 10000.0))
        return CameraExposureCapability(True, 100.0, 100000.0, 1.0, actual, actual)

    def set_exposure_us(self, value: float) -> float:
        self.profile["exposure_us"] = float(value)
        return float(value)

    def close(self) -> None:
        self.closed = True


class _TrackedCameraOperation:
    def __init__(self, operation) -> None:  # noqa: ANN001
        self.operation = operation
        self.exit_count = 0
        self._exit_lock = threading.Lock()

    def __enter__(self):  # noqa: ANN204
        return self.operation.__enter__()

    def __exit__(self, exc_type, exc, traceback):  # noqa: ANN001, ANN204
        with self._exit_lock:
            self.exit_count += 1
        return self.operation.__exit__(exc_type, exc, traceback)


def _track_camera_operations(monkeypatch, api_main):  # noqa: ANN001, ANN202
    original_camera_operation = api_main._camera_operation
    operations: list[_TrackedCameraOperation] = []

    def track_camera_operation(*args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        operation = _TrackedCameraOperation(original_camera_operation(*args, **kwargs))
        operations.append(operation)
        return operation

    monkeypatch.setattr(api_main, "_camera_operation", track_camera_operation)
    return operations


def test_camera_operation_lease_close_waits_for_in_flight_exit() -> None:
    from yyt1771_g3.api import main as api_main

    exit_started = threading.Event()
    allow_exit = threading.Event()
    exit_finished = threading.Event()
    first_close_returned = threading.Event()
    second_close_started = threading.Event()
    second_close_returned = threading.Event()
    close_errors: list[BaseException] = []

    class BlockingExitOperation:
        def __init__(self) -> None:
            self.exit_count = 0

        def __exit__(self, exc_type, exc, traceback):  # noqa: ANN001, ANN204
            self.exit_count += 1
            exit_started.set()
            try:
                if not allow_exit.wait(timeout=2.0):
                    raise AssertionError("blocking operation exit was not released")
            finally:
                exit_finished.set()

    operation = BlockingExitOperation()
    lease = api_main._CameraOperationLease(operation)

    def close_lease(started: threading.Event | None, returned: threading.Event) -> None:
        if started is not None:
            started.set()
        try:
            lease.close()
        except BaseException as exc:  # pragma: no cover - asserted in the parent thread
            close_errors.append(exc)
        finally:
            returned.set()

    first_thread = threading.Thread(target=close_lease, args=(None, first_close_returned))
    second_thread = threading.Thread(target=close_lease, args=(second_close_started, second_close_returned))
    first_thread.start()
    second_thread_started = False
    try:
        assert exit_started.wait(timeout=1.0) is True
        second_thread.start()
        second_thread_started = True
        assert second_close_started.wait(timeout=1.0) is True
        second_returned_while_exit_blocked = second_close_returned.wait(timeout=0.1)
        assert exit_finished.is_set() is False
    finally:
        allow_exit.set()
        first_thread.join(timeout=2.0)
        if second_thread_started:
            second_thread.join(timeout=2.0)

    assert second_returned_while_exit_blocked is False
    assert first_thread.is_alive() is False
    assert second_thread.is_alive() is False
    assert first_close_returned.is_set() is True
    assert second_close_returned.is_set() is True
    assert exit_finished.is_set() is True
    assert close_errors == []
    assert operation.exit_count == 1

    lease.close()

    assert operation.exit_count == 1


def test_camera_operation_lease_failed_exit_can_be_retried() -> None:
    from yyt1771_g3.api import main as api_main

    exit_failure = RuntimeError("camera operation exit failed once")

    class FailOnceExitOperation:
        def __init__(self) -> None:
            self.exit_count = 0

        def __exit__(self, exc_type, exc, traceback):  # noqa: ANN001, ANN204
            self.exit_count += 1
            if self.exit_count == 1:
                raise exit_failure

    operation = FailOnceExitOperation()
    lease = api_main._CameraOperationLease(operation)

    with pytest.raises(RuntimeError) as exc_info:
        lease.close()

    assert exc_info.value is exit_failure
    assert operation.exit_count == 1

    lease.close()
    lease.close()

    assert operation.exit_count == 2


def test_camera_exposure_read_selected_camera_uses_authoritative_partial_identity(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                model="saved-model",
                serial_number="saved-serial",
                ip="192.168.1.20",
                allowed_models=["saved-model"],
                pixel_format="mono8",
                exposure_us=23456.0,
                target_frame_rate_hz=7.0,
            )
        ),
    )

    try:
        response = TestClient(api_main.app).post(
            "/api/camera/exposure/read",
            json={
                "camera": {
                    "backend": "hik_gige_mvs",
                    "transport": "",
                    "model": "",
                    "serial_number": "selected-serial",
                    "ip": "",
                    "user_defined_name": "",
                }
            },
        )
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 200
    assert response.json() == {
        "supported": True,
        "minimum_us": 100.0,
        "maximum_us": 100000.0,
        "increment_us": 1.0,
        "requested_us": 23456.0,
        "actual_us": 23456.0,
        "saved": True,
        "editable": True,
        "lock_reason": "",
    }
    assert len(sources) == 1
    assert sources[0].profile["model"] == ""
    assert sources[0].profile["serial_number"] == "selected-serial"
    assert sources[0].profile["ip"] == ""
    assert sources[0].profile["user_defined_name"] == ""
    assert sources[0].profile["allowed_models"] == []
    assert sources[0].profile["transport"] == ""
    assert sources[0].profile["pixel_format"] == "mono8"
    assert sources[0].profile["target_frame_rate_hz"] == 20.0


def test_camera_exposure_read_without_camera_uses_saved_binding(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    saved_camera = CameraConfig(
        model="saved-model",
        serial_number="saved-serial",
        ip="192.168.1.30",
        exposure_us=34567.0,
        target_frame_rate_hz=8.0,
    )
    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(camera=saved_camera))

    try:
        response = TestClient(api_main.app).post("/api/camera/exposure/read", json={})
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 200
    assert response.json()["actual_us"] == 34567.0
    assert len(sources) == 1
    assert sources[0].profile == {
        **saved_camera.to_profile(),
        "target_frame_rate_hz": 20.0,
    }


def test_camera_exposure_selected_camera_requires_serial_or_ip_without_opening_source(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CountingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingSource)
    response = TestClient(api_main.app).post(
        "/api/camera/exposure/read",
        json={
            "camera": {
                "model": "MV-CU060-10GM",
                "serial_number": "",
                "ip": "",
            }
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["stage"] == "validate"
    assert sources == []


def test_camera_exposure_saved_low_fps_profile_reuses_preview_source_across_read_update_preview(
    monkeypatch,
    tmp_path,
) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    hardware_path = tmp_path / "hardware.yaml"
    hardware_path.write_text(
        "camera:\n  target_frame_rate_hz: 8.0\n  exposure_us: 10000.0\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware_path))
    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CountingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingSource)
    client = TestClient(api_main.app)

    try:
        responses = [
            client.get("/api/camera/preview"),
            client.post("/api/camera/exposure/read", json={}),
            client.put("/api/camera/exposure", json={"exposure_us": 12345.0}),
            client.get("/api/camera/preview"),
        ]
    finally:
        api_main._reset_preview_camera_source()

    assert [response.status_code for response in responses] == [200, 200, 200, 200]
    assert len(sources) == 1
    assert sources[0].profile["target_frame_rate_hz"] == 20.0
    assert sources[0].profile["exposure_us"] == 12345.0


def test_camera_exposure_api_reuses_preview_source_and_persists_actual(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import load_hardware_config

    hardware_path = tmp_path / "hardware.yaml"
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware_path))
    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CountingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingSource)
    client = TestClient(api_main.app)

    try:
        preview = client.get("/api/camera/preview")
        read = client.post("/api/camera/exposure/read", json={})
        response = client.put("/api/camera/exposure", json={"exposure_us": 12345.0})
    finally:
        api_main._reset_preview_camera_source()

    assert preview.status_code == 200
    assert read.status_code == 200
    assert response.status_code == 200
    assert response.json()["actual_us"] == 12345.0
    assert response.json()["saved"] is True
    assert len(sources) == 1
    assert load_hardware_config(hardware_path).camera.exposure_us == 12345.0


def test_camera_exposure_operations_are_rejected_while_real_run_owns_camera() -> None:
    from yyt1771_g3.api import main as api_main

    client = TestClient(api_main.app)
    api_main._camera_operation_lock.acquire()
    api_main._camera_operation_owner = "real_camera_run"
    try:
        responses = [
            client.post("/api/camera/exposure/read", json={}),
            client.put("/api/camera/exposure", json={"exposure_us": 12000.0}),
        ]
    finally:
        api_main._camera_operation_owner = None
        api_main._camera_operation_lock.release()

    assert [response.status_code for response in responses] == [409, 409]
    for response in responses:
        detail = response.json()["detail"]
        assert detail["camera_status"] == "busy"
        assert detail["details"]["active_operation"] == "real_camera_run"


def test_camera_exposure_read_reports_unsupported_source_and_update_rejects_it(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    api_main._reset_preview_camera_source()

    class PreviewOnlyCameraSource:
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            self.profile = profile or {}

        def preview_frame(self) -> CameraFrame:
            return CameraFrame(np.zeros((2, 2), dtype=np.uint8), 1, {})

        def close(self) -> None:
            return None

    monkeypatch.setattr(api_main, "HikMvsCameraSource", PreviewOnlyCameraSource)
    client = TestClient(api_main.app)
    try:
        read = client.post("/api/camera/exposure/read", json={})
        update = client.put("/api/camera/exposure", json={"exposure_us": 12000.0})
    finally:
        api_main._reset_preview_camera_source()

    assert read.status_code == 200
    assert read.json()["supported"] is False
    assert update.status_code == 422
    assert update.json()["detail"] == {
        "message": "Camera does not expose manual exposure control.",
        "stage": "capability",
        "details": {},
    }


def test_camera_exposure_update_requires_exposure_us_without_opening_camera(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CountingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingSource)
    response = TestClient(api_main.app).put("/api/camera/exposure", json={})

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "message": "exposure_us is required.",
        "stage": "validate",
        "details": {},
    }
    assert sources == []


def test_camera_exposure_read_failure_maps_to_structured_capability_error(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    api_main._reset_preview_camera_source()

    class FailingReadSource(FakeApiCameraSource):
        def read_exposure_capability(self) -> CameraExposureCapability:
            raise RuntimeError("exposure capability read failed")

    monkeypatch.setattr(api_main, "HikMvsCameraSource", FailingReadSource)
    try:
        response = TestClient(api_main.app).post("/api/camera/exposure/read", json={})
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "message": "exposure capability read failed",
        "stage": "capability",
        "details": {"error": "exposure capability read failed"},
    }


def test_camera_exposure_update_maps_capability_and_apply_errors_to_422(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "hardware.yaml"))
    api_main._reset_preview_camera_source()
    monkeypatch.setattr(api_main, "HikMvsCameraSource", FakeApiCameraSource)
    client = TestClient(api_main.app)

    try:
        for stage in ("capability", "apply"):
            def fail_apply(source, requested_us, *, persist, _stage=stage):  # noqa: ANN001, ANN202, ARG001
                raise CameraControlError(
                    f"{_stage} failed",
                    stage=_stage,
                    details={"requested_us": requested_us},
                )

            monkeypatch.setattr(api_main, "apply_camera_exposure", fail_apply)
            response = client.put("/api/camera/exposure", json={"exposure_us": 12000.0})
            assert response.status_code == 422
            assert response.json()["detail"] == {
                "message": f"{stage} failed",
                "stage": stage,
                "details": {"requested_us": 12000.0},
            }
    finally:
        api_main._reset_preview_camera_source()


def test_camera_exposure_update_maps_post_commit_failure_to_500(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "hardware.yaml"))
    api_main._reset_preview_camera_source()
    monkeypatch.setattr(api_main, "HikMvsCameraSource", FakeApiCameraSource)

    def fail_verify(source, requested_us, *, persist):  # noqa: ANN001, ANN202, ARG001
        raise CameraControlError(
            "post-commit verification failed",
            stage="verify",
            details={"actual_us": requested_us},
        )

    monkeypatch.setattr(api_main, "apply_camera_exposure", fail_verify)
    try:
        response = TestClient(api_main.app).put("/api/camera/exposure", json={"exposure_us": 12000.0})
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 500
    assert response.json()["detail"] == {
        "message": "post-commit verification failed",
        "stage": "verify",
        "details": {"actual_us": 12000.0},
    }


def test_camera_exposure_update_preserves_rollback_failure_details_and_logs_critical(
    monkeypatch,
    tmp_path,
    caplog,
) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "hardware.yaml"))
    api_main._reset_preview_camera_source()

    class RollbackFailingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.set_calls = 0

        def set_exposure_us(self, value: float) -> float:
            self.set_calls += 1
            if self.set_calls > 1:
                raise RuntimeError("rollback hardware offline")
            return super().set_exposure_us(value)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", RollbackFailingSource)
    monkeypatch.setattr(
        api_main,
        "save_camera_exposure",
        lambda actual: (_ for _ in ()).throw(OSError("hardware config disk full")),
    )
    caplog.set_level(logging.CRITICAL, logger=api_main.logger.name)

    try:
        response = TestClient(api_main.app).put("/api/camera/exposure", json={"exposure_us": 12000.0})
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 500
    assert response.json()["detail"] == {
        "message": "hardware config disk full",
        "stage": "persist",
        "details": {
            "requested_us": 12000.0,
            "actual_us": 12000.0,
            "rollback_expected_us": 10000.0,
            "rollback_status": "failed",
            "rollback_error": "rollback hardware offline",
        },
    }
    assert any(
        record.levelno == logging.CRITICAL and "rollback" in record.getMessage().lower()
        for record in caplog.records
    )


def test_camera_exposure_update_logs_critical_when_apply_error_rollback_fails(
    monkeypatch,
    tmp_path,
    caplog,
) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "hardware.yaml"))
    api_main._reset_preview_camera_source()
    persisted: list[float] = []

    class MutatingApplyFailingSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.set_calls = 0

        def set_exposure_us(self, value: float) -> float:
            self.set_calls += 1
            if self.set_calls == 1:
                self.profile["exposure_us"] = float(value)
                raise RuntimeError("apply readback failed")
            raise RuntimeError("rollback hardware offline")

    monkeypatch.setattr(api_main, "HikMvsCameraSource", MutatingApplyFailingSource)
    monkeypatch.setattr(api_main, "save_camera_exposure", persisted.append)
    caplog.set_level(logging.CRITICAL, logger=api_main.logger.name)

    try:
        response = TestClient(api_main.app).put("/api/camera/exposure", json={"exposure_us": 12000.0})
    finally:
        api_main._reset_preview_camera_source()

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "message": "apply readback failed",
        "stage": "apply",
        "details": {
            "requested_us": 12000.0,
            "rollback_expected_us": 10000.0,
            "rollback_status": "failed",
            "rollback_error": "rollback hardware offline",
        },
    }
    assert persisted == []
    assert any(
        record.levelno == logging.CRITICAL and "after apply error" in record.getMessage().lower()
        for record in caplog.records
    )


def test_real_camera_actual_exposure_snapshot_closes_source_when_readback_is_unsupported(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    sources: list[FakeApiCameraSource] = []

    class UnsupportedExposureSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

        def read_exposure_capability(self) -> CameraExposureCapability:
            return CameraExposureCapability(False, requested_us=12000.0)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", UnsupportedExposureSource)

    try:
        api_main._build_real_camera_source_with_actual_profile({"exposure_us": 12000.0})
    except CameraUnavailableError as exc:
        assert str(exc) == "Real camera did not report its actual exposure."
    else:
        raise AssertionError("unsupported exposure readback must reject a formal real-camera run")

    assert len(sources) == 1
    assert sources[0].closed is True


def test_real_camera_actual_exposure_snapshot_closes_source_without_masking_read_error(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    sources: list[FakeApiCameraSource] = []

    class FailingExposureSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

        def read_exposure_capability(self) -> CameraExposureCapability:
            raise RuntimeError("device exposure readback failed")

        def close(self) -> None:
            self.closed = True
            raise RuntimeError("secondary close failure")

    monkeypatch.setattr(api_main, "HikMvsCameraSource", FailingExposureSource)

    try:
        api_main._build_real_camera_source_with_actual_profile({"exposure_us": 12000.0})
    except RuntimeError as exc:
        assert str(exc) == "device exposure readback failed"
    else:
        raise AssertionError("exposure readback error must propagate")

    assert len(sources) == 1
    assert sources[0].closed is True


def test_camera_preview_endpoint_returns_setup_metadata(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    api_main._reset_preview_camera_source()

    class MetadataCameraSource(FakeApiCameraSource):
        def preview_frame(self) -> CameraFrame:
            return CameraFrame(
                array=np.full((32, 48), 80, dtype=np.uint8),
                timestamp_ms=1779445920110,
                camera_meta={
                    "model": "MV-CU060-10GM",
                    "serial_number": "DEV-001",
                    "ip": "192.168.1.10",
                    "pixel_format": "mono8",
                },
            )

    monkeypatch.setattr(api_main, "HikMvsCameraSource", MetadataCameraSource)

    client = TestClient(api_main.app)
    response = client.get("/api/camera/preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["camera_status"] == "ok"
    assert payload["model"] == "MV-CU060-10GM"
    assert payload["serial_number"] == "DEV-001"
    assert payload["ip"] == "192.168.1.10"
    assert payload["pixel_format"] == "mono8"
    assert payload["shape"] == [32, 48]
    assert payload["timestamp_ms"] == 1779445920110


def test_camera_preview_reuses_source_for_same_profile(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig
    api_main._reset_preview_camera_source()

    sources: list[FakeApiCameraSource] = []

    class CountingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.preview_count = 0
            sources.append(self)

        def preview_frame(self) -> CameraFrame:
            self.preview_count += 1
            return super().preview_frame()

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingCameraSource)
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(camera=CameraConfig(target_frame_rate_hz=10.0)),
    )

    client = TestClient(api_main.app)
    first = client.get("/api/camera/preview")
    second = client.get("/api/camera/preview")

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(sources) == 1
    assert sources[0].profile["target_frame_rate_hz"] == 20.0
    assert sources[0].preview_count == 2
    assert sources[0].closed is False

    api_main._reset_preview_camera_source()
    assert sources[0].closed is True


def test_setup_probe_reuses_preview_source_when_capturing_live_frame(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    api_main._reset_preview_camera_source()

    sources: list[FakeApiCameraSource] = []

    class CountingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.preview_count = 0
            sources.append(self)

        def preview_frame(self) -> CameraFrame:
            self.preview_count += 1
            return super().preview_frame()

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingCameraSource)

    client = TestClient(api_main.app)
    preview = client.get("/api/camera/preview")
    probe = client.post(
        "/api/camera/setup-probe",
        json={
            "measurement_definition": {
                "measurement_id": "real-probe-live",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20},
            },
        },
    )

    assert preview.status_code == 200
    assert probe.status_code == 200
    assert len(sources) == 1
    assert sources[0].preview_count == 2
    assert sources[0].closed is False

    api_main._reset_preview_camera_source()
    assert sources[0].closed is True


def test_real_camera_run_resets_cached_setup_preview_source(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    api_main._reset_preview_camera_source()

    sources: list[FakeApiCameraSource] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

        def preview_frame(self) -> CameraFrame:
            if len(sources) > 1:
                assert sources[0].closed is True
            return super().preview_frame()

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())

    client = TestClient(api_main.app)
    preview = client.get("/api/camera/preview")
    response = client.post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "target_fps": 10.0,
            "camera_profile": {"pixel_format": "mono8", "target_frame_rate_hz": 10.0},
            "measurement_definition": {
                "measurement_id": "real-api-reset-preview",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
            },
        },
    )

    assert preview.status_code == 200
    assert response.status_code == 200
    assert len(sources) == 2
    assert sources[0].closed is True


def test_camera_preview_returns_busy_while_real_camera_run_owns_camera(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    api_main._reset_preview_camera_source()

    run_started = threading.Event()
    allow_run_finish = threading.Event()
    run_response: dict[str, object] = {}
    sources: list[FakeApiCameraSource] = []

    class BlockingRunCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.source_index = len(sources)
            sources.append(self)

        def preview_frame(self) -> CameraFrame:
            if self.source_index == 0:
                run_started.set()
                assert allow_run_finish.wait(timeout=5), "test timed out waiting to release real camera run"
            return super().preview_frame()

    monkeypatch.setattr(api_main, "HikMvsCameraSource", BlockingRunCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: None)

    client = TestClient(api_main.app)

    def post_run() -> None:
        run_response["response"] = client.post(
            "/api/real-camera-runs",
            json={
                "max_frames": 1,
                "target_fps": 10.0,
                "camera_profile": {"pixel_format": "mono8", "target_frame_rate_hz": 10.0},
                "measurement_definition": {
                    "measurement_id": "real-api-camera-owned",
                    "source": "real_camera",
                    "object_class": "A_BALLOON_ENVELOPE",
                    "detector": "BalloonEnvelopeDetector",
                    "width_mode": "max_width",
                    "measurement_coordinates": "source_pixel",
                    "roi": {
                        "type": "rotated_rect",
                        "center_x": 60.0,
                        "center_y": 35.0,
                        "width": 70.0,
                        "height": 40.0,
                        "angle_deg": 0.0,
                    },
                    "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
                },
            },
        )

    thread = threading.Thread(target=post_run)
    thread.start()
    try:
        assert run_started.wait(timeout=5), "real camera run did not start"
        preview = client.get("/api/camera/preview")
        assert preview.status_code == 409
        assert preview.json()["detail"]["camera_status"] == "busy"
        assert len(sources) == 1
    finally:
        allow_run_finish.set()
        thread.join(timeout=5)

    assert not thread.is_alive()
    assert run_response["response"].status_code == 200


def test_camera_preview_release_endpoint_closes_cached_source(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    api_main._reset_preview_camera_source()

    sources: list[FakeApiCameraSource] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)

    client = TestClient(api_main.app)
    preview = client.get("/api/camera/preview")
    release = client.post("/api/camera/preview/release")

    assert preview.status_code == 200
    assert release.status_code == 200
    assert release.json()["camera_status"] == "released"
    assert sources[0].closed is True


class FakeApiTemperatureController:
    def __init__(self) -> None:
        self.target_values: list[float] = []
        self.power_values: list[float] = []
        self.started = False
        self.stopped = False
        self.closed = False

    def read_temperature(self) -> TemperatureReading:
        return TemperatureReading(timestamp_ms=1103, celsius=25.3, source="lu92xx_modbus_rtu")

    def set_target_temperature(self, celsius: float) -> None:
        self.target_values.append(celsius)

    def set_output_power_percent(self, percent: float) -> None:
        self.power_values.append(percent)

    def start_output(self) -> None:
        self.started = True

    def stop_output(self) -> None:
        self.stopped = True

    def close(self) -> None:
        self.closed = True


def _operator_measurement_payload(measurement_id: str = "operator-real-camera") -> dict[str, object]:
    return {
        "measurement_id": measurement_id,
        "source": "real_camera",
        "object_class": "A_BALLOON_ENVELOPE",
        "detector": "BalloonEnvelopeDetector",
        "width_mode": "max_width",
        "measurement_coordinates": "source_pixel",
        "roi": {
            "type": "rotated_rect",
            "center_x": 60.0,
            "center_y": 35.0,
            "width": 70.0,
            "height": 40.0,
            "angle_deg": 0.0,
        },
        "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
    }


class _FakeOfflineRegistry:
    def list_offline_datasets(self) -> list[dict[str, object]]:
        return [{"id": "golden_a_20260522_dev_lab"}]


def test_operator_source_status_reports_real_hardware_config(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, SerialPortConfig, TempConfig

    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="hik_gige_mvs",
                model="MV-CA060-11GM",
                serial_number="DEV-001",
            ),
            temp=TempConfig(
                backend="lu92xx_modbus_rtu",
                serial=SerialPortConfig(port="/dev/tty.usbserial"),
            ),
        ),
    )
    monkeypatch.setattr(api_main, "_registry", lambda: _FakeOfflineRegistry())

    client = TestClient(api_main.app)
    response = client.get("/api/operator/source-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["real_hardware_available"] is True
    assert payload["real_camera_available"] is True
    assert payload["real_temperature_available"] is True
    assert payload["camera_is_simulated"] is False
    assert payload["temperature_is_simulated"] is False


def test_operator_source_status_reports_simulated_camera_and_temperature(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, TempConfig

    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="simulated",
                model="G3 simulated dataset camera",
                serial_number="SIM-DATASET-golden_a_20260522_dev_lab",
                simulated_dataset_id="golden_a_20260522_dev_lab",
            ),
            temp=TempConfig(backend="simulated_temperature"),
        ),
    )
    monkeypatch.setattr(api_main, "_registry", lambda: _FakeOfflineRegistry())

    client = TestClient(api_main.app)
    response = client.get("/api/operator/source-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["real_hardware_available"] is False
    assert payload["real_camera_available"] is False
    assert payload["real_temperature_available"] is False
    assert payload["camera_is_simulated"] is True
    assert payload["temperature_is_simulated"] is True
    assert payload["camera_serial"] == "SIM-DATASET-golden_a_20260522_dev_lab"


def test_operator_real_camera_setup_probe_rejects_simulated_backend(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, TempConfig

    api_main._reset_preview_camera_source()
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="simulated",
                model="G3 simulated dataset camera",
                serial_number="SIM-DATASET-golden_a_20260522_dev_lab",
                simulated_dataset_id="golden_a_20260522_dev_lab",
            ),
            temp=TempConfig(backend="simulated_temperature"),
        ),
    )
    monkeypatch.setattr(api_main, "_registry", lambda: _FakeOfflineRegistry())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/camera/setup-probe",
        json={
            "operator_mode": True,
            "operator_data_source": "real_camera",
            "measurement_definition": _operator_measurement_payload("operator-real-probe-guard"),
        },
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "requires real camera and real temperature controller" in detail["message"]
    assert detail["source_status"]["real_hardware_available"] is False
    assert detail["source_status"]["camera_is_simulated"] is True
    assert detail["source_status"]["temperature_is_simulated"] is True


def test_operator_real_camera_run_rejects_simulated_backend(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, TempConfig

    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="simulated",
                model="G3 simulated dataset camera",
                serial_number="SIM-DATASET-golden_a_20260522_dev_lab",
                simulated_dataset_id="golden_a_20260522_dev_lab",
            ),
            temp=TempConfig(backend="simulated_temperature"),
        ),
    )
    monkeypatch.setattr(api_main, "_registry", lambda: _FakeOfflineRegistry())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/real-camera-runs",
        json={
            "operator_mode": True,
            "operator_data_source": "real_camera",
            "max_frames": 1,
            "target_fps": 8.0,
            "camera_profile": {"backend": "simulated", "pixel_format": "mono8"},
            "measurement_definition": _operator_measurement_payload("operator-real-run-guard"),
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["source_status"]["real_hardware_available"] is False


def test_temperature_status_endpoint_reads_configured_controller(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main

    controller = FakeApiTemperatureController()
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: controller)

    client = TestClient(api_main.app)
    response = client.get("/api/temperature/status")

    assert response.status_code == 200
    assert response.json()["temperature_status"] == "ok"
    assert response.json()["reading"]["celsius"] == 25.3
    assert controller.closed is True


def test_temperature_status_endpoint_uses_selected_serial_port(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, SerialPortConfig, TempConfig

    controller = FakeApiTemperatureController()
    captured_configs = []
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(temp=TempConfig(serial=SerialPortConfig(port="/dev/default-temp"))),
    )

    def fake_build_temperature_controller(config):  # noqa: ANN001, ANN202
        captured_configs.append(config)
        return controller

    monkeypatch.setattr(api_main, "build_temperature_controller", fake_build_temperature_controller)

    client = TestClient(api_main.app)
    response = client.get("/api/temperature/status", params={"port": "/dev/ttys000"})

    assert response.status_code == 200
    assert captured_configs[0].temp.serial.port == "/dev/ttys000"
    assert controller.closed is True


def test_temperature_status_endpoint_returns_structured_serial_error(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main

    class FailingTemperatureController(FakeApiTemperatureController):
        def read_temperature(self) -> TemperatureReading:
            raise RuntimeError("serial port not found")

    controller = FailingTemperatureController()
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: controller)

    client = TestClient(api_main.app)
    response = client.get("/api/temperature/status", params={"port": "/dev/missing-temp"})

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "temperature_status": "unavailable",
        "message": "serial port not found",
    }
    assert controller.closed is True


def test_temperature_serial_ports_endpoint_returns_discovered_ports(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.temperature.serial_ports import SerialPortInfo

    monkeypatch.setattr(
        api_main,
        "list_serial_ports",
        lambda: [SerialPortInfo(device="COM5", name="COM5", description="USB Serial", hwid="VID:PID")],
    )

    client = TestClient(api_main.app)
    response = client.get("/api/temperature/serial-ports")

    assert response.status_code == 200
    assert response.json()["ports"][0]["device"] == "COM5"


def test_temperature_serial_ports_endpoint_includes_configured_port(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, SerialPortConfig, TempConfig
    from yyt1771_g3.temperature.serial_ports import SerialPortInfo

    monkeypatch.setattr(
        api_main,
        "list_serial_ports",
        lambda: [SerialPortInfo(device="COM5", name="COM5", description="USB Serial", hwid="VID:PID")],
    )
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(temp=TempConfig(serial=SerialPortConfig(port="/dev/ttys000"))),
    )

    client = TestClient(api_main.app)
    response = client.get("/api/temperature/serial-ports")

    assert response.status_code == 200
    assert [port["device"] for port in response.json()["ports"]] == ["COM5", "/dev/ttys000"]


def test_real_camera_run_resolves_run_store_before_opening_hardware(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []
    controllers: list[FakeApiTemperatureController] = []

    class CountingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    def build_controller(config):  # noqa: ANN001, ANN202, ARG001
        controller = FakeApiTemperatureController()
        controllers.append(controller)
        return controller

    def fail_run_store():  # noqa: ANN202
        raise RuntimeError("run store initialization failed")

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", build_controller)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))
    monkeypatch.setattr(api_main, "_run_store", fail_run_store)

    response = TestClient(api_main.app, raise_server_exceptions=False).post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "measurement_definition": _operator_measurement_payload("run-store-before-hardware"),
        },
    )

    assert response.status_code == 500
    assert sources == []
    assert controllers == []


def test_real_camera_run_closes_unhanded_controller_when_camera_open_fails(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    sources = []
    controllers = []

    class UnavailableCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            self.close_count = 0
            sources.append(self)

        def read_exposure_capability(self) -> CameraExposureCapability:
            raise CameraUnavailableError("camera exposure read failed")

        def close(self) -> None:
            self.close_count += 1
            super().close()

    class CountingController(FakeApiTemperatureController):
        def __init__(self) -> None:
            super().__init__()
            self.close_count = 0

        def close(self) -> None:
            self.close_count += 1
            super().close()

    def build_controller(config):  # noqa: ANN001, ANN202, ARG001
        controller = CountingController()
        controllers.append(controller)
        return controller

    monkeypatch.setattr(api_main, "HikMvsCameraSource", UnavailableCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", build_controller)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))

    response = TestClient(api_main.app).post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "measurement_definition": _operator_measurement_payload("camera-open-cleanup"),
        },
    )

    assert response.status_code == 503
    assert len(sources) == 1
    assert sources[0].close_count == 1
    assert len(controllers) == 1
    assert controllers[0].close_count == 1


def test_real_camera_stream_asgi_immediate_disconnect_releases_preentered_operation(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    sources: list[FakeApiCameraSource] = []

    class CountingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            sources.append(self)

    operations = _track_camera_operations(monkeypatch, api_main)
    monkeypatch.setattr(api_main, "HikMvsCameraSource", CountingCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))
    request = api_main.RealCameraRunRequest.model_validate(
        {
            "max_frames": 1,
            "measurement_definition": _operator_measurement_payload("asgi-immediate-disconnect"),
        }
    )
    response = api_main.stream_real_camera_run(request)
    retained_body_iterator = response.body_iterator
    retained_operation = operations[0]

    assert api_main._camera_operation_lock.locked() is True
    assert api_main._camera_operation_owner == "real_camera_run_stream"

    sent_messages = []

    async def invoke_with_immediate_disconnect() -> None:
        disconnect_delivered = asyncio.Event()

        async def receive():  # noqa: ANN202
            disconnect_delivered.set()
            return {"type": "http.disconnect"}

        async def send(message) -> None:  # noqa: ANN001
            if message["type"] == "http.response.start":
                await disconnect_delivered.wait()
            sent_messages.append(message)

        await response(
            {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.3"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/api/real-camera-runs/stream",
                "raw_path": b"/api/real-camera-runs/stream",
                "query_string": b"",
                "headers": [],
                "client": ("test-client", 1234),
                "server": ("test-server", 80),
                "root_path": "",
            },
            receive,
            send,
        )

    try:
        asyncio.run(invoke_with_immediate_disconnect())
        locked_after_response = api_main._camera_operation_lock.locked()
        owner_after_response = api_main._camera_operation_owner
        try:
            with api_main._camera_operation("post_disconnect_probe", blocking=False):
                recovered = True
        except api_main.HTTPException:
            recovered = False
    finally:
        if api_main._camera_operation_lock.locked():
            retained_operation.__exit__(None, None, None)
        api_main._reset_preview_camera_source()

    assert response.body_iterator is retained_body_iterator
    assert operations[0] is retained_operation
    assert sources == []
    assert locked_after_response is False
    assert owner_after_response is None
    assert recovered is True


def test_real_camera_stream_normal_asgi_completion_releases_operation_once(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    operations = _track_camera_operations(monkeypatch, api_main)
    monkeypatch.setattr(api_main, "HikMvsCameraSource", FakeApiCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))
    request = api_main.RealCameraRunRequest.model_validate(
        {
            "max_frames": 1,
            "measurement_definition": _operator_measurement_payload("asgi-normal-completion"),
        }
    )
    response = api_main.stream_real_camera_run(request)
    retained_response = response
    sent_messages = []

    async def invoke_to_completion() -> None:
        async def receive():  # noqa: ANN202
            raise AssertionError("ASGI spec 2.4 streaming must not poll receive")

        async def send(message) -> None:  # noqa: ANN001
            sent_messages.append(message)

        await response(
            {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"}},
            receive,
            send,
        )

    try:
        asyncio.run(invoke_to_completion())
        locked_after_response = api_main._camera_operation_lock.locked()
        owner_after_response = api_main._camera_operation_owner
    finally:
        if api_main._camera_operation_lock.locked():
            operations[0].__exit__(None, None, None)
        api_main._reset_preview_camera_source()

    assert response is retained_response
    assert sent_messages[0]["type"] == "http.response.start"
    assert sent_messages[-1] == {"type": "http.response.body", "body": b"", "more_body": False}
    assert locked_after_response is False
    assert owner_after_response is None
    assert operations[0].exit_count == 1


def test_real_camera_stream_response_construction_failure_releases_operation(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    operations = _track_camera_operations(monkeypatch, api_main)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))

    def fail_response_init(self, *args, **kwargs) -> None:  # noqa: ANN001, ANN002, ANN003, ARG001
        raise RuntimeError("streaming response construction failed")

    monkeypatch.setattr(api_main.StreamingResponse, "__init__", fail_response_init)
    request = api_main.RealCameraRunRequest.model_validate(
        {
            "max_frames": 1,
            "measurement_definition": _operator_measurement_payload("response-construction-failure"),
        }
    )

    try:
        with pytest.raises(RuntimeError, match="streaming response construction failed"):
            api_main.stream_real_camera_run(request)
        locked_after_failure = api_main._camera_operation_lock.locked()
        owner_after_failure = api_main._camera_operation_owner
    finally:
        if api_main._camera_operation_lock.locked():
            operations[0].__exit__(None, None, None)

    assert locked_after_failure is False
    assert owner_after_failure is None
    assert operations[0].exit_count == 1


def test_real_camera_stream_releases_camera_lock_when_event_close_raises(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    run_id = "run-close-error-lock-regression"
    iterators = []
    operations = _track_camera_operations(monkeypatch, api_main)

    class CloseRaisingEvents:
        def __init__(self, camera_source, temperature_controller) -> None:  # noqa: ANN001
            self.camera_source = camera_source
            self.temperature_controller = temperature_controller
            self.emitted = False
            self.close_count = 0

        def __iter__(self):  # noqa: ANN204
            return self

        def __next__(self):  # noqa: ANN204
            if self.emitted:
                raise StopIteration
            self.emitted = True
            return {"event": "complete", "run_id": run_id, "state": "READY"}

        def close(self) -> None:
            self.close_count += 1
            self.temperature_controller.close()
            self.camera_source.close()
            raise RuntimeError("event iterator close failed")

    def build_events(run_store, *, camera_source, temperature_controller, **kwargs):  # noqa: ANN001, ANN202, ARG001
        events = CloseRaisingEvents(camera_source, temperature_controller)
        iterators.append(events)
        return events

    monkeypatch.setattr(api_main, "HikMvsCameraSource", FakeApiCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())
    monkeypatch.setattr(api_main, "iter_real_camera_run_events", build_events)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))
    client = TestClient(api_main.app, raise_server_exceptions=False)

    try:
        stream_response = client.post(
            "/api/real-camera-runs/stream",
            json={
                "max_frames": 1,
                "measurement_definition": _operator_measurement_payload("close-error-lock"),
            },
        )
        exposure_response = client.post("/api/camera/exposure/read", json={})
    finally:
        api_main._clear_real_camera_stream_stop(run_id)
        if api_main._camera_operation_lock.locked():
            operations[0].__exit__(None, None, None)
        api_main._reset_preview_camera_source()

    assert stream_response.status_code == 200
    assert len(iterators) == 1
    assert iterators[0].close_count == 1
    assert exposure_response.status_code == 200
    assert operations[0].exit_count == 1


def test_real_camera_run_endpoint_freezes_actual_exposure_and_passes_temperature_controller(
    monkeypatch,
    tmp_path,
) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()

    controllers: list[FakeApiTemperatureController] = []
    temperature_configs = []
    camera_profiles: list[dict] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            camera_profiles.append(self.profile)

        def read_exposure_capability(self) -> CameraExposureCapability:
            return CameraExposureCapability(True, 100.0, 100000.0, 1.0, 50000.0, 43210.0)

    def fake_build_temperature_controller(config):  # noqa: ANN001, ANN202
        temperature_configs.append(config)
        controller = FakeApiTemperatureController()
        controllers.append(controller)
        return controller

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", fake_build_temperature_controller)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))

    client = TestClient(api_main.app)
    response = client.post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "target_fps": 10.0,
            "camera_profile": {"pixel_format": "mono8", "exposure_us": 50000},
            "measurement_definition": {
                "measurement_id": "real-api-temp",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {
                    "min_component_area_px": 20,
                    "max_frames_per_run": 1,
                    "target_temperature_celsius": 55.0,
                    "temperature_power_percent": 68.0,
                    "temperature_serial_port": "/dev/ttys000",
                },
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_manifest"]["measurement_definition"]["source"] == "real_camera"
    assert payload["run_manifest"]["temperature_records"][0]["celsius"] == 25.3
    assert payload["run_manifest"]["detection_results"][0]["temperature_sync_status"] == "TEMP_SYNC_OK"
    assert camera_profiles[0]["exposure_us"] == 50000
    assert payload["run_manifest"]["config_snapshot"]["camera_profile"]["exposure_us"] == 43210.0
    assert temperature_configs[0].temp.serial.port == "/dev/ttys000"
    assert controllers[0].target_values == [55.0]
    assert controllers[0].power_values == [68.0]
    assert controllers[0].stopped is True

    assert payload["run_manifest"]["frame_records"][0]["raw_frame_saved"] is False
    assert payload["run_manifest"]["frame_records"][0]["frame_path"] == ""
    assert payload["run_manifest"]["frame_records"][0]["preview_path"] == "preview_frames/latest.png"
    assert payload["run_manifest"]["config_snapshot"]["save_raw_frames"] is False
    assert payload["run_manifest"]["config_snapshot"]["raw_frame_count"] == 0

    frame_png = client.get(f"/api/runs/{payload['run_manifest']['run_id']}/preview/latest.png")
    assert frame_png.status_code == 200
    assert frame_png.headers["content-type"] == "image/png"
    image = Image.open(io.BytesIO(frame_png.content))
    assert image.size == (120, 80)

    raw_frame_png = client.get(f"/api/runs/{payload['run_manifest']['run_id']}/raw-frames/1.png")
    assert raw_frame_png.status_code == 404


def test_real_camera_run_stream_endpoint_freezes_actual_exposure_and_saves_run(
    monkeypatch,
    tmp_path,
) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()

    controllers: list[FakeApiTemperatureController] = []
    camera_profiles: list[dict] = []

    class CapturingCameraSource(FakeApiCameraSource):
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            super().__init__(profile)
            camera_profiles.append(self.profile)

        def read_exposure_capability(self) -> CameraExposureCapability:
            return CameraExposureCapability(True, 100.0, 100000.0, 1.0, 50000.0, 43211.0)

    def fake_build_temperature_controller(config):  # noqa: ANN001, ANN202
        controller = FakeApiTemperatureController()
        controllers.append(controller)
        return controller

    monkeypatch.setattr(api_main, "HikMvsCameraSource", CapturingCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", fake_build_temperature_controller)
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))

    client = TestClient(api_main.app)
    response = client.post(
        "/api/real-camera-runs/stream",
        json={
            "max_frames": 2,
            "target_fps": 10.0,
            "camera_profile": {"pixel_format": "mono8", "exposure_us": 50000},
            "measurement_definition": {
                "measurement_id": "real-api-stream",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {
                    "min_component_area_px": 20,
                    "max_frames_per_run": 160,
                    "target_temperature_celsius": 55.0,
                    "temperature_power_percent": 68.0,
                    "temperature_serial_port": "/dev/ttys000",
                },
            },
        },
    )

    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
    assert [event["event"] for event in events] == [
        "frame",
        "frame",
        "stopping",
        "saving_manifest",
        "building_analysis",
        "analyzing_region",
        "analysis_region_complete",
        "complete",
    ]
    assert events[0]["dataset_id"] == "real_camera"
    assert events[0]["frame_count"] == 2
    assert "/preview/latest.png" in events[0]["frame_url"]
    assert events[0]["frame_url"].endswith("frame_index=1")
    assert events[0]["storage"]["save_raw_frames"] is False
    assert events[0]["storage"]["raw_frame_saved"] is False
    assert events[0]["storage"]["preview_path"] == "preview_frames/latest.png"
    assert events[1]["processed_frames"] == 2
    assert events[2]["processed_frames"] == 2
    assert events[3]["processed_frames"] == 2
    assert events[4]["processed_frames"] == 2
    assert events[5]["region_id"] == "region_1"
    assert events[5]["current"] == 1
    assert events[5]["total"] == 1
    assert events[6]["region_id"] == "region_1"
    assert events[-1]["run_manifest"]["config_snapshot"]["max_frames"] == 2
    assert events[-1]["run_manifest"]["config_snapshot"]["save_raw_frames"] is False
    assert events[-1]["run_manifest"]["config_snapshot"]["raw_frame_count"] == 0
    assert events[-1]["run_manifest"]["config_snapshot"]["camera_profile"]["exposure_us"] == 43211.0
    assert len(events[-1]["run_manifest"]["frame_records"]) == 2
    assert camera_profiles[0]["exposure_us"] == 50000
    assert controllers[0].target_values == [55.0]
    assert controllers[0].power_values == [68.0]
    assert controllers[0].stopped is True
    assert controllers[0].closed is True

    preview_png = client.get(f"/api/runs/{events[-1]['run_manifest']['run_id']}/preview/latest.png")
    assert preview_png.status_code == 200
    assert preview_png.headers["content-type"] == "image/png"
    raw_frame_png = client.get(f"/api/runs/{events[-1]['run_manifest']['run_id']}/raw-frames/1.png")
    assert raw_frame_png.status_code == 404


def test_operator_real_camera_stream_snapshots_actual_exposure_in_v2_run_meta(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig
    from yyt1771_g3.storage.run_store import RunStore

    api_main._reset_preview_camera_source()

    class ActualExposureCameraSource(FakeApiCameraSource):
        def read_exposure_capability(self) -> CameraExposureCapability:
            return CameraExposureCapability(True, 100.0, 100000.0, 1.0, 50000.0, 43212.0)

    monkeypatch.setattr(api_main, "HikMvsCameraSource", ActualExposureCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())
    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig(run=RunHardwareConfig()))

    response = TestClient(api_main.app).post(
        "/api/real-camera-runs/stream",
        json={
            "operator_mode": True,
            "max_frames": 1,
            "target_fps": 10.0,
            "camera_profile": {"pixel_format": "mono8", "exposure_us": 50000.0},
            "measurement_definition": _operator_measurement_payload("operator-v2-actual-exposure"),
        },
    )

    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
    assert events[-1]["event"] == "complete"
    meta = RunStore(tmp_path / "runs").read_run_meta(events[-1]["run_id"])
    assert meta.config_snapshot["camera_profile"]["exposure_us"] == 43212.0


def test_real_camera_run_endpoint_preserves_raw_frame_endpoint_when_enabled(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig, RunHardwareConfig

    api_main._reset_preview_camera_source()
    monkeypatch.setattr(api_main, "HikMvsCameraSource", FakeApiCameraSource)
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeApiTemperatureController())
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(run=RunHardwareConfig(save_raw_frames=True)),
    )

    client = TestClient(api_main.app)
    response = client.post(
        "/api/real-camera-runs",
        json={
            "max_frames": 1,
            "target_fps": 10.0,
            "camera_profile": {"pixel_format": "mono8"},
            "measurement_definition": {
                "measurement_id": "real-api-raw-enabled",
                "source": "real_camera",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_manifest"]["frame_records"][0]["raw_frame_saved"] is True
    assert payload["run_manifest"]["frame_records"][0]["frame_path"] == "raw_frames/frame_000001.npy"
    assert payload["run_manifest"]["config_snapshot"]["save_raw_frames"] is True
    assert payload["run_manifest"]["config_snapshot"]["raw_frame_count"] == 1
    raw_frame_png = client.get(f"/api/runs/{payload['run_manifest']['run_id']}/raw-frames/1.png")
    assert raw_frame_png.status_code == 200
    assert raw_frame_png.headers["content-type"] == "image/png"


def test_real_camera_run_stop_endpoint_marks_active_stream() -> None:
    from yyt1771_g3.api import main as api_main

    run_id = "run-real_camera-stop-api-fixture"
    api_main._register_real_camera_stream_stop(run_id)
    client = TestClient(api_main.app)
    try:
        response = client.post(f"/api/real-camera-runs/{run_id}/stop")

        assert response.status_code == 200
        assert response.json() == {
            "run_id": run_id,
            "stop_requested": True,
            "already_complete": False,
        }
        assert api_main._real_camera_stream_stop_requested(run_id) is True
    finally:
        api_main._clear_real_camera_stream_stop(run_id)
