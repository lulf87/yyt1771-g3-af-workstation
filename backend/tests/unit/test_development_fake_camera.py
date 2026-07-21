from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yyt1771_g3.camera import simulated_source
from yyt1771_g3.camera.base import CameraUnavailableError
from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, SerialPortConfig, TempConfig


FAKE_ENV = "YYT1771_G3_DEVELOPMENT_FAKE_HARDWARE"
FAIL_ONCE_ENV = "YYT1771_G3_DEVELOPMENT_FAKE_EXPOSURE_FAIL_ONCE_US"
PRODUCT_MODE_ENV = "YYT1771_G3_PRODUCT_MODE"


@pytest.fixture(autouse=True)
def reset_development_fake_exposure_failures():
    simulated_source._reset_development_fake_exposure_failures()
    yield
    simulated_source._reset_development_fake_exposure_failures()


def _explicit_profile(*, exposure_us: float = 12345.0) -> dict[str, object]:
    return {
        "backend": "hik_gige_mvs",
        "model": "MV-DEV-EXPOSURE",
        "serial_number": "DEV-EXPOSURE-001",
        "exposure_us": exposure_us,
    }


def test_development_fake_hardware_requires_environment_profile_and_development_mode() -> None:
    gate = getattr(simulated_source, "development_fake_hardware_requested", None)
    assert callable(gate), "development fake hardware gate is missing"

    profile = _explicit_profile()
    assert gate(profile, environ={FAKE_ENV: "1", PRODUCT_MODE_ENV: "development"}) is True
    with pytest.raises(CameraUnavailableError, match='requires YYT1771_G3_DEVELOPMENT_FAKE_HARDWARE="1"'):
        gate(profile, environ={PRODUCT_MODE_ENV: "development"})

    with pytest.raises(CameraUnavailableError, match="requires an explicit development product mode"):
        gate(profile, environ={FAKE_ENV: "1"})

    with pytest.raises(CameraUnavailableError, match="explicit DEV-EXPOSURE profile"):
        gate(
            {**profile, "serial_number": "REAL-CAMERA-001"},
            environ={FAKE_ENV: "1", PRODUCT_MODE_ENV: "development"},
        )

    with pytest.raises(CameraUnavailableError, match="disabled in production"):
        gate(profile, environ={FAKE_ENV: "1", PRODUCT_MODE_ENV: "production"})


@pytest.mark.parametrize("alias", ["true", "yes", "on"])
def test_development_fake_hardware_rejects_truthy_aliases_explicitly(alias: str) -> None:
    with pytest.raises(CameraUnavailableError, match='must be exactly "1"'):
        simulated_source.development_fake_hardware_requested(
            _explicit_profile(),
            environ={FAKE_ENV: alias, PRODUCT_MODE_ENV: "development"},
        )


@pytest.mark.parametrize("layer", ["builder", "discovery", "temperature", "api"])
def test_development_fake_alias_is_rejected_at_every_hardware_entry_point(
    layer: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.services.hardware_setup_service import discover_hardware_cameras

    monkeypatch.setenv(FAKE_ENV, "true")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    config = HardwareConfig(
        camera=CameraConfig(**_explicit_profile()),
        temp=TempConfig(
            backend="lu92xx_modbus_rtu",
            serial=SerialPortConfig(port="DEV-LU92XX-001"),
        ),
    )

    if layer == "builder":
        operation = lambda: api_main._build_camera_source(config.camera.to_profile())
    elif layer == "discovery":
        operation = lambda: discover_hardware_cameras(config)
    elif layer == "temperature":
        operation = lambda: api_main.build_temperature_controller(config)
    else:
        monkeypatch.setattr(api_main, "_hardware_config", lambda: config)
        response = TestClient(api_main.app).get("/api/hardware/cameras")
        assert response.status_code == 503
        assert 'must be exactly "1"' in response.json()["detail"]["message"]
        return

    with pytest.raises(CameraUnavailableError, match='must be exactly "1"'):
        operation()


@pytest.mark.parametrize("layer", ["builder", "discovery", "temperature", "api"])
def test_development_fake_profile_without_switch_is_rejected_at_every_hardware_entry_point(
    layer: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.services.hardware_setup_service import discover_hardware_cameras

    monkeypatch.delenv(FAKE_ENV, raising=False)
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    config = HardwareConfig(
        camera=CameraConfig(**_explicit_profile()),
        temp=TempConfig(
            backend="lu92xx_modbus_rtu",
            serial=SerialPortConfig(port="DEV-LU92XX-001"),
        ),
    )

    if layer == "builder":
        operation = lambda: api_main._build_camera_source(config.camera.to_profile())
    elif layer == "discovery":
        operation = lambda: discover_hardware_cameras(config)
    elif layer == "temperature":
        operation = lambda: api_main.build_temperature_controller(config)
    else:
        monkeypatch.setattr(api_main, "_hardware_config", lambda: config)
        response = TestClient(api_main.app).get("/api/hardware/cameras")
        assert response.status_code == 503
        assert 'requires YYT1771_G3_DEVELOPMENT_FAKE_HARDWARE="1"' in response.json()["detail"]["message"]
        return

    with pytest.raises(
        CameraUnavailableError,
        match='requires YYT1771_G3_DEVELOPMENT_FAKE_HARDWARE="1"',
    ):
        operation()


def test_ordinary_simulated_hardware_still_works_without_fake_intent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.temperature.simulated import SimulatedTemperatureController

    monkeypatch.delenv(FAKE_ENV, raising=False)
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    profile = {
        "backend": "simulated",
        "serial_number": "SIM-G3",
        "simulated_dataset_id": "golden_a_20260522_dev_lab",
    }
    config = HardwareConfig(
        camera=CameraConfig(**profile),
        temp=TempConfig(backend="simulated_temperature"),
    )

    assert simulated_source.development_fake_hardware_requested(profile) is False
    assert isinstance(api_main._build_camera_source(profile), simulated_source.SimulatedCameraSource)
    assert isinstance(api_main.build_temperature_controller(config), SimulatedTemperatureController)


def test_development_fake_exposure_is_quantized_and_can_fail_exactly_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(FAKE_ENV, "1")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    monkeypatch.setenv(FAIL_ONCE_ENV, "55000")
    source = simulated_source.SimulatedCameraSource(profile=_explicit_profile())

    initial = source.read_exposure_capability()
    assert initial.supported is True
    assert initial.minimum_us == 100.0
    assert initial.maximum_us == 100000.0
    assert initial.increment_us == 100.0
    assert initial.requested_us == 12345.0
    assert initial.actual_us == 12300.0

    assert source.set_exposure_us(12360.0) == 12400.0
    with pytest.raises(RuntimeError, match="Injected development fake exposure failure"):
        source.set_exposure_us(55000.0)
    assert source.read_exposure_capability().actual_us == 12400.0
    assert source.set_exposure_us(55000.0) == 55000.0


def test_development_fake_exposure_failure_is_consumed_across_source_replacement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(FAKE_ENV, "1")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    monkeypatch.setenv(FAIL_ONCE_ENV, "55000")
    profile = _explicit_profile(exposure_us=12400.0)
    first_source = simulated_source.SimulatedCameraSource(profile=profile)

    with pytest.raises(RuntimeError, match="Injected development fake exposure failure"):
        first_source.set_exposure_us(55000.0)
    assert first_source.read_exposure_capability().actual_us == 12400.0
    first_source.close()

    replacement_source = simulated_source.SimulatedCameraSource(profile=profile)
    assert replacement_source.set_exposure_us(55000.0) == 55000.0


def test_development_fake_hardware_reuses_formal_hik_builder_discovery_and_temperature_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.services.hardware_setup_service import discover_hardware_cameras
    from yyt1771_g3.temperature.simulated import SimulatedTemperatureController

    monkeypatch.setenv(FAKE_ENV, "1")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    config = HardwareConfig(
        camera=CameraConfig(**_explicit_profile()),
        temp=TempConfig(
            backend="lu92xx_modbus_rtu",
            serial=SerialPortConfig(port="DEV-LU92XX-001"),
        ),
    )

    source = api_main._build_camera_source(config.camera.to_profile())
    assert isinstance(source, simulated_source.SimulatedCameraSource)
    assert source.preview_frame().camera_meta["backend"] == "development_fake_hik"

    cameras = discover_hardware_cameras(config)
    assert [camera["serial_number"] for camera in cameras] == [
        "DEV-EXPOSURE-001",
        "DEV-EXPOSURE-002",
    ]
    assert all(camera["backend"] == "hik_gige_mvs" for camera in cameras)

    controller = api_main.build_temperature_controller(config)
    assert isinstance(controller, SimulatedTemperatureController)


def test_development_fake_hardware_is_hard_rejected_in_production_builder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main as api_main

    monkeypatch.setenv(FAKE_ENV, "1")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "production")
    with pytest.raises(CameraUnavailableError, match="disabled in production"):
        api_main._build_camera_source(_explicit_profile())


def test_development_fake_exposure_api_persists_actual_and_restores_it_after_source_restart(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import HARDWARE_CONFIG_ENV, load_hardware_config

    config_path = tmp_path / "development_fake_hardware.local.yaml"
    config_path.write_text(
        """camera:
  backend: hik_gige_mvs
  transport: gige_vision
  model: MV-DEV-EXPOSURE
  serial_number: DEV-EXPOSURE-001
  exposure_us: 12345
temp:
  backend: lu92xx_modbus_rtu
  serial:
    port: DEV-LU92XX-001
""",
        encoding="utf-8",
    )
    monkeypatch.setenv(HARDWARE_CONFIG_ENV, str(config_path))
    monkeypatch.setenv(FAKE_ENV, "1")
    monkeypatch.setenv(PRODUCT_MODE_ENV, "development")
    monkeypatch.setenv(FAIL_ONCE_ENV, "55000")
    api_main._reset_preview_camera_source()
    client = TestClient(api_main.app)

    initial = client.post("/api/camera/exposure/read", json={})
    assert initial.status_code == 200
    assert initial.json()["actual_us"] == 12300.0

    applied = client.put("/api/camera/exposure", json={"exposure_us": 12360.0})
    assert applied.status_code == 200
    assert applied.json()["actual_us"] == 12400.0
    assert load_hardware_config(config_path).camera.exposure_us == 12400.0

    api_main._reset_preview_camera_source()
    restarted = client.post("/api/camera/exposure/read", json={})
    assert restarted.status_code == 200
    assert restarted.json()["actual_us"] == 12400.0

    failed = client.put("/api/camera/exposure", json={"exposure_us": 55000.0})
    assert failed.status_code == 422
    assert failed.json()["detail"]["details"]["rollback_status"] == "restored"
    assert load_hardware_config(config_path).camera.exposure_us == 12400.0
    confirmed = client.post("/api/camera/exposure/read", json={}).json()
    assert confirmed["actual_us"] == 12400.0

    retried = client.put("/api/camera/exposure", json={"exposure_us": 55000.0})
    assert retried.status_code == 200
    assert retried.json()["actual_us"] == 55000.0
    assert load_hardware_config(config_path).camera.exposure_us == 55000.0
    api_main._reset_preview_camera_source()
