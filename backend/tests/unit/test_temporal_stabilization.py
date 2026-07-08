from __future__ import annotations

import numpy as np

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, TemperatureSyncStatus, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    DetectorConfig,
    MeasurementDefinition,
    RotatedROI,
)
from yyt1771_g3.vision.temporal_stabilization import stabilize_detection_sequence


def _mask(with_spur: bool = False) -> np.ndarray:
    mask = np.zeros((50, 90), dtype=bool)
    mask[20:31, 20:41] = True
    if with_spur:
        mask[22:25, 72:75] = True
    return mask


def _detection(frame_index: int, mask: np.ndarray, distance: float) -> DetectionResult:
    candidate = DetectionCandidate(
        candidate_id=f"raw-{frame_index}",
        axis_position_px=25.0,
        width_px=distance,
        a=ABPoint(x=20.0, y=25.0),
        b=ABPoint(x=20.0 + distance, y=25.0),
        confidence=0.9,
    )
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=distance,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
        frame_timestamp_ms=frame_index * 100,
        temperature_timestamp_ms=frame_index * 100,
        temperature_celsius=20.0 + frame_index,
        temperature_delta_ms=0.0,
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
        debug_artifacts={
            "_raw_mask_array": mask,
            "detector_execution_mode": "fast",
        },
    )


def test_centered_temporal_stabilization_preserves_raw_and_recomputes_stabilized_distance() -> None:
    measurement = MeasurementDefinition(
        measurement_id="temporal-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=45.0, center_y=25.0, width=90.0, height=50.0),
        detector_config=DetectorConfig(
            temporal_stabilization_enabled=True,
            temporal_stabilization_strength="medium",
            contour_close_kernel=1,
            contour_close_kernel_px=1,
            contour_smooth_window=1,
            min_window_pixels=1,
            envelope_window_px=3,
            envelope_step_px=1,
            mesh_row_count_keep_ratio=0.1,
            mesh_row_width_keep_ratio=0.1,
        ),
    )
    results = [
        _detection(1, _mask(), 20.0),
        _detection(2, _mask(with_spur=True), 54.0),
        _detection(3, _mask(), 20.0),
    ]

    stabilized = stabilize_detection_sequence(results, measurement, filter_mode="centered")

    middle = stabilized[1]
    assert middle.raw_distance_px == 54.0
    assert middle.stabilized_distance_px is not None
    assert middle.stabilized_distance_px < 30.0
    assert middle.distance_px == middle.stabilized_distance_px
    assert middle.result_display_source == "stabilized"
    assert middle.debug_artifacts["temporal_filter_mode"] == "centered"
    assert middle.debug_artifacts["temporal_neighbor_count"] == 2
    assert middle.debug_artifacts["temporal_removed_mask_pixel_count"] > 0
    assert "_raw_mask_array" not in middle.debug_artifacts


def test_c_temporal_stabilization_default_mode_uses_legacy_wire_candidate() -> None:
    measurement = MeasurementDefinition(
        measurement_id="temporal-c-default-test",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=45.0, center_y=25.0, width=90.0, height=50.0),
        detector_config=DetectorConfig(
            temporal_stabilization_enabled=True,
            temporal_stabilization_strength="medium",
            contour_close_kernel=1,
            contour_close_kernel_px=1,
            min_window_pixels=1,
            wire_min_component_area_px=1,
            wire_min_length_px=3.0,
            wire_min_elongation=1.2,
            wire_box_padding_px=0.0,
        ),
    )
    results = [
        _detection(1, _mask(), 20.0),
        _detection(2, _mask(with_spur=True), 54.0),
        _detection(3, _mask(), 20.0),
    ]

    stabilized = stabilize_detection_sequence(results, measurement, filter_mode="centered")

    middle = stabilized[1]
    assert middle.raw_distance_px == 54.0
    assert middle.stabilized_distance_px is not None
    assert middle.selected_candidate is not None
    assert middle.selected_candidate.candidate_id == "archived-wire-bundle-projection"
    assert middle.debug_artifacts["temporal_stabilization_applied"] is True


def test_c_temporal_stabilization_contrast_mode_uses_contrast_widest_span_candidate() -> None:
    measurement = MeasurementDefinition(
        measurement_id="temporal-c-contrast-test",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        detector_mode="contrast_widest_span",
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=45.0, center_y=25.0, width=90.0, height=50.0),
        detector_config=DetectorConfig(
            temporal_stabilization_enabled=True,
            temporal_stabilization_strength="medium",
            contour_close_kernel=1,
            contour_close_kernel_px=1,
            min_window_pixels=1,
        ),
    )
    results = [
        _detection(1, _mask(), 20.0),
        _detection(2, _mask(with_spur=True), 54.0),
        _detection(3, _mask(), 20.0),
    ]

    stabilized = stabilize_detection_sequence(results, measurement, filter_mode="centered")

    middle = stabilized[1]
    assert middle.raw_distance_px == 54.0
    assert middle.stabilized_distance_px is not None
    assert middle.stabilized_distance_px < 30.0
    assert middle.selected_candidate is not None
    assert middle.selected_candidate.candidate_id.startswith("contrast-widest-span-v-")
    assert middle.debug_artifacts["temporal_stabilization_applied"] is True
