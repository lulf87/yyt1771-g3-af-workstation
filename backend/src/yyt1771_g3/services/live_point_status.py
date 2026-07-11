from __future__ import annotations

from typing import Any

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus, TemperatureSyncStatus
from yyt1771_g3.core.models import CurvePoint, DetectionResult

FORMAL_TEMPERATURE_STATUSES = {
    TemperatureSyncStatus.TEMP_SYNC_OK,
    TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED,
}


def build_live_point_status(
    detection: DetectionResult,
    curve_points: dict[str, CurvePoint | None],
    *,
    temperature_distance_point_count: int,
) -> dict[str, Any]:
    present = curve_points.get("temperature_distance") is not None
    return {
        "region_id": detection.region_id,
        "region_index": detection.region_index,
        "region_label": detection.region_label,
        "temperature_distance_present": present,
        "temperature_distance_point_count": temperature_distance_point_count,
        "reason_if_missing": "" if present else _reason_if_temperature_distance_missing(detection),
        "detection_status": detection.detection_status.value,
        "curve_point_status": detection.curve_point_status.value,
        "temperature_sync_status": detection.temperature_sync_status.value,
        "distance_outlier_filtered": bool(detection.distance_outlier_filtered),
    }


def _reason_if_temperature_distance_missing(detection: DetectionResult) -> str:
    if detection.detection_status != DetectionStatus.VALID:
        return "detection_invalid"
    if detection.distance_outlier_filtered or detection.curve_point_status == CurvePointStatus.DISTANCE_JUMP_OUTLIER:
        return "distance_outlier_filtered"
    if detection.curve_point_status != CurvePointStatus.VALID:
        return "curve_point_status_not_valid"
    if detection.distance_px is None:
        return "missing_distance"
    if detection.temperature_celsius is None:
        return "missing_temperature"
    if detection.temperature_sync_status not in FORMAL_TEMPERATURE_STATUSES:
        return "temperature_sync_not_formal"
    return "unknown"
