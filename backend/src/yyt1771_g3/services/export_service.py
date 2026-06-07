from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from yyt1771_g3.core.coordinates import roi_local_to_measurement_point
from yyt1771_g3.core.enums import DetectionStatus
from yyt1771_g3.core.models import AnalysisResult, ExportArtifact, RunManifest
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.storage.run_store import RunStore


def export_run(run_store: RunStore, run_id: str) -> list[ExportArtifact]:
    manifest = run_store.read_run_manifest(run_id)
    try:
        analysis = run_store.read_analysis_result(run_id)
    except FileNotFoundError:
        analysis = build_analysis_result(manifest)
    export_dir = run_store.run_dir(run_id) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)

    artifacts = [
        _write_csv(export_dir, manifest),
        _write_json(export_dir, manifest, analysis),
        _write_curve_png(export_dir, analysis),
        _write_overlay_png(export_dir, manifest),
        _write_parameters_json(export_dir, manifest),
    ]
    manifest = manifest.model_copy(update={"export_artifacts": artifacts})
    analysis = analysis.model_copy(update={"export_artifacts": artifacts})
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return artifacts


def _write_csv(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "frame_results.csv"
    fields = [
        "frame_index",
        "detection_status",
        "distance_px",
        "temperature_celsius",
        "temperature_sync_status",
        "frame_timestamp_ms",
        "temperature_timestamp_ms",
        "temperature_delta_ms",
        "rejected_reason",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in manifest.detection_results:
            writer.writerow(
                {
                    "frame_index": result.frame_index,
                    "detection_status": result.detection_status.value,
                    "distance_px": result.distance_px,
                    "temperature_celsius": result.temperature_celsius,
                    "temperature_sync_status": result.temperature_sync_status.value,
                    "frame_timestamp_ms": result.frame_timestamp_ms,
                    "temperature_timestamp_ms": result.temperature_timestamp_ms,
                    "temperature_delta_ms": result.temperature_delta_ms,
                    "rejected_reason": result.rejected_reason,
                }
            )
    return _artifact("csv", path, manifest.run_id)


def _write_json(export_dir: Path, manifest: RunManifest, analysis: AnalysisResult) -> ExportArtifact:
    path = export_dir / "run_export.json"
    path.write_text(
        json.dumps(
            {
                "run_manifest": manifest.model_dump(mode="json"),
                "analysis_result": analysis.model_dump(mode="json"),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return _artifact("json", path, manifest.run_id)


def _write_curve_png(export_dir: Path, analysis: AnalysisResult) -> ExportArtifact:
    path = export_dir / "temperature_distance.png"
    fig, ax = plt.subplots(figsize=(6, 4), dpi=140)
    if analysis.temperature_distance:
        ax.plot(
            [point.x for point in analysis.temperature_distance],
            [point.y for point in analysis.temperature_distance],
            color="#2563eb",
            linewidth=1.8,
        )
    ax.set_xlabel("temperature_celsius")
    ax.set_ylabel("distance_px")
    ax.grid(True, alpha=0.25)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return _artifact("png_curve", path, analysis.run_id)


def _write_overlay_png(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "roi_ab_overlay.png"
    roi = manifest.measurement_definition.roi
    valid = next(
        (
            result
            for result in manifest.detection_results
            if result.detection_status == DetectionStatus.VALID and result.ab_points is not None
        ),
        None,
    )
    width = 800
    height = 480
    image = Image.new("RGB", (width, height), "#f7f9fb")
    draw = ImageDraw.Draw(image)
    source_w = max(1.0, roi.center_x + roi.width)
    source_h = max(1.0, roi.center_y + roi.height)
    scale = min((width - 40) / source_w, (height - 40) / source_h)

    def p(x: float, y: float) -> tuple[float, float]:
        return (20 + x * scale, 20 + y * scale)

    corners = [
        roi_local_to_measurement_point(roi, 0.0, 0.0),
        roi_local_to_measurement_point(roi, roi.width, 0.0),
        roi_local_to_measurement_point(roi, roi.width, roi.height),
        roi_local_to_measurement_point(roi, 0.0, roi.height),
    ]
    draw.polygon([p(point.x, point.y) for point in corners], outline="#0f766e", fill="#d8f3ee")
    if valid is not None and valid.ab_points is not None:
        a = valid.ab_points.a
        b = valid.ab_points.b
        draw.line([p(a.x, a.y), p(b.x, b.y)], fill="#d97706", width=4)
        draw.ellipse(_circle_box(*p(a.x, a.y), radius=6), fill="#fef3c7", outline="#d97706", width=2)
        draw.ellipse(_circle_box(*p(b.x, b.y), radius=6), fill="#fef3c7", outline="#d97706", width=2)
    image.save(path)
    return _artifact("overlay_png", path, manifest.run_id)


def _write_parameters_json(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "parameters.json"
    path.write_text(
        manifest.measurement_definition.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return _artifact("parameters_json", path, manifest.run_id)


def _artifact(artifact_type: str, path: Path, run_id: str) -> ExportArtifact:
    return ExportArtifact(
        artifact_id=path.stem,
        artifact_type=artifact_type,
        path=str(path),
        source_run_id=run_id,
    )


def _circle_box(x: float, y: float, *, radius: float) -> tuple[float, float, float, float]:
    return (x - radius, y - radius, x + radius, y + radius)
