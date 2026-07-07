from __future__ import annotations

import json

from fastapi.testclient import TestClient


def test_import_api_accepts_project_json_export() -> None:
    from yyt1771_g3.api.main import app

    payload = {
        "run_manifest": {
            "run_id": "run-import-api",
            "dataset_id": "real_camera",
            "measurement_definition": {
                "measurement_id": "m",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 10.0,
                    "center_y": 10.0,
                    "width": 12.0,
                    "height": 8.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {
                    "target_temperature_celsius": 42.5,
                    "temperature_power_percent": 55,
                },
            },
            "detection_results": [],
            "frame_records": [],
            "temperature_records": [],
            "export_artifacts": [],
            "created_at": "2026-07-07T00:00:00Z",
            "config_snapshot": {},
            "software": {},
        },
        "analysis_result": {
            "analysis_id": "analysis-import-api",
            "run_id": "run-import-api",
            "all_frames": [],
            "distance_time": [],
            "raw_distance_time": [],
            "stabilized_distance_time": [],
            "temperature_time": [],
            "temperature_distance": [
                {"x": 25.0, "y": 20.0, "frame_index": 1, "sync_status": "TEMP_SYNC_OK"}
            ],
            "raw_temperature_distance": [],
            "stabilized_temperature_distance": [],
            "afas_preprocessing": {"smoothed": {"temperature_celsius": [25.0], "distance_px": [20.0]}},
            "afas_analysis": {"result_status": "insufficient_points", "result": {}},
            "export_artifacts": [],
            "created_at": "2026-07-07T00:00:00Z",
        },
    }

    client = TestClient(app)
    response = client.post(
        "/api/imports/run-export",
        files={"file": ("run_export.json", json.dumps(payload), "application/json")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "run_export.json"
    assert body["run_manifest"]["run_id"] == "run-import-api"
    assert body["measurement_definition"]["object_class"] == "A_BALLOON_ENVELOPE"
    assert body["analysis_result"]["temperature_distance"][0]["frame_index"] == 1
    assert body["frame_summary"]["temperature_distance_points"] == 1
    assert body["provenance"]["overall_kind"] == "imported"


def test_import_api_rejects_unknown_upload() -> None:
    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/imports/run-export",
        files={"file": ("notes.txt", "not an export", "text/plain")},
    )

    assert response.status_code == 400
    assert "not a YY/T 1771 G3 export" in response.json()["detail"]["message"]
