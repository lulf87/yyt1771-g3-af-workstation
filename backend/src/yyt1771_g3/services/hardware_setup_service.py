from __future__ import annotations

import os
import platform
import struct
from dataclasses import asdict
from pathlib import Path
from typing import Any

from yyt1771_g3.camera.base import CameraUnavailableError
from yyt1771_g3.camera.factory import HIK_CAMERA_BACKENDS
from yyt1771_g3.camera.hik_mvs_source import (
    HIK_MVS_LIBRARY_PATH_ENV,
    HIK_MVS_PYTHON_MODULE,
    HIK_MVS_PYTHON_PATH_ENV,
    HikMvsCameraSource,
    _decode_sdk_char_buffer,
    _ip_from_int,
    _prepend_sdk_python_paths,
)
from yyt1771_g3.core.hardware_config import HardwareConfig, hardware_config_path, local_hardware_profile_path
from yyt1771_g3.temperature.serial_ports import list_serial_ports


class HardwareSetupError(RuntimeError):
    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


def build_hardware_environment_report(config: HardwareConfig) -> dict[str, Any]:
    checks = [
        _check_backend_running(),
        _check_operating_system(),
        _check_python_bits(),
        _check_hik_mvs_sdk_import(config),
        _check_mvs_dynamic_library_path(config),
        _check_temperature_serial_ports(),
    ]
    failed = any(item["status"] == "failed" for item in checks)
    return {
        "overall_status": "failed" if failed else "passed",
        "checks": checks,
    }


def discover_hardware_cameras(config: HardwareConfig) -> list[dict[str, Any]]:
    profile = config.camera.to_profile()
    backend = str(profile.get("backend", "hik_gige_mvs") or "hik_gige_mvs").strip().lower()
    if backend not in HIK_CAMERA_BACKENDS:
        raise HardwareSetupError(
            f"Camera scan supports Hik MVS backends only, got: {backend}",
            details={"backend": backend, "supported_backends": sorted(HIK_CAMERA_BACKENDS)},
        )
    try:
        descriptors = _enumerate_hik_mvs_device_descriptors(profile)
    except CameraUnavailableError:
        raise
    except Exception as exc:
        raise HardwareSetupError("Hik camera scan failed", details={"error": str(exc)}) from exc
    return [_camera_payload(descriptor, profile) for descriptor in descriptors]


def save_hardware_binding(
    *,
    camera: dict[str, Any],
    temperature: dict[str, Any],
    path: str | Path | None = None,
) -> dict[str, Any]:
    config_path = local_hardware_profile_path(path)
    _assert_writable_hardware_profile_path(config_path)
    payload = _load_save_base_mapping(config_path)
    camera_payload = _ensure_mapping(payload, "camera")
    temp_payload = _ensure_mapping(payload, "temp")
    serial_payload = _ensure_mapping(temp_payload, "serial")

    _patch_non_empty(camera_payload, "backend", camera.get("backend") or "hik_gige_mvs")
    _patch_non_empty(camera_payload, "transport", camera.get("transport") or "gige_vision")
    _patch_non_empty(camera_payload, "model", camera.get("model"))
    _patch_non_empty(camera_payload, "serial_number", camera.get("serial_number"))
    _patch_non_empty(camera_payload, "ip", camera.get("ip"))
    _patch_allowed_models(camera_payload, str(camera.get("model", "") or "").strip())

    _patch_non_empty(temp_payload, "backend", temperature.get("backend") or "lu92xx_modbus_rtu")
    _patch_non_empty(serial_payload, "port", temperature.get("serial_port"))

    _write_yaml_mapping(config_path, payload)
    return {
        "saved": True,
        "config_path": str(config_path),
        "camera": _bound_camera_summary(camera_payload),
        "temperature": {
            "backend": str(temp_payload.get("backend", "") or ""),
            "serial_port": str(serial_payload.get("port", "") or ""),
        },
    }


def _load_save_base_mapping(config_path: Path) -> dict[str, Any]:
    if config_path.exists():
        return _load_existing_yaml_mapping(config_path)
    source_path = hardware_config_path()
    if source_path != config_path and source_path.exists():
        return _load_existing_yaml_mapping(source_path)
    return {}


def _assert_writable_hardware_profile_path(path: Path) -> None:
    normalized = path.expanduser()
    name = normalized.name.lower()
    if name.endswith(".example.yaml") or name.endswith(".example.yml"):
        raise HardwareSetupError(
            "Cannot save hardware binding to an example config. Use configs/local/realcamera_temp.local.yaml.",
            details={"config_path": str(path)},
        )
    parts = tuple(part.lower() for part in normalized.parts)
    if "configs" in parts:
        configs_index = parts.index("configs")
        if len(parts) > configs_index + 1 and parts[configs_index + 1] in {"hardware", "camera", "temperature", "examples"}:
            raise HardwareSetupError(
                "Cannot save hardware binding to an example config. Use configs/local/realcamera_temp.local.yaml.",
                details={"config_path": str(path)},
            )


def _check_backend_running() -> dict[str, Any]:
    return {
        "id": "backend_running",
        "label": "Backend",
        "status": "passed",
        "message": "Backend API is running.",
        "suggestion": "",
        "details": {},
    }


def _check_operating_system() -> dict[str, Any]:
    system = platform.system() or "unknown"
    return {
        "id": "operating_system",
        "label": "Operating system",
        "status": "passed",
        "message": system,
        "suggestion": "",
        "details": {
            "system": system,
            "platform": platform.platform(),
            "machine": platform.machine(),
        },
    }


def _check_python_bits() -> dict[str, Any]:
    bits = struct.calcsize("P") * 8
    return {
        "id": "python_architecture",
        "label": "Python architecture",
        "status": "passed",
        "message": f"Python {bits}-bit",
        "suggestion": "",
        "details": {
            "bits": bits,
            "executable": os.environ.get("PYTHONEXECUTABLE", ""),
            "version": platform.python_version(),
        },
    }


def _check_hik_mvs_sdk_import(config: HardwareConfig) -> dict[str, Any]:
    try:
        HikMvsCameraSource._load_sdk(config.camera.to_profile())
    except CameraUnavailableError as exc:
        return {
            "id": "hik_mvs_sdk_import",
            "label": HIK_MVS_PYTHON_MODULE,
            "status": "failed",
            "message": str(exc),
            "suggestion": "Hik MVS SDK was not found. Install MVS or configure SDK paths.",
            "details": exc.details,
        }
    except Exception as exc:
        return {
            "id": "hik_mvs_sdk_import",
            "label": HIK_MVS_PYTHON_MODULE,
            "status": "failed",
            "message": str(exc),
            "suggestion": "Hik MVS SDK was not found. Install MVS or configure SDK paths.",
            "details": {"error": str(exc)},
        }
    return {
        "id": "hik_mvs_sdk_import",
        "label": HIK_MVS_PYTHON_MODULE,
        "status": "passed",
        "message": "Hik MVS Python binding can be imported.",
        "suggestion": "",
        "details": {
            "sdk_python_path_env": os.environ.get(HIK_MVS_PYTHON_PATH_ENV, ""),
            "sdk_python_paths": list(config.camera.sdk_python_paths),
        },
    }


def _check_mvs_dynamic_library_path(config: HardwareConfig) -> dict[str, Any]:
    configured = str(config.camera.sdk_library_path or os.environ.get(HIK_MVS_LIBRARY_PATH_ENV, "") or "").strip()
    if not configured:
        return {
            "id": "mvs_dynamic_library_path",
            "label": "MVS dynamic library",
            "status": "failed",
            "message": "MVS dynamic library path is not configured.",
            "suggestion": "Configure camera.sdk_library_path or HIK_MVS_LIBRARY_PATH.",
            "details": {"configured_path": ""},
        }
    path = Path(configured).expanduser()
    if path.is_file():
        return {
            "id": "mvs_dynamic_library_path",
            "label": "MVS dynamic library",
            "status": "passed",
            "message": "MVS dynamic library path is configured.",
            "suggestion": "",
            "details": {"configured_path": str(path)},
        }
    return {
        "id": "mvs_dynamic_library_path",
        "label": "MVS dynamic library",
        "status": "failed",
        "message": "Configured MVS dynamic library path does not exist.",
        "suggestion": "Install MVS or update camera.sdk_library_path.",
        "details": {"configured_path": str(path)},
    }


def _check_temperature_serial_ports() -> dict[str, Any]:
    try:
        ports = [asdict(port) for port in list_serial_ports()]
    except Exception as exc:
        return {
            "id": "temperature_serial_ports",
            "label": "Temperature serial ports",
            "status": "failed",
            "message": str(exc),
            "suggestion": "Install pyserial and check OS serial-port permissions.",
            "details": {"ports": []},
        }
    return {
        "id": "temperature_serial_ports",
        "label": "Temperature serial ports",
        "status": "passed",
        "message": f"{len(ports)} serial port(s) readable.",
        "suggestion": "",
        "details": {"ports": ports},
    }


def _enumerate_hik_mvs_device_descriptors(profile: dict[str, Any]) -> list[dict[str, Any]]:
    _prepend_sdk_python_paths(profile)
    sdk = HikMvsCameraSource._load_sdk(profile)
    device_list_type = getattr(sdk, "MV_CC_DEVICE_INFO_LIST", None)
    camera_class = getattr(sdk, "MvCamera", None)
    if device_list_type is None or camera_class is None:
        raise HardwareSetupError(
            "Hik MVS SDK was loaded but device enumeration is unavailable",
            details={"expected": "MV_CC_DEVICE_INFO_LIST and MvCamera.MV_CC_EnumDevices"},
        )
    device_list = device_list_type()
    layer_type = int(getattr(sdk, "MV_GIGE_DEVICE", 1)) | int(getattr(sdk, "MV_USB_DEVICE", 4))
    ret = int(camera_class.MV_CC_EnumDevices(layer_type, device_list))
    if ret != 0:
        raise HardwareSetupError("Failed to enumerate Hik cameras", details={"ret_code": f"0x{ret:x}"})
    descriptors: list[dict[str, Any]] = []
    for index in range(int(getattr(device_list, "nDeviceNum", 0))):
        raw_entry = device_list.pDeviceInfo[index]
        if raw_entry is None:
            continue
        raw_info = raw_entry.contents if hasattr(raw_entry, "contents") else raw_entry
        descriptors.append(_describe_sdk_device(sdk, index, raw_info))
    return descriptors


def _describe_sdk_device(sdk: Any, index: int, raw_info: Any) -> dict[str, Any]:
    transport_code = int(getattr(raw_info, "nTLayerType", 0))
    if transport_code == int(getattr(sdk, "MV_GIGE_DEVICE", 1)):
        gige_info = raw_info.SpecialInfo.stGigEInfo
        return {
            "index": index,
            "backend": "hik_gige_mvs",
            "transport": "gige_vision",
            "model": _decode_sdk_char_buffer(getattr(gige_info, "chModelName", "")),
            "serial_number": _decode_sdk_char_buffer(getattr(gige_info, "chSerialNumber", "")),
            "ip": _ip_from_int(int(getattr(gige_info, "nCurrentIp", 0))),
            "user_defined_name": _decode_sdk_char_buffer(getattr(gige_info, "chUserDefinedName", "")),
        }
    if transport_code == int(getattr(sdk, "MV_USB_DEVICE", 4)):
        usb_info = raw_info.SpecialInfo.stUsb3VInfo
        return {
            "index": index,
            "backend": "hik_gige_mvs",
            "transport": "usb3_vision",
            "model": _decode_sdk_char_buffer(getattr(usb_info, "chModelName", "")),
            "serial_number": _decode_sdk_char_buffer(getattr(usb_info, "chSerialNumber", "")),
            "ip": "",
            "user_defined_name": _decode_sdk_char_buffer(getattr(usb_info, "chUserDefinedName", "")),
        }
    return {
        "index": index,
        "backend": "hik_gige_mvs",
        "transport": "unknown",
        "model": "",
        "serial_number": "",
        "ip": "",
        "user_defined_name": "",
    }


def _camera_payload(descriptor: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    allowed_models = [str(item).strip() for item in profile.get("allowed_models", []) if str(item).strip()]
    model = str(descriptor.get("model", "") or "")
    return {
        "backend": str(descriptor.get("backend", "hik_gige_mvs") or "hik_gige_mvs"),
        "transport": str(descriptor.get("transport", "") or ""),
        "model": model,
        "serial_number": str(descriptor.get("serial_number", "") or ""),
        "ip": str(descriptor.get("ip", "") or ""),
        "user_defined_name": str(descriptor.get("user_defined_name", "") or ""),
        "is_supported_model": not allowed_models or model in allowed_models,
        "is_selected": _camera_matches_profile(descriptor, profile),
    }


def _camera_matches_profile(descriptor: dict[str, Any], profile: dict[str, Any]) -> bool:
    selected_fields = {
        "serial_number": str(profile.get("serial_number", "") or "").strip(),
        "ip": str(profile.get("ip", "") or "").strip(),
        "model": str(profile.get("model", "") or "").strip(),
    }
    active = {key: value for key, value in selected_fields.items() if value}
    if not active:
        return False
    return all(str(descriptor.get(key, "") or "").strip() == value for key, value in active.items())


def _load_existing_yaml_mapping(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise HardwareSetupError("PyYAML is required to save hardware YAML config") from exc
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise HardwareSetupError(f"Hardware config must be a mapping: {path}")
    return payload


def _write_yaml_mapping(path: Path, payload: dict[str, Any]) -> None:
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise HardwareSetupError("PyYAML is required to save hardware YAML config") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _ensure_mapping(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if isinstance(value, dict):
        return value
    next_value: dict[str, Any] = {}
    payload[key] = next_value
    return next_value


def _patch_non_empty(payload: dict[str, Any], key: str, value: Any) -> None:
    text = str(value or "").strip()
    if text:
        payload[key] = text


def _patch_allowed_models(camera_payload: dict[str, Any], selected_model: str) -> None:
    if not selected_model:
        return
    current = camera_payload.get("allowed_models")
    if current in (None, ""):
        return
    if not isinstance(current, list):
        current = [str(current)]
    cleaned = [str(item).strip() for item in current if str(item).strip()]
    if selected_model not in cleaned:
        cleaned.append(selected_model)
    camera_payload["allowed_models"] = cleaned


def _bound_camera_summary(camera_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "backend": str(camera_payload.get("backend", "") or ""),
        "model": str(camera_payload.get("model", "") or ""),
        "serial_number": str(camera_payload.get("serial_number", "") or ""),
        "ip": str(camera_payload.get("ip", "") or ""),
    }
