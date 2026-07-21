from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from yyt1771_g3.camera.base import CameraExposureCapability, ExposureCapableCameraSource


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


def apply_camera_exposure(
    source: ExposureCapableCameraSource,
    requested_us: float,
    *,
    persist: Callable[[float], object],
) -> CameraExposureUpdate:
    previous = source.read_exposure_capability()
    if not previous.supported or previous.actual_us is None:
        raise CameraControlError(
            "Camera does not expose manual exposure control.",
            stage="capability",
        )
    try:
        actual = source.set_exposure_us(requested_us)
    except Exception as exc:
        raise CameraControlError(
            str(exc),
            stage="apply",
            details={"requested_us": requested_us},
        ) from exc
    try:
        persist(actual)
    except Exception as persist_error:
        details = {
            "requested_us": requested_us,
            "actual_us": actual,
        }
        try:
            source.set_exposure_us(previous.actual_us)
            details["rollback_status"] = "restored"
        except Exception as rollback_error:
            details["rollback_status"] = "failed"
            details["rollback_error"] = str(rollback_error)
        raise CameraControlError(
            str(persist_error),
            stage="persist",
            details=details,
        ) from persist_error
    capability = source.read_exposure_capability()
    return CameraExposureUpdate(
        capability=capability,
        actual_us=actual,
        saved=True,
    )
