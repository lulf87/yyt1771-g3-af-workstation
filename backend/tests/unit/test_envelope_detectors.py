from __future__ import annotations

import numpy as np
import pytest

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI
from yyt1771_g3.vision.detectors import _mesh_envelope_candidate, detect_frame, detect_frame_with_state


def _measurement(
    *,
    object_class: ObjectClass = ObjectClass.A_BALLOON_ENVELOPE,
    detector: DetectorType = DetectorType.BALLOON_ENVELOPE,
    width: float = 100.0,
    height: float = 70.0,
) -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id="synthetic",
        object_class=object_class,
        detector=detector,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=40.0, width=width, height=height, angle_deg=0.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            mask_open_kernel_px=1,
            mask_close_kernel_px=9,
            mask_dilate_kernel_px=1,
            min_window_pixels=6,
            window_width_keep_ratio=0.1,
            envelope_quantile=0.0,
        ),
    )


def test_balloon_detector_uses_archived_mesh_row_envelope_across_internal_holes() -> None:
    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[20:61, 25:96] = 35
    frame[30:39, 40:52] = 245
    frame[42:52, 66:80] = 245

    result = detect_frame(frame, _measurement(), frame_index=1)

    assert result.detection_status == DetectionStatus.VALID
    assert result.distance_px == pytest.approx(70.0, abs=3.0)
    assert result.ab_points is not None
    assert result.ab_points.a.x == pytest.approx(25.0, abs=3.0)
    assert result.ab_points.b.x == pytest.approx(95.0, abs=3.0)
    assert result.debug_artifacts["contour_measurement_mode"] == "archived_mesh_envelope_rows"
    assert result.debug_artifacts["contour_theta_deg"] == pytest.approx(0.0)
    assert result.debug_artifacts["contour_length_px"] == pytest.approx(result.distance_px)
    assert len(result.debug_artifacts["contour_projection_box"]) == 4
    assert len(result.debug_artifacts["contour_direction_arrow"]) == 2
    assert result.debug_artifacts["mesh_envelope_row_count"] > 0
    assert result.debug_artifacts["mesh_left_px"] == pytest.approx(25.0, abs=3.0)
    assert result.debug_artifacts["mesh_right_px"] == pytest.approx(95.0, abs=3.0)


def test_bundle_detector_measures_multi_strand_group_not_single_strand_width() -> None:
    frame = np.full((80, 120), 245, dtype=np.uint8)
    for y in [22, 31, 40, 49, 58]:
        frame[y : y + 2, 28:94] = 20

    result = detect_frame(
        frame,
        _measurement(object_class=ObjectClass.C_BUNDLE_ENVELOPE, detector=DetectorType.BUNDLE_ENVELOPE),
        frame_index=1,
    )

    assert result.detection_status == DetectionStatus.VALID
    assert result.distance_px == pytest.approx(65.0, abs=5.0)
    assert result.distance_px is not None and result.distance_px > 50.0
    assert result.debug_artifacts["contour_measurement_mode"] == "archived_wire_bundle_projection"
    assert result.debug_artifacts["wire_point_count"] > 0
    assert result.debug_artifacts["wire_raw_length_px"] == pytest.approx(result.distance_px)
    assert len(result.debug_artifacts["contour_projection_box"]) == 4
    assert len(result.debug_artifacts["contour_direction_arrow"]) == 2


def test_setup_and_run_entrypoints_use_same_archived_detector_mode() -> None:
    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[20:61, 25:96] = 35
    frame[30:39, 40:52] = 245
    measurement = _measurement()

    setup_result = detect_frame(frame, measurement, frame_index=1)
    run_result, _ = detect_frame_with_state(frame, measurement, frame_index=1)

    assert setup_result.detection_status == DetectionStatus.VALID
    assert run_result.detection_status == DetectionStatus.VALID
    assert setup_result.debug_artifacts["contour_measurement_mode"] == "archived_mesh_envelope_rows"
    assert run_result.debug_artifacts["contour_measurement_mode"] == "archived_mesh_envelope_rows"


def test_external_speck_does_not_expand_formal_width() -> None:
    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[30:51, 30:91] = 30
    frame[4:8, 86:90] = 10

    result = detect_frame(frame, _measurement(), frame_index=1)

    assert result.detection_status == DetectionStatus.VALID
    assert result.distance_px == pytest.approx(60.0, abs=3.0)
    assert result.ab_points is not None
    assert result.ab_points.a.y > 20.0


def test_connected_bubble_spur_rows_are_rejected_before_mesh_endpoint_selection() -> None:
    mask = np.zeros((160, 220), dtype=bool)
    mask[45:126, 70:171] = True
    yy, xx = np.ogrid[:160, :220]
    bubble_center = (48, 96)
    radius = np.sqrt((xx - bubble_center[0]) ** 2 + (yy - bubble_center[1]) ** 2)
    mask[(radius >= 18) & (radius <= 25)] = True
    mask[90:103, 55:73] = True
    bubble_suppress_zone = radius <= 36

    candidate = _mesh_envelope_candidate(
        mask,
        RotatedROI(center_x=110.0, center_y=80.0, width=220.0, height=160.0, angle_deg=0.0),
        DetectorConfig(
            min_window_pixels=6,
            envelope_quantile=0.0,
            envelope_window_px=9,
            envelope_step_px=1,
            mesh_row_width_keep_ratio=0.1,
            mesh_row_count_keep_ratio=0.1,
            bubble_suppress_radius_px=10,
            endpoint_min_dark_line_response=0.0,
        ),
        endpoint_guard_zone=bubble_suppress_zone,
        ridge_response=np.zeros_like(mask, dtype=float),
    )

    assert candidate is not None
    debug = candidate.metadata["debug_artifacts"]
    assert candidate.width_px == pytest.approx(100.0, abs=1.0)
    assert debug["raw_width_px"] > candidate.width_px + 40.0
    assert debug["endpoint_guard_rejected_rows_count"] > 0
    assert debug["endpoint_guard_reject_reason"] == "ENDPOINT_OVERLAPS_BUBBLE_SUPPRESS_ZONE"
    assert debug["mesh_left_local_px"] == pytest.approx(70.0, abs=1.0)


def test_mesh_envelope_rejects_side_speck_row_window() -> None:
    mask = np.zeros((120, 150), dtype=bool)
    mask[30:91, 30:91] = True
    mask[54:61, 91:116] = True
    roi = RotatedROI(center_x=75.0, center_y=60.0, width=150.0, height=120.0, angle_deg=0.0)

    candidate = _mesh_envelope_candidate(
        mask,
        roi,
        DetectorConfig(
            envelope_quantile=0.0,
            envelope_window_px=9,
            envelope_step_px=1,
            min_window_pixels=1,
            mesh_row_width_keep_ratio=0.1,
            mesh_row_count_keep_ratio=0.1,
        ),
    )

    assert candidate is not None
    assert candidate.width_px == pytest.approx(60.0, abs=1.0)
    debug = candidate.metadata["debug_artifacts"]
    assert debug["raw_width_px"] > candidate.width_px + 20.0
    assert debug["boundary_support_rejected_count"] > 0
    assert debug["rejected_outlier_rows_count"] >= 0


def test_mesh_envelope_reports_full_contour_box_separate_from_measurement_band() -> None:
    mask = np.zeros((120, 150), dtype=bool)
    mask[20:71, 35:96] = True
    mask[82:111, 58:65] = True
    roi = RotatedROI(center_x=75.0, center_y=60.0, width=150.0, height=120.0, angle_deg=0.0)

    candidate = _mesh_envelope_candidate(
        mask,
        roi,
        DetectorConfig(
            envelope_quantile=0.0,
            envelope_window_px=9,
            envelope_step_px=1,
            min_window_pixels=1,
            mesh_row_width_keep_ratio=0.1,
            mesh_row_count_keep_ratio=0.1,
            contour_box_padding_px=0.0,
        ),
    )

    assert candidate is not None
    debug = candidate.metadata["debug_artifacts"]
    full_box = candidate.metadata["contour_projection_box"]
    band_box = candidate.metadata["contour_measurement_band_box"]
    assert candidate.width_px == pytest.approx(60.0, abs=1.0)
    assert debug["contour_full_box"] == full_box
    assert debug["contour_measurement_band_box"] == band_box
    assert debug["contour_box_coverage_ratio"] >= 0.995
    assert max(point["y"] for point in full_box) >= 110.0
    assert max(point["y"] for point in band_box) < 80.0


def test_mesh_envelope_candidate_uses_one_row_for_formal_ab() -> None:
    mask = np.zeros((120, 140), dtype=bool)
    mask[12:32, 30:91] = True
    mask[82:102, 20:81] = True
    roi = RotatedROI(center_x=70.0, center_y=60.0, width=140.0, height=120.0, angle_deg=0.0)

    candidate = _mesh_envelope_candidate(
        mask,
        roi,
        DetectorConfig(
            envelope_quantile=0.0,
            min_window_pixels=1,
            mesh_row_width_keep_ratio=0.1,
            mesh_row_count_keep_ratio=0.1,
        ),
    )

    assert candidate is not None
    assert candidate.width_px == pytest.approx(60.0, abs=1.0)
    left = candidate.metadata["debug_artifacts"]["mesh_left_local_px"]
    right = candidate.metadata["debug_artifacts"]["mesh_right_local_px"]
    assert (left == pytest.approx(20.0, abs=1.0) and right == pytest.approx(80.0, abs=1.0)) or (
        left == pytest.approx(30.0, abs=1.0) and right == pytest.approx(90.0, abs=1.0)
    )


def test_empty_roi_returns_invalid_without_formal_ab() -> None:
    frame = np.full((80, 120), 245, dtype=np.uint8)

    result = detect_frame(frame, _measurement(), frame_index=1)

    assert result.detection_status == DetectionStatus.INVALID_NO_TARGET
    assert result.ab_points is None
    assert result.distance_px is None
    assert result.rejected_reason == "NO_TARGET"
