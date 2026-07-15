from __future__ import annotations

from typing import Any

from yyt1771_g3.core.enums import DetectionStatus, ObjectClass
from yyt1771_g3.core.models import DetectionResult, RunManifest


def audit_run_manifest(
    manifest: RunManifest,
    *,
    adjacent_jump_warn_px: float = 15.0,
    same_window_tolerance_px: float = 1.5,
) -> dict[str, Any]:
    flagged_frames: list[dict[str, Any]] = []
    previous_valid_distance: float | None = None
    distances: list[float] = []
    invalid_count = 0
    error_count = 0
    warning_count = 0

    for detection in manifest.detection_results:
        flags: list[str] = []
        severities: list[str] = []

        if detection.detection_status != DetectionStatus.VALID:
            flags.append("INVALID_DETECTION")
            severities.append("error")
            invalid_count += 1
        elif detection.distance_px is None:
            flags.append("VALID_WITHOUT_DISTANCE")
            severities.append("error")
        else:
            distances.append(float(detection.distance_px))
            if previous_valid_distance is not None:
                jump_px = abs(float(detection.distance_px) - previous_valid_distance)
                if jump_px > adjacent_jump_warn_px:
                    flags.append("LARGE_ADJACENT_DISTANCE_JUMP")
                    severities.append("warning")
            previous_valid_distance = float(detection.distance_px)

        flags.extend(
            _formal_rule_flags(
                manifest.measurement_definition.object_class,
                detection,
                same_window_tolerance_px=same_window_tolerance_px,
            )
        )
        severities.extend(["error"] * (len(flags) - len(severities)))

        if flags:
            frame_severity = "error" if "error" in severities else "warning"
            if "error" in severities:
                error_count += 1
            if "warning" in severities:
                warning_count += 1
            flagged_frames.append(_flagged_frame(detection, flags, frame_severity))

    return {
        "run_id": manifest.run_id,
        "dataset_id": manifest.dataset_id,
        "measurement_id": manifest.measurement_definition.measurement_id,
        "object_class": manifest.measurement_definition.object_class.value,
        "detector": manifest.measurement_definition.detector.value,
        "frame_count": len(manifest.detection_results),
        "valid_count": len(manifest.detection_results) - invalid_count,
        "invalid_count": invalid_count,
        "error_count": error_count,
        "warning_count": warning_count,
        "distance_min_px": min(distances) if distances else None,
        "distance_max_px": max(distances) if distances else None,
        "distance_delta_px": (max(distances) - min(distances)) if distances else None,
        "adjacent_jump_warn_px": adjacent_jump_warn_px,
        "flagged_frames": flagged_frames,
    }


def _formal_rule_flags(
    object_class: ObjectClass,
    detection: DetectionResult,
    *,
    same_window_tolerance_px: float,
) -> list[str]:
    if detection.detection_status != DetectionStatus.VALID:
        return []

    debug = detection.debug_artifacts
    if object_class == ObjectClass.WHOLE_ENVELOPE:
        return _whole_envelope_flags(
            detection,
            debug,
            same_window_tolerance_px=same_window_tolerance_px,
        )
    if object_class == ObjectClass.A_BALLOON_ENVELOPE:
        return _a_mesh_flags(detection, debug, same_window_tolerance_px=same_window_tolerance_px)
    if object_class == ObjectClass.C_BUNDLE_ENVELOPE:
        return _c_wire_flags(debug)
    return []


def _whole_envelope_flags(
    detection: DetectionResult,
    debug: dict[str, Any],
    *,
    same_window_tolerance_px: float,
) -> list[str]:
    flags: list[str] = []
    if debug.get("contour_measurement_mode") != "contrast_widest_span":
        flags.append("WHOLE_ENVELOPE_MODE_NOT_CONTRAST_WIDEST_SPAN")
    selected_width = _float_or_none(debug.get("selected_width_px"))
    if selected_width is None:
        flags.append("WHOLE_ENVELOPE_MISSING_SELECTED_WIDTH")
    elif detection.distance_px is None or abs(float(detection.distance_px) - selected_width) > same_window_tolerance_px:
        flags.append("WHOLE_ENVELOPE_SAME_SCANLINE_DISTANCE_MISMATCH")
    return flags


def _a_mesh_flags(
    detection: DetectionResult,
    debug: dict[str, Any],
    *,
    same_window_tolerance_px: float,
) -> list[str]:
    flags: list[str] = []
    if debug.get("contour_measurement_mode") != "archived_mesh_envelope_rows":
        flags.append("A_CONTOUR_MODE_NOT_ARCHIVED_MESH_ENVELOPE_ROWS")
    selected_row_width = _float_or_none(debug.get("mesh_selected_row_width_px"))
    distance = detection.distance_px
    if selected_row_width is None:
        flags.append("A_MISSING_SELECTED_ROW_WIDTH")
    elif distance is None or abs(float(distance) - selected_row_width) > same_window_tolerance_px:
        flags.append("A_SAME_WINDOW_DISTANCE_MISMATCH")
    return flags


def _c_wire_flags(debug: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    mode = debug.get("contour_measurement_mode")
    if mode == "contrast_widest_span":
        return flags
    if mode != "archived_wire_bundle_projection":
        flags.append("C_CONTOUR_MODE_NOT_ARCHIVED_WIRE_BUNDLE_PROJECTION")
    if debug.get("wire_projection_mode") != "stable_support_columns":
        flags.append("C_WIRE_PROJECTION_NOT_STABLE_SUPPORT_COLUMNS")
    return flags


def _flagged_frame(detection: DetectionResult, flags: list[str], severity: str) -> dict[str, Any]:
    return {
        "frame_index": detection.frame_index,
        "severity": severity,
        "flags": flags,
        "detection_status": detection.detection_status.value,
        "distance_px": detection.distance_px,
        "temperature_celsius": detection.temperature_celsius,
        "rejected_reason": detection.rejected_reason,
        "debug": _debug_excerpt(detection.debug_artifacts),
    }


def _debug_excerpt(debug: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "contour_measurement_mode",
        "contour_length_px",
        "mesh_selected_row_width_px",
        "mesh_best_row_v_px",
        "mesh_left_local_px",
        "mesh_right_local_px",
        "mesh_global_span_px",
        "wire_projection_mode",
        "wire_raw_length_px",
        "wire_global_quantile_length_px",
        "wire_support_group_min_along_px",
        "wire_support_group_max_along_px",
        "detection_mode",
        "contrast_threshold",
        "selected_scan_v",
        "selected_left_u",
        "selected_right_u",
        "selected_width_px",
    ]
    return {key: debug[key] for key in keys if key in debug}


def _float_or_none(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None
