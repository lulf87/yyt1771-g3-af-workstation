from __future__ import annotations

import math
import os
import threading
import time
from typing import Any, Mapping

import numpy as np

from yyt1771_g3.camera.base import CameraExposureCapability, CameraFrame, CameraUnavailableError
from yyt1771_g3.core.timebase import now_ms


DEVELOPMENT_FAKE_HARDWARE_ENV = "YYT1771_G3_DEVELOPMENT_FAKE_HARDWARE"
DEVELOPMENT_FAKE_EXPOSURE_FAIL_ONCE_ENV = "YYT1771_G3_DEVELOPMENT_FAKE_EXPOSURE_FAIL_ONCE_US"
DEVELOPMENT_FAKE_EXPOSURE_LATENCY_ENV = "YYT1771_G3_DEVELOPMENT_FAKE_EXPOSURE_LATENCY_MS"
DEVELOPMENT_FAKE_SERIAL_PREFIX = "DEV-EXPOSURE-"
PRODUCT_MODE_ENV = "YYT1771_G3_PRODUCT_MODE"

FAKE_EXPOSURE_MINIMUM_US = 100.0
FAKE_EXPOSURE_MAXIMUM_US = 100000.0
FAKE_EXPOSURE_INCREMENT_US = 100.0

_development_fake_exposure_failure_lock = threading.Lock()
_development_fake_exposure_failures_consumed: set[tuple[str, float]] = set()


def _reset_development_fake_exposure_failures() -> None:
    with _development_fake_exposure_failure_lock:
        _development_fake_exposure_failures_consumed.clear()


def development_fake_hardware_requested(
    profile: Mapping[str, Any],
    *,
    environ: Mapping[str, str] | None = None,
) -> bool:
    environment = os.environ if environ is None else environ
    if not _bool(environment.get(DEVELOPMENT_FAKE_HARDWARE_ENV), default=False):
        return False
    product_mode_value = environment.get(PRODUCT_MODE_ENV)
    if product_mode_value is None or not str(product_mode_value).strip():
        raise CameraUnavailableError(
            "Development fake hardware requires an explicit development product mode."
        )
    product_mode = str(product_mode_value).strip().lower()
    if product_mode != "development":
        raise CameraUnavailableError("Development fake hardware is disabled in production product mode.")
    serial_number = str(profile.get("serial_number", "") or "").strip().upper()
    if not serial_number.startswith(DEVELOPMENT_FAKE_SERIAL_PREFIX):
        raise CameraUnavailableError(
            "Development fake hardware requires an explicit DEV-EXPOSURE profile.",
            details={"serial_number": serial_number},
        )
    return True


class SimulatedCameraSource:
    """Deterministic software camera for local setup and run verification."""

    def __init__(self, profile: dict[str, Any] | None = None) -> None:
        self.profile = profile or {}
        self._development_fake_hardware = development_fake_hardware_requested(self.profile)
        self._frame_id = 0
        self._dataset_id = str(
            self.profile.get("simulated_dataset_id") or self.profile.get("dataset_id") or ""
        ).strip()
        self._next_dataset_frame = _positive_int(
            self.profile.get("simulated_start_frame"),
            self.profile.get("start_frame"),
            default=1,
        )
        self._registry = None
        self._resolved = None
        requested_exposure = _finite_float(self.profile.get("exposure_us"), default=10000.0)
        self._requested_exposure_us = requested_exposure
        self._actual_exposure_us = _quantize_exposure_us(requested_exposure)

    def preview_frame(self) -> CameraFrame:
        if self._dataset_id:
            return self._dataset_frame()
        self._frame_id += 1
        array = _synthetic_frame(self.profile, self._frame_id)
        return CameraFrame(
            array=array,
            timestamp_ms=_timestamp_ms(),
            camera_meta={
                "backend": "development_fake_hik" if self._development_fake_hardware else "simulated",
                "model": (
                    str(self.profile.get("model", "") or "MV-DEV-EXPOSURE")
                    if self._development_fake_hardware
                    else "G3 simulated camera"
                ),
                "serial_number": (
                    str(self.profile.get("serial_number", "") or "DEV-EXPOSURE-001")
                    if self._development_fake_hardware
                    else "SIM-G3"
                ),
                "ip": "",
                "pixel_format": str(self.profile.get("pixel_format", "mono8") or "mono8"),
                "frame_id": self._frame_id,
                "target_frame_rate_hz": self.profile.get("target_frame_rate_hz"),
                "device_roi": _device_roi(self.profile),
                "exposure_us": self._actual_exposure_us,
            },
        )

    def read_exposure_capability(self) -> CameraExposureCapability:
        self._wait_for_fake_exposure_latency()
        return CameraExposureCapability(
            supported=True,
            minimum_us=FAKE_EXPOSURE_MINIMUM_US,
            maximum_us=FAKE_EXPOSURE_MAXIMUM_US,
            increment_us=FAKE_EXPOSURE_INCREMENT_US,
            requested_us=self._requested_exposure_us,
            actual_us=self._actual_exposure_us,
        )

    def set_exposure_us(self, value: float) -> float:
        requested = _finite_float(value, default=math.nan)
        if not math.isfinite(requested):
            raise ValueError("Exposure must be finite.")
        if requested < FAKE_EXPOSURE_MINIMUM_US or requested > FAKE_EXPOSURE_MAXIMUM_US:
            raise ValueError(
                f"Exposure {requested} is outside "
                f"[{FAKE_EXPOSURE_MINIMUM_US}, {FAKE_EXPOSURE_MAXIMUM_US}] us."
            )
        self._wait_for_fake_exposure_latency()
        actual = _quantize_exposure_us(requested)
        fail_once_us = _optional_finite_float(os.environ.get(DEVELOPMENT_FAKE_EXPOSURE_FAIL_ONCE_ENV))
        if (
            self._development_fake_hardware
            and fail_once_us is not None
            and math.isclose(actual, _quantize_exposure_us(fail_once_us), rel_tol=0.0, abs_tol=1e-9)
        ):
            failure_key = (
                str(self.profile.get("serial_number", "") or "").strip().upper(),
                _quantize_exposure_us(fail_once_us),
            )
            with _development_fake_exposure_failure_lock:
                should_fail = failure_key not in _development_fake_exposure_failures_consumed
                if should_fail:
                    _development_fake_exposure_failures_consumed.add(failure_key)
            if should_fail:
                raise RuntimeError("Injected development fake exposure failure for rollback verification.")
        self._requested_exposure_us = requested
        self._actual_exposure_us = actual
        return actual

    def _wait_for_fake_exposure_latency(self) -> None:
        latency_ms = _optional_finite_float(os.environ.get(DEVELOPMENT_FAKE_EXPOSURE_LATENCY_ENV))
        if latency_ms is not None and latency_ms > 0:
            time.sleep(latency_ms / 1000.0)

    def close(self) -> None:
        return None

    def _dataset_frame(self) -> CameraFrame:
        try:
            registry = self._load_registry()
            resolved = self._resolved or registry.resolve_dataset(self._dataset_id)
            self._resolved = resolved
            frame_index = self._next_dataset_frame
            if frame_index > resolved.frame_count:
                frame_index = 1 if _bool(self.profile.get("simulated_loop"), default=True) else resolved.frame_count
            loaded = registry.load_frame(self._dataset_id, frame_index)
        except Exception as exc:
            raise CameraUnavailableError(
                "Simulated camera dataset frame acquisition failed",
                details={
                    "backend": "simulated",
                    "dataset_id": self._dataset_id,
                    "frame_index": self._next_dataset_frame,
                    "error": str(exc),
                },
            ) from exc

        self._next_dataset_frame = frame_index + 1
        self._frame_id += 1
        return CameraFrame(
            array=loaded.array,
            timestamp_ms=_timestamp_ms(),
            camera_meta={
                "backend": "simulated",
                "model": "G3 simulated dataset camera",
                "serial_number": f"SIM-DATASET-{self._dataset_id}",
                "ip": "",
                "pixel_format": str(self.profile.get("pixel_format", "mono8") or "mono8"),
                "frame_id": self._frame_id,
                "dataset_id": self._dataset_id,
                "offline_frame_index": loaded.frame_index,
                "frame_path": str(loaded.frame_path),
                "target_frame_rate_hz": self.profile.get("target_frame_rate_hz"),
                "exposure_us": self._actual_exposure_us,
            },
        )

    def _load_registry(self):  # noqa: ANN202
        if self._registry is None:
            import os

            from yyt1771_g3.services.offline_dataset import load_dataset_registry

            self._registry = load_dataset_registry(os.environ.get("YYT1771_G3_OFFLINE_DATASETS_CONFIG"))
        return self._registry


def _synthetic_frame(profile: dict[str, Any], frame_id: int) -> np.ndarray:
    height, width = _shape(profile)
    image = np.full((height, width), 245, dtype=np.uint8)

    x0 = max(0, int(width * 0.22))
    x1 = min(width, int(width * 0.78))
    y0 = max(0, int(height * 0.40))
    y1 = min(height, int(height * 0.60))
    if x1 <= x0 or y1 <= y0:
        return image

    image[y0:y1, x0:x1] = 68
    _draw_line(image, x0, y0, x1 - 1, y0, value=38, thickness=2)
    _draw_line(image, x0, y1 - 1, x1 - 1, y1 - 1, value=38, thickness=2)

    phase = frame_id % 12
    spacing = max(14, int(width * 0.08))
    for start in range(x0 - (y1 - y0), x1, spacing):
        _draw_line(image, start + phase, y1 - 1, start + (y1 - y0) + phase, y0, value=28, thickness=1)
    for start in range(x0, x1 + (y1 - y0), spacing):
        _draw_line(image, start - phase, y0, start - (y1 - y0) - phase, y1 - 1, value=28, thickness=1)

    marker_radius = max(3, min(width, height) // 80)
    _draw_disk(image, x0, (y0 + y1) // 2, marker_radius, value=20)
    _draw_disk(image, x1 - 1, (y0 + y1) // 2, marker_radius, value=20)
    return image


def _shape(profile: dict[str, Any]) -> tuple[int, int]:
    roi = _device_roi(profile)
    width = _positive_int(profile.get("width"), roi.get("width"), default=1200)
    height = _positive_int(profile.get("height"), roi.get("height"), default=800)
    return height, width


def _device_roi(profile: dict[str, Any]) -> dict[str, int]:
    roi = profile.get("device_roi")
    if not isinstance(roi, dict):
        return {}
    return {
        "x": _positive_int(roi.get("x"), default=0, allow_zero=True),
        "y": _positive_int(roi.get("y"), default=0, allow_zero=True),
        "width": _positive_int(roi.get("width"), default=0, allow_zero=True),
        "height": _positive_int(roi.get("height"), default=0, allow_zero=True),
    }


def _positive_int(*values: Any, default: int, allow_zero: bool = False) -> int:
    for value in values:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0 or (allow_zero and parsed == 0):
            return parsed
    return default


def _bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _finite_float(value: Any, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _optional_finite_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _quantize_exposure_us(value: float) -> float:
    clamped = min(max(value, FAKE_EXPOSURE_MINIMUM_US), FAKE_EXPOSURE_MAXIMUM_US)
    steps = math.floor(
        (clamped - FAKE_EXPOSURE_MINIMUM_US) / FAKE_EXPOSURE_INCREMENT_US + 0.5
    )
    return FAKE_EXPOSURE_MINIMUM_US + steps * FAKE_EXPOSURE_INCREMENT_US


def _draw_line(
    image: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    *,
    value: int,
    thickness: int,
) -> None:
    steps = max(abs(x1 - x0), abs(y1 - y0), 1) + 1
    xs = np.rint(np.linspace(x0, x1, steps)).astype(int)
    ys = np.rint(np.linspace(y0, y1, steps)).astype(int)
    half = max(0, thickness // 2)
    for x, y in zip(xs, ys):
        y_min = max(0, y - half)
        y_max = min(image.shape[0], y + half + 1)
        x_min = max(0, x - half)
        x_max = min(image.shape[1], x + half + 1)
        if y_min < y_max and x_min < x_max:
            image[y_min:y_max, x_min:x_max] = value


def _draw_disk(image: np.ndarray, cx: int, cy: int, radius: int, *, value: int) -> None:
    y_min = max(0, cy - radius)
    y_max = min(image.shape[0], cy + radius + 1)
    x_min = max(0, cx - radius)
    x_max = min(image.shape[1], cx + radius + 1)
    yy, xx = np.ogrid[y_min:y_max, x_min:x_max]
    mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= radius**2
    image[y_min:y_max, x_min:x_max][mask] = value


def _timestamp_ms() -> int:
    return now_ms()


__all__ = ["SimulatedCameraSource", "development_fake_hardware_requested"]
