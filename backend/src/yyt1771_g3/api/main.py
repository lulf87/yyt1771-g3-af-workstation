from __future__ import annotations

import base64
import binascii
import io
import json
import logging
import os
import threading
from contextlib import asynccontextmanager, contextmanager
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from yyt1771_g3.camera.base import CameraFrame, CameraSource, CameraUnavailableError
from yyt1771_g3.camera.factory import HIK_CAMERA_BACKENDS, build_camera_source
from yyt1771_g3.camera.hik_mvs_source import HikMvsCameraSource, get_hik_mvs_sdk_status
from yyt1771_g3.core.hardware_config import HardwareConfig, load_hardware_config
from yyt1771_g3.core.image_io import array_to_png_bytes
from yyt1771_g3.core.enums import MeasurementSource
from yyt1771_g3.core.models import MeasurementDefinition
from yyt1771_g3.services.offline_dataset import (
    DatasetAccessError,
    DatasetNotFoundError,
    LoadedOfflineFrame,
    OfflineDatasetError,
    load_dataset_registry,
)
from yyt1771_g3.services.probe_service import probe_offline_frame, probe_setup_frame
from yyt1771_g3.services.source_provenance import camera_runtime_provenance, operator_source_status
from yyt1771_g3.services.live_offline_run_service import (
    iter_live_offline_run_events,
    read_run,
    run_live_offline_dataset,
)
from yyt1771_g3.services.analysis_service import build_analysis_result
from yyt1771_g3.services.real_camera_run_service import iter_real_camera_run_events, run_real_camera
from yyt1771_g3.services.export_service import export_run, export_run_bundle
from yyt1771_g3.services.import_service import RunExportImportError, import_run_export_bytes
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.lu92xx_modbus import LU92XXModbusRtuController
from yyt1771_g3.temperature.serial_ports import SerialPortInfo, list_serial_ports
from yyt1771_g3.temperature.simulated import SimulatedTemperatureController


@asynccontextmanager
async def _lifespan(app: FastAPI):  # noqa: ANN202, ARG001
    try:
        yield
    finally:
        with _camera_preview_lock:
            _reset_preview_camera_source()


logger = logging.getLogger(__name__)

app = FastAPI(title="YY/T 1771 G3 Backend", version="0.1.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5178",
        "http://localhost:5179",
        "http://127.0.0.1:5179",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_camera_preview_lock = threading.Lock()
_camera_preview_source: CameraSource | None = None
_camera_preview_profile_key: str | None = None
_camera_operation_lock = threading.Lock()
_camera_operation_owner: str | None = None
_real_camera_stream_stop_lock = threading.Lock()
_real_camera_stream_stop_events: dict[str, threading.Event] = {}


def _registry():
    config_path = os.environ.get("YYT1771_G3_OFFLINE_DATASETS_CONFIG")
    return load_dataset_registry(config_path)


def _hardware_config() -> HardwareConfig:
    return load_hardware_config()


def _hardware_config_with_temperature_port(config: HardwareConfig, port: str | None) -> HardwareConfig:
    selected_port = str(port or "").strip()
    if not selected_port:
        return config
    return replace(config, temp=replace(config.temp, serial=replace(config.temp.serial, port=selected_port)))


def _preview_profile_key(profile: dict[str, Any]) -> str:
    return json.dumps(profile, sort_keys=True, default=str)


def _build_camera_source(profile: dict[str, Any] | None = None) -> CameraSource:
    profile = profile or {}
    backend = str(profile.get("backend", "hik_gige_mvs") or "hik_gige_mvs").strip().lower()
    if backend in HIK_CAMERA_BACKENDS:
        return HikMvsCameraSource(profile=profile)
    return build_camera_source(profile)


def _register_real_camera_stream_stop(run_id: str) -> None:
    with _real_camera_stream_stop_lock:
        _real_camera_stream_stop_events.setdefault(run_id, threading.Event())


def _real_camera_stream_stop_requested(run_id: str) -> bool:
    with _real_camera_stream_stop_lock:
        stop_event = _real_camera_stream_stop_events.get(run_id)
    return stop_event.is_set() if stop_event is not None else False


def _request_real_camera_stream_stop(run_id: str) -> bool:
    with _real_camera_stream_stop_lock:
        stop_event = _real_camera_stream_stop_events.get(run_id)
        if stop_event is None:
            return False
        stop_event.set()
    return True


def _clear_real_camera_stream_stop(run_id: str) -> None:
    with _real_camera_stream_stop_lock:
        _real_camera_stream_stop_events.pop(run_id, None)


def _stream_event_run_id(event: dict[str, Any]) -> str | None:
    run_id = event.get("run_id")
    if isinstance(run_id, str) and run_id:
        return run_id
    manifest = event.get("run_manifest")
    if isinstance(manifest, dict):
        manifest_run_id = manifest.get("run_id")
        if isinstance(manifest_run_id, str) and manifest_run_id:
            return manifest_run_id
    return None


def _get_preview_camera_source(camera_profile: dict[str, Any] | None = None) -> CameraSource:
    global _camera_preview_profile_key, _camera_preview_source
    profile = {**_hardware_config().camera.to_profile(), **(camera_profile or {})}
    profile_key = _preview_profile_key(profile)
    if _camera_preview_source is None or _camera_preview_profile_key != profile_key:
        _reset_preview_camera_source()
        _camera_preview_source = _build_camera_source(profile)
        _camera_preview_profile_key = profile_key
    return _camera_preview_source


def _reset_preview_camera_source() -> None:
    global _camera_preview_profile_key, _camera_preview_source
    if _camera_preview_source is not None:
        try:
            _camera_preview_source.close()
        except Exception:
            pass
    _camera_preview_source = None
    _camera_preview_profile_key = None


@contextmanager
def _camera_operation(purpose: str, *, blocking: bool = True, timeout: float | None = None):  # noqa: ANN202
    global _camera_operation_owner
    if timeout is None:
        acquired = _camera_operation_lock.acquire(blocking=blocking)
    else:
        acquired = _camera_operation_lock.acquire(timeout=timeout)
    if not acquired:
        raise HTTPException(
            status_code=409,
            detail={
                "camera_status": "busy",
                "message": f"Real camera is busy with {_camera_operation_owner or 'another operation'}",
                "details": {
                    "active_operation": _camera_operation_owner,
                    "requested_operation": purpose,
                },
            },
        )
    previous_owner = _camera_operation_owner
    _camera_operation_owner = purpose
    try:
        yield
    finally:
        _camera_operation_owner = previous_owner
        _camera_operation_lock.release()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/offline-datasets")
def list_offline_datasets() -> dict[str, list[dict[str, Any]]]:
    try:
        return {"datasets": _registry().list_offline_datasets()}
    except OfflineDatasetError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/offline-datasets/{dataset_id}")
def get_offline_dataset(dataset_id: str) -> dict[str, Any]:
    registry = _registry()
    try:
        datasets = registry.list_offline_datasets()
        dataset = next(item for item in datasets if item["id"] == dataset_id)
        manifest = registry.load_manifest(dataset_id)
        temperatures = registry.load_temperature_csv(dataset_id)
        first_frame = registry.load_first_frame(dataset_id)
        last_frame = registry.load_last_frame(dataset_id)
    except StopIteration as exc:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_id}") from exc
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetAccessError as exc:
        raise HTTPException(
            status_code=503,
            detail={"message": str(exc), "issues": exc.issues},
        ) from exc
    except OfflineDatasetError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    frame_records = manifest.get("frames") if isinstance(manifest.get("frames"), list) else []
    return {
        "dataset": dataset,
        "manifest": {
            "frame_count": manifest.get("frame_count", len(frame_records)),
            "target_fps": manifest.get("target_fps"),
            "achieved_fps": manifest.get("achieved_fps"),
            "started_at_ms": manifest.get("started_at_ms"),
            "camera_profile": manifest.get("camera_profile"),
            "temperature_csv": manifest.get("temperature_csv"),
            "first_frame": frame_records[0] if frame_records else None,
            "last_frame": frame_records[-1] if frame_records else None,
        },
        "temperature": {
            "row_count": len(temperatures),
            "columns": list(temperatures[0].keys()) if temperatures else [],
            "first_row": temperatures[0] if temperatures else None,
            "last_row": temperatures[-1] if temperatures else None,
        },
        "first_frame": _frame_metadata(first_frame),
        "last_frame": _frame_metadata(last_frame),
    }


@app.get("/api/offline-datasets/{dataset_id}/frames/{frame_selector}.png")
def get_offline_dataset_frame_png(
    dataset_id: str,
    frame_selector: str,
    max_width: int | None = None,
) -> Response:
    if max_width is not None and max_width <= 0:
        raise HTTPException(status_code=400, detail="max_width must be a positive integer")
    registry = _registry()
    try:
        if frame_selector == "first":
            frame = registry.load_first_frame(dataset_id)
        elif frame_selector == "last":
            frame = registry.load_last_frame(dataset_id)
        else:
            frame = registry.load_frame(dataset_id, int(frame_selector))
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="frame selector must be first, last, or a 1-based frame index",
        ) from exc
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetAccessError as exc:
        raise HTTPException(
            status_code=503,
            detail={"message": str(exc), "issues": exc.issues},
        ) from exc
    except OfflineDatasetError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(content=_array_to_png(frame.array, max_width=max_width), media_type="image/png")


class ProbeRequest(BaseModel):
    dataset_id: str
    frame_index: int
    measurement_definition: MeasurementDefinition


@app.post("/api/probe")
def probe_current_frame(request: ProbeRequest) -> dict[str, Any]:
    registry = _registry()
    try:
        return probe_offline_frame(
            registry,
            request.dataset_id,
            request.frame_index,
            _measurement_with_source(request.measurement_definition, MeasurementSource.OFFLINE_DATASET),
        )
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetAccessError as exc:
        raise HTTPException(
            status_code=503,
            detail={"message": str(exc), "issues": exc.issues},
        ) from exc
    except OfflineDatasetError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class LiveOfflineRunRequest(BaseModel):
    dataset_id: str
    measurement_definition: MeasurementDefinition
    start_frame: int = 1
    max_frames: int | None = None
    target_fps: float | None = None


class RealCameraRunRequest(BaseModel):
    measurement_definition: MeasurementDefinition
    max_frames: int | None = None
    target_fps: float | None = None
    camera_profile: dict[str, Any] | None = None
    operator_mode: bool = False
    operator_data_source: str | None = None


class RealCameraSetupProbeRequest(BaseModel):
    measurement_definition: MeasurementDefinition
    frame_png_data_url: str | None = None
    frame_timestamp_ms: int | None = None
    camera_meta: dict[str, Any] | None = None
    camera_profile: dict[str, Any] | None = None
    operator_mode: bool = False
    operator_data_source: str | None = None


class AnalysisRecomputeRequest(BaseModel):
    afas_preprocessing_parameters: dict[str, Any] | None = None
    afas_analysis_parameters: dict[str, Any] | None = None


def _run_store() -> RunStore:
    return RunStore()


def _measurement_with_source(
    measurement: MeasurementDefinition,
    source: MeasurementSource,
) -> MeasurementDefinition:
    if measurement.source == source:
        return measurement
    return measurement.model_copy(update={"source": source})


def _operator_source_status_payload(
    config: HardwareConfig,
    *,
    camera_profile: dict[str, Any] | None = None,
    camera_meta: dict[str, Any] | None = None,
    offline_datasets_available: bool | None = None,
    offline_dataset_error: str = "",
) -> dict[str, Any]:
    if offline_datasets_available is None:
        try:
            offline_datasets_available = bool(_registry().list_offline_datasets())
        except OfflineDatasetError as exc:
            offline_datasets_available = False
            offline_dataset_error = str(exc)
    return operator_source_status(
        camera_profile=camera_profile or config.camera.to_profile(),
        camera_meta=camera_meta,
        temperature_backend=_temperature_backend(config),
        temperature_serial_port=config.temp.serial.port,
        **_hardware_availability_inputs(config, camera_profile or config.camera.to_profile()),
        offline_datasets_available=offline_datasets_available,
        offline_dataset_error=offline_dataset_error,
    )


def _hardware_availability_inputs(config: HardwareConfig, camera_profile: dict[str, Any]) -> dict[str, Any]:
    provenance = camera_runtime_provenance(
        camera_profile=camera_profile,
        temperature_backend=_temperature_backend(config),
    )
    normalized_backend = str(camera_profile.get("backend") or "").strip().lower()
    camera_sdk_status: dict[str, Any] | None = None
    if str(provenance.get("camera_backend_kind") or "") == "real_hardware" and normalized_backend in HIK_CAMERA_BACKENDS:
        camera_sdk_status = get_hik_mvs_sdk_status(camera_profile)
    return {
        "camera_sdk_available": None if camera_sdk_status is None else bool(camera_sdk_status.get("available")),
        "camera_sdk_error": "" if camera_sdk_status is None else str(camera_sdk_status.get("error") or ""),
        "camera_sdk_details": {} if camera_sdk_status is None else dict(camera_sdk_status.get("details") or {}),
        "temperature_port_available": _temperature_port_available(config.temp.serial.port),
    }


def _temperature_port_available(port: str) -> bool | None:
    selected = str(port or "").strip()
    if not selected:
        return None
    try:
        ports = list_serial_ports()
    except RuntimeError:
        return None
    if not ports:
        return False
    return any(item.device == selected for item in ports)


def _assert_operator_real_camera_available(
    request: RealCameraRunRequest | RealCameraSetupProbeRequest,
    config: HardwareConfig,
    *,
    camera_profile: dict[str, Any],
    camera_meta: dict[str, Any] | None = None,
) -> None:
    if not (request.operator_mode and request.operator_data_source == "real_camera"):
        return
    status = _operator_source_status_payload(
        config,
        camera_profile=camera_profile,
        camera_meta=camera_meta,
    )
    if status["real_hardware_available"]:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "message": (
                "Operator real-camera mode requires real camera and real temperature controller; "
                "current backend is simulated or unavailable."
            ),
            "camera_status": "unavailable",
            "source_status": status,
        },
    )


@app.get("/api/operator/source-status")
def get_operator_source_status() -> dict[str, Any]:
    return _operator_source_status_payload(_hardware_config())


@app.post("/api/live-offline-runs")
def create_live_offline_run(request: LiveOfflineRunRequest) -> dict[str, Any]:
    try:
        result = run_live_offline_dataset(
            _registry(),
            _run_store(),
            dataset_id=request.dataset_id,
            measurement=_measurement_with_source(request.measurement_definition, MeasurementSource.OFFLINE_DATASET),
            start_frame=request.start_frame,
            max_frames=request.max_frames,
            target_fps=request.target_fps,
        )
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetAccessError as exc:
        raise HTTPException(
            status_code=503,
            detail={"message": str(exc), "issues": exc.issues},
        ) from exc
    except OfflineDatasetError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "run_manifest": result.manifest.model_dump(mode="json"),
        "analysis_result": result.analysis.model_dump(mode="json"),
    }


@app.post("/api/live-offline-runs/stream")
def stream_live_offline_run(request: LiveOfflineRunRequest) -> StreamingResponse:
    def event_lines():
        events = None
        try:
            events = iter_live_offline_run_events(
                _registry(),
                _run_store(),
                dataset_id=request.dataset_id,
                measurement=_measurement_with_source(request.measurement_definition, MeasurementSource.OFFLINE_DATASET),
                start_frame=request.start_frame,
                max_frames=request.max_frames,
                target_fps=request.target_fps,
            )
            for event in events:
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except DatasetNotFoundError as exc:
            yield json.dumps({"event": "error", "message": str(exc)}, ensure_ascii=False) + "\n"
        except DatasetAccessError as exc:
            yield json.dumps(
                {"event": "error", "message": str(exc), "issues": exc.issues},
                ensure_ascii=False,
            ) + "\n"
        except OfflineDatasetError as exc:
            yield json.dumps({"event": "error", "message": str(exc)}, ensure_ascii=False) + "\n"
        finally:
            close = getattr(events, "close", None)
            if callable(close):
                close()

    return StreamingResponse(event_lines(), media_type="application/x-ndjson")


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    try:
        result = read_run(_run_store(), run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}") from exc
    return {
        "run_manifest": result.manifest.model_dump(mode="json"),
        "analysis_result": result.analysis.model_dump(mode="json"),
    }


@app.get("/api/runs/{run_id}/frames/{frame_index}.png")
def get_run_frame_png(run_id: str, frame_index: int, max_width: int | None = None) -> Response:
    if frame_index <= 0:
        raise HTTPException(status_code=400, detail="frame_index must be a positive integer")
    if max_width is not None and max_width <= 0:
        raise HTTPException(status_code=400, detail="max_width must be a positive integer")
    run_store = _run_store()
    try:
        manifest = run_store.read_run_manifest(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}") from exc

    frame_record = next((record for record in manifest.frame_records if record.frame_index == frame_index), None)
    if frame_record is None:
        raise HTTPException(status_code=404, detail=f"Frame not found in run manifest: {frame_index}")
    if not frame_record.frame_path:
        raise HTTPException(status_code=404, detail=f"Run frame raw file was not saved: {frame_index}")

    run_dir = run_store.run_dir(run_id).resolve()
    frame_path = (run_dir / frame_record.frame_path).resolve()
    if not frame_path.is_relative_to(run_dir):
        raise HTTPException(status_code=400, detail="invalid frame path in run manifest")
    if not frame_path.is_file():
        raise HTTPException(status_code=404, detail=f"Run frame file not found: {frame_index}")

    try:
        frame = np.load(frame_path, allow_pickle=False)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Run frame cannot be loaded: {frame_index}") from exc
    except OSError as exc:
        raise HTTPException(status_code=404, detail=f"Run frame file not found: {frame_index}") from exc
    return Response(content=_array_to_png(frame, max_width=max_width), media_type="image/png")


@app.get("/api/runs/{run_id}/preview/latest.png")
def get_run_latest_preview_png(run_id: str) -> FileResponse:
    run_dir = _run_store().run_dir(run_id).resolve()
    preview_path = (run_dir / "preview_frames" / "latest.png").resolve()
    if not preview_path.is_relative_to(run_dir):
        raise HTTPException(status_code=400, detail="invalid run preview path")
    if not preview_path.is_file():
        raise HTTPException(status_code=404, detail=f"Run latest preview does not exist: {run_id}")
    return FileResponse(preview_path, media_type="image/png")


@app.get("/api/runs/{run_id}/raw-frames/{frame_index}.png")
def get_run_raw_frame_png(run_id: str, frame_index: int, max_width: int | None = None) -> Response:
    if frame_index <= 0:
        raise HTTPException(status_code=400, detail="frame_index must be a positive integer")
    if max_width is not None and max_width <= 0:
        raise HTTPException(status_code=400, detail="max_width must be a positive integer")
    run_dir = _run_store().run_dir(run_id).resolve()
    frame_path = (run_dir / "raw_frames" / f"frame_{frame_index:06d}.npy").resolve()
    if not frame_path.is_relative_to(run_dir):
        raise HTTPException(status_code=400, detail="invalid run frame path")
    if not frame_path.is_file():
        raise HTTPException(status_code=404, detail=f"Run raw frame file not found: {frame_index}")
    try:
        frame = np.load(frame_path, allow_pickle=False)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Run raw frame cannot be loaded: {frame_index}") from exc
    except OSError as exc:
        raise HTTPException(status_code=404, detail=f"Run raw frame file not found: {frame_index}") from exc
    return Response(content=_array_to_png(frame, max_width=max_width), media_type="image/png")


@app.get("/api/runs/{run_id}/availability")
def get_run_availability(run_id: str) -> dict[str, Any]:
    availability = _run_store().run_availability(run_id)
    return {"run_id": run_id, **availability}


@app.post("/api/runs/{run_id}/analysis")
def recompute_run_analysis(run_id: str, request: AnalysisRecomputeRequest) -> dict[str, Any]:
    run_store = _run_store()
    try:
        manifest = run_store.read_run_manifest(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}") from exc

    try:
        analysis = build_analysis_result(
            manifest,
            afas_preprocessing_parameters=request.afas_preprocessing_parameters,
            afas_analysis_parameters=request.afas_analysis_parameters,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    run_store.write_analysis_result(analysis)
    return {"analysis_result": analysis.model_dump(mode="json")}


@app.get("/api/camera/preview")
def preview_real_camera() -> dict[str, Any]:
    config = _hardware_config()
    try:
        with _camera_operation("setup_preview", blocking=False):
            with _camera_preview_lock:
                source = _get_preview_camera_source()
                frame = source.preview_frame()
    except CameraUnavailableError as exc:
        with _camera_preview_lock:
            _reset_preview_camera_source()
        raise HTTPException(
            status_code=503,
            detail={
                "camera_status": "unavailable",
                "message": str(exc),
                "details": exc.details,
            },
        ) from exc
    return {
        "camera_status": "ok",
        "timestamp_ms": frame.timestamp_ms,
        "shape": list(frame.array.shape),
        "dtype": str(frame.array.dtype),
        "model": str(frame.camera_meta.get("model", "")),
        "serial_number": str(frame.camera_meta.get("serial_number", "")),
        "ip": str(frame.camera_meta.get("ip", "")),
        "pixel_format": str(frame.camera_meta.get("pixel_format", config.camera.pixel_format)),
        "camera_meta": frame.camera_meta,
        "image_data_url": _array_to_png_data_url(frame.array),
        "provenance": camera_runtime_provenance(
            camera_profile=config.camera.to_profile(),
            camera_meta=frame.camera_meta,
            temperature_backend=_temperature_backend(config),
        ),
    }


@app.get("/api/camera/preview.png")
def preview_real_camera_png() -> Response:
    try:
        with _camera_operation("setup_preview_png", blocking=False):
            with _camera_preview_lock:
                source = _get_preview_camera_source()
                frame = source.preview_frame()
    except CameraUnavailableError as exc:
        with _camera_preview_lock:
            _reset_preview_camera_source()
        raise HTTPException(
            status_code=503,
            detail={
                "camera_status": "unavailable",
                "message": str(exc),
                "details": exc.details,
            },
        ) from exc
    return Response(content=_array_to_png(frame.array), media_type="image/png")


@app.post("/api/camera/preview/release")
def release_real_camera_preview() -> dict[str, str]:
    with _camera_operation("setup_preview_release", timeout=5.0):
        with _camera_preview_lock:
            _reset_preview_camera_source()
    return {"camera_status": "released"}


@app.post("/api/camera/setup-probe")
def probe_real_camera_setup_frame(request: RealCameraSetupProbeRequest) -> dict[str, Any]:
    try:
        config = _hardware_config()
        run_config = _hardware_config_with_temperature_port(
            config,
            request.measurement_definition.detector_config.temperature_serial_port,
        )
        camera_profile = {**config.camera.to_profile(), **(request.camera_profile or {})}
        _assert_operator_real_camera_available(
            request,
            run_config,
            camera_profile=camera_profile,
            camera_meta=request.camera_meta,
        )
        if request.frame_png_data_url:
            frame = _camera_frame_from_data_url(
                request.frame_png_data_url,
                timestamp_ms=request.frame_timestamp_ms,
                camera_meta=request.camera_meta or {},
            )
        else:
            # Omitting frame_png_data_url captures a fresh preview frame and probes that exact frame.
            with _camera_operation("setup_probe_capture", blocking=False):
                with _camera_preview_lock:
                    source = _get_preview_camera_source(camera_profile)
                    frame = source.preview_frame()
        payload = probe_setup_frame(
            dataset_id="real_camera",
            frame_array=frame.array,
            measurement=_measurement_with_source(request.measurement_definition, MeasurementSource.REAL_CAMERA),
            frame_index=1,
            frame_timestamp_ms=frame.timestamp_ms,
            camera_meta=frame.camera_meta,
        )
        payload.update(
            {
                "camera_status": "ok",
                "timestamp_ms": frame.timestamp_ms,
                "shape": list(frame.array.shape),
                "dtype": str(frame.array.dtype),
                "model": str(frame.camera_meta.get("model", "")),
                "serial_number": str(frame.camera_meta.get("serial_number", "")),
                "ip": str(frame.camera_meta.get("ip", "")),
                "pixel_format": str(frame.camera_meta.get("pixel_format", "")),
                "image_data_url": _array_to_png_data_url(frame.array),
                "provenance": camera_runtime_provenance(
                    camera_profile=camera_profile,
                    camera_meta=frame.camera_meta,
                    temperature_backend=_temperature_backend(config),
                ),
            }
        )
        return payload
    except CameraUnavailableError as exc:
        with _camera_preview_lock:
            _reset_preview_camera_source()
        raise HTTPException(
            status_code=503,
            detail={
                "camera_status": "unavailable",
                "message": str(exc),
                "details": exc.details,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/hardware/profile")
def get_hardware_profile() -> dict[str, Any]:
    config = _hardware_config()
    return {
        "camera": {
            **asdict(config.camera),
            "sdk_python_paths": ["<configured>" for _ in config.camera.sdk_python_paths],
            "sdk_library_path": "<configured>" if config.camera.sdk_library_path else "",
            "sdk_library_dir": "<configured>" if config.camera.sdk_library_dir else "",
        },
        "temp": {
            "backend": config.temp.backend,
            "protocol": config.temp.protocol,
            "slave_address": config.temp.slave_address,
            "serial": {
                **asdict(config.temp.serial),
                "port": config.temp.serial.port,
            },
            "register_map": asdict(config.temp.register_map),
            "control": asdict(config.temp.control),
        },
        "run": asdict(config.run),
    }


@app.get("/api/temperature/serial-ports")
def get_temperature_serial_ports() -> dict[str, Any]:
    return _temperature_serial_ports_payload()


@app.get("/api/temperature/ports")
def get_temperature_ports_alias() -> dict[str, Any]:
    return _temperature_serial_ports_payload()


def _temperature_serial_ports_payload() -> dict[str, Any]:
    try:
        ports = list_serial_ports()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail={"temperature_status": "unavailable", "message": str(exc)},
        ) from exc
    configured_port = _hardware_config().temp.serial.port.strip()
    if configured_port and all(port.device != configured_port for port in ports):
        ports.append(
            SerialPortInfo(
                device=configured_port,
                name=configured_port,
                description="configured",
                hwid="configured",
            )
        )
    return {"ports": [asdict(port) for port in ports]}


@app.get("/api/temperature/status")
def get_temperature_status(port: str | None = None) -> dict[str, Any]:
    if port and _temperature_port_available(port) is False:
        raise HTTPException(
            status_code=404,
            detail={"temperature_status": "unavailable", "message": f"Serial port {port} is not available"},
        )
    config = _hardware_config_with_temperature_port(_hardware_config(), port)
    controller = build_temperature_controller(config)
    if controller is None:
        raise HTTPException(
            status_code=503,
            detail={
                "temperature_status": "unavailable",
                "message": "LU92XX temperature controller is not configured",
            },
        )
    try:
        reading = controller.read_temperature()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"temperature_status": "unavailable", "message": str(exc)},
        ) from exc
    finally:
        controller.close()
    return {"temperature_status": "ok", "reading": asdict(reading)}


@app.post("/api/real-camera-runs")
def create_real_camera_run(request: RealCameraRunRequest) -> dict[str, Any]:
    try:
        config = _hardware_config()
        camera_profile = {**config.camera.to_profile(), **(request.camera_profile or {})}
        run_config = _hardware_config_with_temperature_port(
            config,
            request.measurement_definition.detector_config.temperature_serial_port,
        )
        _assert_operator_real_camera_available(request, run_config, camera_profile=camera_profile)
        with _camera_operation("real_camera_run", timeout=5.0):
            with _camera_preview_lock:
                _reset_preview_camera_source()
            temperature_controller = build_temperature_controller(run_config)
            result = run_real_camera(
                _run_store(),
                camera_source=_build_camera_source(camera_profile),
                temperature_controller=temperature_controller,
                measurement=_measurement_with_source(request.measurement_definition, MeasurementSource.REAL_CAMERA),
                max_frames=request.max_frames,
                target_fps=request.target_fps,
                camera_profile=camera_profile,
                temp_sync_target_ms=run_config.run.temp_sync_target_ms,
                temperature_backend=run_config.temp.backend,
                save_raw_frames=run_config.run.save_raw_frames,
                save_preview_frames=run_config.run.save_preview_frames,
                preview_max_width=run_config.run.preview_max_width,
            )
    except CameraUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "camera_status": "unavailable",
                "message": str(exc),
                "details": exc.details,
            },
        ) from exc
    return {
        "run_manifest": result.manifest.model_dump(mode="json"),
        "analysis_result": result.analysis.model_dump(mode="json"),
    }


@app.post("/api/real-camera-runs/stream")
def stream_real_camera_run(request: RealCameraRunRequest) -> StreamingResponse:
    config = _hardware_config()
    camera_profile = {**config.camera.to_profile(), **(request.camera_profile or {})}
    run_config = _hardware_config_with_temperature_port(
        config,
        request.measurement_definition.detector_config.temperature_serial_port,
    )
    _assert_operator_real_camera_available(request, run_config, camera_profile=camera_profile)
    operation = _camera_operation("real_camera_run_stream", timeout=5.0)
    operation.__enter__()

    def event_lines():
        events = None
        active_run_id: str | None = None
        try:
            with _camera_preview_lock:
                _reset_preview_camera_source()
            temperature_controller = build_temperature_controller(run_config)
            events = iter_real_camera_run_events(
                _run_store(),
                camera_source=_build_camera_source(camera_profile),
                temperature_controller=temperature_controller,
                measurement=_measurement_with_source(request.measurement_definition, MeasurementSource.REAL_CAMERA),
                max_frames=request.max_frames,
                target_fps=request.target_fps,
                camera_profile=camera_profile,
                temp_sync_target_ms=run_config.run.temp_sync_target_ms,
                temperature_backend=run_config.temp.backend,
                save_raw_frames=run_config.run.save_raw_frames,
                save_preview_frames=run_config.run.save_preview_frames,
                preview_max_width=run_config.run.preview_max_width,
                stop_requested=_real_camera_stream_stop_requested,
            )
            for event in events:
                event_run_id = _stream_event_run_id(event)
                if event_run_id is not None and active_run_id is None:
                    active_run_id = event_run_id
                    _register_real_camera_stream_stop(event_run_id)
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except CameraUnavailableError as exc:
            yield json.dumps(
                {
                    "event": "error",
                    "message": str(exc),
                    "camera_status": "unavailable",
                    "details": exc.details,
                },
                ensure_ascii=False,
            ) + "\n"
        except Exception as exc:
            yield json.dumps({"event": "error", "message": str(exc)}, ensure_ascii=False) + "\n"
        finally:
            close = getattr(events, "close", None)
            if callable(close):
                close()
            if active_run_id is not None:
                _clear_real_camera_stream_stop(active_run_id)
            operation.__exit__(None, None, None)

    return StreamingResponse(event_lines(), media_type="application/x-ndjson")


@app.post("/api/real-camera-runs/{run_id}/stop")
def stop_real_camera_run(run_id: str) -> dict[str, Any]:
    if _request_real_camera_stream_stop(run_id):
        return {"run_id": run_id, "stop_requested": True, "already_complete": False}
    availability = _run_store().run_availability(run_id)
    if availability["exists"]:
        return {"run_id": run_id, "stop_requested": False, "already_complete": True}
    raise HTTPException(status_code=404, detail=f"Active real camera stream not found: {run_id}")


def build_temperature_controller(config: HardwareConfig):  # noqa: ANN201
    if config.temp.backend in {"simulated", "simulated_temperature", "mock", "fake"}:
        return SimulatedTemperatureController(config.temp)
    if config.temp.backend != "lu92xx_modbus_rtu":
        return None
    if not config.temp.serial.port.strip():
        return None
    return LU92XXModbusRtuController(config.temp)


@app.post("/api/runs/{run_id}/exports")
def create_run_exports(run_id: str) -> dict[str, Any]:
    logger.info("creating export artifacts for run_id=%s", run_id)
    try:
        artifacts = export_run(_run_store(), run_id)
    except FileNotFoundError as exc:
        logger.warning("export artifacts failed at read_run for run_id=%s", run_id)
        raise HTTPException(
            status_code=404,
            detail={"message": f"Run not found: {run_id}", "stage": "read_run"},
        ) from exc
    except Exception as exc:
        logger.exception("export artifacts failed for run_id=%s", run_id)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Export failed: file generation failed; check backend logs",
                "stage": "create_artifacts",
                "error": str(exc),
            },
        ) from exc
    return {"artifacts": [_artifact_payload(run_id, artifact) for artifact in artifacts]}


@app.post("/api/runs/{run_id}/exports/download")
def download_run_export_bundle(run_id: str) -> FileResponse:
    logger.info("creating export bundle for run_id=%s", run_id)
    try:
        bundle_path = export_run_bundle(_run_store(), run_id)
    except FileNotFoundError as exc:
        logger.warning("export bundle failed at read_run for run_id=%s: %s", run_id, exc)
        raise HTTPException(
            status_code=404,
            detail={"message": f"Run not found: {run_id}", "stage": "read_run"},
        ) from exc
    except Exception as exc:
        logger.exception("export bundle failed for run_id=%s", run_id)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Export failed: file generation failed; check backend logs",
                "stage": "zip_bundle",
                "error": str(exc),
            },
        ) from exc
    return FileResponse(bundle_path, media_type="application/zip", filename=bundle_path.name)


@app.post("/api/imports/run-export")
async def import_run_export(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "upload"
    try:
        content = await file.read()
        view = import_run_export_bytes(filename=filename, content=content)
    except RunExportImportError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc), "stage": "import_run_export"},
        ) from exc
    except Exception as exc:
        logger.exception("import run export failed for filename=%s", filename)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Import failed: could not parse uploaded export; check backend logs",
                "stage": "import_run_export",
                "error": str(exc),
            },
        ) from exc
    return view.model_dump(mode="json")


@app.get("/api/exports/{run_id}/{filename}")
def download_export_artifact(run_id: str, filename: str) -> FileResponse:
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="invalid export filename")
    path = _run_store().run_dir(run_id) / "exports" / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Export artifact not found: {filename}")
    media_type = _media_type_for(path)
    return FileResponse(path, media_type=media_type, filename=filename)


def _artifact_payload(run_id: str, artifact) -> dict[str, Any]:  # noqa: ANN001
    payload = artifact.model_dump(mode="json")
    payload["download_url"] = f"/api/exports/{run_id}/{Path(artifact.path).name}"
    return payload


def _media_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return "text/csv"
    if suffix == ".json":
        return "application/json"
    if suffix == ".png":
        return "image/png"
    return "application/octet-stream"


def _frame_metadata(frame: LoadedOfflineFrame) -> dict[str, Any]:
    return {
        "frame_index": frame.frame_index,
        "shape": list(frame.array.shape),
        "dtype": str(frame.array.dtype),
    }


def _array_to_png(array: np.ndarray, max_width: int | None = None) -> bytes:
    try:
        return array_to_png_bytes(array, max_width=max_width)
    except ValueError as exc:
        raise OfflineDatasetError(str(exc)) from exc


def _array_to_png_data_url(array: np.ndarray) -> str:
    return "data:image/png;base64," + base64.b64encode(_array_to_png(array)).decode("ascii")


def _temperature_backend(config: Any) -> str:
    temp = getattr(config, "temp", None)
    return str(getattr(temp, "backend", "") or "")


def _camera_frame_from_data_url(
    data_url: str,
    *,
    timestamp_ms: int | None,
    camera_meta: dict[str, Any],
) -> CameraFrame:
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise ValueError("frame_png_data_url must be a PNG data URL")
    try:
        image_bytes = base64.b64decode(data_url[len(prefix) :], validate=True)
    except binascii.Error as exc:
        raise ValueError("frame_png_data_url contains invalid base64") from exc
    try:
        image = Image.open(io.BytesIO(image_bytes))
        array = np.asarray(image)
    except Exception as exc:
        raise ValueError("frame_png_data_url cannot be decoded as a PNG image") from exc
    return CameraFrame(array=array, timestamp_ms=timestamp_ms, camera_meta=camera_meta)
