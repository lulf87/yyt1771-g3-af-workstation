from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core.hardware_config import load_hardware_config


def test_load_hardware_config_defaults_real_hardware_sync_tolerance_to_serial_window(tmp_path: Path) -> None:
    config_path = tmp_path / "realcamera_temp.local.yaml"
    config_path.write_text("{}", encoding="utf-8")

    config = load_hardware_config(config_path)

    assert config.camera.target_frame_rate_hz == 20.0
    assert config.run.temp_sync_target_ms == 1000.0
    assert config.run.save_raw_frames is False
    assert config.run.save_preview_frames is True
    assert config.run.preview_max_width == 1200


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
  save_raw_frames: true
  save_preview_frames: false
  preview_max_width: 960
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
    assert config.run.save_raw_frames is True
    assert config.run.save_preview_frames is False
    assert config.run.preview_max_width == 960


def test_load_hardware_config_reads_simulated_temperature_settings(tmp_path: Path) -> None:
    config_path = tmp_path / "simcamera_simtemp.local.yaml"
    config_path.write_text(
        """
camera:
  backend: simulated
temp:
  backend: simulated
  protocol: software
  simulated_start_celsius: 23.5
  simulated_step_celsius: 0.25
run:
  temp_sync_target_ms: 10
        """,
        encoding="utf-8",
    )

    config = load_hardware_config(config_path)

    assert config.camera.backend == "simulated"
    assert config.temp.backend == "simulated"
    assert config.temp.protocol == "software"
    assert config.temp.simulated_start_celsius == 23.5
    assert config.temp.simulated_step_celsius == 0.25
    assert config.run.temp_sync_target_ms == 10.0


def test_simulated_dataset_environment_overrides_profile_dataset(monkeypatch, tmp_path: Path) -> None:  # noqa: ANN001
    config_path = tmp_path / "simulated.yaml"
    config_path.write_text(
        "camera:\n  backend: simulated\n  simulated_dataset_id: golden_a_20260522_dev_lab\n"
        "temp:\n  backend: simulated\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("YYT1771_G3_SIMULATED_DATASET_ID", "golden_c_20260529_dev_lab")

    config = load_hardware_config(config_path)

    assert config.camera.simulated_dataset_id == "golden_c_20260529_dev_lab"
