from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Any, Callable

from yyt1771_g3.camera.base import CameraExposureCapability, ExposureCapableCameraSource


ROLLBACK_ABS_TOLERANCE_US = 1e-6


@dataclass(frozen=True)
class CameraExposureUpdate:
    capability: CameraExposureCapability
    actual_us: float
    saved: bool


class CameraControlError(RuntimeError):
    def __init__(self, message: str, *, stage: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.details = details or {}


def _rollback_camera_exposure(
    source: ExposureCapableCameraSource,
    expected_us: float,
    details: dict[str, Any],
) -> None:
    details["rollback_expected_us"] = expected_us
    try:
        rollback_actual = source.set_exposure_us(expected_us)
        details["rollback_actual_us"] = rollback_actual
        if math.isclose(
            rollback_actual,
            expected_us,
            rel_tol=0.0,
            abs_tol=ROLLBACK_ABS_TOLERANCE_US,
        ):
            details["rollback_status"] = "restored"
        else:
            details["rollback_status"] = "failed"
            details["rollback_error"] = (
                f"Camera rollback returned {rollback_actual} us; "
                f"expected {expected_us} us."
            )
    except Exception as rollback_error:
        details["rollback_status"] = "failed"
        details["rollback_error"] = str(rollback_error)


def apply_camera_exposure(
    source: ExposureCapableCameraSource,
    requested_us: float,
    *,
    persist: Callable[[float], object],
) -> CameraExposureUpdate:
    try:
        previous = source.read_exposure_capability()
    except Exception as exc:
        raise CameraControlError(
            str(exc),
            stage="capability",
            details={"requested_us": requested_us, "error": str(exc)},
        ) from exc
    if not previous.supported or previous.actual_us is None:
        raise CameraControlError(
            "Camera does not expose manual exposure control.",
            stage="capability",
        )
    try:
        actual = source.set_exposure_us(requested_us)
    except Exception as exc:
        details = {"requested_us": requested_us}
        _rollback_camera_exposure(source, previous.actual_us, details)
        raise CameraControlError(
            str(exc),
            stage="apply",
            details=details,
        ) from exc
    try:
        persist(actual)
    except Exception as persist_error:
        details = {
            "requested_us": requested_us,
            "actual_us": actual,
        }
        _rollback_camera_exposure(source, previous.actual_us, details)
        raise CameraControlError(
            str(persist_error),
            stage="persist",
            details=details,
        ) from persist_error
    committed_capability = replace(
        previous,
        supported=True,
        requested_us=actual,
        actual_us=actual,
    )
    try:
        capability = source.read_exposure_capability()
    except Exception:
        capability = committed_capability
    if not capability.supported or capability.actual_us is None or capability.actual_us != actual:
        capability = committed_capability
    return CameraExposureUpdate(
        capability=capability,
        actual_us=actual,
        saved=True,
    )
