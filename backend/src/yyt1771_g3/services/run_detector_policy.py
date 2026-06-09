from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from yyt1771_g3.core.models import DetectionResult, MeasurementDefinition


@dataclass(frozen=True)
class RunDetectorPolicyState:
    processed_frames: int = 0
    endpoint_jump_streak: int = 0


@dataclass(frozen=True)
class DetectionSuspicionAnalysis:
    suspicious_reasons: list[str]
    warning_only_reasons: list[str]
    rerun_worthy_reasons: list[str]

    @property
    def suspicious(self) -> bool:
        return bool(self.suspicious_reasons)


@dataclass(frozen=True)
class DetectionSuspicionEvaluation:
    analysis: DetectionSuspicionAnalysis
    next_state: RunDetectorPolicyState


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
    *,
    analysis: DetectionSuspicionAnalysis | None = None,
) -> bool:
    config = measurement.detector_config
    if config.run_detector_mode in {"enhanced", "diagnostics"}:
        return False
    if not config.run_enhanced_detector_on_suspicious:
        return False
    policy = config.run_enhanced_detector_policy
    if policy == "never":
        return False
    analysis = analysis or analyze_detection_suspicion(detection, measurement).analysis
    if policy == "all_suspicious":
        return analysis.suspicious
    return bool(analysis.rerun_worthy_reasons)


def enhanced_rerun_diagnostics_enabled(measurement: MeasurementDefinition) -> bool:
    return measurement.detector_config.run_diagnostics_mode in {"suspicious_only", "every_frame"}


def annotate_run_detection(
    detection: DetectionResult,
    *,
    measurement: MeasurementDefinition,
    analysis: DetectionSuspicionAnalysis,
    enhanced_rerun_used: bool,
    enhanced_rerun_reason: list[str] | None = None,
) -> DetectionResult:
    config = measurement.detector_config
    payload = detection.model_dump()
    debug = dict(payload.get("debug_artifacts", {}))
    reason = enhanced_rerun_reason or []
    debug.update(
        {
            "suspicious": analysis.suspicious,
            "suspicious_reasons": list(analysis.suspicious_reasons),
            "warning_only_reasons": list(analysis.warning_only_reasons),
            "rerun_worthy_reasons": list(analysis.rerun_worthy_reasons),
            "enhanced_rerun_used": bool(enhanced_rerun_used),
            "enhanced_rerun_reason": list(reason),
            "diagnostics_generated": bool(debug.get("diagnostics_generated", False)),
            "run_detector_mode": config.run_detector_mode,
            "run_diagnostics_mode": config.run_diagnostics_mode,
            "run_enhanced_detector_policy": config.run_enhanced_detector_policy,
            "run_enhanced_detector_on_suspicious": bool(config.run_enhanced_detector_on_suspicious),
        }
    )
    debug.setdefault("detector_execution_mode", config.run_detector_mode)
    payload["debug_artifacts"] = debug
    return DetectionResult.model_validate(payload)


def enhanced_rerun_reasons(
    analysis: DetectionSuspicionAnalysis,
    measurement: MeasurementDefinition,
) -> list[str]:
    policy = measurement.detector_config.run_enhanced_detector_policy
    if policy == "all_suspicious":
        return list(analysis.suspicious_reasons)
    if policy == "rerun_worthy_only":
        return list(analysis.rerun_worthy_reasons)
    return []


def analyze_detection_suspicion(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
    state: RunDetectorPolicyState | None = None,
) -> DetectionSuspicionEvaluation:
    state = state or RunDetectorPolicyState()
    config = measurement.detector_config
    debug = detection.debug_artifacts
    warning_only_reasons: list[str] = []
    rerun_worthy_reasons: list[str] = []

    if detection.detection_status.value != "VALID":
        rerun_worthy_reasons.append("detection_status_not_ok")

    if bool(debug.get("distance_jump_guard_triggered")):
        rerun_worthy_reasons.append("distance_jump_guard_triggered")
    if bool(debug.get("fallback_used")):
        rerun_worthy_reasons.append("fallback_used")

    next_processed = state.processed_frames + 1
    endpoint_jump_streak = _endpoint_jump_streak(detection, measurement, state, next_processed)
    if _endpoint_jump_is_confirmed(endpoint_jump_streak, config):
        rerun_worthy_reasons.append("endpoint_jump_px_above_limit")

    outlier_count = int(debug.get("rejected_outlier_rows_count", 0) or 0)
    if outlier_count >= int(config.suspicious_outlier_reject_count):
        rerun_worthy_reasons.append("rejected_outlier_rows_count_high")

    measurement_rows = max(1, int(debug.get("mesh_measurement_row_count", 0) or 0))
    boundary_rejects = int(debug.get("boundary_support_rejected_count", 0) or 0)
    boundary_reject_ratio = boundary_rejects / float(measurement_rows + boundary_rejects)
    enough_supported_rows = measurement_rows >= max(5, int(config.envelope_min_consensus_rows) * 2)
    if boundary_reject_ratio >= float(config.suspicious_boundary_reject_ratio) and (
        not enough_supported_rows or detection.quality.confidence < 0.75
    ):
        rerun_worthy_reasons.append("boundary_support_rejected_ratio_high")

    selected_width = _number(debug, "selected_measurement_row_width_px")
    robust_width = _number(debug, "robust_width_percentile_px")
    epsilon = max(0.0, float(config.envelope_width_outlier_epsilon_px))
    if selected_width is not None and robust_width is not None and selected_width >= robust_width + epsilon * 0.8:
        rerun_worthy_reasons.append("width_outlier_without_consensus")

    if bool(debug.get("contour_touches_roi_edge")):
        warning_only_reasons.append("contour_touches_roi_edge")
    if bool(debug.get("roi_edge_warning")):
        warning_only_reasons.append("roi_edge_warning")
    if bool(debug.get("contour_near_roi_edge")):
        warning_only_reasons.append("contour_near_roi_edge")
    if bool(debug.get("low_coverage_warning")):
        warning_only_reasons.append("low_coverage_warning")

    if detection.detection_status.value == "VALID" and detection.quality.confidence < float(config.min_confidence):
        rerun_worthy_reasons.append("confidence_low")

    candidate = detection.selected_candidate
    if candidate is not None and _candidate_near_roi_edge(candidate.metadata, measurement):
        warning_only_reasons.append("contour_near_roi_edge")

    endpoint_reject_count = int(debug.get("endpoint_guard_rejected_rows_count", 0) or 0)
    endpoint_reject_reason = str(debug.get("endpoint_guard_reject_reason", "") or "")
    if endpoint_reject_count > 0 and ("BUBBLE" in endpoint_reject_reason or not endpoint_reject_reason):
        rerun_worthy_reasons.append("endpoint_in_bubble_zone")
    source = debug.get("bubble_candidate_source")
    if isinstance(source, str) and "bubble" in source:
        rerun_worthy_reasons.append("bubble_candidate_overlap")

    warning_only_reasons = _unique(warning_only_reasons)
    rerun_worthy_reasons = _unique(rerun_worthy_reasons)
    return DetectionSuspicionEvaluation(
        analysis=DetectionSuspicionAnalysis(
            suspicious_reasons=_unique(warning_only_reasons + rerun_worthy_reasons),
            warning_only_reasons=warning_only_reasons,
            rerun_worthy_reasons=rerun_worthy_reasons,
        ),
        next_state=RunDetectorPolicyState(
            processed_frames=next_processed,
            endpoint_jump_streak=endpoint_jump_streak,
        ),
    )


def detection_suspicious_reasons(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> list[str]:
    return analyze_detection_suspicion(detection, measurement).analysis.suspicious_reasons


def is_detection_suspicious(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> bool:
    return bool(detection_suspicious_reasons(detection, measurement))


def _endpoint_jump_streak(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
    state: RunDetectorPolicyState,
    next_processed: int,
) -> int:
    jump = detection.quality.jump_from_previous_px
    if jump is None or float(jump) <= float(measurement.detector_config.endpoint_jump_limit_px):
        return 0
    if next_processed <= int(measurement.detector_config.endpoint_jump_warmup_frames):
        return 0
    return state.endpoint_jump_streak + 1


def _endpoint_jump_is_confirmed(endpoint_jump_streak: int, config: Any) -> bool:
    return endpoint_jump_streak >= int(config.endpoint_jump_confirm_frames)


def _candidate_near_roi_edge(
    metadata: dict[str, Any],
    measurement: MeasurementDefinition,
) -> bool:
    guard = max(0.0, float(measurement.detector_config.roi_edge_guard_px))
    local_min = _number(metadata, "local_min_along_px")
    local_max = _number(metadata, "local_max_along_px")
    return bool(
        (local_min is not None and local_min <= guard)
        or (local_max is not None and local_max >= float(measurement.roi.width) - guard)
    )


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
