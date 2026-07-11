from __future__ import annotations

import pytest

from yyt1771_g3.core.hardware_config import CameraConfig, HardwareConfig, TempConfig
from yyt1771_g3.core.runtime_policy import RuntimePolicyError, load_runtime_policy, runtime_policy_payload


def _hardware(camera_backend: str, temperature_backend: str, dataset_id: str = "") -> HardwareConfig:
    return HardwareConfig(
        camera=CameraConfig(backend=camera_backend, simulated_dataset_id=dataset_id),
        temp=TempConfig(backend=temperature_backend),
    )


def test_runtime_policy_defaults_to_real_hardware_development() -> None:
    policy = load_runtime_policy(environ={}, hardware_config=_hardware("hik_gige_mvs", "lu92xx_modbus_rtu"))

    assert policy.runtime_source == "real_hardware"
    assert policy.product_mode == "development"
    assert policy.simulation_enabled is False
    assert policy.simulation_allowed is True
    assert policy.production_mode is False


def test_runtime_policy_accepts_production_real_hardware() -> None:
    policy = load_runtime_policy(
        environ={
            "YYT1771_G3_RUNTIME_SOURCE": "real_hardware",
            "YYT1771_G3_PRODUCT_MODE": "production",
        },
        hardware_config=_hardware("hik_gige_mvs", "lu92xx_modbus_rtu"),
    )

    assert runtime_policy_payload(policy) == {
        "runtime_source": "real_hardware",
        "display_label_zh": "真实相机 + 真实温控",
        "display_label_en": "Real camera + real temperature controller",
        "simulation_enabled": False,
        "simulation_allowed": False,
        "product_mode": "production",
        "production_mode": True,
        "simulated_dataset_id": "",
    }


def test_runtime_policy_accepts_simulated_material_and_environment_dataset_override() -> None:
    policy = load_runtime_policy(
        environ={
            "YYT1771_G3_RUNTIME_SOURCE": "simulated_material",
            "YYT1771_G3_SIMULATED_DATASET_ID": "golden_c_20260529_dev_lab",
        },
        hardware_config=_hardware("simulated", "simulated", "golden_a_20260522_dev_lab"),
    )

    assert policy.simulated_dataset_id == "golden_c_20260529_dev_lab"
    assert runtime_policy_payload(policy)["display_label_en"] == "Simulated material debug"


@pytest.mark.parametrize(
    ("environ", "hardware", "message"),
    [
        ({"YYT1771_G3_RUNTIME_SOURCE": "offline"}, _hardware("simulated", "simulated"), "runtime source"),
        ({"YYT1771_G3_PRODUCT_MODE": "prod"}, _hardware("hik_gige_mvs", "lu92xx_modbus_rtu"), "product mode"),
        (
            {"YYT1771_G3_RUNTIME_SOURCE": "simulated_material", "YYT1771_G3_PRODUCT_MODE": "production"},
            _hardware("simulated", "simulated", "golden_a_20260522_dev_lab"),
            "does not allow simulated material",
        ),
        (
            {"YYT1771_G3_RUNTIME_SOURCE": "simulated_material"},
            _hardware("hik_gige_mvs", "simulated", "golden_a_20260522_dev_lab"),
            "requires a simulated dataset camera",
        ),
        (
            {"YYT1771_G3_RUNTIME_SOURCE": "simulated_material"},
            _hardware("simulated", "lu92xx_modbus_rtu", "golden_a_20260522_dev_lab"),
            "requires simulated temperature",
        ),
    ],
)
def test_runtime_policy_rejects_invalid_source_product_and_backend_combinations(
    environ: dict[str, str],
    hardware: HardwareConfig,
    message: str,
) -> None:
    with pytest.raises(RuntimePolicyError, match=message):
        load_runtime_policy(environ=environ, hardware_config=hardware)


def test_simulated_material_uses_safe_default_dataset_when_profile_is_empty() -> None:
    policy = load_runtime_policy(
        environ={"YYT1771_G3_RUNTIME_SOURCE": "simulated_material"},
        hardware_config=_hardware("simulated", "simulated"),
    )

    assert policy.simulated_dataset_id == "golden_a_20260522_dev_lab"


def test_real_hardware_policy_stays_reportable_when_profile_is_simulated() -> None:
    policy = load_runtime_policy(
        environ={"YYT1771_G3_RUNTIME_SOURCE": "real_hardware"},
        hardware_config=_hardware("simulated", "simulated"),
    )

    assert policy.runtime_source == "real_hardware"
