from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from yyt1771_g3.core.models import DetectionResult, MeasurementDefinition, RegionAnalysisResult
from yyt1771_g3.core.run_models_v2 import (
    RunAnalysisSummaryV2,
    RunMetaV2,
    RunStage,
    RunStateV2,
    RunStateValue,
)
from yyt1771_g3.storage.run_results_db import RunResultsDatabase
from yyt1771_g3.storage.run_store import RunStore


def initialize_v2_run(
    run_store: RunStore,
    *,
    run_id: str,
    dataset_id: str,
    measurement: MeasurementDefinition,
    runtime_source: str,
    product_mode: str,
    operator_data_source: str,
    provenance: dict[str, Any],
    config_snapshot: dict[str, Any],
    software: dict[str, Any] | None = None,
) -> RunStateV2:
    meta = RunMetaV2(
        run_id=run_id,
        dataset_id=dataset_id,
        runtime_source=runtime_source,
        product_mode=product_mode,
        operator_data_source=operator_data_source,
        provenance=provenance,
        measurement_definition=measurement.model_dump(mode="json"),
        config_snapshot=config_snapshot,
        software=software or {},
    )
    state = RunStateV2(run_id=run_id, region_count=len(measurement.enabled_regions))
    run_store.write_run_meta(meta)
    run_store.write_run_state(state)
    with RunResultsDatabase(run_store.results_database_path(run_id)):
        pass
    return state


def update_v2_run_state(
    run_store: RunStore,
    run_id: str,
    *,
    state: RunStateValue | None = None,
    stage: RunStage | None = None,
    processed_frames: int | None = None,
    stop_reason: str | None = None,
    error: str | None = None,
) -> RunStateV2:
    current = run_store.read_run_state(run_id)
    values: dict[str, Any] = {}
    if state is not None:
        values["state"] = state
    if stage is not None:
        values["stage"] = stage
    if processed_frames is not None:
        values["processed_frames"] = processed_frames
    if stop_reason is not None:
        values["stop_reason"] = stop_reason
    if error is not None:
        values["error"] = error
    now = datetime.now(timezone.utc).isoformat()
    if state == RunStateValue.STOP_REQUESTED and current.stopped_at is None:
        values["stopped_at"] = now
    if state in {RunStateValue.READY, RunStateValue.ERROR}:
        values["finalized_at"] = now
    updated = current.model_copy(update=values)
    run_store.write_run_state(updated)
    return updated


def build_v2_analysis_summary(
    run_store: RunStore,
    *,
    run_id: str,
    region_analyses: list[RegionAnalysisResult],
    latest_results: dict[str, DetectionResult],
) -> RunAnalysisSummaryV2:
    meta = run_store.read_run_meta(run_id)
    with RunResultsDatabase(run_store.results_database_path(run_id)) as database:
        regions: list[dict[str, Any]] = []
        for analysis in region_analyses:
            payload = analysis.model_dump(mode="json", exclude={"all_frames"})
            latest = latest_results.get(analysis.region_id)
            payload["latest_result"] = compact_detection_payload(latest) if latest is not None else None
            payload["status_events"] = database.diagnostic_events(analysis.region_id)
            regions.append(payload)
        counts = {
            "frames": database.frame_count(),
            "region_results": database.result_count(),
            "regions": len(regions),
        }
    return RunAnalysisSummaryV2(
        analysis_id=f"{run_id}-analysis",
        run_id=run_id,
        runtime_source=meta.runtime_source,
        product_mode=meta.product_mode,
        operator_data_source=meta.operator_data_source,
        provenance=meta.provenance,
        regions=regions,
        counts=counts,
    )


def compact_detection_payload(result: DetectionResult) -> dict[str, Any]:
    return {
        "frame_index": result.frame_index,
        "region_id": result.region_id,
        "region_index": result.region_index,
        "region_label": result.region_label,
        "region_color": result.region_color,
        "detection_status": result.detection_status.value,
        "ab_points": result.ab_points.model_dump(mode="json") if result.ab_points else None,
        "distance_px": result.distance_px,
        "raw_ab_points": result.raw_ab_points.model_dump(mode="json") if result.raw_ab_points else None,
        "raw_distance_px": result.raw_distance_px,
        "stabilized_ab_points": result.stabilized_ab_points.model_dump(mode="json") if result.stabilized_ab_points else None,
        "stabilized_distance_px": result.stabilized_distance_px,
        "result_display_source": result.result_display_source,
        "quality": result.quality.model_dump(mode="json"),
        "rejected_reason": result.rejected_reason,
        "curve_point_status": result.curve_point_status.value,
        "curve_exclusion_reason": result.curve_exclusion_reason,
        "distance_outlier_filtered": result.distance_outlier_filtered,
        "temperature_sync_status": result.temperature_sync_status.value,
        "frame_timestamp_ms": result.frame_timestamp_ms,
        "temperature_timestamp_ms": result.temperature_timestamp_ms,
        "temperature_celsius": result.temperature_celsius,
        "temperature_delta_ms": result.temperature_delta_ms,
    }


def compact_detection_for_analysis(result: DetectionResult) -> DetectionResult:
    """Keep formal semantics while discarding production-irrelevant detector diagnostics."""
    selected = result.selected_candidate
    if selected is not None:
        selected = selected.model_copy(update={"metadata": {}})
    return result.model_copy(
        update={
            "selected_candidate": selected,
            "raw_best_candidate": None,
            "stabilized_candidate": None,
            "rejected_candidates": [],
            "distance_outlier_reference_values": [],
            "debug_artifacts": {},
        }
    )
