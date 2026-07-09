from __future__ import annotations

import io
import json
import threading
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from yyt1771_g3.camera.base import CameraFrame
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

    def close(self) -> None:
        self.closed = True


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
    first = client.get("/api/camera/preview")
    second = client.get("/api/camera/preview")

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(sources) == 1
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


def test_real_camera_run_endpoint_passes_temperature_controller_and_profile(monkeypatch, tmp_path) -> None:  # noqa: ANN001
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


def test_real_camera_run_stream_endpoint_emits_frames_and_saves_run(monkeypatch, tmp_path) -> None:  # noqa: ANN001
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
    assert events[-1]["run_manifest"]["config_snapshot"]["max_frames"] == 2
    assert events[-1]["run_manifest"]["config_snapshot"]["save_raw_frames"] is False
    assert events[-1]["run_manifest"]["config_snapshot"]["raw_frame_count"] == 0
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
