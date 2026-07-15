from __future__ import annotations

from pathlib import Path

import pytest

from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    AnalysisResult,
    CurvePoint,
    DetectionCandidate,
    DetectionResult,
    DetectorConfig,
    ExportArtifact,
    FrameRecord,
    MeasurementDefinition,
    RotatedROI,
    RunManifest,
    TemperatureRecord,
)
from yyt1771_g3.core.enums import (
    CurvePointStatus,
    DetectionStatus,
    DetectorType,
    MeasurementCoordinateKind,
    ObjectClass,
    TemperatureSyncStatus,
    WidthMode,
)
from yyt1771_g3.storage.manifest_io import read_json_model, write_json_model


def _legacy_measurement_payload() -> dict[str, object]:
    return {
        "measurement_id": "legacy-region-measurement",
        "object_class": "C_BUNDLE_ENVELOPE",
        "detector": "BundleEnvelopeDetector",
        "width_mode": "max_width",
        "measurement_coordinates": "source_pixel",
        "roi": {
            "type": "rotated_rect",
            "center_x": 60.0,
            "center_y": 40.0,
            "width": 30.0,
            "height": 12.0,
            "angle_deg": 0.0,
        },
    }


def _region_payload(
    index: int,
    *,
    region_id: str | None = None,
    enabled: bool = True,
    color: str | None = None,
) -> dict[str, object]:
    return {
        "region_id": region_id or f"region_{index}",
        "index": index,
        "label": f"位置 {index}",
        "enabled": enabled,
        "color": color or ("#ef4444" if index == 1 else "#3b82f6"),
        "roi": {
            "type": "rotated_rect",
            "center_x": float(index * 40),
            "center_y": 40.0,
            "width": 30.0,
            "height": 12.0,
            "angle_deg": 0.0,
        },
    }


def test_measurement_definition_json_round_trip() -> None:
    measurement = MeasurementDefinition(
        measurement_id="golden-a-default",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        measurement_coordinates=MeasurementCoordinateKind.SOURCE_PIXEL,
        roi=RotatedROI(center_x=1000.0, center_y=650.0, width=800.0, height=300.0, angle_deg=-5.0),
        detector_config=DetectorConfig(tie_width_epsilon_px=2.0, switch_after_n_frames=3),
    )

    payload = measurement.model_dump(mode="json")

    assert payload["measurement_coordinates"] == "source_pixel"
    assert payload["detector_mode"] == "default"
    assert payload["roi"]["type"] == "rotated_rect"
    assert payload["detector_config"]["tie_width_epsilon_px"] == 2.0
    assert MeasurementDefinition.model_validate(payload) == measurement


def test_measurement_definition_defaults_missing_detector_mode_for_legacy_payloads() -> None:
    payload = {
        "measurement_id": "legacy-c-default",
        "object_class": "C_BUNDLE_ENVELOPE",
        "detector": "BundleEnvelopeDetector",
        "width_mode": "max_width",
        "measurement_coordinates": "source_pixel",
        "roi": {
            "type": "rotated_rect",
            "center_x": 20.0,
            "center_y": 20.0,
            "width": 30.0,
            "height": 12.0,
            "angle_deg": 0.0,
        },
    }

    measurement = MeasurementDefinition.model_validate(payload)

    assert measurement.detector_mode == "default"
    assert measurement.object_class == ObjectClass.C_BUNDLE_ENVELOPE
    assert measurement.detector == DetectorType.BUNDLE_ENVELOPE


def test_measurement_definition_defaults_to_current_whole_envelope_model() -> None:
    measurement = MeasurementDefinition(
        measurement_id="current-default",
        roi=RotatedROI(center_x=20.0, center_y=20.0, width=30.0, height=8.0),
    )

    assert measurement.object_class == ObjectClass.WHOLE_ENVELOPE
    assert measurement.detector == DetectorType.CONTRAST_WIDEST_SPAN
    assert measurement.width_mode == WidthMode.MAX_WIDTH


def test_measurement_definition_normalizes_legacy_roi_to_region_one() -> None:
    measurement = MeasurementDefinition.model_validate(_legacy_measurement_payload())

    assert len(measurement.regions) == 1
    assert measurement.regions[0].region_id == "region_1"
    assert measurement.regions[0].index == 1
    assert measurement.regions[0].label == "位置 1"
    assert measurement.regions[0].enabled is True
    assert measurement.regions[0].color == "#ef4444"
    assert measurement.regions[0].roi == measurement.roi
    assert measurement.enabled_regions == measurement.regions


def test_measurement_definition_uses_regions_and_mirrors_first_enabled_roi() -> None:
    payload = _legacy_measurement_payload()
    payload["regions"] = [
        _region_payload(1, enabled=False),
        _region_payload(2, enabled=True),
    ]

    measurement = MeasurementDefinition.model_validate(payload)

    assert [region.region_id for region in measurement.enabled_regions] == ["region_2"]
    assert measurement.roi == measurement.regions[1].roi


@pytest.mark.parametrize("count", [0, 7])
def test_measurement_definition_rejects_region_count_outside_one_to_six(count: int) -> None:
    payload = _legacy_measurement_payload()
    payload["roi"] = None
    payload["regions"] = [_region_payload(index) for index in range(1, count + 1)]

    with pytest.raises(ValueError, match="between 1 and 6"):
        MeasurementDefinition.model_validate(payload)


def test_measurement_definition_requires_one_enabled_region() -> None:
    payload = _legacy_measurement_payload()
    payload["regions"] = [
        _region_payload(1, enabled=False),
        _region_payload(2, enabled=False),
    ]

    with pytest.raises(ValueError, match="at least one enabled"):
        MeasurementDefinition.model_validate(payload)


@pytest.mark.parametrize(
    ("regions", "message"),
    [
        ([_region_payload(1), _region_payload(2, region_id="region_1")], "region_id"),
        ([_region_payload(1), {**_region_payload(2), "index": 1}], "index"),
        ([_region_payload(1, color="red")], "color"),
    ],
)
def test_measurement_definition_rejects_duplicate_identity_and_invalid_color(
    regions: list[dict[str, object]],
    message: str,
) -> None:
    payload = _legacy_measurement_payload()
    payload["regions"] = regions

    with pytest.raises(ValueError, match=message):
        MeasurementDefinition.model_validate(payload)


def test_detector_config_exposes_basic_contour_and_temporal_controls() -> None:
    config = DetectorConfig()

    assert config.contrast_threshold == 55.0
    assert config.contour_close_kernel == 21
    assert config.contour_close_kernel_px == 21
    assert config.contour_smooth_window == 7
    assert config.temporal_stabilization_enabled is False
    assert config.temporal_stabilization_strength == "medium"
    assert config.distance_outlier_filter_enabled is True
    assert config.distance_outlier_reference_count == 5
    assert config.distance_outlier_max_jump_px == 100.0
    assert config.distance_outlier_baseline == "median"


def test_detector_config_clamps_contrast_threshold() -> None:
    assert DetectorConfig(contrast_threshold=-5).contrast_threshold == 0.0
    assert DetectorConfig(contrast_threshold=300).contrast_threshold == 255.0


def test_detector_config_clamps_distance_outlier_parameters() -> None:
    low = DetectorConfig(distance_outlier_reference_count=-1, distance_outlier_max_jump_px=-10)
    high = DetectorConfig(distance_outlier_reference_count=99, distance_outlier_max_jump_px=999)

    assert low.distance_outlier_reference_count == 1
    assert low.distance_outlier_max_jump_px == 1.0
    assert high.distance_outlier_reference_count == 20
    assert high.distance_outlier_max_jump_px == 200.0


def test_rotated_roi_rejects_non_positive_size() -> None:
    with pytest.raises(ValueError, match="width"):
        RotatedROI(center_x=10.0, center_y=10.0, width=0.0, height=5.0, angle_deg=0.0)

    with pytest.raises(ValueError, match="height"):
        RotatedROI(center_x=10.0, center_y=10.0, width=5.0, height=-1.0, angle_deg=0.0)


def test_legacy_ac_object_classes_only_accept_max_width() -> None:
    with pytest.raises(ValueError, match="legacy A/C object classes only support max_width"):
        MeasurementDefinition(
            measurement_id="bad-c-min",
            object_class=ObjectClass.C_BUNDLE_ENVELOPE,
            detector=DetectorType.BUNDLE_ENVELOPE,
            width_mode=WidthMode.MIN_WIDTH,
            roi=RotatedROI(center_x=5.0, center_y=5.0, width=6.0, height=4.0, angle_deg=0.0),
        )


def test_whole_envelope_requires_current_detector_and_max_width() -> None:
    roi = RotatedROI(center_x=5.0, center_y=5.0, width=8.0, height=8.0)
    with pytest.raises(ValueError, match="requires ContrastWidestSpanDetector"):
        MeasurementDefinition(
            object_class=ObjectClass.WHOLE_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            roi=roi,
        )
    with pytest.raises(ValueError, match="only supports max_width"):
        MeasurementDefinition(
            object_class=ObjectClass.WHOLE_ENVELOPE,
            detector=DetectorType.CONTRAST_WIDEST_SPAN,
            width_mode=WidthMode.MIN_WIDTH,
            roi=roi,
        )


def test_detection_result_valid_and_invalid_contracts() -> None:
    candidate = DetectionCandidate(
        candidate_id="row-15",
        axis_position_px=15.0,
        width_px=42.0,
        a=ABPoint(x=10.0, y=15.0),
        b=ABPoint(x=52.0, y=15.0),
        confidence=0.9,
    )
    valid = DetectionResult(
        frame_index=1,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=42.0,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
    )

    assert valid.model_dump(mode="json")["detection_status"] == "VALID"
    assert valid.distance_px == 42.0
    assert valid.measurement_segment == [candidate.a, candidate.b]
    assert valid.curve_point_status == CurvePointStatus.VALID
    assert valid.raw_detected_distance_px == 42.0
    assert valid.region_id == "region_1"
    assert valid.region_index == 1
    assert valid.region_label == "位置 1"
    assert valid.region_color == "#ef4444"

    invalid = DetectionResult(
        frame_index=2,
        detection_status=DetectionStatus.INVALID_NO_TARGET,
        rejected_reason="NO_TARGET",
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_MISSING,
    )
    assert invalid.ab_points is None
    assert invalid.distance_px is None

    with pytest.raises(ValueError, match="VALID detection requires"):
        DetectionResult(frame_index=3, detection_status=DetectionStatus.VALID)

    with pytest.raises(ValueError, match="INVALID detection must not carry formal"):
        DetectionResult(
            frame_index=4,
            detection_status=DetectionStatus.INVALID_BAD_ENVELOPE,
            distance_px=9.0,
        )


def test_run_manifest_analysis_and_export_artifact_can_round_trip(tmp_path: Path) -> None:
    measurement = MeasurementDefinition(
        measurement_id="m1",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=20.0, center_y=20.0, width=30.0, height=12.0, angle_deg=0.0),
    )
    manifest = RunManifest(
        run_id="run-test",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=measurement,
        frame_records=[
            FrameRecord(
                frame_index=1,
                frame_path="frames/frame_000001.npy",
                timestamp_ms=1000,
                shape=[40, 60],
                dtype="uint8",
                source="offline_dataset",
            )
        ],
        temperature_records=[
            TemperatureRecord(
                timestamp_ms=1000,
                celsius=12.3,
                source="fixture",
                sampled_this_frame=True,
            )
        ],
        detection_results=[
            DetectionResult(
                frame_index=1,
                detection_status=DetectionStatus.INVALID_NO_TARGET,
                rejected_reason="NO_TARGET",
                temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
            )
        ],
    )
    path = tmp_path / "run_manifest.json"

    write_json_model(path, manifest)
    restored = read_json_model(path, RunManifest)

    assert restored == manifest
    assert restored.frame_records[0].raw_frame_saved is False
    assert restored.frame_records[0].preview_path == ""
    assert restored.region_detection_results == restored.detection_results

    analysis = AnalysisResult(
        analysis_id="analysis-test",
        run_id=manifest.run_id,
        all_frames=manifest.detection_results,
        distance_time=[CurvePoint(x=1.0, y=2.0, frame_index=1)],
        temperature_time=[CurvePoint(x=1.0, y=12.3, frame_index=1)],
        temperature_distance=[],
        export_artifacts=[
            ExportArtifact(
                artifact_id="csv-1",
                artifact_type="csv",
                path="output/exports/run-test/results.csv",
                source_run_id=manifest.run_id,
            )
        ],
    )

    assert analysis.model_dump(mode="json")["export_artifacts"][0]["artifact_type"] == "csv"
    assert len(analysis.regions) == 1
    assert analysis.regions[0].region_id == "region_1"
    assert analysis.regions[0].all_frames == analysis.all_frames
    assert analysis.regions[0].distance_time == analysis.distance_time
