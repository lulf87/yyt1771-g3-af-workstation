from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_MESH_DIR = Path("/Users/lulingfeng/Documents/工作/开发/归档/网格类")

sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))
sys.path.insert(0, str(ARCHIVE_MESH_DIR))

from mesh_width_measure import extract_outer_contour, measure_mesh_width  # noqa: E402
from yyt1771_g3.core.enums import DetectorType, ObjectClass  # noqa: E402
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI  # noqa: E402
from yyt1771_g3.services.offline_dataset import load_dataset_registry  # noqa: E402
from yyt1771_g3.vision.detectors import (  # noqa: E402
    _dark_foreground_mask,
    _largest_mesh_region,
    _mesh_envelope_rows,
    _to_gray,
    _warp_rotated_roi,
    detect_frame,
)


ROIS = [
    {
        "name": "fig1_angle_minus_4_05",
        "frame_index": 1,
        "roi": {
            "center_x": 1151.37,
            "center_y": 705.57,
            "width": 1269.76,
            "height": 798.56,
            "angle_deg": -4.05,
        },
    },
    {
        "name": "fig2_angle_minus_12_28",
        "frame_index": 1,
        "roi": {
            "center_x": 1206.8,
            "center_y": 693.4,
            "width": 1196.78,
            "height": 925.47,
            "angle_deg": -12.28,
        },
    },
    {
        "name": "fig3_angle_minus_11_28",
        "frame_index": 1,
        "roi": {
            "center_x": 1206.8,
            "center_y": 693.4,
            "width": 1196.78,
            "height": 925.47,
            "angle_deg": -11.28,
        },
    },
]


def _mask_u8(mask: np.ndarray) -> np.ndarray:
    return np.where(mask > 0, 255, 0).astype(np.uint8)


def _draw_rows(overlay: np.ndarray, rows: list[dict[str, float]], color: tuple[int, int, int]) -> None:
    for row in rows:
        y = int(round(row["v"]))
        left = int(round(row["left"]))
        right = int(round(row["right"]))
        cv2.circle(overlay, (left, y), 2, color, -1)
        cv2.circle(overlay, (right, y), 2, color, -1)


def _draw_box(overlay: np.ndarray, left: float, right: float, top: float, bottom: float, color: tuple[int, int, int]) -> None:
    pts = np.array(
        [
            [round(left), round(top)],
            [round(right), round(top)],
            [round(right), round(bottom)],
            [round(left), round(bottom)],
        ],
        dtype=np.int32,
    ).reshape(-1, 1, 2)
    cv2.polylines(overlay, [pts], isClosed=True, color=color, thickness=2)


def _write_overlay(
    out_path: Path,
    gray: np.ndarray,
    *,
    g3_target: np.ndarray,
    g3_rows: list[dict[str, float]],
    archive_obj: np.ndarray,
    archive_rows: tuple[object, ...],
    archive_contour_mask: np.ndarray,
) -> None:
    overlay = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    overlay[g3_target > 0] = (0, 130, 255)
    overlay[archive_obj > 0] = (
        0.55 * overlay[archive_obj > 0].astype(np.float32) + np.array([255, 0, 180], dtype=np.float32) * 0.45
    ).astype(np.uint8)
    overlay[archive_contour_mask > 0] = (0, 255, 255)

    if g3_rows:
        selected = max(g3_rows, key=lambda row: (row["width"], row["pixel_count"]))
        top = min(row["v"] for row in g3_rows)
        bottom = max(row["v"] for row in g3_rows)
        _draw_box(overlay, selected["left"], selected["right"], top, bottom, (0, 255, 255))
        cv2.line(
            overlay,
            (int(round(selected["left"])), int(round(selected["v"]))),
            (int(round(selected["right"])), int(round(selected["v"]))),
            (0, 128, 255),
            2,
        )
        _draw_rows(overlay, g3_rows, (0, 128, 255))

    if archive_rows:
        archive_left = min(float(row.left) for row in archive_rows)
        archive_right = max(float(row.right) for row in archive_rows)
        archive_top = min(float(row.y) for row in archive_rows)
        archive_bottom = max(float(row.y) for row in archive_rows)
        _draw_box(overlay, archive_left, archive_right, archive_top, archive_bottom, (255, 0, 255))
        for row in archive_rows:
            y = int(round(row.y))
            cv2.circle(overlay, (int(round(row.left)), y), 2, (255, 0, 255), -1)
            cv2.circle(overlay, (int(round(row.right)), y), 2, (255, 0, 255), -1)

    cv2.imwrite(str(out_path), overlay)


def _contour_stats(binary: np.ndarray) -> dict[str, float | int | None]:
    contour, contour_mask = extract_outer_contour(binary, thickness=2, fill=False, close_kernel=21, smooth_window=7)
    pts = contour.reshape(-1, 2)
    return {
        "point_count": int(len(pts)),
        "min_x": float(pts[:, 0].min()),
        "max_x": float(pts[:, 0].max()),
        "min_y": float(pts[:, 1].min()),
        "max_y": float(pts[:, 1].max()),
        "bbox_width": float(pts[:, 0].max() - pts[:, 0].min()),
        "bbox_height": float(pts[:, 1].max() - pts[:, 1].min()),
        "mask_pixels": int(np.count_nonzero(contour_mask)),
    }


def main() -> int:
    out_dir = PROJECT_ROOT / "output" / "audits" / "p0031_roi_angle_archive_compare"
    out_dir.mkdir(parents=True, exist_ok=True)

    registry = load_dataset_registry()
    frame = registry.load_frame("golden_a_20260522_dev_lab", 1).array
    config = DetectorConfig()
    results: list[dict[str, object]] = []

    for spec in ROIS:
        roi = RotatedROI(**spec["roi"])
        measurement = MeasurementDefinition(
            measurement_id=f"p0031-{spec['name']}",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            roi=roi,
            detector_config=config,
        )
        detection = detect_frame(frame, measurement, frame_index=int(spec["frame_index"]))
        local = _warp_rotated_roi(frame, roi)
        gray = _to_gray(local)
        g3_mask = _dark_foreground_mask(gray, config)
        g3_target = _largest_mesh_region(g3_mask, config)
        if g3_target is None:
            raise RuntimeError(f"G3 target missing for {spec['name']}")
        g3_rows_result = _mesh_envelope_rows(g3_target, config)
        g3_rows = g3_rows_result.measurement_rows

        h, w = gray.shape
        archive_left, archive_right, archive_width, archive_obj, archive_rows = measure_mesh_width(
            gray,
            roi=(0, 0, w, h),
        )
        archive_contour, archive_contour_mask = extract_outer_contour(
            archive_obj,
            thickness=2,
            fill=False,
            close_kernel=21,
            smooth_window=7,
        )
        _, archive_filled_mask = extract_outer_contour(
            archive_obj,
            fill=True,
            close_kernel=21,
            smooth_window=7,
        )

        stem = str(spec["name"])
        cv2.imwrite(str(out_dir / f"{stem}_local.png"), gray)
        cv2.imwrite(str(out_dir / f"{stem}_g3_target.png"), _mask_u8(g3_target))
        cv2.imwrite(str(out_dir / f"{stem}_archive_obj.png"), _mask_u8(archive_obj))
        cv2.imwrite(str(out_dir / f"{stem}_archive_contour.png"), archive_contour_mask)
        cv2.imwrite(str(out_dir / f"{stem}_archive_filled.png"), archive_filled_mask)
        _write_overlay(
            out_dir / f"{stem}_overlay.png",
            gray,
            g3_target=g3_target,
            g3_rows=g3_rows,
            archive_obj=archive_obj,
            archive_rows=archive_rows,
            archive_contour_mask=archive_contour_mask,
        )

        g3_debug = detection.debug_artifacts
        selected = detection.selected_candidate
        g3_selected_row_width = None
        g3_global_span = None
        if selected is not None:
            g3_selected_row_width = selected.metadata.get("debug_artifacts", {}).get("mesh_selected_row_width_px")
            g3_global_span = selected.metadata.get("debug_artifacts", {}).get("mesh_global_span_px")

        archive_rows_widths = [float(row.width) for row in archive_rows]
        results.append(
            {
                "name": stem,
                "frame_index": spec["frame_index"],
                "roi": spec["roi"],
                "g3": {
                    "status": str(detection.detection_status.value),
                    "distance_px": detection.distance_px,
                    "mode": g3_debug.get("contour_measurement_mode"),
                    "target_pixels": int(np.count_nonzero(g3_target)),
                    "row_count": len(g3_rows),
                    "selected_row_width_px": g3_selected_row_width,
                    "global_span_px": g3_global_span,
                    "mesh_left_local_px": g3_debug.get("mesh_left_local_px"),
                    "mesh_right_local_px": g3_debug.get("mesh_right_local_px"),
                    "mesh_best_row_v_px": g3_debug.get("mesh_best_row_v_px"),
                },
                "archive_mesh": {
                    "width_px": float(archive_width),
                    "left_px": float(archive_left),
                    "right_px": float(archive_right),
                    "target_pixels": int(np.count_nonzero(archive_obj)),
                    "row_count": len(archive_rows),
                    "max_row_width_px": max(archive_rows_widths) if archive_rows_widths else None,
                    "contour_stats": _contour_stats(archive_obj),
                    "filled_pixels": int(np.count_nonzero(archive_filled_mask)),
                },
                "images": {
                    "overlay": str(out_dir / f"{stem}_overlay.png"),
                    "local": str(out_dir / f"{stem}_local.png"),
                    "g3_target": str(out_dir / f"{stem}_g3_target.png"),
                    "archive_obj": str(out_dir / f"{stem}_archive_obj.png"),
                    "archive_contour": str(out_dir / f"{stem}_archive_contour.png"),
                    "archive_filled": str(out_dir / f"{stem}_archive_filled.png"),
                },
            }
        )

    (out_dir / "summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
