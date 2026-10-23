"""Frame-level quality gates applied before a detection becomes a formal result.

A GigE frame that lost packets arrives truncated: the SDK still hands over a full-size buffer,
but parts of it are stale or empty. The detector then happily measures whatever it finds there,
which is exactly the "looks normal but is wrong" case the G3 requirements forbid.

The gateway here is intentionally one-way: it can only downgrade ``VALID`` to
``INVALID_FRAME_DATA_LOSS``. It never upgrades a detection and never touches a frame that is
already INVALID, so existing rejection reasons are preserved.
"""

from __future__ import annotations

from typing import Any

from yyt1771_g3.core.enums import DetectionStatus
from yyt1771_g3.core.models import DetectionResult


#: Per-frame GigE lost-packet count above which the frame is not trusted.
#: A healthy link reports 0; the slack absorbs the occasional isolated drop.
FRAME_LOST_PACKET_LIMIT = 8

FRAME_DATA_LOSS_REASON = "相机丢包：帧数据不完整，已判 INVALID"


def frame_lost_packet_count(camera_meta: dict[str, Any] | None) -> int:
    """Return the per-frame lost packet count reported by the camera SDK (0 when unknown)."""

    if not camera_meta:
        return 0
    try:
        parsed = int(camera_meta.get("camera_lost_packet_count"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return parsed if parsed > 0 else 0


def frame_has_data_loss(
    camera_meta: dict[str, Any] | None,
    *,
    limit: int = FRAME_LOST_PACKET_LIMIT,
) -> bool:
    return frame_lost_packet_count(camera_meta) > limit


def invalidate_on_frame_data_loss(
    detection: DetectionResult,
    camera_meta: dict[str, Any] | None,
    *,
    limit: int = FRAME_LOST_PACKET_LIMIT,
) -> DetectionResult:
    """Downgrade a detection computed from a lossy camera frame to INVALID."""

    if frame_lost_packet_count(camera_meta) <= limit:
        return detection
    if detection.detection_status != DetectionStatus.VALID:
        return detection
    payload = detection.model_dump()
    payload.update(
        {
            "detection_status": DetectionStatus.INVALID_FRAME_DATA_LOSS,
            "ab_points": None,
            "measurement_segment": None,
            "distance_px": None,
            "raw_ab_points": None,
            "raw_distance_px": None,
            "stabilized_ab_points": None,
            "stabilized_distance_px": None,
            "rejected_reason": FRAME_DATA_LOSS_REASON,
        }
    )
    return DetectionResult.model_validate(payload)
