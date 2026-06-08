from __future__ import annotations

import base64
import io
import math
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
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


def detect_frame(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    previous_candidate: DetectionCandidate | None = None,
) -> DetectionResult:
    result, _ = detect_frame_with_state(
        frame,
        measurement,
        frame_index=frame_index,
        stability_state=CandidateSelectionState(selected_candidate=previous_candidate),
    )
    return result


def detect_frame_with_state(
    frame: np.ndarray,
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    stability_state: CandidateSelectionState | None = None,
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
        )
    if detector == DetectorType.BUNDLE_ENVELOPE:
        return _detect_wire_bundle_max_width(
            frame,
            measurement.roi,
            measurement.detector_config,
            frame_index=frame_index,
            detector_name=str(detector.value),
            stability_state=state,
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
) -> tuple[DetectionResult, CandidateSelectionState]:
    if frame.size == 0:
        return _invalid(frame_index, "EMPTY_FRAME"), stability_state

    local = _warp_rotated_roi(frame, roi)
    if local.size == 0:
        return _invalid(frame_index, "EMPTY_ROI"), stability_state
    gray = _to_gray(local)
    mask = _dark_foreground_mask(gray, config)
    target = _largest_mesh_region(mask, config)
    if target is None:
        return _invalid(frame_index, "NO_TARGET"), stability_state

    candidate = _mesh_envelope_candidate(target, roi, config)
    candidates = [candidate] if candidate is not None else []
    return _finish_candidate_detection(
        frame_index=frame_index,
        roi=roi,
        config=config,
        detector_name=detector_name,
        stability_state=stability_state,
        target=target,
        candidates=candidates,
        measurement_mode="archived_mesh_envelope_rows",
        extra_debug={
            "mesh_target_mask_pixels": int(np.count_nonzero(target)),
        },
    )


def _detect_wire_bundle_max_width(
    frame: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
    *,
    frame_index: int,
    detector_name: str,
    stability_state: CandidateSelectionState,
) -> tuple[DetectionResult, CandidateSelectionState]:
    if frame.size == 0:
        return _invalid(frame_index, "EMPTY_FRAME"), stability_state

    local = _warp_rotated_roi(frame, roi)
    if local.size == 0:
        return _invalid(frame_index, "EMPTY_ROI"), stability_state
    gray = _to_gray(local)
    target = _wire_bundle_mask(gray, config)
    if np.count_nonzero(target) < max(1, int(config.min_window_pixels)):
        return _invalid(frame_index, "NO_TARGET"), stability_state

    candidate = _wire_projection_candidate(target, roi, config)
    candidates = [candidate] if candidate is not None else []
    return _finish_candidate_detection(
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
        },
    )


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

    debug_artifacts: dict[str, Any] = {
        "selected_detector": detector_name,
        "contour_measurement_mode": measurement_mode,
        "contour_theta_deg": float(roi.angle_deg),
        "contour_length_px": float(selected.width_px),
        "contour_projection_box": selected.metadata.get("contour_projection_box", []),
        "contour_direction_arrow": selected.metadata.get("contour_direction_arrow", []),
        "target_mask_pixels": int(np.count_nonzero(target)),
        "candidate_count": len(candidates),
        "diagnostic_images": _diagnostic_images(
            target,
            config,
            overlay_box=_diagnostic_overlay_box(selected.metadata, target.shape),
        ),
        "selection_state": {
            "pending_candidate_id": selection.state.pending_candidate_id,
            "pending_count": selection.state.pending_count,
        },
    }
    debug_artifacts.update(selected.metadata.get("debug_artifacts", {}))
    if extra_debug:
        debug_artifacts.update(extra_debug)

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


def _mesh_envelope_rows(mask: np.ndarray, config: DetectorConfig) -> list[dict[str, float]]:
    ys, xs = np.nonzero(mask)
    min_pixels = max(1, int(config.min_window_pixels))
    if len(xs) < min_pixels:
        return []

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
        rows.append(
            {
                "v": float(center_v),
                "left": left,
                "right": right,
                "width": right - left,
                "pixel_count": float(pixel_count),
            }
        )

    if not rows:
        return []

    max_width = max(row["width"] for row in rows)
    max_count = max(row["pixel_count"] for row in rows)
    return [
        row
        for row in rows
        if row["width"] >= config.mesh_row_width_keep_ratio * max_width
        and row["pixel_count"] >= config.mesh_row_count_keep_ratio * max_count
    ]


def _mesh_envelope_candidate(
    mask: np.ndarray,
    roi: RotatedROI,
    config: DetectorConfig,
) -> DetectionCandidate | None:
    rows = _mesh_envelope_rows(mask, config)
    if not rows:
        return None

    selected_row = max(rows, key=lambda row: (row["width"], row["pixel_count"]))
    left = float(selected_row["left"])
    right = float(selected_row["right"])
    length = float(selected_row["width"])
    if length <= 0:
        return None

    center_v = float(selected_row["v"])
    min_v = min(row["v"] for row in rows)
    max_v = max(row["v"] for row in rows)
    global_left_row = min(rows, key=lambda row: row["left"])
    global_right_row = max(rows, key=lambda row: row["right"])
    global_left = float(global_left_row["left"])
    global_right = float(global_right_row["right"])
    a = roi_local_to_measurement_point(roi, left, center_v)
    b = roi_local_to_measurement_point(roi, right, center_v)
    box = [
        roi_local_to_measurement_point(roi, left, min_v),
        roi_local_to_measurement_point(roi, right, min_v),
        roi_local_to_measurement_point(roi, right, max_v),
        roi_local_to_measurement_point(roi, left, max_v),
    ]
    confidence = min(1.0, 0.25 + length / max(1.0, roi.width) * 0.65 + len(rows) / max(1.0, mask.shape[0]))
    return DetectionCandidate(
        candidate_id="archived-mesh-envelope-rows",
        axis_position_px=float(center_v),
        width_px=float(math.dist((a.x, a.y), (b.x, b.y))),
        a=a,
        b=b,
        confidence=confidence,
        metadata={
            "debug_artifacts": {
                "mesh_envelope_row_count": len(rows),
                "mesh_left_px": float(a.x),
                "mesh_right_px": float(b.x),
                "mesh_left_local_px": float(left),
                "mesh_right_local_px": float(right),
                "mesh_best_row_v_px": center_v,
                "mesh_selected_row_width_px": length,
                "mesh_global_left_local_px": global_left,
                "mesh_global_left_row_v_px": float(global_left_row["v"]),
                "mesh_global_right_local_px": global_right,
                "mesh_global_right_row_v_px": float(global_right_row["v"]),
                "mesh_global_span_px": global_right - global_left,
            },
            "local_min_along_px": float(left),
            "local_max_along_px": float(right),
            "local_min_perpendicular_px": float(min_v),
            "local_max_perpendicular_px": float(max_v),
            "theta_deg": float(roi.angle_deg),
            "contour_projection_box": [point.model_dump(mode="json") for point in box],
            "contour_direction_arrow": [point.model_dump(mode="json") for point in [a, b]],
        },
    )


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


def _diagnostic_images(
    target: np.ndarray,
    config: DetectorConfig,
    *,
    overlay_box: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    mask = np.asarray(target, dtype=bool)
    contour = _outer_envelope_contour(mask, config)
    height, width = mask.shape
    images = {
        "mask": {
            "label": "Detected mask",
            "coordinates": "roi_local_pixel",
            "width": int(width),
            "height": int(height),
            "data_url": _binary_mask_png_data_url(mask, overlay_box=overlay_box),
        },
        "contour": {
            "label": "Envelope contour",
            "coordinates": "roi_local_pixel",
            "width": int(width),
            "height": int(height),
            "data_url": _binary_mask_png_data_url(contour, overlay_box=overlay_box),
        },
    }
    if overlay_box is not None:
        images["mask"]["overlay_box"] = dict(overlay_box)
        images["contour"]["overlay_box"] = dict(overlay_box)
    return images


def _diagnostic_overlay_box(metadata: dict[str, Any], shape: tuple[int, ...]) -> dict[str, Any] | None:
    if len(shape) < 2:
        return None
    height, width = int(shape[0]), int(shape[1])
    if height <= 0 or width <= 0:
        return None

    required_keys = (
        "local_min_along_px",
        "local_max_along_px",
        "local_min_perpendicular_px",
        "local_max_perpendicular_px",
    )
    try:
        min_u, max_u, min_v, max_v = (float(metadata[key]) for key in required_keys)
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(value) for value in (min_u, max_u, min_v, max_v)):
        return None

    left = _clamp_int(math.floor(min(min_u, max_u)), 0, width - 1)
    right = _clamp_int(math.ceil(max(min_u, max_u)), 0, width - 1)
    top = _clamp_int(math.floor(min(min_v, max_v)), 0, height - 1)
    bottom = _clamp_int(math.ceil(max(min_v, max_v)), 0, height - 1)
    if right < left or bottom < top:
        return None
    return {
        "source": "selected_candidate_local_projection_bounds",
        "coordinates": "roi_local_pixel",
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "stroke": "#ff4040",
        "stroke_width_px": 5,
    }


def _clamp_int(value: float, lower: int, upper: int) -> int:
    return int(min(max(value, lower), upper))


def _outer_envelope_contour(mask: np.ndarray, config: DetectorConfig) -> np.ndarray:
    if mask.size == 0 or not np.any(mask):
        return np.zeros_like(mask, dtype=bool)
    closed = ndimage.binary_closing(mask, structure=_kernel(config.contour_close_kernel_px))
    filled = ndimage.binary_fill_holes(closed)
    main = _main_component(filled, min_area=1)
    envelope = np.asarray(main if main is not None else filled, dtype=bool)
    eroded = ndimage.binary_erosion(envelope, structure=np.ones((3, 3), dtype=bool), border_value=0)
    return envelope & ~eroded


def _binary_mask_png_data_url(mask: np.ndarray, *, overlay_box: dict[str, Any] | None = None) -> str:
    image_array = np.where(np.asarray(mask, dtype=bool), 255, 0).astype(np.uint8)
    rgb_array = np.repeat(np.ascontiguousarray(image_array)[:, :, None], 3, axis=2)
    image = Image.fromarray(rgb_array, mode="RGB")
    if overlay_box is not None:
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            [
                (int(overlay_box["left"]), int(overlay_box["top"])),
                (int(overlay_box["right"]), int(overlay_box["bottom"])),
            ],
            outline=(255, 64, 64),
            width=max(1, int(overlay_box.get("stroke_width_px", 5))),
        )
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
