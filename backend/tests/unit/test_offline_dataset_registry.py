from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from yyt1771_g3.services.offline_dataset import (
    DatasetAccessError,
    load_dataset_registry,
)


def _write_dataset(root: Path) -> None:
    frames_dir = root / "frames"
    frames_dir.mkdir(parents=True)

    np.save(frames_dir / "frame_000001.npy", np.zeros((2, 3), dtype=np.uint8))
    np.save(frames_dir / "frame_000002.npy", np.full((2, 3), 7, dtype=np.uint8))

    (root / "manifest.json").write_text(
        json.dumps(
            {
                "frame_count": 2,
                "frames": [
                    {
                        "index": 1,
                        "npy": "frames/frame_000001.npy",
                        "timestamp_ms": 1000,
                        "shape": [2, 3],
                        "dtype": "uint8",
                    },
                    {
                        "index": 2,
                        "npy": "frames/frame_000002.npy",
                        "timestamp_ms": 1100,
                        "shape": [2, 3],
                        "dtype": "uint8",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    (root / "temperature.csv").write_text(
        "frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius\n"
        "1,1000,1001,1.2\n"
        "2,1100,1101,1.4\n",
        encoding="utf-8",
    )


def _write_registry(config_path: Path, dataset_root: Path) -> None:
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_test",
                        "label": "Golden test",
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


def test_registry_lists_resolves_and_loads_manifest_temperature_and_edge_frames(
    tmp_path: Path,
) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)

    registry = load_dataset_registry(config_path)

    datasets = registry.list_offline_datasets()
    assert datasets == [
        {
            "id": "golden_test",
            "label": "Golden test",
            "object_class": "A_BALLOON_ENVELOPE",
            "g3_type": "A",
            "default_detector": "BalloonEnvelopeDetector",
            "default_width_mode": "max_width",
            "frame_count": 2,
        }
    ]

    resolved = registry.resolve_dataset("golden_test")
    assert resolved.root_path == dataset_root
    assert resolved.manifest_path == dataset_root / "manifest.json"
    assert resolved.temperature_csv_path == dataset_root / "temperature.csv"
    assert resolved.frames_dir == dataset_root / "frames"
    assert [path.name for path in resolved.frame_paths] == [
        "frame_000001.npy",
        "frame_000002.npy",
    ]

    manifest = registry.load_manifest("golden_test")
    assert manifest["frame_count"] == 2
    assert manifest["frames"][0]["timestamp_ms"] == 1000

    temperatures = registry.load_temperature_csv("golden_test")
    assert temperatures[0]["frame_index"] == "1"
    assert temperatures[1]["celsius"] == "1.4"

    first = registry.load_first_frame("golden_test")
    last = registry.load_last_frame("golden_test")
    assert first.frame_index == 1
    assert last.frame_index == 2
    np.testing.assert_array_equal(first.array, np.zeros((2, 3), dtype=np.uint8))
    np.testing.assert_array_equal(last.array, np.full((2, 3), 7, dtype=np.uint8))


def test_resolve_dataset_reports_missing_required_files(tmp_path: Path) -> None:
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, tmp_path / "missing_dataset")

    registry = load_dataset_registry(config_path)

    with pytest.raises(DatasetAccessError) as exc_info:
        registry.resolve_dataset("golden_test")

    assert exc_info.value.dataset_id == "golden_test"
    assert "root_path is not accessible" in str(exc_info.value)
    assert any(issue["field"] == "root_path" for issue in exc_info.value.issues)


def test_list_and_resolve_do_not_load_frame_arrays(tmp_path: Path, monkeypatch) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)

    def fail_if_frame_array_is_loaded(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("np.load must only run when an explicit frame is requested")

    monkeypatch.setattr(np, "load", fail_if_frame_array_is_loaded)

    registry = load_dataset_registry(config_path)
    assert registry.list_offline_datasets()[0]["frame_count"] == 2
    resolved = registry.resolve_dataset("golden_test")
    assert [path.name for path in resolved.frame_paths] == [
        "frame_000001.npy",
        "frame_000002.npy",
    ]
