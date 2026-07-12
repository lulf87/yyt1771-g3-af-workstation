from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Any

import numpy as np

from yyt1771_g3.core.enums import DetectionStatus
from yyt1771_g3.core.models import (
    CurvePoint,
    DetectionResult,
    MeasurementDefinition,
    MeasurementRegion,
)
from yyt1771_g3.services.analysis_service import curve_points_for_detection
from yyt1771_g3.services.afas_analysis import (
    DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
    canonical_temperature_bin_key,
    upsert_grouped_temperature_point,
)
from yyt1771_g3.services.distance_outlier_filter import CausalDistanceOutlierFilter
from yyt1771_g3.services.live_point_status import build_live_point_status
from yyt1771_g3.services.run_detector_policy import (
    RunDetectorPolicyState,
    analyze_detection_suspicion,
    annotate_run_detection,
    enhanced_rerun_diagnostics_enabled,
    enhanced_rerun_reasons,
    initial_run_diagnostics_enabled,
    measurement_for_detector_mode,
    should_rerun_with_enhanced,
)
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState
from yyt1771_g3.vision.temporal_stabilization import CausalTemporalStabilizer


DetectionTransform = Callable[[DetectionResult], DetectionResult]
RunDetector = Callable[..., tuple[DetectionResult, CandidateSelectionState]]


@dataclass
class RegionRuntimeState:
    candidate_states: dict[str, CandidateSelectionState] = field(default_factory=dict)
    policy_states: dict[str, RunDetectorPolicyState] = field(default_factory=dict)
    temporal_stabilizers: dict[str, CausalTemporalStabilizer] = field(default_factory=dict)
    outlier_filters: dict[str, CausalDistanceOutlierFilter] = field(default_factory=dict)
    temperature_distance_points: dict[str, list[CurvePoint]] = field(default_factory=dict)
    grouped_temperature_points: dict[str, dict[int, dict[str, Any]]] = field(default_factory=dict)


@dataclass(frozen=True)
class RegionFrameResult:
    region: MeasurementRegion
    detection: DetectionResult
    curve_points: dict[str, CurvePoint | None]
    live_point_status: dict[str, Any]
    grouped_temperature_point_update: dict[str, Any] | None = None


def region_frame_result_payload(
    item: RegionFrameResult,
    *,
    afas_preprocessing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "region_id": item.region.region_id,
        "region_index": item.region.index,
        "region_label": item.region.label,
        "color": item.region.color,
        "detection_result": item.detection.model_dump(mode="json"),
        "curve_points": {
            key: point.model_dump(mode="json") if point is not None else None
            for key, point in item.curve_points.items()
        },
        "live_point_status": dict(item.live_point_status),
        "grouped_temperature_point_update": item.grouped_temperature_point_update,
    }
    if afas_preprocessing is not None:
        payload["afas_preprocessing"] = afas_preprocessing
    return payload


def measurement_for_region(
    measurement: MeasurementDefinition,
    region: MeasurementRegion,
) -> MeasurementDefinition:
    return measurement.model_copy(
        update={
            "roi": region.roi,
            "regions": [region],
        }
    )


def create_region_runtime_state(
    measurement: MeasurementDefinition,
    *,
    temporal_artifact_root: Path | None = None,
) -> RegionRuntimeState:
    state = RegionRuntimeState()
    for region in measurement.enabled_regions:
        region_measurement = measurement_for_region(measurement, region)
        state.candidate_states[region.region_id] = CandidateSelectionState()
        state.policy_states[region.region_id] = RunDetectorPolicyState()
        state.temporal_stabilizers[region.region_id] = CausalTemporalStabilizer(
            region_measurement,
            artifact_dir=_region_artifact_dir(temporal_artifact_root, region.region_id),
        )
        state.outlier_filters[region.region_id] = CausalDistanceOutlierFilter(measurement.detector_config)
        state.temperature_distance_points[region.region_id] = []
        state.grouped_temperature_points[region.region_id] = {}
    return state


def detect_regions_for_frame(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    runtime_state: RegionRuntimeState | None = None,
    detection_transform: DetectionTransform | None = None,
    generate_diagnostics: bool = True,
    detector_execution_mode: str | None = None,
    show_advanced_diagnostics: bool | None = None,
    collect_temporal_artifacts: bool = False,
) -> tuple[list[RegionFrameResult], RegionRuntimeState]:
    state = runtime_state or create_region_runtime_state(measurement)
    results: list[RegionFrameResult] = []
    for region in measurement.enabled_regions:
        region_measurement = measurement_for_region(measurement, region)
        _ensure_region_state(state, region, region_measurement)
        try:
            detection, next_candidate_state = detect_frame_with_state(
                frame,
                region_measurement,
                frame_index=frame_index,
                stability_state=state.candidate_states[region.region_id],
                generate_diagnostics=generate_diagnostics,
                detector_execution_mode=detector_execution_mode,
                show_advanced_diagnostics=show_advanced_diagnostics,
                collect_temporal_artifacts=collect_temporal_artifacts,
            )
            state.candidate_states[region.region_id] = next_candidate_state
            detection = _attach_region_metadata(detection, region)
        except Exception as exc:  # pragma: no cover - direct failure path covered through service behavior
            detection = _region_error_detection(frame_index, region, exc)
        if detection_transform is not None:
            detection = detection_transform(detection)
        curve_points = curve_points_for_detection(detection)
        temperature_distance = curve_points.get("temperature_distance")
        if temperature_distance is not None:
            state.temperature_distance_points[region.region_id].append(temperature_distance)
        grouped_update = _update_temperature_bucket(state, region.region_id, temperature_distance)
        results.append(
            RegionFrameResult(
                region=region,
                detection=detection,
                curve_points=curve_points,
                live_point_status=build_live_point_status(
                    detection,
                    curve_points,
                    temperature_distance_point_count=len(state.temperature_distance_points[region.region_id]),
                ),
                grouped_temperature_point_update=grouped_update,
            )
        )
    return results, state


def detect_regions_for_run_frame(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    detector: RunDetector,
    runtime_state: RegionRuntimeState,
    detection_transform: DetectionTransform | None = None,
) -> tuple[list[RegionFrameResult], RegionRuntimeState]:
    results: list[RegionFrameResult] = []
    for region in measurement.enabled_regions:
        region_measurement = measurement_for_region(measurement, region)
        _ensure_region_state(runtime_state, region, region_measurement)
        previous_state = runtime_state.candidate_states[region.region_id]
        try:
            run_measurement = measurement_for_detector_mode(
                region_measurement,
                region_measurement.detector_config.run_detector_mode,
            )
            detection, next_candidate_state = detector(
                frame,
                run_measurement,
                frame_index=frame_index,
                stability_state=previous_state,
                generate_diagnostics=initial_run_diagnostics_enabled(region_measurement),
                collect_temporal_artifacts=region_measurement.detector_config.temporal_stabilization_enabled,
            )
            suspicion = analyze_detection_suspicion(
                detection,
                region_measurement,
                runtime_state.policy_states[region.region_id],
            )
            runtime_state.policy_states[region.region_id] = suspicion.next_state
            if should_rerun_with_enhanced(
                detection,
                region_measurement,
                analysis=suspicion.analysis,
            ):
                enhanced_measurement = measurement_for_detector_mode(region_measurement, "enhanced")
                detection, next_candidate_state = detector(
                    frame,
                    enhanced_measurement,
                    frame_index=frame_index,
                    stability_state=previous_state,
                    generate_diagnostics=enhanced_rerun_diagnostics_enabled(region_measurement),
                    collect_temporal_artifacts=region_measurement.detector_config.temporal_stabilization_enabled,
                )
                detection = annotate_run_detection(
                    detection,
                    measurement=region_measurement,
                    analysis=suspicion.analysis,
                    enhanced_rerun_used=True,
                    enhanced_rerun_reason=enhanced_rerun_reasons(suspicion.analysis, region_measurement),
                )
            else:
                detection = annotate_run_detection(
                    detection,
                    measurement=region_measurement,
                    analysis=suspicion.analysis,
                    enhanced_rerun_used=False,
                )
            runtime_state.candidate_states[region.region_id] = next_candidate_state
            detection = _attach_region_metadata(detection, region)
        except Exception as exc:  # pragma: no cover - exercised by region failure isolation tests
            detection = _region_error_detection(frame_index, region, exc)
        if detection_transform is not None:
            detection = detection_transform(detection)
        detection = runtime_state.temporal_stabilizers[region.region_id].apply(detection)
        detection = runtime_state.outlier_filters[region.region_id].apply(detection)
        curve_points = _curve_points_for_run_event(detection)
        temperature_distance = curve_points.get("temperature_distance")
        if temperature_distance is not None:
            runtime_state.temperature_distance_points[region.region_id].append(temperature_distance)
        grouped_update = _update_temperature_bucket(runtime_state, region.region_id, temperature_distance)
        results.append(
            RegionFrameResult(
                region=region,
                detection=detection,
                curve_points=curve_points,
                live_point_status=build_live_point_status(
                    detection,
                    curve_points,
                    temperature_distance_point_count=len(
                        runtime_state.temperature_distance_points[region.region_id]
                    ),
                ),
                grouped_temperature_point_update=grouped_update,
            )
        )
    return results, runtime_state


def _ensure_region_state(
    state: RegionRuntimeState,
    region: MeasurementRegion,
    measurement: MeasurementDefinition,
) -> None:
    state.candidate_states.setdefault(region.region_id, CandidateSelectionState())
    state.policy_states.setdefault(region.region_id, RunDetectorPolicyState())
    state.temporal_stabilizers.setdefault(region.region_id, CausalTemporalStabilizer(measurement))
    state.outlier_filters.setdefault(region.region_id, CausalDistanceOutlierFilter(measurement.detector_config))
    state.temperature_distance_points.setdefault(region.region_id, [])
    state.grouped_temperature_points.setdefault(region.region_id, {})


def _update_temperature_bucket(
    state: RegionRuntimeState,
    region_id: str,
    point: CurvePoint | None,
) -> dict[str, Any] | None:
    if point is None:
        return None
    key = canonical_temperature_bin_key(point.x, DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS)
    buckets = state.grouped_temperature_points.setdefault(region_id, {})
    updated = upsert_grouped_temperature_point(
        buckets.get(key), point, bin_celsius=DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
    )
    buckets[key] = updated
    return {**updated, "temperature_group_bin_celsius": DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS}


def _attach_region_metadata(
    detection: DetectionResult,
    region: MeasurementRegion,
) -> DetectionResult:
    payload = detection.model_dump()
    payload.update(
        {
            "region_id": region.region_id,
            "region_index": region.index,
            "region_label": region.label,
            "region_color": region.color,
        }
    )
    return DetectionResult.model_validate(payload)


def _region_error_detection(
    frame_index: int,
    region: MeasurementRegion,
    exc: Exception,
) -> DetectionResult:
    reason = f"region_detection_error:{exc.__class__.__name__}"
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.INVALID,
        region_id=region.region_id,
        region_index=region.index,
        region_label=region.label,
        region_color=region.color,
        rejected_reason=reason,
        curve_exclusion_reason=reason,
        debug_artifacts={"region_detection_error": str(exc)},
    )


def _curve_points_for_run_event(detection: DetectionResult) -> dict[str, CurvePoint | None]:
    display_points = curve_points_for_detection(detection)
    raw_points = curve_points_for_detection(detection, distance_source="raw")
    stabilized_points = curve_points_for_detection(detection, distance_source="stabilized")
    return {
        **display_points,
        "raw_distance_time": raw_points["distance_time"],
        "raw_temperature_distance": raw_points["temperature_distance"],
        "stabilized_distance_time": stabilized_points["distance_time"],
        "stabilized_temperature_distance": stabilized_points["temperature_distance"],
    }


def _region_artifact_dir(root: Path | None, region_id: str) -> Path | None:
    if root is None:
        return None
    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", region_id).strip("-._") or "region"
    return root / safe_id
