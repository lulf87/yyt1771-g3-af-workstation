from __future__ import annotations

import csv
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus, DetectorType, ObjectClass, TemperatureSyncStatus, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    DetectorConfig,
    MeasurementDefinition,
    RotatedROI,
    RunManifest,
)
from yyt1771_g3.services.export_service import export_run, export_run_bundle
from yyt1771_g3.services.source_provenance import camera_runtime_provenance, offline_dataset_provenance
from yyt1771_g3.storage.run_store import RunStore


def _manifest() -> RunManifest:
    measurement = MeasurementDefinition(
        measurement_id="export-m",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        detector_mode="contrast_widest_span",
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(contrast_threshold=42),
    )
    candidate = DetectionCandidate(
        candidate_id="c1",
        axis_position_px=20.0,
        width_px=20.0,
        a=ABPoint(x=60.0, y=25.0),
        b=ABPoint(x=60.0, y=45.0),
        confidence=0.9,
    )
    return RunManifest(
        run_id="run-export",
        dataset_id="golden_a_20260522_dev_lab",
        runtime_source="simulated_material",
        product_mode="development",
        measurement_definition=measurement,
        detection_results=[
            DetectionResult(
                frame_index=1,
                detection_status=DetectionStatus.VALID,
                ab_points=ABPoints(a=candidate.a, b=candidate.b),
                distance_px=20.0,
                raw_best_candidate=candidate,
                selected_candidate=candidate,
                frame_timestamp_ms=1000,
                temperature_timestamp_ms=1000,
                temperature_celsius=12.0,
                temperature_delta_ms=0.0,
                temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
            ),
            DetectionResult(
                frame_index=2,
                detection_status=DetectionStatus.VALID,
                ab_points=ABPoints(a=candidate.a, b=candidate.b),
                distance_px=55.0,
                raw_best_candidate=candidate,
                selected_candidate=candidate,
                curve_point_status=CurvePointStatus.DISTANCE_JUMP_OUTLIER,
                curve_exclusion_reason="distance_jump_outlier",
                distance_outlier_filtered=True,
                raw_detected_distance_px=55.0,
                distance_outlier_baseline_px=20.0,
                distance_outlier_deviation_px=35.0,
                distance_outlier_max_jump_px=20.0,
                distance_outlier_reference_count=5,
                distance_outlier_reference_values=[20.0],
                frame_timestamp_ms=1100,
                temperature_timestamp_ms=1100,
                temperature_celsius=13.0,
                temperature_delta_ms=0.0,
                temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
            ),
        ],
        config_snapshot={"mode": "test-export"},
    )


def _multi_region_manifest() -> RunManifest:
    base = _manifest()
    payload = base.measurement_definition.model_dump(mode="json")
    roi = payload["roi"]
    payload["regions"] = [
        {
            "region_id": "region_1",
            "index": 1,
            "label": "位置 1",
            "enabled": True,
            "roi": roi,
            "color": "#ef4444",
        },
        {
            "region_id": "region_2",
            "index": 2,
            "label": "位置 2",
            "enabled": True,
            "roi": roi,
            "color": "#3b82f6",
        },
    ]
    measurement = MeasurementDefinition.model_validate(payload)
    region_one = [
        result.model_copy(
            update={
                "region_id": "region_1",
                "region_index": 1,
                "region_label": "位置 1",
                "region_color": "#ef4444",
            }
        )
        for result in base.detection_results
    ]
    region_two = [
        result.model_copy(
            update={
                "region_id": "region_2",
                "region_index": 2,
                "region_label": "位置 2",
                "region_color": "#3b82f6",
                "distance_px": result.distance_px + 10.0 if result.distance_px is not None else None,
                "raw_distance_px": result.raw_distance_px + 10.0 if result.raw_distance_px is not None else None,
            }
        )
        for result in base.detection_results
    ]
    return RunManifest(
        run_id="run-export-regions",
        dataset_id=base.dataset_id,
        measurement_definition=measurement,
        detection_results=region_one,
        region_detection_results=region_one + region_two,
        config_snapshot={"mode": "test-export-regions"},
    )


def test_export_run_writes_csv_json_png_overlay_and_parameters(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest()
    run_store.write_run_manifest(manifest)

    artifacts = export_run(run_store, manifest.run_id)

    artifact_types = {artifact.artifact_type for artifact in artifacts}
    assert {"csv", "json", "png_curve", "overlay_png", "parameters_json"}.issubset(artifact_types)

    run_dir = run_store.run_dir(manifest.run_id)
    csv_text = (run_dir / "exports" / "frame_results.csv").read_text(encoding="utf-8")
    header = csv_text.splitlines()[0]
    for column in [
        "detector_mode",
        "raw_detected_distance_px",
        "distance_px_after_filter",
        "distance_outlier_filtered",
        "distance_outlier_reason",
        "distance_outlier_baseline_px",
        "distance_outlier_deviation_px",
        "distance_outlier_max_jump_px",
        "distance_outlier_reference_count",
        "contrast_threshold",
    ]:
        assert column in header
    assert "distance_jump_outlier" in csv_text
    assert "contrast_widest_span" in csv_text
    assert len(csv_text.strip().splitlines()) == 3

    payload = json.loads((run_dir / "exports" / "run_export.json").read_text(encoding="utf-8"))
    assert "operator_data_source" in payload
    assert "provenance" in payload
    assert payload["runtime_source"] == "simulated_material"
    assert payload["product_mode"] == "development"
    assert payload["run_manifest"]["runtime_source"] == "simulated_material"
    assert payload["analysis_result"]["runtime_source"] == "simulated_material"
    assert payload["run_manifest"]["measurement_definition"]["detector_mode"] == "contrast_widest_span"
    assert payload["run_manifest"]["config_snapshot"]["mode"] == "test-export"
    assert [point["frame_index"] for point in payload["analysis_result"]["temperature_distance"]] == [1]
    parameters = json.loads((run_dir / "exports" / "parameters.json").read_text(encoding="utf-8"))
    assert parameters["measurement_definition"]["measurement_id"] == "export-m"
    assert parameters["measurement_definition"]["detector_mode"] == "contrast_widest_span"
    assert parameters["measurement_definition"]["detector_config"]["contrast_threshold"] == 42.0
    assert parameters["measurement_definition"]["detector_config"]["distance_outlier_filter_enabled"] is True
    assert parameters["measurement_definition"]["detector_config"]["distance_outlier_reference_count"] == 5
    assert parameters["measurement_definition"]["detector_config"]["distance_outlier_max_jump_px"] == 20.0
    assert parameters["measurement_definition"]["detector_config"]["distance_outlier_baseline"] == "median"
    assert "operator_data_source" in parameters
    assert "provenance" in parameters
    assert parameters["runtime_source"] == "simulated_material"
    assert parameters["product_mode"] == "development"

    for filename in ["temperature_distance.png", "roi_ab_overlay.png"]:
        with Image.open(run_dir / "exports" / filename) as image:
            assert image.size[0] > 10
            assert image.size[1] > 10


def test_multi_region_export_writes_long_wide_region_json_and_images(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _multi_region_manifest()
    run_store.write_run_manifest(manifest)

    bundle_path = export_run_bundle(run_store, manifest.run_id)

    with ZipFile(bundle_path) as archive:
        names = set(archive.namelist())
        assert {
            "frame_results.csv",
            "frame_results_long.csv",
            "frame_results_wide.csv",
            "regions/region_1_frame_results.csv",
            "regions/region_2_frame_results.csv",
            "analysis_by_region.json",
            "run_export.json",
            "parameters.json",
            "temperature_distance.png",
            "temperature_distance_combined.png",
            "temperature_distance_region_1.png",
            "temperature_distance_region_2.png",
            "roi_ab_overlay.png",
            "roi_ab_overlay_combined.png",
        }.issubset(names)
        long_rows = list(csv.DictReader(archive.read("frame_results_long.csv").decode("utf-8").splitlines()))
        wide_rows = list(csv.DictReader(archive.read("frame_results_wide.csv").decode("utf-8").splitlines()))
        assert len(long_rows) == 4
        assert {row["region_id"] for row in long_rows} == {"region_1", "region_2"}
        assert len(wide_rows) == 2
        assert "region_1_distance_px" in wide_rows[0]
        assert "region_2_status" in wide_rows[0]
        payload = json.loads(archive.read("run_export.json"))
        assert len(payload["run_manifest"]["measurement_definition"]["regions"]) == 2
        assert len(payload["run_manifest"]["region_detection_results"]) == 4
        assert len(payload["analysis_result"]["regions"]) == 2
        analysis_by_region = json.loads(archive.read("analysis_by_region.json"))
        assert [region["region_id"] for region in analysis_by_region["regions"]] == ["region_1", "region_2"]
        parameters = json.loads(archive.read("parameters.json"))
        assert len(parameters["measurement_definition"]["regions"]) == 2
        for image_name in [
            "temperature_distance_combined.png",
            "temperature_distance_region_1.png",
            "temperature_distance_region_2.png",
            "roi_ab_overlay_combined.png",
        ]:
            assert len(archive.read(image_name)) > 100


def test_export_bundle_does_not_depend_on_or_include_raw_frames(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest().model_copy(
        update={
            "run_id": "run-export-no-raw",
            "config_snapshot": {
                "mode": "real_camera_run",
                "save_raw_frames": False,
                "raw_frame_count": 0,
            },
        }
    )
    run_store.write_run_manifest(manifest)

    bundle_path = export_run_bundle(run_store, manifest.run_id)

    assert bundle_path.is_file()
    with ZipFile(bundle_path) as archive:
        names = set(archive.namelist())
    assert {
        "frame_results.csv",
        "run_export.json",
        "temperature_distance.png",
        "roi_ab_overlay.png",
        "parameters.json",
    }.issubset(names)
    assert not any(name.startswith("raw_frames/") or name.endswith(".npy") for name in names)


def test_export_includes_human_readable_notice_for_offline_simulated_data(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest().model_copy(
        update={
            "run_id": "run-export-offline",
            "operator_data_source": "offline_dataset",
            "provenance": offline_dataset_provenance("golden_a_20260522_dev_lab"),
        }
    )
    run_store.write_run_manifest(manifest)

    export_run(run_store, manifest.run_id)

    export_dir = run_store.run_dir(manifest.run_id) / "exports"
    run_payload = json.loads((export_dir / "run_export.json").read_text(encoding="utf-8"))
    parameters = json.loads((export_dir / "parameters.json").read_text(encoding="utf-8"))
    for payload in (run_payload, parameters):
        assert payload["source_notice"]["zh"] == "模拟数据，仅用于调试，不代表真实测试结果。"
        assert "does not represent a real test result" in payload["source_notice"]["en"]


def test_export_marks_operator_real_camera_non_hardware_source_as_forbidden(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest().model_copy(
        update={
            "run_id": "run-export-real-camera-simulated",
            "dataset_id": "real_camera",
            "operator_data_source": "real_camera",
            "provenance": camera_runtime_provenance(
                camera_profile={
                    "backend": "simulated",
                    "model": "G3 simulated dataset camera",
                    "serial_number": "SIM-DATASET-golden_a_20260522_dev_lab",
                    "simulated_dataset_id": "golden_a_20260522_dev_lab",
                },
                temperature_backend="simulated_temperature",
            ),
        }
    )
    run_store.write_run_manifest(manifest)

    export_run(run_store, manifest.run_id)

    export_dir = run_store.run_dir(manifest.run_id) / "exports"
    run_payload = json.loads((export_dir / "run_export.json").read_text(encoding="utf-8"))
    parameters = json.loads((export_dir / "parameters.json").read_text(encoding="utf-8"))
    for payload in (run_payload, parameters):
        assert payload["operator_data_source"] == "real_camera"
        assert payload["provenance"]["overall_kind"] == "simulated"
        assert payload["source_validity"]["status"] == "forbidden"
        assert "not complete real hardware" in payload["source_validity"]["reason_en"]
