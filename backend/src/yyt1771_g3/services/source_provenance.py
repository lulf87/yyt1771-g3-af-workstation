from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any


SIMULATED_MARKERS = ("simulated", "simulation", "dataset", "fake", "mock")
REAL_CAMERA_BACKENDS = ("hik_gige_mvs", "hik_mvs", "gige_vision")
REAL_TEMPERATURE_BACKENDS = ("lu92xx_modbus_rtu",)


def unknown_provenance() -> dict[str, Any]:
    return _provenance(
        acquisition_source="unknown",
        camera_backend="",
        camera_backend_kind="unknown",
        camera_is_simulated=False,
        camera_label="",
        camera_serial="",
        simulated_dataset_id="",
        temperature_backend="",
        temperature_backend_kind="unknown",
        temperature_is_simulated=False,
        overall_kind="unknown",
        display_label_zh="未知来源",
        display_label_en="Unknown source",
    )


def offline_dataset_provenance(dataset_id: str = "", label: str = "") -> dict[str, Any]:
    source_label = label or dataset_id
    return _provenance(
        acquisition_source="offline_dataset",
        camera_backend="offline_dataset",
        camera_backend_kind="simulated_dataset",
        camera_is_simulated=True,
        camera_label=source_label,
        camera_serial="",
        simulated_dataset_id=dataset_id,
        temperature_backend="offline_temperature_csv",
        temperature_backend_kind="simulated",
        temperature_is_simulated=True,
        overall_kind="offline",
        display_label_zh="离线/模拟素材",
        display_label_en="Offline/simulated material",
    )


def imported_file_provenance(source: dict[str, Any] | None = None) -> dict[str, Any]:
    base = normalize_provenance(source)
    provenance = _provenance(
        acquisition_source="imported_file",
        camera_backend=str(base.get("camera_backend", "")),
        camera_backend_kind=str(base.get("camera_backend_kind", "unknown")),
        camera_is_simulated=bool(base.get("camera_is_simulated", False)),
        camera_label=str(base.get("camera_label", "")),
        camera_serial=str(base.get("camera_serial", "")),
        simulated_dataset_id=str(base.get("simulated_dataset_id", "")),
        temperature_backend=str(base.get("temperature_backend", "")),
        temperature_backend_kind=str(base.get("temperature_backend_kind", "unknown")),
        temperature_is_simulated=bool(base.get("temperature_is_simulated", False)),
        overall_kind="imported",
        display_label_zh="导入结果",
        display_label_en="Imported result",
    )
    if source:
        provenance["imported_from_provenance"] = base
    return provenance


def camera_runtime_provenance(
    *,
    camera_profile: Any | None = None,
    camera_meta: dict[str, Any] | None = None,
    temperature_backend: str | None = None,
    temperature_source: str | None = None,
) -> dict[str, Any]:
    profile = _mapping(camera_profile)
    meta = camera_meta or {}
    camera_backend = _first_text(
        meta.get("backend"),
        profile.get("backend"),
        "hik_gige_mvs",
    )
    camera_label = _first_text(
        meta.get("model"),
        profile.get("model"),
        camera_backend,
    )
    camera_serial = _first_text(
        meta.get("serial_number"),
        profile.get("serial_number"),
    )
    simulated_dataset_id = _first_text(
        meta.get("dataset_id"),
        meta.get("simulated_dataset_id"),
        profile.get("simulated_dataset_id"),
        profile.get("dataset_id"),
    )
    camera_is_simulated = _camera_is_simulated(
        backend=camera_backend,
        model=camera_label,
        serial_number=camera_serial,
        simulated_dataset_id=simulated_dataset_id,
        camera_meta=meta,
    )
    camera_backend_kind = _camera_backend_kind(
        camera_backend,
        camera_is_simulated=camera_is_simulated,
        simulated_dataset_id=simulated_dataset_id,
        model=camera_label,
        serial_number=camera_serial,
    )
    temp_backend = _first_text(temperature_backend, temperature_source)
    temp_is_simulated = _temperature_is_simulated(temp_backend, temperature_source)
    temp_kind = _temperature_backend_kind(temp_backend, temp_is_simulated=temp_is_simulated)
    overall_kind = _overall_runtime_kind(camera_is_simulated, temp_is_simulated)
    return _provenance(
        acquisition_source="camera_runtime",
        camera_backend=camera_backend,
        camera_backend_kind=camera_backend_kind,
        camera_is_simulated=camera_is_simulated,
        camera_label=camera_label,
        camera_serial=camera_serial,
        simulated_dataset_id=simulated_dataset_id,
        temperature_backend=temp_backend,
        temperature_backend_kind=temp_kind,
        temperature_is_simulated=temp_is_simulated,
        overall_kind=overall_kind,
        display_label_zh=_runtime_label_zh(overall_kind, camera_is_simulated, temp_is_simulated),
        display_label_en=_runtime_label_en(overall_kind, camera_is_simulated, temp_is_simulated),
    )


def operator_source_status(
    *,
    camera_profile: Any | None = None,
    camera_meta: dict[str, Any] | None = None,
    temperature_backend: str | None = None,
    temperature_source: str | None = None,
    temperature_serial_port: str | None = None,
    camera_sdk_available: bool | None = None,
    camera_sdk_error: str = "",
    camera_sdk_details: dict[str, Any] | None = None,
    temperature_port_available: bool | None = None,
    offline_datasets_available: bool = False,
    offline_dataset_error: str = "",
) -> dict[str, Any]:
    provenance = camera_runtime_provenance(
        camera_profile=camera_profile,
        camera_meta=camera_meta,
        temperature_backend=temperature_backend,
        temperature_source=temperature_source,
    )
    profile = _mapping(camera_profile)
    camera_backend = str(provenance.get("camera_backend") or profile.get("backend") or "").strip()
    camera_transport = str(profile.get("transport") or "").strip()
    temperature = str(provenance.get("temperature_backend") or temperature_backend or temperature_source or "").strip()
    serial_configured = bool(str(temperature_serial_port or "").strip())

    real_camera_backend = _normalized(camera_backend) in REAL_CAMERA_BACKENDS or _normalized(camera_transport) in REAL_CAMERA_BACKENDS
    real_temperature_backend = _normalized(temperature) in REAL_TEMPERATURE_BACKENDS
    camera_is_simulated = bool(provenance.get("camera_is_simulated", False))
    temperature_is_simulated = bool(provenance.get("temperature_is_simulated", False))
    real_camera_available = real_camera_backend and not camera_is_simulated and camera_sdk_available is not False
    real_temperature_available = (
        real_temperature_backend
        and not temperature_is_simulated
        and serial_configured
        and temperature_port_available is not False
    )
    errors: list[str] = []
    warnings: list[str] = []
    if not real_camera_available:
        if camera_is_simulated:
            errors.append("camera backend is simulated")
        if not real_camera_backend:
            errors.append("camera backend is not a supported real hardware backend")
        if real_camera_backend and not camera_is_simulated and camera_sdk_available is False:
            errors.append(camera_sdk_error or "Hik MVS SDK is not available")
    if not real_temperature_available:
        if temperature_is_simulated:
            errors.append("temperature backend is simulated")
        if not real_temperature_backend:
            errors.append("temperature backend is not a supported real controller backend")
        if real_temperature_backend and not serial_configured:
            errors.append("temperature serial port is not configured")
        if real_temperature_backend and serial_configured and temperature_port_available is False:
            errors.append(f"Serial port {str(temperature_serial_port or '').strip()} is not available")
    if offline_dataset_error:
        warnings.append(offline_dataset_error)

    return {
        "real_hardware_available": real_camera_available and real_temperature_available,
        "real_camera_available": real_camera_available,
        "real_temperature_available": real_temperature_available,
        "camera_is_simulated": camera_is_simulated,
        "temperature_is_simulated": temperature_is_simulated,
        "camera_label": str(provenance.get("camera_label") or ""),
        "camera_serial": str(provenance.get("camera_serial") or ""),
        "camera_backend": camera_backend,
        "temperature_backend": temperature,
        "temperature_serial_port_configured": serial_configured,
        "temperature_port_available": temperature_port_available,
        "camera_sdk_available": camera_sdk_available,
        "camera_sdk_error": camera_sdk_error,
        "camera_sdk_details": camera_sdk_details or {},
        "offline_datasets_available": offline_datasets_available,
        "errors": errors,
        "warnings": warnings,
        "provenance": provenance,
    }


def normalize_provenance(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return unknown_provenance()
    fallback = unknown_provenance()
    normalized = {**fallback, **value}
    normalized["camera_is_simulated"] = bool(normalized.get("camera_is_simulated", False))
    normalized["temperature_is_simulated"] = bool(normalized.get("temperature_is_simulated", False))
    return normalized


def infer_provenance_from_export_payload(payload: dict[str, Any]) -> dict[str, Any]:
    direct = _dict_or_none(payload.get("provenance"))
    run_manifest = _dict_or_none(payload.get("run_manifest"))
    analysis_result = _dict_or_none(payload.get("analysis_result")) or _dict_or_none(payload.get("analysis"))
    if direct:
        return normalize_provenance(direct)
    if run_manifest:
        manifest_provenance = _dict_or_none(run_manifest.get("provenance"))
        if manifest_provenance:
            return normalize_provenance(manifest_provenance)
    if analysis_result:
        analysis_provenance = _dict_or_none(analysis_result.get("provenance"))
        if analysis_provenance:
            return normalize_provenance(analysis_provenance)

    dataset_id = str((run_manifest or {}).get("dataset_id") or "")
    config_snapshot = _dict_or_none((run_manifest or {}).get("config_snapshot")) or {}
    mode = str(config_snapshot.get("mode") or "")
    measurement = _dict_or_none((run_manifest or {}).get("measurement_definition")) or {}
    operator_data_source = str(
        payload.get("operator_data_source")
        or (run_manifest or {}).get("operator_data_source")
        or measurement.get("source")
        or ""
    )
    if operator_data_source == "offline_dataset" or mode == "live_offline_run" or (dataset_id and dataset_id != "real_camera"):
        return offline_dataset_provenance(dataset_id)

    frame_records = (run_manifest or {}).get("frame_records")
    frame_record = frame_records[0] if isinstance(frame_records, list) and frame_records else {}
    temperature_records = (run_manifest or {}).get("temperature_records")
    temperature_record = temperature_records[0] if isinstance(temperature_records, list) and temperature_records else {}
    if dataset_id == "real_camera" or operator_data_source == "real_camera" or mode == "real_camera_run":
        return camera_runtime_provenance(
            camera_profile=_dict_or_none(config_snapshot.get("camera_profile")),
            camera_meta=_dict_or_none(frame_record.get("camera_meta")) if isinstance(frame_record, dict) else None,
            temperature_backend=_first_text(config_snapshot.get("temperature_backend")),
            temperature_source=_first_text(temperature_record.get("source")) if isinstance(temperature_record, dict) else "",
        )
    return unknown_provenance()


def operator_data_source_from_provenance(provenance: dict[str, Any] | None) -> str:
    normalized = normalize_provenance(provenance)
    acquisition_source = str(normalized.get("acquisition_source") or "")
    if acquisition_source == "offline_dataset":
        return "offline_dataset"
    if acquisition_source == "camera_runtime":
        return "real_camera"
    return ""


def _camera_is_simulated(
    *,
    backend: str,
    model: str,
    serial_number: str,
    simulated_dataset_id: str,
    camera_meta: dict[str, Any],
) -> bool:
    return (
        _contains_marker(backend)
        or bool(simulated_dataset_id.strip())
        or _contains_marker(model)
        or serial_number.upper().startswith(("SIM-", "SIM-DATASET-"))
        or _contains_marker(_first_text(camera_meta.get("model"), camera_meta.get("serial_number")))
    )


def _camera_backend_kind(
    backend: str,
    *,
    camera_is_simulated: bool,
    simulated_dataset_id: str,
    model: str,
    serial_number: str,
) -> str:
    if camera_is_simulated:
        if simulated_dataset_id or "dataset" in _lower_blob(backend, model, serial_number):
            return "simulated_dataset"
        return "mock" if "mock" in backend.lower() or "fake" in backend.lower() else "simulated_dataset"
    if not backend:
        return "unknown"
    return "real_hardware"


def _temperature_is_simulated(backend: str, source: str | None) -> bool:
    return _contains_marker(backend) or _contains_marker(source or "") or (source or "") == "simulated_temperature"


def _temperature_backend_kind(backend: str, *, temp_is_simulated: bool) -> str:
    if temp_is_simulated:
        return "mock" if "mock" in backend.lower() or "fake" in backend.lower() else "simulated"
    if not backend:
        return "unknown"
    return "real_hardware"


def _overall_runtime_kind(camera_is_simulated: bool, temp_is_simulated: bool) -> str:
    if camera_is_simulated and temp_is_simulated:
        return "simulated"
    if camera_is_simulated or temp_is_simulated:
        return "mixed"
    return "real_hardware"


def _runtime_label_zh(overall_kind: str, camera_is_simulated: bool, temp_is_simulated: bool) -> str:
    if overall_kind == "real_hardware":
        return "真实相机 + 真实温控"
    if camera_is_simulated and temp_is_simulated:
        return "模拟相机 + 模拟温控"
    if camera_is_simulated:
        return "模拟相机 / 模拟素材"
    if temp_is_simulated:
        return "真实相机 + 模拟温控"
    return "未知来源"


def _runtime_label_en(overall_kind: str, camera_is_simulated: bool, temp_is_simulated: bool) -> str:
    if overall_kind == "real_hardware":
        return "Real camera + real temperature controller"
    if camera_is_simulated and temp_is_simulated:
        return "Simulated camera + simulated temperature controller"
    if camera_is_simulated:
        return "Simulated camera / simulated material"
    if temp_is_simulated:
        return "Real camera + simulated temperature controller"
    return "Unknown source"


def _provenance(**values: Any) -> dict[str, Any]:
    return {
        "acquisition_source": values["acquisition_source"],
        "camera_backend": values["camera_backend"],
        "camera_backend_kind": values["camera_backend_kind"],
        "camera_is_simulated": values["camera_is_simulated"],
        "camera_label": values["camera_label"],
        "camera_serial": values["camera_serial"],
        "simulated_dataset_id": values["simulated_dataset_id"],
        "temperature_backend": values["temperature_backend"],
        "temperature_backend_kind": values["temperature_backend_kind"],
        "temperature_is_simulated": values["temperature_is_simulated"],
        "overall_kind": values["overall_kind"],
        "display_label_zh": values["display_label_zh"],
        "display_label_en": values["display_label_en"],
    }


def _mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if is_dataclass(value):
        return asdict(value)
    to_profile = getattr(value, "to_profile", None)
    if callable(to_profile):
        profile = to_profile()
        return profile if isinstance(profile, dict) else {}
    return {}


def _dict_or_none(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _first_text(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _contains_marker(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in SIMULATED_MARKERS)


def _lower_blob(*values: str) -> str:
    return " ".join(value.lower() for value in values if value)


def _normalized(value: str) -> str:
    return value.strip().lower()
