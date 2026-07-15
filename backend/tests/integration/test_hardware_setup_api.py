from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient


def _write_test_pe(path: Path, *, machine: int = 0x8664) -> None:
    pe_bytes = bytearray(0x86)
    pe_bytes[0:2] = b"MZ"
    pe_bytes[0x3C:0x40] = (0x80).to_bytes(4, "little")
    pe_bytes[0x80:0x84] = b"PE\x00\x00"
    pe_bytes[0x84:0x86] = machine.to_bytes(2, "little")
    path.write_bytes(pe_bytes)


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
    assert checks["hik_mvs_sdk_import"]["details"]["current_sdk_python_paths"] == [str(tmp_path / "mvs_python")]
    assert checks["hik_mvs_sdk_import"]["details"]["current_mvs_dynamic_library_path"] == str(missing_library)
    assert checks["hik_mvs_sdk_import"]["details"]["suggested_sdk_python_paths"]
    assert checks["hik_mvs_sdk_import"]["details"]["suggested_mvs_dynamic_library_paths"]
    assert "Device setup > Environment check" in checks["hik_mvs_sdk_import"]["details"]["fix_instructions"]
    assert checks["mvs_dynamic_library_path"]["status"] == "failed"
    assert str(missing_library) in checks["mvs_dynamic_library_path"]["details"]["configured_path"]
    assert checks["mvs_dynamic_library_path"]["details"]["suggested_mvs_dynamic_library_paths"]
    assert "camera.sdk_library_path" in checks["mvs_dynamic_library_path"]["details"]["fix_instructions"]
    assert checks["temperature_serial_ports"]["status"] == "passed"
    assert checks["temperature_serial_ports"]["details"]["ports"][0]["device"] == "/dev/tty.usbserial-setup"


def test_hardware_sdk_paths_endpoint_validates_normalizes_and_saves(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    config_path = tmp_path / "ProgramData" / "YYT1771-G3" / "config" / "hardware.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        """
camera:
  backend: hik_gige_mvs
  serial_number: 00J67378626
temp:
  backend: lu92xx_modbus_rtu
  serial:
    port: COM3
        """,
        encoding="utf-8",
    )
    binding_dir = tmp_path / "MVS" / "Development" / "Samples" / "Python" / "MvImport"
    binding_dir.mkdir(parents=True)
    binding_file = binding_dir / "MvCameraControl_class.py"
    binding_file.write_text("# test binding\n", encoding="utf-8")
    runtime_dll = tmp_path / "Common Files" / "MVS" / "Runtime" / "Win64_x64" / "MvCameraControl.dll"
    runtime_dll.parent.mkdir(parents=True)
    _write_test_pe(runtime_dll)

    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.local_hardware_profile_path",
        lambda path=None: config_path,
        raising=False,
    )
    monkeypatch.setattr(
        api_main,
        "build_hardware_environment_report",
        lambda config: {"overall_status": "passed", "checks": []},
    )

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/setup/sdk-paths",
        json={
            "sdk_python_paths": [str(binding_file)],
            "sdk_library_path": str(runtime_dll),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["saved"] is True
    assert payload["sdk_python_paths"] == [str(binding_dir)]
    assert payload["sdk_library_path"] == str(runtime_dll)
    assert payload["environment"]["overall_status"] == "passed"

    import yaml

    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert saved["camera"]["sdk_python_paths"] == [str(binding_dir)]
    assert saved["camera"]["sdk_library_path"] == str(runtime_dll)
    assert saved["camera"]["serial_number"] == "00J67378626"
    assert saved["temp"]["serial"]["port"] == "COM3"


def test_hardware_sdk_paths_endpoint_rejects_missing_files_without_overwriting(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    config_path = tmp_path / "hardware.yaml"
    original = "camera:\n  serial_number: 00J67378626\n"
    config_path.write_text(original, encoding="utf-8")
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.local_hardware_profile_path",
        lambda path=None: config_path,
        raising=False,
    )

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/setup/sdk-paths",
        json={
            "sdk_python_paths": [str(tmp_path / "missing" / "MvCameraControl_class.py")],
            "sdk_library_path": str(tmp_path / "missing" / "MvCameraControl.dll"),
        },
    )

    assert response.status_code == 400
    assert "MvCameraControl_class.py" in response.json()["detail"]["message"]
    assert config_path.read_text(encoding="utf-8") == original


def test_hardware_sdk_paths_endpoint_rejects_win32_mvs_runtime(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    config_path = tmp_path / "hardware.yaml"
    original = "camera:\n  serial_number: 00J67378626\n"
    config_path.write_text(original, encoding="utf-8")
    binding_dir = tmp_path / "MvImport"
    binding_dir.mkdir()
    (binding_dir / "MvCameraControl_class.py").write_text("# test binding\n", encoding="utf-8")
    runtime_dll = tmp_path / "Win32_i86" / "MvCameraControl.dll"
    runtime_dll.parent.mkdir()
    _write_test_pe(runtime_dll, machine=0x014C)
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service.local_hardware_profile_path",
        lambda path=None: config_path,
        raising=False,
    )
    monkeypatch.setattr("yyt1771_g3.services.hardware_setup_service.platform.system", lambda: "Windows")

    client = TestClient(api_main.app)
    response = client.post(
        "/api/hardware/setup/sdk-paths",
        json={"sdk_python_paths": [str(binding_dir)], "sdk_library_path": str(runtime_dll)},
    )

    assert response.status_code == 400
    assert "Win64_x64" in response.json()["detail"]["message"]
    assert response.json()["detail"]["details"]["pe_machine"] == "0x014c"
    assert config_path.read_text(encoding="utf-8") == original


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


def test_hardware_cameras_endpoint_does_not_select_first_discovered_camera_without_profile(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig

    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(
                backend="hik_gige_mvs",
                allowed_models=["MV-CA060-11GM", "MV-CA050-10GM"],
            )
        ),
    )
    monkeypatch.setattr(
        "yyt1771_g3.services.hardware_setup_service._enumerate_hik_mvs_device_descriptors",
        lambda profile: [
            {
                "backend": "hik_gige_mvs",
                "transport": "gige_vision",
                "model": "MV-CA060-11GM",
                "serial_number": "CAM-A",
                "ip": "192.168.3.211",
                "user_defined_name": "Line 1",
            },
            {
                "backend": "hik_gige_mvs",
                "transport": "gige_vision",
                "model": "MV-CA050-10GM",
                "serial_number": "CAM-B",
                "ip": "192.168.3.212",
                "user_defined_name": "Line 2",
            },
        ],
    )

    client = TestClient(api_main.app)
    response = client.get("/api/hardware/cameras")

    assert response.status_code == 200
    cameras = response.json()
    assert [camera["serial_number"] for camera in cameras] == ["CAM-A", "CAM-B"]
    assert [camera["is_selected"] for camera in cameras] == [False, False]


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
        "不能把设备绑定保存到 example 配置，请使用 configs/local/realcamera_temp.local.yaml。"
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


def test_hardware_temperature_test_endpoint_reports_modbus_failure(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HardwareConfig

    class FakeTemperatureController:
        def read_temperature(self):  # noqa: ANN201
            raise TimeoutError("modbus response timeout")

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
    assert payload["status"] == "failed"
    assert payload["error"] == "modbus response timeout"
    assert payload["temperature_celsius"] is None
    assert payload["serial_port"] == "/dev/cu.usbserial-11210"
