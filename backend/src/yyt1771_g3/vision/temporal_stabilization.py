from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image
from scipy import ndimage

from yyt1771_g3.core.enums import DetectionStatus, DetectorMode, DetectorType, ObjectClass
from yyt1771_g3.core.models import ABPoints, DetectionCandidate, DetectionResult, DetectorConfig, MeasurementDefinition
from yyt1771_g3.vision.detectors import (
    _contrast_widest_span_candidate,
    _mesh_envelope_candidate,
    _outer_envelope_contour,
    _wire_projection_candidate,
)


TemporalFilterMode = Literal["centered", "causal"]

_RAW_MASK_ARRAY_KEY = "_raw_mask_array"
_RAW_CONTOUR_ARRAY_KEY = "_raw_contour_array"


@dataclass(frozen=True)
class TemporalStrengthProfile:
    radius: int
    support_kernel: int
    min_component_area: int
    min_overlap_ratio: float


_STRENGTH_PROFILES: dict[str, TemporalStrengthProfile] = {
    "weak": TemporalStrengthProfile(radius=1, support_kernel=7, min_component_area=800, min_overlap_ratio=0.15),
    "medium": TemporalStrengthProfile(radius=1, support_kernel=15, min_component_area=2500, min_overlap_ratio=0.25),
    "strong": TemporalStrengthProfile(radius=2, support_kernel=21, min_component_area=4500, min_overlap_ratio=0.35),
}


class CausalTemporalStabilizer:
    def __init__(
        self,
        measurement: MeasurementDefinition,
        *,
        artifact_dir: Path | None = None,
        artifact_relative_dir: str = "temporal_masks",
    ) -> None:
        self._measurement = measurement
        self._artifact_dir = artifact_dir
        self._artifact_relative_dir = artifact_relative_dir
        self._previous_masks: list[np.ndarray] = []

    def apply(self, result: DetectionResult) -> DetectionResult:
        if not self._measurement.detector_config.temporal_stabilization_enabled:
            return annotate_raw_trace(
                result,
                self._measurement,
                filter_mode="disabled",
                artifact_dir=self._artifact_dir,
                artifact_relative_dir=self._artifact_relative_dir,
            )

        raw_mask = _raw_mask_array(result)
        stable = stabilize_detection_result(
            result,
            self._measurement,
            neighbor_masks=self._previous_masks,
            filter_mode="causal",
            artifact_dir=self._artifact_dir,
            artifact_relative_dir=self._artifact_relative_dir,
        )
        if raw_mask is not None:
            profile = _profile(self._measurement.detector_config)
            self._previous_masks.append(raw_mask.copy())
            if len(self._previous_masks) > profile.radius:
                self._previous_masks = self._previous_masks[-profile.radius :]
        return stable


def stabilize_detection_sequence(
    results: list[DetectionResult],
    measurement: MeasurementDefinition,
    *,
    filter_mode: TemporalFilterMode = "centered",
    artifact_dir: Path | None = None,
    artifact_relative_dir: str = "temporal_masks",
) -> list[DetectionResult]:
    if not measurement.detector_config.temporal_stabilization_enabled:
        return [
            annotate_raw_trace(
                result,
                measurement,
                filter_mode="disabled",
                artifact_dir=artifact_dir,
                artifact_relative_dir=artifact_relative_dir,
            )
            for result in results
        ]

    masks = [_raw_mask_array(result) for result in results]
    stabilized: list[DetectionResult] = []
    profile = _profile(measurement.detector_config)
    for index, result in enumerate(results):
        if filter_mode == "causal":
            neighbor_masks = [mask for mask in masks[max(0, index - profile.radius) : index] if mask is not None]
        else:
            start = max(0, index - profile.radius)
            end = min(len(masks), index + profile.radius + 1)
            neighbor_masks = [mask for item_index, mask in enumerate(masks[start:end], start=start) if item_index != index and mask is not None]
        stabilized.append(
            stabilize_detection_result(
                result,
                measurement,
                neighbor_masks=neighbor_masks,
                filter_mode=filter_mode,
                artifact_dir=artifact_dir,
                artifact_relative_dir=artifact_relative_dir,
            )
        )
    return stabilized


def stabilize_detection_result(
    result: DetectionResult,
    measurement: MeasurementDefinition,
    *,
    neighbor_masks: list[np.ndarray],
    filter_mode: TemporalFilterMode,
    artifact_dir: Path | None = None,
    artifact_relative_dir: str = "temporal_masks",
) -> DetectionResult:
    config = measurement.detector_config
    raw_mask = _raw_mask_array(result)
    raw_contour = _raw_contour_array(result, config)
    debug = _sanitized_debug_artifacts(result.debug_artifacts)
    debug.update(
        {
            "temporal_stabilization_enabled": bool(config.temporal_stabilization_enabled),
            "temporal_stabilization_strength": str(config.temporal_stabilization_strength),
            "temporal_filter_mode": filter_mode,
            "temporal_filter_delay_frames": 0,
            "raw_distance_px": result.raw_distance_px if result.raw_distance_px is not None else result.distance_px,
            "raw_ab_points": _ab_points_json(result.raw_ab_points or result.ab_points),
        }
    )
    _record_mask_artifacts(
        result.frame_index,
        debug,
        raw_mask=raw_mask,
        raw_contour=raw_contour,
        artifact_dir=artifact_dir,
        artifact_relative_dir=artifact_relative_dir,
    )

    if raw_mask is None or result.detection_status != DetectionStatus.VALID:
        return _copy_result(
            result,
            debug_artifacts={
                **debug,
                "temporal_stabilization_applied": False,
                "temporal_stabilization_reason": "missing_raw_mask_or_invalid_detection",
            },
        )

    stable_mask = _remove_temporal_outliers(raw_mask, neighbor_masks, _profile(config))
    stable_mask = _spatially_close_mask(stable_mask, config)
    stable_contour = _outer_envelope_contour(stable_mask, config)
    stable_candidate = _candidate_from_mask(stable_mask, measurement)
    debug.update(
        {
            "temporal_neighbor_count": len(neighbor_masks),
            "stabilized_mask_shape": [int(stable_mask.shape[0]), int(stable_mask.shape[1])],
            "stabilized_mask_pixel_count": int(np.count_nonzero(stable_mask)),
            "stabilized_contour_pixel_count": int(np.count_nonzero(stable_contour)),
            "temporal_removed_mask_pixel_count": int(max(0, np.count_nonzero(raw_mask) - np.count_nonzero(stable_mask))),
            "temporal_stabilization_applied": stable_candidate is not None,
            "temporal_stabilization_reason": "ok" if stable_candidate is not None else "fallback_raw_no_candidate",
        }
    )
    _record_mask_artifacts(
        result.frame_index,
        debug,
        stabilized_mask=stable_mask,
        stabilized_contour=stable_contour,
        artifact_dir=artifact_dir,
        artifact_relative_dir=artifact_relative_dir,
    )

    if stable_candidate is None:
        return _copy_result(result, debug_artifacts=debug)

    stabilized_ab = ABPoints(a=stable_candidate.a, b=stable_candidate.b)
    debug.update(
        {
            "stabilized_distance_px": float(stable_candidate.width_px),
            "stabilized_ab_points": _ab_points_json(stabilized_ab),
        }
    )
    return _copy_result(
        result,
        ab_points=stabilized_ab,
        distance_px=stable_candidate.width_px,
        selected_candidate=stable_candidate,
        stabilized_candidate=stable_candidate,
        stabilized_ab_points=stabilized_ab,
        stabilized_distance_px=stable_candidate.width_px,
        result_display_source="stabilized",
        debug_artifacts=debug,
    )


def annotate_raw_trace(
    result: DetectionResult,
    measurement: MeasurementDefinition,
    *,
    filter_mode: str,
    artifact_dir: Path | None = None,
    artifact_relative_dir: str = "temporal_masks",
) -> DetectionResult:
    raw_mask = _raw_mask_array(result)
    raw_contour = _raw_contour_array(result, measurement.detector_config)
    debug = _sanitized_debug_artifacts(result.debug_artifacts)
    debug.update(
        {
            "temporal_stabilization_enabled": bool(measurement.detector_config.temporal_stabilization_enabled),
            "temporal_stabilization_strength": str(measurement.detector_config.temporal_stabilization_strength),
            "temporal_filter_mode": filter_mode,
            "temporal_filter_delay_frames": 0,
            "temporal_stabilization_applied": False,
            "temporal_stabilization_reason": "disabled",
            "raw_distance_px": result.raw_distance_px if result.raw_distance_px is not None else result.distance_px,
            "raw_ab_points": _ab_points_json(result.raw_ab_points or result.ab_points),
            "stabilized_distance_px": result.stabilized_distance_px,
            "stabilized_ab_points": _ab_points_json(result.stabilized_ab_points),
        }
    )
    _record_mask_artifacts(
        result.frame_index,
        debug,
        raw_mask=raw_mask,
        raw_contour=raw_contour,
        artifact_dir=artifact_dir,
        artifact_relative_dir=artifact_relative_dir,
    )
    return _copy_result(result, debug_artifacts=debug)


def _remove_temporal_outliers(
    current: np.ndarray,
    neighbors: list[np.ndarray],
    profile: TemporalStrengthProfile,
) -> np.ndarray:
    current_mask = np.asarray(current, dtype=bool)
    if not neighbors:
        return current_mask.copy()

    support = np.zeros_like(current_mask, dtype=bool)
    for neighbor in neighbors:
        if neighbor.shape != current_mask.shape:
            continue
        support |= np.asarray(neighbor, dtype=bool)
    if not np.any(support):
        return current_mask.copy()

    kernel_size = max(1, int(profile.support_kernel) | 1)
    support = ndimage.binary_dilation(support, structure=_ellipse_kernel(kernel_size), iterations=1)
    labels, label_count = ndimage.label(current_mask, structure=np.ones((3, 3), dtype=bool))
    stable = np.zeros_like(current_mask, dtype=bool)
    for label in range(1, label_count + 1):
        component = labels == label
        area = int(np.count_nonzero(component))
        if area >= profile.min_component_area:
            stable[component] = True
            continue
        overlap = int(np.count_nonzero(support[component]))
        if overlap / max(1, area) >= profile.min_overlap_ratio:
            stable[component] = True
    return stable


def _candidate_from_mask(mask: np.ndarray, measurement: MeasurementDefinition) -> DetectionCandidate | None:
    if measurement.detector == DetectorType.BALLOON_ENVELOPE:
        return _mesh_envelope_candidate(mask, measurement.roi, measurement.detector_config)
    if measurement.object_class == ObjectClass.C_BUNDLE_ENVELOPE and measurement.detector in {
        DetectorType.BUNDLE_ENVELOPE,
        DetectorType.CONTRAST_WIDEST_SPAN,
        DetectorType.LEGACY_BUNDLE_ENVELOPE,
    }:
        if measurement.detector_mode == DetectorMode.CONTRAST_WIDEST_SPAN:
            candidate, _debug = _contrast_widest_span_candidate(mask, measurement.roi, measurement.detector_config)
            return candidate
        return _wire_projection_candidate(mask, measurement.roi, measurement.detector_config)
    if measurement.detector == DetectorType.CONTRAST_WIDEST_SPAN:
        candidate, _debug = _contrast_widest_span_candidate(mask, measurement.roi, measurement.detector_config)
        return candidate
    if measurement.detector == DetectorType.LEGACY_BUNDLE_ENVELOPE:
        return _wire_projection_candidate(mask, measurement.roi, measurement.detector_config)
    return None


def _spatially_close_mask(mask: np.ndarray, config: DetectorConfig) -> np.ndarray:
    kernel = _square_kernel(_contour_close_kernel(config))
    return np.asarray(ndimage.binary_closing(np.asarray(mask, dtype=bool), structure=kernel), dtype=bool)


def _profile(config: DetectorConfig) -> TemporalStrengthProfile:
    return _STRENGTH_PROFILES.get(str(config.temporal_stabilization_strength), _STRENGTH_PROFILES["medium"])


def _raw_mask_array(result: DetectionResult) -> np.ndarray | None:
    value = result.debug_artifacts.get(_RAW_MASK_ARRAY_KEY)
    return np.asarray(value, dtype=bool) if isinstance(value, np.ndarray) else None


def _raw_contour_array(result: DetectionResult, config: DetectorConfig) -> np.ndarray | None:
    value = result.debug_artifacts.get(_RAW_CONTOUR_ARRAY_KEY)
    if isinstance(value, np.ndarray):
        return np.asarray(value, dtype=bool)
    raw_mask = _raw_mask_array(result)
    return _outer_envelope_contour(raw_mask, config) if raw_mask is not None else None


def _sanitized_debug_artifacts(debug_artifacts: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in debug_artifacts.items()
        if key not in {_RAW_MASK_ARRAY_KEY, _RAW_CONTOUR_ARRAY_KEY}
    }


def _copy_result(result: DetectionResult, **updates: object) -> DetectionResult:
    payload = result.model_dump()
    payload["debug_artifacts"] = _sanitized_debug_artifacts(dict(payload.get("debug_artifacts", {})))
    payload.update(updates)
    return DetectionResult.model_validate(payload)


def _record_mask_artifacts(
    frame_index: int,
    debug: dict[str, object],
    *,
    raw_mask: np.ndarray | None = None,
    raw_contour: np.ndarray | None = None,
    stabilized_mask: np.ndarray | None = None,
    stabilized_contour: np.ndarray | None = None,
    artifact_dir: Path | None,
    artifact_relative_dir: str,
) -> None:
    masks = {
        "raw_mask": raw_mask,
        "raw_contour": raw_contour,
        "stabilized_mask": stabilized_mask,
        "stabilized_contour": stabilized_contour,
    }
    for key, mask in masks.items():
        if mask is None:
            continue
        debug[f"{key}_shape"] = [int(mask.shape[0]), int(mask.shape[1])]
        debug[f"{key}_pixel_count"] = int(np.count_nonzero(mask))
        if artifact_dir is None:
            continue
        artifact_dir.mkdir(parents=True, exist_ok=True)
        filename = f"frame_{frame_index:06d}.{key}.png"
        _write_mask_png(artifact_dir / filename, mask)
        debug[key] = str(Path(artifact_relative_dir) / filename)


def _write_mask_png(path: Path, mask: np.ndarray) -> None:
    image = Image.fromarray(np.where(np.asarray(mask, dtype=bool), 255, 0).astype(np.uint8), mode="L")
    image.save(path)


def _ab_points_json(points: ABPoints | None) -> dict[str, dict[str, float]] | None:
    return points.model_dump(mode="json") if points is not None else None


def _contour_close_kernel(config: DetectorConfig) -> int:
    value = config.contour_close_kernel if config.contour_close_kernel is not None else config.contour_close_kernel_px
    value = max(1, int(value))
    return value if value % 2 == 1 else value + 1


def _square_kernel(size: int) -> np.ndarray:
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    return np.ones((size, size), dtype=bool)


def _ellipse_kernel(size: int) -> np.ndarray:
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    radius = size // 2
    yy, xx = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return (xx * xx + yy * yy) <= radius * radius
