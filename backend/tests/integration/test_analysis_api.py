from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, TemperatureSyncStatus, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    FrameRecord,
    MeasurementDefinition,
    RotatedROI,
    RunManifest,
    TemperatureRecord,
)
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.services.run_v2_service import build_v2_analysis_summary, initialize_v2_run
from yyt1771_g3.storage.run_results_db import RunResultsDatabase
from yyt1771_g3.storage.run_store import RunStore


def _valid_detection(frame_index: int, temperature: float, distance: float) -> DetectionResult:
    candidate = DetectionCandidate(
        candidate_id=f"c-{frame_index}",
        axis_position_px=float(frame_index),
        width_px=distance,
        a=ABPoint(x=0.0, y=0.0),
        b=ABPoint(x=0.0, y=distance),
        confidence=0.95,
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
        temperature_delta_ms=0.0,
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
    )


def test_analysis_api_recomputes_and_persists_afas_parameters(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    run_store = RunStore()
    detections = []
    for index in range(63):
        temperature = 20.0 + index * 0.5
        transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
        detections.append(_valid_detection(index + 1, temperature, 100.0 + transition * 55.0))

    manifest = RunManifest(
        run_id="run-analysis-api",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m-analysis-api",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=detections,
    )
    run_store.write_run_manifest(manifest)

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={
            "afas_preprocessing_parameters": {
                "group_by_temperature": False,
                "outlier_window": 13,
                "outlier_threshold": 4.0,
                "outlier_max_iterations": 2,
                "savgol_window_length": 9,
                "savgol_polyorder": 2,
            },
            "afas_analysis_parameters": {
                "low_range_celsius": [20.0, 26.0],
                "high_range_celsius": [45.0, 51.0],
                "tangent_offset": 1,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()["analysis_result"]
    assert payload["afas_preprocessing"]["parameters"]["savgol_window_length"] == 9
    assert payload["afas_analysis"]["parameters"]["resolved_low_range_celsius"] == [20.0, 26.0]
    assert payload["afas_analysis"]["parameters"]["resolved_high_range_celsius"] == [45.0, 51.0]

    stored = json.loads(
        (tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text(encoding="utf-8")
    )
    assert stored["afas_analysis"]["parameters"]["tangent_offset"] == 1

    tangent = payload["afas_analysis"]["fit"]["tangent"]
    manual_slope = float(tangent["slope"]) * 0.9
    manual_intercept = float(tangent["intercept"]) + 2.0
    preview_response = client.post(
        f"/api/runs/{manifest.run_id}/analysis/preview",
        json={
            "region_id": "region_1",
            "afas_analysis_parameters": {
                "low_range_celsius": [20.0, 26.0],
                "high_range_celsius": [45.0, 51.0],
                "tangent_slope_override": manual_slope,
                "tangent_intercept_override": manual_intercept,
            },
        },
    )

    assert preview_response.status_code == 200
    preview = preview_response.json()["analysis_preview"]
    assert preview["region_id"] == "region_1"
    assert preview["afas_analysis"]["fit"]["tangent"]["slope"] == pytest.approx(manual_slope)
    assert preview["afas_analysis"]["fit"]["tangent"]["intercept"] == pytest.approx(manual_intercept)
    assert preview["afas_analysis"]["fit"]["tangent"]["manual_override"] is True
    stored_after_preview = json.loads(
        (tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text(encoding="utf-8")
    )
    assert stored_after_preview == stored

    manual_persist_response = client.post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={
            "afas_preprocessing_parameters": {
                "group_by_temperature": False,
                "outlier_window": 13,
                "outlier_threshold": 4.0,
                "outlier_max_iterations": 2,
                "savgol_window_length": 9,
                "savgol_polyorder": 2,
            },
            "afas_analysis_parameters": {
                "low_range_celsius": [20.0, 26.0],
                "high_range_celsius": [45.0, 51.0],
                "tangent_offset": 2,
                "tangent_slope_override": manual_slope,
                "tangent_intercept_override": manual_intercept,
            },
        },
    )
    assert manual_persist_response.status_code == 200
    assert manual_persist_response.json()["analysis_result"]["afas_analysis"]["fit"]["tangent"]["manual_override"] is True

    restore_response = client.post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={
            "afas_preprocessing_parameters": {
                "group_by_temperature": False,
                "outlier_window": 13,
                "outlier_threshold": 4.0,
                "outlier_max_iterations": 2,
                "savgol_window_length": 9,
                "savgol_polyorder": 2,
            },
            "afas_analysis_parameters": {
                "low_range_celsius": None,
                "high_range_celsius": None,
                "tangent_offset": 0,
                "tangent_slope_override": None,
                "tangent_intercept_override": None,
            },
        },
    )

    assert restore_response.status_code == 200
    restored = restore_response.json()["analysis_result"]
    restored_parameters = restored["afas_analysis"]["parameters"]
    assert restored["afas_preprocessing"]["parameters"]["savgol_window_length"] == 9
    assert restored_parameters["low_range_celsius"] is None
    assert restored_parameters["high_range_celsius"] is None
    assert restored_parameters["tangent_offset"] == 0
    assert restored_parameters["tangent_slope_override"] is None
    assert restored_parameters["tangent_intercept_override"] is None
    assert restored_parameters["resolved_low_range_celsius"] == pytest.approx([20.0, 26.2])
    assert restored_parameters["resolved_high_range_celsius"] == pytest.approx([44.8, 51.0])
    assert restored["afas_analysis"]["fit"]["tangent"]["manual_override"] is False

    stored_after_restore = json.loads(
        (tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text(encoding="utf-8")
    )
    assert stored_after_restore["afas_analysis"]["parameters"] == restored_parameters
    assert stored_after_restore["afas_analysis"]["fit"]["tangent"]["manual_override"] is False

    stored_path = run_store.analysis_result_path(manifest.run_id)
    stored_before_invalid = stored_path.read_bytes()
    invalid_adjustment = {
        "region_id": "region_1",
        "afas_analysis_parameters": {
            "low_range_celsius": [10.0, 11.0],
            "high_range_celsius": [45.0, 50.0],
            "tangent_slope_override": 2.0,
            "tangent_intercept_override": 40.0,
        },
    }

    invalid_preview = client.post(
        f"/api/runs/{manifest.run_id}/analysis/preview",
        json=invalid_adjustment,
    )
    assert invalid_preview.status_code == 422
    assert "low" in str(invalid_preview.json()["detail"])
    assert stored_path.read_bytes() == stored_before_invalid

    invalid_save = client.post(
        f"/api/runs/{manifest.run_id}/analysis",
        json=invalid_adjustment,
    )
    assert invalid_save.status_code == 422
    assert "low" in str(invalid_save.json()["detail"])
    assert stored_path.read_bytes() == stored_before_invalid


def test_analysis_api_applies_global_afas_parameters_to_every_region(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    run_store = RunStore()
    roi = RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0)
    measurement = MeasurementDefinition.model_validate(
        {
            "measurement_id": "m-analysis-api-regions",
            "object_class": "A_BALLOON_ENVELOPE",
            "detector": "BalloonEnvelopeDetector",
            "width_mode": "max_width",
            "roi": roi.model_dump(mode="json"),
            "regions": [
                {
                    "region_id": "region_1",
                    "index": 1,
                    "label": "位置 1",
                    "enabled": True,
                    "roi": roi.model_dump(mode="json"),
                    "color": "#ef4444",
                },
                {
                    "region_id": "region_2",
                    "index": 2,
                    "label": "位置 2",
                    "enabled": True,
                    "roi": roi.model_dump(mode="json"),
                    "color": "#3b82f6",
                },
            ],
        }
    )
    by_region: dict[str, list[DetectionResult]] = {"region_1": [], "region_2": []}
    for region_index in (1, 2):
        for index in range(63):
            temperature = 20.0 + index * 0.5
            transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
            detection = _valid_detection(
                index + 1,
                temperature,
                100.0 + region_index * 8.0 + transition * 55.0,
            ).model_copy(
                update={
                    "region_id": f"region_{region_index}",
                    "region_index": region_index,
                    "region_label": f"位置 {region_index}",
                    "region_color": ["#ef4444", "#3b82f6"][region_index - 1],
                }
            )
            by_region[f"region_{region_index}"].append(detection)
    manifest = RunManifest(
        run_id="run-analysis-api-regions",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=measurement,
        detection_results=by_region["region_1"],
        region_detection_results=by_region["region_1"] + by_region["region_2"],
    )
    run_store.write_run_manifest(manifest)

    from yyt1771_g3.api.main import app

    response = TestClient(app).post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={
            "afas_preprocessing_parameters": {
                "group_by_temperature": False,
                "savgol_window_length": 9,
                "savgol_polyorder": 2,
            },
            "afas_analysis_parameters": {
                "low_range_celsius": [20.0, 26.0],
                "high_range_celsius": [45.0, 51.0],
                "tangent_offset": 1,
            },
        },
    )

    assert response.status_code == 200
    regions = response.json()["analysis_result"]["regions"]
    assert [region["region_id"] for region in regions] == ["region_1", "region_2"]
    assert [region["afas_preprocessing"]["parameters"]["savgol_window_length"] for region in regions] == [9, 9]
    assert [region["afas_analysis"]["parameters"]["tangent_offset"] for region in regions] == [1, 1]

    original_region_1 = regions[0]
    scoped = TestClient(app).post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={
            "region_id": "region_2",
            "afas_preprocessing_parameters": {
                "group_by_temperature": False,
                "savgol_window_length": 11,
                "savgol_polyorder": 2,
            },
            "afas_analysis_parameters": {
                "low_range_celsius": [20.0, 26.0],
                "high_range_celsius": [45.0, 51.0],
                "tangent_offset": 2,
            },
        },
    )
    assert scoped.status_code == 200
    scoped_regions = scoped.json()["analysis_result"]["regions"]
    assert scoped_regions[0] == original_region_1
    assert scoped_regions[1]["afas_preprocessing"]["parameters"]["savgol_window_length"] == 11
    assert scoped_regions[1]["afas_analysis"]["parameters"]["tangent_offset"] == 2
    stored = json.loads(
        (tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text(encoding="utf-8")
    )
    assert stored["regions"] == scoped_regions

    unknown = TestClient(app).post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={"region_id": "region_missing"},
    )
    assert unknown.status_code == 422


def test_analysis_api_rejects_invalid_v2_adjustment_without_overwriting_summary(
    tmp_path,
    monkeypatch,
) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    run_store = RunStore()
    detections = []
    for index in range(63):
        temperature = 20.0 + index * 0.5
        transition = 1.0 / (1.0 + 2.718281828 ** (-(temperature - 36.0) / 2.2))
        detections.append(_valid_detection(index + 1, temperature, 100.0 + transition * 55.0))
    measurement = MeasurementDefinition(
        measurement_id="m-analysis-api-v2",
        object_class=ObjectClass.WHOLE_ENVELOPE,
        detector=DetectorType.CONTRAST_WIDEST_SPAN,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
    )
    run_id = "run-analysis-api-v2"
    manifest = RunManifest(
        run_id=run_id,
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=measurement,
        detection_results=detections,
        region_detection_results=detections,
    )
    valid_analysis = build_analysis_result(
        manifest,
        afas_preprocessing_parameters={
            "group_by_temperature": False,
            "savgol_window_length": 9,
            "savgol_polyorder": 2,
        },
        afas_analysis_parameters={
            "low_range_celsius": [20.0, 26.0],
            "high_range_celsius": [45.0, 51.0],
        },
    )
    assert valid_analysis.afas_analysis["result_status"] == "ok"

    initialize_v2_run(
        run_store,
        run_id=run_id,
        dataset_id=manifest.dataset_id,
        measurement=measurement,
        runtime_source="simulated_material",
        product_mode="development",
        operator_data_source="simulated_material",
        provenance={"overall_kind": "simulated"},
        config_snapshot={},
    )
    frames = [
        FrameRecord(
            frame_index=result.frame_index,
            shape=[1, 1],
            dtype="uint8",
            source="test",
            timestamp_ms=result.frame_timestamp_ms,
        )
        for result in detections
    ]
    temperatures = [
        TemperatureRecord(
            timestamp_ms=result.temperature_timestamp_ms,
            celsius=result.temperature_celsius,
            source="test",
            sampled_this_frame=True,
        )
        for result in detections
    ]
    with RunResultsDatabase(run_store.results_database_path(run_id)) as database:
        database.append_batch(frames, temperatures, detections)
    summary = build_v2_analysis_summary(
        run_store,
        run_id=run_id,
        region_analyses=list(valid_analysis.regions),
        latest_results={"region_1": detections[-1]},
    )
    summary_path = run_store.write_analysis_summary(summary)
    stored_before_invalid = summary_path.read_bytes()

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    invalid_adjustment = {
        "region_id": "region_1",
        "afas_analysis_parameters": {
            "low_range_celsius": [10.0, 11.0],
            "high_range_celsius": [45.0, 50.0],
            "tangent_slope_override": 2.0,
            "tangent_intercept_override": 40.0,
        },
    }

    invalid_preview = client.post(
        f"/api/runs/{run_id}/analysis/preview",
        json=invalid_adjustment,
    )
    assert invalid_preview.status_code == 422
    assert "low" in str(invalid_preview.json()["detail"])
    assert summary_path.read_bytes() == stored_before_invalid

    invalid_save = client.post(
        f"/api/runs/{run_id}/analysis",
        json=invalid_adjustment,
    )
    assert invalid_save.status_code == 422
    assert "low" in str(invalid_save.json()["detail"])
    assert summary_path.read_bytes() == stored_before_invalid
