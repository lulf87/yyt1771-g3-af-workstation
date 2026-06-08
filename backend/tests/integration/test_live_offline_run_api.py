from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image


def _write_dataset(root: Path) -> None:
    frames_dir = root / "frames"
    frames_dir.mkdir(parents=True)
    frames = []
    temp_rows = ["frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius,source,sampled_this_frame,error"]
    for index in [1, 2]:
        frame = np.full((80, 120), 245, dtype=np.uint8)
        frame[25:46, 35:86] = 30
        np.save(frames_dir / f"frame_{index:06d}.npy", frame)
        timestamp = 1000 + (index - 1) * 100
        frames.append({"index": index, "npy": f"frames/frame_{index:06d}.npy", "timestamp_ms": timestamp, "shape": [80, 120], "dtype": "uint8"})
        temp_rows.append(f"{index},{timestamp},{timestamp},22.0,fixture,1,")
    (root / "manifest.json").write_text(json.dumps({"frame_count": 2, "frames": frames}), encoding="utf-8")
    (root / "temperature.csv").write_text("\n".join(temp_rows) + "\n", encoding="utf-8")


def test_live_offline_run_api_creates_and_reads_run(tmp_path: Path, monkeypatch) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_run_api",
                        "label": "Golden run API",
                        "object_class": "A_BALLOON_ENVELOPE",
                        "g3_type": "A",
                        "root_path": str(dataset_root),
                        "manifest": "manifest.json",
                        "temperature_csv": "temperature.csv",
                        "frames_dir": "frames",
                        "frame_glob": "frame_*.npy",
                        "default_detector": "BalloonEnvelopeDetector",
                        "default_width_mode": "max_width",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(config_path))
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/live-offline-runs",
        json={
            "dataset_id": "golden_run_api",
            "start_frame": 1,
            "max_frames": 2,
            "target_fps": 8.0,
            "measurement_definition": {
                "measurement_id": "run-api",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 2},
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    run_id = payload["run_manifest"]["run_id"]
    assert len(payload["run_manifest"]["detection_results"]) == 2
    assert len(payload["analysis_result"]["temperature_distance"]) == 2

    read_response = client.get(f"/api/runs/{run_id}")
    assert read_response.status_code == 200
    assert read_response.json()["run_manifest"]["run_id"] == run_id


def test_run_availability_endpoint_avoids_404_polling_noise(tmp_path: Path, monkeypatch) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_run_availability_api",
                        "label": "Golden run availability API",
                        "object_class": "A_BALLOON_ENVELOPE",
                        "g3_type": "A",
                        "root_path": str(dataset_root),
                        "manifest": "manifest.json",
                        "temperature_csv": "temperature.csv",
                        "frames_dir": "frames",
                        "frame_glob": "frame_*.npy",
                        "default_detector": "BalloonEnvelopeDetector",
                        "default_width_mode": "max_width",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(config_path))
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))

    from yyt1771_g3.api.main import app

    client = TestClient(app)

    missing_response = client.get("/api/runs/not-yet-written/availability")
    assert missing_response.status_code == 200
    assert missing_response.json() == {
        "run_id": "not-yet-written",
        "exists": False,
        "manifest_exists": False,
        "analysis_exists": False,
    }

    response = client.post(
        "/api/live-offline-runs",
        json={
            "dataset_id": "golden_run_availability_api",
            "start_frame": 1,
            "max_frames": 1,
            "target_fps": 8.0,
            "measurement_definition": {
                "measurement_id": "run-availability-api",
                "object_class": "A_BALLOON_ENVELOPE",
                "detector": "BalloonEnvelopeDetector",
                "width_mode": "max_width",
                "measurement_coordinates": "source_pixel",
                "roi": {
                    "type": "rotated_rect",
                    "center_x": 60.0,
                    "center_y": 35.0,
                    "width": 70.0,
                    "height": 40.0,
                    "angle_deg": 0.0,
                },
                "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
            },
        },
    )
    assert response.status_code == 200
    run_id = response.json()["run_manifest"]["run_id"]

    available_response = client.get(f"/api/runs/{run_id}/availability")
    assert available_response.status_code == 200
    assert available_response.json() == {
        "run_id": run_id,
        "exists": True,
        "manifest_exists": True,
        "analysis_exists": True,
    }


def test_live_offline_run_stream_api_emits_frame_events_and_final_run(tmp_path: Path, monkeypatch) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_run_stream_api",
                        "label": "Golden run stream API",
                        "object_class": "A_BALLOON_ENVELOPE",
                        "g3_type": "A",
                        "root_path": str(dataset_root),
                        "manifest": "manifest.json",
                        "temperature_csv": "temperature.csv",
                        "frames_dir": "frames",
                        "frame_glob": "frame_*.npy",
                        "default_detector": "BalloonEnvelopeDetector",
                        "default_width_mode": "max_width",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(config_path))
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    request_payload = {
        "dataset_id": "golden_run_stream_api",
        "start_frame": 1,
        "target_fps": 8.0,
        "measurement_definition": {
            "measurement_id": "run-stream-api",
            "object_class": "A_BALLOON_ENVELOPE",
            "detector": "BalloonEnvelopeDetector",
            "width_mode": "max_width",
            "measurement_coordinates": "source_pixel",
            "roi": {
                "type": "rotated_rect",
                "center_x": 60.0,
                "center_y": 35.0,
                "width": 70.0,
                "height": 40.0,
                "angle_deg": 0.0,
            },
            "detector_config": {"min_component_area_px": 20, "max_frames_per_run": 1},
        },
    }

    with client.stream("POST", "/api/live-offline-runs/stream", json=request_payload) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    frame_events = [event for event in events if event["event"] == "frame"]
    complete_events = [event for event in events if event["event"] == "complete"]
    assert [event["frame_index"] for event in frame_events] == [1, 2]
    assert all(event["detection_result"]["detection_status"] == "VALID" for event in frame_events)
    diagnostic_images = frame_events[0]["detection_result"]["debug_artifacts"]["diagnostic_images"]
    assert diagnostic_images["mask"]["data_url"].startswith("data:image/png;base64,")
    assert diagnostic_images["contour"]["data_url"].startswith("data:image/png;base64,")
    _assert_diagnostic_image_has_envelope_box(diagnostic_images["mask"])
    _assert_diagnostic_image_has_envelope_box(diagnostic_images["contour"])
    assert frame_events[0]["curve_points"]["distance_time"]["frame_index"] == 1
    assert len(complete_events) == 1
    assert len(complete_events[0]["run_manifest"]["detection_results"]) == 2

    run_id = complete_events[0]["run_manifest"]["run_id"]
    read_response = client.get(f"/api/runs/{run_id}")
    assert read_response.status_code == 200
    assert read_response.json()["run_manifest"]["run_id"] == run_id


def _assert_diagnostic_image_has_envelope_box(image_info: dict[str, object]) -> None:
    overlay_box = image_info["overlay_box"]
    assert overlay_box["source"] == "selected_candidate_local_projection_bounds"
    assert overlay_box["stroke"] == "#ff4040"
    assert overlay_box["stroke_width_px"] >= 5
    assert 0 <= overlay_box["left"] <= overlay_box["right"] < image_info["width"]
    assert 0 <= overlay_box["top"] <= overlay_box["bottom"] < image_info["height"]

    data_url = image_info["data_url"]
    _, encoded = data_url.split(",", 1)
    image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    pixels = np.asarray(image)
    red_overlay_pixels = np.count_nonzero(
        (pixels[:, :, 0] >= 240) & (pixels[:, :, 1] <= 90) & (pixels[:, :, 2] <= 90)
    )
    assert red_overlay_pixels >= 20
