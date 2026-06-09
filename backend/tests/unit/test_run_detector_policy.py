from __future__ import annotations

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    DetectionQuality,
    DetectorConfig,
    MeasurementDefinition,
    RotatedROI,
)
from yyt1771_g3.services.run_detector_policy import (
    RunDetectorPolicyState,
    analyze_detection_suspicion,
    annotate_run_detection,
    should_rerun_with_enhanced,
)


def _measurement(config: DetectorConfig) -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id="policy-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=50.0, center_y=20.0, width=100.0, height=40.0),
        detector_config=config,
    )


def _candidate() -> DetectionCandidate:
    return DetectionCandidate(
        candidate_id="row-20",
        axis_position_px=20.0,
        width_px=80.0,
        a=ABPoint(x=10.0, y=20.0),
        b=ABPoint(x=90.0, y=20.0),
        confidence=0.9,
        metadata={"local_min_along_px": 10.0, "local_max_along_px": 90.0},
    )


def _valid_detection(
    *,
    frame_index: int = 1,
    debug: dict[str, object] | None = None,
    jump_from_previous_px: float | None = None,
    confidence: float = 0.9,
) -> DetectionResult:
    candidate = _candidate()
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=candidate.width_px,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
        quality=DetectionQuality(confidence=confidence, jump_from_previous_px=jump_from_previous_px),
        debug_artifacts={
            "detector_execution_mode": "fast",
            "diagnostics_generated": False,
            "diagnostics_runtime_ms": 0.0,
            "diagnostics_image_count": 0,
            **(debug or {}),
        },
    )


def test_contour_edge_warning_is_suspicious_but_not_rerun_worthy_by_default() -> None:
    measurement = _measurement(
        DetectorConfig(
            run_detector_mode="fast",
            run_diagnostics_mode="off",
            run_enhanced_detector_policy="rerun_worthy_only",
            run_enhanced_detector_on_suspicious=True,
        )
    )
    detection = _valid_detection(debug={"contour_touches_roi_edge": True})

    analysis = analyze_detection_suspicion(detection, measurement, RunDetectorPolicyState()).analysis

    assert analysis.suspicious is True
    assert analysis.suspicious_reasons == ["contour_touches_roi_edge"]
    assert analysis.warning_only_reasons == ["contour_touches_roi_edge"]
    assert analysis.rerun_worthy_reasons == []
    assert should_rerun_with_enhanced(detection, measurement, analysis=analysis) is False

    annotated = annotate_run_detection(
        detection,
        measurement=measurement,
        analysis=analysis,
        enhanced_rerun_used=False,
    )
    debug = annotated.debug_artifacts
    assert debug["run_detector_mode"] == "fast"
    assert debug["run_diagnostics_mode"] == "off"
    assert debug["run_enhanced_detector_policy"] == "rerun_worthy_only"
    assert debug["run_enhanced_detector_on_suspicious"] is True
    assert debug["detector_execution_mode"] == "fast"
    assert debug["suspicious"] is True
    assert debug["warning_only_reasons"] == ["contour_touches_roi_edge"]
    assert debug["rerun_worthy_reasons"] == []
    assert debug["enhanced_rerun_used"] is False
    assert debug["enhanced_rerun_reason"] == []
    assert debug["diagnostics_generated"] is False
    assert "diagnostic_images" not in debug


def test_all_suspicious_policy_preserves_contour_edge_enhanced_rerun() -> None:
    measurement = _measurement(
        DetectorConfig(
            run_detector_mode="fast",
            run_diagnostics_mode="off",
            run_enhanced_detector_policy="all_suspicious",
            run_enhanced_detector_on_suspicious=True,
        )
    )
    detection = _valid_detection(debug={"contour_touches_roi_edge": True})
    analysis = analyze_detection_suspicion(detection, measurement, RunDetectorPolicyState()).analysis

    assert analysis.warning_only_reasons == ["contour_touches_roi_edge"]
    assert analysis.rerun_worthy_reasons == []
    assert should_rerun_with_enhanced(detection, measurement, analysis=analysis) is True


def test_endpoint_jump_requires_post_warmup_consecutive_frames() -> None:
    measurement = _measurement(
        DetectorConfig(
            run_detector_mode="fast",
            run_diagnostics_mode="off",
            run_enhanced_detector_policy="rerun_worthy_only",
            endpoint_jump_limit_px=12.0,
            endpoint_jump_warmup_frames=3,
            endpoint_jump_confirm_frames=2,
        )
    )
    state = RunDetectorPolicyState()
    rerun_worthy_by_frame: list[list[str]] = []

    for frame_index in range(1, 6):
        evaluated = analyze_detection_suspicion(
            _valid_detection(frame_index=frame_index, jump_from_previous_px=18.0),
            measurement,
            state,
        )
        state = evaluated.next_state
        rerun_worthy_by_frame.append(evaluated.analysis.rerun_worthy_reasons)

    assert rerun_worthy_by_frame == [[], [], [], [], ["endpoint_jump_px_above_limit"]]


def test_endpoint_jump_streak_resets_on_normal_frame() -> None:
    measurement = _measurement(
        DetectorConfig(
            run_detector_mode="fast",
            run_diagnostics_mode="off",
            run_enhanced_detector_policy="rerun_worthy_only",
            endpoint_jump_limit_px=12.0,
            endpoint_jump_warmup_frames=0,
            endpoint_jump_confirm_frames=2,
        )
    )
    state = RunDetectorPolicyState()

    first_jump = analyze_detection_suspicion(
        _valid_detection(frame_index=1, jump_from_previous_px=18.0),
        measurement,
        state,
    )
    normal = analyze_detection_suspicion(
        _valid_detection(frame_index=2, jump_from_previous_px=2.0),
        measurement,
        first_jump.next_state,
    )
    second_jump = analyze_detection_suspicion(
        _valid_detection(frame_index=3, jump_from_previous_px=18.0),
        measurement,
        normal.next_state,
    )

    assert first_jump.analysis.rerun_worthy_reasons == []
    assert normal.analysis.rerun_worthy_reasons == []
    assert second_jump.analysis.rerun_worthy_reasons == []


def test_detection_status_not_ok_is_rerun_worthy() -> None:
    measurement = _measurement(
        DetectorConfig(
            run_detector_mode="fast",
            run_diagnostics_mode="off",
            run_enhanced_detector_policy="rerun_worthy_only",
        )
    )
    detection = DetectionResult(
        frame_index=1,
        detection_status=DetectionStatus.INVALID_BAD_ENVELOPE,
        rejected_reason="NO_VALID_ARCHIVED_CONTOUR",
    )

    analysis = analyze_detection_suspicion(detection, measurement, RunDetectorPolicyState()).analysis

    assert analysis.suspicious_reasons == ["detection_status_not_ok"]
    assert analysis.warning_only_reasons == []
    assert analysis.rerun_worthy_reasons == ["detection_status_not_ok"]
    assert should_rerun_with_enhanced(detection, measurement, analysis=analysis) is True
