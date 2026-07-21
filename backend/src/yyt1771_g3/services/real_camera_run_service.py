from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from yyt1771_g3.camera.base import CameraSource
from yyt1771_g3.camera.simulated_source import development_fake_hardware_requested
from yyt1771_g3.core.enums import TemperatureSyncStatus
from yyt1771_g3.core.image_io import save_preview_png
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
from yyt1771_g3.core.run_models_v2 import RunStage, RunStateValue
from yyt1771_g3.services.afas_analysis import preprocess_temperature_distance
from yyt1771_g3.services.analysis_service import (
    build_analysis_result,
    build_analysis_result_from_regions,
    build_region_analysis_result,
    curve_points_for_detection,
    detection_results_by_region,
)
from yyt1771_g3.services.distance_outlier_filter import CausalDistanceOutlierFilter
from yyt1771_g3.services.live_point_status import build_live_point_status
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
from yyt1771_g3.services.source_provenance import camera_runtime_provenance
from yyt1771_g3.services.run_control_service import run_controls
from yyt1771_g3.services.run_v2_service import (
    build_v2_analysis_summary,
    compact_detection_for_analysis,
    initialize_v2_run,
    update_v2_run_state,
)
from yyt1771_g3.storage.run_results_db import RunResultsDatabase
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.base import TemperatureController, TemperatureReading
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState
from yyt1771_g3.vision.temporal_stabilization import CausalTemporalStabilizer


AFAS_PREVIEW_INTERVAL_FRAMES = 300
REAL_CAMERA_DEFAULT_TEMP_SYNC_TARGET_MS = 1000.0


@dataclass(frozen=True)
class RealCameraRunResult:
    manifest: RunManifest
    analysis: AnalysisResult


def run_real_camera(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None = None,
    measurement: MeasurementDefinition,
    max_frames: int | None = None,
    target_fps: float | None = None,
    camera_profile: dict[str, Any] | None = None,
    temp_sync_target_ms: float = REAL_CAMERA_DEFAULT_TEMP_SYNC_TARGET_MS,
    temperature_backend: str = "",
    save_raw_frames: bool = False,
    save_preview_frames: bool = True,
    preview_max_width: int = 1200,
) -> RealCameraRunResult:
    try:
        return _run_real_camera_impl(
            run_store,
            camera_source=camera_source,
            temperature_controller=temperature_controller,
            measurement=measurement,
            max_frames=max_frames,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
        )
    finally:
        try:
            _stop_temperature_controller(temperature_controller)
        finally:
            camera_source.close()


def _run_real_camera_impl(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None = None,
    measurement: MeasurementDefinition,
    max_frames: int | None = None,
    target_fps: float | None = None,
    camera_profile: dict[str, Any] | None = None,
    temp_sync_target_ms: float = REAL_CAMERA_DEFAULT_TEMP_SYNC_TARGET_MS,
    temperature_backend: str = "",
    save_raw_frames: bool = False,
    save_preview_frames: bool = True,
    preview_max_width: int = 1200,
) -> RealCameraRunResult:
    if len(measurement.enabled_regions) > 1:
        return _run_real_camera_multi(
            run_store,
            camera_source=camera_source,
            temperature_controller=temperature_controller,
            measurement=measurement,
            max_frames=max_frames,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
        )
    frame_limit = _bounded_frame_limit(max_frames, measurement)
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames" if save_raw_frames else None
    if raw_dir is not None:
        raw_dir.mkdir(parents=True, exist_ok=True)
    preview_dir = run_dir / "preview_frames" if save_preview_frames else None
    if preview_dir is not None:
        preview_dir.mkdir(parents=True, exist_ok=True)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()
    temporal_stabilizer = CausalTemporalStabilizer(
        measurement,
        artifact_dir=_temporal_mask_artifact_dir(measurement, run_dir),
    )
    distance_outlier_filter = CausalDistanceOutlierFilter(measurement.detector_config)

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    stop_reason = "complete"

    temperature_start_error = _prepare_temperature_controller(temperature_controller, measurement)
    for frame_index in range(1, frame_limit + 1):
        frame_record, temperature_record, detection, state, policy_state = _process_real_camera_frame(
            camera_source,
            temperature_controller,
            measurement=measurement,
            raw_dir=raw_dir,
            preview_dir=preview_dir,
            run_dir=run_dir,
            frame_index=frame_index,
            stability_state=state,
            policy_state=policy_state,
            temperature_start_error=temperature_start_error,
            temp_sync_target_ms=temp_sync_target_ms,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
        )
        detection = temporal_stabilizer.apply(detection)
        detection = distance_outlier_filter.apply(detection)
        frame_records.append(frame_record)
        temperature_records.append(temperature_record)
        detection_results.append(detection)
        if _target_temperature_reached(measurement, detection):
            stop_reason = "target_temperature_reached"
            break

    return _save_real_camera_run_result(
        run_store,
        run_id=run_id,
        measurement=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        max_frames=frame_limit,
        target_fps=target_fps,
        camera_profile=camera_profile,
        temp_sync_target_ms=temp_sync_target_ms,
        temperature_backend=temperature_backend,
        save_raw_frames=save_raw_frames,
        save_preview_frames=save_preview_frames,
        preview_max_width=preview_max_width,
        stop_reason=stop_reason,
    )


def iter_real_camera_run_events(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None = None,
    measurement: MeasurementDefinition,
    max_frames: int | None = None,
    target_fps: float | None = None,
    camera_profile: dict[str, Any] | None = None,
    temp_sync_target_ms: float = REAL_CAMERA_DEFAULT_TEMP_SYNC_TARGET_MS,
    temperature_backend: str = "",
    save_raw_frames: bool = False,
    save_preview_frames: bool = True,
    preview_max_width: int = 1200,
    stop_requested: Callable[[str], bool] | None = None,
    compact_stream: bool = False,
) -> Iterator[dict[str, Any]]:
    try:
        yield from _iter_real_camera_run_events_impl(
            run_store,
            camera_source=camera_source,
            temperature_controller=temperature_controller,
            measurement=measurement,
            max_frames=max_frames,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
            stop_requested=stop_requested,
            compact_stream=compact_stream,
        )
    finally:
        try:
            _stop_temperature_controller(temperature_controller)
        finally:
            camera_source.close()


def _iter_real_camera_run_events_impl(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None = None,
    measurement: MeasurementDefinition,
    max_frames: int | None = None,
    target_fps: float | None = None,
    camera_profile: dict[str, Any] | None = None,
    temp_sync_target_ms: float = REAL_CAMERA_DEFAULT_TEMP_SYNC_TARGET_MS,
    temperature_backend: str = "",
    save_raw_frames: bool = False,
    save_preview_frames: bool = True,
    preview_max_width: int = 1200,
    stop_requested: Callable[[str], bool] | None = None,
    compact_stream: bool = False,
) -> Iterator[dict[str, Any]]:
    if len(measurement.enabled_regions) > 1 or compact_stream:
        yield from _iter_real_camera_run_events_multi(
            run_store,
            camera_source=camera_source,
            temperature_controller=temperature_controller,
            measurement=measurement,
            max_frames=max_frames,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
            stop_requested=stop_requested,
            compact_stream=compact_stream,
        )
        return
    frame_limit = _unbounded_frame_limit(max_frames)
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames" if save_raw_frames else None
    if raw_dir is not None:
        raw_dir.mkdir(parents=True, exist_ok=True)
    preview_dir = run_dir / "preview_frames" if save_preview_frames else None
    if preview_dir is not None:
        preview_dir.mkdir(parents=True, exist_ok=True)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()
    temporal_stabilizer = CausalTemporalStabilizer(
        measurement,
        artifact_dir=_temporal_mask_artifact_dir(measurement, run_dir),
    )
    distance_outlier_filter = CausalDistanceOutlierFilter(measurement.detector_config)

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    temperature_distance_points: list[CurvePoint] = []
    saved_result: RealCameraRunResult | None = None
    stop_reason = "manual_stop_or_stream_closed"

    temperature_start_error = ""
    try:
        temperature_start_error = _prepare_temperature_controller(temperature_controller, measurement)
        frame_index = 1
        while frame_limit is None or frame_index <= frame_limit:
            frame_record, temperature_record, detection, state, policy_state = _process_real_camera_frame(
                camera_source,
                temperature_controller,
                measurement=measurement,
                raw_dir=raw_dir,
                preview_dir=preview_dir,
                run_dir=run_dir,
                frame_index=frame_index,
                stability_state=state,
                policy_state=policy_state,
                temperature_start_error=temperature_start_error,
                temp_sync_target_ms=temp_sync_target_ms,
                save_raw_frames=save_raw_frames,
                save_preview_frames=save_preview_frames,
                preview_max_width=preview_max_width,
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
                frame_limit=frame_limit,
                processed_frames=len(frame_records),
                frame_record=frame_record,
                temperature_record=temperature_record,
                detection=detection,
                curve_points=curve_points,
                afas_preprocessing=_live_afas_preprocessing_preview(
                    temperature_distance_points,
                    processed_frames=len(frame_records),
                ),
                temp_sync_target_ms=temp_sync_target_ms,
                temperature_backend=temperature_backend,
                save_raw_frames=save_raw_frames,
                save_preview_frames=save_preview_frames,
            )
            if stop_requested is not None and stop_requested(run_id):
                stop_reason = "manual_stop_requested"
                break
            if _target_temperature_reached(measurement, detection):
                stop_reason = "target_temperature_reached"
                break
            frame_index += 1

        final_stop_reason = stop_reason if stop_reason in {"manual_stop_requested", "target_temperature_reached"} else "complete"
        yield _run_stage_event(
            run_id=run_id,
            event="stopping",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        manifest = _build_real_camera_run_manifest(
            run_id=run_id,
            measurement=measurement,
            frame_records=frame_records,
            temperature_records=temperature_records,
            detection_results=detection_results,
            max_frames=frame_limit,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
            stop_reason=final_stop_reason,
        )
        yield _run_stage_event(
            run_id=run_id,
            event="saving_manifest",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        run_store.write_run_manifest(manifest)
        yield _run_stage_event(
            run_id=run_id,
            event="building_analysis",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        detections_by_region = detection_results_by_region(manifest)
        region_analyses = []
        enabled_regions = manifest.measurement_definition.enabled_regions
        for current, region in enumerate(enabled_regions, start=1):
            yield {
                "event": "analyzing_region",
                "run_id": run_id,
                "dataset_id": "real_camera",
                "operator_data_source": "real_camera",
                "processed_frames": len(frame_records),
                "frame_count": frame_limit or 0,
                "total_frames": frame_limit or 0,
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
                "dataset_id": "real_camera",
                "operator_data_source": "real_camera",
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
        saved_result = RealCameraRunResult(manifest=manifest, analysis=analysis)
        yield {
            "event": "complete",
            "run_manifest": saved_result.manifest.model_dump(mode="json"),
            "analysis_result": saved_result.analysis.model_dump(mode="json"),
        }
    finally:
        if saved_result is None and frame_records:
            _save_real_camera_run_result(
                run_store,
                run_id=run_id,
                measurement=measurement,
                frame_records=frame_records,
                temperature_records=temperature_records,
                detection_results=detection_results,
                max_frames=frame_limit,
                target_fps=target_fps,
                camera_profile=camera_profile,
                temp_sync_target_ms=temp_sync_target_ms,
                temperature_backend=temperature_backend,
                save_raw_frames=save_raw_frames,
                save_preview_frames=save_preview_frames,
                preview_max_width=preview_max_width,
                stop_reason=stop_reason,
            )


def _run_real_camera_multi(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None,
    measurement: MeasurementDefinition,
    max_frames: int | None,
    target_fps: float | None,
    camera_profile: dict[str, Any] | None,
    temp_sync_target_ms: float,
    temperature_backend: str,
    save_raw_frames: bool,
    save_preview_frames: bool,
    preview_max_width: int,
) -> RealCameraRunResult:
    frame_limit = _bounded_frame_limit(max_frames, measurement)
    for event in _iter_real_camera_run_events_multi(
        run_store,
        camera_source=camera_source,
        temperature_controller=temperature_controller,
        measurement=measurement,
        max_frames=frame_limit,
        target_fps=target_fps,
        camera_profile=camera_profile,
        temp_sync_target_ms=temp_sync_target_ms,
        temperature_backend=temperature_backend,
        save_raw_frames=save_raw_frames,
        save_preview_frames=save_preview_frames,
        preview_max_width=preview_max_width,
        stop_requested=None,
    ):
        if event.get("event") == "complete":
            return RealCameraRunResult(
                manifest=RunManifest.model_validate(event["run_manifest"]),
                analysis=AnalysisResult.model_validate(event["analysis_result"]),
            )
    raise RuntimeError("multi-region real camera run ended without a complete event")


def _iter_real_camera_run_events_multi(
    run_store: RunStore,
    *,
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None,
    measurement: MeasurementDefinition,
    max_frames: int | None,
    target_fps: float | None,
    camera_profile: dict[str, Any] | None,
    temp_sync_target_ms: float,
    temperature_backend: str,
    save_raw_frames: bool,
    save_preview_frames: bool,
    preview_max_width: int,
    stop_requested: Callable[[str], bool] | None,
    compact_stream: bool = False,
) -> Iterator[dict[str, Any]]:
    frame_limit = _unbounded_frame_limit(max_frames)
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames" if save_raw_frames else None
    if raw_dir is not None:
        raw_dir.mkdir(parents=True, exist_ok=True)
    preview_dir = run_dir / "preview_frames" if save_preview_frames else None
    if preview_dir is not None:
        preview_dir.mkdir(parents=True, exist_ok=True)
    runtime_state = create_region_runtime_state(
        measurement,
        temporal_artifact_root=_temporal_mask_artifact_dir(measurement, run_dir),
    )
    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    region_detection_results: list[DetectionResult] = []
    saved_result: RealCameraRunResult | None = None
    saved_v2 = False
    stop_reason = "manual_stop_or_stream_closed"
    temperature_start_error = ""
    pending_frames: list[FrameRecord] = []
    pending_temperatures: list[TemperatureRecord] = []
    pending_region_results: list[DetectionResult] = []
    if compact_stream:
        runtime_metadata = run_runtime_metadata(
            default_runtime_source="real_hardware",
            legacy_operator_data_source="real_camera",
        )
        provenance = camera_runtime_provenance(
            camera_profile=camera_profile or {},
            temperature_backend=temperature_backend,
            development_fake_hardware=development_fake_hardware_requested(camera_profile or {}),
        )
        initialize_v2_run(
            run_store,
            run_id=run_id,
            dataset_id="real_camera",
            measurement=measurement,
            runtime_source=runtime_metadata["runtime_source"],
            product_mode=runtime_metadata["product_mode"],
            operator_data_source=runtime_metadata["operator_data_source"],
            provenance=provenance,
            config_snapshot={
                "mode": "real_camera_run",
                "max_frames": frame_limit,
                "target_fps": target_fps,
                "camera_profile": camera_profile or {},
                "save_raw_frames": save_raw_frames,
                "save_preview_frames": save_preview_frames,
            },
            software={"package": "yyt1771_g3", "phase": "G3-P0094-v2"},
        )
        run_controls.register(run_id)

    try:
        temperature_start_error = _prepare_temperature_controller(temperature_controller, measurement)
        frame_index = 1
        while frame_limit is None or frame_index <= frame_limit:
            if compact_stream and run_controls.should_stop(run_id):
                stop_reason = "manual_stop_requested"
                break
            frame = camera_source.preview_frame()
            temperature = _read_temperature(temperature_controller, startup_error=temperature_start_error)
            raw_frame_path: Path | None = None
            if save_raw_frames and raw_dir is not None:
                raw_frame_path = raw_dir / f"frame_{frame_index:06d}.npy"
                np.save(raw_frame_path, frame.array, allow_pickle=False)
            preview_path: Path | None = None
            if save_preview_frames and preview_dir is not None:
                preview_path = preview_dir / "latest.png"
                save_preview_png(frame.array, preview_path, max_width=preview_max_width)
            frame_record = FrameRecord(
                frame_index=frame_index,
                shape=list(frame.array.shape),
                dtype=str(frame.array.dtype),
                source=str(frame.camera_meta.get("backend", "real_camera")),
                frame_path=raw_frame_path.relative_to(run_dir).as_posix() if raw_frame_path is not None else "",
                raw_frame_saved=raw_frame_path is not None,
                preview_path=preview_path.relative_to(run_dir).as_posix() if preview_path is not None else "",
                timestamp_ms=frame.timestamp_ms,
                camera_meta=frame.camera_meta,
            )
            temperature_record = _temperature_record(temperature)
            region_results, runtime_state = detect_regions_for_run_frame(
                frame.array,
                measurement,
                frame_index=frame_index,
                detector=_detect_frame_for_run,
                runtime_state=runtime_state,
                detection_transform=lambda detection: _attach_temperature(
                    detection,
                    frame.timestamp_ms,
                    temperature,
                    temp_sync_target_ms,
                ),
            )
            first = region_results[0]
            frame_records.append(frame_record)
            temperature_records.append(temperature_record)
            stored_region_detections = [
                compact_detection_for_analysis(item.detection) if compact_stream else item.detection
                for item in region_results
            ]
            detection_results.append(stored_region_detections[0])
            region_detection_results.extend(stored_region_detections)
            if compact_stream:
                pending_frames.append(frame_record)
                pending_temperatures.append(temperature_record)
                pending_region_results.extend(item.detection for item in region_results)
                if len(pending_frames) >= 50:
                    with RunResultsDatabase(run_store.results_database_path(run_id)) as database:
                        database.append_batch(pending_frames, pending_temperatures, pending_region_results)
                    pending_frames.clear()
                    pending_temperatures.clear()
                    pending_region_results.clear()
                    update_v2_run_state(run_store, run_id, processed_frames=len(frame_records))
            first_preview = _live_afas_preprocessing_preview(
                runtime_state.temperature_distance_points[first.region.region_id],
                processed_frames=len(frame_records),
            )
            yield _frame_event(
                run_id=run_id,
                frame_limit=frame_limit,
                processed_frames=len(frame_records),
                frame_record=frame_record,
                temperature_record=temperature_record,
                detection=first.detection,
                curve_points=first.curve_points,
                afas_preprocessing=first_preview,
                temp_sync_target_ms=temp_sync_target_ms,
                temperature_backend=temperature_backend,
                save_raw_frames=save_raw_frames,
                save_preview_frames=save_preview_frames,
                region_results=_real_region_event_payloads(
                    region_results,
                    runtime_state.temperature_distance_points,
                    processed_frames=len(frame_records),
                ),
            )
            if stop_requested is not None and stop_requested(run_id):
                stop_reason = "manual_stop_requested"
                break
            if _target_temperature_reached(measurement, first.detection):
                stop_reason = "target_temperature_reached"
                break
            frame_index += 1

        final_stop_reason = stop_reason if stop_reason in {"manual_stop_requested", "target_temperature_reached"} else "complete"
        if compact_stream:
            if pending_frames:
                with RunResultsDatabase(run_store.results_database_path(run_id)) as database:
                    database.append_batch(pending_frames, pending_temperatures, pending_region_results)
                pending_frames.clear()
                pending_temperatures.clear()
                pending_region_results.clear()
            update_v2_run_state(
                run_store,
                run_id,
                state=RunStateValue.FINALIZING,
                stage=RunStage.BUILDING_ANALYSIS,
                processed_frames=len(frame_records),
                stop_reason=final_stop_reason,
            )
            yield _run_stage_event(
                run_id=run_id,
                event="building_analysis",
                processed_frames=len(frame_records),
                frame_count=frame_limit,
                stop_reason=final_stop_reason,
            )
            grouped = {region.region_id: [] for region in measurement.enabled_regions}
            for detection in region_detection_results:
                grouped[detection.region_id].append(detection)
            region_analyses = []
            latest_results: dict[str, DetectionResult] = {}
            for current, region in enumerate(measurement.enabled_regions, start=1):
                detections = grouped.get(region.region_id, [])
                yield {
                    "event": "analyzing_region", "run_id": run_id, "dataset_id": "real_camera",
                    "operator_data_source": "real_camera", "processed_frames": len(frame_records),
                    "frame_count": frame_limit or 0, "total_frames": frame_limit or 0,
                    "current": current, "total": len(measurement.enabled_regions),
                    "region_id": region.region_id, "region_index": region.index,
                    "region_label": region.label, "color": region.color,
                }
                region_analysis = build_region_analysis_result(region, detections)
                region_analyses.append(region_analysis)
                if detections:
                    latest_results[region.region_id] = detections[-1]
                yield {
                    "event": "analysis_region_complete", "run_id": run_id,
                    "dataset_id": "real_camera", "operator_data_source": "real_camera",
                    "current": current, "total": len(measurement.enabled_regions),
                    "region_id": region.region_id, "region_index": region.index,
                    "region_label": region.label, "color": region.color,
                    "summary": region_analysis.summary,
                    "afas_status": region_analysis.afas_analysis.get("result_status", "unavailable"),
                }
            update_v2_run_state(run_store, run_id, stage=RunStage.WRITING_SUMMARY)
            summary = build_v2_analysis_summary(
                run_store, run_id=run_id, region_analyses=region_analyses, latest_results=latest_results
            )
            run_store.write_analysis_summary(summary)
            update_v2_run_state(
                run_store, run_id, state=RunStateValue.READY, stage=RunStage.READY,
                processed_frames=len(frame_records), stop_reason=final_stop_reason,
            )
            saved_v2 = True
            yield {"event": "complete", "run_id": run_id, "state": "READY"}
            return
        yield _run_stage_event(
            run_id=run_id,
            event="stopping",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        manifest = _build_real_camera_run_manifest(
            run_id=run_id,
            measurement=measurement,
            frame_records=frame_records,
            temperature_records=temperature_records,
            detection_results=detection_results,
            region_detection_results=region_detection_results,
            max_frames=frame_limit,
            target_fps=target_fps,
            camera_profile=camera_profile,
            temp_sync_target_ms=temp_sync_target_ms,
            temperature_backend=temperature_backend,
            save_raw_frames=save_raw_frames,
            save_preview_frames=save_preview_frames,
            preview_max_width=preview_max_width,
            stop_reason=final_stop_reason,
        )
        yield _run_stage_event(
            run_id=run_id,
            event="saving_manifest",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        run_store.write_run_manifest(manifest)
        yield _run_stage_event(
            run_id=run_id,
            event="building_analysis",
            processed_frames=len(frame_records),
            frame_count=frame_limit,
            stop_reason=final_stop_reason,
        )
        detections_by_region = detection_results_by_region(manifest)
        region_analyses = []
        enabled_regions = manifest.measurement_definition.enabled_regions
        for current, region in enumerate(enabled_regions, start=1):
            yield {
                "event": "analyzing_region",
                "run_id": run_id,
                "dataset_id": "real_camera",
                "operator_data_source": "real_camera",
                "processed_frames": len(frame_records),
                "frame_count": frame_limit or 0,
                "total_frames": frame_limit or 0,
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
                "dataset_id": "real_camera",
                "operator_data_source": "real_camera",
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
        saved_result = RealCameraRunResult(manifest=manifest, analysis=analysis)
        yield {
            "event": "complete",
            "run_manifest": manifest.model_dump(mode="json"),
            "analysis_result": analysis.model_dump(mode="json"),
        }
    finally:
        if compact_stream:
            run_controls.release(run_id)
            if not saved_v2 and frame_records:
                try:
                    if pending_frames:
                        with RunResultsDatabase(run_store.results_database_path(run_id)) as database:
                            database.append_batch(pending_frames, pending_temperatures, pending_region_results)
                    grouped = {region.region_id: [] for region in measurement.enabled_regions}
                    for detection in region_detection_results:
                        grouped[detection.region_id].append(detection)
                    region_analyses = [
                        build_region_analysis_result(region, grouped.get(region.region_id, []))
                        for region in measurement.enabled_regions
                    ]
                    summary = build_v2_analysis_summary(
                        run_store,
                        run_id=run_id,
                        region_analyses=region_analyses,
                        latest_results={key: values[-1] for key, values in grouped.items() if values},
                    )
                    run_store.write_analysis_summary(summary)
                    update_v2_run_state(
                        run_store, run_id, state=RunStateValue.READY, stage=RunStage.READY,
                        processed_frames=len(frame_records), stop_reason="stream_closed",
                    )
                except Exception as exc:
                    update_v2_run_state(
                        run_store, run_id, state=RunStateValue.ERROR, stage=RunStage.ERROR,
                        processed_frames=len(frame_records), stop_reason="stream_closed", error=str(exc),
                    )
        elif saved_result is None and frame_records:
            _save_real_camera_run_result(
                run_store,
                run_id=run_id,
                measurement=measurement,
                frame_records=frame_records,
                temperature_records=temperature_records,
                detection_results=detection_results,
                region_detection_results=region_detection_results,
                max_frames=frame_limit,
                target_fps=target_fps,
                camera_profile=camera_profile,
                temp_sync_target_ms=temp_sync_target_ms,
                temperature_backend=temperature_backend,
                save_raw_frames=save_raw_frames,
                save_preview_frames=save_preview_frames,
                preview_max_width=preview_max_width,
                stop_reason=stop_reason,
            )


def _real_region_event_payloads(
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


def _save_real_camera_run_result(
    run_store: RunStore,
    *,
    run_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    region_detection_results: list[DetectionResult] | None = None,
    max_frames: int | None,
    target_fps: float | None,
    camera_profile: dict[str, Any] | None,
    temp_sync_target_ms: float,
    temperature_backend: str,
    save_raw_frames: bool,
    save_preview_frames: bool,
    preview_max_width: int,
    stop_reason: str,
) -> RealCameraRunResult:
    manifest = _build_real_camera_run_manifest(
        run_id=run_id,
        measurement=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        region_detection_results=region_detection_results,
        max_frames=max_frames,
        target_fps=target_fps,
        camera_profile=camera_profile,
        temp_sync_target_ms=temp_sync_target_ms,
        temperature_backend=temperature_backend,
        save_raw_frames=save_raw_frames,
        save_preview_frames=save_preview_frames,
        preview_max_width=preview_max_width,
        stop_reason=stop_reason,
    )
    analysis = build_analysis_result(manifest)
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return RealCameraRunResult(manifest=manifest, analysis=analysis)


def _build_real_camera_run_manifest(
    *,
    run_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    region_detection_results: list[DetectionResult] | None = None,
    max_frames: int | None,
    target_fps: float | None,
    camera_profile: dict[str, Any] | None,
    temp_sync_target_ms: float,
    temperature_backend: str,
    save_raw_frames: bool,
    save_preview_frames: bool,
    preview_max_width: int,
    stop_reason: str,
) -> RunManifest:
    first_frame = frame_records[0] if frame_records else None
    first_temperature = temperature_records[0] if temperature_records else None
    provenance = camera_runtime_provenance(
        camera_profile=camera_profile,
        camera_meta=first_frame.camera_meta if first_frame is not None else None,
        temperature_backend=temperature_backend,
        temperature_source=first_temperature.source if first_temperature is not None else "",
    )
    runtime_metadata = run_runtime_metadata(
        default_runtime_source="real_hardware",
        legacy_operator_data_source="real_camera",
    )
    manifest = RunManifest(
        run_id=run_id,
        dataset_id="real_camera",
        measurement_definition=measurement,
        runtime_source=runtime_metadata["runtime_source"],
        product_mode=runtime_metadata["product_mode"],
        operator_data_source=runtime_metadata["operator_data_source"],
        provenance=provenance,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        region_detection_results=region_detection_results or detection_results,
        config_snapshot={
            "mode": "real_camera_run",
            "runtime_source": runtime_metadata["runtime_source"],
            "product_mode": runtime_metadata["product_mode"],
            "operator_data_source": runtime_metadata["operator_data_source"],
            "provenance": provenance,
            "detector_mode": measurement.detector_mode,
            "contrast_threshold": measurement.detector_config.contrast_threshold,
            "max_frames": max_frames,
            "processed_frames": len(frame_records),
            "stop_reason": stop_reason,
            "target_fps": target_fps or measurement.detector_config.live_offline_fps,
            "camera_profile": camera_profile or {},
            "temperature_backend": temperature_backend or (temperature_records[-1].source if temperature_records else ""),
            "target_temperature_celsius": measurement.detector_config.target_temperature_celsius,
            "temperature_power_percent": measurement.detector_config.temperature_power_percent,
            "temp_sync_target_ms": temp_sync_target_ms,
            "save_raw_frames": save_raw_frames,
            "save_preview_frames": save_preview_frames,
            "preview_max_width": preview_max_width,
            "raw_frame_count": sum(1 for record in frame_records if record.raw_frame_saved),
            "preview_frame_mode": "latest_overwrite" if save_preview_frames else "disabled",
            "temporal_stabilization_enabled": measurement.detector_config.temporal_stabilization_enabled,
            "temporal_stabilization_strength": measurement.detector_config.temporal_stabilization_strength,
            "save_temporal_masks": measurement.detector_config.save_temporal_masks,
            "temporal_filter_mode": _run_temporal_filter_mode(detection_results),
            "distance_outlier_filter_enabled": measurement.detector_config.distance_outlier_filter_enabled,
            "distance_outlier_reference_count": measurement.detector_config.distance_outlier_reference_count,
            "distance_outlier_max_jump_px": measurement.detector_config.distance_outlier_max_jump_px,
            "distance_outlier_baseline": measurement.detector_config.distance_outlier_baseline,
        },
        software={"package": "yyt1771_g3", "phase": "G3-M8"},
    )
    return manifest


def _bounded_frame_limit(max_frames: int | None, measurement: MeasurementDefinition) -> int:
    requested_frames = max_frames or measurement.detector_config.max_frames_per_run
    return max(1, min(requested_frames, measurement.detector_config.max_frames_per_run))


def _unbounded_frame_limit(max_frames: int | None) -> int | None:
    if max_frames is None:
        return None
    return max(1, int(max_frames))


def _process_real_camera_frame(
    camera_source: CameraSource,
    temperature_controller: TemperatureController | None,
    *,
    measurement: MeasurementDefinition,
    raw_dir: Path | None,
    preview_dir: Path | None,
    run_dir: Path,
    frame_index: int,
    stability_state: CandidateSelectionState,
    policy_state: RunDetectorPolicyState,
    temperature_start_error: str,
    temp_sync_target_ms: float,
    save_raw_frames: bool,
    save_preview_frames: bool,
    preview_max_width: int,
) -> tuple[FrameRecord, TemperatureRecord, DetectionResult, CandidateSelectionState, RunDetectorPolicyState]:
    frame = camera_source.preview_frame()
    temperature = _read_temperature(temperature_controller, startup_error=temperature_start_error)
    raw_frame_path: Path | None = None
    if save_raw_frames and raw_dir is not None:
        raw_frame_path = raw_dir / f"frame_{frame_index:06d}.npy"
        np.save(raw_frame_path, frame.array, allow_pickle=False)
    preview_path: Path | None = None
    if save_preview_frames and preview_dir is not None:
        preview_path = preview_dir / "latest.png"
        save_preview_png(frame.array, preview_path, max_width=preview_max_width)
    run_measurement = measurement_for_detector_mode(measurement, measurement.detector_config.run_detector_mode)
    previous_state = stability_state
    detection, next_state = _detect_frame_for_run(
        frame.array,
        run_measurement,
        frame_index=frame_index,
        stability_state=previous_state,
        generate_diagnostics=initial_run_diagnostics_enabled(measurement),
        collect_temporal_artifacts=measurement.detector_config.temporal_stabilization_enabled,
    )
    suspicion = analyze_detection_suspicion(detection, measurement, policy_state)
    next_policy_state = suspicion.next_state
    if should_rerun_with_enhanced(detection, measurement, analysis=suspicion.analysis):
        enhanced_measurement = measurement_for_detector_mode(measurement, "enhanced")
        detection, next_state = _detect_frame_for_run(
            frame.array,
            enhanced_measurement,
            frame_index=frame_index,
            stability_state=previous_state,
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
    detection = _attach_temperature(detection, frame.timestamp_ms, temperature, temp_sync_target_ms)
    frame_record = FrameRecord(
        frame_index=frame_index,
        shape=list(frame.array.shape),
        dtype=str(frame.array.dtype),
        source=str(frame.camera_meta.get("backend", "real_camera")),
        frame_path=raw_frame_path.relative_to(run_dir).as_posix() if raw_frame_path is not None else "",
        raw_frame_saved=raw_frame_path is not None,
        preview_path=preview_path.relative_to(run_dir).as_posix() if preview_path is not None else "",
        timestamp_ms=frame.timestamp_ms,
        camera_meta=frame.camera_meta,
    )
    return frame_record, _temperature_record(temperature), detection, next_state, next_policy_state


def _prepare_temperature_controller(
    temperature_controller: TemperatureController | None,
    measurement: MeasurementDefinition,
) -> str:
    if temperature_controller is None:
        return ""
    errors: list[str] = []

    def attempt(label: str, action: Any) -> None:
        if not callable(action):
            return
        try:
            action()
        except Exception as exc:  # pragma: no cover - exercised through integration behavior
            errors.append(f"{label}: {exc}")

    target = measurement.detector_config.target_temperature_celsius
    if target is not None:
        setter = getattr(temperature_controller, "set_target_temperature", None)
        attempt("set_target_temperature", lambda: setter(float(target)) if callable(setter) else None)

    power = measurement.detector_config.temperature_power_percent
    power_setter = getattr(temperature_controller, "set_output_power_percent", None)
    power_percent = float(power)
    attempt("set_output_power_percent", lambda: power_setter(power_percent) if callable(power_setter) else None)

    starter = getattr(temperature_controller, "start_output", None)
    if power_percent > 0 and not _controller_uses_power_as_start(temperature_controller):
        attempt("start_output", starter)
    return "; ".join(errors)


def _controller_uses_power_as_start(temperature_controller: TemperatureController) -> bool:
    config = getattr(temperature_controller, "config", None)
    control = getattr(config, "control", None)
    return getattr(control, "start_output_mode", "") == "power_nonzero"


def _stop_temperature_controller(temperature_controller: TemperatureController | None) -> None:
    if temperature_controller is None:
        return
    try:
        stopper = getattr(temperature_controller, "stop_output", None)
        if callable(stopper):
            try:
                stopper()
            except Exception:
                pass
    finally:
        try:
            temperature_controller.close()
        except Exception:
            pass


def _read_temperature(
    temperature_controller: TemperatureController | None,
    *,
    startup_error: str = "",
) -> TemperatureReading:
    if temperature_controller is None:
        return TemperatureReading(
            timestamp_ms=None,
            celsius=None,
            source="real_camera_run",
            error="temperature adapter not configured",
        )
    if startup_error:
        return TemperatureReading(
            timestamp_ms=None,
            celsius=None,
            source=temperature_controller.__class__.__name__,
            error=startup_error,
        )
    try:
        return temperature_controller.read_temperature()
    except Exception as exc:
        return TemperatureReading(
            timestamp_ms=None,
            celsius=None,
            source=temperature_controller.__class__.__name__,
            error=str(exc),
        )


def _temperature_record(temperature: TemperatureReading) -> TemperatureRecord:
    return TemperatureRecord(
        timestamp_ms=temperature.timestamp_ms,
        celsius=temperature.celsius,
        source=temperature.source,
        sampled_this_frame=temperature.celsius is not None and temperature.timestamp_ms is not None,
        error=temperature.error,
    )


def _attach_temperature(
    detection: DetectionResult,
    frame_timestamp_ms: int | None,
    temperature: TemperatureReading,
    ok_delta_ms: float,
) -> DetectionResult:
    delta_ms = _temperature_delta_ms(frame_timestamp_ms, temperature.timestamp_ms)
    if temperature.celsius is None or temperature.timestamp_ms is None:
        status = TemperatureSyncStatus.TEMP_SYNC_MISSING
    elif delta_ms is not None and delta_ms <= ok_delta_ms:
        status = TemperatureSyncStatus.TEMP_SYNC_OK
    else:
        status = TemperatureSyncStatus.TEMP_SYNC_STALE
    payload = detection.model_dump()
    payload.update(
        {
            "frame_timestamp_ms": frame_timestamp_ms,
            "temperature_timestamp_ms": temperature.timestamp_ms,
            "temperature_celsius": temperature.celsius,
            "temperature_delta_ms": delta_ms,
            "temperature_source": temperature.source,
            "temperature_sampled_this_frame": status == TemperatureSyncStatus.TEMP_SYNC_OK,
            "temperature_sync_status": status,
        }
    )
    return DetectionResult.model_validate(payload)


def _temperature_delta_ms(frame_timestamp_ms: int | None, temperature_timestamp_ms: int | None) -> float | None:
    if frame_timestamp_ms is None or temperature_timestamp_ms is None:
        return None
    return abs(float(frame_timestamp_ms - temperature_timestamp_ms))


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
    processed_frames: int,
    frame_count: int | None,
    stop_reason: str,
) -> dict[str, Any]:
    return {
        "event": event,
        "run_id": run_id,
        "processed_frames": processed_frames,
        "frame_count": frame_count or 0,
        "total_frames": frame_count or 0,
        "stop_reason": stop_reason,
    }


def _frame_event(
    *,
    run_id: str,
    frame_limit: int | None,
    processed_frames: int,
    frame_record: FrameRecord,
    temperature_record: TemperatureRecord,
    detection: DetectionResult,
    curve_points: dict[str, CurvePoint | None],
    afas_preprocessing: dict[str, Any],
    temp_sync_target_ms: float,
    temperature_backend: str,
    save_raw_frames: bool,
    save_preview_frames: bool,
    region_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    frame_url = ""
    if save_preview_frames and frame_record.preview_path:
        frame_url = f"/api/runs/{run_id}/preview/latest.png?frame_index={frame_record.frame_index}"
    elif save_raw_frames and frame_record.raw_frame_saved:
        frame_url = f"/api/runs/{run_id}/raw-frames/{frame_record.frame_index}.png"
    payload = {
        "event": "frame",
        "run_id": run_id,
        "dataset_id": "real_camera",
        "operator_data_source": "real_camera",
        "provenance": camera_runtime_provenance(
            camera_meta=frame_record.camera_meta,
            temperature_backend=temperature_backend,
            temperature_source=temperature_record.source,
        ),
        "frame_index": frame_record.frame_index,
        "frame_count": frame_limit or 0,
        "total_frames": frame_limit or 0,
        "processed_frames": processed_frames,
        "frame_url": frame_url,
        "frame_record": frame_record.model_dump(mode="json"),
        "temperature_record": temperature_record.model_dump(mode="json"),
        "detection_result": detection.model_dump(mode="json"),
        "storage": {
            "save_raw_frames": save_raw_frames,
            "raw_frame_saved": frame_record.raw_frame_saved,
            "save_preview_frames": save_preview_frames,
            "preview_path": frame_record.preview_path,
        },
        "sync_config": {
            "temp_sync_target_ms": temp_sync_target_ms,
        },
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


def _new_run_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"run-real_camera-{re.sub(r'[^A-Za-z0-9_.-]+', '-', stamp)}"


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
