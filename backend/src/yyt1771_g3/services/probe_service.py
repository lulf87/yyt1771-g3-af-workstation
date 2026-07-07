from __future__ import annotations

import base64
from typing import Any

import numpy as np

from yyt1771_g3.core.image_io import array_to_png_bytes
from yyt1771_g3.core.models import DetectionResult, MeasurementDefinition
from yyt1771_g3.services.offline_dataset import OfflineDatasetRegistry
from yyt1771_g3.services.source_provenance import offline_dataset_provenance
from yyt1771_g3.temperature.sync import sync_temperature_for_frame
from yyt1771_g3.vision.detectors import detect_frame


def probe_offline_frame(
    registry: OfflineDatasetRegistry,
    dataset_id: str,
    frame_index: int,
    measurement: MeasurementDefinition,
) -> dict[str, Any]:
    frame = registry.load_frame(dataset_id, frame_index)
    manifest = registry.load_manifest(dataset_id)
    temperatures = registry.load_temperature_csv(dataset_id)
    frame_meta = _frame_meta(manifest, frame_index)
    frame_timestamp_ms = _int_or_none(frame_meta.get("timestamp_ms"))
    synced = sync_temperature_for_frame(frame_index, frame_timestamp_ms, temperatures)
    detection = detect_frame(frame.array, measurement, frame_index=frame_index)
    detection = _attach_temperature(detection, frame_timestamp_ms, synced)
    return {
        "dataset_id": dataset_id,
        "frame": {
            "frame_index": frame.frame_index,
            "shape": list(frame.array.shape),
            "dtype": str(frame.array.dtype),
            "timestamp_ms": frame_timestamp_ms,
        },
        "measurement_definition": measurement.model_dump(mode="json"),
        "detection_result": detection.model_dump(mode="json"),
        "overlay": {
            "roi": measurement.roi.model_dump(mode="json"),
            "ab_points": detection.ab_points.model_dump(mode="json")
            if detection.ab_points is not None
            else None,
            "status": detection.detection_status.value,
        },
        "image_data_url": _array_to_png_data_url(frame.array),
        "provenance": offline_dataset_provenance(dataset_id),
    }


def probe_setup_frame(
    *,
    dataset_id: str,
    frame_array: np.ndarray,
    measurement: MeasurementDefinition,
    frame_index: int = 1,
    frame_timestamp_ms: int | None = None,
    camera_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    detection = detect_frame(frame_array, measurement, frame_index=frame_index)
    detection = _attach_frame_timestamp(detection, frame_timestamp_ms)
    return {
        "dataset_id": dataset_id,
        "frame": {
            "frame_index": frame_index,
            "shape": list(frame_array.shape),
            "dtype": str(frame_array.dtype),
            "timestamp_ms": frame_timestamp_ms,
        },
        "measurement_definition": measurement.model_dump(mode="json"),
        "detection_result": detection.model_dump(mode="json"),
        "overlay": {
            "roi": measurement.roi.model_dump(mode="json"),
            "ab_points": detection.ab_points.model_dump(mode="json")
            if detection.ab_points is not None
            else None,
            "status": detection.detection_status.value,
        },
        "camera_meta": camera_meta or {},
    }


def _attach_temperature(detection: DetectionResult, frame_timestamp_ms: int | None, synced) -> DetectionResult:  # noqa: ANN001
    payload = detection.model_dump()
    payload.update(
        {
            "frame_timestamp_ms": frame_timestamp_ms,
            "temperature_timestamp_ms": synced.timestamp_ms,
            "temperature_celsius": synced.celsius,
            "temperature_delta_ms": synced.delta_ms,
            "temperature_source": synced.source,
            "temperature_sampled_this_frame": synced.sampled_this_frame,
            "temperature_sync_status": synced.status,
        }
    )
    return DetectionResult.model_validate(payload)


def _attach_frame_timestamp(detection: DetectionResult, frame_timestamp_ms: int | None) -> DetectionResult:
    payload = detection.model_dump()
    payload.update({"frame_timestamp_ms": frame_timestamp_ms})
    return DetectionResult.model_validate(payload)


def _frame_meta(manifest: dict[str, Any], frame_index: int) -> dict[str, Any]:
    frames = manifest.get("frames")
    if isinstance(frames, list):
        for frame in frames:
            if isinstance(frame, dict) and int(frame.get("index", -1)) == frame_index:
                return frame
    return {}


def _int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def _array_to_png_data_url(array: np.ndarray) -> str:
    return "data:image/png;base64," + base64.b64encode(array_to_png_bytes(array)).decode("ascii")
