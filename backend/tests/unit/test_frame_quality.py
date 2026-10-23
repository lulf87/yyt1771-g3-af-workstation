from __future__ import annotations

import pytest

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus
from yyt1771_g3.core.models import DetectionResult
from yyt1771_g3.services.frame_quality import (
    FRAME_DATA_LOSS_REASON,
    FRAME_LOST_PACKET_LIMIT,
    frame_has_data_loss,
    frame_lost_packet_count,
    invalidate_on_frame_data_loss,
)


def _valid_detection() -> DetectionResult:
    return DetectionResult.model_validate(
        {
            "frame_index": 7,
            "detection_status": "VALID",
            "ab_points": {"a": {"x": 10.0, "y": 20.0}, "b": {"x": 110.0, "y": 20.0}},
            "distance_px": 100.0,
            "selected_candidate": {
                "candidate_id": "cand_1",
                "axis_position_px": 20.0,
                "width_px": 100.0,
                "a": {"x": 10.0, "y": 20.0},
                "b": {"x": 110.0, "y": 20.0},
            },
        }
    )


def test_lost_packet_count_tolerates_missing_or_bad_meta() -> None:
    assert frame_lost_packet_count(None) == 0
    assert frame_lost_packet_count({}) == 0
    assert frame_lost_packet_count({"camera_lost_packet_count": None}) == 0
    assert frame_lost_packet_count({"camera_lost_packet_count": "n/a"}) == 0
    assert frame_lost_packet_count({"camera_lost_packet_count": -4}) == 0
    assert frame_lost_packet_count({"camera_lost_packet_count": 3021}) == 3021


def test_frame_has_data_loss_uses_the_configured_limit() -> None:
    at_limit = {"camera_lost_packet_count": FRAME_LOST_PACKET_LIMIT}
    over_limit = {"camera_lost_packet_count": FRAME_LOST_PACKET_LIMIT + 1}

    assert frame_has_data_loss(at_limit) is False
    assert frame_has_data_loss(over_limit) is True
    assert frame_has_data_loss(over_limit, limit=0) is True


def test_clean_frame_keeps_the_valid_detection() -> None:
    detection = _valid_detection()

    untouched = invalidate_on_frame_data_loss(detection, {"camera_lost_packet_count": 2})

    assert untouched.detection_status is DetectionStatus.VALID
    assert untouched.distance_px == pytest.approx(100.0)


def test_lossy_frame_downgrades_to_invalid_frame_data_loss() -> None:
    detection = _valid_detection()

    degraded = invalidate_on_frame_data_loss(detection, {"camera_lost_packet_count": 3021})

    assert degraded.detection_status is DetectionStatus.INVALID_FRAME_DATA_LOSS
    assert degraded.ab_points is None
    assert degraded.measurement_segment is None
    assert degraded.distance_px is None
    assert degraded.raw_ab_points is None
    assert degraded.raw_distance_px is None
    assert degraded.rejected_reason == FRAME_DATA_LOSS_REASON
    assert degraded.curve_point_status is CurvePointStatus.INVALID_DETECTION


def test_lossy_frame_does_not_overwrite_an_existing_rejection_reason() -> None:
    already_invalid = DetectionResult.model_validate(
        {
            "frame_index": 9,
            "detection_status": "INVALID_NO_TARGET",
            "rejected_reason": "no target in band",
        }
    )

    result = invalidate_on_frame_data_loss(already_invalid, {"camera_lost_packet_count": 500})

    assert result.detection_status is DetectionStatus.INVALID_NO_TARGET
    assert result.rejected_reason == "no target in band"
