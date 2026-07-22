from __future__ import annotations

from typing import Any, Mapping

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus, TemperatureSyncStatus
from yyt1771_g3.core.models import (
    AnalysisResult,
    CurvePoint,
    DetectionResult,
    MeasurementRegion,
    RegionAnalysisResult,
    RunManifest,
)
from yyt1771_g3.services.afas_adjustment_validation import (
    AfasAdjustmentValidationError,
    validate_manual_afas_preflight,
)
from yyt1771_g3.services.afas_analysis import analyze_preprocessed_afas, build_afas_postprocessing


FORMAL_TEMPERATURE_DISTANCE_STATUSES = {
    TemperatureSyncStatus.TEMP_SYNC_OK,
    TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED,
}


def build_analysis_result(
    manifest: RunManifest,
    *,
    analysis_id: str | None = None,
    afas_preprocessing_parameters: Mapping[str, Any] | None = None,
    afas_analysis_parameters: Mapping[str, Any] | None = None,
) -> AnalysisResult:
    detections_by_region = detection_results_by_region(manifest)
    regions = [
        build_region_analysis_result(
            region,
            detections_by_region.get(region.region_id, []),
            afas_preprocessing_parameters=afas_preprocessing_parameters,
            afas_analysis_parameters=afas_analysis_parameters,
        )
        for region in manifest.measurement_definition.enabled_regions
    ]
    return build_analysis_result_from_regions(
        manifest,
        regions,
        analysis_id=analysis_id,
    )


def recompute_region_analysis_result(
    manifest: RunManifest,
    current_analysis: AnalysisResult,
    region_id: str,
    *,
    afas_preprocessing_parameters: Mapping[str, Any] | None = None,
    afas_analysis_parameters: Mapping[str, Any] | None = None,
) -> AnalysisResult:
    region = next(
        (candidate for candidate in manifest.measurement_definition.enabled_regions if candidate.region_id == region_id),
        None,
    )
    if region is None:
        raise ValueError(f"Unknown enabled measurement region: {region_id}")
    current_region = next(
        (candidate for candidate in current_analysis.regions if candidate.region_id == region_id),
        None,
    )
    validate_manual_afas_preflight(
        current_region.afas_preprocessing if current_region is not None else {},
        afas_analysis_parameters,
        current_region.afas_analysis if current_region is not None else {},
    )
    detections = detection_results_by_region(manifest).get(region_id, [])
    replacement = build_region_analysis_result(
        region,
        detections,
        afas_preprocessing_parameters=afas_preprocessing_parameters,
        afas_analysis_parameters=afas_analysis_parameters,
    )
    existing = {candidate.region_id: candidate for candidate in current_analysis.regions}
    existing[region_id] = replacement
    regions = [
        existing[candidate.region_id]
        for candidate in manifest.measurement_definition.enabled_regions
        if candidate.region_id in existing
    ]
    return build_analysis_result_from_regions(
        manifest,
        regions,
        analysis_id=current_analysis.analysis_id,
    )


def preview_region_afas_adjustment(
    current_analysis: AnalysisResult,
    region_id: str,
    *,
    afas_analysis_parameters: Mapping[str, Any] | None = None,
) -> AnalysisResult:
    region = next((candidate for candidate in current_analysis.regions if candidate.region_id == region_id), None)
    if region is None:
        raise ValueError(f"Unknown analysis region: {region_id}")
    preview = preview_region_afas_patch(
        region,
        parameter_overrides=afas_analysis_parameters,
    )
    replacement = region.model_copy(
        update={
            "afas_analysis": preview["afas_analysis"],
            "summary": preview["summary"],
        }
    )
    regions = [replacement if candidate.region_id == region_id else candidate for candidate in current_analysis.regions]
    payload = current_analysis.model_dump(mode="python")
    payload["regions"] = [candidate.model_dump(mode="python") for candidate in regions]
    return AnalysisResult.model_validate(payload)


def preview_region_afas_patch(
    region: RegionAnalysisResult | Mapping[str, Any],
    *,
    parameter_overrides: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    if isinstance(region, RegionAnalysisResult):
        region_id = region.region_id
        preprocessing = region.afas_preprocessing
        current_afas_analysis = region.afas_analysis
        temperature_distance = region.temperature_distance
    else:
        region_id = str(region.get("region_id", ""))
        preprocessing_value = region.get("afas_preprocessing")
        preprocessing = preprocessing_value if isinstance(preprocessing_value, Mapping) else {}
        analysis_value = region.get("afas_analysis")
        current_afas_analysis = analysis_value if isinstance(analysis_value, Mapping) else {}
        temperature_distance_value = region.get("temperature_distance")
        temperature_distance = temperature_distance_value if isinstance(temperature_distance_value, list) else []
    if not region_id:
        raise ValueError("Analysis region is missing region_id")
    validate_manual_afas_preflight(
        preprocessing,
        parameter_overrides,
        current_afas_analysis,
    )
    afas_analysis = analyze_preprocessed_afas(
        preprocessing,
        parameter_overrides=parameter_overrides,
    )
    return {
        "region_id": region_id,
        "afas_analysis": afas_analysis,
        "summary": _region_analysis_summary(temperature_distance, preprocessing, afas_analysis),
    }


def detection_results_by_region(manifest: RunManifest) -> dict[str, list[DetectionResult]]:
    grouped: dict[str, list[DetectionResult]] = {
        region.region_id: [] for region in manifest.measurement_definition.enabled_regions
    }
    for result in manifest.region_detection_results or manifest.detection_results:
        grouped.setdefault(result.region_id, []).append(result)
    return grouped


def build_region_analysis_result(
    region: MeasurementRegion,
    detections: list[DetectionResult],
    *,
    afas_preprocessing_parameters: Mapping[str, Any] | None = None,
    afas_analysis_parameters: Mapping[str, Any] | None = None,
) -> RegionAnalysisResult:
    distance_time: list[CurvePoint] = []
    raw_distance_time: list[CurvePoint] = []
    stabilized_distance_time: list[CurvePoint] = []
    temperature_time: list[CurvePoint] = []
    temperature_distance: list[CurvePoint] = []
    raw_temperature_distance: list[CurvePoint] = []
    stabilized_temperature_distance: list[CurvePoint] = []

    for result in detections:
        points = curve_points_for_detection(result)
        raw_points = curve_points_for_detection(result, distance_source="raw")
        stabilized_points = curve_points_for_detection(result, distance_source="stabilized")
        if points["distance_time"] is not None:
            distance_time.append(points["distance_time"])
        if raw_points["distance_time"] is not None:
            raw_distance_time.append(raw_points["distance_time"])
        if stabilized_points["distance_time"] is not None:
            stabilized_distance_time.append(stabilized_points["distance_time"])
        if points["temperature_time"] is not None:
            temperature_time.append(points["temperature_time"])
        if points["temperature_distance"] is not None:
            temperature_distance.append(points["temperature_distance"])
        if raw_points["temperature_distance"] is not None:
            raw_temperature_distance.append(raw_points["temperature_distance"])
        if stabilized_points["temperature_distance"] is not None:
            stabilized_temperature_distance.append(stabilized_points["temperature_distance"])

    try:
        afas_preprocessing, afas_analysis = build_afas_postprocessing(
            temperature_distance,
            preprocessing_parameters=afas_preprocessing_parameters,
            analysis_parameters=afas_analysis_parameters,
        )
    except AfasAdjustmentValidationError:
        raise
    except Exception as exc:  # pragma: no cover - failure isolation exercised through service tests
        reason = f"analysis_exception:{exc.__class__.__name__}"
        afas_preprocessing = {
            "result_status": "unavailable",
            "reason": reason,
            "error": str(exc),
        }
        afas_analysis = {
            "result_status": "unavailable",
            "reason": reason,
            "error": str(exc),
            "result": {},
        }

    return RegionAnalysisResult(
        region_id=region.region_id,
        region_index=region.index,
        region_label=region.label,
        color=region.color,
        all_frames=detections,
        distance_time=distance_time,
        raw_distance_time=raw_distance_time,
        stabilized_distance_time=stabilized_distance_time,
        temperature_time=temperature_time,
        temperature_distance=temperature_distance,
        raw_temperature_distance=raw_temperature_distance,
        stabilized_temperature_distance=stabilized_temperature_distance,
        afas_preprocessing=afas_preprocessing,
        afas_analysis=afas_analysis,
        summary=_region_analysis_summary(temperature_distance, afas_preprocessing, afas_analysis),
    )


def build_analysis_result_from_regions(
    manifest: RunManifest,
    regions: list[RegionAnalysisResult],
    *,
    analysis_id: str | None = None,
) -> AnalysisResult:
    return AnalysisResult(
        analysis_id=analysis_id or f"{manifest.run_id}-analysis",
        run_id=manifest.run_id,
        runtime_source=manifest.runtime_source,
        product_mode=manifest.product_mode,
        operator_data_source=manifest.operator_data_source,
        provenance=manifest.provenance,
        regions=regions,
        export_artifacts=list(manifest.export_artifacts),
    )


def _region_analysis_summary(
    temperature_distance: list[CurvePoint],
    afas_preprocessing: Mapping[str, Any],
    afas_analysis: Mapping[str, Any],
) -> dict[str, Any]:
    result_value = afas_analysis.get("result")
    result = result_value if isinstance(result_value, Mapping) else {}
    smoothed_value = afas_preprocessing.get("smoothed")
    smoothed = smoothed_value if isinstance(smoothed_value, Mapping) else {}
    values = smoothed.get("values")
    smoothed_count = len(values) if isinstance(values, list) else 0
    status = str(afas_analysis.get("result_status", "unavailable"))
    reason = str(afas_analysis.get("reason", "") or "")
    as_value = _finite_number(result.get("As"))
    af_value = _finite_number(result.get("Af"))
    if af_value is None:
        af_value = _finite_number(result.get("Af_tan"))
    return {
        "status": status,
        "failure_reason": reason if status != "ok" else "",
        "raw_point_count": len(temperature_distance),
        "smoothed_point_count": smoothed_count,
        "As": as_value,
        "Af": af_value,
        "delta_t": af_value - as_value if as_value is not None and af_value is not None else None,
        "max_slope_temperature": _finite_number(result.get("max_slope_temp")),
    }


def _finite_number(value: Any) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    return numeric if numeric == numeric and abs(numeric) != float("inf") else None


def curve_points_for_detection(
    result: DetectionResult,
    *,
    distance_source: str = "display",
) -> dict[str, CurvePoint | None]:
    time_x = float(result.frame_timestamp_ms if result.frame_timestamp_ms is not None else result.frame_index)
    distance_time: CurvePoint | None = None
    temperature_time: CurvePoint | None = None
    temperature_distance: CurvePoint | None = None

    distance_px = _distance_for_source(result, distance_source)
    formal_curve_point = _is_formal_curve_point(result)
    if result.detection_status == DetectionStatus.VALID and distance_px is not None and formal_curve_point:
        distance_time = CurvePoint(
            x=time_x,
            y=float(distance_px),
            frame_index=result.frame_index,
            sync_status=result.temperature_sync_status,
        )
    if result.temperature_celsius is not None:
        temperature_time = CurvePoint(
            x=time_x,
            y=float(result.temperature_celsius),
            frame_index=result.frame_index,
            sync_status=result.temperature_sync_status,
        )
    if (
        result.detection_status == DetectionStatus.VALID
        and distance_px is not None
        and formal_curve_point
        and result.temperature_celsius is not None
        and result.temperature_sync_status in FORMAL_TEMPERATURE_DISTANCE_STATUSES
    ):
        temperature_distance = CurvePoint(
            x=float(result.temperature_celsius),
            y=float(distance_px),
            frame_index=result.frame_index,
            sync_status=result.temperature_sync_status,
        )

    return {
        "distance_time": distance_time,
        "temperature_time": temperature_time,
        "temperature_distance": temperature_distance,
    }


def _distance_for_source(result: DetectionResult, distance_source: str) -> float | None:
    if distance_source == "raw":
        return result.raw_distance_px
    if distance_source == "stabilized":
        return result.stabilized_distance_px
    return result.distance_px


def _is_formal_curve_point(result: DetectionResult) -> bool:
    return result.curve_point_status == CurvePointStatus.VALID
