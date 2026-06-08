from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from yyt1771_g3.camera.base import CameraSource
from yyt1771_g3.core.enums import TemperatureSyncStatus
from yyt1771_g3.core.models import (
    AnalysisResult,
    DetectionResult,
    FrameRecord,
    MeasurementDefinition,
    RunManifest,
    TemperatureRecord,
)
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.services.run_detector_policy import (
    annotate_run_detection,
    detection_suspicious_reasons,
    enhanced_rerun_diagnostics_enabled,
    initial_run_diagnostics_enabled,
    measurement_for_detector_mode,
    should_rerun_with_enhanced,
)
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.base import TemperatureController, TemperatureReading
from yyt1771_g3.vision.detectors import detect_frame_with_state
from yyt1771_g3.vision.stability import CandidateSelectionState


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
    requested_frames = max_frames or measurement.detector_config.max_frames_per_run
    frame_limit = max(1, min(requested_frames, measurement.detector_config.max_frames_per_run))
    run_id = _new_run_id()
    run_dir = run_store.run_dir(run_id)
    raw_dir = run_dir / "raw_frames"
    raw_dir.mkdir(parents=True, exist_ok=True)
    state = CandidateSelectionState()

    frame_records: list[FrameRecord] = []
    temperature_records: list[TemperatureRecord] = []
    detection_results: list[DetectionResult] = []

    temperature_start_error = ""
    try:
        temperature_start_error = _prepare_temperature_controller(temperature_controller, measurement)
        for frame_index in range(1, frame_limit + 1):
            frame = camera_source.preview_frame()
            temperature = _read_temperature(temperature_controller, startup_error=temperature_start_error)
            frame_path = raw_dir / f"frame_{frame_index:06d}.npy"
            np.save(frame_path, frame.array, allow_pickle=False)
            run_measurement = measurement_for_detector_mode(measurement, measurement.detector_config.run_detector_mode)
            previous_state = state
            detection, next_state = detect_frame_with_state(
                frame.array,
                run_measurement,
                frame_index=frame_index,
                stability_state=previous_state,
                generate_diagnostics=initial_run_diagnostics_enabled(measurement),
            )
            suspicious_reasons = detection_suspicious_reasons(detection, measurement)
            if should_rerun_with_enhanced(detection, measurement):
                enhanced_measurement = measurement_for_detector_mode(measurement, "enhanced")
                detection, next_state = detect_frame_with_state(
                    frame.array,
                    enhanced_measurement,
                    frame_index=frame_index,
                    stability_state=previous_state,
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
            state = next_state
            detection = _attach_temperature(detection, frame.timestamp_ms, temperature, temp_sync_target_ms)
            frame_records.append(
                FrameRecord(
                    frame_index=frame_index,
                    frame_path=str(frame_path.relative_to(run_dir)),
                    timestamp_ms=frame.timestamp_ms,
                    shape=list(frame.array.shape),
                    dtype=str(frame.array.dtype),
                    source="hik_gige_mvs",
                    camera_meta=frame.camera_meta,
                )
            )
            temperature_records.append(_temperature_record(temperature))
            detection_results.append(detection)
    finally:
        try:
            _stop_temperature_controller(temperature_controller)
        finally:
            camera_source.close()

    manifest = RunManifest(
        run_id=run_id,
        dataset_id="real_camera",
        measurement_definition=measurement,
        frame_records=frame_records,
        temperature_records=temperature_records,
        detection_results=detection_results,
        config_snapshot={
            "mode": "real_camera_run",
            "max_frames": frame_limit,
            "target_fps": target_fps or measurement.detector_config.live_offline_fps,
            "camera_profile": camera_profile or {},
            "temperature_backend": temperature.source if temperature_records else "",
            "target_temperature_celsius": measurement.detector_config.target_temperature_celsius,
            "temperature_power_percent": measurement.detector_config.temperature_power_percent,
            "temp_sync_target_ms": temp_sync_target_ms,
        },
        software={"package": "yyt1771_g3", "phase": "G3-M8"},
    )
    analysis = build_analysis_result(manifest)
    run_store.write_run_manifest(manifest)
    run_store.write_analysis_result(analysis)
    return RealCameraRunResult(manifest=manifest, analysis=analysis)


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
    attempt("set_output_power_percent", lambda: power_setter(float(power)) if callable(power_setter) else None)

    starter = getattr(temperature_controller, "start_output", None)
    attempt("start_output", starter)
    return "; ".join(errors)


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


def _new_run_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"run-real_camera-{re.sub(r'[^A-Za-z0-9_.-]+', '-', stamp)}"
