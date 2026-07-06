from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from yyt1771_g3.camera.base import CameraSource
from yyt1771_g3.core.enums import TemperatureSyncStatus
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
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.base import TemperatureController, TemperatureReading
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState
from yyt1771_g3.vision.temporal_stabilization import CausalTemporalStabilizer


AFAS_PREVIEW_INTERVAL_FRAMES = 10


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
    temp_sync_target_ms: float = 10.0,
) -> RealCameraRunResult:
    frame_limit = _bounded_frame_limit(max_frames, measurement)
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames"
    raw_dir.mkdir(parents=True, exist_ok=True)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()
    temporal_stabilizer = CausalTemporalStabilizer(
        measurement,
        artifact_dir=run_dir / "temporal_masks",
    )

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []
    stop_reason = "complete"

    temperature_start_error = ""
    try:
        temperature_start_error = _prepare_temperature_controller(temperature_controller, measurement)
        for frame_index in range(1, frame_limit + 1):
            frame_record, temperature_record, detection, state, policy_state = _process_real_camera_frame(
                camera_source,
                temperature_controller,
                measurement=measurement,
                raw_dir=raw_dir,
                run_dir=run_dir,
                frame_index=frame_index,
                stability_state=state,
                policy_state=policy_state,
                temperature_start_error=temperature_start_error,
                temp_sync_target_ms=temp_sync_target_ms,
            )
            detection = temporal_stabilizer.apply(detection)
            frame_records.append(frame_record)
            temperature_records.append(temperature_record)
            detection_results.append(detection)
            if _target_temperature_reached(measurement, detection):
                stop_reason = "target_temperature_reached"
                break
    finally:
        try:
            _stop_temperature_controller(temperature_controller)
        finally:
            camera_source.close()

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
    temp_sync_target_ms: float = 10.0,
    stop_requested: Callable[[str], bool] | None = None,
) -> Iterator[dict[str, Any]]:
    frame_limit = _unbounded_frame_limit(max_frames)
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames"
    raw_dir.mkdir(parents=True, exist_ok=True)
    state = CandidateSelectionState()
    policy_state = RunDetectorPolicyState()
    temporal_stabilizer = CausalTemporalStabilizer(
        measurement,
        artifact_dir=run_dir / "temporal_masks",
    )

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
                run_dir=run_dir,
                frame_index=frame_index,
                stability_state=state,
                policy_state=policy_state,
                temperature_start_error=temperature_start_error,
                temp_sync_target_ms=temp_sync_target_ms,
            )
            detection = temporal_stabilizer.apply(detection)
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
            )
            if stop_requested is not None and stop_requested(run_id):
                stop_reason = "manual_stop_requested"
                break
            if _target_temperature_reached(measurement, detection):
                stop_reason = "target_temperature_reached"
                break
            frame_index += 1

        saved_result = _save_real_camera_run_result(
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
            stop_reason=stop_reason
            if stop_reason in {"manual_stop_requested", "target_temperature_reached"}
            else "complete",
        )
        yield {
            "event": "complete",
            "run_manifest": saved_result.manifest.model_dump(mode="json"),
            "analysis_result": saved_result.analysis.model_dump(mode="json"),
        }
    finally:
        try:
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
                    stop_reason=stop_reason,
                )
        finally:
            try:
                _stop_temperature_controller(temperature_controller)
            finally:
                camera_source.close()


def _save_real_camera_run_result(
    run_store: RunStore,
    *,
    run_id: str,
    measurement: MeasurementDefinition,
    frame_records: list[FrameRecord],
    temperature_records: list[TemperatureRecord],
    detection_results: list[DetectionResult],
    max_frames: int | None,
    target_fps: float | None,
    camera_profile: dict[str, Any] | None,
    temp_sync_target_ms: float,
    stop_reason: str,
) -> RealCameraRunResult:
    manifest = RunManifest(
        run_id=run_id,
        dataset_id="real_camera",
        measurement_definition=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        config_snapshot={
            "mode": "real_camera_run",
            "max_frames": max_frames,
            "processed_frames": len(frame_records),
            "stop_reason": stop_reason,
            "target_fps": target_fps or measurement.detector_config.live_offline_fps,
            "camera_profile": camera_profile or {},
            "temperature_backend": temperature_records[-1].source if temperature_records else "",
            "target_temperature_celsius": measurement.detector_config.target_temperature_celsius,
            "temperature_power_percent": measurement.detector_config.temperature_power_percent,
            "temp_sync_target_ms": temp_sync_target_ms,
            "temporal_stabilization_enabled": measurement.detector_config.temporal_stabilization_enabled,
            "temporal_stabilization_strength": measurement.detector_config.temporal_stabilization_strength,
            "temporal_filter_mode": _run_temporal_filter_mode(detection_results),
        },
        software={"package": "yyt1771_g3", "phase": "G3-M8"},
    )
    analysis = build_analysis_result(manifest)
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return RealCameraRunResult(manifest=manifest, analysis=analysis)


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
    raw_dir: Path,
    run_dir: Path,
    frame_index: int,
    stability_state: CandidateSelectionState,
    policy_state: RunDetectorPolicyState,
    temperature_start_error: str,
    temp_sync_target_ms: float,
) -> tuple[FrameRecord, TemperatureRecord, DetectionResult, CandidateSelectionState, RunDetectorPolicyState]:
    frame = camera_source.preview_frame()
    temperature = _read_temperature(temperature_controller, startup_error=temperature_start_error)
    frame_path = raw_dir / f"frame_{frame_index:06d}.npy"
    np.save(frame_path, frame.array, allow_pickle=False)
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
        frame_path=str(frame_path.relative_to(run_dir)),
        timestamp_ms=frame.timestamp_ms,
        shape=list(frame.array.shape),
        dtype=str(frame.array.dtype),
        source=str(frame.camera_meta.get("backend", "real_camera")),
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
) -> dict[str, Any]:
    return {
        "event": "frame",
        "run_id": run_id,
        "dataset_id": "real_camera",
        "frame_index": frame_record.frame_index,
        "frame_count": frame_limit or 0,
        "total_frames": frame_limit or 0,
        "processed_frames": processed_frames,
        "frame_url": f"/api/runs/{run_id}/raw-frames/{frame_record.frame_index}.png",
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
