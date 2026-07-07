from __future__ import annotations

import ctypes
import importlib
import os
from pathlib import Path
import platform
import sys
import tempfile
import types
from typing import Any

import numpy as np

from yyt1771_g3.camera.base import CameraFrame, CameraUnavailableError
from yyt1771_g3.core.timebase import now_ms


HIK_MVS_PYTHON_MODULE = "MvCameraControl_class"
HIK_MVS_PYTHON_PATH_ENV = "HIK_MVS_PYTHON_PATH"
HIK_MVS_LIBRARY_PATH_ENV = "HIK_MVS_LIBRARY_PATH"
HIK_MVS_LIBRARY_DIR_ENV = "HIK_MVS_LIBRARY_DIR"
_HIK_MVS_SOURCE_CACHE: dict[tuple[str, str], Any] = {}
_HIK_MVS_DLL_DIRECTORY_HANDLES: dict[str, Any] = {}
_HIK_MVS_SIDE_CAR_STAGING_DIR = Path(tempfile.gettempdir()) / "yyt1771_g3_mvs"
_HIK_MVS_SIDE_CAR_LIBRARIES = (
    "libMVGigEVisionSDK.dylib",
    "libMVU3VisionSDK.dylib",
    "libMediaProcess.dylib",
)


class HikMvsCameraSource:
    def __init__(self, profile: dict[str, Any] | None = None) -> None:
        self.profile = profile or {}
        self._session: Any | None = None

    def preview_frame(self) -> CameraFrame:
        session = self._session or self._create_session()
        self._session = session
        try:
            frame = session.preview_frame()
        except CameraUnavailableError:
            raise
        except Exception as exc:
            raise CameraUnavailableError(
                "Hik MVS camera frame acquisition failed",
                details={"error": str(exc), "profile": self.profile},
            ) from exc
        meta = {
            "transport": self.profile.get("transport", "gige_vision"),
            "backend": "hik_gige_mvs",
            "pixel_format": self.profile.get("pixel_format", "mono8"),
            **frame.camera_meta,
        }
        return CameraFrame(array=frame.array, timestamp_ms=frame.timestamp_ms, camera_meta=meta)

    def close(self) -> None:
        if self._session is not None and hasattr(self._session, "close"):
            self._session.close()
        self._session = None

    def _create_session(self) -> Any:
        sdk = self._load_sdk(self.profile)
        if hasattr(sdk, "create_camera"):
            return sdk.create_camera(self.profile)
        if hasattr(sdk, "MvCamera"):
            return _OfficialMvsCameraSession(sdk, self.profile)
        raise CameraUnavailableError(
            "Hik MVS SDK was loaded but no supported camera factory was found",
            details={"expected": "create_camera(profile) or MvCamera"},
        )

    @staticmethod
    def _load_sdk(profile: dict[str, Any] | None = None) -> Any:
        profile = profile or {}
        _prepend_sdk_python_paths(profile)
        _configure_sdk_library_search_paths(profile)
        try:
            return importlib.import_module(HIK_MVS_PYTHON_MODULE)
        except (ModuleNotFoundError, ImportError, OSError) as exc:
            try:
                source_loaded = _import_sdk_with_library_override(profile)
            except OSError as override_exc:
                raise CameraUnavailableError(
                    _sdk_unavailable_message(),
                    details=_sdk_error_details(profile, error=str(override_exc), direct_import_error=str(exc)),
                ) from override_exc
            if source_loaded is not None:
                return source_loaded
            raise CameraUnavailableError(
                _sdk_unavailable_message(),
                details=_sdk_error_details(profile, error=str(exc), direct_import_error=str(exc)),
            ) from exc


def get_hik_mvs_sdk_status(profile: dict[str, Any] | None = None) -> dict[str, Any]:
    profile = profile or {}
    try:
        HikMvsCameraSource._load_sdk(profile)
    except CameraUnavailableError as exc:
        return {
            "available": False,
            "error": str(exc),
            "details": exc.details,
        }
    except Exception as exc:
        return {
            "available": False,
            "error": str(exc),
            "details": _sdk_error_details(profile, error=str(exc), direct_import_error=str(exc)),
        }
    return {
        "available": True,
        "error": "",
        "details": {
            "platform": platform.system(),
            "configured_sdk_python_paths": _profile_path_strings(profile, "sdk_python_paths"),
            "configured_sdk_library_path": str(profile.get("sdk_library_path", "") or ""),
            "configured_sdk_library_dir": str(profile.get("sdk_library_dir", "") or ""),
        },
    }


class _OfficialMvsCameraSession:
    def __init__(self, sdk: Any, profile: dict[str, Any]) -> None:
        self.sdk = sdk
        self.profile = profile
        self.camera = sdk.MvCamera()
        self._opened = False
        self._grabbing = False
        self._payload_size = 0
        self._data_buffer: Any | None = None
        self._resulting_frame_rate: float | None = None
        self._selected: _DeviceDescriptor | None = None

    def preview_frame(self) -> CameraFrame:
        if not self._opened:
            self._open()
        if self._data_buffer is None or self._payload_size < 1:
            raise RuntimeError("Hik camera payload buffer is not initialized")

        frame_info = self.sdk.MV_FRAME_OUT_INFO_EX()
        self._sdk_call(
            self.camera.MV_CC_GetOneFrameTimeout(
                self._data_buffer,
                self._payload_size,
                frame_info,
                int(self.profile.get("timeout_ms", 1000) or 1000),
            ),
            "read frame",
        )
        array = self._frame_to_array(frame_info)
        return CameraFrame(
            array=array,
            timestamp_ms=timestamp_ms(),
            camera_meta=self._frame_meta(frame_info),
        )

    def close(self) -> None:
        for method_name in ["MV_CC_StopGrabbing", "MV_CC_CloseDevice", "MV_CC_DestroyHandle"]:
            method = getattr(self.camera, method_name, None)
            if callable(method):
                try:
                    method()
                except Exception:
                    continue
        self._opened = False
        self._grabbing = False
        self._payload_size = 0
        self._data_buffer = None

    def _open(self) -> None:
        descriptor = self._select_device()
        self._selected = descriptor
        self._sdk_call(self.camera.MV_CC_CreateHandle(descriptor.raw_info), "create handle")
        self._sdk_call(
            self.camera.MV_CC_OpenDevice(getattr(self.sdk, "MV_ACCESS_Exclusive", 1), 0),
            "open device",
        )
        self._configure_network_transport(descriptor)
        self._configure_trigger_mode()
        self._configure_pixel_format()
        self._configure_float("ExposureTime", float(self.profile.get("exposure_us", 10000) or 10000))
        self._configure_float("Gain", float(self.profile.get("gain_db", 0.0) or 0.0))
        self._configure_device_roi()
        self._configure_frame_rate()
        self._resulting_frame_rate = self._read_float("ResultingFrameRate")
        self._payload_size = self._read_payload_size()
        self._data_buffer = (ctypes.c_ubyte * self._payload_size)()
        self._sdk_call(self.camera.MV_CC_StartGrabbing(), "start grabbing")
        self._grabbing = True
        self._opened = True

    def _select_device(self) -> "_DeviceDescriptor":
        device_list = self.sdk.MV_CC_DEVICE_INFO_LIST()
        layer_type = int(getattr(self.sdk, "MV_GIGE_DEVICE", 1)) | int(getattr(self.sdk, "MV_USB_DEVICE", 4))
        self._sdk_call(self.sdk.MvCamera.MV_CC_EnumDevices(layer_type, device_list), "enumerate devices")
        descriptors: list[_DeviceDescriptor] = []
        for index in range(int(getattr(device_list, "nDeviceNum", 0))):
            raw_entry = device_list.pDeviceInfo[index]
            if raw_entry is None:
                continue
            raw_info = raw_entry.contents if hasattr(raw_entry, "contents") else raw_entry
            descriptors.append(self._describe_device(index, raw_info))
        if not descriptors:
            raise RuntimeError("No Hik cameras were discovered by the MVS SDK")

        serial_number = str(self.profile.get("serial_number", "") or "").strip()
        ip = str(self.profile.get("ip", "") or "").strip()
        model = str(self.profile.get("model", "") or "").strip()
        allowed_models = [str(item).strip() for item in self.profile.get("allowed_models", []) if str(item).strip()]
        filtered = descriptors
        if serial_number:
            filtered = [item for item in filtered if item.serial_number == serial_number]
        if ip:
            filtered = [item for item in filtered if item.ip == ip]
        if model:
            filtered = [item for item in filtered if item.model == model]
        if allowed_models:
            filtered = [item for item in filtered if item.model in allowed_models]
        if not filtered:
            raise RuntimeError("No Hik camera matched the configured selection")
        return filtered[0]

    def _describe_device(self, index: int, raw_info: Any) -> "_DeviceDescriptor":
        transport_code = int(getattr(raw_info, "nTLayerType", 0))
        if transport_code == int(getattr(self.sdk, "MV_GIGE_DEVICE", 1)):
            gige_info = raw_info.SpecialInfo.stGigEInfo
            return _DeviceDescriptor(
                index=index,
                raw_info=raw_info,
                transport="gige_vision",
                model=_decode_sdk_char_buffer(getattr(gige_info, "chModelName", "")),
                serial_number=_decode_sdk_char_buffer(getattr(gige_info, "chSerialNumber", "")),
                ip=_ip_from_int(int(getattr(gige_info, "nCurrentIp", 0))),
            )
        return _DeviceDescriptor(index=index, raw_info=raw_info, transport="unknown", model="", serial_number="", ip="")

    def _configure_network_transport(self, descriptor: "_DeviceDescriptor") -> None:
        if descriptor.transport != "gige_vision":
            return
        packet_size = getattr(self.camera, "MV_CC_GetOptimalPacketSize", lambda: 0)()
        if int(packet_size) > 0:
            self._set_int("GevSCPSPacketSize", int(packet_size))

    def _configure_trigger_mode(self) -> None:
        trigger_mode = str(self.profile.get("trigger_mode", "free_run") or "free_run")
        if trigger_mode not in {"free_run", "free-run", "continuous"}:
            raise RuntimeError(f"Unsupported Hik trigger_mode: {trigger_mode}")
        setter = getattr(self.camera, "MV_CC_SetEnumValue", None)
        if callable(setter):
            self._sdk_call(setter("TriggerMode", int(getattr(self.sdk, "MV_TRIGGER_MODE_OFF", 0))), "set trigger mode")

    def _configure_pixel_format(self) -> None:
        pixel_format = str(self.profile.get("pixel_format", "mono8") or "mono8").lower()
        if pixel_format != "mono8":
            raise RuntimeError("G3 real camera frame acquisition currently supports only mono8")
        setter = getattr(self.camera, "MV_CC_SetEnumValueByString", None)
        if callable(setter):
            int(setter("PixelFormat", "Mono8"))

    def _configure_float(self, key: str, value: float) -> None:
        setter = getattr(self.camera, "MV_CC_SetFloatValue", None)
        if callable(setter):
            self._sdk_call(setter(key, float(value)), f"set {key}")

    def _configure_device_roi(self) -> None:
        roi = self.profile.get("device_roi")
        if not isinstance(roi, dict):
            return
        width = int(roi.get("width", 0) or 0)
        height = int(roi.get("height", 0) or 0)
        if width < 1 or height < 1:
            return
        self._set_int("OffsetX", 0)
        self._set_int("OffsetY", 0)
        self._set_int("Width", width)
        self._set_int("Height", height)
        self._set_int("OffsetX", int(roi.get("x", 0) or 0))
        self._set_int("OffsetY", int(roi.get("y", 0) or 0))

    def _configure_frame_rate(self) -> None:
        target = self.profile.get("target_frame_rate_hz")
        if target in (None, "", 0, "0"):
            return
        bool_setter = getattr(self.camera, "MV_CC_SetBoolValue", None)
        if callable(bool_setter):
            self._sdk_call(bool_setter("AcquisitionFrameRateEnable", True), "enable acquisition frame rate")
        self._configure_float("AcquisitionFrameRate", float(target))

    def _set_int(self, key: str, value: int) -> None:
        setter = getattr(self.camera, "MV_CC_SetIntValue", None)
        if callable(setter):
            self._sdk_call(setter(key, int(value)), f"set {key}")

    def _read_payload_size(self) -> int:
        payload_size = self._read_int("PayloadSize")
        if payload_size is None or payload_size < 1:
            raise RuntimeError(f"Hik camera reported invalid payload size: {payload_size}")
        return payload_size

    def _read_int(self, key: str) -> int | None:
        getter = getattr(self.camera, "MV_CC_GetIntValue", None)
        value_type = getattr(self.sdk, "MVCC_INTVALUE", None)
        if not callable(getter) or value_type is None:
            return None
        value = value_type()
        if int(getter(key, value)) != 0:
            return None
        return int(getattr(value, "nCurValue", 0))

    def _read_float(self, key: str) -> float | None:
        getter = getattr(self.camera, "MV_CC_GetFloatValue", None)
        value_type = getattr(self.sdk, "MVCC_FLOATVALUE", None)
        if not callable(getter) or value_type is None:
            return None
        value = value_type()
        if int(getter(key, value)) != 0:
            return None
        return float(getattr(value, "fCurValue", 0.0))

    def _frame_to_array(self, frame_info: Any) -> np.ndarray:
        width = int(getattr(frame_info, "nWidth", 0))
        height = int(getattr(frame_info, "nHeight", 0))
        if width < 1 or height < 1:
            raise RuntimeError(f"Hik camera returned empty frame: {width}x{height}")
        mono8_pixel_type = getattr(self.sdk, "PixelType_Gvsp_Mono8", None)
        frame_pixel_type = getattr(frame_info, "enPixelType", None)
        if mono8_pixel_type is not None and frame_pixel_type != mono8_pixel_type:
            raise RuntimeError("Hik frame pixel type is not Mono8")
        expected = width * height
        if self._data_buffer is None or self._payload_size < expected:
            raise RuntimeError(f"Hik frame buffer is shorter than expected: need {expected}, got {self._payload_size}")
        return np.frombuffer(bytes(bytearray(self._data_buffer[:expected])), dtype=np.uint8).reshape((height, width)).copy()

    def _frame_meta(self, frame_info: Any) -> dict[str, Any]:
        selected = self._selected
        meta: dict[str, Any] = {
            "model": selected.model if selected else str(self.profile.get("model", "") or ""),
            "serial_number": selected.serial_number if selected else str(self.profile.get("serial_number", "") or ""),
            "ip": selected.ip if selected else str(self.profile.get("ip", "") or ""),
            "trigger_mode": str(self.profile.get("trigger_mode", "free_run") or "free_run"),
        }
        frame_id = _positive_int_or_none(getattr(frame_info, "nFrameNum", None))
        if frame_id is not None:
            meta["camera_frame_id"] = frame_id
        frame_counter = _positive_int_or_none(getattr(frame_info, "nFrameCounter", None))
        if frame_counter is not None:
            meta["camera_frame_counter"] = frame_counter
        lost_packet_count = _positive_int_or_none(getattr(frame_info, "nLostPacket", None))
        if lost_packet_count is not None:
            meta["camera_lost_packet_count"] = lost_packet_count
        if self._resulting_frame_rate is not None:
            meta["camera_resulting_fps"] = self._resulting_frame_rate
        return meta

    def _sdk_call(self, ret_code: Any, action: str) -> None:
        ret = int(ret_code)
        if ret != 0:
            raise RuntimeError(f"Failed to {action} via Hik MVS SDK (ret=0x{ret:x})")


class _DeviceDescriptor:
    def __init__(self, *, index: int, raw_info: Any, transport: str, model: str, serial_number: str, ip: str) -> None:
        self.index = index
        self.raw_info = raw_info
        self.transport = transport
        self.model = model
        self.serial_number = serial_number
        self.ip = ip


def _prepend_sdk_python_paths(profile: dict[str, Any]) -> None:
    raw_paths = os.environ.get(HIK_MVS_PYTHON_PATH_ENV, "")
    paths = [Path(part).expanduser() for part in raw_paths.split(os.pathsep) if part.strip()]
    profile_paths = profile.get("sdk_python_paths")
    if isinstance(profile_paths, list):
        paths.extend(Path(str(part)).expanduser() for part in profile_paths if str(part).strip())
    for path in reversed(paths):
        if path.exists() and str(path) not in sys.path:
            sys.path.insert(0, str(path))
    if paths:
        importlib.invalidate_caches()


def _configure_sdk_library_search_paths(profile: dict[str, Any]) -> None:
    for directory in reversed(_configured_sdk_library_dirs(profile)):
        directory_text = str(directory)
        _prepend_to_process_path(directory_text)
        if platform.system() == "Windows" and hasattr(os, "add_dll_directory"):
            if directory_text in _HIK_MVS_DLL_DIRECTORY_HANDLES:
                continue
            try:
                _HIK_MVS_DLL_DIRECTORY_HANDLES[directory_text] = os.add_dll_directory(directory_text)  # type: ignore[attr-defined]
            except (FileNotFoundError, OSError):
                continue


def _prepend_to_process_path(directory: str) -> None:
    current_entries = [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry]
    if directory in current_entries:
        return
    os.environ["PATH"] = os.pathsep.join([directory, *current_entries])


def _import_sdk_with_library_override(profile: dict[str, Any]) -> Any | None:
    library_path = _configured_sdk_library_path(profile)
    if library_path is None:
        return None
    module_source = _find_sdk_module_source(profile)
    if module_source is None:
        return None
    _ensure_hik_runtime_sidecar_symlinks(library_path.parent)
    sys.modules.pop(HIK_MVS_PYTHON_MODULE, None)
    return _load_sdk_module_from_source(module_source, library_path)


def _configured_sdk_library_path(profile: dict[str, Any]) -> Path | None:
    profile_path = str(profile.get("sdk_library_path", "") or "").strip()
    if profile_path:
        candidate = Path(profile_path).expanduser()
        if candidate.is_file():
            return candidate
    env_path = os.environ.get(HIK_MVS_LIBRARY_PATH_ENV, "").strip()
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.is_file():
            return candidate
    for directory in _configured_sdk_library_dirs(profile):
        for library_name in _candidate_library_names():
            candidate = directory / library_name
            if candidate.is_file():
                return candidate
    return None


def _configured_sdk_library_dirs(profile: dict[str, Any]) -> list[Path]:
    paths: list[Path] = []
    env_dir = os.environ.get(HIK_MVS_LIBRARY_DIR_ENV, "").strip()
    if env_dir:
        paths.append(Path(env_dir).expanduser())
    profile_dir = str(profile.get("sdk_library_dir", "") or "").strip()
    if profile_dir:
        paths.append(Path(profile_dir).expanduser())
    library_path = str(profile.get("sdk_library_path", "") or "").strip()
    if library_path:
        paths.append(Path(library_path).expanduser().parent)
    env_path = os.environ.get(HIK_MVS_LIBRARY_PATH_ENV, "").strip()
    if env_path:
        paths.append(Path(env_path).expanduser().parent)
    seen: set[str] = set()
    existing: list[Path] = []
    for path in paths:
        key = str(path)
        if key in seen or not path.is_dir():
            continue
        seen.add(key)
        existing.append(path)
    return existing


def _candidate_library_names() -> list[str]:
    current_platform = platform.system()
    if current_platform == "Windows":
        return ["MvCameraControl.dll", "MvCameraControl"]
    if current_platform == "Darwin":
        return ["libMvCameraControl.dylib", "MvCameraControl.dylib"]
    return ["libMvCameraControl.so", "MvCameraControl.so"]


def _find_sdk_module_source(profile: dict[str, Any]) -> Path | None:
    for directory in _configured_sdk_python_paths(profile):
        candidate = directory / f"{HIK_MVS_PYTHON_MODULE}.py"
        if candidate.is_file():
            return candidate
    for raw_path in sys.path:
        if not raw_path:
            continue
        candidate = Path(raw_path) / f"{HIK_MVS_PYTHON_MODULE}.py"
        if candidate.is_file():
            return candidate
    return None


def _configured_sdk_python_paths(profile: dict[str, Any]) -> list[Path]:
    paths: list[Path] = []
    raw_paths = os.environ.get(HIK_MVS_PYTHON_PATH_ENV, "")
    paths.extend(Path(part).expanduser() for part in raw_paths.split(os.pathsep) if part.strip())
    profile_paths = profile.get("sdk_python_paths")
    if isinstance(profile_paths, list):
        paths.extend(Path(str(part)).expanduser() for part in profile_paths if str(part).strip())
    seen: set[Path] = set()
    existing: list[Path] = []
    for path in paths:
        if not path.exists():
            continue
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        existing.append(path)
    return existing


def _load_sdk_module_from_source(module_source: Path, library_path: Path) -> Any:
    cache_key = (str(module_source.resolve()), str(library_path.resolve()))
    cached = _HIK_MVS_SOURCE_CACHE.get(cache_key)
    if cached is not None:
        return cached
    source_text = module_source.read_text(encoding="utf-8")
    patched_source = _patch_sdk_load_library_source(source_text, str(library_path))
    module = types.ModuleType(f"{HIK_MVS_PYTHON_MODULE}__g3_override")
    module.__file__ = str(module_source)
    module.__package__ = ""
    module_dir = str(module_source.parent)
    should_remove = False
    if module_dir not in sys.path:
        sys.path.insert(0, module_dir)
        should_remove = True
    try:
        exec(compile(patched_source, str(module_source), "exec"), module.__dict__)
    finally:
        if should_remove:
            sys.path.pop(0)
    _HIK_MVS_SOURCE_CACHE[cache_key] = module
    return module


def _patch_sdk_load_library_source(source_text: str, library_path: str) -> str:
    patched = source_text
    literal = repr(library_path)
    replacements = [
        "/usr/local/lib/libMvCameraControl.dylib",
        "libMvCameraControl.dylib",
        "MvCameraControl.dylib",
        "libMvCameraControl.so",
        "MvCameraControl.so",
        "MvCameraControl.dll",
        "MvCameraControl",
    ]
    for needle in replacements:
        for quote in ('"', "'"):
            patched = patched.replace(f"LoadLibrary({quote}{needle}{quote})", f"LoadLibrary({literal})")
            patched = patched.replace(f"CDLL({quote}{needle}{quote})", f"CDLL({literal})")
            patched = patched.replace(f"WinDLL({quote}{needle}{quote})", f"WinDLL({literal})")
    return patched


def _sdk_unavailable_message() -> str:
    if platform.system() == "Windows":
        return (
            "Hik MVS SDK is not available on Windows. Install MVS, set camera.sdk_python_paths "
            "to the MvImport directory, and set camera.sdk_library_dir to the folder containing "
            "MvCameraControl.dll."
        )
    return "Hik MVS SDK is not available; offline playback and live offline run remain available"


def _sdk_error_details(profile: dict[str, Any], *, error: str, direct_import_error: str) -> dict[str, Any]:
    configured_library_dir = str(profile.get("sdk_library_dir", "") or "")
    env_library_dir = os.environ.get(HIK_MVS_LIBRARY_DIR_ENV, "")
    path_entries = [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry]
    sdk_library_dirs = [str(path) for path in _configured_sdk_library_dirs(profile)]
    relevant_sys_path = [
        item
        for item in sys.path
        if "MVS" in item or "MvImport" in item or any(item == path for path in _profile_path_strings(profile, "sdk_python_paths"))
    ]
    library_dir_to_check = configured_library_dir or env_library_dir
    return {
        "platform": platform.system(),
        "missing_module": HIK_MVS_PYTHON_MODULE,
        "HIK_MVS_PYTHON_PATH": os.environ.get(HIK_MVS_PYTHON_PATH_ENV, ""),
        "HIK_MVS_LIBRARY_PATH": os.environ.get(HIK_MVS_LIBRARY_PATH_ENV, ""),
        "HIK_MVS_LIBRARY_DIR": env_library_dir,
        "configured_sdk_python_paths": _profile_path_strings(profile, "sdk_python_paths"),
        "configured_sdk_library_path": str(profile.get("sdk_library_path", "") or ""),
        "configured_sdk_library_dir": configured_library_dir,
        "sdk_python_paths": _profile_path_strings(profile, "sdk_python_paths"),
        "sdk_library_path": str(_configured_sdk_library_path(profile) or profile.get("sdk_library_path", "") or ""),
        "sdk_library_dirs": sdk_library_dirs,
        "sys_path_candidate_entries": relevant_sys_path,
        "path_contains_sdk_library_dir": bool(library_dir_to_check and library_dir_to_check in path_entries),
        "error": error,
        "direct_import_error": direct_import_error,
    }


def _ensure_hik_runtime_sidecar_symlinks(runtime_lib_dir: Path) -> None:
    if not runtime_lib_dir.is_dir():
        return
    _HIK_MVS_SIDE_CAR_STAGING_DIR.mkdir(parents=True, exist_ok=True)
    for library_name in _HIK_MVS_SIDE_CAR_LIBRARIES:
        source = runtime_lib_dir / library_name
        if not source.is_file():
            continue
        target = _HIK_MVS_SIDE_CAR_STAGING_DIR / library_name
        source_resolved = source.resolve()
        if target.is_symlink():
            try:
                if target.resolve() == source_resolved:
                    continue
            except OSError:
                pass
            target.unlink()
        elif target.exists():
            target.unlink()
        target.symlink_to(source_resolved)


def _profile_path_strings(profile: dict[str, Any], key: str) -> list[str]:
    raw_paths = profile.get(key)
    if not isinstance(raw_paths, list):
        return []
    return [str(path) for path in raw_paths if str(path).strip()]


def _decode_sdk_char_buffer(value: Any) -> str:
    if isinstance(value, bytes):
        raw = value
    elif isinstance(value, str):
        raw = value.encode("utf-8")
    else:
        raw = bytes(int(item) & 0xFF for item in value)
    return raw.split(b"\0", 1)[0].decode("utf-8", errors="ignore").strip()


def _ip_from_int(value: int) -> str:
    if value <= 0:
        return ""
    return ".".join(str((value >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def _positive_int_or_none(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def timestamp_ms() -> int:
    return now_ms()


__all__ = ["CameraUnavailableError", "HikMvsCameraSource", "get_hik_mvs_sdk_status"]
