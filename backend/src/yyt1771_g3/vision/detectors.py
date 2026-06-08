from __future__ import annotations

import base64
import io
import math
import time
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage

from yyt1771_g3.core.coordinates import roi_local_to_measurement_point
from yyt1771_g3.core.enums import DetectionStatus, DetectorType
from yyt1771_g3.core.models import (
    ABPoints,
    DetectionCandidate,
    DetectionQuality,
    DetectionResult,
    DetectorConfig,
    MeasurementDefinition,
    RotatedROI,
)
from yyt1771_g3.vision.stability import CandidateSelectionState, select_stable_candidate


@dataclass(frozen=True)
class MeshEnvelopeRowsResult:
    all_rows: list[dict[str, float]]
    measurement_rows: list[dict[str, float]]
    rejected_rows: list[dict[str, Any]]
    diagnostics: dict[str, Any]


@dataclass(frozen=True)
class BubbleSuppressResult:
    zone: np.ndarray
    mask: np.ndarray
    diagnostics: dict[str, Any]


@dataclass(frozen=True)
class SpurPruneResult:
    mask: np.ndarray
    diagnostics: dict[str, Any]


def detect_frame(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    previous_candidate: DetectionCandidate | None = None,
    generate_diagnostics: bool = True,
) -> DetectionResult:
    result, _ = detect_frame_with_state(
        frame,
        measurement,
        frame_index=frame_index,
        stability_state=CandidateSelectionState(selected_candidate=previous_candidate),
        generate_diagnostics=generate_diagnostics,
    )
    return result


def detect_frame_with_state(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    stability_state: CandidateSelectionState | None = None,
    generate_diagnostics: bool = True,
) -> tuple[DetectionResult, CandidateSelectionState]:
    detector = measurement.detector
    state = stability_state or CandidateSelectionState()
    if detector == DetectorType.RESERVED_OBJECT:
        return _invalid(frame_index, "D_RESERVED_DETECTOR_NOT_IMPLEMENTED"), state
    if detector == DetectorType.BALLOON_ENVELOPE:
        return _detect_mesh_envelope_max_width(
            frame,
            measurement.roi,
            measurement.detector_config,
            frame_index=frame_index,
            detector_name=str(detector.value),
            stability_state=state,
            generate_diagnostics=generate_diagnostics,
        )
    if detector == DetectorType.BUNDLE_ENVELOPE:
        return _detect_wire_bundle_max_width(
            frame,
            measurement.roi,
            measurement.detector_config,
            frame_index=frame_index,
            detector_name=str(detector.value),
            stability_state=state,
            generate_diagnostics=generate_diagnostics,
        )
    return _invalid(frame_index, "UNKNOWN_DETECTOR"), state


def _detect_mesh_envelope_max_width(
    frame: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
    *,
    frame_index: int,
    detector_name: str,
    stability_state: CandidateSelectionState,
    generate_diagnostics: bool,
) -> tuple[DetectionResult, CandidateSelectionState]:
    detector_start = time.perf_counter()
    if frame.size == 0:
        return _invalid(frame_index, "EMPTY_FRAME"), stability_state

    preprocessing_start = time.perf_counter()
    local = _warp_rotated_roi(frame, roi)
    if local.size == 0:
        return _invalid(frame_index, "EMPTY_ROI"), stability_state
    full_gray = _to_gray(local)
    scale = _effective_processing_scale(config)
    proc_gray = _resize_roi(full_gray, scale=scale, mode=config.processing_scale_mode)
    proc_config = _scaled_detector_config(config, scale) if scale < 1.0 else config
    proc_roi = _processed_local_roi(proc_gray)
    preprocessing_runtime_ms = _elapsed_ms(preprocessing_start)

    mask_start = time.perf_counter()
    raw_dark_mask = _dark_foreground_mask(proc_gray, proc_config)
    raw_target = _largest_mesh_region(raw_dark_mask, proc_config)
    mask_runtime_ms = _elapsed_ms(mask_start)
    if raw_target is None:
        return _invalid(frame_index, "NO_TARGET"), stability_state

    envelope_start = time.perf_counter()
    raw_candidate = _mesh_envelope_candidate(raw_target, proc_roi, proc_config)
    bubble_result = _bright_bubble_suppress_zone(proc_gray, proc_config)
    bubble_result = _peripheral_bubble_suppress_zone(bubble_result, raw_target, proc_config)
    dark_line_response = (
        _dark_line_response(proc_gray, proc_config)
        if proc_config.dark_line_filter_enabled
        else np.zeros_like(proc_gray, dtype=float)
    )
    measurement_mask = np.asarray(raw_dark_mask, dtype=bool).copy()
    if proc_config.bubble_suppress_enabled:
        measurement_mask &= ~bubble_result.zone
    if proc_config.dark_line_filter_enabled and proc_config.dark_line_min_response > 0.0:
        measurement_mask &= dark_line_response >= float(proc_config.dark_line_min_response)
    spur_result = _prune_short_artifact_spurs(measurement_mask, dark_line_response, bubble_result.zone, proc_config)
    measurement_mask = spur_result.mask
    clean_target = _largest_mesh_region(measurement_mask, proc_config)
    if clean_target is None and raw_candidate is None:
        return _invalid(frame_index, "NO_TARGET"), stability_state

    clean_candidate = _mesh_envelope_candidate(
        clean_target,
        proc_roi,
        proc_config,
        endpoint_guard_zone=bubble_result.zone,
        ridge_response=dark_line_response,
    ) if clean_target is not None else None
    candidate, target, bubble_candidate_source = _select_mesh_candidate_with_bubble_guard(
        raw_candidate=raw_candidate,
        clean_candidate=clean_candidate,
        raw_target=raw_target,
        clean_target=clean_target,
        bubble_result=bubble_result,
        roi_shape=raw_dark_mask.shape,
    )
    if candidate is None or target is None:
        return _invalid(frame_index, "NO_VALID_ARCHIVED_CONTOUR"), stability_state
    coordinates_rescaled = scale < 1.0
    if coordinates_rescaled:
        candidate = _restore_candidate_to_full_res(candidate, roi, scale=scale)
    refine_debug: dict[str, Any] = {
        "full_res_refine_used": False,
        "full_res_refine_runtime_ms": 0.0,
    }
    if coordinates_rescaled and config.refine_endpoint_on_full_res:
        candidate, refine_debug = _refine_candidate_on_full_res(candidate, full_gray, roi, config)
    envelope_runtime_ms = _elapsed_ms(envelope_start)

    candidates = [candidate] if candidate is not None else []
    extra_debug = {
        "mesh_target_mask_pixels": int(np.count_nonzero(target)),
        "bubble_candidate_source": bubble_candidate_source,
        **bubble_result.diagnostics,
        "dark_line_filter_enabled": bool(proc_config.dark_line_filter_enabled),
        **spur_result.diagnostics,
    }
    if coordinates_rescaled:
        extra_debug = _restore_debug_artifacts_to_full_res(extra_debug, scale)
    result, next_state = _finish_candidate_detection(
        frame_index=frame_index,
        roi=roi,
        config=config,
        detector_name=detector_name,
        stability_state=stability_state,
        target=target,
        candidates=candidates,
        measurement_mode="archived_mesh_envelope_rows",
        extra_debug={
            **extra_debug,
            **_processing_scale_debug(
                config=config,
                proc_config=proc_config,
                scale=scale,
                full_gray=full_gray,
                proc_gray=proc_gray,
                coordinates_rescaled=coordinates_rescaled,
            ),
            **refine_debug,
            "preprocessing_runtime_ms": preprocessing_runtime_ms,
            "mask_runtime_ms": mask_runtime_ms,
            "envelope_runtime_ms": envelope_runtime_ms,
        },
        diagnostic_masks={
            "raw_dark_mask": {
                "label": "Raw dark mask",
                "mask": raw_dark_mask,
            },
            "bubble_suppress_zone": {
                "label": "Bubble suppress zone",
                "mask": bubble_result.zone,
            },
            "clean_measurement_mask": {
                "label": "Clean measurement mask",
                "mask": measurement_mask,
            },
        },
        generate_diagnostics=generate_diagnostics,
    )
    result.debug_artifacts["detector_runtime_ms"] = _elapsed_ms(detector_start)
    return result, next_state


def _detect_wire_bundle_max_width(
    frame: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
    *,
    frame_index: int,
    detector_name: str,
    stability_state: CandidateSelectionState,
    generate_diagnostics: bool,
) -> tuple[DetectionResult, CandidateSelectionState]:
    detector_start = time.perf_counter()
    if frame.size == 0:
        return _invalid(frame_index, "EMPTY_FRAME"), stability_state

    preprocessing_start = time.perf_counter()
    local = _warp_rotated_roi(frame, roi)
    if local.size == 0:
        return _invalid(frame_index, "EMPTY_ROI"), stability_state
    full_gray = _to_gray(local)
    scale = _effective_processing_scale(config)
    proc_gray = _resize_roi(full_gray, scale=scale, mode=config.processing_scale_mode)
    proc_config = _scaled_detector_config(config, scale) if scale < 1.0 else config
    proc_roi = _processed_local_roi(proc_gray)
    preprocessing_runtime_ms = _elapsed_ms(preprocessing_start)

    mask_start = time.perf_counter()
    target = _wire_bundle_mask(proc_gray, proc_config)
    mask_runtime_ms = _elapsed_ms(mask_start)
    if np.count_nonzero(target) < max(1, int(proc_config.min_window_pixels)):
        return _invalid(frame_index, "NO_TARGET"), stability_state

    envelope_start = time.perf_counter()
    candidate = _wire_projection_candidate(target, proc_roi, proc_config)
    coordinates_rescaled = scale < 1.0
    if candidate is not None and coordinates_rescaled:
        candidate = _restore_candidate_to_full_res(candidate, roi, scale=scale)
    envelope_runtime_ms = _elapsed_ms(envelope_start)
    candidates = [candidate] if candidate is not None else []
    result, next_state = _finish_candidate_detection(
        frame_index=frame_index,
        roi=roi,
        config=config,
        detector_name=detector_name,
        stability_state=stability_state,
        target=target,
        candidates=candidates,
        measurement_mode="archived_wire_bundle_projection",
        extra_debug={
            "wire_target_mask_pixels": int(np.count_nonzero(target)),
            **_processing_scale_debug(
                config=config,
                proc_config=proc_config,
                scale=scale,
                full_gray=full_gray,
                proc_gray=proc_gray,
                coordinates_rescaled=coordinates_rescaled,
            ),
            "full_res_refine_used": False,
            "full_res_refine_runtime_ms": 0.0,
            "preprocessing_runtime_ms": preprocessing_runtime_ms,
            "mask_runtime_ms": mask_runtime_ms,
            "envelope_runtime_ms": envelope_runtime_ms,
        },
        generate_diagnostics=generate_diagnostics,
    )
    result.debug_artifacts["detector_runtime_ms"] = _elapsed_ms(detector_start)
    return result, next_state


def _finish_candidate_detection(
    *,
    frame_index: int,
    roi: RotatedROI,
    config: DetectorConfig,
    detector_name: str,
    stability_state: CandidateSelectionState,
    target: np.ndarray,
    candidates: list[DetectionCandidate],
    measurement_mode: str,
    extra_debug: dict[str, Any] | None = None,
    diagnostic_masks: dict[str, dict[str, Any]] | None = None,
    generate_diagnostics: bool = True,
) -> tuple[DetectionResult, CandidateSelectionState]:
    coverage = float(np.count_nonzero(target)) / float(target.size)
    if not candidates:
        return _invalid(
            frame_index,
            "NO_VALID_ARCHIVED_CONTOUR",
            quality=DetectionQuality(roi_coverage=coverage),
        ), stability_state

    selection = select_stable_candidate(
        candidates,
        stability_state,
        config,
    )
    raw_best = selection.raw_best_candidate
    selected = selection.selected_candidate
    if selected is None:
        return _invalid(
            frame_index,
            selection.rejected_reason or "NO_STABLE_CANDIDATE",
            raw_best_candidate=raw_best,
            rejected_candidates=selection.rejected_candidates,
            quality=DetectionQuality(roi_coverage=coverage),
        ), selection.state

    confidence = min(1.0, max(0.0, selected.confidence) * 0.65 + coverage * 1.35)
    if confidence < config.min_confidence:
        return _invalid(
            frame_index,
            "LOW_CONFIDENCE",
            raw_best_candidate=raw_best,
            selected_candidate=None,
            rejected_candidates=candidates,
            quality=DetectionQuality(confidence=confidence, roi_coverage=coverage),
        ), selection.state

    diagnostics_start = time.perf_counter()
    diagnostic_images = _diagnostic_images(target, config, diagnostic_masks) if generate_diagnostics else None
    diagnostics_runtime_ms = _elapsed_ms(diagnostics_start)
    debug_artifacts: dict[str, Any] = {
        "selected_detector": detector_name,
        "contour_measurement_mode": measurement_mode,
        "contour_theta_deg": float(roi.angle_deg),
        "contour_length_px": float(selected.width_px),
        "contour_projection_box": selected.metadata.get("contour_projection_box", []),
        "contour_direction_arrow": selected.metadata.get("contour_direction_arrow", []),
        "target_mask_pixels": int(np.count_nonzero(target)),
        "candidate_count": len(candidates),
        "diagnostics_generated": bool(generate_diagnostics),
        "diagnostics_runtime_ms": diagnostics_runtime_ms,
        "selection_state": {
            "pending_candidate_id": selection.state.pending_candidate_id,
            "pending_count": selection.state.pending_count,
            "pending_distance_jump_candidate_id": selection.state.pending_distance_jump_candidate_id,
            "pending_distance_jump_count": selection.state.pending_distance_jump_count,
        },
        "distance_jump_guard_triggered": bool(selection.distance_jump_guard_triggered),
    }
    debug_artifacts.update(selected.metadata.get("debug_artifacts", {}))
    if extra_debug:
        debug_artifacts.update(extra_debug)
    if diagnostic_images is not None:
        debug_artifacts["diagnostic_images"] = diagnostic_images

    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=selected.a, b=selected.b),
        distance_px=selected.width_px,
        raw_best_candidate=raw_best,
        selected_candidate=selected,
        rejected_candidates=selection.rejected_candidates,
        quality=DetectionQuality(
            confidence=confidence,
            contour_area=float(np.count_nonzero(target)),
            roi_coverage=coverage,
            jump_from_previous_px=_candidate_jump(selected, stability_state.selected_candidate)
            if stability_state.selected_candidate is not None
            else None,
        ),
        debug_artifacts=debug_artifacts,
    ), selection.state


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


def _effective_processing_scale(config: DetectorConfig) -> float:
    if not config.processing_scale_enabled:
        return 1.0
    return max(0.25, min(1.0, float(config.processing_scale)))


def _resize_roi(gray: np.ndarray, *, scale: float, mode: str) -> np.ndarray:
    if scale >= 1.0:
        return gray
    height, width = gray.shape[:2]
    resized_width = max(1, int(round(width * scale)))
    resized_height = max(1, int(round(height * scale)))
    source = np.asarray(gray)
    if mode == "gaussian_pyramid":
        sigma = max(0.5, (1.0 / max(scale, 1e-6) - 1.0) * 0.5)
        source = ndimage.gaussian_filter(source.astype(float), sigma=sigma)
        source = np.clip(source, 0, 255).astype(np.uint8)
        resample = Image.Resampling.BILINEAR
    else:
        resample = Image.Resampling.BOX
    image = Image.fromarray(np.ascontiguousarray(source))
    resized = image.resize((resized_width, resized_height), resample=resample)
    return np.asarray(resized, dtype=np.uint8)


def _processed_local_roi(gray: np.ndarray) -> RotatedROI:
    height, width = gray.shape[:2]
    return RotatedROI(
        center_x=float(width) / 2.0,
        center_y=float(height) / 2.0,
        width=float(width),
        height=float(height),
        angle_deg=0.0,
    )


def _scale_length(value: int | float, scale: float, *, minimum: int = 1) -> int:
    return max(minimum, int(round(float(value) * scale)))


def _scale_float_length(value: int | float, scale: float) -> float:
    return float(value) * scale


def _scale_area(value: int | float, scale: float, *, minimum: int = 1) -> int:
    return max(minimum, int(round(float(value) * scale * scale)))


def _scale_kernel(value: int, scale: float) -> int:
    scaled = max(1, int(round(float(value) * scale)))
    if scaled % 2 == 0:
        scaled += 1
    return scaled


def _scaled_detector_config(config: DetectorConfig, scale: float) -> DetectorConfig:
    if scale >= 1.0:
        return config
    updates: dict[str, Any] = {
        "envelope_window_px": _scale_kernel(config.envelope_window_px, scale),
        "envelope_step_px": _scale_length(config.envelope_step_px, scale),
        "min_window_pixels": _scale_length(config.min_window_pixels, scale),
        "boundary_support_window_px": _scale_kernel(config.boundary_support_window_px, scale),
        "boundary_support_min_pixels": _scale_length(config.boundary_support_min_pixels, scale),
        "mesh_region_margin_px": _scale_length(config.mesh_region_margin_px, scale),
        "distance_jump_limit_px": _scale_float_length(config.distance_jump_limit_px, scale),
        "envelope_width_outlier_epsilon_px": _scale_float_length(config.envelope_width_outlier_epsilon_px, scale),
        "mask_open_kernel_px": _scale_kernel(config.mask_open_kernel_px, scale),
        "mask_close_kernel_px": _scale_kernel(config.mask_close_kernel_px, scale),
        "mask_dilate_kernel_px": _scale_kernel(config.mask_dilate_kernel_px, scale),
        "min_component_area_px": _scale_area(config.min_component_area_px, scale),
        "bubble_min_area_px": _scale_area(config.bubble_min_area_px, scale),
        "bubble_max_area_px": _scale_area(config.bubble_max_area_px, scale),
        "bubble_max_bbox_px": _scale_length(config.bubble_max_bbox_px, scale),
        "bubble_local_radius_px": _scale_kernel(config.bubble_local_radius_px, scale),
        "bubble_suppress_radius_px": _scale_kernel(config.bubble_suppress_radius_px, scale),
        "dark_line_filter_length_px": _scale_kernel(config.dark_line_filter_length_px, scale),
        "dark_line_filter_width_px": _scale_kernel(config.dark_line_filter_width_px, scale),
        "spur_prune_max_length_px": _scale_length(config.spur_prune_max_length_px, scale),
        "spur_prune_dilate_px": _scale_kernel(config.spur_prune_dilate_px, scale),
        "wire_min_component_area_px": _scale_area(config.wire_min_component_area_px, scale),
        "wire_min_length_px": _scale_float_length(config.wire_min_length_px, scale),
        "wire_box_padding_px": _scale_float_length(config.wire_box_padding_px, scale),
        "contour_close_kernel_px": _scale_kernel(config.contour_close_kernel_px, scale),
        "contour_box_padding_px": _scale_float_length(config.contour_box_padding_px, scale),
        "roi_edge_guard_px": _scale_float_length(config.roi_edge_guard_px, scale),
        "detection_roi_padding_px": _scale_float_length(config.detection_roi_padding_px, scale),
    }
    return config.model_copy(update=updates)


def _processing_scale_debug(
    *,
    config: DetectorConfig,
    proc_config: DetectorConfig,
    scale: float,
    full_gray: np.ndarray,
    proc_gray: np.ndarray,
    coordinates_rescaled: bool,
) -> dict[str, Any]:
    return {
        "processing_scale_enabled": bool(config.processing_scale_enabled),
        "processing_scale_effective": float(scale),
        "processing_scale_mode": str(config.processing_scale_mode),
        "processed_roi_shape": [int(proc_gray.shape[0]), int(proc_gray.shape[1])],
        "full_res_roi_shape": [int(full_gray.shape[0]), int(full_gray.shape[1])],
        "scaled_config_summary": _scaled_config_summary(config, proc_config, scale),
        "coordinates_rescaled_to_full_res": bool(coordinates_rescaled),
    }


def _scaled_config_summary(config: DetectorConfig, proc_config: DetectorConfig, scale: float) -> dict[str, Any]:
    fields = [
        "envelope_window_px",
        "envelope_step_px",
        "min_window_pixels",
        "boundary_support_window_px",
        "boundary_support_min_pixels",
        "mesh_region_margin_px",
        "distance_jump_limit_px",
        "envelope_width_outlier_epsilon_px",
        "mask_open_kernel_px",
        "mask_close_kernel_px",
        "mask_dilate_kernel_px",
        "min_component_area_px",
        "bubble_min_area_px",
        "bubble_max_area_px",
        "dark_line_filter_length_px",
        "dark_line_filter_width_px",
        "spur_prune_max_length_px",
        "wire_min_component_area_px",
    ]
    return {
        "scale": float(scale),
        "fields": {
            field: {"original": getattr(config, field), "processed": getattr(proc_config, field)}
            for field in fields
            if getattr(config, field) != getattr(proc_config, field)
        },
    }


def _restore_candidate_to_full_res(
    candidate: DetectionCandidate,
    full_res_roi: RotatedROI,
    *,
    scale: float,
) -> DetectionCandidate:
    if scale >= 1.0:
        return candidate
    metadata = _scale_candidate_metadata(candidate.metadata, full_res_roi, scale)
    left = _number_from_path(metadata, "local_min_along_px")
    right = _number_from_path(metadata, "local_max_along_px")
    center_v = candidate.axis_position_px / scale
    debug = metadata.get("debug_artifacts")
    if isinstance(debug, dict):
        left = _number_from_path(debug, "mesh_left_local_px") or left
        right = _number_from_path(debug, "mesh_right_local_px") or right
        center_v = _number_from_path(debug, "selected_measurement_row_v_px") or _number_from_path(debug, "mesh_best_row_v_px") or center_v
    if left is None or right is None:
        left = candidate.a.x / scale
        right = candidate.b.x / scale
    a = roi_local_to_measurement_point(full_res_roi, left, center_v)
    b = roi_local_to_measurement_point(full_res_roi, right, center_v)
    metadata["contour_direction_arrow"] = [point.model_dump(mode="json") for point in [a, b]]
    if isinstance(debug, dict):
        debug["mesh_left_px"] = float(a.x)
        debug["mesh_right_px"] = float(b.x)
    return DetectionCandidate(
        candidate_id=candidate.candidate_id,
        axis_position_px=float(center_v),
        width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
        a=a,
        b=b,
        confidence=candidate.confidence,
        rejected_reason=candidate.rejected_reason,
        metadata=metadata,
    )


def _scale_candidate_metadata(metadata: dict[str, Any], full_res_roi: RotatedROI, scale: float) -> dict[str, Any]:
    restored = _deep_copy_jsonish(metadata)
    for key in [
        "local_min_along_px",
        "local_max_along_px",
        "local_min_perpendicular_px",
        "local_max_perpendicular_px",
    ]:
        if key in restored:
            restored[key] = float(restored[key]) / scale

    for key in ["contour_projection_box", "contour_full_box", "contour_measurement_band_box"]:
        if key in restored:
            restored[key] = _restore_local_box_points(restored[key], full_res_roi, scale)

    debug = restored.get("debug_artifacts")
    if isinstance(debug, dict):
        _scale_debug_artifacts_in_place(debug, scale)
        for key in ["contour_full_box", "contour_measurement_band_box"]:
            if key in debug:
                debug[key] = _restore_local_box_points(debug[key], full_res_roi, scale)
        selected_row = debug.get("selected_row")
        if isinstance(selected_row, dict):
            _scale_row_in_place(selected_row, scale)
        if "mesh_selected_row_width_px" in debug:
            debug["selected_measurement_row_width_px"] = debug["mesh_selected_row_width_px"]
        if "mesh_best_row_v_px" in debug:
            debug["selected_measurement_row_v_px"] = debug["mesh_best_row_v_px"]

    return restored


def _deep_copy_jsonish(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _deep_copy_jsonish(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_deep_copy_jsonish(item) for item in value]
    return value


def _scale_debug_artifacts_in_place(debug: dict[str, Any], scale: float) -> None:
    coordinate_keys = [
        "mesh_left_local_px",
        "mesh_right_local_px",
        "mesh_best_row_v_px",
        "selected_measurement_row_v_px",
        "mesh_global_left_local_px",
        "mesh_global_left_row_v_px",
        "mesh_global_right_local_px",
        "mesh_global_right_row_v_px",
        "wire_min_along_px",
        "wire_max_along_px",
        "wire_min_perpendicular_px",
        "wire_max_perpendicular_px",
        "wire_support_group_min_along_px",
        "wire_support_group_max_along_px",
        "wire_global_quantile_min_along_px",
        "wire_global_quantile_max_along_px",
    ]
    length_keys = [
        "mesh_selected_row_width_px",
        "selected_measurement_row_width_px",
        "mesh_global_span_px",
        "raw_width_px",
        "robust_width_percentile_px",
        "wire_raw_length_px",
        "wire_width_perpendicular_px",
        "wire_global_quantile_length_px",
        "wire_support_merge_gap_px",
        "wire_support_base_merge_gap_px",
        "wire_support_continuity_merge_gap_px",
    ]
    for key in coordinate_keys + length_keys:
        if key in debug and isinstance(debug[key], (int, float)):
            debug[key] = float(debug[key]) / scale


def _scale_row_in_place(row: dict[str, Any], scale: float) -> None:
    for key in ["v", "left", "right", "width", "window_start_v", "window_end_v"]:
        if key in row and isinstance(row[key], (int, float)):
            row[key] = float(row[key]) / scale


def _restore_local_box_points(points: Any, full_res_roi: RotatedROI, scale: float) -> list[dict[str, float]]:
    restored: list[dict[str, float]] = []
    if not isinstance(points, list):
        return restored
    for point in points:
        if not isinstance(point, dict):
            continue
        x = point.get("x")
        y = point.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        restored_point = roi_local_to_measurement_point(full_res_roi, float(x) / scale, float(y) / scale)
        restored.append(restored_point.model_dump(mode="json"))
    return restored


def _restore_debug_artifacts_to_full_res(debug: dict[str, Any], scale: float) -> dict[str, Any]:
    restored = _deep_copy_jsonish(debug)
    area_keys = [
        "bubble_suppress_zone_area_px",
        "bubble_suppress_zone_area_raw_px",
        "spur_prune_removed_area_px",
    ]
    for key in area_keys:
        if key in restored and isinstance(restored[key], (int, float)):
            restored[key] = int(round(float(restored[key]) / (scale * scale)))
    box_lists = ["bubble_rejected_boxes"]
    for key in box_lists:
        items = restored.get(key)
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                for coord_key in ["left", "right", "top", "bottom", "bbox_width_px", "bbox_height_px"]:
                    if coord_key in item and isinstance(item[coord_key], (int, float)):
                        item[coord_key] = float(item[coord_key]) / scale
                if "area_px" in item and isinstance(item["area_px"], (int, float)):
                    item["area_px"] = int(round(float(item["area_px"]) / (scale * scale)))
    for key in [
        "bubble_peripheral_filter_left_px",
        "bubble_peripheral_filter_right_px",
        "bubble_peripheral_filter_center_v_px",
        "bubble_peripheral_filter_lateral_margin_px",
        "bubble_peripheral_filter_vertical_margin_px",
    ]:
        if key in restored and isinstance(restored[key], (int, float)):
            restored[key] = float(restored[key]) / scale
    return restored


def _number_from_path(container: dict[str, Any], key: str) -> float | None:
    value = container.get(key)
    return float(value) if isinstance(value, (int, float)) else None


def _refine_candidate_on_full_res(
    candidate: DetectionCandidate,
    full_gray: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
) -> tuple[DetectionCandidate, dict[str, Any]]:
    start = time.perf_counter()
    band = max(1, int(config.full_res_refine_band_px))
    debug = candidate.metadata.get("debug_artifacts", {})
    if not isinstance(debug, dict):
        return candidate, {
            "full_res_refine_used": False,
            "full_res_refine_runtime_ms": _elapsed_ms(start),
            "full_res_refine_rejected_reason": "MISSING_DEBUG_GEOMETRY",
        }
    left = _number_from_path(debug, "mesh_left_local_px") or _number_from_path(candidate.metadata, "local_min_along_px")
    right = _number_from_path(debug, "mesh_right_local_px") or _number_from_path(candidate.metadata, "local_max_along_px")
    center_v = _number_from_path(debug, "selected_measurement_row_v_px") or candidate.axis_position_px
    if left is None or right is None:
        return candidate, {
            "full_res_refine_used": False,
            "full_res_refine_runtime_ms": _elapsed_ms(start),
            "full_res_refine_rejected_reason": "MISSING_ENDPOINTS",
        }

    response = _enhance_dark_lines(full_gray, config.dark_enhance_bg_kernel_px).astype(float)
    threshold = max(_otsu_threshold(response.astype(np.uint8)), float(response.max()) * 0.25)
    y0 = max(0, int(round(center_v)) - band)
    y1 = min(full_gray.shape[0] - 1, int(round(center_v)) + band)
    search_radius = band * 2

    def _refined_endpoint(endpoint: float, side: str) -> float | None:
        x0 = max(0, int(round(endpoint)) - search_radius)
        x1 = min(full_gray.shape[1] - 1, int(round(endpoint)) + search_radius)
        patch = response[y0 : y1 + 1, x0 : x1 + 1]
        ys, xs = np.nonzero(patch >= threshold)
        if len(xs) == 0:
            return None
        local_xs = xs.astype(float) + float(x0)
        return float(np.min(local_xs) if side == "left" else np.max(local_xs))

    refined_left = _refined_endpoint(left, "left")
    refined_right = _refined_endpoint(right, "right")
    if refined_left is None or refined_right is None:
        return candidate, {
            "full_res_refine_used": False,
            "full_res_refine_runtime_ms": _elapsed_ms(start),
            "full_res_refine_rejected_reason": "NO_DARK_SUPPORT_IN_LOCAL_BAND",
        }
    left_delta = refined_left - left
    right_delta = refined_right - right
    new_width = refined_right - refined_left
    old_width = right - left
    max_refine_width_growth = max(4.0, old_width * 0.005)
    if (
        abs(left_delta) > band
        or abs(right_delta) > band
        or new_width <= 0.0
        or new_width > old_width + max_refine_width_growth
    ):
        return candidate, {
            "full_res_refine_used": False,
            "full_res_refine_runtime_ms": _elapsed_ms(start),
            "full_res_refine_left_delta_px": float(left_delta),
            "full_res_refine_right_delta_px": float(right_delta),
            "full_res_refine_rejected_reason": "REFINE_OUTSIDE_LOCAL_GUARD",
        }

    refined = _replace_candidate_mesh_geometry(candidate, roi, refined_left, refined_right, center_v)
    return refined, {
        "full_res_refine_used": True,
        "full_res_refine_runtime_ms": _elapsed_ms(start),
        "full_res_refine_left_delta_px": float(left_delta),
        "full_res_refine_right_delta_px": float(right_delta),
        "full_res_refine_rejected_reason": "",
    }


def _replace_candidate_mesh_geometry(
    candidate: DetectionCandidate,
    roi: RotatedROI,
    left: float,
    right: float,
    center_v: float,
) -> DetectionCandidate:
    metadata = _deep_copy_jsonish(candidate.metadata)
    debug = metadata.get("debug_artifacts")
    if isinstance(debug, dict):
        debug["mesh_left_local_px"] = float(left)
        debug["mesh_right_local_px"] = float(right)
        debug["mesh_best_row_v_px"] = float(center_v)
        debug["selected_measurement_row_v_px"] = float(center_v)
        debug["mesh_selected_row_width_px"] = float(right - left)
        debug["selected_measurement_row_width_px"] = float(right - left)
        selected_row = debug.get("selected_row")
        if isinstance(selected_row, dict):
            selected_row["left"] = float(left)
            selected_row["right"] = float(right)
            selected_row["width"] = float(right - left)
    metadata["local_min_along_px"] = float(left)
    metadata["local_max_along_px"] = float(right)
    a = roi_local_to_measurement_point(roi, left, center_v)
    b = roi_local_to_measurement_point(roi, right, center_v)
    metadata["contour_direction_arrow"] = [point.model_dump(mode="json") for point in [a, b]]
    if isinstance(debug, dict):
        debug["mesh_left_px"] = float(a.x)
        debug["mesh_right_px"] = float(b.x)
    return DetectionCandidate(
        candidate_id=candidate.candidate_id,
        axis_position_px=float(center_v),
        width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
        a=a,
        b=b,
        confidence=candidate.confidence,
        rejected_reason=candidate.rejected_reason,
        metadata=metadata,
    )


def _warp_rotated_roi(frame: np.ndarray, roi: RotatedROI) -> np.ndarray:
    width = max(1, int(round(roi.width)))
    height = max(1, int(round(roi.height)))
    theta = math.radians(roi.angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    yy, xx = np.mgrid[0:height, 0:width]
    du = xx.astype(float) - width / 2.0
    dv = yy.astype(float) - height / 2.0
    src_x = roi.center_x + du * cos_t - dv * sin_t
    src_y = roi.center_y + du * sin_t + dv * cos_t
    array = np.asarray(frame)
    if array.ndim == 2:
        return ndimage.map_coordinates(array, [src_y, src_x], order=1, mode="nearest")
    channels = [
        ndimage.map_coordinates(array[:, :, channel], [src_y, src_x], order=1, mode="nearest")
        for channel in range(array.shape[2])
    ]
    return np.stack(channels, axis=2)


def _to_gray(frame: np.ndarray) -> np.ndarray:
    array = np.asarray(frame)
    if array.ndim == 2:
        gray = array
    elif array.ndim == 3 and array.shape[2] >= 3:
        rgb = array[:, :, :3].astype(float)
        gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    else:
        raise ValueError(f"Unsupported frame shape: {array.shape}")
    if gray.dtype != np.uint8:
        gray = np.clip(gray, 0, 255).astype(np.uint8)
    return gray


def _dark_foreground_mask(gray: np.ndarray, config: DetectorConfig) -> np.ndarray:
    response = _enhance_dark_lines(gray, config.dark_enhance_bg_kernel_px)
    response = ndimage.gaussian_filter(response.astype(float), sigma=1.0)
    threshold = _otsu_threshold(response)
    threshold = max(threshold, float(response.max()) * 0.35)
    low = threshold * config.hysteresis_low_ratio
    strong = response >= threshold
    weak = response >= low
    labels, labels_count = ndimage.label(weak, structure=np.ones((3, 3), dtype=bool))
    mask = np.zeros_like(weak, dtype=bool)
    for label in range(1, labels_count + 1):
        component = labels == label
        if np.any(strong[component]):
            mask[component] = True
    mask = ndimage.binary_opening(mask, structure=_kernel(config.mask_open_kernel_px))
    mask = ndimage.binary_closing(mask, structure=_kernel(config.mask_close_kernel_px))
    mask = ndimage.binary_dilation(mask, structure=_kernel(config.mask_dilate_kernel_px))
    return mask


def _enhance_dark_lines(gray: np.ndarray, bg_kernel_px: int) -> np.ndarray:
    kernel_size = max(3, int(bg_kernel_px) | 1)
    background = ndimage.grey_closing(gray.astype(float), size=(kernel_size, kernel_size))
    dark = np.maximum(background - gray.astype(float), 0.0)
    scale = np.percentile(dark, 99.5)
    if scale <= 1e-6:
        return np.zeros_like(gray, dtype=np.uint8)
    return np.clip(dark / scale * 255.0, 0, 255).astype(np.uint8)


def _bright_bubble_suppress_zone(gray: np.ndarray, config: DetectorConfig) -> BubbleSuppressResult:
    empty = np.zeros_like(gray, dtype=bool)
    if not config.bubble_suppress_enabled or gray.size == 0:
        return BubbleSuppressResult(
            zone=empty,
            mask=empty,
            diagnostics={
                "bubble_suppress_zone_area_px": 0,
                "bubble_candidate_count": 0,
                "bubble_rejected_boxes": [],
                "bubble_suppress_triggered": False,
            },
        )

    radius = max(3, int(config.bubble_local_radius_px) | 1)
    gray_f = gray.astype(float)
    local_background = ndimage.uniform_filter(gray_f, size=radius, mode="nearest")
    local_deviation = ndimage.uniform_filter(np.abs(gray_f - local_background), size=radius, mode="nearest")
    denom = np.maximum(local_deviation * 1.253, 6.0)
    bright_z = (gray_f - local_background) / denom
    bright_seed = (bright_z > float(config.bubble_bright_z_threshold)) & (gray_f > local_background)
    bright_seed = ndimage.binary_opening(bright_seed, structure=_kernel(3))

    labels, labels_count = ndimage.label(bright_seed, structure=np.ones((3, 3), dtype=bool))
    bubble_mask = np.zeros_like(bright_seed, dtype=bool)
    rejected_boxes: list[dict[str, Any]] = []
    candidate_count = 0
    for label in range(1, labels_count + 1):
        component = labels == label
        area = int(np.count_nonzero(component))
        ys, xs = np.nonzero(component)
        if area <= 0 or len(xs) == 0:
            continue
        left = int(xs.min())
        right = int(xs.max())
        top = int(ys.min())
        bottom = int(ys.max())
        bbox_width = right - left + 1
        bbox_height = bottom - top + 1
        aspect = float(max(bbox_width, bbox_height)) / max(1.0, float(min(bbox_width, bbox_height)))
        compactness = float(area) / max(1.0, float(bbox_width * bbox_height))
        box = {
            "left": left,
            "right": right,
            "top": top,
            "bottom": bottom,
            "area_px": area,
            "bbox_width_px": bbox_width,
            "bbox_height_px": bbox_height,
            "aspect_ratio": aspect,
            "compactness": compactness,
        }
        reject_reason = ""
        if area < int(config.bubble_min_area_px):
            reject_reason = "AREA_BELOW_MIN"
        elif area > int(config.bubble_max_area_px):
            reject_reason = "AREA_ABOVE_MAX"
        elif bbox_width > int(config.bubble_max_bbox_px) or bbox_height > int(config.bubble_max_bbox_px):
            reject_reason = "BBOX_ABOVE_MAX"
        elif aspect > float(config.bubble_max_aspect_ratio):
            reject_reason = "ASPECT_ABOVE_MAX"
        elif compactness < float(config.bubble_min_compactness):
            reject_reason = "COMPACTNESS_BELOW_MIN"

        if reject_reason:
            rejected_boxes.append({**box, "rejected_reason": reject_reason})
            continue
        candidate_count += 1
        bubble_mask[component] = True

    if np.any(bubble_mask):
        zone = ndimage.binary_dilation(bubble_mask, structure=_disk(config.bubble_suppress_radius_px))
    else:
        zone = np.zeros_like(bubble_mask, dtype=bool)

    return BubbleSuppressResult(
        zone=np.asarray(zone, dtype=bool),
        mask=np.asarray(bubble_mask, dtype=bool),
        diagnostics={
            "bubble_suppress_zone_area_px": int(np.count_nonzero(zone)),
            "bubble_suppress_zone_area_raw_px": int(np.count_nonzero(zone)),
            "bubble_candidate_count": int(candidate_count),
            "bubble_rejected_boxes": rejected_boxes[:50],
            "bubble_suppress_triggered": bool(np.any(zone)),
        },
    )


def _peripheral_bubble_suppress_zone(
    bubble_result: BubbleSuppressResult,
    raw_target: np.ndarray,
    config: DetectorConfig,
) -> BubbleSuppressResult:
    if not np.any(bubble_result.zone) or raw_target.size == 0:
        return bubble_result
    rows_result = _mesh_envelope_rows(raw_target, config)
    if not rows_result.measurement_rows:
        return bubble_result

    selected_row = max(rows_result.measurement_rows, key=lambda row: (row["width"], row["pixel_count"]))
    support_bounds = _dominant_support_bounds(raw_target, config)
    height, width = raw_target.shape
    yy, xx = np.mgrid[0:height, 0:width]
    lateral_margin = max(float(config.bubble_suppress_radius_px) * 3.0, width * 0.045)
    vertical_margin = max(float(config.bubble_suppress_radius_px) * 3.0, height * 0.18)
    left = float(support_bounds[0] if support_bounds is not None else selected_row["left"])
    right = float(support_bounds[1] if support_bounds is not None else selected_row["right"])
    center_v = float(selected_row["v"])
    peripheral = (
        (xx.astype(float) <= left + lateral_margin)
        | (xx.astype(float) >= right - lateral_margin)
        | (yy.astype(float) <= center_v - vertical_margin)
        | (yy.astype(float) >= center_v + vertical_margin)
    )
    zone = np.asarray(bubble_result.zone, dtype=bool) & peripheral
    diagnostics = {
        **bubble_result.diagnostics,
        "bubble_suppress_zone_area_raw_px": int(bubble_result.diagnostics.get("bubble_suppress_zone_area_px", 0)),
        "bubble_suppress_zone_area_px": int(np.count_nonzero(zone)),
        "bubble_suppress_triggered": bool(np.any(zone)),
        "bubble_peripheral_filter_left_px": float(left),
        "bubble_peripheral_filter_right_px": float(right),
        "bubble_peripheral_filter_center_v_px": float(center_v),
        "bubble_peripheral_filter_lateral_margin_px": float(lateral_margin),
        "bubble_peripheral_filter_vertical_margin_px": float(vertical_margin),
        "bubble_peripheral_filter_support_bounds_used": bool(support_bounds is not None),
    }
    return BubbleSuppressResult(
        zone=zone,
        mask=np.asarray(bubble_result.mask, dtype=bool) & peripheral,
        diagnostics=diagnostics,
    )


def _select_mesh_candidate_with_bubble_guard(
    *,
    raw_candidate: DetectionCandidate | None,
    clean_candidate: DetectionCandidate | None,
    raw_target: np.ndarray,
    clean_target: np.ndarray | None,
    bubble_result: BubbleSuppressResult,
    roi_shape: tuple[int, int],
) -> tuple[DetectionCandidate | None, np.ndarray | None, str]:
    if clean_candidate is None:
        return raw_candidate, raw_target if raw_candidate is not None else None, "raw_guard_no_clean_candidate"
    if raw_candidate is None:
        return clean_candidate, clean_target, "clean_measurement_mask"

    raw_width = float(raw_candidate.width_px)
    clean_width = float(clean_candidate.width_px)
    shrink_px = raw_width - clean_width
    roi_area = max(1.0, float(roi_shape[0] * roi_shape[1]))
    raw_target_area = max(1.0, float(np.count_nonzero(raw_target)))
    zone_area = float(np.count_nonzero(bubble_result.zone))
    candidate_count = int(bubble_result.diagnostics.get("bubble_candidate_count", 0))
    broad_zone = (
        candidate_count >= 80
        or zone_area / roi_area >= 0.035
        or zone_area / raw_target_area >= 0.18
    )
    max_safe_shrink = max(8.0, raw_width * 0.01)
    if broad_zone and shrink_px > max_safe_shrink:
        return raw_candidate, raw_target, "raw_guard_broad_bubble_zone"
    excessive_clean_shrink = shrink_px > max(24.0, raw_width * 0.18)
    if excessive_clean_shrink:
        return raw_candidate, raw_target, "raw_guard_excessive_clean_shrink"
    return clean_candidate, clean_target, "clean_measurement_mask"


def _dominant_support_bounds(mask: np.ndarray, config: DetectorConfig) -> tuple[int, int] | None:
    ys, xs = np.nonzero(mask)
    if len(xs) < max(1, int(config.min_window_pixels)):
        return None
    width = int(mask.shape[1])
    counts = np.bincount(xs, minlength=width).astype(float)
    smooth_px = max(5, int(config.envelope_window_px) | 1, 15)
    smooth_counts = ndimage.uniform_filter1d(counts, size=smooth_px, mode="nearest")
    max_support = float(np.max(smooth_counts)) if smooth_counts.size else 0.0
    if max_support <= 0.0:
        return None
    support_cols = np.where(smooth_counts >= max_support * 0.25)[0]
    if len(support_cols) == 0:
        return None
    runs: list[tuple[int, int]] = []
    start = prev = int(support_cols[0])
    for col in support_cols[1:]:
        current = int(col)
        if current == prev + 1:
            prev = current
            continue
        runs.append((start, prev))
        start = prev = current
    runs.append((start, prev))

    def _score(run: tuple[int, int]) -> tuple[float, int]:
        left, right = run
        return float(np.sum(counts[left : right + 1])), right - left + 1

    best_left, best_right = max(runs, key=_score)
    return int(best_left), int(best_right)


def _dark_line_response(gray: np.ndarray, config: DetectorConfig) -> np.ndarray:
    response = _enhance_dark_lines(gray, config.dark_enhance_bg_kernel_px).astype(float)
    if response.size == 0:
        return response
    length = max(3, int(config.dark_line_filter_length_px) | 1)
    width = max(1, int(config.dark_line_filter_width_px) | 1)
    horizontal = ndimage.uniform_filter(response, size=(width, length), mode="nearest")
    vertical = ndimage.uniform_filter(response, size=(length, width), mode="nearest")
    main_diag = ndimage.uniform_filter(response + np.roll(response, 1, axis=0), size=(width, length), mode="nearest")
    anti_diag = ndimage.uniform_filter(response + np.roll(response, -1, axis=0), size=(width, length), mode="nearest")
    return np.maximum.reduce([response, horizontal, vertical, main_diag * 0.5, anti_diag * 0.5])


def _prune_short_artifact_spurs(
    mask: np.ndarray,
    ridge_response: np.ndarray,
    bubble_suppress_zone: np.ndarray,
    config: DetectorConfig,
) -> SpurPruneResult:
    clean = np.asarray(mask, dtype=bool).copy()
    if not config.spur_prune_enabled or clean.size == 0 or not np.any(clean):
        return SpurPruneResult(
            mask=clean,
            diagnostics={
                "spur_prune_removed_count": 0,
                "spur_prune_removed_area_px": 0,
            },
        )

    guard_zone = np.asarray(bubble_suppress_zone, dtype=bool)
    if config.spur_prune_dilate_px > 0 and np.any(guard_zone):
        guard_zone = ndimage.binary_dilation(guard_zone, structure=_disk(config.spur_prune_dilate_px))
    low_ridge_enabled = float(config.spur_prune_min_ridge_response) > 0.0
    if not np.any(guard_zone) and not low_ridge_enabled:
        return SpurPruneResult(
            mask=clean,
            diagnostics={
                "spur_prune_removed_count": 0,
                "spur_prune_removed_area_px": 0,
            },
        )

    degree = _neighbor_count(clean)
    endpoint_coords = np.column_stack(np.nonzero(clean & (degree <= 1)))
    removed = np.zeros_like(clean, dtype=bool)
    removed_count = 0
    max_length = max(1, int(config.spur_prune_max_length_px))
    for start_y, start_x in endpoint_coords:
        path = _trace_terminal_branch(clean, degree, int(start_y), int(start_x), max_length)
        if not path or len(path) > max_length:
            continue
        ys = np.array([coord[0] for coord in path], dtype=int)
        xs = np.array([coord[1] for coord in path], dtype=int)
        zone_overlap = bool(np.any(guard_zone[ys, xs])) if np.any(guard_zone) else False
        mean_ridge = float(np.mean(ridge_response[ys, xs])) if ridge_response.size else 0.0
        low_ridge = low_ridge_enabled and mean_ridge < float(config.spur_prune_min_ridge_response)
        if config.spur_prune_require_bubble_overlap_or_low_ridge and not (zone_overlap or low_ridge):
            continue
        branch = np.zeros_like(clean, dtype=bool)
        branch[ys, xs] = True
        if config.spur_prune_dilate_px > 0:
            branch = ndimage.binary_dilation(branch, structure=_disk(config.spur_prune_dilate_px))
        removed |= branch & clean
        removed_count += 1

    if np.any(removed):
        clean &= ~removed
    return SpurPruneResult(
        mask=clean,
        diagnostics={
            "spur_prune_removed_count": int(removed_count),
            "spur_prune_removed_area_px": int(np.count_nonzero(removed)),
        },
    )


def _neighbor_count(mask: np.ndarray) -> np.ndarray:
    counts = ndimage.convolve(mask.astype(np.uint8), np.ones((3, 3), dtype=np.uint8), mode="constant", cval=0)
    return counts.astype(int) - mask.astype(int)


def _trace_terminal_branch(
    mask: np.ndarray,
    degree: np.ndarray,
    start_y: int,
    start_x: int,
    max_length: int,
) -> list[tuple[int, int]]:
    path: list[tuple[int, int]] = [(start_y, start_x)]
    previous: tuple[int, int] | None = None
    current = (start_y, start_x)
    height, width = mask.shape
    while len(path) <= max_length:
        y, x = current
        neighbors: list[tuple[int, int]] = []
        for yy in range(max(0, y - 1), min(height, y + 2)):
            for xx in range(max(0, x - 1), min(width, x + 2)):
                if yy == y and xx == x:
                    continue
                if previous is not None and (yy, xx) == previous:
                    continue
                if mask[yy, xx]:
                    neighbors.append((yy, xx))
        if len(neighbors) != 1:
            break
        next_point = neighbors[0]
        path.append(next_point)
        if degree[next_point] != 2:
            break
        previous = current
        current = next_point
    return path


def _main_component(mask: np.ndarray, min_area: int) -> np.ndarray | None:
    labels, labels_count = ndimage.label(mask, structure=np.ones((3, 3), dtype=bool))
    if labels_count < 1:
        return None
    areas = ndimage.sum(mask, labels, index=np.arange(1, labels_count + 1))
    best_offset = int(np.argmax(areas))
    best_area = int(areas[best_offset])
    if best_area < min_area:
        return None
    best_label = best_offset + 1
    return labels == best_label


def _largest_mesh_region(mask: np.ndarray, config: DetectorConfig) -> np.ndarray | None:
    height, width = mask.shape
    labels, labels_count = ndimage.label(mask, structure=np.ones((3, 3), dtype=bool))
    if labels_count < 1:
        return None

    components: list[dict[str, int]] = []
    for label in range(1, labels_count + 1):
        component = labels == label
        area = int(np.count_nonzero(component))
        if area < config.min_component_area_px:
            continue
        ys, xs = np.nonzero(component)
        component_width = int(xs.max() - xs.min() + 1)
        component_height = int(ys.max() - ys.min() + 1)
        if component_width < config.mesh_min_width_ratio * width:
            continue
        if component_height < config.mesh_min_height_ratio * height:
            continue
        components.append(
            {
                "label": label,
                "area": area,
                "left": int(xs.min()),
                "right": int(xs.max()),
                "top": int(ys.min()),
                "bottom": int(ys.max()),
                "width": component_width,
                "height": component_height,
            }
        )

    if not components:
        return None

    components.sort(key=lambda item: item["area"], reverse=True)
    largest = components[0]
    min_related_area = max(config.min_component_area_px, int(largest["area"] * 0.18))
    max_gap = max(config.mesh_region_margin_px * 2, int(0.08 * width))
    related: list[dict[str, int]] = []
    group_left = largest["left"]
    group_right = largest["right"]
    group_top = largest["top"]
    group_bottom = largest["bottom"]
    for component in components:
        if component["area"] < min_related_area:
            continue
        vertical_overlap = min(group_bottom, component["bottom"]) - max(group_top, component["top"]) + 1
        min_height = max(1, min(group_bottom - group_top + 1, component["height"]))
        if vertical_overlap / min_height < 0.35:
            continue
        horizontal_gap = max(group_left - component["right"], component["left"] - group_right, 0)
        if horizontal_gap > max_gap:
            continue
        related.append(component)
        group_left = min(group_left, component["left"])
        group_right = max(group_right, component["right"])
        group_top = min(group_top, component["top"])
        group_bottom = max(group_bottom, component["bottom"])

    obj = np.zeros_like(mask, dtype=bool)
    for component in related:
        obj[labels == component["label"]] = True
    return obj


def _mesh_envelope_rows(
    mask: np.ndarray,
    config: DetectorConfig,
    *,
    endpoint_guard_zone: np.ndarray | None = None,
    ridge_response: np.ndarray | None = None,
) -> MeshEnvelopeRowsResult:
    ys, xs = np.nonzero(mask)
    min_pixels = max(1, int(config.min_window_pixels))
    if len(xs) < min_pixels:
        return MeshEnvelopeRowsResult(
            all_rows=[],
            measurement_rows=[],
            rejected_rows=[],
            diagnostics={
                "mesh_all_row_count": 0,
                "mesh_measurement_row_count": 0,
                "mesh_rejected_row_count": 0,
                "fallback_used": False,
            },
        )

    height = mask.shape[0]
    window = max(5, int(config.envelope_window_px), int(0.04 * height), 25)
    step = max(1, int(config.envelope_step_px))
    q = min(max(float(config.envelope_quantile), 0.0), 0.49)

    rows: list[dict[str, float]] = []
    for center_v in range(int(ys.min()), int(ys.max()) + 1, step):
        selected = (ys >= center_v - window // 2) & (ys <= center_v + window // 2)
        pixel_count = int(np.count_nonzero(selected))
        if pixel_count < min_pixels:
            continue
        xx = xs[selected].astype(float)
        left = float(np.quantile(xx, q))
        right = float(np.quantile(xx, 1.0 - q))
        start_v = max(0, center_v - window // 2)
        end_v = min(height - 1, center_v + window // 2)
        rows.append(
            {
                "v": float(center_v),
                "left": left,
                "right": right,
                "width": right - left,
                "pixel_count": float(pixel_count),
                "window_start_v": float(start_v),
                "window_end_v": float(end_v),
            }
        )

    if not rows:
        return MeshEnvelopeRowsResult(
            all_rows=[],
            measurement_rows=[],
            rejected_rows=[],
            diagnostics={
                "mesh_all_row_count": 0,
                "mesh_measurement_row_count": 0,
                "mesh_rejected_row_count": 0,
                "fallback_used": False,
            },
        )

    max_width = max(row["width"] for row in rows)
    max_count = max(row["pixel_count"] for row in rows)
    raw_width = max_width
    rejected_rows: list[dict[str, Any]] = []
    keep_rows: list[dict[str, float]] = []
    for row in rows:
        if row["width"] < config.mesh_row_width_keep_ratio * max_width:
            rejected_rows.append({**row, "rejected_reason": "ROW_WIDTH_BELOW_KEEP_RATIO"})
            continue
        if row["pixel_count"] < config.mesh_row_count_keep_ratio * max_count:
            rejected_rows.append({**row, "rejected_reason": "ROW_COUNT_BELOW_KEEP_RATIO"})
            continue
        keep_rows.append(row)

    boundary_rows: list[dict[str, float]] = []
    boundary_rejected_count = 0
    if config.boundary_support_enabled:
        for row in keep_rows:
            support = _mesh_boundary_support(mask, row, config)
            supported_row = {**row, **support}
            if bool(support["boundary_support_pass"]):
                boundary_rows.append(supported_row)
                continue
            boundary_rejected_count += 1
            rejected_rows.append(
                {
                    **supported_row,
                    "rejected_reason": "BOUNDARY_SUPPORT_WEAK",
                }
            )
    else:
        boundary_rows = keep_rows

    percentile_source = boundary_rows or keep_rows or rows
    percentile_width = float(
        np.percentile(
            np.array([row["width"] for row in percentile_source], dtype=float),
            min(max(float(config.envelope_width_percentile), 0.0), 100.0),
        )
    )
    threshold = percentile_width + max(0.0, float(config.envelope_width_outlier_epsilon_px))
    measurement_rows: list[dict[str, float]] = []
    outlier_rejected_count = 0
    for row in boundary_rows:
        if row["width"] > threshold and not _has_width_consensus(row, boundary_rows, config, step):
            outlier_rejected_count += 1
            rejected_rows.append(
                {
                    **row,
                    "rejected_reason": "WIDTH_OUTLIER_WITHOUT_CONSENSUS",
                }
            )
            continue
        measurement_rows.append(row)

    endpoint_rejected_count = 0
    endpoint_reject_reason = ""
    guarded_rows: list[dict[str, float]] = []
    if measurement_rows:
        for row in measurement_rows:
            guard = _endpoint_guard(row, mask.shape, config, endpoint_guard_zone, ridge_response)
            guarded_row = {**row, **guard}
            if bool(guard["endpoint_guard_pass"]):
                guarded_rows.append(guarded_row)
                continue
            endpoint_rejected_count += 1
            endpoint_reject_reason = str(guard["endpoint_guard_reject_reason"])
            rejected_rows.append(
                {
                    **guarded_row,
                    "rejected_reason": endpoint_reject_reason,
                }
            )
        measurement_rows = guarded_rows

    fallback_used = False
    if not measurement_rows and endpoint_rejected_count == 0:
        fallback_used = True
        measurement_rows = keep_rows or rows

    diagnostics = {
        "raw_width_px": float(raw_width),
        "robust_width_percentile_px": float(percentile_width),
        "envelope_width_percentile": float(config.envelope_width_percentile),
        "envelope_width_outlier_epsilon_px": float(config.envelope_width_outlier_epsilon_px),
        "envelope_min_consensus_rows": int(config.envelope_min_consensus_rows),
        "boundary_support_enabled": bool(config.boundary_support_enabled),
        "boundary_support_window_px": int(config.boundary_support_window_px),
        "boundary_support_min_pixels": int(config.boundary_support_min_pixels),
        "boundary_support_min_ratio": float(config.boundary_support_min_ratio),
        "boundary_support_rejected_count": int(boundary_rejected_count),
        "rejected_outlier_rows_count": int(outlier_rejected_count),
        "endpoint_guard_rejected_rows_count": int(endpoint_rejected_count),
        "endpoint_guard_reject_reason": endpoint_reject_reason,
        "fallback_used": bool(fallback_used),
        "mesh_all_row_count": len(rows),
        "mesh_measurement_row_count": len(measurement_rows),
        "mesh_rejected_row_count": len(rejected_rows),
    }
    return MeshEnvelopeRowsResult(
        all_rows=rows,
        measurement_rows=measurement_rows,
        rejected_rows=rejected_rows,
        diagnostics=diagnostics,
    )


def _mesh_boundary_support(
    mask: np.ndarray,
    row: dict[str, float],
    config: DetectorConfig,
) -> dict[str, float | bool]:
    height, width = mask.shape
    y0 = max(0, int(round(row["window_start_v"])))
    y1 = min(height - 1, int(round(row["window_end_v"])))
    left = int(round(row["left"]))
    right = int(round(row["right"]))
    support_window = max(1, int(config.boundary_support_window_px))

    left_x0 = max(0, left - support_window)
    left_x1 = min(width - 1, left + support_window)
    right_x0 = max(0, right - support_window)
    right_x1 = min(width - 1, right + support_window)
    band = mask[y0 : y1 + 1]
    left_count = int(np.count_nonzero(band[:, left_x0 : left_x1 + 1]))
    right_count = int(np.count_nonzero(band[:, right_x0 : right_x1 + 1]))
    denominator = max(1.0, float(row["pixel_count"]))
    left_ratio = float(left_count) / denominator
    right_ratio = float(right_count) / denominator
    min_count = max(1, int(config.boundary_support_min_pixels))
    min_ratio = max(0.0, float(config.boundary_support_min_ratio))
    pixel_pass = left_count >= min_count and right_count >= min_count
    low_ratio = min(left_ratio, right_ratio)
    high_ratio = max(left_ratio, right_ratio)
    ratio_pass = low_ratio >= min_ratio or low_ratio >= high_ratio * 0.8
    return {
        "left_boundary_support_pixels": float(left_count),
        "right_boundary_support_pixels": float(right_count),
        "left_boundary_support_ratio": left_ratio,
        "right_boundary_support_ratio": right_ratio,
        "boundary_support_pass": bool(pixel_pass and ratio_pass),
    }


def _endpoint_guard(
    row: dict[str, float],
    shape: tuple[int, int],
    config: DetectorConfig,
    endpoint_guard_zone: np.ndarray | None,
    ridge_response: np.ndarray | None,
) -> dict[str, float | bool | str]:
    height, width = shape
    y0 = max(0, int(round(row["window_start_v"])))
    y1 = min(height - 1, int(round(row["window_end_v"])))
    left = int(round(row["left"]))
    right = int(round(row["right"]))
    radius = max(1, int(config.boundary_support_window_px), int(config.bubble_suppress_radius_px))

    def _patch_bounds(x: int) -> tuple[int, int]:
        return max(0, x - radius), min(width - 1, x + radius)

    left_x0, left_x1 = _patch_bounds(left)
    right_x0, right_x1 = _patch_bounds(right)
    if endpoint_guard_zone is not None and endpoint_guard_zone.size:
        zone = np.asarray(endpoint_guard_zone, dtype=bool)
        left_zone = bool(np.any(zone[y0 : y1 + 1, left_x0 : left_x1 + 1]))
        right_zone = bool(np.any(zone[y0 : y1 + 1, right_x0 : right_x1 + 1]))
        if left_zone or right_zone:
            return {
                "endpoint_guard_pass": False,
                "endpoint_guard_reject_reason": "ENDPOINT_OVERLAPS_BUBBLE_SUPPRESS_ZONE",
                "left_endpoint_ridge_response": 0.0,
                "right_endpoint_ridge_response": 0.0,
            }

    minimum = max(0.0, float(config.endpoint_min_dark_line_response))
    left_response = 0.0
    right_response = 0.0
    if minimum > 0.0 and ridge_response is not None and ridge_response.size:
        response = np.asarray(ridge_response, dtype=float)
        left_response = float(np.max(response[y0 : y1 + 1, left_x0 : left_x1 + 1]))
        right_response = float(np.max(response[y0 : y1 + 1, right_x0 : right_x1 + 1]))
        if left_response < minimum or right_response < minimum:
            return {
                "endpoint_guard_pass": False,
                "endpoint_guard_reject_reason": "ENDPOINT_DARK_LINE_RESPONSE_BELOW_MIN",
                "left_endpoint_ridge_response": left_response,
                "right_endpoint_ridge_response": right_response,
            }

    return {
        "endpoint_guard_pass": True,
        "endpoint_guard_reject_reason": "",
        "left_endpoint_ridge_response": left_response,
        "right_endpoint_ridge_response": right_response,
    }


def _has_width_consensus(
    row: dict[str, float],
    rows: list[dict[str, float]],
    config: DetectorConfig,
    step: int,
) -> bool:
    min_rows = max(1, int(config.envelope_min_consensus_rows))
    if min_rows <= 1:
        return True
    near_v = max(1.0, float(step) * float(min_rows))
    epsilon = max(0.0, float(config.envelope_width_outlier_epsilon_px))
    similar = [
        other
        for other in rows
        if abs(other["v"] - row["v"]) <= near_v and other["width"] >= row["width"] - epsilon
    ]
    return len(similar) >= min_rows


def _mesh_envelope_candidate(
    mask: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
    *,
    endpoint_guard_zone: np.ndarray | None = None,
    ridge_response: np.ndarray | None = None,
) -> DetectionCandidate | None:
    rows_result = _mesh_envelope_rows(
        mask,
        config,
        endpoint_guard_zone=endpoint_guard_zone,
        ridge_response=ridge_response,
    )
    rows = rows_result.measurement_rows
    if not rows:
        return None

    selected_row = max(rows, key=lambda row: (row["width"], row["pixel_count"]))
    left = float(selected_row["left"])
    right = float(selected_row["right"])
    length = float(selected_row["width"])
    if length <= 0:
        return None

    center_v = float(selected_row["v"])
    all_rows = rows_result.all_rows or rows
    min_v = min(row["v"] for row in rows)
    max_v = max(row["v"] for row in rows)
    global_left_row = min(all_rows, key=lambda row: row["left"])
    global_right_row = max(all_rows, key=lambda row: row["right"])
    global_left = float(global_left_row["left"])
    global_right = float(global_right_row["right"])
    a = roi_local_to_measurement_point(roi, left, center_v)
    b = roi_local_to_measurement_point(roi, right, center_v)
    measurement_band_box = _measurement_band_box(mask, roi, selected_row, config)
    full_box, box_diagnostics = _contour_full_box(mask, roi, config, measurement_band_box)
    projection_box = full_box or measurement_band_box
    confidence = min(1.0, 0.25 + length / max(1.0, roi.width) * 0.65 + len(rows) / max(1.0, mask.shape[0]))
    return DetectionCandidate(
        candidate_id=f"archived-mesh-envelope-row-{int(round(center_v))}",
        axis_position_px=float(center_v),
        width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
        a=a,
        b=b,
        confidence=confidence,
        metadata={
            "debug_artifacts": {
                "mesh_envelope_row_count": len(rows),
                **rows_result.diagnostics,
                **box_diagnostics,
                "mesh_left_px": float(a.x),
                "mesh_right_px": float(b.x),
                "mesh_left_local_px": float(left),
                "mesh_right_local_px": float(right),
                "mesh_best_row_v_px": center_v,
                "mesh_selected_row_width_px": length,
                "selected_row": dict(selected_row),
                "selected_measurement_row_v_px": center_v,
                "selected_measurement_row_width_px": length,
                "mesh_global_left_local_px": global_left,
                "mesh_global_left_row_v_px": float(global_left_row["v"]),
                "mesh_global_right_local_px": global_right,
                "mesh_global_right_row_v_px": float(global_right_row["v"]),
                "mesh_global_span_px": global_right - global_left,
                "contour_full_box": projection_box,
                "contour_measurement_band_box": measurement_band_box,
                "show_measurement_band_box": bool(config.show_measurement_band_box),
            },
            "local_min_along_px": float(left),
            "local_max_along_px": float(right),
            "local_min_perpendicular_px": float(min_v),
            "local_max_perpendicular_px": float(max_v),
            "theta_deg": float(roi.angle_deg),
            "contour_projection_box": projection_box,
            "contour_full_box": projection_box,
            "contour_measurement_band_box": measurement_band_box,
            "contour_direction_arrow": [point.model_dump(mode="json") for point in [a, b]],
        },
    )


def _measurement_band_box(
    mask: np.ndarray,
    roi: RotatedROI,
    selected_row: dict[str, float],
    config: DetectorConfig,
) -> list[dict[str, float]]:
    half_window = max(1.0, float(max(5, int(config.envelope_window_px), int(0.04 * mask.shape[0]), 25))) / 2.0
    left = float(selected_row["left"])
    right = float(selected_row["right"])
    center_v = float(selected_row["v"])
    top = max(0.0, center_v - half_window)
    bottom = min(float(mask.shape[0] - 1), center_v + half_window)
    points = [
        roi_local_to_measurement_point(roi, left, top),
        roi_local_to_measurement_point(roi, right, top),
        roi_local_to_measurement_point(roi, right, bottom),
        roi_local_to_measurement_point(roi, left, bottom),
    ]
    return [point.model_dump(mode="json") for point in points]


def _contour_full_box(
    mask: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
    measurement_band_box: list[dict[str, float]],
) -> tuple[list[dict[str, float]], dict[str, Any]]:
    if config.contour_box_mode == "measurement_band":
        return measurement_band_box, {
            "contour_box_mode": config.contour_box_mode,
            "contour_box_padding_px": float(config.contour_box_padding_px),
            "contour_box_quantile": float(config.contour_box_quantile),
            "contour_box_coverage_ratio": 1.0,
            "contour_touches_roi_edge": False,
        }

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return [], {
            "contour_box_mode": config.contour_box_mode,
            "contour_box_padding_px": float(config.contour_box_padding_px),
            "contour_box_quantile": float(config.contour_box_quantile),
            "contour_box_coverage_ratio": 0.0,
            "contour_touches_roi_edge": False,
        }

    q = 0.0 if config.contour_box_mode == "component_bbox" else min(max(float(config.contour_box_quantile), 0.0), 0.49)
    padding = max(0.0, float(config.contour_box_padding_px))
    if q <= 0.0:
        left = float(xs.min())
        right = float(xs.max())
        top = float(ys.min())
        bottom = float(ys.max())
    else:
        xf = xs.astype(float)
        yf = ys.astype(float)
        left = float(np.quantile(xf, q))
        right = float(np.quantile(xf, 1.0 - q))
        top = float(np.quantile(yf, q))
        bottom = float(np.quantile(yf, 1.0 - q))

    left = max(0.0, left - padding)
    right = min(float(mask.shape[1] - 1), right + padding)
    top = max(0.0, top - padding)
    bottom = min(float(mask.shape[0] - 1), bottom + padding)
    inside = (xs.astype(float) >= left) & (xs.astype(float) <= right) & (ys.astype(float) >= top) & (ys.astype(float) <= bottom)
    coverage = float(np.count_nonzero(inside)) / max(1.0, float(len(xs)))
    guard = max(0.0, float(config.roi_edge_guard_px))
    touches_roi_edge = bool(
        left <= guard
        or top <= guard
        or right >= float(mask.shape[1] - 1) - guard
        or bottom >= float(mask.shape[0] - 1) - guard
    )
    points = [
        roi_local_to_measurement_point(roi, left, top),
        roi_local_to_measurement_point(roi, right, top),
        roi_local_to_measurement_point(roi, right, bottom),
        roi_local_to_measurement_point(roi, left, bottom),
    ]
    diagnostics: dict[str, Any] = {
        "contour_box_mode": config.contour_box_mode,
        "contour_box_padding_px": float(config.contour_box_padding_px),
        "contour_box_quantile": float(q),
        "contour_box_coverage_ratio": coverage,
        "contour_box_min_coverage_ratio": float(config.contour_box_min_coverage_ratio),
        "contour_touches_roi_edge": touches_roi_edge,
    }
    if touches_roi_edge:
        diagnostics["roi_edge_warning"] = "Detected contour touches ROI boundary; expand ROI or increase detection_roi_padding_px."
    return [point.model_dump(mode="json") for point in points], diagnostics


def _wire_bundle_mask(gray: np.ndarray, config: DetectorConfig) -> np.ndarray:
    response = _enhance_dark_lines(gray, config.dark_enhance_bg_kernel_px)
    response = ndimage.gaussian_filter(response.astype(float), sigma=1.0)
    threshold = max(float(config.wire_min_response), _otsu_threshold(response) * config.wire_threshold_scale)
    mask = response >= threshold
    if config.wire_bridge_kernel_px > 1:
        mask = ndimage.binary_closing(mask, structure=_kernel(config.wire_bridge_kernel_px))
    return _keep_wire_components(mask, config)


def _keep_wire_components(mask: np.ndarray, config: DetectorConfig) -> np.ndarray:
    labels, labels_count = ndimage.label(mask, structure=np.ones((3, 3), dtype=bool))
    kept = np.zeros_like(mask, dtype=bool)
    for label in range(1, labels_count + 1):
        component = labels == label
        area, major_length, elongation = _component_geometry(component)
        if area >= config.wire_min_component_area_px or (
            major_length >= config.wire_min_length_px and elongation >= config.wire_min_elongation
        ):
            kept[component] = True
    return kept


def _component_geometry(component: np.ndarray) -> tuple[int, float, float]:
    ys, xs = np.nonzero(component)
    area = int(len(xs))
    if area < 2:
        return area, 0.0, 0.0

    points = np.column_stack([xs, ys]).astype(float)
    centered = points - points.mean(axis=0, keepdims=True)
    cov = centered.T @ centered / max(1, area - 1)
    eigvals = np.linalg.eigvalsh(cov)
    major = float(math.sqrt(max(float(eigvals[-1]), 0.0)) * 4.0)
    minor = float(math.sqrt(max(float(eigvals[0]), 1e-6)) * 4.0)
    return area, major, major / max(minor, 1e-3)


def _wire_projection_candidate(
    mask: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
) -> DetectionCandidate | None:
    ys, xs = np.nonzero(mask)
    if len(xs) < max(3, int(config.min_window_pixels)):
        return None

    projection = _wire_stable_projection(mask, config)
    if projection is None:
        return None
    min_u, max_u, min_v, max_v, projection_debug = projection
    length = max_u - min_u
    if length <= 0:
        return None

    center_v = (min_v + max_v) / 2.0
    a = roi_local_to_measurement_point(roi, min_u, center_v)
    b = roi_local_to_measurement_point(roi, max_u, center_v)
    box = [
        roi_local_to_measurement_point(roi, min_u, min_v),
        roi_local_to_measurement_point(roi, max_u, min_v),
        roi_local_to_measurement_point(roi, max_u, max_v),
        roi_local_to_measurement_point(roi, min_u, max_v),
    ]
    raw_width_perpendicular = max_v - min_v
    point_count = int(len(xs))
    confidence = min(1.0, 0.20 + length / max(1.0, roi.width) * 0.65 + point_count / max(1.0, mask.size) * 3.0)
    return DetectionCandidate(
        candidate_id="archived-wire-bundle-projection",
        axis_position_px=float(center_v),
        width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
        a=a,
        b=b,
        confidence=confidence,
        metadata={
            "debug_artifacts": {
                "wire_point_count": point_count,
                "wire_raw_length_px": float(length),
                "wire_width_perpendicular_px": float(raw_width_perpendicular),
                "wire_min_along_px": float(min_u),
                "wire_max_along_px": float(max_u),
                "wire_min_perpendicular_px": float(min_v),
                "wire_max_perpendicular_px": float(max_v),
                **projection_debug,
            },
            "local_min_along_px": float(min_u),
            "local_max_along_px": float(max_u),
            "local_min_perpendicular_px": float(min_v),
            "local_max_perpendicular_px": float(max_v),
            "theta_deg": float(roi.angle_deg),
            "contour_projection_box": [point.model_dump(mode="json") for point in box],
            "contour_direction_arrow": [point.model_dump(mode="json") for point in [a, b]],
        },
    )


def _wire_stable_projection(
    mask: np.ndarray,
    config: DetectorConfig,
) -> tuple[float, float, float, float, dict[str, Any]] | None:
    ys, xs = np.nonzero(mask)
    min_pixels = max(3, int(config.min_window_pixels))
    if len(xs) < min_pixels:
        return None

    width = int(mask.shape[1])
    counts = np.bincount(xs, minlength=width).astype(float)
    smooth_px = max(3, int(config.envelope_window_px) | 1)
    smooth_counts = ndimage.uniform_filter1d(counts, size=smooth_px, mode="nearest")
    max_support = float(np.max(smooth_counts)) if smooth_counts.size else 0.0
    if max_support <= 0.0:
        return None

    support_threshold = max(4.0, float(min_pixels) * 0.5, max_support * 0.01)
    support_cols = np.where(smooth_counts >= support_threshold)[0]
    if len(support_cols) == 0:
        return None

    raw_runs: list[tuple[int, int]] = []
    start = prev = int(support_cols[0])
    for col in support_cols[1:]:
        current = int(col)
        if current == prev + 1:
            prev = current
            continue
        raw_runs.append((start, prev))
        start = prev = current
    raw_runs.append((start, prev))
    raw_run_scores = [
        float(np.sum(counts[run_start : run_end + 1]))
        for run_start, run_end in raw_runs
    ]
    max_run_score = max(raw_run_scores) if raw_run_scores else 0.0
    min_run_score = max(float(min_pixels) * 2.0, max_run_score * 0.015)
    supported_runs = [
        run
        for run, score in zip(raw_runs, raw_run_scores)
        if score >= min_run_score
    ]
    if not supported_runs:
        supported_runs = raw_runs

    base_gap = max(
        0,
        int(math.ceil(float(config.wire_box_padding_px) + max(2.0, smooth_px * 0.5))),
    )
    continuity_gap = int(math.ceil(width * max(0.0, float(config.wire_support_merge_gap_ratio))))
    max_gap = max(base_gap, continuity_gap)
    merged_runs: list[tuple[int, int]] = []
    start, prev = supported_runs[0]
    for run_start, run_end in supported_runs[1:]:
        gap = run_start - prev - 1
        if gap <= max_gap:
            prev = run_end
            continue
        merged_runs.append((start, prev))
        start, prev = run_start, run_end
    merged_runs.append((start, prev))

    def _run_score(run: tuple[int, int]) -> tuple[float, int]:
        run_start, run_end = run
        return float(np.sum(counts[run_start : run_end + 1])), run_end - run_start + 1

    selected_start, selected_end = max(merged_runs, key=_run_score)
    in_selected_group = (xs >= selected_start) & (xs <= selected_end)
    if int(np.count_nonzero(in_selected_group)) < min_pixels:
        return None

    selected_xs = xs[in_selected_group].astype(float)
    selected_ys = ys[in_selected_group].astype(float)
    q = min(max(float(config.contour_projection_quantile) * 0.5, 0.0), 0.49)
    min_u = float(np.quantile(selected_xs, q))
    max_u = float(np.quantile(selected_xs, 1.0 - q))
    min_v = float(np.quantile(selected_ys, q))
    max_v = float(np.quantile(selected_ys, 1.0 - q))
    global_q = min(max(float(config.contour_projection_quantile), 0.0), 0.49)
    global_min_u = float(np.quantile(xs.astype(float), global_q))
    global_max_u = float(np.quantile(xs.astype(float), 1.0 - global_q))

    return (
        min_u,
        max_u,
        min_v,
        max_v,
        {
            "wire_projection_mode": "stable_support_columns",
            "wire_projection_quantile_effective": float(q),
            "wire_support_smooth_px": int(smooth_px),
            "wire_support_threshold_px": float(support_threshold),
            "wire_support_merge_gap_px": int(max_gap),
            "wire_support_base_merge_gap_px": int(base_gap),
            "wire_support_continuity_merge_gap_px": int(continuity_gap),
            "wire_support_raw_run_count": len(raw_runs),
            "wire_support_min_run_score": float(min_run_score),
            "wire_support_filtered_run_count": len(supported_runs),
            "wire_support_merged_run_count": len(merged_runs),
            "wire_support_group_min_along_px": float(selected_start),
            "wire_support_group_max_along_px": float(selected_end),
            "wire_support_group_pixel_count": int(np.count_nonzero(in_selected_group)),
            "wire_global_quantile_min_along_px": global_min_u,
            "wire_global_quantile_max_along_px": global_max_u,
            "wire_global_quantile_length_px": global_max_u - global_min_u,
        },
    )


def _scan_vertical_candidates(
    mask: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
) -> list[DetectionCandidate]:
    height, width = mask.shape
    window = max(1, int(config.envelope_window_px))
    step = max(1, int(config.envelope_step_px))
    min_pixels = max(1, int(config.min_window_pixels))
    candidates: list[DetectionCandidate] = []
    for center_u in range(window // 2, max(window // 2 + 1, width - window // 2), step):
        start = max(0, center_u - window // 2)
        end = min(width, center_u + window // 2 + 1)
        ys, xs = np.nonzero(mask[:, start:end])
        if len(ys) < min_pixels:
            continue
        low_q = float(np.quantile(ys, config.envelope_quantile))
        high_q = float(np.quantile(ys, 1.0 - config.envelope_quantile))
        width_px = high_q - low_q
        if width_px < roi.height * config.window_width_keep_ratio:
            continue
        u = float((start + end - 1) / 2.0)
        a = roi_local_to_measurement_point(roi, u, low_q)
        b = roi_local_to_measurement_point(roi, u, high_q)
        candidates.append(
            DetectionCandidate(
                candidate_id=f"axis-{int(round(u))}",
                axis_position_px=u,
                width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
                a=a,
                b=b,
                confidence=min(1.0, len(ys) / max(1.0, height * (end - start))),
                metadata={"local_u": u, "local_low_v": low_q, "local_high_v": high_q},
            )
        )
    return candidates


def _candidate_jump(
    candidate: DetectionCandidate,
    previous: DetectionCandidate | None,
) -> float | None:
    if previous is None:
        return None
    return abs(candidate.axis_position_px - previous.axis_position_px)


def _kernel(size: int) -> np.ndarray:
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    return np.ones((size, size), dtype=bool)


def _disk(radius: int) -> np.ndarray:
    radius = max(0, int(radius))
    if radius <= 0:
        return np.ones((1, 1), dtype=bool)
    yy, xx = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return (xx * xx + yy * yy) <= radius * radius


def _diagnostic_images(
    target: np.ndarray,
    config: DetectorConfig,
    extra_masks: dict[str, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    mask = np.asarray(target, dtype=bool)
    contour = _outer_envelope_contour(mask, config)
    height, width = mask.shape
    images: dict[str, dict[str, Any]] = {
        "mask": {
            "label": "Detected mask",
            "coordinates": "roi_local_pixel",
            "width": int(width),
            "height": int(height),
            "data_url": _binary_mask_png_data_url(mask),
        },
        "contour": {
            "label": "Envelope contour",
            "coordinates": "roi_local_pixel",
            "width": int(width),
            "height": int(height),
            "data_url": _binary_mask_png_data_url(contour),
        },
    }
    for key, item in (extra_masks or {}).items():
        extra_mask = np.asarray(item.get("mask"), dtype=bool)
        extra_height, extra_width = extra_mask.shape
        images[key] = {
            "label": str(item.get("label", key)),
            "coordinates": "roi_local_pixel",
            "width": int(extra_width),
            "height": int(extra_height),
            "data_url": _binary_mask_png_data_url(extra_mask),
        }
    return images


def _outer_envelope_contour(mask: np.ndarray, config: DetectorConfig) -> np.ndarray:
    if mask.size == 0 or not np.any(mask):
        return np.zeros_like(mask, dtype=bool)
    closed = ndimage.binary_closing(mask, structure=_kernel(config.contour_close_kernel_px))
    filled = ndimage.binary_fill_holes(closed)
    main = _main_component(filled, min_area=1)
    envelope = np.asarray(main if main is not None else filled, dtype=bool)
    eroded = ndimage.binary_erosion(envelope, structure=np.ones((3, 3), dtype=bool), border_value=0)
    return envelope & ~eroded


def _binary_mask_png_data_url(mask: np.ndarray) -> str:
    image_array = np.where(np.asarray(mask, dtype=bool), 255, 0).astype(np.uint8)
    image = Image.fromarray(np.ascontiguousarray(image_array), mode="L")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _otsu_threshold(gray: np.ndarray) -> float:
    values = np.clip(gray, 0, 255).astype(np.uint8)
    hist = np.bincount(values.ravel(), minlength=256).astype(float)
    total = values.size
    if total == 0:
        return 0.0
    sum_total = float(np.dot(np.arange(256), hist))
    sum_background = 0.0
    weight_background = 0.0
    best_variance = -1.0
    best_threshold = 127
    for threshold in range(256):
        weight_background += hist[threshold]
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break
        sum_background += threshold * hist[threshold]
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        variance = weight_background * weight_foreground * (mean_background - mean_foreground) ** 2
        if variance > best_variance:
            best_variance = variance
            best_threshold = threshold
    return float(best_threshold)


def _invalid(
    frame_index: int,
    reason: str,
    *,
    raw_best_candidate: DetectionCandidate | None = None,
    selected_candidate: DetectionCandidate | None = None,
    rejected_candidates: list[DetectionCandidate] | None = None,
    quality: DetectionQuality | None = None,
) -> DetectionResult:
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.INVALID_NO_TARGET
        if reason in {"NO_TARGET", "EMPTY_FRAME", "EMPTY_ROI"}
        else DetectionStatus.INVALID_BAD_ENVELOPE,
        raw_best_candidate=raw_best_candidate,
        selected_candidate=selected_candidate,
        rejected_candidates=rejected_candidates or [],
        quality=quality or DetectionQuality(),
        rejected_reason=reason,
    )
