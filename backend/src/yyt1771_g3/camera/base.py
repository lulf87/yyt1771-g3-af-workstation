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


#: The first frame after ``StartGrabbing`` needs roughly two exposure periods to arrive; 2.5
#: keeps a margin so a 1 s timeout caps the exposure at 400 ms (site data: 300 ms worked,
#: 691 ms always timed out).
FIRST_FRAME_PERIOD_FACTOR = 2.5


def safe_exposure_maximum_us(
    *,
    camera_maximum_us: float | None,
    timeout_ms: int | None,
) -> float | None:
    """Return the largest exposure that still fits the camera range and the read timeout."""

    limits: list[float] = []
    if camera_maximum_us is not None and camera_maximum_us > 0:
        limits.append(float(camera_maximum_us))
    if timeout_ms is not None and timeout_ms > 0:
        limits.append(float(timeout_ms) * 1000.0 / FIRST_FRAME_PERIOD_FACTOR)
    return min(limits) if limits else None


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
