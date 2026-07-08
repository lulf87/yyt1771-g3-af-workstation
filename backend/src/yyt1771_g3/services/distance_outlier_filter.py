from __future__ import annotations

import statistics
from collections.abc import Iterable

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus
from yyt1771_g3.core.models import DetectionResult, DetectorConfig


class CausalDistanceOutlierFilter:
    def __init__(self, config: DetectorConfig) -> None:
        self._config = config
        self.recent_valid_distances: list[float] = []

    def apply(self, result: DetectionResult) -> DetectionResult:
        if not self._config.distance_outlier_filter_enabled:
            return _copy_with_outlier_fields(
                result,
                config=self._config,
                decision="disabled",
                curve_point_status=_status_for_unfiltered_result(result),
            )

        if result.detection_status != DetectionStatus.VALID or result.distance_px is None:
            return _copy_with_outlier_fields(
                result,
                config=self._config,
                decision="skipped_invalid_detection",
                curve_point_status=CurvePointStatus.INVALID_DETECTION,
                curve_exclusion_reason=result.rejected_reason or result.detection_status.value,
            )

        current_distance = float(result.distance_px)
        reference = self._reference_values()
        if not reference:
            self.recent_valid_distances.append(current_distance)
            return _copy_with_outlier_fields(
                result,
                config=self._config,
                decision="accepted",
                raw_detected_distance_px=current_distance,
                filtered=False,
                baseline=None,
                deviation=None,
                reference_values=[],
                curve_point_status=CurvePointStatus.VALID,
                curve_exclusion_reason="",
            )

        baseline = _baseline(reference, self._config.distance_outlier_baseline)
        deviation = abs(current_distance - baseline)
        if deviation <= float(self._config.distance_outlier_max_jump_px):
            self.recent_valid_distances.append(current_distance)
            return _copy_with_outlier_fields(
                result,
                config=self._config,
                decision="accepted",
                raw_detected_distance_px=current_distance,
                filtered=False,
                baseline=baseline,
                deviation=deviation,
                reference_values=reference,
                curve_point_status=CurvePointStatus.VALID,
                curve_exclusion_reason="",
            )

        return _copy_with_outlier_fields(
            result,
            config=self._config,
            decision="rejected",
            raw_detected_distance_px=current_distance,
            filtered=True,
            baseline=baseline,
            deviation=deviation,
            reference_values=reference,
            curve_point_status=CurvePointStatus.DISTANCE_JUMP_OUTLIER,
            curve_exclusion_reason="distance_jump_outlier",
        )

    def _reference_values(self) -> list[float]:
        count = max(1, int(self._config.distance_outlier_reference_count))
        return [float(value) for value in self.recent_valid_distances[-count:]]


def filter_detection_sequence(
    results: Iterable[DetectionResult],
    config: DetectorConfig,
) -> list[DetectionResult]:
    filter_state = CausalDistanceOutlierFilter(config)
    return [filter_state.apply(result) for result in results]


def _baseline(reference: list[float], mode: str) -> float:
    if mode == "last":
        return float(reference[-1])
    if mode == "mean":
        return float(statistics.fmean(reference))
    return float(statistics.median(reference))


def _status_for_unfiltered_result(result: DetectionResult) -> CurvePointStatus:
    return CurvePointStatus.VALID if result.detection_status == DetectionStatus.VALID else CurvePointStatus.INVALID_DETECTION


def _copy_with_outlier_fields(
    result: DetectionResult,
    *,
    config: DetectorConfig,
    decision: str,
    curve_point_status: CurvePointStatus,
    curve_exclusion_reason: str = "",
    raw_detected_distance_px: float | None = None,
    filtered: bool = False,
    baseline: float | None = None,
    deviation: float | None = None,
    reference_values: list[float] | None = None,
) -> DetectionResult:
    reference = list(reference_values or [])
    debug = {
        **result.debug_artifacts,
        "raw_detected_distance_px": raw_detected_distance_px if raw_detected_distance_px is not None else result.raw_detected_distance_px,
        "outlier_baseline_px": baseline,
        "outlier_deviation_px": deviation,
        "outlier_max_jump_px": float(config.distance_outlier_max_jump_px),
        "outlier_reference_count": int(config.distance_outlier_reference_count),
        "outlier_reference_values": reference,
        "outlier_filter_decision": decision,
        "distance_outlier_filter_enabled": bool(config.distance_outlier_filter_enabled),
        "distance_outlier_baseline": str(config.distance_outlier_baseline),
    }
    payload = result.model_dump()
    payload.update(
        {
            "curve_point_status": curve_point_status,
            "curve_exclusion_reason": curve_exclusion_reason,
            "raw_detected_distance_px": raw_detected_distance_px if raw_detected_distance_px is not None else result.raw_detected_distance_px,
            "distance_outlier_filtered": filtered,
            "distance_outlier_baseline_px": baseline,
            "distance_outlier_deviation_px": deviation,
            "distance_outlier_max_jump_px": float(config.distance_outlier_max_jump_px),
            "distance_outlier_reference_count": int(config.distance_outlier_reference_count),
            "distance_outlier_reference_values": reference,
            "debug_artifacts": debug,
        }
    )
    return DetectionResult.model_validate(payload)
