from __future__ import annotations

import json
from pathlib import Path
from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image


def _write_dataset(root: Path) -> None:
    frames_dir = root / "frames"
    frames_dir.mkdir(parents=True)
    np.save(frames_dir / "frame_000001.npy", np.zeros((4, 5), dtype=np.uint8))
    np.save(frames_dir / "frame_000002.npy", np.full((4, 5), 255, dtype=np.uint8))
    (root / "manifest.json").write_text(
        json.dumps({"frame_count": 2, "frames": [{"index": 1}, {"index": 2}]}),
        encoding="utf-8",
    )
    (root / "temperature.csv").write_text(
        "frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius\n"
        "1,1000,1000,1.0\n"
        "2,1100,1100,1.1\n",
        encoding="utf-8",
    )


def test_offline_dataset_api_lists_summary_and_edge_frame_png(
    tmp_path: Path,
    monkeypatch,
) -> None:
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
                        "id": "golden_test",
                        "label": "Golden test",
                        "object_class": "C_BUNDLE_ENVELOPE",
                        "g3_type": "C",
                        "root_path": str(dataset_root),
                        "manifest": "manifest.json",
                        "temperature_csv": "temperature.csv",
                        "frames_dir": "frames",
                        "frame_glob": "frame_*.npy",
                        "default_detector": "BundleEnvelopeDetector",
                        "default_width_mode": "max_width",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(config_path))

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.get("/api/offline-datasets")
    assert response.status_code == 200
    assert response.json()["datasets"][0]["id"] == "golden_test"
    assert response.json()["datasets"][0]["frame_count"] == 2

    summary = client.get("/api/offline-datasets/golden_test").json()
    assert summary["dataset"]["object_class"] == "C_BUNDLE_ENVELOPE"
    assert summary["manifest"]["frame_count"] == 2
    assert summary["temperature"]["row_count"] == 2
    assert summary["first_frame"]["shape"] == [4, 5]
    assert summary["last_frame"]["frame_index"] == 2

    png = client.get("/api/offline-datasets/golden_test/frames/first.png")
    assert png.status_code == 200
    assert png.headers["content-type"] == "image/png"
    assert png.content.startswith(b"\x89PNG")

    display_png = client.get("/api/offline-datasets/golden_test/frames/first.png?max_width=3")
    assert display_png.status_code == 200
    display_image = Image.open(BytesIO(display_png.content))
    assert display_image.size == (3, 2)

    invalid_png = client.get("/api/offline-datasets/golden_test/frames/first.png?max_width=0")
    assert invalid_png.status_code == 400


def test_missing_default_registry_is_optional_for_production_real_hardware(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", raising=False)
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "real_hardware")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "production")

    from yyt1771_g3.api.main import app

    response = TestClient(app).get("/api/offline-datasets")

    assert response.status_code == 200
    assert response.json() == {"datasets": []}


def test_explicit_missing_registry_remains_an_error_in_development(
    tmp_path: Path,
    monkeypatch,
) -> None:
    missing_config = tmp_path / "missing.json"
    monkeypatch.setenv("YYT1771_G3_OFFLINE_DATASETS_CONFIG", str(missing_config))
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "real_hardware")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "development")

    from yyt1771_g3.api.main import app

    response = TestClient(app).get("/api/offline-datasets")

    assert response.status_code == 500
    assert str(missing_config) in response.json()["detail"]
