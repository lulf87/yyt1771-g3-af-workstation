from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_MESH_DIR = Path("/Users/lulingfeng/Documents/工作/开发/归档/网格类")

sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))
sys.path.insert(0, str(ARCHIVE_MESH_DIR))

from mesh_width_measure import extract_outer_contour, measure_mesh_width  # noqa: E402
from yyt1771_g3.core.enums import DetectorType, ObjectClass  # noqa: E402
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI  # noqa: E402
from yyt1771_g3.services.live_offline_run_service import _attach_temperature, _frame_meta, _int_or_none  # noqa: E402
from yyt1771_g3.services.offline_dataset import load_dataset_registry  # noqa: E402
from yyt1771_g3.temperature.sync import sync_temperature_for_frame  # noqa: E402
from yyt1771_g3.vision.detectors import _to_gray, _warp_rotated_roi, detect_frame_with_state  # noqa: E402
from yyt1771_g3.vision.stability import CandidateSelectionState  # noqa: E402


DATASET_ID = "golden_a_20260522_dev_lab"
START_FRAME = 560
END_FRAME = 5807
SPARSE_STEP = 25
DENSE_RANGES = (
    (560, 760),
    (3400, 3600),
    (3760, 3820),
)
KEY_FRAMES = (560, 600, 650, 700, 760, 1000, 1500, 2500, 3400, 3538, 3554, 3600, 3800, 3804, 5807)

ROI_CASES: list[dict[str, Any]] = [
    {
        "name": "screenshot_angle_minus_12_50",
        "note": "Same ROI as P-0031 fig2 with angle adjusted to the current Run screenshot label theta=-12.5 deg.",
        "roi": {
            "center_x": 1206.8,
            "center_y": 693.4,
            "width": 1196.78,
            "height": 925.47,
            "angle_deg": -12.5,
        },
    },
]


def _nan() -> float:
    return float("nan")


def _safe_float(value: Any) -> float:
    if value is None:
        return _nan()
    try:
        return float(value)
    except (TypeError, ValueError):
        return _nan()


def _contour_bbox_width(binary: np.ndarray) -> tuple[float, float, int]:
    contour, filled = extract_outer_contour(binary, thickness=2, fill=True, close_kernel=21, smooth_window=7)
    pts = contour.reshape(-1, 2)
    return float(pts[:, 0].max() - pts[:, 0].min()), float(pts[:, 1].max() - pts[:, 1].min()), int(np.count_nonzero(filled))


def _frame_indices() -> list[int]:
    frames: set[int] = set(range(START_FRAME, END_FRAME + 1, SPARSE_STEP))
    for start, end in DENSE_RANGES:
        frames.update(range(start, end + 1))
    frames.update(KEY_FRAMES)
    return sorted(frame for frame in frames if 1 <= frame <= END_FRAME)


def _running_median(values: list[float], window: int) -> list[float]:
    if window <= 1:
        return list(values)
    radius = window // 2
    out: list[float] = []
    arr = np.array(values, dtype=np.float64)
    for idx in range(len(arr)):
        lo = max(0, idx - radius)
        hi = min(len(arr), idx + radius + 1)
        out.append(float(np.nanmedian(arr[lo:hi])))
    return out


def _finite_stats(values: list[float]) -> dict[str, float | int | None]:
    arr = np.array(values, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return {"count": 0, "min": None, "max": None, "range": None, "median": None, "max_abs_adjacent_jump": None}
    diffs = np.diff(arr)
    return {
        "count": int(arr.size),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "range": float(np.max(arr) - np.min(arr)),
        "median": float(np.median(arr)),
        "max_abs_adjacent_jump": float(np.max(np.abs(diffs))) if diffs.size else 0.0,
    }


def _band_stats(rows: list[dict[str, Any]], low: float, high: float) -> dict[str, dict[str, float | int | None]]:
    band = [r for r in rows if r["temperature_celsius"] is not None and low <= float(r["temperature_celsius"]) <= high]
    return {
        "g3_distance_px": _finite_stats([_safe_float(r["g3_distance_px"]) for r in band]),
        "archive_width_px": _finite_stats([_safe_float(r["archive_width_px"]) for r in band]),
        "archive_contour_bbox_width_px": _finite_stats([_safe_float(r["archive_contour_bbox_width_px"]) for r in band]),
        "point_count": {"count": len(band), "min": None, "max": None, "range": None, "median": None, "max_abs_adjacent_jump": None},
    }


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "frame_index",
        "temperature_celsius",
        "temperature_sync_status",
        "g3_status",
        "g3_distance_px",
        "g3_mesh_global_span_px",
        "archive_width_px",
        "archive_max_row_width_px",
        "archive_contour_bbox_width_px",
        "archive_contour_bbox_height_px",
        "archive_filled_pixels",
        "archive_row_count",
        "archive_target_pixels",
        "archive_error",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def _write_plot(path: Path, title: str, rows: list[dict[str, Any]]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    valid = [r for r in rows if r["temperature_celsius"] is not None]
    temp = np.array([float(r["temperature_celsius"]) for r in valid], dtype=np.float64)
    g3 = np.array([_safe_float(r["g3_distance_px"]) for r in valid], dtype=np.float64)
    archive = np.array([_safe_float(r["archive_width_px"]) for r in valid], dtype=np.float64)
    archive_bbox = np.array([_safe_float(r["archive_contour_bbox_width_px"]) for r in valid], dtype=np.float64)

    fig, axes = plt.subplots(2, 1, figsize=(12, 9), constrained_layout=True)
    axes[0].plot(temp, g3, label="G3 selected-window distance", color="#147d76", linewidth=1.2)
    axes[0].plot(temp, archive, label="Archive mesh width", color="#b45309", linewidth=1.1, alpha=0.9)
    axes[0].plot(temp, archive_bbox, label="Archive filled contour bbox width", color="#6d28d9", linewidth=1.0, alpha=0.75)
    axes[0].set_title(title)
    axes[0].set_xlabel("Temperature (deg C)")
    axes[0].set_ylabel("Distance / width (px)")
    axes[0].grid(True, alpha=0.25)
    axes[0].legend()

    g3_med = np.array(_running_median(g3.tolist(), 31), dtype=np.float64)
    arch_med = np.array(_running_median(archive.tolist(), 31), dtype=np.float64)
    axes[1].plot(temp, g3 - g3_med, label="G3 raw - median(31)", color="#147d76", linewidth=1.0)
    axes[1].plot(temp, archive - arch_med, label="Archive raw - median(31)", color="#b45309", linewidth=1.0, alpha=0.9)
    axes[1].axhline(0, color="#334155", linewidth=0.8)
    axes[1].set_xlabel("Temperature (deg C)")
    axes[1].set_ylabel("Local residual (px)")
    axes[1].grid(True, alpha=0.25)
    axes[1].legend()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def run_case(case: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    registry = load_dataset_registry()
    manifest = registry.load_manifest(DATASET_ID)
    temperature_rows = registry.load_temperature_csv(DATASET_ID)
    roi = RotatedROI(**case["roi"])
    measurement = MeasurementDefinition(
        measurement_id=f"audit-archive-curve-{case['name']}",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        roi=roi,
        detector_config=DetectorConfig(),
    )
    state = CandidateSelectionState()
    rows: list[dict[str, Any]] = []

    frame_indices = _frame_indices()
    key_frame_set = set(KEY_FRAMES)
    for processed_index, frame_index in enumerate(frame_indices, start=1):
        loaded = registry.load_frame(DATASET_ID, frame_index)
        frame_meta = _frame_meta(manifest, frame_index)
        frame_timestamp_ms = _int_or_none(frame_meta.get("timestamp_ms"))
        synced = sync_temperature_for_frame(frame_index, frame_timestamp_ms, temperature_rows)

        detection, state = detect_frame_with_state(
            loaded.array,
            measurement,
            frame_index=frame_index,
            stability_state=state,
        )
        detection = _attach_temperature(detection, frame_timestamp_ms, synced)

        local = _warp_rotated_roi(loaded.array, roi)
        gray = _to_gray(local)
        h, w = gray.shape
        archive_error = ""
        archive_width = archive_max_row_width = archive_bbox_width = archive_bbox_height = _nan()
        archive_filled_pixels = archive_row_count = archive_target_pixels = 0
        try:
            _, _, archive_width, archive_obj, archive_rows = measure_mesh_width(gray, roi=(0, 0, w, h))
            archive_widths = [float(row.width) for row in archive_rows]
            archive_max_row_width = max(archive_widths) if archive_widths else _nan()
            if frame_index in key_frame_set:
                archive_bbox_width, archive_bbox_height, archive_filled_pixels = _contour_bbox_width(archive_obj)
            archive_row_count = len(archive_rows)
            archive_target_pixels = int(np.count_nonzero(archive_obj))
        except Exception as exc:  # noqa: BLE001 - audit should record failures per frame.
            archive_error = f"{type(exc).__name__}: {exc}"

        rows.append(
            {
                "frame_index": frame_index,
                "temperature_celsius": detection.temperature_celsius,
                "temperature_sync_status": detection.temperature_sync_status.value,
                "g3_status": detection.detection_status.value,
                "g3_distance_px": detection.distance_px,
                "g3_mesh_global_span_px": detection.debug_artifacts.get("mesh_global_span_px"),
                "archive_width_px": archive_width,
                "archive_max_row_width_px": archive_max_row_width,
                "archive_contour_bbox_width_px": archive_bbox_width,
                "archive_contour_bbox_height_px": archive_bbox_height,
                "archive_filled_pixels": archive_filled_pixels,
                "archive_row_count": archive_row_count,
                "archive_target_pixels": archive_target_pixels,
                "archive_error": archive_error,
            }
        )
        if processed_index % 100 == 0 or processed_index == len(frame_indices):
            print(
                f"{case['name']}: processed {processed_index}/{len(frame_indices)} sampled frames "
                f"(frame {frame_index})",
                flush=True,
            )

    case_dir = out_dir / case["name"]
    _write_csv(case_dir / "curve_compare.csv", rows)
    _write_plot(case_dir / "curve_compare.png", case["name"], rows)
    summary = {
        "name": case["name"],
        "note": case["note"],
        "dataset_id": DATASET_ID,
        "frame_range": [START_FRAME, END_FRAME],
        "sampling": {
            "sparse_step": SPARSE_STEP,
            "dense_ranges": DENSE_RANGES,
            "sampled_frame_count": len(frame_indices),
        },
        "roi": case["roi"],
        "all_frames": {
            "g3_distance_px": _finite_stats([_safe_float(r["g3_distance_px"]) for r in rows]),
            "archive_width_px": _finite_stats([_safe_float(r["archive_width_px"]) for r in rows]),
            "archive_contour_bbox_width_px": _finite_stats([_safe_float(r["archive_contour_bbox_width_px"]) for r in rows]),
        },
        "temperature_bands": {
            "2_to_3_c": _band_stats(rows, 2.0, 3.0),
            "9_to_10_c": _band_stats(rows, 9.0, 10.0),
        },
        "key_frames": {
            str(frame): next((r for r in rows if r["frame_index"] == frame), None)
            for frame in (700, 1000, 1500, 2500, 3538, 3554, 3800, 3804, 5807)
        },
        "artifacts": {
            "csv": str(case_dir / "curve_compare.csv"),
            "plot": str(case_dir / "curve_compare.png"),
        },
    }
    (case_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    out_dir = PROJECT_ROOT / "output" / "audits" / "p0032_archive_mesh_curve_compare"
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries = [run_case(case, out_dir) for case in ROI_CASES]
    (out_dir / "summary.json").write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summaries, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
