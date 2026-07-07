from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


HARDWARE_CONFIG_ENV = "YYT1771_G3_HARDWARE_CONFIG"
DEFAULT_TEMP_SYNC_TARGET_MS = 1000.0


@dataclass(frozen=True)
class DeviceRoiConfig:
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0


@dataclass(frozen=True)
class CameraConfig:
    backend: str = "hik_gige_mvs"
    transport: str = "gige_vision"
    sdk: str = "hik_mvs"
    probe_mode: str = "protocol_any"
    allowed_models: list[str] = field(default_factory=list)
    model: str = ""
    serial_number: str = ""
    ip: str = ""
    trigger_mode: str = "free_run"
    pixel_format: str = "mono8"
    exposure_us: int = 10000
    gain_db: float = 0.0
    timeout_ms: int = 1000
    target_frame_rate_hz: float | None = 10.0
    device_roi: DeviceRoiConfig = field(default_factory=DeviceRoiConfig)
    sdk_python_paths: list[str] = field(default_factory=list)
    sdk_library_path: str = ""
    simulated_dataset_id: str = ""
    simulated_start_frame: int = 1
    simulated_loop: bool = True

    def to_profile(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SerialPortConfig:
    port: str = ""
    baudrate: int = 19200
    bytesize: int = 8
    parity: str = "N"
    stopbits: int = 1
    timeout_ms: int = 500


@dataclass(frozen=True)
class TempRegisterConfig:
    function_code: int = 3
    start_address: int = 0
    register_count: int = 1
    signed: bool = False
    decode_scale: float = 1.0
    encode_scale: float = 1.0


@dataclass(frozen=True)
class TempRegisterMapConfig:
    process_value: TempRegisterConfig = field(
        default_factory=lambda: TempRegisterConfig(
            function_code=3,
            start_address=264,
            register_count=1,
            signed=True,
            decode_scale=0.1,
        )
    )
    target_or_stop_value: TempRegisterConfig = field(
        default_factory=lambda: TempRegisterConfig(
            function_code=6,
            start_address=0,
            register_count=1,
            signed=True,
            encode_scale=10.0,
        )
    )
    output_power: TempRegisterConfig = field(
        default_factory=lambda: TempRegisterConfig(
            function_code=6,
            start_address=4,
            register_count=1,
            signed=False,
            encode_scale=256.0,
        )
    )


@dataclass(frozen=True)
class TempControlConfig:
    start_output_mode: str = "power_nonzero"
    startup_power_percent: float = 100.0
    completion_mode: str = "target_reached"


@dataclass(frozen=True)
class TempConfig:
    backend: str = "lu92xx_modbus_rtu"
    protocol: str = "modbus_rtu"
    slave_address: int = 1
    serial: SerialPortConfig = field(default_factory=SerialPortConfig)
    register_map: TempRegisterMapConfig = field(default_factory=TempRegisterMapConfig)
    control: TempControlConfig = field(default_factory=TempControlConfig)
    simulated_start_celsius: float = 25.0
    simulated_step_celsius: float = 0.05


@dataclass(frozen=True)
class RunHardwareConfig:
    measurement_target_hz: float = 10.0
    temp_sync_target_ms: float = DEFAULT_TEMP_SYNC_TARGET_MS
    save_raw_frames: bool = False
    save_preview_frames: bool = True
    preview_max_width: int = 1200


@dataclass(frozen=True)
class HardwareConfig:
    camera: CameraConfig = field(default_factory=CameraConfig)
    temp: TempConfig = field(default_factory=TempConfig)
    run: RunHardwareConfig = field(default_factory=RunHardwareConfig)


def load_hardware_config(path: str | Path | None = None) -> HardwareConfig:
    config_path = Path(path).expanduser() if path is not None else _default_config_path()
    if not config_path.exists():
        return HardwareConfig()
    payload = _load_yaml_mapping(config_path)
    return hardware_config_from_mapping(payload)


def hardware_config_from_mapping(payload: dict[str, Any]) -> HardwareConfig:
    return HardwareConfig(
        camera=_camera_config(_mapping(payload.get("camera"))),
        temp=_temp_config(_mapping(payload.get("temp"))),
        run=_run_config(_mapping(payload.get("run"))),
    )


def _camera_config(payload: dict[str, Any]) -> CameraConfig:
    roi = _mapping(payload.get("device_roi"))
    return CameraConfig(
        backend=str(payload.get("backend", "hik_gige_mvs") or "hik_gige_mvs"),
        transport=str(payload.get("transport", "gige_vision") or "gige_vision"),
        sdk=str(payload.get("sdk", "hik_mvs") or "hik_mvs"),
        probe_mode=str(payload.get("probe_mode", "protocol_any") or "protocol_any"),
        allowed_models=_string_list(payload.get("allowed_models")),
        model=str(payload.get("model", "") or ""),
        serial_number=str(payload.get("serial_number", "") or ""),
        ip=str(payload.get("ip", "") or ""),
        trigger_mode=str(payload.get("trigger_mode", "free_run") or "free_run"),
        pixel_format=str(payload.get("pixel_format", "mono8") or "mono8"),
        exposure_us=int(payload.get("exposure_us", 10000) or 10000),
        gain_db=float(payload.get("gain_db", 0.0) or 0.0),
        timeout_ms=int(payload.get("timeout_ms", 1000) or 1000),
        target_frame_rate_hz=_optional_float(payload.get("target_frame_rate_hz"), 10.0),
        device_roi=DeviceRoiConfig(
            x=int(roi.get("x", 0) or 0),
            y=int(roi.get("y", 0) or 0),
            width=int(roi.get("width", 0) or 0),
            height=int(roi.get("height", 0) or 0),
        ),
        sdk_python_paths=_string_list(payload.get("sdk_python_paths")),
        sdk_library_path=str(payload.get("sdk_library_path", "") or ""),
        simulated_dataset_id=str(payload.get("simulated_dataset_id", "") or ""),
        simulated_start_frame=int(payload.get("simulated_start_frame", 1) or 1),
        simulated_loop=bool(payload.get("simulated_loop", True)),
    )


def _temp_config(payload: dict[str, Any]) -> TempConfig:
    register_map = _mapping(payload.get("register_map"))
    return TempConfig(
        backend=str(payload.get("backend", "lu92xx_modbus_rtu") or "lu92xx_modbus_rtu"),
        protocol=str(payload.get("protocol", "modbus_rtu") or "modbus_rtu"),
        slave_address=int(payload.get("slave_address", 1) or 1),
        serial=_serial_config(_mapping(payload.get("serial"))),
        register_map=TempRegisterMapConfig(
            process_value=_register_config(
                _mapping(register_map.get("process_value")),
                default=TempRegisterMapConfig().process_value,
            ),
            target_or_stop_value=_register_config(
                _mapping(register_map.get("target_or_stop_value")),
                default=TempRegisterMapConfig().target_or_stop_value,
            ),
            output_power=_register_config(
                _mapping(register_map.get("output_power")),
                default=TempRegisterMapConfig().output_power,
            ),
        ),
        control=_control_config(_mapping(payload.get("control"))),
        simulated_start_celsius=float(payload.get("simulated_start_celsius", 25.0) or 25.0),
        simulated_step_celsius=float(payload.get("simulated_step_celsius", 0.05) or 0.05),
    )


def _serial_config(payload: dict[str, Any]) -> SerialPortConfig:
    return SerialPortConfig(
        port=str(payload.get("port", "") or ""),
        baudrate=int(payload.get("baudrate", 19200) or 19200),
        bytesize=int(payload.get("bytesize", 8) or 8),
        parity=str(payload.get("parity", "N") or "N"),
        stopbits=int(payload.get("stopbits", 1) or 1),
        timeout_ms=int(payload.get("timeout_ms", 500) or 500),
    )


def _register_config(payload: dict[str, Any], *, default: TempRegisterConfig) -> TempRegisterConfig:
    return TempRegisterConfig(
        function_code=int(payload.get("function_code", default.function_code) or default.function_code),
        start_address=int(payload.get("start_address", default.start_address) or default.start_address),
        register_count=int(payload.get("register_count", default.register_count) or default.register_count),
        signed=bool(payload.get("signed", default.signed)),
        decode_scale=float(payload.get("decode_scale", default.decode_scale) or default.decode_scale),
        encode_scale=float(payload.get("encode_scale", default.encode_scale) or default.encode_scale),
    )


def _control_config(payload: dict[str, Any]) -> TempControlConfig:
    return TempControlConfig(
        start_output_mode=str(payload.get("start_output_mode", "power_nonzero") or "power_nonzero"),
        startup_power_percent=float(payload.get("startup_power_percent", 100.0) or 100.0),
        completion_mode=str(payload.get("completion_mode", "target_reached") or "target_reached"),
    )


def _run_config(payload: dict[str, Any]) -> RunHardwareConfig:
    return RunHardwareConfig(
        measurement_target_hz=float(payload.get("measurement_target_hz", 10.0) or 10.0),
        temp_sync_target_ms=float(payload.get("temp_sync_target_ms", DEFAULT_TEMP_SYNC_TARGET_MS) or DEFAULT_TEMP_SYNC_TARGET_MS),
        save_raw_frames=bool(payload.get("save_raw_frames", False)),
        save_preview_frames=bool(payload.get("save_preview_frames", True)),
        preview_max_width=int(payload.get("preview_max_width", 1200) or 1200),
    )


def _default_config_path() -> Path:
    configured = os.environ.get(HARDWARE_CONFIG_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return _project_root() / "configs" / "local" / "realcamera_temp.local.yaml"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _load_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except ImportError as exc:  # pragma: no cover - local dependency guard
        raise RuntimeError("PyYAML is required to load hardware YAML config") from exc
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ValueError(f"Hardware config must be a mapping: {path}")
    return payload


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in (None, ""):
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _optional_float(value: Any, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    parsed = float(value)
    return parsed if parsed > 0 else None
