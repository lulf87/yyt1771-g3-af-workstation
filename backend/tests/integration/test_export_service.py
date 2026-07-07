from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, TemperatureSyncStatus, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
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
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
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
                detection_status=DetectionStatus.INVALID_NO_TARGET,
                rejected_reason="NO_TARGET",
                frame_timestamp_ms=1100,
                temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_MISSING,
            ),
        ],
        config_snapshot={"mode": "test-export"},
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
    assert "frame_index,detection_status,distance_px,raw_distance_px,stabilized_distance_px,result_display_source" in csv_text
    assert len(csv_text.strip().splitlines()) == 3

    payload = json.loads((run_dir / "exports" / "run_export.json").read_text(encoding="utf-8"))
    assert "operator_data_source" in payload
    assert "provenance" in payload
    assert payload["run_manifest"]["config_snapshot"]["mode"] == "test-export"
    assert payload["analysis_result"]["temperature_distance"][0]["frame_index"] == 1
    parameters = json.loads((run_dir / "exports" / "parameters.json").read_text(encoding="utf-8"))
    assert parameters["measurement_definition"]["measurement_id"] == "export-m"
    assert "operator_data_source" in parameters
    assert "provenance" in parameters

    for filename in ["temperature_distance.png", "roi_ab_overlay.png"]:
        with Image.open(run_dir / "exports" / filename) as image:
            assert image.size[0] > 10
            assert image.size[1] > 10


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
