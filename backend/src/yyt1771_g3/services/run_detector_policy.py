from __future__ import annotations

from typing import Any

from yyt1771_g3.core.models import DetectionResult, MeasurementDefinition


def measurement_for_detector_mode(
    measurement: MeasurementDefinition,
    mode: str,
) -> MeasurementDefinition:
    return measurement.model_copy(
        update={
            "detector_config": measurement.detector_config.model_copy(
                update={"detector_execution_mode": mode}
            ),
        }
    )


def initial_run_diagnostics_enabled(measurement: MeasurementDefinition) -> bool:
    config = measurement.detector_config
    if config.run_detector_mode == "diagnostics":
        return True
    return bool(config.run_detector_mode == "enhanced" and config.run_diagnostics_mode == "every_frame")


def should_rerun_with_enhanced(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> bool:
    config = measurement.detector_config
    if config.run_detector_mode == "diagnostics":
        return False
    if config.run_diagnostics_mode == "every_frame" and detection.debug_artifacts.get("diagnostics_generated") is not True:
        return True
    return bool(config.run_enhanced_detector_on_suspicious and detection_suspicious_reasons(detection, measurement))


def enhanced_rerun_diagnostics_enabled(measurement: MeasurementDefinition) -> bool:
    return measurement.detector_config.run_diagnostics_mode in {"suspicious_only", "every_frame"}


def annotate_run_detection(
    detection: DetectionResult,
    *,
    suspicious_reasons: list[str],
    enhanced_rerun_used: bool,
) -> DetectionResult:
    payload = detection.model_dump()
    debug = dict(payload.get("debug_artifacts", {}))
    debug.update(
        {
            "suspicious": bool(suspicious_reasons),
            "suspicious_reasons": list(suspicious_reasons),
            "enhanced_rerun_used": bool(enhanced_rerun_used),
            "diagnostics_generated": bool(debug.get("diagnostics_generated", False)),
        }
    )
    payload["debug_artifacts"] = debug
    return DetectionResult.model_validate(payload)


def detection_suspicious_reasons(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> list[str]:
    config = measurement.detector_config
    reasons: list[str] = []
    if detection.detection_status.value != "VALID":
        reasons.append("status_not_ok")
    debug = detection.debug_artifacts
    if bool(debug.get("distance_jump_guard_triggered")):
        reasons.append("distance_jump_guard_triggered")
    if bool(debug.get("fallback_used")):
        reasons.append("fallback_used")

    jump = detection.quality.jump_from_previous_px
    if jump is not None and float(jump) > float(config.endpoint_jump_limit_px):
        reasons.append("endpoint_jump_px_above_limit")

    outlier_count = int(debug.get("rejected_outlier_rows_count", 0) or 0)
    if outlier_count >= int(config.suspicious_outlier_reject_count):
        reasons.append("outlier_rows_rejected")

    measurement_rows = max(1, int(debug.get("mesh_measurement_row_count", 0) or 0))
    boundary_rejects = int(debug.get("boundary_support_rejected_count", 0) or 0)
    boundary_reject_ratio = boundary_rejects / float(measurement_rows + boundary_rejects)
    enough_supported_rows = measurement_rows >= max(5, int(config.envelope_min_consensus_rows) * 2)
    if boundary_reject_ratio >= float(config.suspicious_boundary_reject_ratio) and (
        not enough_supported_rows or detection.quality.confidence < 0.75
    ):
        reasons.append("boundary_support_reject_ratio_high")

    selected_width = _number(debug, "selected_measurement_row_width_px")
    robust_width = _number(debug, "robust_width_percentile_px")
    epsilon = max(0.0, float(config.envelope_width_outlier_epsilon_px))
    if selected_width is not None and robust_width is not None and selected_width >= robust_width + epsilon * 0.8:
        reasons.append("selected_width_near_outlier_threshold")

    if bool(debug.get("contour_touches_roi_edge")):
        reasons.append("contour_touches_roi_edge")

    if detection.quality.confidence < float(config.min_confidence):
        reasons.append("confidence_low")

    candidate = detection.selected_candidate
    if candidate is not None:
        guard = max(0.0, float(config.roi_edge_guard_px))
        local_min = _number(candidate.metadata, "local_min_along_px")
        local_max = _number(candidate.metadata, "local_max_along_px")
        if local_min is not None and local_min <= guard:
            reasons.append("endpoint_near_roi_edge")
        if local_max is not None and local_max >= float(measurement.roi.width) - guard:
            reasons.append("endpoint_near_roi_edge")

    if int(debug.get("endpoint_guard_rejected_rows_count", 0) or 0) > 0:
        reasons.append("endpoint_near_bubble_candidate_zone")
    source = debug.get("bubble_candidate_source")
    if isinstance(source, str) and "bubble" in source:
        reasons.append("bubble_guard_involved")

    return _unique(reasons)


def is_detection_suspicious(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> bool:
    return bool(detection_suspicious_reasons(detection, measurement))


def _number(container: dict[str, Any], key: str) -> float | None:
    value = container.get(key)
    return float(value) if isinstance(value, (int, float)) else None


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique
