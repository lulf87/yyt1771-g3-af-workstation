from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core.enums import DetectionStatus, TemperatureSyncStatus
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionQuality,
    DetectionResult,
    FrameRecord,
    TemperatureRecord,
)
from yyt1771_g3.storage.run_results_db import RunResultsDatabase


def _detection(frame_index: int, region_index: int) -> DetectionResult:
    a = ABPoint(x=10.0 + region_index, y=20.0)
    b = ABPoint(x=30.0 + region_index, y=20.0)
    points = ABPoints(a=a, b=b)
    candidate = DetectionCandidate(
        candidate_id=f"{frame_index}-{region_index}",
        axis_position_px=20.0,
        width_px=20.0,
        a=a,
        b=b,
        confidence=0.9,
        metadata={"large_debug_payload": "x" * 1000},
    )
    return DetectionResult(
        frame_index=frame_index,
        region_id=f"region_{region_index}",
        region_index=region_index,
        region_label=f"位置 {region_index}",
        detection_status=DetectionStatus.VALID,
        ab_points=points,
        raw_ab_points=points,
        stabilized_ab_points=points,
        distance_px=20.0,
        raw_distance_px=20.0,
        stabilized_distance_px=20.0,
        selected_candidate=candidate,
        raw_best_candidate=candidate,
        stabilized_candidate=candidate,
        quality=DetectionQuality(confidence=0.9),
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
        frame_timestamp_ms=frame_index * 100,
        temperature_timestamp_ms=frame_index * 100,
        temperature_celsius=25.0,
        debug_artifacts={"large_debug_payload": "y" * 5000},
    )


def test_compact_database_writes_each_frame_region_once(tmp_path: Path) -> None:
    path = tmp_path / "results.sqlite"
    frames = [
        FrameRecord(frame_index=index, shape=[100, 200], dtype="uint8", source="test")
        for index in range(1, 4)
    ]
    temperatures = [TemperatureRecord(timestamp_ms=index * 100, celsius=25.0) for index in range(1, 4)]
    detections = [_detection(frame, region) for frame in range(1, 4) for region in range(1, 7)]

    with RunResultsDatabase(path) as database:
        database.append_batch(frames, temperatures, detections)
        database.append_batch(frames, temperatures, detections)
        assert database.frame_count() == 3
        assert database.result_count() == 18
        assert database.result_count(region_id="region_3") == 3
        items, total = database.query_results(region_id="region_3", limit=2)
        assert total == 3
        assert len(items) == 2
        assert database.frame_results(2)[0]["frame_index"] == 2

    assert path.stat().st_size < 100_000


def test_normal_valid_detection_does_not_persist_large_diagnostics(tmp_path: Path) -> None:
    path = tmp_path / "results.sqlite"
    with RunResultsDatabase(path) as database:
        database.append_batch(
            [FrameRecord(frame_index=1, shape=[100, 200], dtype="uint8", source="test")],
            [TemperatureRecord(timestamp_ms=100, celsius=25.0)],
            [_detection(1, 1)],
        )
        count = database.connection.execute("SELECT COUNT(*) FROM diagnostic_events").fetchone()[0]
        columns = {row[1] for row in database.connection.execute("PRAGMA table_info(region_results)")}
        assert count == 0
        assert "debug_artifacts" not in columns
        assert "rejected_candidates" not in columns
        assert "selected_candidate" not in columns


def test_4816_frames_six_regions_stay_compact_and_unique(tmp_path: Path) -> None:
    path = tmp_path / "results.sqlite"
    with RunResultsDatabase(path) as database:
        for batch_start in range(1, 4817, 100):
            batch_end = min(batch_start + 100, 4817)
            frames = [
                FrameRecord(frame_index=index, shape=[1364, 2048], dtype="uint8", source="fixture")
                for index in range(batch_start, batch_end)
            ]
            temperatures = [
                TemperatureRecord(timestamp_ms=index * 100, celsius=20.0 + index / 1000)
                for index in range(batch_start, batch_end)
            ]
            detections = [
                _detection(frame_index, region_index)
                for frame_index in range(batch_start, batch_end)
                for region_index in range(1, 7)
            ]
            database.append_batch(frames, temperatures, detections)
        assert database.frame_count() == 4816
        assert database.result_count() == 28_896

    assert path.stat().st_size < 20 * 1024 * 1024
