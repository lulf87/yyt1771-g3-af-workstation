from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from yyt1771_g3.core.enums import DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI
from yyt1771_g3.services.live_offline_run_service import (
    iter_live_offline_run_events,
    read_run,
    run_live_offline_dataset,
)
from yyt1771_g3.services.offline_dataset import load_dataset_registry
from yyt1771_g3.storage.run_store import RunStore


def _write_run_dataset(root: Path, frame_count: int = 3) -> None:
    frames_dir = root / "frames"
    frames_dir.mkdir(parents=True)
    frames = []
    temp_rows = ["frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius,source,sampled_this_frame,error"]
    for index in range(1, frame_count + 1):
        y0 = 24 + index
        frame = np.full((80, 120), 245, dtype=np.uint8)
        frame[y0 : y0 + 20, 35:86] = 30
        np.save(frames_dir / f"frame_{index:06d}.npy", frame)
        timestamp = 1000 + (index - 1) * 100
        frames.append(
            {
                "index": index,
                "npy": f"frames/frame_{index:06d}.npy",
                "timestamp_ms": timestamp,
                "shape": [80, 120],
                "dtype": "uint8",
            }
        )
        temp_rows.append(f"{index},{timestamp},{timestamp + 2},{20 + index},fixture,1,")
    (root / "manifest.json").write_text(json.dumps({"frame_count": frame_count, "frames": frames}), encoding="utf-8")
    (root / "temperature.csv").write_text("\n".join(temp_rows) + "\n", encoding="utf-8")


def _write_registry(config_path: Path, dataset_root: Path) -> None:
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "g3.offline_datasets.v0.1",
                "datasets": [
                    {
                        "id": "golden_run",
                        "label": "Golden run",
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


def test_live_offline_run_saves_manifest_and_analysis(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=3,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    result = run_live_offline_dataset(
        registry,
        run_store,
        dataset_id="golden_run",
        measurement=measurement,
        start_frame=1,
        max_frames=3,
        target_fps=8.0,
    )

    assert result.manifest.run_id
    assert len(result.manifest.frame_records) == 3
    assert len(result.manifest.detection_results) == 3
    assert all(item.detection_status.value == "VALID" for item in result.manifest.detection_results)
    assert [point.frame_index for point in result.analysis.temperature_distance] == [1, 2, 3]

    restored = run_store.read_run_manifest(result.manifest.run_id)
    assert restored == result.manifest


def test_live_offline_run_honors_explicit_frame_request_beyond_config_cap(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=5)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-all-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=3,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    result = run_live_offline_dataset(
        registry,
        run_store,
        dataset_id="golden_run",
        measurement=measurement,
        start_frame=1,
        max_frames=5,
        target_fps=8.0,
    )

    assert len(result.manifest.frame_records) == 5
    assert len(result.manifest.detection_results) == 5


def test_live_offline_run_defaults_to_remaining_dataset_frames(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=5)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-remaining-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=3,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    result = run_live_offline_dataset(
        registry,
        run_store,
        dataset_id="golden_run",
        measurement=measurement,
        start_frame=2,
        max_frames=None,
        target_fps=8.0,
    )

    assert [record.frame_index for record in result.manifest.frame_records] == [2, 3, 4, 5]
    assert len(result.manifest.detection_results) == 4
    assert result.manifest.config_snapshot["max_frames"] == 4


def test_live_offline_run_stops_and_saves_analysis_when_target_temperature_reached(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=5)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-target-temperature-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=5,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
            target_temperature_celsius=22.0,
        ),
    )

    result = run_live_offline_dataset(
        registry,
        run_store,
        dataset_id="golden_run",
        measurement=measurement,
        start_frame=1,
        max_frames=5,
        target_fps=8.0,
    )

    assert [record.frame_index for record in result.manifest.frame_records] == [1, 2]
    assert [point.frame_index for point in result.analysis.temperature_distance] == [1, 2]
    assert result.manifest.config_snapshot["stop_reason"] == "target_temperature_reached"


def test_streamed_live_offline_run_saves_partial_result_when_stopped(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=4)
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-stopped-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=4,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    events = iter_live_offline_run_events(
        registry,
        run_store,
        dataset_id="golden_run",
        measurement=measurement,
        start_frame=1,
        max_frames=4,
        target_fps=8.0,
    )
    first_event = next(events)
    run_id = first_event["run_id"]

    events.close()

    stopped_result = read_run(run_store, run_id)
    assert [record.frame_index for record in stopped_result.manifest.frame_records] == [1]
    assert [result.frame_index for result in stopped_result.manifest.detection_results] == [1]
    assert [point.frame_index for point in stopped_result.analysis.temperature_distance] == [1]
    assert stopped_result.manifest.config_snapshot["stop_reason"] == "stream_closed"


def test_streamed_live_offline_run_frame_events_emit_lightweight_smoothed_afas_preview(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=21)
    (dataset_root / "temperature.csv").write_text(
        "\n".join(
            ["frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius,source,sampled_this_frame,error"]
            + [
                f"{index},{1000 + (index - 1) * 100},{1002 + (index - 1) * 100},{20.0 + index * 0.01:.2f},fixture,1,"
                for index in range(1, 22)
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-afas-preview-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=21,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    events = list(
        iter_live_offline_run_events(
            registry,
            run_store,
            dataset_id="golden_run",
            measurement=measurement,
            start_frame=1,
            max_frames=21,
            target_fps=8.0,
        )
    )

    frame_events = [event for event in events if event["event"] == "frame"]
    assert len(frame_events) == 21
    updated_previews = [
        event["afas_preprocessing"]
        for event in frame_events
        if event["afas_preprocessing"].get("preview_status") == "updated"
    ]
    assert updated_previews
    preview = updated_previews[-1]
    assert set(preview) == {
        "preview_status",
        "point_count",
        "temperature_distance_point_count",
        "preview_interval_frames",
        "schema_version",
        "parameters",
        "smoothed",
        "warnings",
    }
    assert preview["temperature_distance_point_count"] == 20
    assert len(preview["smoothed"]["temperature_celsius"]) == 20
    assert len(preview["smoothed"]["values"]) == 20
    assert preview["smoothed"]["applied"] is True
    assert preview["smoothed"]["effective_savgol_window_length"] == 11
    assert "raw" not in preview
    assert "grouped" not in preview
    assert "outlier_repair" not in preview
    assert all(event["afas_analysis"] == {"result_status": "pending"} for event in frame_events)

    complete = [event for event in events if event["event"] == "complete"][0]
    final_preview = complete["analysis_result"]["afas_preprocessing"]
    assert len(final_preview["raw"]["temperature_celsius"]) == 21
    assert final_preview["grouped"]["applied"] is True
    assert len(final_preview["smoothed"]["temperature_celsius"]) == 21


def test_streamed_live_offline_run_short_frame_events_defer_afas_preview(tmp_path: Path) -> None:
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    _write_run_dataset(dataset_root, frame_count=4)
    (dataset_root / "temperature.csv").write_text(
        "\n".join(
            [
                "frame_index,camera_timestamp_ms,temp_timestamp_ms,celsius,source,sampled_this_frame,error",
                "1,1000,1002,21.0,fixture,1,",
                "2,1100,1102,21.0,fixture,1,",
                "3,1200,1202,22.0,fixture,1,",
                "4,1300,1302,22.0,fixture,1,",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    config_path = tmp_path / "offline_datasets.local.json"
    _write_registry(config_path, dataset_root)
    registry = load_dataset_registry(config_path)
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="run-afas-preview-measurement",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=4,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )

    events = list(
        iter_live_offline_run_events(
            registry,
            run_store,
            dataset_id="golden_run",
            measurement=measurement,
            start_frame=1,
            max_frames=4,
            target_fps=8.0,
        )
    )

    frame_events = [event for event in events if event["event"] == "frame"]
    assert len(frame_events) == 4
    for event in frame_events:
        assert event["afas_preprocessing"] == {
            "preview_status": "deferred_until_complete",
            "point_count": event["processed_frames"],
        }
        assert event["afas_analysis"] == {"result_status": "pending"}

    complete = [event for event in events if event["event"] == "complete"][0]
    final_preview = complete["analysis_result"]["afas_preprocessing"]
    assert len(final_preview["raw"]["temperature_celsius"]) == 4
    assert final_preview["grouped"]["applied"] is True
    assert final_preview["grouped"]["temperature_celsius"] == [21.0, 22.0]
    assert final_preview["smoothed"]["temperature_celsius"] == [21.0, 22.0]
    assert complete["analysis_result"]["afas_analysis"]["reason"] == "insufficient_points"
