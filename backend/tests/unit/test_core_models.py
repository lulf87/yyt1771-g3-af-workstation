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
    DetectionStatus,
    DetectorType,
    MeasurementCoordinateKind,
    ObjectClass,
    TemperatureSyncStatus,
    WidthMode,
)
from yyt1771_g3.storage.manifest_io import read_json_model, write_json_model


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
    assert payload["roi"]["type"] == "rotated_rect"
    assert payload["detector_config"]["tie_width_epsilon_px"] == 2.0
    assert MeasurementDefinition.model_validate(payload) == measurement


def test_detector_config_exposes_basic_contour_and_temporal_controls() -> None:
    config = DetectorConfig()

    assert config.contour_close_kernel == 21
    assert config.contour_close_kernel_px == 21
    assert config.contour_smooth_window == 7
    assert config.temporal_stabilization_enabled is False
    assert config.temporal_stabilization_strength == "medium"


def test_rotated_roi_rejects_non_positive_size() -> None:
    with pytest.raises(ValueError, match="width"):
        RotatedROI(center_x=10.0, center_y=10.0, width=0.0, height=5.0, angle_deg=0.0)

    with pytest.raises(ValueError, match="height"):
        RotatedROI(center_x=10.0, center_y=10.0, width=5.0, height=-1.0, angle_deg=0.0)


def test_ac_object_classes_only_accept_max_width() -> None:
    with pytest.raises(ValueError, match="A/C object classes only support max_width"):
        MeasurementDefinition(
            measurement_id="bad-c-min",
            object_class=ObjectClass.C_BUNDLE_ENVELOPE,
            detector=DetectorType.BUNDLE_ENVELOPE,
            width_mode=WidthMode.MIN_WIDTH,
            roi=RotatedROI(center_x=5.0, center_y=5.0, width=6.0, height=4.0, angle_deg=0.0),
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
