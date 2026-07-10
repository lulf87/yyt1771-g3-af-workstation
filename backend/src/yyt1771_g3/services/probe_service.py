from __future__ import annotations

import base64
from typing import Any

import numpy as np

from yyt1771_g3.core.image_io import array_to_png_bytes
from yyt1771_g3.core.models import CurvePoint, DetectionResult, MeasurementDefinition
from yyt1771_g3.services.offline_dataset import OfflineDatasetRegistry
from yyt1771_g3.services.region_detection_service import RegionFrameResult, detect_regions_for_frame
from yyt1771_g3.services.source_provenance import offline_dataset_provenance
from yyt1771_g3.temperature.sync import sync_temperature_for_frame


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
    region_results, _ = detect_regions_for_frame(
        frame.array,
        measurement,
        frame_index=frame_index,
        detection_transform=lambda detection: _attach_temperature(detection, frame_timestamp_ms, synced),
    )
    first = region_results[0]
    return {
        "dataset_id": dataset_id,
        "frame": {
            "frame_index": frame.frame_index,
            "shape": list(frame.array.shape),
            "dtype": str(frame.array.dtype),
            "timestamp_ms": frame_timestamp_ms,
        },
        "measurement_definition": measurement.model_dump(mode="json"),
        "detection_result": first.detection.model_dump(mode="json"),
        "region_results": [_region_result_payload(item) for item in region_results],
        "overlay": _region_overlay_payload(first),
        "region_overlays": [_region_overlay_payload(item) for item in region_results],
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
    region_results, _ = detect_regions_for_frame(
        frame_array,
        measurement,
        frame_index=frame_index,
        detection_transform=lambda detection: _attach_frame_timestamp(detection, frame_timestamp_ms),
    )
    first = region_results[0]
    return {
        "dataset_id": dataset_id,
        "frame": {
            "frame_index": frame_index,
            "shape": list(frame_array.shape),
            "dtype": str(frame_array.dtype),
            "timestamp_ms": frame_timestamp_ms,
        },
        "measurement_definition": measurement.model_dump(mode="json"),
        "detection_result": first.detection.model_dump(mode="json"),
        "region_results": [_region_result_payload(item) for item in region_results],
        "overlay": _region_overlay_payload(first),
        "region_overlays": [_region_overlay_payload(item) for item in region_results],
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


def _region_result_payload(item: RegionFrameResult) -> dict[str, Any]:
    return {
        "region_id": item.region.region_id,
        "region_index": item.region.index,
        "region_label": item.region.label,
        "color": item.region.color,
        "detection_result": item.detection.model_dump(mode="json"),
        "curve_points": {
            key: _curve_point_payload(point)
            for key, point in item.curve_points.items()
        },
        "live_point_status": item.live_point_status,
    }


def _region_overlay_payload(item: RegionFrameResult) -> dict[str, Any]:
    detection = item.detection
    return {
        "region_id": item.region.region_id,
        "region_index": item.region.index,
        "region_label": item.region.label,
        "color": item.region.color,
        "roi": item.region.roi.model_dump(mode="json"),
        "ab_points": detection.ab_points.model_dump(mode="json")
        if detection.ab_points is not None
        else None,
        "measurement_segment": [point.model_dump(mode="json") for point in detection.measurement_segment]
        if detection.measurement_segment is not None
        else None,
        "status": detection.detection_status.value,
    }


def _curve_point_payload(point: CurvePoint | None) -> dict[str, Any] | None:
    return point.model_dump(mode="json") if point is not None else None


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
