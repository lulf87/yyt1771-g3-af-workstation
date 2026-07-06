from __future__ import annotations

from yyt1771_g3.core.models import ABPoint, DetectionCandidate, DetectorConfig
from yyt1771_g3.vision.stability import CandidateSelectionState, select_stable_candidate


def _candidate(candidate_id: str, axis: float, width: float, confidence: float = 0.9) -> DetectionCandidate:
    return DetectionCandidate(
        candidate_id=candidate_id,
        axis_position_px=axis,
        width_px=width,
        a=ABPoint(x=axis, y=0.0),
        b=ABPoint(x=axis, y=width),
        confidence=confidence,
    )


def test_tie_width_prefers_previous_candidate_position() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    state = CandidateSelectionState(selected_candidate=previous)
    config = DetectorConfig(tie_width_epsilon_px=2.0)

    selection = select_stable_candidate(
        [_candidate("left", 19.0, 99.0), _candidate("right", 80.0, 100.5)],
        state,
        config,
    )

    assert selection.selected_candidate.candidate_id == "left"
    assert selection.raw_best_candidate.candidate_id == "right"
    assert any(item.rejected_reason == "WIDTH_TIE_LOST_TO_PREVIOUS" for item in selection.rejected_candidates)


def test_continuous_better_candidate_switches_after_n_frames() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    config = DetectorConfig(tie_width_epsilon_px=2.0, switch_after_n_frames=3)
    state = CandidateSelectionState(selected_candidate=previous)

    first = select_stable_candidate([previous, _candidate("new", 30.0, 104.0)], state, config)
    second = select_stable_candidate([previous, _candidate("new", 30.0, 104.0)], first.state, config)
    third = select_stable_candidate([previous, _candidate("new", 30.0, 104.0)], second.state, config)

    assert first.selected_candidate.candidate_id == "prev"
    assert second.selected_candidate.candidate_id == "prev"
    assert third.selected_candidate.candidate_id == "new"
    assert second.state.pending_count == 2


def test_obviously_better_candidate_switches_immediately() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    config = DetectorConfig(tie_width_epsilon_px=2.0, switch_after_n_frames=3)

    selection = select_stable_candidate(
        [previous, _candidate("wide", 32.0, 112.0)],
        CandidateSelectionState(selected_candidate=previous),
        config,
    )

    assert selection.selected_candidate.candidate_id == "wide"
    assert selection.rejected_reason == ""


def test_low_confidence_large_jump_is_invalid_instead_of_wrong_ab() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    config = DetectorConfig(tie_width_epsilon_px=2.0, jump_limit_px=10.0, min_confidence=0.5)

    selection = select_stable_candidate(
        [_candidate("bad-jump", 80.0, 106.0, confidence=0.2)],
        CandidateSelectionState(selected_candidate=previous),
        config,
    )

    assert selection.selected_candidate is None
    assert selection.rejected_reason == "JUMP_EXCEEDS_LIMIT"
    assert selection.rejected_candidates[0].rejected_reason == "JUMP_EXCEEDS_LIMIT"


def test_distance_jump_guard_holds_previous_candidate_before_confirmation() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    config = DetectorConfig(
        distance_jump_limit_px=10.0,
        distance_jump_hold_frames=2,
        distance_jump_policy="hold_previous",
    )

    first = select_stable_candidate(
        [previous, _candidate("wide-row", 22.0, 123.0)],
        CandidateSelectionState(selected_candidate=previous),
        config,
    )
    second = select_stable_candidate(
        [previous, _candidate("wide-row", 22.0, 123.0)],
        first.state,
        config,
    )

    assert first.selected_candidate.candidate_id == "prev"
    assert first.distance_jump_guard_triggered is True
    assert first.rejected_candidates[0].rejected_reason == "DISTANCE_JUMP_GUARD_HELD_PREVIOUS"
    assert second.selected_candidate.candidate_id == "wide-row"


def test_distance_jump_guard_can_mark_candidate_invalid() -> None:
    previous = _candidate("prev", 20.0, 100.0)
    config = DetectorConfig(
        distance_jump_limit_px=10.0,
        distance_jump_hold_frames=2,
        distance_jump_policy="mark_invalid",
    )

    selection = select_stable_candidate(
        [_candidate("wide-row", 22.0, 123.0)],
        CandidateSelectionState(selected_candidate=previous),
        config,
    )

    assert selection.selected_candidate is None
    assert selection.distance_jump_guard_triggered is True
    assert selection.rejected_reason == "DISTANCE_JUMP_EXCEEDS_LIMIT"
