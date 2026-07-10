from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
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
from yyt1771_g3.services.distance_outlier_filter import CausalDistanceOutlierFilter
from yyt1771_g3.services.live_point_status import build_live_point_status
from yyt1771_g3.services.run_detector_policy import RunDetectorPolicyState
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState
from yyt1771_g3.vision.temporal_stabilization import CausalTemporalStabilizer


DetectionTransform = Callable[[DetectionResult], DetectionResult]


@dataclass
class RegionRuntimeState:
    candidate_states: dict[str, CandidateSelectionState] = field(default_factory=dict)
    policy_states: dict[str, RunDetectorPolicyState] = field(default_factory=dict)
    temporal_stabilizers: dict[str, CausalTemporalStabilizer] = field(default_factory=dict)
    outlier_filters: dict[str, CausalDistanceOutlierFilter] = field(default_factory=dict)
    temperature_distance_points: dict[str, list[CurvePoint]] = field(default_factory=dict)


@dataclass(frozen=True)
class RegionFrameResult:
    region: MeasurementRegion
    detection: DetectionResult
    curve_points: dict[str, CurvePoint | None]
    live_point_status: dict[str, Any]


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


def create_region_runtime_state(measurement: MeasurementDefinition) -> RegionRuntimeState:
    state = RegionRuntimeState()
    for region in measurement.enabled_regions:
        region_measurement = measurement_for_region(measurement, region)
        state.candidate_states[region.region_id] = CandidateSelectionState()
        state.policy_states[region.region_id] = RunDetectorPolicyState()
        state.temporal_stabilizers[region.region_id] = CausalTemporalStabilizer(region_measurement)
        state.outlier_filters[region.region_id] = CausalDistanceOutlierFilter(measurement.detector_config)
        state.temperature_distance_points[region.region_id] = []
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
            )
        )
    return results, state


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
