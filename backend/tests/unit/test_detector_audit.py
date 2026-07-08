from __future__ import annotations

import pytest

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    MeasurementDefinition,
    RotatedROI,
    RunManifest,
)
from yyt1771_g3.services.detector_audit import audit_run_manifest


def _candidate(width: float) -> DetectionCandidate:
    return DetectionCandidate(
        candidate_id="candidate",
        axis_position_px=10.0,
        width_px=width,
        a=ABPoint(x=0.0, y=0.0),
        b=ABPoint(x=width, y=0.0),
        confidence=0.9,
    )


def _valid(frame_index: int, width: float, debug: dict[str, object]) -> DetectionResult:
    candidate = _candidate(width)
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=width,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
        debug_artifacts=debug,
    )


def _manifest(
    detections: list[DetectionResult],
    *,
    object_class: ObjectClass = ObjectClass.A_BALLOON_ENVELOPE,
    detector: DetectorType = DetectorType.BALLOON_ENVELOPE,
) -> RunManifest:
    return RunManifest(
        run_id="audit-test",
        dataset_id="fixture",
        measurement_definition=MeasurementDefinition(
            measurement_id="audit-test",
            object_class=object_class,
            detector=detector,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=50.0, center_y=50.0, width=80.0, height=40.0),
        ),
        detection_results=detections,
    )


def test_audit_accepts_archived_mesh_same_window_sequence() -> None:
    manifest = _manifest(
        [
            _valid(
                1,
                100.0,
                {
                    "contour_measurement_mode": "archived_mesh_envelope_rows",
                    "mesh_selected_row_width_px": 100.0,
                },
            ),
            _valid(
                2,
                101.0,
                {
                    "contour_measurement_mode": "archived_mesh_envelope_rows",
                    "mesh_selected_row_width_px": 101.0,
                },
            ),
        ]
    )

    summary = audit_run_manifest(manifest, adjacent_jump_warn_px=12.0)

    assert summary["frame_count"] == 2
    assert summary["error_count"] == 0
    assert summary["warning_count"] == 0


def test_audit_flags_large_jump_invalid_and_a_same_window_violation() -> None:
    manifest = _manifest(
        [
            _valid(
                1,
                100.0,
                {
                    "contour_measurement_mode": "archived_mesh_envelope_rows",
                    "mesh_selected_row_width_px": 100.0,
                },
            ),
            _valid(
                2,
                132.0,
                {
                    "contour_measurement_mode": "archived_mesh_envelope_rows",
                    "mesh_selected_row_width_px": 120.0,
                },
            ),
            DetectionResult(
                frame_index=3,
                detection_status=DetectionStatus.INVALID_NO_TARGET,
                rejected_reason="NO_TARGET",
            ),
        ]
    )

    summary = audit_run_manifest(manifest, adjacent_jump_warn_px=12.0)

    assert summary["error_count"] == 2
    assert summary["warning_count"] == 1
    by_frame = {item["frame_index"]: item["flags"] for item in summary["flagged_frames"]}
    assert "A_SAME_WINDOW_DISTANCE_MISMATCH" in by_frame[2]
    assert "LARGE_ADJACENT_DISTANCE_JUMP" in by_frame[2]
    assert "INVALID_DETECTION" in by_frame[3]


def test_audit_requires_c_stable_support_columns() -> None:
    manifest = _manifest(
        [
            _valid(
                1,
                180.0,
                {
                    "contour_measurement_mode": "archived_wire_bundle_projection",
                    "wire_projection_mode": "global_quantile",
                },
            )
        ],
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
    )

    summary = audit_run_manifest(manifest, adjacent_jump_warn_px=12.0)

    assert summary["error_count"] == 1
    assert summary["flagged_frames"][0]["flags"] == ["C_WIRE_PROJECTION_NOT_STABLE_SUPPORT_COLUMNS"]


def test_audit_accepts_c_contrast_widest_span_mode() -> None:
    manifest = _manifest(
        [
            _valid(
                1,
                180.0,
                {
                    "contour_measurement_mode": "contrast_widest_span",
                    "detection_mode": "contrast_widest_span",
                    "selected_left_u": 12.0,
                    "selected_right_u": 192.0,
                    "selected_width_px": 180.0,
                },
            )
        ],
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
    )

    summary = audit_run_manifest(manifest, adjacent_jump_warn_px=12.0)

    assert summary["error_count"] == 0
    assert summary["warning_count"] == 0
