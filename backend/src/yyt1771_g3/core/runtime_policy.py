from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

from yyt1771_g3.core.hardware_config import HardwareConfig, load_hardware_config


RUNTIME_SOURCE_ENV = "YYT1771_G3_RUNTIME_SOURCE"
PRODUCT_MODE_ENV = "YYT1771_G3_PRODUCT_MODE"
SIMULATED_DATASET_ID_ENV = "YYT1771_G3_SIMULATED_DATASET_ID"

DEFAULT_RUNTIME_SOURCE = "real_hardware"
DEFAULT_PRODUCT_MODE = "development"
DEFAULT_SIMULATED_DATASET_ID = "golden_a_20260522_dev_lab"

REAL_CAMERA_BACKENDS = {"", "hik_gige_mvs", "hik_mvs"}
SIMULATED_CAMERA_BACKENDS = {"simulated", "simulated_camera", "mock", "fake"}
REAL_TEMPERATURE_BACKENDS = {"lu92xx_modbus_rtu", "lu92xx", "modbus_rtu"}
SIMULATED_TEMPERATURE_BACKENDS = {"simulated", "simulated_temperature", "mock", "fake"}


class RuntimePolicyError(RuntimeError):
    """Raised when startup runtime-source configuration is unsafe or contradictory."""


@dataclass(frozen=True)
class RuntimePolicy:
    runtime_source: str
    product_mode: str
    simulated_dataset_id: str = ""

    @property
    def simulation_enabled(self) -> bool:
        return self.runtime_source == "simulated_material"

    @property
    def production_mode(self) -> bool:
        return self.product_mode == "production"

    @property
    def simulation_allowed(self) -> bool:
        return not self.production_mode


def load_runtime_policy(
    *,
    environ: Mapping[str, str] | None = None,
    hardware_config: HardwareConfig | None = None,
) -> RuntimePolicy:
    environment = os.environ if environ is None else environ
    hardware = hardware_config or load_hardware_config()
    runtime_source = _enum_value(
        environment.get(RUNTIME_SOURCE_ENV),
        default=DEFAULT_RUNTIME_SOURCE,
        allowed={"real_hardware", "simulated_material"},
        label="runtime source",
    )
    product_mode = _enum_value(
        environment.get(PRODUCT_MODE_ENV),
        default=DEFAULT_PRODUCT_MODE,
        allowed={"production", "development"},
        label="product mode",
    )
    dataset_override = str(environment.get(SIMULATED_DATASET_ID_ENV, "") or "").strip()
    simulated_dataset_id = ""
    if runtime_source == "simulated_material":
        simulated_dataset_id = (
            dataset_override
            or str(hardware.camera.simulated_dataset_id or "").strip()
            or DEFAULT_SIMULATED_DATASET_ID
        )

    policy = RuntimePolicy(
        runtime_source=runtime_source,
        product_mode=product_mode,
        simulated_dataset_id=simulated_dataset_id,
    )
    _validate_runtime_policy(policy, hardware)
    return policy


def runtime_policy_payload(policy: RuntimePolicy) -> dict[str, object]:
    simulated = policy.runtime_source == "simulated_material"
    return {
        "runtime_source": policy.runtime_source,
        "display_label_zh": "模拟素材调试" if simulated else "真实相机 + 真实温控",
        "display_label_en": "Simulated material debug" if simulated else "Real camera + real temperature controller",
        "simulation_enabled": policy.simulation_enabled,
        "simulation_allowed": policy.simulation_allowed,
        "product_mode": policy.product_mode,
        "production_mode": policy.production_mode,
        "simulated_dataset_id": policy.simulated_dataset_id,
    }


def run_runtime_metadata(
    *,
    default_runtime_source: str,
    legacy_operator_data_source: str,
    environ: Mapping[str, str] | None = None,
) -> dict[str, str]:
    environment = os.environ if environ is None else environ
    explicit_source = str(environment.get(RUNTIME_SOURCE_ENV, "") or "").strip()
    runtime_source = _enum_value(
        explicit_source,
        default=default_runtime_source,
        allowed={"real_hardware", "simulated_material"},
        label="runtime source",
    )
    product_mode = _enum_value(
        environment.get(PRODUCT_MODE_ENV),
        default=DEFAULT_PRODUCT_MODE,
        allowed={"production", "development"},
        label="product mode",
    )
    return {
        "runtime_source": runtime_source,
        "product_mode": product_mode,
        "operator_data_source": runtime_source if explicit_source else legacy_operator_data_source,
    }


def _validate_runtime_policy(policy: RuntimePolicy, hardware: HardwareConfig) -> None:
    camera_backend = _normalized(hardware.camera.backend)
    temperature_backend = _normalized(hardware.temp.backend)
    camera_is_simulated = camera_backend in SIMULATED_CAMERA_BACKENDS
    temperature_is_simulated = temperature_backend in SIMULATED_TEMPERATURE_BACKENDS

    if policy.production_mode and policy.simulation_enabled:
        raise RuntimePolicyError("production product mode does not allow simulated material")

    if policy.runtime_source == "real_hardware":
        return

    if not camera_is_simulated:
        raise RuntimePolicyError("simulated-material runtime requires a simulated dataset camera backend")
    if not temperature_is_simulated:
        raise RuntimePolicyError("simulated-material runtime requires simulated temperature backend")
    if not policy.simulated_dataset_id:
        raise RuntimePolicyError("simulated-material runtime requires a simulated dataset id")


def _enum_value(value: str | None, *, default: str, allowed: set[str], label: str) -> str:
    normalized = _normalized(value) or default
    if normalized not in allowed:
        raise RuntimePolicyError(f"unsupported {label}: {normalized}; expected one of {sorted(allowed)}")
    return normalized


def _normalized(value: object) -> str:
    return str(value or "").strip().lower().replace("-", "_")


__all__ = [
    "DEFAULT_PRODUCT_MODE",
    "DEFAULT_RUNTIME_SOURCE",
    "DEFAULT_SIMULATED_DATASET_ID",
    "PRODUCT_MODE_ENV",
    "RUNTIME_SOURCE_ENV",
    "RuntimePolicy",
    "RuntimePolicyError",
    "SIMULATED_DATASET_ID_ENV",
    "load_runtime_policy",
    "run_runtime_metadata",
    "runtime_policy_payload",
]
