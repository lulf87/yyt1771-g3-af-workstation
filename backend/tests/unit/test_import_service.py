from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZipFile

import pytest

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
from yyt1771_g3.services.import_service import RunExportImportError, import_run_export_bytes
from yyt1771_g3.storage.run_store import RunStore


def _manifest() -> RunManifest:
    measurement = MeasurementDefinition(
        measurement_id="import-m",
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
        run_id="run-import",
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
        config_snapshot={"mode": "test-import"},
    )


def test_import_run_export_zip_reads_project_export_bundle(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest()
    run_store.write_run_manifest(manifest)
    bundle_path = export_run_bundle(run_store, manifest.run_id)

    view = import_run_export_bytes(
        filename=bundle_path.name,
        content=bundle_path.read_bytes(),
    )

    assert view.filename == bundle_path.name
    assert view.run_manifest is not None
    assert view.run_manifest["run_id"] == manifest.run_id
    assert view.measurement_definition is not None
    assert view.measurement_definition["object_class"] == "A_BALLOON_ENVELOPE"
    assert view.analysis_result is not None
    assert view.analysis_result["temperature_distance"][0]["frame_index"] == 1
    assert view.frame_summary.total_frames == 2
    assert view.frame_summary.valid_frames == 1
    assert view.frame_summary.temperature_distance_points == 1
    assert view.operator_data_source == "offline_dataset"
    assert view.provenance["overall_kind"] == "imported"
    assert view.provenance["imported_from_provenance"]["overall_kind"] == "offline"
    assert view.frame_summary.invalid_reason_counts == {"NO_TARGET": 1}
    assert view.temperature_distance_image_data_url is not None
    assert view.temperature_distance_image_data_url.startswith("data:image/png;base64,")
    assert view.warnings == []


def test_import_multi_region_zip_preserves_region_analysis_and_curves(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    base = _manifest()
    measurement_payload = base.measurement_definition.model_dump(mode="json")
    roi = measurement_payload["roi"]
    measurement_payload["regions"] = [
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
    region_one = base.detection_results
    region_two = [
        result.model_copy(
            update={
                "region_id": "region_2",
                "region_index": 2,
                "region_label": "位置 2",
                "region_color": "#3b82f6",
            }
        )
        for result in base.detection_results
    ]
    manifest = RunManifest(
        run_id="run-import-regions",
        dataset_id=base.dataset_id,
        measurement_definition=MeasurementDefinition.model_validate(measurement_payload),
        detection_results=region_one,
        region_detection_results=region_one + region_two,
    )
    run_store.write_run_manifest(manifest)
    bundle_path = export_run_bundle(run_store, manifest.run_id)

    view = import_run_export_bytes(filename=bundle_path.name, content=bundle_path.read_bytes())

    assert view.measurement_definition is not None
    assert len(view.measurement_definition["regions"]) == 2
    assert view.analysis_result is not None
    assert [region["region_id"] for region in view.analysis_result["regions"]] == ["region_1", "region_2"]
    assert view.temperature_distance_image_data_url is not None
    assert view.frame_summary.total_frames == 2


def test_import_run_export_json_reads_structured_export_payload(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest()
    run_store.write_run_manifest(manifest)
    export_run(run_store, manifest.run_id)
    payload = (run_store.run_dir(manifest.run_id) / "exports" / "run_export.json").read_bytes()

    view = import_run_export_bytes(filename="run_export.json", content=payload)

    assert view.filename == "run_export.json"
    assert view.run_manifest is not None
    assert view.run_manifest["run_id"] == manifest.run_id
    assert view.analysis_result is not None
    assert view.frame_summary.temperature_distance_points == 1
    assert view.provenance["overall_kind"] == "imported"
    assert "file does not include frame_results.csv" in view.warnings
    assert "file does not include temperature_distance.png" in view.warnings


def test_import_legacy_single_region_json_normalizes_regions() -> None:
    manifest = _manifest().model_dump(mode="json")
    manifest["measurement_definition"].pop("regions", None)
    manifest.pop("region_detection_results", None)
    analysis = {
        "analysis_id": "legacy-analysis",
        "run_id": manifest["run_id"],
        "all_frames": manifest["detection_results"],
        "distance_time": [],
        "raw_distance_time": [],
        "stabilized_distance_time": [],
        "temperature_time": [],
        "temperature_distance": [],
        "raw_temperature_distance": [],
        "stabilized_temperature_distance": [],
        "afas_preprocessing": {},
        "afas_analysis": {},
        "export_artifacts": [],
        "created_at": "2026-07-11T00:00:00+00:00",
    }
    payload = {"run_manifest": manifest, "analysis_result": analysis}

    view = import_run_export_bytes(
        filename="legacy-run-export.json",
        content=json.dumps(payload).encode("utf-8"),
    )

    assert view.measurement_definition is not None
    assert view.measurement_definition["regions"][0]["region_id"] == "region_1"
    assert view.run_manifest is not None
    assert view.run_manifest["region_detection_results"] == view.run_manifest["detection_results"]
    assert view.analysis_result is not None
    assert view.analysis_result["regions"][0]["region_id"] == "region_1"


def test_import_run_export_zip_tolerates_missing_optional_files(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    manifest = _manifest()
    run_store.write_run_manifest(manifest)
    export_run(run_store, manifest.run_id)
    run_export = run_store.run_dir(manifest.run_id) / "exports" / "run_export.json"
    parameters = run_store.run_dir(manifest.run_id) / "exports" / "parameters.json"
    zip_path = tmp_path / "partial-export.zip"

    with ZipFile(zip_path, "w") as archive:
        archive.write(run_export, arcname="run_export.json")
        archive.write(parameters, arcname="parameters.json")

    view = import_run_export_bytes(filename=zip_path.name, content=zip_path.read_bytes())

    assert view.run_manifest is not None
    assert view.measurement_definition is not None
    assert view.temperature_distance_image_data_url is None
    assert "file does not include frame_results.csv" in view.warnings
    assert "file does not include temperature_distance.png" in view.warnings


def test_import_run_export_rejects_non_project_files() -> None:
    with pytest.raises(RunExportImportError, match="not a YY/T 1771 G3 export"):
        import_run_export_bytes(
            filename="notes.json",
            content=json.dumps({"hello": "world"}).encode("utf-8"),
        )
