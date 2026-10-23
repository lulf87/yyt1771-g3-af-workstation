from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from typing import Any

import numpy as np


@dataclass(frozen=True)
class CameraFrame:
    array: np.ndarray
    timestamp_ms: int | None
    camera_meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CameraExposureCapability:
    supported: bool
    minimum_us: float | None = None
    maximum_us: float | None = None
    increment_us: float | None = None
    requested_us: float | None = None
    actual_us: float | None = None
    # Largest exposure that still returns a frame inside the configured read timeout. The
    # camera's own ``maximum_us`` can be seconds long, but such a setting can never be read
    # back within a 1 s grab timeout, so the UI caps its slider at this value.
    safe_maximum_us: float | None = None
    safe_maximum_source: str = ""


#: The first frame after ``StartGrabbing`` needs roughly two exposure periods to arrive; 2.5
#: keeps a margin so a 1 s timeout caps the exposure at 400 ms (site data: 300 ms worked,
#: 691 ms always timed out).
FIRST_FRAME_PERIOD_FACTOR = 2.5


EXPOSURE_LIMIT_SOURCE_CONFIG = "config"
EXPOSURE_LIMIT_SOURCE_FRAME_TIMEOUT = "frame_timeout"
EXPOSURE_LIMIT_SOURCE_CAMERA = "camera"


def exposure_limits(
    *,
    camera_maximum_us: float | None,
    timeout_ms: int | None,
    configured_maximum_us: float | None = None,
) -> tuple[float | None, str]:
    """Return ``(safe_maximum_us, source)`` for the exposure control.

    The effective cap is the smallest of: the operator-configured ``camera.exposure_max_us``,
    the frame-timeout limit (the camera needs about two exposure periods before the first frame),
    and the camera's own maximum. ``source`` tells the UI which one won, so the hint can say
    "configured cap" instead of blaming the frame timeout.
    """

    candidates: list[tuple[float, str]] = []
    if configured_maximum_us is not None and configured_maximum_us > 0:
        candidates.append((float(configured_maximum_us), EXPOSURE_LIMIT_SOURCE_CONFIG))
    if timeout_ms is not None and timeout_ms > 0:
        candidates.append(
            (float(timeout_ms) * 1000.0 / FIRST_FRAME_PERIOD_FACTOR, EXPOSURE_LIMIT_SOURCE_FRAME_TIMEOUT)
        )
    camera_candidate = None
    if camera_maximum_us is not None and camera_maximum_us > 0:
        camera_candidate = (float(camera_maximum_us), EXPOSURE_LIMIT_SOURCE_CAMERA)
        candidates.append(camera_candidate)
    if not candidates:
        return None, ""
    value, source = min(candidates, key=lambda item: item[0])
    if camera_candidate is not None and value == camera_candidate[0] and source != EXPOSURE_LIMIT_SOURCE_CONFIG:
        return value, EXPOSURE_LIMIT_SOURCE_CAMERA
    return value, source


def safe_exposure_maximum_us(
    *,
    camera_maximum_us: float | None,
    timeout_ms: int | None,
    configured_maximum_us: float | None = None,
) -> float | None:
    """Return the largest exposure that still fits the configured cap, camera range and timeout."""

    return exposure_limits(
        camera_maximum_us=camera_maximum_us,
        timeout_ms=timeout_ms,
        configured_maximum_us=configured_maximum_us,
    )[0]


class CameraUnavailableError(RuntimeError):
    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


class CameraSource(Protocol):
    def preview_frame(self) -> CameraFrame:
        ...

    def close(self) -> None:
        ...


class ExposureCapableCameraSource(Protocol):
    def read_exposure_capability(self) -> CameraExposureCapability:
        ...

    def set_exposure_us(self, value: float) -> float:
        ...
