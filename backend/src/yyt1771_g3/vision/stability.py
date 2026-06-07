from __future__ import annotations

from dataclasses import dataclass

from yyt1771_g3.core.models import DetectionCandidate, DetectorConfig


@dataclass(frozen=True)
class CandidateSelectionState:
    selected_candidate: DetectionCandidate | None = None
    pending_candidate_id: str | None = None
    pending_count: int = 0


@dataclass(frozen=True)
class CandidateSelection:
    raw_best_candidate: DetectionCandidate
    selected_candidate: DetectionCandidate | None
    rejected_candidates: list[DetectionCandidate]
    rejected_reason: str
    state: CandidateSelectionState


def select_stable_candidate(
    candidates: list[DetectionCandidate],
    state: CandidateSelectionState,
    config: DetectorConfig,
) -> CandidateSelection:
    if not candidates:
        raise ValueError("candidates must not be empty")

    raw_best = max(candidates, key=lambda item: item.width_px)
    previous = state.selected_candidate
    if previous is None:
        return CandidateSelection(
            raw_best_candidate=raw_best,
            selected_candidate=raw_best,
            rejected_candidates=[candidate for candidate in candidates if candidate != raw_best],
            rejected_reason="",
            state=CandidateSelectionState(selected_candidate=raw_best),
        )

    if _candidate_jump(raw_best, previous) > config.jump_limit_px and raw_best.confidence < config.min_confidence:
        return CandidateSelection(
            raw_best_candidate=raw_best,
            selected_candidate=None,
            rejected_candidates=[_reject(candidate, "JUMP_EXCEEDS_LIMIT") for candidate in candidates],
            rejected_reason="JUMP_EXCEEDS_LIMIT",
            state=state,
        )

    tied = [
        candidate
        for candidate in candidates
        if raw_best.width_px - candidate.width_px <= config.tie_width_epsilon_px
    ]
    if len(tied) > 1:
        selected = min(tied, key=lambda candidate: _candidate_jump(candidate, previous))
        return CandidateSelection(
            raw_best_candidate=raw_best,
            selected_candidate=selected,
            rejected_candidates=[
                _reject(candidate, "WIDTH_TIE_LOST_TO_PREVIOUS")
                for candidate in tied
                if candidate != selected
            ]
            + [candidate for candidate in candidates if candidate not in tied],
            rejected_reason="",
            state=CandidateSelectionState(selected_candidate=selected),
        )

    width_gain = raw_best.width_px - previous.width_px
    obvious_gain = config.tie_width_epsilon_px * 3.0
    if width_gain >= obvious_gain:
        return CandidateSelection(
            raw_best_candidate=raw_best,
            selected_candidate=raw_best,
            rejected_candidates=[candidate for candidate in candidates if candidate != raw_best],
            rejected_reason="",
            state=CandidateSelectionState(selected_candidate=raw_best),
        )

    if width_gain > config.tie_width_epsilon_px:
        pending_count = (
            state.pending_count + 1
            if state.pending_candidate_id == raw_best.candidate_id
            else 1
        )
        if pending_count >= config.switch_after_n_frames:
            return CandidateSelection(
                raw_best_candidate=raw_best,
                selected_candidate=raw_best,
                rejected_candidates=[candidate for candidate in candidates if candidate != raw_best],
                rejected_reason="",
                state=CandidateSelectionState(selected_candidate=raw_best),
            )

        hold = _nearest_to_previous(candidates, previous)
        return CandidateSelection(
            raw_best_candidate=raw_best,
            selected_candidate=hold,
            rejected_candidates=[
                _reject(raw_best, "WAITING_FOR_CONSECUTIVE_BETTER_FRAMES")
            ]
            + [candidate for candidate in candidates if candidate != raw_best and candidate != hold],
            rejected_reason="",
            state=CandidateSelectionState(
                selected_candidate=hold,
                pending_candidate_id=raw_best.candidate_id,
                pending_count=pending_count,
            ),
        )

    selected = _nearest_to_previous(candidates, previous)
    return CandidateSelection(
        raw_best_candidate=raw_best,
        selected_candidate=selected,
        rejected_candidates=[candidate for candidate in candidates if candidate != selected],
        rejected_reason="",
        state=CandidateSelectionState(selected_candidate=selected),
    )


def _nearest_to_previous(
    candidates: list[DetectionCandidate],
    previous: DetectionCandidate,
) -> DetectionCandidate:
    return min(candidates, key=lambda candidate: _candidate_jump(candidate, previous))


def _candidate_jump(candidate: DetectionCandidate, previous: DetectionCandidate) -> float:
    return abs(candidate.axis_position_px - previous.axis_position_px)


def _reject(candidate: DetectionCandidate, reason: str) -> DetectionCandidate:
    return candidate.model_copy(update={"rejected_reason": reason})
