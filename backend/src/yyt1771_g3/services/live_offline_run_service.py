from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yyt1771_g3.core.models import (
    AnalysisResult,
    CurvePoint,
    DetectionResult,
    FrameRecord,
    MeasurementDefinition,
    RunManifest,
    TemperatureRecord,
)
from yyt1771_g3.core.runtime_policy import run_runtime_metadata
from yyt1771_g3.services.afas_analysis import preprocess_temperature_distance
from yyt1771_g3.services.analysis_service import (
    build_analysis_result,
    build_analysis_result_from_regions,
    build_region_analysis_result,
    curve_points_for_detection,
    detection_results_by_region,
)
from yyt1771_g3.services.distance_outlier_filter import CausalDistanceOutlierFilter, filter_detection_sequence
from yyt1771_g3.services.live_point_status import build_live_point_status
from yyt1771_g3.services.offline_dataset import OfflineDatasetError, OfflineDatasetRegistry
from yyt1771_g3.services.region_detection_service import (
    RegionFrameResult,
    create_region_runtime_state,
    detect_regions_for_run_frame,
    region_frame_result_payload,
)
from yyt1771_g3.services.run_detector_policy import (
    RunDetectorPolicyState,
    analyze_detection_suspicion,
    annotate_run_detection,
    enhanced_rerun_reasons,
    enhanced_rerun_diagnostics_enabled,
    initial_run_diagnostics_enabled,
    measurement_for_detector_mode,
    should_rerun_with_enhanced,
)
from yyt1771_g3.services.source_provenance import offline_dataset_provenance
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.sync import SyncedTemperature, sync_temperature_for_frame
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState
from yyt1771_g3.vision.temporal_stabilization import CausalTemporalStabilizer, stabilize_detection_sequence


AFAS_PREVIEW_INTERVAL_FRAMES = 300


@dataclass(frozen=True)
class LiveOfflineRunResult:
    manifest: RunManifest
    analysis: AnalysisResult


@dataclass(frozen=True)
class _FrameWindow:
    start_frame: int
    end_frame: int
    frame_limit: int


def run_live_offline_dataset(
    registry: OfflineDatasetRegistry,
    run_store: RunStore,
    *,
    dataset_id: str,
    measurement: MeasurementDefinition,
    start_frame: int = 1,
    max_frames: int | None = None,
    target_fps: float | None = None,
) -> LiveOfflineRunResult:
    if len(measurement.enabled_regions) > 1:
        return _run_live_offline_dataset_multi(
            registry,
            run_store,
            dataset_id=dataset_id,
            measurement=measurement,
            start_frame=start_frame,
            max_frames=max_frames,
            target_fps=target_fps,
        )
    resolved = registry.resolve_dataset(dataset_id)
    manifest_payload = registry.load_manifest(dataset_id)
    temperature_rows = registry.load_temperature_csv(dataset_id)
    window = _resolve_frame_window(resolved.frame_count, start_frame, max_frames)
    run_id = _new_run_id(dataset_id)
    provenance = offline_dataset_provenance(dataset_id)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    stop_reason = "complete"

    for frame_index in range(window.start_frame, window.end_frame + 1):
        frame_record, temperature_record, detection, state, policy_state = _process_frame(
            registry,
            dataset_id,
            measurement,
            manifest_payload,
            temperature_rows,
            frame_index,
            state,
            policy_state,
        )
        frame_records.append(frame_record)
        temperature_records.append(temperature_record)
        detection_results.append(detection)
        if _target_temperature_reached(measurement, detection):
            stop_reason = "target_temperature_reached"
            break
    detection_results = stabilize_detection_sequence(
        detection_results,
        measurement,
        filter_mode="centered",
        artifact_dir=_temporal_mask_artifact_dir(measurement, run_store.run_dir(run_id)),
    )
    detection_results = filter_detection_sequence(detection_results, measurement.detector_config)

    return _save_run_result(
        run_store,
        run_id=run_id,
        dataset_id=dataset_id,
        measurement=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        start_frame=window.start_frame,
        frame_limit=window.frame_limit,
        target_fps=target_fps,
        stop_reason=stop_reason,
        provenance=provenance,
    )


def iter_live_offline_run_events(
    registry: OfflineDatasetRegistry,
    run_store: RunStore,
    *,
    dataset_id: str,
    measurement: MeasurementDefinition,
    start_frame: int = 1,
    max_frames: int | None = None,
    target_fps: float | None = None,
) -> Iterator[dict[str, Any]]:
    if len(measurement.enabled_regions) > 1:
        yield from _iter_live_offline_run_events_multi(
            registry,
            run_store,
            dataset_id=dataset_id,
            measurement=measurement,
            start_frame=start_frame,
            max_frames=max_frames,
            target_fps=target_fps,
        )
        return
    resolved = registry.resolve_dataset(dataset_id)
    manifest_payload = registry.load_manifest(dataset_id)
    temperature_rows = registry.load_temperature_csv(dataset_id)
    window = _resolve_frame_window(resolved.frame_count, start_frame, max_frames)
    run_id = _new_run_id(dataset_id)
    provenance = offline_dataset_provenance(dataset_id)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    temperature_distance_points: list[CurvePoint] = []
    saved_result: LiveOfflineRunResult | None = None
    stop_reason = "complete"
    temporal_stabilizer = CausalTemporalStabilizer(
        measurement,
        artifact_dir=_temporal_mask_artifact_dir(measurement, run_store.run_dir(run_id)),
    )
    distance_outlier_filter = CausalDistanceOutlierFilter(measurement.detector_config)

    try:
        for processed, frame_index in enumerate(range(window.start_frame, window.end_frame + 1), start=1):
            frame_record, temperature_record, detection, state, policy_state = _process_frame(
                registry,
                dataset_id,
                measurement,
                manifest_payload,
                temperature_rows,
                frame_index,
                state,
                policy_state,
            )
            detection = temporal_stabilizer.apply(detection)
            detection = distance_outlier_filter.apply(detection)
            frame_records.append(frame_record)
            temperature_records.append(temperature_record)
            detection_results.append(detection)
            curve_points = _curve_points_for_run_event(detection)
            if curve_points["temperature_distance"] is not None:
                temperature_distance_points.append(curve_points["temperature_distance"])
            yield _frame_event(
                run_id=run_id,
                dataset_id=dataset_id,
                frame_count=resolved.frame_count,
                frame_limit=window.frame_limit,
                processed_frames=processed,
                frame_record=frame_record,
                temperature_record=temperature_record,
                detection=detection,
                curve_points=curve_points,
                afas_preprocessing=_live_afas_preprocessing_preview(
                    temperature_distance_points,
                    processed_frames=processed,
                ),
                provenance=provenance,
            )
            if _target_temperature_reached(measurement, detection):
                stop_reason = "target_temperature_reached"
                break

        yield _run_stage_event(
            run_id=run_id,
            event="stopping",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        manifest = _build_run_manifest(
            run_id=run_id,
            dataset_id=dataset_id,
            measurement=measurement,
            frame_records=frame_records,
            temperature_records=temperature_records,
            detection_results=detection_results,
            start_frame=window.start_frame,
            frame_limit=window.frame_limit,
            target_fps=target_fps,
            stop_reason=stop_reason,
            provenance=provenance,
        )
        yield _run_stage_event(
            run_id=run_id,
            event="saving_manifest",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        run_store.write_run_manifest(manifest)
        yield _run_stage_event(
            run_id=run_id,
            event="building_analysis",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        detections_by_region = detection_results_by_region(manifest)
        region_analyses = []
        enabled_regions = manifest.measurement_definition.enabled_regions
        for current, region in enumerate(enabled_regions, start=1):
            yield {
                "event": "analyzing_region",
                "run_id": run_id,
                "dataset_id": dataset_id,
                "operator_data_source": "offline_dataset",
                "processed_frames": len(frame_records),
                "frame_count": resolved.frame_count,
                "total_frames": window.frame_limit,
                "current": current,
                "total": len(enabled_regions),
                "region_id": region.region_id,
                "region_index": region.index,
                "region_label": region.label,
                "color": region.color,
            }
            region_analysis = build_region_analysis_result(
                region,
                detections_by_region.get(region.region_id, []),
            )
            region_analyses.append(region_analysis)
            yield {
                "event": "analysis_region_complete",
                "run_id": run_id,
                "dataset_id": dataset_id,
                "operator_data_source": "offline_dataset",
                "current": current,
                "total": len(enabled_regions),
                "region_id": region.region_id,
                "region_index": region.index,
                "region_label": region.label,
                "color": region.color,
                "region_analysis": region_analysis.model_dump(mode="json"),
            }
        analysis = build_analysis_result_from_regions(manifest, region_analyses)
        run_store.write_analysis_result(analysis)
        saved_result = LiveOfflineRunResult(manifest=manifest, analysis=analysis)
        yield {
            "event": "complete",
            "run_manifest": saved_result.manifest.model_dump(mode="json"),
            "analysis_result": saved_result.analysis.model_dump(mode="json"),
        }
    finally:
        if saved_result is None and frame_records:
            _save_run_result(
                run_store,
                run_id=run_id,
                dataset_id=dataset_id,
                measurement=measurement,
                frame_records=frame_records,
                temperature_records=temperature_records,
                detection_results=detection_results,
                start_frame=window.start_frame,
                frame_limit=window.frame_limit,
                target_fps=target_fps,
                stop_reason="stream_closed",
                provenance=provenance,
            )


def _run_live_offline_dataset_multi(
    registry: OfflineDatasetRegistry,
    run_store: RunStore,
    *,
    dataset_id: str,
    measurement: MeasurementDefinition,
    start_frame: int,
    max_frames: int | None,
    target_fps: float | None,
) -> LiveOfflineRunResult:
    for event in _iter_live_offline_run_events_multi(
        registry,
        run_store,
        dataset_id=dataset_id,
        measurement=measurement,
        start_frame=start_frame,
        max_frames=max_frames,
        target_fps=target_fps,
    ):
        if event.get("event") == "complete":
            return LiveOfflineRunResult(
                manifest=RunManifest.model_validate(event["run_manifest"]),
                analysis=AnalysisResult.model_validate(event["analysis_result"]),
            )
    raise OfflineDatasetError("multi-region offline run ended without a complete event")


def _iter_live_offline_run_events_multi(
    registry: OfflineDatasetRegistry,
    run_store: RunStore,
    *,
    dataset_id: str,
    measurement: MeasurementDefinition,
    start_frame: int,
    max_frames: int | None,
    target_fps: float | None,
) -> Iterator[dict[str, Any]]:
    resolved = registry.resolve_dataset(dataset_id)
    manifest_payload = registry.load_manifest(dataset_id)
    temperature_rows = registry.load_temperature_csv(dataset_id)
    window = _resolve_frame_window(resolved.frame_count, start_frame, max_frames)
    run_id = _new_run_id(dataset_id)
    provenance = offline_dataset_provenance(dataset_id)
    runtime_state = create_region_runtime_state(
        measurement,
        temporal_artifact_root=_temporal_mask_artifact_dir(measurement, run_store.run_dir(run_id)),
    )
    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    region_detection_results: list[DetectionResult] = []
    saved_result: LiveOfflineRunResult | None = None
    stop_reason = "complete"

    try:
        for processed, frame_index in enumerate(range(window.start_frame, window.end_frame + 1), start=1):
            frame = registry.load_frame(dataset_id, frame_index)
            frame_meta = _frame_meta(manifest_payload, frame_index)
            frame_timestamp_ms = _int_or_none(frame_meta.get("timestamp_ms"))
            synced = sync_temperature_for_frame(frame_index, frame_timestamp_ms, temperature_rows)
            frame_record = FrameRecord(
                frame_index=frame_index,
                frame_path=str(frame_meta.get("npy", frame.frame_path.name)),
                timestamp_ms=frame_timestamp_ms,
                shape=list(frame.array.shape),
                dtype=str(frame.array.dtype),
                source=str(frame_meta.get("source", "offline_dataset")),
                camera_meta=frame_meta.get("camera_meta", {})
                if isinstance(frame_meta.get("camera_meta"), dict)
                else {},
            )
            temperature_record = TemperatureRecord(
                timestamp_ms=synced.timestamp_ms,
                celsius=synced.celsius,
                source=synced.source,
                sampled_this_frame=synced.sampled_this_frame,
            )
            region_results, runtime_state = detect_regions_for_run_frame(
                frame.array,
                measurement,
                frame_index=frame_index,
                detector=_detect_frame_for_run,
                runtime_state=runtime_state,
                detection_transform=lambda detection: _attach_temperature(
                    detection,
                    frame_timestamp_ms,
                    synced,
                ),
            )
            first = region_results[0]
            frame_records.append(frame_record)
            temperature_records.append(temperature_record)
            detection_results.append(first.detection)
            region_detection_results.extend(item.detection for item in region_results)
            first_preview = _live_afas_preprocessing_preview(
                runtime_state.temperature_distance_points[first.region.region_id],
                processed_frames=processed,
            )
            yield _frame_event(
                run_id=run_id,
                dataset_id=dataset_id,
                frame_count=resolved.frame_count,
                frame_limit=window.frame_limit,
                processed_frames=processed,
                frame_record=frame_record,
                temperature_record=temperature_record,
                detection=first.detection,
                curve_points=first.curve_points,
                afas_preprocessing=first_preview,
                provenance=provenance,
                region_results=_region_event_payloads(
                    region_results,
                    runtime_state.temperature_distance_points,
                    processed_frames=processed,
                ),
            )
            if _target_temperature_reached(measurement, first.detection):
                stop_reason = "target_temperature_reached"
                break

        yield _run_stage_event(
            run_id=run_id,
            event="stopping",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        manifest = _build_run_manifest(
            run_id=run_id,
            dataset_id=dataset_id,
            measurement=measurement,
            frame_records=frame_records,
            temperature_records=temperature_records,
            detection_results=detection_results,
            region_detection_results=region_detection_results,
            start_frame=window.start_frame,
            frame_limit=window.frame_limit,
            target_fps=target_fps,
            stop_reason=stop_reason,
            provenance=provenance,
        )
        yield _run_stage_event(
            run_id=run_id,
            event="saving_manifest",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        run_store.write_run_manifest(manifest)
        yield _run_stage_event(
            run_id=run_id,
            event="building_analysis",
            dataset_id=dataset_id,
            processed_frames=len(frame_records),
            frame_count=resolved.frame_count,
            frame_limit=window.frame_limit,
            stop_reason=stop_reason,
        )
        detections_by_region = detection_results_by_region(manifest)
        region_analyses = []
        enabled_regions = manifest.measurement_definition.enabled_regions
        for current, region in enumerate(enabled_regions, start=1):
            yield {
                "event": "analyzing_region",
                "run_id": run_id,
                "dataset_id": dataset_id,
                "operator_data_source": "offline_dataset",
                "processed_frames": len(frame_records),
                "frame_count": resolved.frame_count,
                "total_frames": window.frame_limit,
                "current": current,
                "total": len(enabled_regions),
                "region_id": region.region_id,
                "region_index": region.index,
                "region_label": region.label,
                "color": region.color,
            }
            region_analysis = build_region_analysis_result(
                region,
                detections_by_region.get(region.region_id, []),
            )
            region_analyses.append(region_analysis)
            yield {
                "event": "analysis_region_complete",
                "run_id": run_id,
                "dataset_id": dataset_id,
                "operator_data_source": "offline_dataset",
                "current": current,
                "total": len(enabled_regions),
                "region_id": region.region_id,
                "region_index": region.index,
                "region_label": region.label,
                "color": region.color,
                "region_analysis": region_analysis.model_dump(mode="json"),
            }
        analysis = build_analysis_result_from_regions(manifest, region_analyses)
        run_store.write_analysis_result(analysis)
        saved_result = LiveOfflineRunResult(manifest=manifest, analysis=analysis)
        yield {
            "event": "complete",
            "run_manifest": manifest.model_dump(mode="json"),
            "analysis_result": analysis.model_dump(mode="json"),
        }
    finally:
        if saved_result is None and frame_records:
            _save_run_result(
                run_store,
                run_id=run_id,
                dataset_id=dataset_id,
                measurement=measurement,
                frame_records=frame_records,
                temperature_records=temperature_records,
                detection_results=detection_results,
                region_detection_results=region_detection_results,
                start_frame=window.start_frame,
                frame_limit=window.frame_limit,
                target_fps=target_fps,
                stop_reason="stream_closed",
                provenance=provenance,
            )


def _region_event_payloads(
    results: list[RegionFrameResult],
    points_by_region: dict[str, list[CurvePoint]],
    *,
    processed_frames: int,
) -> list[dict[str, Any]]:
    return [
        region_frame_result_payload(
            item,
            afas_preprocessing=_live_afas_preprocessing_preview(
                points_by_region[item.region.region_id],
                processed_frames=processed_frames,
            ),
        )
        for item in results
    ]


def _save_run_result(
    run_store: RunStore,
    *,
    run_id: str,
    dataset_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    region_detection_results: list[DetectionResult] | None = None,
    start_frame: int,
    frame_limit: int,
    target_fps: float | None,
    stop_reason: str = "complete",
    provenance: dict[str, Any] | None = None,
) -> LiveOfflineRunResult:
    manifest = _build_run_manifest(
        run_id=run_id,
        dataset_id=dataset_id,
        measurement=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        region_detection_results=region_detection_results,
        start_frame=start_frame,
        frame_limit=frame_limit,
        target_fps=target_fps,
        stop_reason=stop_reason,
        provenance=provenance,
    )
    analysis = build_analysis_result(manifest)
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return LiveOfflineRunResult(manifest=manifest, analysis=analysis)


def _build_run_manifest(
    *,
    run_id: str,
    dataset_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    region_detection_results: list[DetectionResult] | None = None,
    start_frame: int,
    frame_limit: int,
    target_fps: float | None,
    stop_reason: str = "complete",
    provenance: dict[str, Any] | None = None,
) -> RunManifest:
    resolved_provenance = provenance or offline_dataset_provenance(dataset_id)
    runtime_metadata = run_runtime_metadata(
        default_runtime_source="simulated_material",
        legacy_operator_data_source="offline_dataset",
    )
    manifest = RunManifest(
        run_id=run_id,
        dataset_id=dataset_id,
        measurement_definition=measurement,
        runtime_source=runtime_metadata["runtime_source"],
        product_mode=runtime_metadata["product_mode"],
        operator_data_source=runtime_metadata["operator_data_source"],
        provenance=resolved_provenance,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        region_detection_results=region_detection_results or detection_results,
        config_snapshot={
            "mode": "live_offline_run",
            "runtime_source": runtime_metadata["runtime_source"],
            "product_mode": runtime_metadata["product_mode"],
            "operator_data_source": runtime_metadata["operator_data_source"],
            "provenance": resolved_provenance,
            "detector_mode": measurement.detector_mode,
            "contrast_threshold": measurement.detector_config.contrast_threshold,
            "start_frame": start_frame,
            "max_frames": frame_limit,
            "processed_frames": len(frame_records),
            "stop_reason": stop_reason,
            "target_temperature_celsius": measurement.detector_config.target_temperature_celsius,
            "temperature_power_percent": measurement.detector_config.temperature_power_percent,
            "target_fps": target_fps or measurement.detector_config.live_offline_fps,
            "temporal_stabilization_enabled": measurement.detector_config.temporal_stabilization_enabled,
            "temporal_stabilization_strength": measurement.detector_config.temporal_stabilization_strength,
            "save_temporal_masks": measurement.detector_config.save_temporal_masks,
            "temporal_filter_mode": _run_temporal_filter_mode(detection_results),
            "distance_outlier_filter_enabled": measurement.detector_config.distance_outlier_filter_enabled,
            "distance_outlier_reference_count": measurement.detector_config.distance_outlier_reference_count,
            "distance_outlier_max_jump_px": measurement.detector_config.distance_outlier_max_jump_px,
            "distance_outlier_baseline": measurement.detector_config.distance_outlier_baseline,
        },
        software={"package": "yyt1771_g3", "phase": "G3-M7"},
    )
    return manifest


def read_run(run_store: RunStore, run_id: str) -> LiveOfflineRunResult:
    manifest = run_store.read_run_manifest(run_id)
    try:
        analysis = run_store.read_analysis_result(run_id)
    except FileNotFoundError:
        analysis = build_analysis_result(manifest)
    return LiveOfflineRunResult(manifest=manifest, analysis=analysis)


def _resolve_frame_window(frame_count: int, start_frame: int, max_frames: int | None) -> _FrameWindow:
    if frame_count <= 0:
        raise OfflineDatasetError("offline dataset has no frames")

    normalized_start = max(1, start_frame)
    if normalized_start > frame_count:
        raise OfflineDatasetError(
            f"start_frame {start_frame} is out of range for dataset with {frame_count} frames"
        )

    remaining_frames = frame_count - normalized_start + 1
    requested_frames = remaining_frames if max_frames is None else max(1, max_frames)
    frame_limit = min(requested_frames, remaining_frames)
    return _FrameWindow(
        start_frame=normalized_start,
        end_frame=normalized_start + frame_limit - 1,
        frame_limit=frame_limit,
    )


def _process_frame(
    registry: OfflineDatasetRegistry,
    dataset_id: str,
    measurement: MeasurementDefinition,
    manifest_payload: dict[str, Any],
    temperature_rows: list[dict[str, str]],
    frame_index: int,
    state: CandidateSelectionState,
    policy_state: RunDetectorPolicyState,
) -> tuple[FrameRecord, TemperatureRecord, DetectionResult, CandidateSelectionState, RunDetectorPolicyState]:
    frame = registry.load_frame(dataset_id, frame_index)
    frame_meta = _frame_meta(manifest_payload, frame_index)
    frame_timestamp_ms = _int_or_none(frame_meta.get("timestamp_ms"))
    synced = sync_temperature_for_frame(frame_index, frame_timestamp_ms, temperature_rows)
    run_measurement = measurement_for_detector_mode(measurement, measurement.detector_config.run_detector_mode)
    detection, next_state = _detect_frame_for_run(
        frame.array,
        run_measurement,
        frame_index=frame_index,
        stability_state=state,
        generate_diagnostics=initial_run_diagnostics_enabled(measurement),
        collect_temporal_artifacts=measurement.detector_config.temporal_stabilization_enabled,
    )
    suspicion = analyze_detection_suspicion(detection, measurement, policy_state)
    policy_state = suspicion.next_state
    if should_rerun_with_enhanced(detection, measurement, analysis=suspicion.analysis):
        enhanced_measurement = measurement_for_detector_mode(measurement, "enhanced")
        detection, next_state = _detect_frame_for_run(
            frame.array,
            enhanced_measurement,
            frame_index=frame_index,
            stability_state=state,
            generate_diagnostics=enhanced_rerun_diagnostics_enabled(measurement),
            collect_temporal_artifacts=measurement.detector_config.temporal_stabilization_enabled,
        )
        detection = annotate_run_detection(
            detection,
            measurement=measurement,
            analysis=suspicion.analysis,
            enhanced_rerun_used=True,
            enhanced_rerun_reason=enhanced_rerun_reasons(suspicion.analysis, measurement),
        )
    else:
        detection = annotate_run_detection(
            detection,
            measurement=measurement,
            analysis=suspicion.analysis,
            enhanced_rerun_used=False,
        )
    detection = _attach_temperature(detection, frame_timestamp_ms, synced)
    frame_record = FrameRecord(
        frame_index=frame_index,
        frame_path=str(frame_meta.get("npy", frame.frame_path.name)),
        timestamp_ms=frame_timestamp_ms,
        shape=list(frame.array.shape),
        dtype=str(frame.array.dtype),
        source=str(frame_meta.get("source", "offline_dataset")),
        camera_meta=frame_meta.get("camera_meta", {}) if isinstance(frame_meta.get("camera_meta"), dict) else {},
    )
    temperature_record = TemperatureRecord(
        timestamp_ms=synced.timestamp_ms,
        celsius=synced.celsius,
        source=synced.source,
        sampled_this_frame=synced.sampled_this_frame,
    )
    return frame_record, temperature_record, detection, next_state, policy_state


def _frame_event(
    *,
    run_id: str,
    dataset_id: str,
    frame_count: int,
    frame_limit: int,
    processed_frames: int,
    frame_record: FrameRecord,
    temperature_record: TemperatureRecord,
    detection: DetectionResult,
    curve_points: dict[str, CurvePoint | None],
    afas_preprocessing: dict[str, Any],
    provenance: dict[str, Any],
    region_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = {
        "event": "frame",
        "run_id": run_id,
        "dataset_id": dataset_id,
        "operator_data_source": "offline_dataset",
        "provenance": provenance,
        "frame_index": frame_record.frame_index,
        "frame_count": frame_count,
        "total_frames": frame_limit,
        "processed_frames": processed_frames,
        "frame_url": f"/api/offline-datasets/{dataset_id}/frames/{frame_record.frame_index}.png",
        "frame_record": frame_record.model_dump(mode="json"),
        "temperature_record": temperature_record.model_dump(mode="json"),
        "detection_result": detection.model_dump(mode="json"),
        "curve_points": {
            key: point.model_dump(mode="json") if point is not None else None
            for key, point in curve_points.items()
        },
        "afas_preprocessing": afas_preprocessing,
        "afas_analysis": {"result_status": "pending"},
        "live_point_status": build_live_point_status(
            detection,
            curve_points,
            temperature_distance_point_count=int(afas_preprocessing.get("temperature_distance_point_count", 0) or 0),
        ),
    }
    payload["region_results"] = region_results or [
        {
            "region_id": detection.region_id,
            "region_index": detection.region_index,
            "region_label": detection.region_label,
            "color": detection.region_color,
            "detection_result": detection.model_dump(mode="json"),
            "curve_points": payload["curve_points"],
            "live_point_status": payload["live_point_status"],
            "afas_preprocessing": afas_preprocessing,
        }
    ]
    return payload


def _curve_points_for_run_event(detection: DetectionResult) -> dict[str, CurvePoint | None]:
    display_points = curve_points_for_detection(detection)
    raw_points = curve_points_for_detection(detection, distance_source="raw")
    stabilized_points = curve_points_for_detection(detection, distance_source="stabilized")
    return {
        **display_points,
        "raw_distance_time": raw_points["distance_time"],
        "raw_temperature_distance": raw_points["temperature_distance"],
        "stabilized_distance_time": stabilized_points["distance_time"],
        "stabilized_temperature_distance": stabilized_points["temperature_distance"],
    }


def _live_afas_preprocessing_preview(
    temperature_distance_points: list[CurvePoint],
    *,
    processed_frames: int,
) -> dict[str, Any]:
    if processed_frames < AFAS_PREVIEW_INTERVAL_FRAMES:
        return {
            "preview_status": "deferred_until_complete",
            "point_count": processed_frames,
            "temperature_distance_point_count": len(temperature_distance_points),
            "preview_interval_frames": AFAS_PREVIEW_INTERVAL_FRAMES,
        }
    if processed_frames % AFAS_PREVIEW_INTERVAL_FRAMES != 0 or not temperature_distance_points:
        return {
            "preview_status": "unchanged",
            "point_count": processed_frames,
            "temperature_distance_point_count": len(temperature_distance_points),
            "preview_interval_frames": AFAS_PREVIEW_INTERVAL_FRAMES,
        }

    preprocessing = preprocess_temperature_distance(temperature_distance_points)
    return {
        "preview_status": "updated",
        "point_count": processed_frames,
        "temperature_distance_point_count": len(temperature_distance_points),
        "preview_interval_frames": AFAS_PREVIEW_INTERVAL_FRAMES,
        "schema_version": preprocessing.get("schema_version"),
        "parameters": preprocessing.get("parameters", {}),
        "smoothed": preprocessing.get("smoothed", {}),
        "warnings": preprocessing.get("warnings", []),
    }


def _attach_temperature(
    detection: DetectionResult,
    frame_timestamp_ms: int | None,
    synced: SyncedTemperature,
) -> DetectionResult:
    payload = detection.model_dump()
    payload.update(
        {
            "frame_timestamp_ms": frame_timestamp_ms,
            "temperature_timestamp_ms": synced.timestamp_ms,
            "temperature_celsius": synced.celsius,
            "temperature_delta_ms": synced.delta_ms,
            "temperature_source": synced.source,
            "temperature_sampled_this_frame": synced.sampled_this_frame,
            "temperature_sync_status": synced.status,
        }
    )
    return DetectionResult.model_validate(payload)


def _target_temperature_reached(
    measurement: MeasurementDefinition,
    detection: DetectionResult,
) -> bool:
    target = measurement.detector_config.target_temperature_celsius
    temperature = detection.temperature_celsius
    return target is not None and temperature is not None and float(temperature) >= float(target)


def _temporal_mask_artifact_dir(measurement: MeasurementDefinition, run_dir: Path) -> Path | None:
    return run_dir / "temporal_masks" if measurement.detector_config.save_temporal_masks else None


def _run_stage_event(
    *,
    run_id: str,
    event: str,
    dataset_id: str,
    processed_frames: int,
    frame_count: int,
    frame_limit: int,
    stop_reason: str,
) -> dict[str, Any]:
    return {
        "event": event,
        "run_id": run_id,
        "dataset_id": dataset_id,
        "operator_data_source": "offline_dataset",
        "processed_frames": processed_frames,
        "frame_count": frame_count,
        "total_frames": frame_limit,
        "stop_reason": stop_reason,
    }


def _frame_meta(manifest: dict[str, Any], frame_index: int) -> dict[str, Any]:
    frames = manifest.get("frames")
    if isinstance(frames, list):
        for frame in frames:
            if isinstance(frame, dict) and int(frame.get("index", -1)) == frame_index:
                return frame
    return {}


def _int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def _new_run_id(dataset_id: str) -> str:
    safe_dataset = re.sub(r"[^A-Za-z0-9_.-]+", "-", dataset_id).strip("-")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"run-{safe_dataset}-{stamp}"


def _run_temporal_filter_mode(detection_results: list[DetectionResult]) -> str:
    for result in detection_results:
        mode = result.debug_artifacts.get("temporal_filter_mode")
        if isinstance(mode, str):
            return mode
    return "disabled"


def _detect_frame_for_run(
    frame,  # noqa: ANN001
    measurement: MeasurementDefinition,
    *,
    frame_index: int,
    stability_state: CandidateSelectionState,
    generate_diagnostics: bool,
    collect_temporal_artifacts: bool,
):
    kwargs: dict[str, Any] = {
        "frame_index": frame_index,
        "stability_state": stability_state,
        "generate_diagnostics": generate_diagnostics,
    }
    if collect_temporal_artifacts:
        kwargs["collect_temporal_artifacts"] = True
    return detect_frame_with_state(frame, measurement, **kwargs)
