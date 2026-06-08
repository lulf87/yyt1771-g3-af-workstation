from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
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
from yyt1771_g3.services.afas_analysis import preprocess_temperature_distance
from yyt1771_g3.services.analysis_service import build_analysis_result, curve_points_for_detection
from yyt1771_g3.services.offline_dataset import OfflineDatasetError, OfflineDatasetRegistry
from yyt1771_g3.services.run_detector_policy import (
    annotate_run_detection,
    detection_suspicious_reasons,
    enhanced_rerun_diagnostics_enabled,
    initial_run_diagnostics_enabled,
    is_detection_suspicious,
    measurement_for_detector_mode,
    should_rerun_with_enhanced,
)
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.sync import SyncedTemperature, sync_temperature_for_frame
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState


AFAS_PREVIEW_INTERVAL_FRAMES = 10


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
    resolved = registry.resolve_dataset(dataset_id)
    manifest_payload = registry.load_manifest(dataset_id)
    temperature_rows = registry.load_temperature_csv(dataset_id)
    window = _resolve_frame_window(resolved.frame_count, start_frame, max_frames)
    run_id = _new_run_id(dataset_id)
    state = CandidateSelectionState()

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    stop_reason = "complete"

    for frame_index in range(window.start_frame, window.end_frame + 1):
        frame_record, temperature_record, detection, state = _process_frame(
            registry,
            dataset_id,
            measurement,
            manifest_payload,
            temperature_rows,
            frame_index,
            state,
        )
        frame_records.append(frame_record)
        temperature_records.append(temperature_record)
        detection_results.append(detection)
        if _target_temperature_reached(measurement, detection):
            stop_reason = "target_temperature_reached"
            break

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
    resolved = registry.resolve_dataset(dataset_id)
    manifest_payload = registry.load_manifest(dataset_id)
    temperature_rows = registry.load_temperature_csv(dataset_id)
    window = _resolve_frame_window(resolved.frame_count, start_frame, max_frames)
    run_id = _new_run_id(dataset_id)
    state = CandidateSelectionState()

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    temperature_distance_points: list[CurvePoint] = []
    saved_result: LiveOfflineRunResult | None = None
    stop_reason = "complete"

    try:
        for processed, frame_index in enumerate(range(window.start_frame, window.end_frame + 1), start=1):
            frame_record, temperature_record, detection, state = _process_frame(
                registry,
                dataset_id,
                measurement,
                manifest_payload,
                temperature_rows,
                frame_index,
                state,
            )
            frame_records.append(frame_record)
            temperature_records.append(temperature_record)
            detection_results.append(detection)
            curve_points = curve_points_for_detection(detection)
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
            )
            if _target_temperature_reached(measurement, detection):
                stop_reason = "target_temperature_reached"
                break

        saved_result = _save_run_result(
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
        )
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
            )


def _save_run_result(
    run_store: RunStore,
    *,
    run_id: str,
    dataset_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    start_frame: int,
    frame_limit: int,
    target_fps: float | None,
    stop_reason: str = "complete",
) -> LiveOfflineRunResult:
    manifest = RunManifest(
        run_id=run_id,
        dataset_id=dataset_id,
        measurement_definition=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        config_snapshot={
            "mode": "live_offline_run",
            "start_frame": start_frame,
            "max_frames": frame_limit,
            "processed_frames": len(frame_records),
            "stop_reason": stop_reason,
            "target_temperature_celsius": measurement.detector_config.target_temperature_celsius,
            "temperature_power_percent": measurement.detector_config.temperature_power_percent,
            "target_fps": target_fps or measurement.detector_config.live_offline_fps,
        },
        software={"package": "yyt1771_g3", "phase": "G3-M7"},
    )
    analysis = build_analysis_result(manifest)
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return LiveOfflineRunResult(manifest=manifest, analysis=analysis)


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
) -> tuple[FrameRecord, TemperatureRecord, DetectionResult, CandidateSelectionState]:
    frame = registry.load_frame(dataset_id, frame_index)
    frame_meta = _frame_meta(manifest_payload, frame_index)
    frame_timestamp_ms = _int_or_none(frame_meta.get("timestamp_ms"))
    synced = sync_temperature_for_frame(frame_index, frame_timestamp_ms, temperature_rows)
    run_measurement = measurement_for_detector_mode(measurement, measurement.detector_config.run_detector_mode)
    detection, next_state = detect_frame_with_state(
        frame.array,
        run_measurement,
        frame_index=frame_index,
        stability_state=state,
        generate_diagnostics=initial_run_diagnostics_enabled(measurement),
    )
    suspicious_reasons = detection_suspicious_reasons(detection, measurement)
    if should_rerun_with_enhanced(detection, measurement):
        enhanced_measurement = measurement_for_detector_mode(measurement, "enhanced")
        detection, next_state = detect_frame_with_state(
            frame.array,
            enhanced_measurement,
            frame_index=frame_index,
            stability_state=state,
            generate_diagnostics=enhanced_rerun_diagnostics_enabled(measurement),
        )
        detection = annotate_run_detection(
            detection,
            suspicious_reasons=suspicious_reasons or detection_suspicious_reasons(detection, measurement),
            enhanced_rerun_used=True,
        )
    else:
        detection = annotate_run_detection(
            detection,
            suspicious_reasons=suspicious_reasons,
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
    return frame_record, temperature_record, detection, next_state


def _is_detection_suspicious(
    detection: DetectionResult,
    measurement: MeasurementDefinition,
) -> bool:
    return is_detection_suspicious(detection, measurement)


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
) -> dict[str, Any]:
    return {
        "event": "frame",
        "run_id": run_id,
        "dataset_id": dataset_id,
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
