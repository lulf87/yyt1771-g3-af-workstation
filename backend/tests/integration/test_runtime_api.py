from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest


def _write_hardware_profile(tmp_path: Path, *, simulated: bool, name: str) -> Path:
    profile_path = tmp_path / f"{name}.yaml"
    if simulated:
        camera_backend = "simulated"
        temperature_backend = "simulated"
        simulated_dataset = "  simulated_dataset_id: golden_c_20260529_dev_lab\n"
    else:
        camera_backend = "hik_gige_mvs"
        temperature_backend = "lu92xx_modbus_rtu"
        simulated_dataset = ""
    profile_path.write_text(
        (
            "camera:\n"
            f"  backend: {camera_backend}\n"
            f"{simulated_dataset}"
            "temp:\n"
            f"  backend: {temperature_backend}\n"
        ),
        encoding="utf-8",
    )
    return profile_path


def test_app_runtime_api_reports_production_real_hardware(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    hardware_profile = _write_hardware_profile(tmp_path, simulated=False, name="real-hardware")
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "real_hardware")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "production")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware_profile))

    from yyt1771_g3.api.main import app

    response = TestClient(app).get("/api/app/runtime")

    assert response.status_code == 200
    assert response.json() == {
        "runtime_source": "real_hardware",
        "display_label_zh": "真实相机 + 真实温控",
        "display_label_en": "Real camera + real temperature controller",
        "simulation_enabled": False,
        "simulation_allowed": False,
        "product_mode": "production",
        "production_mode": True,
        "simulated_dataset_id": "",
    }


def test_app_runtime_api_reports_simulated_material(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    hardware_profile = _write_hardware_profile(tmp_path, simulated=True, name="simulated-material")
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "simulated_material")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "development")
    monkeypatch.setenv("YYT1771_G3_SIMULATED_DATASET_ID", "golden_c_20260529_dev_lab")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware_profile))

    from yyt1771_g3.api.main import app

    response = TestClient(app).get("/api/app/runtime")

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime_source"] == "simulated_material"
    assert payload["display_label_zh"] == "模拟素材调试"
    assert payload["simulation_enabled"] is True
    assert payload["simulated_dataset_id"] == "golden_c_20260529_dev_lab"


def test_operator_source_status_includes_runtime_policy(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    hardware_profile = _write_hardware_profile(tmp_path, simulated=True, name="operator-simulated")
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "simulated_material")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "development")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(hardware_profile))

    from yyt1771_g3.api.main import app

    response = TestClient(app).get("/api/operator/source-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime_source"] == "simulated_material"
    assert payload["product_mode"] == "development"
    assert payload["camera_is_simulated"] is True
    assert payload["temperature_is_simulated"] is True
    assert payload["configuration_valid"] is True


def test_runtime_source_guard_rejects_cross_source_acquisition(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main

    real_profile = _write_hardware_profile(tmp_path, simulated=False, name="guard-real")
    simulated_profile = _write_hardware_profile(tmp_path, simulated=True, name="guard-simulated")
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "real_hardware")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(real_profile))
    with pytest.raises(HTTPException, match="runtime source") as real_error:
        api_main._assert_runtime_source("simulated_material")
    assert real_error.value.status_code == 409

    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "simulated_material")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(simulated_profile))
    with pytest.raises(HTTPException, match="runtime source") as simulated_error:
        api_main._assert_runtime_source("real_hardware")
    assert simulated_error.value.status_code == 409


def test_real_runtime_reports_simulated_backend_as_configuration_error(monkeypatch) -> None:  # noqa: ANN001
    from yyt1771_g3.api import main as api_main
    from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, TempConfig

    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "real_hardware")
    monkeypatch.setattr(
        api_main,
        "_hardware_config",
        lambda: HardwareConfig(
            camera=CameraConfig(backend="simulated"),
            temp=TempConfig(backend="simulated"),
        ),
    )

    response = TestClient(api_main.app).get("/api/operator/source-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["configuration_valid"] is False
    assert payload["real_hardware_available"] is False
    assert "当前以真实硬件模式启动" in payload["configuration_error_zh"]
    assert "camera or temperature backend is simulated" in payload["configuration_error_en"]
