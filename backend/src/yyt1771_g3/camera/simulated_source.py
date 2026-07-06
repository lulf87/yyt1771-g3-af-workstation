from __future__ import annotations

from typing import Any

import numpy as np

from yyt1771_g3.camera.base import CameraFrame, CameraUnavailableError
from yyt1771_g3.core.timebase import now_ms


class SimulatedCameraSource:
    """Deterministic software camera for local setup and run verification."""

    def __init__(self, profile: dict[str, Any] | None = None) -> None:
        self.profile = profile or {}
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

    def preview_frame(self) -> CameraFrame:
        if self._dataset_id:
            return self._dataset_frame()
        self._frame_id += 1
        array = _synthetic_frame(self.profile, self._frame_id)
        return CameraFrame(
            array=array,
            timestamp_ms=_timestamp_ms(),
            camera_meta={
                "backend": "simulated",
                "model": "G3 simulated camera",
                "serial_number": "SIM-G3",
                "ip": "",
                "pixel_format": str(self.profile.get("pixel_format", "mono8") or "mono8"),
                "frame_id": self._frame_id,
                "target_frame_rate_hz": self.profile.get("target_frame_rate_hz"),
                "device_roi": _device_roi(self.profile),
            },
        )

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


__all__ = ["SimulatedCameraSource"]
