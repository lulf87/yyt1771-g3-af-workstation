#!/usr/bin/env python3
"""Run full-frame detector stability audits for the G3 golden datasets."""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yyt1771_g3.core.enums import DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI
from yyt1771_g3.services.detector_audit import audit_run_manifest
from yyt1771_g3.services.live_offline_run_service import iter_live_offline_run_events, read_run
from yyt1771_g3.services.offline_dataset import load_dataset_registry
from yyt1771_g3.storage.run_store import RunStore


@dataclass(frozen=True)
class AuditPreset:
    dataset_id: str
    measurement_id: str
    object_class: ObjectClass
    detector: DetectorType
    roi: RotatedROI
    adjacent_jump_warn_px: float
    note: str


PRESETS: dict[str, AuditPreset] = {
    "a_figure_roi": AuditPreset(
        dataset_id="golden_a_20260522_dev_lab",
        measurement_id="audit-a-figure-roi-speck-3804",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        roi=RotatedROI(
            center_x=1118.07,
            center_y=465.16,
            width=1269.76,
            height=381.92,
            angle_deg=-21.49,
        ),
        adjacent_jump_warn_px=18.0,
        note="User figure ROI covering the A-class 3804 speck regression area.",
    ),
    "c_figure_roi": AuditPreset(
        dataset_id="golden_c_20260529_dev_lab",
        measurement_id="audit-c-figure-roi-2614-2615",
        object_class=ObjectClass.C_BUNDLE_ENVELOPE,
        detector=DetectorType.BUNDLE_ENVELOPE,
        roi=RotatedROI(
            center_x=1062.83,
            center_y=650.7,
            width=763.35,
            height=1020.38,
            angle_deg=-7.31,
        ),
        adjacent_jump_warn_px=18.0,
        note="User figure ROI covering the C-class 2614/2615 stability regression area.",
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS),
        action="append",
        help="Preset to audit. Defaults to both A and C figure ROIs.",
    )
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--max-frames", type=int, default=None)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--progress-every", type=int, default=250)
    args = parser.parse_args()

    selected = args.preset or ["a_figure_roi", "c_figure_roi"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_dir = args.output_dir or Path("output") / "audits" / f"detector-stability-{stamp}"
    output_dir.mkdir(parents=True, exist_ok=True)

    registry = load_dataset_registry()
    run_store = RunStore()
    summaries: list[dict[str, Any]] = []

    for preset_name in selected:
        preset = PRESETS[preset_name]
        print(f"[{preset_name}] dataset={preset.dataset_id} start={args.start_frame} max={args.max_frames or 'remaining'}")
        measurement = _measurement_for_preset(preset)
        run_id = _consume_streamed_run(
            registry=registry,
            run_store=run_store,
            preset=preset,
            measurement=measurement,
            start_frame=args.start_frame,
            max_frames=args.max_frames,
            progress_every=args.progress_every,
        )
        result = read_run(run_store, run_id)
        summary = audit_run_manifest(
            result.manifest,
            adjacent_jump_warn_px=preset.adjacent_jump_warn_px,
        )
        summary.update(
            {
                "preset": preset_name,
                "note": preset.note,
                "run_manifest_path": str(run_store.run_dir(run_id) / "run_manifest.json"),
                "analysis_result_path": str(run_store.run_dir(run_id) / "analysis_result.json"),
            }
        )
        summaries.append(summary)
        _write_summary(output_dir, preset_name, summary)
        print(
            f"[{preset_name}] run={run_id} frames={summary['frame_count']} "
            f"errors={summary['error_count']} warnings={summary['warning_count']} "
            f"distance={summary['distance_min_px']}..{summary['distance_max_px']}"
        )

    combined_path = output_dir / "combined_summary.json"
    combined_path.write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {combined_path}")
    return 0 if all(summary["error_count"] == 0 for summary in summaries) else 1


def _measurement_for_preset(preset: AuditPreset) -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id=preset.measurement_id,
        object_class=preset.object_class,
        detector=preset.detector,
        width_mode=WidthMode.MAX_WIDTH,
        roi=preset.roi,
        detector_config=DetectorConfig(
            max_frames_per_run=1_000_000,
            live_offline_fps=8.0,
            target_temperature_celsius=None,
        ),
    )


def _consume_streamed_run(
    *,
    registry,
    run_store: RunStore,
    preset: AuditPreset,
    measurement: MeasurementDefinition,
    start_frame: int,
    max_frames: int | None,
    progress_every: int,
) -> str:
    run_id: str | None = None
    for event in iter_live_offline_run_events(
        registry,
        run_store,
        dataset_id=preset.dataset_id,
        measurement=measurement,
        start_frame=start_frame,
        max_frames=max_frames,
        target_fps=8.0,
    ):
        if event["event"] == "frame":
            run_id = str(event["run_id"])
            processed = int(event["processed_frames"])
            if progress_every > 0 and (processed == 1 or processed % progress_every == 0):
                distance = event["detection_result"].get("distance_px")
                print(
                    f"  frame={event['frame_index']} processed={processed}/{event['total_frames']} "
                    f"distance={distance}"
                )
        elif event["event"] == "complete":
            run_id = str(event["run_manifest"]["run_id"])
        elif event["event"] == "error":
            raise RuntimeError(str(event.get("message", "stream error")))
    if run_id is None:
        raise RuntimeError(f"no run was produced for preset {preset.measurement_id}")
    return run_id


def _write_summary(output_dir: Path, preset_name: str, summary: dict[str, Any]) -> None:
    json_path = output_dir / f"{preset_name}_summary.json"
    csv_path = output_dir / f"{preset_name}_flagged_frames.csv"
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "frame_index",
                "severity",
                "flags",
                "detection_status",
                "distance_px",
                "temperature_celsius",
                "rejected_reason",
            ],
        )
        writer.writeheader()
        for item in summary["flagged_frames"]:
            writer.writerow(
                {
                    "frame_index": item["frame_index"],
                    "severity": item["severity"],
                    "flags": ";".join(item["flags"]),
                    "detection_status": item["detection_status"],
                    "distance_px": item["distance_px"],
                    "temperature_celsius": item["temperature_celsius"],
                    "rejected_reason": item["rejected_reason"],
                }
            )


if __name__ == "__main__":
    raise SystemExit(main())
