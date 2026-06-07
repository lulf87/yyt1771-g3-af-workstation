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


class CameraUnavailableError(RuntimeError):
    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


class CameraSource(Protocol):
    def preview_frame(self) -> CameraFrame:
        ...

    def close(self) -> None:
        ...
