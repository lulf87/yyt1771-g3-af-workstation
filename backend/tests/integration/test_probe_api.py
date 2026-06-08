from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image


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


def test_real_camera_setup_probe_uses_frozen_setup_frame_without_opening_camera(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main

    opened_camera = False

    class ForbiddenCameraSource:
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            nonlocal opened_camera
            opened_camera = True

    client = TestClient(main.app)
    monkeypatch.setattr(main, "HikMvsCameraSource", ForbiddenCameraSource)
    response = client.post(
        "/api/camera/setup-probe",
        json={
            "frame_png_data_url": _probe_frame_data_url(),
            "frame_timestamp_ms": 1779448000123,
            "camera_meta": {"model": "frozen-fixture", "pixel_format": "mono8"},
            "measurement_definition": _probe_measurement(),
        },
    )

    assert response.status_code == 200
    assert opened_camera is False
    payload = response.json()
    result = payload["detection_result"]
    assert payload["dataset_id"] == "real_camera"
    assert payload["frame"]["timestamp_ms"] == 1779448000123
    assert payload["measurement_definition"]["source"] == "real_camera"
    assert result["detection_status"] == "VALID"
    assert result["distance_px"] == pytest.approx(50.0, abs=2.0)
    assert result["frame_timestamp_ms"] == 1779448000123
    assert result["temperature_sync_status"] == "TEMP_SYNC_MISSING"
    assert result["debug_artifacts"]["contour_measurement_mode"] == "archived_mesh_envelope_rows"
    assert payload["overlay"]["ab_points"] == result["ab_points"]
    assert payload["image_data_url"].startswith("data:image/png;base64,")


def test_real_camera_setup_probe_live_captures_latest_camera_frame(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from yyt1771_g3.api import main
    from yyt1771_g3.camera.base import CameraFrame

    calls = {"preview": 0, "close": 0}
    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[25:46, 35:86] = 30

    class FakeCameraSource:
        def __init__(self, profile=None) -> None:  # noqa: ANN001
            self.profile = profile or {}

        def preview_frame(self) -> CameraFrame:
            calls["preview"] += 1
            return CameraFrame(
                array=frame,
                timestamp_ms=1779448000456,
                camera_meta={"model": "live-fixture", "pixel_format": self.profile.get("pixel_format", "mono8")},
            )

        def close(self) -> None:
            calls["close"] += 1

    monkeypatch.setattr(main, "HikMvsCameraSource", FakeCameraSource)
    monkeypatch.setattr(
        main,
        "_hardware_config",
        lambda: SimpleNamespace(camera=SimpleNamespace(to_profile=lambda: {"pixel_format": "mono8"})),
    )

    client = TestClient(main.app)
    response = client.post(
        "/api/camera/setup-probe",
        json={"measurement_definition": _probe_measurement()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert calls == {"preview": 1, "close": 1}
    assert payload["frame"]["timestamp_ms"] == 1779448000456
    assert payload["frame"]["shape"] == [80, 120]
    assert payload["camera_status"] == "ok"
    assert payload["camera_meta"]["model"] == "live-fixture"
    assert payload["detection_result"]["detection_status"] == "VALID"
    assert payload["image_data_url"].startswith("data:image/png;base64,")


def _probe_measurement() -> dict[str, object]:
    return {
        "measurement_id": "real-camera-setup-probe",
        "source": "real_camera",
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
    }


def _probe_frame_data_url() -> str:
    import base64
    import io

    frame = np.full((80, 120), 245, dtype=np.uint8)
    frame[25:46, 35:86] = 30
    image = Image.fromarray(frame, mode="L")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
