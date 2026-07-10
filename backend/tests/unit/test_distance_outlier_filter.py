from __future__ import annotations

import pytest

from yyt1771_g3.core.enums import DetectionStatus, TemperatureSyncStatus
from yyt1771_g3.core.models import ABPoint, ABPoints, CurvePoint, DetectionCandidate, DetectionResult, DetectorConfig
from yyt1771_g3.services.distance_outlier_filter import CausalDistanceOutlierFilter
from yyt1771_g3.services.live_point_status import build_live_point_status


def _valid_detection(
    frame_index: int,
    distance: float,
    *,
    region_id: str = "region_1",
    region_index: int = 1,
) -> DetectionResult:
    candidate = DetectionCandidate(
        candidate_id=f"candidate-{frame_index}",
        axis_position_px=float(frame_index),
        width_px=distance,
        a=ABPoint(x=0.0, y=0.0),
        b=ABPoint(x=distance, y=0.0),
        confidence=0.9,
    )
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        region_id=region_id,
        region_index=region_index,
        region_label=f"位置 {region_index}",
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=distance,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
        frame_timestamp_ms=frame_index * 100,
        temperature_timestamp_ms=frame_index * 100,
        temperature_celsius=20.0 + frame_index,
        temperature_delta_ms=0.0,
        temperature_sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
    )


def test_causal_distance_filter_rejects_jump_without_updating_reference_and_accepts_recovery() -> None:
    filter_state = CausalDistanceOutlierFilter(
        DetectorConfig(
            distance_outlier_filter_enabled=True,
            distance_outlier_reference_count=5,
            distance_outlier_max_jump_px=20.0,
            distance_outlier_baseline="median",
        )
    )

    filtered = [filter_state.apply(_valid_detection(index, distance)) for index, distance in enumerate([500, 503, 506, 550, 520], start=1)]

    assert [item.curve_point_status for item in filtered] == [
        "valid",
        "valid",
        "valid",
        "distance_jump_outlier",
        "valid",
    ]
    outlier = filtered[3]
    assert outlier.detection_status == DetectionStatus.VALID
    assert outlier.distance_px == pytest.approx(550.0)
    assert outlier.raw_detected_distance_px == pytest.approx(550.0)
    assert outlier.distance_outlier_filtered is True
    assert outlier.curve_exclusion_reason == "distance_jump_outlier"
    assert outlier.distance_outlier_baseline_px == pytest.approx(503.0)
    assert outlier.distance_outlier_deviation_px == pytest.approx(47.0)
    assert outlier.distance_outlier_reference_values == [500.0, 503.0, 506.0]
    assert outlier.debug_artifacts["outlier_filter_decision"] == "rejected"

    recovery = filtered[4]
    assert recovery.distance_outlier_filtered is False
    assert recovery.distance_outlier_baseline_px == pytest.approx(503.0)
    assert recovery.distance_outlier_deviation_px == pytest.approx(17.0)
    assert filter_state.recent_valid_distances == [500.0, 503.0, 506.0, 520.0]


def test_consecutive_outliers_do_not_become_the_next_baseline() -> None:
    filter_state = CausalDistanceOutlierFilter(
        DetectorConfig(
            distance_outlier_reference_count=5,
            distance_outlier_max_jump_px=20.0,
            distance_outlier_baseline="last",
        )
    )

    filtered = [filter_state.apply(_valid_detection(index, distance)) for index, distance in enumerate([500, 503, 506, 550, 555, 560, 518], start=1)]

    assert [item.curve_point_status for item in filtered] == [
        "valid",
        "valid",
        "valid",
        "distance_jump_outlier",
        "distance_jump_outlier",
        "distance_jump_outlier",
        "valid",
    ]
    assert filtered[3].distance_outlier_reference_values == [500.0, 503.0, 506.0]
    assert filtered[4].distance_outlier_reference_values == [500.0, 503.0, 506.0]
    assert filtered[5].distance_outlier_reference_values == [500.0, 503.0, 506.0]
    assert filtered[6].distance_outlier_baseline_px == pytest.approx(506.0)
    assert filter_state.recent_valid_distances == [500.0, 503.0, 506.0, 518.0]


def test_disabled_distance_filter_keeps_detection_untouched() -> None:
    filter_state = CausalDistanceOutlierFilter(DetectorConfig(distance_outlier_filter_enabled=False))

    result = filter_state.apply(_valid_detection(1, 550.0))

    assert result.curve_point_status == "valid"
    assert result.distance_outlier_filtered is False
    assert result.distance_outlier_baseline_px is None
    assert result.debug_artifacts["outlier_filter_decision"] == "disabled"


def test_filter_detection_sequence_by_region_keeps_baselines_independent() -> None:
    from yyt1771_g3.services import distance_outlier_filter as module

    config = DetectorConfig(
        distance_outlier_reference_count=5,
        distance_outlier_max_jump_px=10.0,
        distance_outlier_baseline="last",
    )
    results = [
        _valid_detection(1, 100.0, region_id="region_1", region_index=1),
        _valid_detection(1, 500.0, region_id="region_2", region_index=2),
        _valid_detection(2, 160.0, region_id="region_1", region_index=1),
        _valid_detection(2, 506.0, region_id="region_2", region_index=2),
    ]

    filtered = module.filter_detection_sequence_by_region(results, config)

    assert filtered[2].distance_outlier_filtered is True
    assert filtered[2].distance_outlier_baseline_px == pytest.approx(100.0)
    assert filtered[3].distance_outlier_filtered is False
    assert filtered[3].distance_outlier_baseline_px == pytest.approx(500.0)


def test_causal_filter_tracks_pending_consecutive_and_recovery_state() -> None:
    filter_state = CausalDistanceOutlierFilter(
        DetectorConfig(distance_outlier_max_jump_px=10.0, distance_outlier_baseline="last")
    )

    accepted = filter_state.apply(_valid_detection(1, 100.0))
    rejected = filter_state.apply(_valid_detection(2, 130.0))
    recovered = filter_state.apply(_valid_detection(3, 105.0))

    assert accepted.debug_artifacts["outlier_recovery_state"] == "stable"
    assert rejected.debug_artifacts["pending_outlier_distances"] == [130.0]
    assert rejected.debug_artifacts["consecutive_filtered_count"] == 1
    assert rejected.debug_artifacts["outlier_recovery_state"] == "filtering"
    assert recovered.debug_artifacts["pending_outlier_distances"] == []
    assert recovered.debug_artifacts["consecutive_filtered_count"] == 0
    assert recovered.debug_artifacts["outlier_recovery_state"] == "recovered"
    assert filter_state.pending_outlier_distances == []
    assert filter_state.consecutive_filtered_count == 0
    assert filter_state.recovery_state == "recovered"


def test_live_point_status_includes_region_identity() -> None:
    detection = _valid_detection(4, 120.0, region_id="region_2", region_index=2)
    point = CurvePoint(
        x=24.0,
        y=120.0,
        frame_index=4,
        sync_status=TemperatureSyncStatus.TEMP_SYNC_OK,
    )

    status = build_live_point_status(
        detection,
        {"temperature_distance": point},
        temperature_distance_point_count=7,
    )

    assert status["region_id"] == "region_2"
    assert status["region_index"] == 2
    assert status["region_label"] == "位置 2"
