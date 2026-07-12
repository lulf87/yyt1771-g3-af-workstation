from __future__ import annotations

import json

from fastapi.testclient import TestClient

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

    stored = json.loads((tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text())
    assert stored["afas_analysis"]["parameters"]["tangent_offset"] == 1


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
    stored = json.loads((tmp_path / "runs" / manifest.run_id / "analysis_result.json").read_text())
    assert stored["regions"] == scoped_regions

    unknown = TestClient(app).post(
        f"/api/runs/{manifest.run_id}/analysis",
        json={"region_id": "region_missing"},
    )
    assert unknown.status_code == 422
