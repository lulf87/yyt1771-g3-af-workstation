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

    example_path = tmp_path / "configs" / "hardware" / "realcamera_temp.example.yaml"
    example_path.parent.mkdir(parents=True)
    example_path.write_text(
        """
camera:
  backend: hik_gige_mvs
  allowed_models:
    - MV-CA060-11GM
  model: ""
  serial_number: ""
  ip: ""
temp:
  backend: lu92xx_modbus_rtu
  serial:
    port: ""
        """,
        encoding="utf-8",
    )
    original_example = example_path.read_text(encoding="utf-8")
    config_path = tmp_path / "configs" / "local" / "realcamera_temp.local.yaml"
    config_path.parent.mkdir(parents=True)
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
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(example_path))
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.local_hardware_profile_path",
        lambda path=None: config_path,
        raising=False,
    )

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
    assert payload["source_status"]["real_hardware_available"] is True
    assert payload["real_hardware_available"] is True
    assert example_path.read_text(encoding="utf-8") == original_example

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


def test_hardware_binding_save_rejects_explicit_example_config_path(tmp_path: Path) -> None:
    from yyt1771_g3.api import main as api_main

    example_path = tmp_path / "configs" / "hardware" / "realcamera_temp.example.yaml"
    example_path.parent.mkdir(parents=True)
    example_path.write_text("camera: {}\ntemp: {}\n", encoding="utf-8")

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/binding",
        json={
            "config_path": str(example_path),
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

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == (
        "Cannot save hardware binding to an example config. Use configs/local/realcamera_temp.local.yaml."
    )
    assert example_path.read_text(encoding="utf-8") == "camera: {}\ntemp: {}\n"


def test_operator_source_status_reloads_saved_hardware_binding(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    example_path = tmp_path / "configs" / "hardware" / "realcamera_temp.example.yaml"
    example_path.parent.mkdir(parents=True)
    example_path.write_text(
        """
camera:
  backend: hik_gige_mvs
temp:
  backend: lu92xx_modbus_rtu
  serial:
    port: ""
        """,
        encoding="utf-8",
    )
    config_path = tmp_path / "configs" / "local" / "realcamera_temp.local.yaml"
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(example_path))
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.local_hardware_profile_path",
        lambda path=None: config_path,
        raising=False,
    )

    client = TestClient(api_main.app)
    save_response = client.post(
        "/api/hardware/binding",
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
    assert save_response.status_code == 200

    status_response = client.get("/api/operator/source-status")
    assert status_response.status_code == 200
    status = status_response.json()
    assert status["real_hardware_available"] is True
    assert status["camera_serial"] == "00J67378626"
    assert status["temperature_serial_port_configured"] is True


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


def test_hardware_camera_test_endpoint_returns_preview_data_url(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.camera.base import CameraFrame
    from yyt1771_g3.core.hardware_config import HardwareConfig

    class FakeCameraSource:
        def preview_frame(self) -> CameraFrame:
            import numpy as np

            return CameraFrame(
                array=np.zeros((6, 8), dtype=np.uint8),
                timestamp_ms=1779448000789,
                camera_meta={"model": "MV-CA060-11GM", "serial_number": "00J67378626", "ip": "192.168.3.211"},
            )

        def close(self) -> None:
            return None

    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig())
    monkeypatch.setattr(api_main, "_build_camera_source", lambda profile: FakeCameraSource())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/cameras/test",
        json={
            "backend": "hik_gige_mvs",
            "transport": "gige_vision",
            "model": "MV-CA060-11GM",
            "serial_number": "00J67378626",
            "ip": "192.168.3.211",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "passed"
    assert payload["error"] == ""
    assert payload["shape"] == [6, 8]
    assert payload["camera_meta"]["serial_number"] == "00J67378626"
    assert payload["preview_image_data_url"].startswith("data:image/png;base64,")


def test_hardware_camera_test_endpoint_reports_camera_unavailable(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.camera.base import CameraUnavailableError
    from yyt1771_g3.core.hardware_config import HardwareConfig

    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig())
    monkeypatch.setattr(
        api_main,
        "_build_camera_source",
        lambda profile: (_ for _ in ()).throw(
            CameraUnavailableError("camera busy", details={"serial_number": "00J67378626"})
        ),
    )

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/cameras/test",
        json={
            "backend": "hik_gige_mvs",
            "transport": "gige_vision",
            "model": "MV-CA060-11GM",
            "serial_number": "00J67378626",
            "ip": "192.168.3.211",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "camera busy"
    assert payload["preview_image_data_url"] == ""
    assert payload["details"]["serial_number"] == "00J67378626"


def test_hardware_temperature_test_endpoint_returns_temperature(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig
    from yyt1771_g3.temperature.base import TemperatureReading

    class FakeTemperatureController:
        def read_temperature(self) -> TemperatureReading:
            return TemperatureReading(timestamp_ms=1779448000999, celsius=31.2, source="lu92xx_modbus_rtu")

        def close(self) -> None:
            return None

    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig())
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeTemperatureController())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/temperature/test",
        json={
            "serial_port": "/dev/cu.usbserial-11210",
            "baudrate": 19200,
            "slave_address": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "passed"
    assert payload["error"] == ""
    assert payload["temperature_celsius"] == 31.2
    assert payload["serial_port"] == "/dev/cu.usbserial-11210"


def test_hardware_temperature_test_endpoint_reports_serial_unavailable(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig

    class FakeTemperatureController:
        def read_temperature(self):  # noqa: ANN201
            raise OSError("serial port unavailable")

        def close(self) -> None:
            return None

    monkeypatch.setattr(api_main, "_hardware_config", lambda: HardwareConfig())
    monkeypatch.setattr(api_main, "build_temperature_controller", lambda config: FakeTemperatureController())

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/temperature/test",
        json={
            "serial_port": "/dev/cu.usbserial-missing",
            "baudrate": 19200,
            "slave_address": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "serial port unavailable"
    assert payload["temperature_celsius"] is None
    assert payload["serial_port"] == "/dev/cu.usbserial-missing"
