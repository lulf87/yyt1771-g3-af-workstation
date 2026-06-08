from __future__ import annotations

import io
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

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.get("/api/camera/preview")

    assert response.status_code == 503
    assert response.json()["detail"]["camera_status"] == "unavailable"
    assert "Hik MVS SDK is not available" in response.json()["detail"]["message"]


def test_real_camera_run_endpoint_returns_clear_error_without_sdk(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    import importlib

    original_import_module = importlib.import_module

    def fake_import(name: str, package: str | None = None):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise ModuleNotFoundError(name)
        return original_import_module(name, package)

    monkeypatch.setattr("importlib.import_module", fake_import)
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


def test_real_camera_run_endpoint_passes_temperature_controller_and_profile(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    from yyt1771_g3.api import main as api_main

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
    assert controllers[0].target_values == [55.0]
    assert controllers[0].power_values == [68.0]
    assert controllers[0].stopped is True

    frame_png = client.get(f"/api/runs/{payload['run_manifest']['run_id']}/frames/1.png")
    assert frame_png.status_code == 200
    assert frame_png.headers["content-type"] == "image/png"
    image = Image.open(io.BytesIO(frame_png.content))
    assert image.size == (120, 80)
