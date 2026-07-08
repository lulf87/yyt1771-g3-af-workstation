from __future__ import annotations

from typing import Any, Mapping

from yyt1771_g3.core.enums import CurvePointStatus, DetectionStatus, TemperatureSyncStatus
from yyt1771_g3.core.models import AnalysisResult, CurvePoint, DetectionResult, RunManifest
from yyt1771_g3.services.afas_analysis import build_afas_postprocessing


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
    distance_time: list[CurvePoint] = []
    raw_distance_time: list[CurvePoint] = []
    stabilized_distance_time: list[CurvePoint] = []
    temperature_time: list[CurvePoint] = []
    temperature_distance: list[CurvePoint] = []
    raw_temperature_distance: list[CurvePoint] = []
    stabilized_temperature_distance: list[CurvePoint] = []

    for result in manifest.detection_results:
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

    afas_preprocessing, afas_analysis = build_afas_postprocessing(
        temperature_distance,
        preprocessing_parameters=afas_preprocessing_parameters,
        analysis_parameters=afas_analysis_parameters,
    )

    return AnalysisResult(
        analysis_id=analysis_id or f"{manifest.run_id}-analysis",
        run_id=manifest.run_id,
        operator_data_source=manifest.operator_data_source,
        provenance=manifest.provenance,
        all_frames=manifest.detection_results,
        distance_time=distance_time,
        raw_distance_time=raw_distance_time,
        stabilized_distance_time=stabilized_distance_time,
        temperature_time=temperature_time,
        temperature_distance=temperature_distance,
        raw_temperature_distance=raw_temperature_distance,
        stabilized_temperature_distance=stabilized_temperature_distance,
        afas_preprocessing=afas_preprocessing,
        afas_analysis=afas_analysis,
        export_artifacts=list(manifest.export_artifacts),
    )


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
