from __future__ import annotations

import pytest

from yyt1771_g3.core.enums import DetectionStatus
from yyt1771_g3.core.enums import DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI
from yyt1771_g3.services.offline_dataset import OfflineDatasetError, load_dataset_registry
from yyt1771_g3.vision.detectors import detect_frame, detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState


@pytest.mark.parametrize(
    ("dataset_id", "object_class", "detector", "expected_mode"),
    [
        (
            "golden_a_20260522_dev_lab",
            ObjectClass.A_BALLOON_ENVELOPE,
            DetectorType.BALLOON_ENVELOPE,
            "archived_mesh_envelope_rows",
        ),
        (
            "golden_c_20260529_dev_lab",
            ObjectClass.C_BUNDLE_ENVELOPE,
            DetectorType.BUNDLE_ENVELOPE,
            "archived_wire_bundle_projection",
        ),
    ],
)
def test_golden_keyframes_return_valid_envelope_smoke(
    dataset_id: str,
    object_class: ObjectClass,
    detector: DetectorType,
    expected_mode: str,
) -> None:
    try:
        registry = load_dataset_registry()
        resolved = registry.resolve_dataset(dataset_id)
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    for frame_index in [1, resolved.frame_count]:
        frame = registry.load_frame(dataset_id, frame_index)
        height, width = frame.array.shape[:2]
        measurement = MeasurementDefinition(
            measurement_id=f"{dataset_id}-{frame_index}",
            object_class=object_class,
            detector=detector,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(
                center_x=width / 2,
                center_y=height / 2,
                width=width * 0.62,
                height=height * 0.28,
                angle_deg=0.0,
            ),
        )

        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status.value == "VALID"
        assert result.distance_px is not None
        assert 100.0 < result.distance_px < measurement.roi.width
        assert result.ab_points is not None
        assert result.selected_candidate is not None
        assert result.debug_artifacts["contour_measurement_mode"] == expected_mode


def test_golden_a_bubble_frames_do_not_use_cross_row_mesh_span() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0016-bubble-regression",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1179.71,
            center_y=680.43,
            width=1236.76,
            height=820.9,
            angle_deg=-16.27,
        ),
    )

    distances: list[float] = []
    for frame_index in [600, 660, 690, 730]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.debug_artifacts["mesh_selected_row_width_px"] == pytest.approx(result.distance_px)
        if frame_index == 690:
            assert result.debug_artifacts["mesh_global_span_px"] > result.distance_px + 30.0
        distances.append(result.distance_px)

    assert max(distances) - min(distances) <= 2.0


def test_golden_a_frame_680_bright_bubble_is_removed_from_clean_diagnostic_mask() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0056-frame-680-bubble-suppression",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1179.71,
            center_y=680.43,
            width=1236.76,
            height=820.9,
            angle_deg=-16.27,
        ),
        detector_config=DetectorConfig(
            mask_open_kernel_px=5,
            mask_close_kernel_px=3,
            hysteresis_low_ratio=0.55,
            bubble_suppress_enabled=True,
            bubble_bright_z_threshold=1.2,
            bubble_suppress_radius_px=10,
            bubble_min_area_px=20,
            bubble_max_area_px=800,
            bubble_max_aspect_ratio=2.5,
            dark_line_filter_enabled=True,
            endpoint_min_dark_line_response=0.0,
            spur_prune_enabled=True,
        ),
    )

    results = {}
    for frame_index in [680, 800]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        diagnostic_images = result.debug_artifacts["diagnostic_images"]
        assert diagnostic_images["raw_dark_mask"]["data_url"].startswith("data:image/png;base64,")
        assert diagnostic_images["bubble_suppress_zone"]["data_url"].startswith("data:image/png;base64,")
        assert diagnostic_images["clean_measurement_mask"]["data_url"].startswith("data:image/png;base64,")
        results[frame_index] = result

    frame_680_debug = results[680].debug_artifacts
    assert frame_680_debug["bubble_suppress_triggered"] or frame_680_debug["endpoint_guard_rejected_rows_count"] > 0
    assert frame_680_debug["bubble_candidate_count"] > 0
    assert results[680].distance_px == pytest.approx(results[800].distance_px, abs=8.0)
    assert results[800].debug_artifacts["target_mask_pixels"] > 1000


def test_golden_a_split_mesh_components_are_measured_as_one_body() -> None:
    registry = load_dataset_registry()
    try:
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(str(exc))

    measurement = MeasurementDefinition(
        measurement_id="golden-a-split-mesh-components",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1184.52,
            center_y=418.34,
            width=1269.76,
            height=381.92,
            angle_deg=-15.23,
        ),
    )

    distances: list[float] = []
    for frame_index in [1000, 1500, 1543]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.distance_px > 950.0
        distances.append(result.distance_px)

    assert max(distances) - min(distances) <= 12.0


def test_golden_a_roi_speck_does_not_expand_3804_envelope() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0024-speck-regression",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1118.07,
            center_y=465.16,
            width=1269.76,
            height=381.92,
            angle_deg=-21.49,
        ),
    )

    distances: list[float] = []
    for frame_index in [3800, 3804]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.distance_px < 920.0
        assert result.debug_artifacts["mesh_right_local_px"] < 1100.0
        distances.append(result.distance_px)

    assert max(distances) - min(distances) <= 12.0


def test_golden_a_frame_1461_side_speck_does_not_expand_envelope() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0051-speck-regression",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1178.85,
            center_y=522.29,
            width=1260.1,
            height=307.04,
            angle_deg=-8.06,
        ),
    )

    distances: dict[int, float] = {}
    right_edges: dict[int, float] = {}
    for frame_index in [1400, 1460, 1461]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.debug_artifacts["mesh_selected_row_width_px"] == pytest.approx(result.distance_px)
        assert result.debug_artifacts["boundary_support_rejected_count"] >= 0
        assert result.debug_artifacts["contour_full_box"]
        assert result.debug_artifacts["contour_measurement_band_box"]
        distances[frame_index] = result.distance_px
        right_edges[frame_index] = result.debug_artifacts["mesh_right_local_px"]

    assert distances[1461] == pytest.approx(distances[1460], abs=8.0)
    assert max(distances.values()) - min(distances.values()) <= 10.0
    assert right_edges[1461] < 1105.0


def test_golden_a_processing_scale_half_restores_original_coordinate_distances() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_a_20260522_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    roi = RotatedROI(
        center_x=1178.85,
        center_y=522.29,
        width=1260.1,
        height=307.04,
        angle_deg=-8.06,
    )
    baseline_measurement = MeasurementDefinition(
        measurement_id="p0057-scale-baseline",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=roi,
        detector_config=DetectorConfig(
            processing_scale_enabled=False,
            processing_scale=1.0,
            mask_open_kernel_px=5,
            mask_close_kernel_px=3,
            hysteresis_low_ratio=0.55,
        ),
    )
    scaled_measurement = MeasurementDefinition.model_validate(
        {
            **baseline_measurement.model_dump(mode="json"),
            "measurement_id": "p0057-scale-half",
            "detector_config": {
                **baseline_measurement.detector_config.model_dump(mode="json"),
                "processing_scale_enabled": True,
                "processing_scale": 0.5,
                "processing_scale_mode": "area_downsample",
                "refine_endpoint_on_full_res": True,
            },
        }
    )

    baseline_distances: dict[int, float] = {}
    scaled_distances: dict[int, float] = {}
    scaled_right_edges: dict[int, float] = {}
    for frame_index in [680, 800, 1400, 1460, 1461]:
        frame = registry.load_frame("golden_a_20260522_dev_lab", frame_index)
        baseline = detect_frame(frame.array, baseline_measurement, frame_index=frame_index)
        scaled = detect_frame(frame.array, scaled_measurement, frame_index=frame_index)

        assert baseline.detection_status == DetectionStatus.VALID
        assert scaled.detection_status == DetectionStatus.VALID
        assert baseline.distance_px is not None
        assert scaled.distance_px is not None
        assert scaled.debug_artifacts["processing_scale_effective"] == pytest.approx(0.5)
        assert scaled.debug_artifacts["coordinates_rescaled_to_full_res"] is True
        assert scaled.debug_artifacts["processed_roi_shape"] != scaled.debug_artifacts["full_res_roi_shape"]
        assert scaled.distance_px == pytest.approx(baseline.distance_px, abs=10.0)
        baseline_distances[frame_index] = baseline.distance_px
        scaled_distances[frame_index] = scaled.distance_px
        scaled_right_edges[frame_index] = scaled.debug_artifacts["mesh_right_local_px"]

    assert scaled_distances[680] == pytest.approx(scaled_distances[800], abs=10.0)
    assert scaled_distances[1461] == pytest.approx(scaled_distances[1460], abs=10.0)
    assert max(scaled_distances.values()) - min(scaled_distances.values()) <= 14.0
    assert scaled_right_edges[1461] < 1105.0


def test_golden_c_user_roi_adjacent_frames_keep_stable_bundle_envelope() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_c_20260529_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0027-c-adjacent-frame-regression",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1062.83,
            center_y=650.7,
            width=763.35,
            height=1020.38,
            angle_deg=-7.31,
        ),
    )

    distances: list[float] = []
    for frame_index in [2614, 2615]:
        frame = registry.load_frame("golden_c_20260529_dev_lab", frame_index)
        result = detect_frame(frame.array, measurement, frame_index=frame_index)

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.debug_artifacts["contour_measurement_mode"] == "archived_wire_bundle_projection"
        distances.append(result.distance_px)

    assert max(distances) - min(distances) <= 8.0


def test_golden_c_user_roi_mid_run_support_columns_do_not_oscillate() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_c_20260529_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0030-c-mid-run-support-regression",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1062.83,
            center_y=650.7,
            width=763.35,
            height=1020.38,
            angle_deg=-7.31,
        ),
    )

    state = CandidateSelectionState()
    distances: list[float] = []
    support_starts: list[float] = []
    for frame_index in range(5118, 5167):
        frame = registry.load_frame("golden_c_20260529_dev_lab", frame_index)
        result, state = detect_frame_with_state(
            frame.array,
            measurement,
            frame_index=frame_index,
            stability_state=state,
        )

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.debug_artifacts["wire_projection_mode"] == "stable_support_columns"
        distances.append(result.distance_px)
        support_starts.append(result.debug_artifacts["wire_support_group_min_along_px"])

    adjacent_jumps = [abs(b - a) for a, b in zip(distances, distances[1:])]
    assert max(adjacent_jumps) <= 12.0
    assert max(support_starts) - min(support_starts) <= 16.0


def test_golden_c_user_roi_continuous_left_branch_is_part_of_bundle_envelope() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_c_20260529_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0035-c-continuous-left-branch-regression",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=957.6,
            center_y=521.73,
            width=547.98,
            height=809.52,
            angle_deg=-9.93,
        ),
    )

    state = CandidateSelectionState()
    distances: list[float] = []
    support_starts: list[float] = []
    for frame_index in range(3700, 3901):
        frame = registry.load_frame("golden_c_20260529_dev_lab", frame_index)
        result, state = detect_frame_with_state(
            frame.array,
            measurement,
            frame_index=frame_index,
            stability_state=state,
        )

        assert result.detection_status == DetectionStatus.VALID
        assert result.distance_px is not None
        assert result.debug_artifacts["wire_projection_mode"] == "stable_support_columns"
        distances.append(result.distance_px)
        support_starts.append(result.debug_artifacts["wire_support_group_min_along_px"])

    adjacent_jumps = [abs(b - a) for a, b in zip(distances, distances[1:])]
    assert min(distances) >= 215.0
    assert max(distances) - min(distances) <= 16.0
    assert max(adjacent_jumps) <= 12.0
    assert max(support_starts) - min(support_starts) <= 12.0


def test_golden_c_user_roi_remaining_support_warning_ranges_are_temporally_stable() -> None:
    try:
        registry = load_dataset_registry()
        registry.resolve_dataset("golden_c_20260529_dev_lab")
    except OfflineDatasetError as exc:
        pytest.skip(f"local golden dataset is not accessible: {exc}")

    measurement = MeasurementDefinition(
        measurement_id="p0030-c-remaining-support-regression",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(
            center_x=1062.83,
            center_y=650.7,
            width=763.35,
            height=1020.38,
            angle_deg=-7.31,
        ),
    )

    for start, end in [(3234, 3242), (3769, 3777), (6453, 6462), (7645, 7656), (7849, 7857)]:
        state = CandidateSelectionState()
        distances: list[float] = []
        for frame_index in range(start, end + 1):
            frame = registry.load_frame("golden_c_20260529_dev_lab", frame_index)
            result, state = detect_frame_with_state(
                frame.array,
                measurement,
                frame_index=frame_index,
                stability_state=state,
            )

            assert result.detection_status == DetectionStatus.VALID
            assert result.distance_px is not None
            distances.append(result.distance_px)

        adjacent_jumps = [abs(b - a) for a, b in zip(distances, distances[1:])]
        assert max(adjacent_jumps) <= 18.0, (start, end, distances)
