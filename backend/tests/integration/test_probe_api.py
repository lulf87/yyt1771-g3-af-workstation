from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient


def _write_probe_dataset(root: Path) -> None:
    frames_dir = root / "frames"
    frames_dir.mkdir(parents=True)
    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[25:46, 35:86] = 30
    np.save(frames_dir / "frame_000001.npy", frame)
    (root / "manifest.json").write_text(
        json.dumps(
            {
                "frame_count": 1,
                "frames": [
                    {
                        "index": 1,
                        "npy": "frames/frame_000001.npy",
                        "timestamp_ms": 1000,
                        "shape": [80, 120],
                        "dtype": "uint8",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    (root / "temperature.csv").write_text(
        "frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius,source,sampled_this_frame,error\n"
        "1,1000,1002,23.5,fixture,1,\n",
        encoding="utf-8",
    )


def _write_registry(config_path: Path, dataset_root: Path) -> None:
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_probe",
                        "label": "Golden probe",
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


def test_probe_endpoint_detects_current_frame_with_measurement_roi(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_probe_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(config_path))

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/probe",
        json={
            "dataset_id": "golden_probe",
            "frame_index": 1,
            "measurement_definition": {
                "measurement_id": "probe-a",
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
                "detector_config": {"min_component_area_px": 20},
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    result = payload["detection_result"]
    assert result["detection_status"] == "VALID"
    assert result["distance_px"] == pytest.approx(50.0, abs=2.0)
    assert result["temperature_sync_status"] == "TEMP_SYNC_OK"
    assert result["debug_artifacts"]["contour_measurement_mode"] == "archived_mesh_envelope_rows"
    assert result["debug_artifacts"]["contour_length_px"] == pytest.approx(result["distance_px"])
    assert result["debug_artifacts"]["mesh_envelope_row_count"] > 0
    assert len(result["debug_artifacts"]["contour_projection_box"]) == 4
    assert len(result["debug_artifacts"]["contour_direction_arrow"]) == 2
    assert payload["overlay"]["ab_points"] == result["ab_points"]
    assert payload["frame"]["frame_index"] == 1
