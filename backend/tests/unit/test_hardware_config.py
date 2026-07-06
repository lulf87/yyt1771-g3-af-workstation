from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core.hardware_config import load_hardware_config


def test_load_hardware_config_defaults_real_hardware_sync_tolerance_to_serial_window(tmp_path: Path) -> None:
    config_path = tmp_path / "realcamera_temp.local.yaml"
    config_path.write_text("{}", encoding="utf-8")

    config = load_hardware_config(config_path)

    assert config.run.temp_sync_target_ms == 1000.0


def test_load_hardware_config_merges_starter_style_camera_and_temp_settings(tmp_path: Path) -> None:
    config_path = tmp_path / "realcamera_temp.local.yaml"
    config_path.write_text(
        """
camera:
  backend: hik_gige_mvs
  transport: gige_vision
  sdk: hik_mvs
  probe_mode: protocol_any
  allowed_models:
    - MV-CU060-10GM
  serial_number: ""
  ip: ""
  trigger_mode: free_run
  pixel_format: mono8
  exposure_us: 10000
  gain_db: 0.0
  timeout_ms: 1000
  target_frame_rate_hz: 10
  device_roi:
    x: 512
    y: 342
    width: 2048
    height: 1364
temp:
  backend: lu92xx_modbus_rtu
  protocol: modbus_rtu
  slave_address: 1
  serial:
    port: COM5
    baudrate: 19200
    bytesize: 8
    parity: N
    stopbits: 1
    timeout_ms: 500
  register_map:
    process_value:
      start_address: 264
      decode_scale: 0.1
    target_or_stop_value:
      start_address: 0
      encode_scale: 10.0
    output_power:
      start_address: 4
      encode_scale: 256.0
  control:
    startup_power_percent: 100.0
run:
  measurement_target_hz: 10
  temp_sync_target_ms: 10
        """,
        encoding="utf-8",
    )

    config = load_hardware_config(config_path)

    assert config.camera.backend == "hik_gige_mvs"
    assert config.camera.device_roi.width == 2048
    assert config.camera.target_frame_rate_hz == 10.0
    assert config.temp.serial.port == "COM5"
    assert config.temp.register_map.process_value.start_address == 264
    assert config.temp.register_map.target_or_stop_value.encode_scale == 10.0
    assert config.temp.register_map.output_power.encode_scale == 256.0
    assert config.run.measurement_target_hz == 10.0
    assert config.run.temp_sync_target_ms == 10.0
