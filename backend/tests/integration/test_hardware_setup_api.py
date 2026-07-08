from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient


def test_hardware_setup_environment_reports_sdk_and_serial_checks(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.camera.base import CameraUnavailableError
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig
    from yyt1771_g3.temperature.serial_ports import SerialPortInfo

    missing_library = tmp_path / "libMvCameraControl.dylib"
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="hik_gige_mvs",
                sdk_python_paths=[str(tmp_path / "mvs_python")],
                sdk_library_path=str(missing_library),
            )
        ),
    )
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.HikMvsCameraSource._load_sdk",
        lambda profile: (_ for _ in ()).throw(
            CameraUnavailableError("Hik MVS SDK was not found", details={"missing_module": "MvCameraControl_class"})
        ),
    )
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.list_serial_ports",
        lambda: [SerialPortInfo(device="/dev/tty.usbserial-setup", description="USB Serial")],
    )

    client = TestClient(api_main.app)
    response = client.get("/api/hardware/setup/environment")

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_status"] == "failed"
    checks = {item["id"]: item for item in payload["checks"]}
    assert checks["backend_running"]["status"] == "passed"
    assert checks["hik_mvs_sdk_import"]["status"] == "failed"
    assert "Hik MVS SDK" in checks["hik_mvs_sdk_import"]["message"]
    assert checks["mvs_dynamic_library_path"]["status"] == "failed"
    assert str(missing_library) in checks["mvs_dynamic_library_path"]["details"]["configured_path"]
    assert checks["temperature_serial_ports"]["status"] == "passed"
    assert checks["temperature_serial_ports"]["details"]["ports"][0]["device"] == "/dev/tty.usbserial-setup"


def test_hardware_cameras_endpoint_returns_discovered_hik_devices(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig

    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="hik_gige_mvs",
                allowed_models=["MV-CA060-11GM"],
                serial_number="00J67378626",
                ip="192.168.3.211",
            )
        ),
    )
    monkeypatch.setattr(
        api_main,
        "discover_hardware_cameras",
        lambda config: [
            {
                "backend": "hik_gige_mvs",
                "transport": "gige_vision",
                "model": "MV-CA060-11GM",
                "serial_number": "00J67378626",
                "ip": "192.168.3.211",
                "user_defined_name": "Line 1",
                "is_supported_model": True,
                "is_selected": True,
            }
        ],
    )

    client = TestClient(api_main.app)
    response = client.get("/api/hardware/cameras")

    assert response.status_code == 200
    assert response.json() == [
        {
            "backend": "hik_gige_mvs",
            "transport": "gige_vision",
            "model": "MV-CA060-11GM",
            "serial_number": "00J67378626",
            "ip": "192.168.3.211",
            "user_defined_name": "Line 1",
            "is_supported_model": True,
            "is_selected": True,
        }
    ]


def test_hardware_binding_save_patches_selected_camera_and_temperature_port(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    config_path = tmp_path / "realcamera_temp.local.yaml"
    config_path.write_text(
        """
camera:
  backend: hik_gige_mvs
  allowed_models:
    - MV-CA060-11GM
  model: ""
  serial_number: ""
  ip: ""
  exposure_us: 50000
  sdk_python_paths:
    - /opt/MVS/Samples/Python/MvImport
  sdk_library_path: /opt/MVS/lib/libMvCameraControl.dylib
temp:
  backend: lu92xx_modbus_rtu
  serial:
    port: ""
    baudrate: 19200
run:
  measurement_target_hz: 10
  save_raw_frames: false
        """,
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(config_path))

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/binding",
        json={
            "camera": {
                "backend": "hik_gige_mvs",
                "transport": "gige_vision",
                "model": "MV-CA060-11GM",
                "serial_number": "00J67378626",
                "ip": "192.168.3.211",
                "user_defined_name": "Line 1",
            },
            "temperature": {
                "backend": "lu92xx_modbus_rtu",
                "serial_port": "/dev/cu.usbserial-11210",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["saved"] is True
    assert payload["config_path"] == str(config_path)

    import yaml

    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["camera"]["backend"] == "hik_gige_mvs"
    assert saved["camera"]["model"] == "MV-CA060-11GM"
    assert saved["camera"]["serial_number"] == "00J67378626"
    assert saved["camera"]["ip"] == "192.168.3.211"
    assert saved["camera"]["allowed_models"] == ["MV-CA060-11GM"]
    assert saved["camera"]["exposure_us"] == 50000
    assert saved["camera"]["sdk_library_path"] == "/opt/MVS/lib/libMvCameraControl.dylib"
    assert saved["temp"]["backend"] == "lu92xx_modbus_rtu"
    assert saved["temp"]["serial"]["port"] == "/dev/cu.usbserial-11210"
    assert saved["temp"]["serial"]["baudrate"] == 19200
    assert saved["run"]["save_raw_frames"] is False


def test_hardware_binding_test_returns_camera_and_temperature_results(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.camera.base import CameraFrame
    from yyt1771_g3.core.hardware_config import HardwareConfig
    from yyt1771_g3.temperature.base import TemperatureReading

    class FakeCameraSource:
        def preview_frame(self) -> CameraFrame:
            import numpy as np

            return CameraFrame(
                array=np.zeros((12, 16), dtype=np.uint8),
                timestamp_ms=1779448000123,
                camera_meta={"model": "MV-CA060-11GM", "serial_number": "00J67378626", "ip": "192.168.3.211"},
            )

        def close(self) -> None:
            return None

    class FakeTemperatureController:
        def read_temperature(self) -> TemperatureReading:
            return TemperatureReading(timestamp_ms=1779448000456, celsius=24.6, source="lu92xx_modbus_rtu")

        def close(self) -> None:
            return None

    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig())
    monkeypatch.setattr(api_main, "_build_camera_source", lambda profile: FakeCameraSource())
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeTemperatureController())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/binding/test",
        json={
            "camera": {
                "backend": "hik_gige_mvs",
                "transport": "gige_vision",
                "model": "MV-CA060-11GM",
                "serial_number": "00J67378626",
                "ip": "192.168.3.211",
            },
            "temperature": {
                "backend": "lu92xx_modbus_rtu",
                "serial_port": "/dev/cu.usbserial-11210",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["camera"]["status"] == "passed"
    assert payload["camera"]["details"]["shape"] == [12, 16]
    assert payload["camera"]["details"]["serial_number"] == "00J67378626"
    assert payload["temperature"]["status"] == "passed"
    assert payload["temperature"]["details"]["celsius"] == 24.6
