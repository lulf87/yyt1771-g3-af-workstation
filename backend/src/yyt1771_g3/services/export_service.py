from __future__ import annotations

import csv
import json
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

import matplotlib

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from yyt1771_g3.core.coordinates import roi_local_to_measurement_point
from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus
from yyt1771_g3.core.models import AnalysisResult, DetectionResult, ExportArtifact, RegionAnalysisResult, RunManifest
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.storage.run_store import RunStore


LEGACY_CSV_FIELDS = [
    "frame_index",
    "detection_status",
    "distance_px",
    "raw_distance_px",
    "stabilized_distance_px",
    "result_display_source",
    "curve_point_status",
    "exclusion_reason",
    "rejected_reason",
    "temperature_celsius",
    "temperature_sync_status",
    "temperature_delta_ms",
    "detector_mode",
    "contrast_threshold",
    "raw_detected_distance_px",
    "distance_px_after_filter",
    "distance_outlier_filtered",
    "distance_outlier_reason",
    "distance_outlier_baseline_px",
    "distance_outlier_deviation_px",
    "distance_outlier_max_jump_px",
    "distance_outlier_reference_count",
    "curve_exclusion_reason",
    "frame_timestamp_ms",
    "temperature_timestamp_ms",
]
REGION_CSV_FIELDS = ["region_id", "region_index", "region_label", "region_color", *LEGACY_CSV_FIELDS]


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
        _write_long_csv(export_dir, manifest),
        _write_wide_csv(export_dir, manifest),
        _write_json(export_dir, manifest, analysis),
        _write_analysis_by_region_json(export_dir, analysis),
        _write_curve_png(export_dir, analysis),
        _write_combined_curve_png(export_dir, analysis),
        _write_overlay_png(export_dir, manifest),
        _write_combined_overlay_png(export_dir, manifest),
        _write_parameters_json(export_dir, manifest, analysis),
    ]
    artifacts.extend(_write_region_csvs(export_dir, manifest))
    artifacts.extend(_write_region_curve_pngs(export_dir, analysis))
    manifest = manifest.model_copy(update={"export_artifacts": artifacts})
    analysis = analysis.model_copy(update={"export_artifacts": artifacts})
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return artifacts


def export_run_bundle(run_store: RunStore, run_id: str) -> Path:
    artifacts = export_run(run_store, run_id)
    export_dir = run_store.run_dir(run_id) / "exports"
    bundle_path = export_dir / f"yyt1771-g3-export-{_safe_filename_part(run_id)}.zip"
    with ZipFile(bundle_path, "w", compression=ZIP_DEFLATED) as archive:
        for artifact in artifacts:
            artifact_path = Path(artifact.path)
            if not artifact_path.is_file():
                raise FileNotFoundError(f"Export artifact missing: {artifact_path}")
            archive.write(artifact_path, arcname=str(artifact_path.relative_to(export_dir)))
    return bundle_path


def _write_csv(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "frame_results.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=LEGACY_CSV_FIELDS)
        writer.writeheader()
        for result in manifest.detection_results:
            writer.writerow(_result_row(result, manifest))
    return _artifact("csv", path, manifest.run_id)


def _write_long_csv(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "frame_results_long.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REGION_CSV_FIELDS)
        writer.writeheader()
        for result in _all_region_results(manifest):
            writer.writerow(_region_result_row(result, manifest))
    return _artifact("csv_long", path, manifest.run_id)


def _write_region_csvs(export_dir: Path, manifest: RunManifest) -> list[ExportArtifact]:
    region_dir = export_dir / "regions"
    region_dir.mkdir(parents=True, exist_ok=True)
    results = _all_region_results(manifest)
    artifacts: list[ExportArtifact] = []
    for region in manifest.measurement_definition.enabled_regions:
        path = region_dir / f"{_safe_filename_part(region.region_id)}_frame_results.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=REGION_CSV_FIELDS)
            writer.writeheader()
            for result in results:
                if result.region_id == region.region_id:
                    writer.writerow(_region_result_row(result, manifest))
        artifacts.append(_artifact("csv_region", path, manifest.run_id))
    return artifacts


def _write_wide_csv(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "frame_results_wide.csv"
    regions = manifest.measurement_definition.enabled_regions
    identity_fields = ["frame_index", "temperature_celsius", "temperature_sync_status"]
    region_fields = [
        field
        for region in regions
        for field in (
            f"{_safe_filename_part(region.region_id)}_distance_px",
            f"{_safe_filename_part(region.region_id)}_raw_distance_px",
            f"{_safe_filename_part(region.region_id)}_status",
            f"{_safe_filename_part(region.region_id)}_distance_outlier_filtered",
            f"{_safe_filename_part(region.region_id)}_exclusion_reason",
        )
    ]
    by_frame: dict[int, dict[str, DetectionResult]] = {}
    for result in _all_region_results(manifest):
        by_frame.setdefault(result.frame_index, {})[result.region_id] = result
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*identity_fields, *region_fields])
        writer.writeheader()
        for frame_index in sorted(by_frame):
            frame_results = by_frame[frame_index]
            first = next(iter(frame_results.values()))
            row: dict[str, object] = {
                "frame_index": frame_index,
                "temperature_celsius": first.temperature_celsius,
                "temperature_sync_status": first.temperature_sync_status.value,
            }
            for region in regions:
                prefix = _safe_filename_part(region.region_id)
                result = frame_results.get(region.region_id)
                row[f"{prefix}_distance_px"] = result.distance_px if result is not None else None
                row[f"{prefix}_raw_distance_px"] = result.raw_distance_px if result is not None else None
                row[f"{prefix}_status"] = result.detection_status.value if result is not None else ""
                row[f"{prefix}_distance_outlier_filtered"] = (
                    result.distance_outlier_filtered if result is not None else ""
                )
                row[f"{prefix}_exclusion_reason"] = result.curve_exclusion_reason if result is not None else ""
            writer.writerow(row)
    return _artifact("csv_wide", path, manifest.run_id)


def _result_row(result: DetectionResult, manifest: RunManifest) -> dict[str, object]:
    distance_after_filter = result.distance_px if result.curve_point_status == CurvePointStatus.VALID else None
    return {
        "frame_index": result.frame_index,
        "detection_status": result.detection_status.value,
        "distance_px": result.distance_px,
        "raw_distance_px": result.raw_distance_px,
        "stabilized_distance_px": result.stabilized_distance_px,
        "result_display_source": result.result_display_source,
        "curve_point_status": result.curve_point_status.value,
        "exclusion_reason": result.curve_exclusion_reason,
        "rejected_reason": result.rejected_reason,
        "temperature_celsius": result.temperature_celsius,
        "temperature_sync_status": result.temperature_sync_status.value,
        "temperature_delta_ms": result.temperature_delta_ms,
        "detector_mode": manifest.measurement_definition.detector_mode.value,
        "contrast_threshold": manifest.measurement_definition.detector_config.contrast_threshold,
        "curve_exclusion_reason": result.curve_exclusion_reason,
        "raw_detected_distance_px": result.raw_detected_distance_px,
        "distance_px_after_filter": distance_after_filter,
        "distance_outlier_filtered": result.distance_outlier_filtered,
        "distance_outlier_reason": result.curve_exclusion_reason if result.distance_outlier_filtered else "",
        "distance_outlier_baseline_px": result.distance_outlier_baseline_px,
        "distance_outlier_deviation_px": result.distance_outlier_deviation_px,
        "distance_outlier_max_jump_px": result.distance_outlier_max_jump_px,
        "distance_outlier_reference_count": result.distance_outlier_reference_count,
        "frame_timestamp_ms": result.frame_timestamp_ms,
        "temperature_timestamp_ms": result.temperature_timestamp_ms,
    }


def _region_result_row(result: DetectionResult, manifest: RunManifest) -> dict[str, object]:
    return {
        "region_id": result.region_id,
        "region_index": result.region_index,
        "region_label": result.region_label,
        "region_color": result.region_color,
        **_result_row(result, manifest),
    }


def _all_region_results(manifest: RunManifest) -> list[DetectionResult]:
    return manifest.region_detection_results or manifest.detection_results


def _write_json(export_dir: Path, manifest: RunManifest, analysis: AnalysisResult) -> ExportArtifact:
    path = export_dir / "run_export.json"
    payload = {
        "operator_data_source": manifest.operator_data_source,
        "provenance": manifest.provenance,
        "run_manifest": manifest.model_dump(mode="json"),
        "analysis_result": analysis.model_dump(mode="json"),
    }
    source_notice = _source_notice(manifest)
    if source_notice:
        payload["source_notice"] = source_notice
    source_validity = _source_validity(manifest)
    if source_validity:
        payload["source_validity"] = source_validity
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return _artifact("json", path, manifest.run_id)


def _write_analysis_by_region_json(export_dir: Path, analysis: AnalysisResult) -> ExportArtifact:
    path = export_dir / "analysis_by_region.json"
    path.write_text(
        json.dumps(
            {
                "analysis_id": analysis.analysis_id,
                "run_id": analysis.run_id,
                "regions": [region.model_dump(mode="json") for region in analysis.regions],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return _artifact("analysis_by_region_json", path, analysis.run_id)


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


def _write_combined_curve_png(export_dir: Path, analysis: AnalysisResult) -> ExportArtifact:
    path = export_dir / "temperature_distance_combined.png"
    _save_region_curve_figure(path, analysis.regions)
    return _artifact("png_curve_combined", path, analysis.run_id)


def _write_region_curve_pngs(export_dir: Path, analysis: AnalysisResult) -> list[ExportArtifact]:
    artifacts: list[ExportArtifact] = []
    for region in analysis.regions:
        path = export_dir / f"temperature_distance_{_safe_filename_part(region.region_id)}.png"
        _save_region_curve_figure(path, [region])
        artifacts.append(_artifact("png_curve_region", path, analysis.run_id))
    return artifacts


def _save_region_curve_figure(path: Path, regions: list[RegionAnalysisResult]) -> None:
    fig, ax = plt.subplots(figsize=(7, 4.5), dpi=140)
    for region in sorted(regions, key=lambda item: item.region_index):
        if region.temperature_distance:
            ax.plot(
                [point.x for point in region.temperature_distance],
                [point.y for point in region.temperature_distance],
                color=region.color,
                linewidth=1.8,
                label=_plot_region_label(region),
            )
        smoothed = region.afas_preprocessing.get("smoothed", {})
        temperatures = smoothed.get("temperature_celsius")
        values = smoothed.get("values")
        if isinstance(temperatures, list) and isinstance(values, list) and temperatures and values:
            ax.plot(
                temperatures,
                values,
                color=region.color,
                linewidth=2.2,
                alpha=0.55,
                linestyle="--",
            )
    ax.set_xlabel("temperature_celsius")
    ax.set_ylabel("distance_px")
    ax.grid(True, alpha=0.25)
    if any(region.temperature_distance for region in regions):
        ax.legend(loc="best")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


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


def _write_combined_overlay_png(export_dir: Path, manifest: RunManifest) -> ExportArtifact:
    path = export_dir / "roi_ab_overlay_combined.png"
    regions = manifest.measurement_definition.enabled_regions
    width = 800
    height = 480
    image = Image.new("RGB", (width, height), "#f7f9fb")
    draw = ImageDraw.Draw(image)
    source_w = max(1.0, max(region.roi.center_x + region.roi.width for region in regions))
    source_h = max(1.0, max(region.roi.center_y + region.roi.height for region in regions))
    scale = min((width - 40) / source_w, (height - 40) / source_h)

    def p(x: float, y: float) -> tuple[float, float]:
        return (20 + x * scale, 20 + y * scale)

    results = _all_region_results(manifest)
    for region in regions:
        roi = region.roi
        corners = [
            roi_local_to_measurement_point(roi, 0.0, 0.0),
            roi_local_to_measurement_point(roi, roi.width, 0.0),
            roi_local_to_measurement_point(roi, roi.width, roi.height),
            roi_local_to_measurement_point(roi, 0.0, roi.height),
        ]
        draw.polygon([p(point.x, point.y) for point in corners], outline=region.color, width=3)
        valid = next(
            (
                result
                for result in results
                if result.region_id == region.region_id
                and result.detection_status == DetectionStatus.VALID
                and result.ab_points is not None
            ),
            None,
        )
        if valid is not None and valid.ab_points is not None:
            a = valid.ab_points.a
            b = valid.ab_points.b
            draw.line([p(a.x, a.y), p(b.x, b.y)], fill=region.color, width=4)
            draw.ellipse(_circle_box(*p(a.x, a.y), radius=6), outline=region.color, width=3)
            draw.ellipse(_circle_box(*p(b.x, b.y), radius=6), outline=region.color, width=3)
    image.save(path)
    return _artifact("overlay_png_combined", path, manifest.run_id)


def _write_parameters_json(
    export_dir: Path,
    manifest: RunManifest,
    analysis: AnalysisResult,
) -> ExportArtifact:
    path = export_dir / "parameters.json"
    payload = {
        "measurement_definition": manifest.measurement_definition.model_dump(mode="json"),
        "operator_data_source": manifest.operator_data_source,
        "provenance": manifest.provenance,
        "afas_parameters_by_region": [
            {
                "region_id": region.region_id,
                "preprocessing": region.afas_preprocessing.get("parameters", {}),
                "analysis": region.afas_analysis.get("parameters", {}),
            }
            for region in analysis.regions
        ],
    }
    source_notice = _source_notice(manifest)
    if source_notice:
        payload["source_notice"] = source_notice
    source_validity = _source_validity(manifest)
    if source_validity:
        payload["source_validity"] = source_validity
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return _artifact("parameters_json", path, manifest.run_id)


def _source_notice(manifest: RunManifest) -> dict[str, str] | None:
    provenance = manifest.provenance or {}
    overall_kind = str(provenance.get("overall_kind") or "")
    if overall_kind == "mixed":
        return {
            "zh": "当前为混合模式，部分数据来自模拟设备，请勿作为正式测试结果。",
            "en": "Mixed source mode is active. Some data comes from simulated devices; do not use as a formal test result.",
        }
    if (
        manifest.operator_data_source == "offline_dataset"
        or overall_kind in {"offline", "simulated"}
        or bool(provenance.get("camera_is_simulated"))
        or bool(provenance.get("temperature_is_simulated"))
    ):
        return {
            "zh": "模拟数据，仅用于调试，不代表真实测试结果。",
            "en": "Simulated data for debugging only; it does not represent a real test result.",
        }
    return None


def _source_validity(manifest: RunManifest) -> dict[str, str] | None:
    provenance = manifest.provenance or {}
    overall_kind = str(provenance.get("overall_kind") or "")
    if manifest.operator_data_source == "real_camera" and overall_kind != "real_hardware":
        return {
            "status": "forbidden",
            "reason_zh": "真实相机模式的来源不是完整真实硬件，不能作为真实测试结果导出。",
            "reason_en": "Real-camera mode provenance is not complete real hardware; this export is forbidden as a real test result.",
        }
    if manifest.operator_data_source == "offline_dataset" or overall_kind in {"offline", "simulated"}:
        return {
            "status": "simulated_debug_only",
            "reason_zh": "模拟数据，仅用于调试，不代表真实测试结果。",
            "reason_en": "Simulated data, for debugging only; not a real test result.",
        }
    return None


def _artifact(artifact_type: str, path: Path, run_id: str) -> ExportArtifact:
    return ExportArtifact(
        artifact_id=path.stem,
        artifact_type=artifact_type,
        path=str(path),
        source_run_id=run_id,
    )


def _circle_box(x: float, y: float, *, radius: float) -> tuple[float, float, float, float]:
    return (x - radius, y - radius, x + radius, y + radius)


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-")
    return cleaned or "run"


def _plot_region_label(region: RegionAnalysisResult) -> str:
    return region.region_label if region.region_label.isascii() else f"Position {region.region_index}"
