from __future__ import annotations

from pathlib import Path

import numpy as np

from yyt1771_g3.camera.base import CameraFrame
from yyt1771_g3.core.enums import DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectorConfig, MeasurementDefinition, RotatedROI
from yyt1771_g3.services.real_camera_run_service import run_real_camera
from yyt1771_g3.storage.run_store import RunStore
from yyt1771_g3.temperature.base import TemperatureReading


class FakeCameraSource:
    def __init__(self) -> None:
        self.index = 0
        self.closed = False

    def preview_frame(self) -> CameraFrame:
        self.index += 1
        frame = np.full((80, 120), 245, dtype=np.uint8)
        frame[25:46, 35:86] = 30
        return CameraFrame(
            array=frame,
            timestamp_ms=1000 + self.index * 100,
            camera_meta={
                "transport": "gige_vision",
                "backend": "hik_gige_mvs",
                "pixel_format": "mono8",
                "frame_id": self.index,
            },
        )

    def close(self) -> None:
        self.closed = True


class FakeTemperatureController:
    def __init__(self) -> None:
        self.index = 0
        self.target_values: list[float] = []
        self.power_values: list[float] = []
        self.started = False
        self.stopped = False
        self.closed = False

    def read_temperature(self) -> TemperatureReading:
        self.index += 1
        return TemperatureReading(
            timestamp_ms=1000 + self.index * 100 + 3,
            celsius=20.0 + self.index,
            source="lu92xx_modbus_rtu",
        )

    def set_target_temperature(self, celsius: float) -> None:
        self.target_values.append(celsius)

    def set_output_power_percent(self, percent: float) -> None:
        self.power_values.append(percent)

    def start_output(self) -> None:
        self.started = True

    def stop_output(self) -> None:
        self.stopped = True

    def close(self) -> None:
        self.closed = True


class FailingTemperatureController:
    def __init__(self) -> None:
        self.stopped = False
        self.closed = False

    def read_temperature(self) -> TemperatureReading:
        raise RuntimeError("serial port unavailable")

    def set_output_power_percent(self, percent: float) -> None:
        raise RuntimeError("serial port unavailable")

    def start_output(self) -> None:
        raise RuntimeError("serial port unavailable")

    def stop_output(self) -> None:
        self.stopped = True
        raise RuntimeError("serial port unavailable during stop")

    def close(self) -> None:
        self.closed = True


class PartiallyFailingTemperatureController:
    def __init__(self) -> None:
        self.target_values: list[float] = []
        self.power_values: list[float] = []
        self.started = False
        self.stopped = False
        self.closed = False

    def read_temperature(self) -> TemperatureReading:
        raise RuntimeError("read skipped after startup error")

    def set_target_temperature(self, celsius: float) -> None:
        self.target_values.append(celsius)
        raise RuntimeError("target register unavailable")

    def set_output_power_percent(self, percent: float) -> None:
        self.power_values.append(percent)

    def start_output(self) -> None:
        self.started = True

    def stop_output(self) -> None:
        self.stopped = True

    def close(self) -> None:
        self.closed = True


def test_real_camera_run_saves_raw_frames_camera_meta_and_manifest(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=3,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )
    source = FakeCameraSource()

    result = run_real_camera(
        run_store,
        camera_source=source,
        measurement=measurement,
        max_frames=3,
        target_fps=8.0,
    )

    assert source.closed is True
    assert len(result.manifest.frame_records) == 3
    assert result.manifest.frame_records[0].camera_meta["backend"] == "hik_gige_mvs"
    assert result.manifest.frame_records[0].frame_path.endswith("raw_frames/frame_000001.npy")
    assert (run_store.run_dir(result.manifest.run_id) / "raw_frames" / "frame_000001.npy").is_file()
    assert len(result.manifest.detection_results) == 3
    assert result.manifest.config_snapshot["mode"] == "real_camera_run"

    restored = run_store.read_run_manifest(result.manifest.run_id)
    assert restored == result.manifest


def test_real_camera_run_samples_lu92xx_temperature_each_frame(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-temp-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=2,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
            target_temperature_celsius=55.0,
            temperature_power_percent=68.0,
        ),
    )
    temperature = FakeTemperatureController()

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=2,
        target_fps=10.0,
        temp_sync_target_ms=10.0,
    )

    assert temperature.target_values == [55.0]
    assert temperature.power_values == [68.0]
    assert temperature.started is True
    assert temperature.stopped is True
    assert temperature.closed is True
    assert [record.celsius for record in result.manifest.temperature_records] == [21.0, 22.0]
    assert [record.source for record in result.manifest.temperature_records] == [
        "lu92xx_modbus_rtu",
        "lu92xx_modbus_rtu",
    ]
    assert [item.temperature_celsius for item in result.manifest.detection_results] == [21.0, 22.0]
    assert {item.temperature_sync_status for item in result.manifest.detection_results} == {"TEMP_SYNC_OK"}
    assert result.manifest.config_snapshot["temperature_backend"] == "lu92xx_modbus_rtu"
    assert result.analysis.temperature_distance


def test_real_camera_run_records_missing_temperature_when_controller_prepare_fails(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-temp-missing-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=1,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
            temperature_power_percent=68.0,
        ),
    )
    temperature = FailingTemperatureController()

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=1,
        target_fps=10.0,
        temp_sync_target_ms=10.0,
    )

    assert temperature.stopped is True
    assert temperature.closed is True
    assert len(result.manifest.frame_records) == 1
    assert result.manifest.temperature_records[0].celsius is None
    assert result.manifest.temperature_records[0].sampled_this_frame is False
    assert "serial port unavailable" in result.manifest.temperature_records[0].error
    assert result.manifest.detection_results[0].temperature_sync_status == "TEMP_SYNC_MISSING"
    assert not result.analysis.temperature_distance


def test_real_camera_run_best_effort_temperature_startup_attempts_all_controls(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-temp-best-effort-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=1,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
            target_temperature_celsius=55.0,
            temperature_power_percent=68.0,
        ),
    )
    temperature = PartiallyFailingTemperatureController()

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=1,
        target_fps=10.0,
        temp_sync_target_ms=10.0,
    )

    assert temperature.target_values == [55.0]
    assert temperature.power_values == [68.0]
    assert temperature.started is True
    assert temperature.stopped is True
    assert temperature.closed is True
    assert len(result.manifest.detection_results) == 1
    assert result.manifest.temperature_records[0].celsius is None
    assert "set_target_temperature: target register unavailable" in result.manifest.temperature_records[0].error
    assert result.manifest.detection_results[0].temperature_sync_status == "TEMP_SYNC_MISSING"
    assert not result.analysis.temperature_distance
