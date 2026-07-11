from __future__ import annotations

from yyt1771_g3.core.enums import (
    CurvePointStatus,
    DetectionStatus,
    DetectorType,
    ObjectClass,
    TemperatureSyncStatus,
    WidthMode,
)
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    CurvePoint,
    DetectionCandidate,
    DetectionResult,
    MeasurementDefinition,
    RotatedROI,
    RunManifest,
)
from yyt1771_g3.services.afas_analysis import preprocess_temperature_distance
from yyt1771_g3.services.analysis_service import build_analysis_result, curve_points_for_detection


def _valid_detection(
    frame_index: int,
    distance: float,
    sync_status: TemperatureSyncStatus,
    temperature: float | None,
) -> DetectionResult:
    candidate = DetectionCandidate(
        candidate_id=f"c-{frame_index}",
        axis_position_px=float(frame_index),
        width_px=distance,
        a=ABPoint(x=0.0, y=0.0),
        b=ABPoint(x=0.0, y=distance),
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
        temperature_celsius=temperature,
        temperature_delta_ms=0.0 if temperature is not None else None,
        temperature_sync_status=sync_status,
    )


def test_temperature_distance_curve_uses_only_ok_or_interpolated_points() -> None:
    manifest = RunManifest(
        run_id="run-analysis",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=[
            _valid_detection(1, 20.0, TemperatureSyncStatus.TEMP_SYNC_OK, 10.0),
            _valid_detection(2, 21.0, TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED, 11.0),
            _valid_detection(3, 22.0, TemperatureSyncStatus.TEMP_SYNC_STALE, 12.0),
            DetectionResult(
                frame_index=4,
                detection_status=DetectionStatus.INVALID_NO_TARGET,
                rejected_reason="NO_TARGET",
                frame_timestamp_ms=400,
                temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_MISSING,
            ),
        ],
    )

    analysis = build_analysis_result(manifest, analysis_id="analysis-1")

    assert [point.frame_index for point in analysis.distance_time] == [1, 2, 3]
    assert [point.frame_index for point in analysis.temperature_time] == [1, 2, 3]
    assert [point.frame_index for point in analysis.temperature_distance] == [1, 2]
    assert analysis.all_frames == manifest.detection_results


def test_analysis_builds_independent_results_for_every_enabled_region() -> None:
    roi = RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0)
    regions = [
        {
            "region_id": f"region_{index}",
            "index": index,
            "label": f"位置 {index}",
            "enabled": True,
            "roi": roi.model_dump(mode="json"),
            "color": ["#ef4444", "#3b82f6", "#22c55e"][index - 1],
        }
        for index in range(1, 4)
    ]
    measurement = MeasurementDefinition.model_validate(
        {
            "measurement_id": "multi-region-analysis",
            "object_class": "C_BUNDLE_ENVELOPE",
            "detector": "BundleEnvelopeDetector",
            "width_mode": "max_width",
            "roi": roi.model_dump(mode="json"),
            "regions": regions,
        }
    )
    all_region_detections: list[DetectionResult] = []
    by_region: dict[str, list[DetectionResult]] = {region["region_id"]: [] for region in regions}
    for region_index in (1, 2):
        for index in range(63):
            temperature = 20.0 + index * 0.5
            transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
            detection = _valid_detection(
                index + 1,
                100.0 + region_index * 10.0 + transition * 55.0,
                TemperatureSyncStatus.TEMP_SYNC_OK,
                temperature,
            ).model_copy(
                update={
                    "region_id": f"region_{region_index}",
                    "region_index": region_index,
                    "region_label": f"位置 {region_index}",
                    "region_color": regions[region_index - 1]["color"],
                }
            )
            by_region[f"region_{region_index}"].append(detection)
            all_region_detections.append(detection)
    for index in range(2):
        detection = _valid_detection(
            index + 1,
            300.0 + index,
            TemperatureSyncStatus.TEMP_SYNC_OK,
            20.0 + index,
        ).model_copy(
            update={
                "region_id": "region_3",
                "region_index": 3,
                "region_label": "位置 3",
                "region_color": "#22c55e",
            }
        )
        by_region["region_3"].append(detection)
        all_region_detections.append(detection)
    manifest = RunManifest(
        run_id="run-multi-region-analysis",
        dataset_id="golden_c_20260529_dev_lab",
        measurement_definition=measurement,
        detection_results=by_region["region_1"],
        region_detection_results=all_region_detections,
    )

    analysis = build_analysis_result(manifest)

    assert [region.region_id for region in analysis.regions] == ["region_1", "region_2", "region_3"]
    assert [len(region.temperature_distance) for region in analysis.regions] == [63, 63, 2]
    assert analysis.regions[0].afas_analysis["result_status"] == "ok"
    assert analysis.regions[1].afas_analysis["result_status"] == "ok"
    assert analysis.regions[2].afas_analysis["result_status"] == "unavailable"
    assert analysis.regions[2].summary["failure_reason"]
    assert analysis.regions[0].summary["raw_point_count"] == 63
    assert analysis.temperature_distance == analysis.regions[0].temperature_distance
    assert analysis.afas_analysis == analysis.regions[0].afas_analysis


def test_curve_points_for_detection_excludes_stale_temperature_from_formal_curve() -> None:
    ok_detection = _valid_detection(1, 20.0, TemperatureSyncStatus.TEMP_SYNC_OK, 10.0)
    stale_detection = _valid_detection(2, 21.0, TemperatureSyncStatus.TEMP_SYNC_STALE, 11.0)

    ok_points = curve_points_for_detection(ok_detection)
    stale_points = curve_points_for_detection(stale_detection)

    assert ok_points["temperature_distance"] is not None
    assert ok_points["temperature_distance"].frame_index == 1
    assert stale_points["distance_time"] is not None
    assert stale_points["temperature_time"] is not None
    assert stale_points["temperature_distance"] is None


def test_analysis_excludes_distance_jump_outliers_from_formal_curve_and_afas() -> None:
    accepted_1 = _valid_detection(1, 500.0, TemperatureSyncStatus.TEMP_SYNC_OK, 20.0)
    accepted_2 = _valid_detection(2, 503.0, TemperatureSyncStatus.TEMP_SYNC_OK, 21.0)
    outlier = _valid_detection(3, 550.0, TemperatureSyncStatus.TEMP_SYNC_OK, 22.0).model_copy(
        update={
            "curve_point_status": CurvePointStatus.DISTANCE_JUMP_OUTLIER,
            "curve_exclusion_reason": "distance_jump_outlier",
            "distance_outlier_filtered": True,
            "raw_detected_distance_px": 550.0,
            "distance_outlier_baseline_px": 501.5,
            "distance_outlier_deviation_px": 48.5,
        }
    )
    accepted_3 = _valid_detection(4, 506.0, TemperatureSyncStatus.TEMP_SYNC_OK, 23.0)
    manifest = RunManifest(
        run_id="run-distance-outlier-analysis",
        dataset_id="golden_c_20260529_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-distance-outlier",
            object_class=ObjectClass.C_BUNDLE_ENVELOPE,
            detector=DetectorType.BUNDLE_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=[accepted_1, accepted_2, outlier, accepted_3],
    )

    analysis = build_analysis_result(manifest, analysis_id="analysis-distance-outlier")

    assert [point.frame_index for point in analysis.distance_time] == [1, 2, 4]
    assert [point.frame_index for point in analysis.temperature_distance] == [1, 2, 4]
    assert [point.frame_index for point in analysis.raw_distance_time] == [1, 2, 4]
    assert [point.frame_index for point in analysis.raw_temperature_distance] == [1, 2, 4]
    assert curve_points_for_detection(outlier, distance_source="raw")["distance_time"] is None
    assert curve_points_for_detection(outlier, distance_source="stabilized")["distance_time"] is None
    assert 3 not in analysis.afas_preprocessing["raw"]["frame_indexes"]
    assert analysis.all_frames[2].detection_status == DetectionStatus.VALID
    assert analysis.all_frames[2].curve_point_status == CurvePointStatus.DISTANCE_JUMP_OUTLIER


def test_analysis_result_keeps_raw_and_stabilized_distance_curves() -> None:
    detection = _valid_detection(1, 18.0, TemperatureSyncStatus.TEMP_SYNC_OK, 30.0).model_copy(
        update={
            "raw_distance_px": 24.0,
            "stabilized_distance_px": 18.0,
            "result_display_source": "stabilized",
        }
    )
    manifest = RunManifest(
        run_id="run-raw-stabilized-analysis",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-raw-stabilized",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=[detection],
    )

    analysis = build_analysis_result(manifest, analysis_id="analysis-raw-stabilized")

    assert analysis.temperature_distance[0].y == 18.0
    assert analysis.raw_temperature_distance[0].y == 24.0
    assert analysis.stabilized_temperature_distance[0].y == 18.0
    assert analysis.raw_distance_time[0].y == 24.0
    assert analysis.stabilized_distance_time[0].y == 18.0


def test_analysis_result_includes_afas_preprocessing_and_tangent_result() -> None:
    detection_results: list[DetectionResult] = []
    for index in range(63):
        temperature = 20.0 + index * 0.5
        transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
        distance = 100.0 + transition * 55.0
        detection_results.append(
            _valid_detection(
                index + 1,
                distance,
                TemperatureSyncStatus.TEMP_SYNC_OK,
                temperature,
            )
        )

    manifest = RunManifest(
        run_id="run-afas-analysis",
        dataset_id="golden_c_20260529_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-afas",
            object_class=ObjectClass.C_BUNDLE_ENVELOPE,
            detector=DetectorType.BUNDLE_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detection_results,
    )

    analysis = build_analysis_result(manifest, analysis_id="analysis-afas")

    assert analysis.afas_preprocessing["smoothed"]["applied"] is True
    assert analysis.afas_preprocessing["smoothed"]["effective_savgol_window_length"] < 51
    assert len(analysis.afas_preprocessing["smoothed"]["values"]) == len(analysis.temperature_distance)
    assert analysis.afas_analysis["result_status"] == "ok"
    assert analysis.afas_analysis["result"]["As"] is not None
    assert analysis.afas_analysis["result"]["Af_tan"] is not None
    assert analysis.afas_analysis["result"]["Af_tan"] > analysis.afas_analysis["result"]["As"]
    assert analysis.afas_analysis["result"]["max_slope_temp"] is not None


def test_analysis_result_accepts_afas_parameter_overrides() -> None:
    detection_results: list[DetectionResult] = []
    for index in range(63):
        temperature = 20.0 + index * 0.5
        transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
        distance = 100.0 + transition * 55.0
        detection_results.append(
            _valid_detection(
                index + 1,
                distance,
                TemperatureSyncStatus.TEMP_SYNC_OK,
                temperature,
            )
        )

    manifest = RunManifest(
        run_id="run-afas-overrides",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-afas-overrides",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detection_results,
    )

    analysis = build_analysis_result(
        manifest,
        analysis_id="analysis-afas-overrides",
        afas_preprocessing_parameters={
            "group_by_temperature": False,
            "outlier_window": 13,
            "outlier_threshold": 4.0,
            "outlier_max_iterations": 2,
            "savgol_window_length": 9,
            "savgol_polyorder": 2,
        },
        afas_analysis_parameters={
            "low_range_celsius": [20.0, 26.0],
            "high_range_celsius": [45.0, 51.0],
            "tangent_offset": 1,
        },
    )

    assert analysis.afas_preprocessing["parameters"]["group_by_temperature"] is False
    assert analysis.afas_preprocessing["parameters"]["savgol_window_length"] == 9
    assert analysis.afas_preprocessing["smoothed"]["effective_savgol_window_length"] == 9
    assert analysis.afas_analysis["parameters"]["low_range_celsius"] == [20.0, 26.0]
    assert analysis.afas_analysis["parameters"]["high_range_celsius"] == [45.0, 51.0]
    assert analysis.afas_analysis["parameters"]["resolved_low_range_celsius"] == [20.0, 26.0]
    assert analysis.afas_analysis["parameters"]["resolved_high_range_celsius"] == [45.0, 51.0]
    assert analysis.afas_analysis["parameters"]["tangent_offset"] == 1
    assert analysis.afas_analysis["fit"]["tangent"]["slope"] is not None


def test_afas_analysis_marks_nonfinite_tangent_fit_unavailable() -> None:
    detection_results: list[DetectionResult] = []
    for index in range(30):
        temperature = 10.0 + (index // 10) * 0.1
        distance = 900.0 - index * 0.2
        detection_results.append(
            _valid_detection(
                index + 1,
                distance,
                TemperatureSyncStatus.TEMP_SYNC_OK,
                temperature,
            )
        )

    manifest = RunManifest(
        run_id="run-afas-nonfinite",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-afas-nonfinite",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detection_results,
    )

    analysis = build_analysis_result(
        manifest,
        analysis_id="analysis-afas-nonfinite",
        afas_preprocessing_parameters={
            "group_by_temperature": False,
            "savgol_window_length": 9,
            "savgol_polyorder": 2,
        },
    )

    assert analysis.afas_analysis["result_status"] == "unavailable"
    assert analysis.afas_analysis["reason"] == "nonfinite_fit"
    assert analysis.afas_analysis["fit"]["tangent"]["slope"] is None
    assert analysis.afas_analysis["result"]["As"] is None
    assert analysis.afas_analysis["result"]["Af_tan"] is None


def test_afas_analysis_marks_insufficient_baseline_points_unavailable() -> None:
    detection_results: list[DetectionResult] = []
    temperatures = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 7.9, 10.0]
    for index, temperature in enumerate(temperatures, start=1):
        detection_results.append(
            _valid_detection(
                index,
                100.0 + index * 0.5,
                TemperatureSyncStatus.TEMP_SYNC_OK,
                temperature,
            )
        )

    manifest = RunManifest(
        run_id="run-afas-insufficient-baseline",
        dataset_id="golden_c_20260529_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-afas-insufficient-baseline",
            object_class=ObjectClass.C_BUNDLE_ENVELOPE,
            detector=DetectorType.BUNDLE_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detection_results,
    )

    analysis = build_analysis_result(manifest, analysis_id="analysis-afas-insufficient-baseline")

    assert analysis.afas_analysis["result_status"] == "unavailable"
    assert analysis.afas_analysis["reason"] == "insufficient_baseline_points"
    assert analysis.afas_analysis["result"]["As"] is None
    assert analysis.afas_analysis["result"]["Af_tan"] is None


def test_afas_analysis_coalesces_near_duplicate_interpolated_temperatures() -> None:
    detection_results: list[DetectionResult] = []
    temperatures = [
        9.80,
        9.90,
        10.00,
        10.10,
        10.20,
        10.30,
        10.40,
        10.50,
        10.60,
        10.70,
        10.80,
        10.89581993569132,
        10.895833333333334,
        10.90,
        11.00,
        11.10,
        11.20,
        11.30,
        11.40,
        11.50,
        11.60,
        11.70,
        11.80,
        11.90,
        12.00,
    ]
    for index, temperature in enumerate(temperatures, start=1):
        distance = 1010.0 - index * 2.25
        if index == 12:
            distance = 912.406
        elif index == 13:
            distance = 911.897
        detection_results.append(
            _valid_detection(
                index,
                distance,
                TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED,
                temperature,
            )
        )

    manifest = RunManifest(
        run_id="run-afas-near-duplicate-temperature",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-afas-near-duplicate-temperature",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detection_results,
    )

    analysis = build_analysis_result(
        manifest,
        analysis_id="analysis-afas-near-duplicate-temperature",
        afas_preprocessing_parameters={
            "group_by_temperature": True,
            "savgol_window_length": 11,
            "savgol_polyorder": 2,
        },
    )

    grouped_temperatures = analysis.afas_preprocessing["grouped"]["temperature_celsius"]
    positive_steps = [
        grouped_temperatures[index + 1] - grouped_temperatures[index]
        for index in range(len(grouped_temperatures) - 1)
        if grouped_temperatures[index + 1] > grouped_temperatures[index]
    ]
    tangent_slope = analysis.afas_analysis["fit"]["tangent"]["slope"]

    assert min(positive_steps) >= 0.009
    assert tangent_slope is not None
    assert abs(tangent_slope) < 500.0
    assert analysis.afas_analysis["result_status"] != "ok" or analysis.afas_analysis["result"]["Af_tan"] < 20.0


def test_afas_preprocessing_reduces_savgol_window_for_short_live_series() -> None:
    points = [
        CurvePoint(
            x=20.0 + index * 0.1,
            y=100.0 + index * 0.2 + (1.0 if index % 2 == 0 else -1.0),
            frame_index=index + 1,
            sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
        )
        for index in range(21)
    ]

    preprocessing = preprocess_temperature_distance(points)

    assert preprocessing["smoothed"]["applied"] is True
    assert preprocessing["smoothed"]["effective_savgol_window_length"] == 11
    assert len(preprocessing["smoothed"]["values"]) == 21
    assert any("reduced to 11" in warning for warning in preprocessing["warnings"])
