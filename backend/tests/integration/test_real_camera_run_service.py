from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np

from yyt1771_g3.camera.base import CameraFrame
from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, TemperatureSyncStatus, WidthMode
from yyt1771_g3.core.models import (
    ABPoint,
    ABPoints,
    DetectionCandidate,
    DetectionResult,
    DetectorConfig,
    MeasurementDefinition,
    RotatedROI,
)
from yyt1771_g3.services.real_camera_run_service import _attach_temperature, iter_real_camera_run_events, run_real_camera
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


class OffsetTemperatureController(FakeTemperatureController):
    def __init__(self, offset_ms: int) -> None:
        super().__init__()
        self.offset_ms = offset_ms

    def read_temperature(self) -> TemperatureReading:
        self.index += 1
        return TemperatureReading(
            timestamp_ms=1000 + self.index * 100 + self.offset_ms,
            celsius=20.0 + self.index,
            source="lu92xx_modbus_rtu",
        )


class PowerAsStartTemperatureController(FakeTemperatureController):
    def __init__(self, startup_power_percent: float = 100.0) -> None:
        super().__init__()
        self.config = SimpleNamespace(
            control=SimpleNamespace(
                start_output_mode="power_nonzero",
                startup_power_percent=startup_power_percent,
            )
        )

    def start_output(self) -> None:
        self.started = True
        self.set_output_power_percent(float(self.config.control.startup_power_percent))


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


def _valid_detection(frame_index: int = 1, distance: float = 51.0) -> DetectionResult:
    candidate = DetectionCandidate(
        candidate_id=f"candidate-{frame_index}",
        axis_position_px=float(frame_index),
        width_px=distance,
        a=ABPoint(x=0.0, y=0.0),
        b=ABPoint(x=0.0, y=distance),
        confidence=0.95,
    )
    return DetectionResult(
        frame_index=frame_index,
        detection_status=DetectionStatus.VALID,
        ab_points=ABPoints(a=candidate.a, b=candidate.b),
        distance_px=distance,
        raw_best_candidate=candidate,
        selected_candidate=candidate,
    )


def _real_camera_measurement(max_frames: int = 2) -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id="real-camera-sync-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=max_frames,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
        ),
    )


def test_attach_temperature_honors_real_hardware_sync_tolerance() -> None:
    detection = _valid_detection()

    ten_ms_ok = _attach_temperature(
        detection,
        frame_timestamp_ms=1000,
        temperature=TemperatureReading(timestamp_ms=1010, celsius=17.5, source="lu92xx_modbus_rtu"),
        ok_delta_ms=10.0,
    )
    ten_ms_stale = _attach_temperature(
        detection,
        frame_timestamp_ms=1000,
        temperature=TemperatureReading(timestamp_ms=1100, celsius=17.5, source="lu92xx_modbus_rtu"),
        ok_delta_ms=10.0,
    )
    thousand_ms_ok = _attach_temperature(
        detection,
        frame_timestamp_ms=1000,
        temperature=TemperatureReading(timestamp_ms=1100, celsius=17.5, source="lu92xx_modbus_rtu"),
        ok_delta_ms=1000.0,
    )

    assert ten_ms_ok.temperature_sync_status == TemperatureSyncStatus.TEMP_SYNC_OK
    assert ten_ms_ok.temperature_delta_ms == 10.0
    assert ten_ms_stale.temperature_sync_status == TemperatureSyncStatus.TEMP_SYNC_STALE
    assert ten_ms_stale.temperature_delta_ms == 100.0
    assert thousand_ms_ok.temperature_sync_status == TemperatureSyncStatus.TEMP_SYNC_OK
    assert thousand_ms_ok.temperature_delta_ms == 100.0


def test_real_camera_run_defaults_to_preview_without_saving_raw_frames(tmp_path: Path) -> None:
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
        temperature_controller=FakeTemperatureController(),
        measurement=measurement,
        max_frames=3,
        target_fps=8.0,
    )

    assert source.closed is True
    assert len(result.manifest.frame_records) == 3
    first_record = result.manifest.frame_records[0]
    assert first_record.camera_meta["backend"] == "hik_gige_mvs"
    assert first_record.frame_path == ""
    assert first_record.raw_frame_saved is False
    assert first_record.preview_path == "preview_frames/latest.png"
    run_dir = run_store.run_dir(result.manifest.run_id)
    assert not (run_dir / "raw_frames" / "frame_000001.npy").exists()
    assert (run_dir / "preview_frames" / "latest.png").is_file()
    assert list((run_dir / "preview_frames").glob("*.png")) == [run_dir / "preview_frames" / "latest.png"]
    assert len(result.manifest.detection_results) == 3
    assert result.manifest.temperature_records
    assert result.analysis.all_frames
    assert result.analysis.temperature_distance
    assert result.manifest.config_snapshot["mode"] == "real_camera_run"
    assert result.manifest.config_snapshot["save_raw_frames"] is False
    assert result.manifest.config_snapshot["save_preview_frames"] is True
    assert result.manifest.config_snapshot["preview_max_width"] == 1200
    assert result.manifest.config_snapshot["raw_frame_count"] == 0
    assert result.manifest.config_snapshot["preview_frame_mode"] == "latest_overwrite"

    restored = run_store.read_run_manifest(result.manifest.run_id)
    assert restored == result.manifest


def test_real_camera_run_saves_raw_frames_when_explicitly_enabled(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = _real_camera_measurement(max_frames=1)

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=FakeTemperatureController(),
        measurement=measurement,
        max_frames=1,
        target_fps=8.0,
        save_raw_frames=True,
    )

    record = result.manifest.frame_records[0]
    run_dir = run_store.run_dir(result.manifest.run_id)
    assert record.raw_frame_saved is True
    assert record.frame_path == "raw_frames/frame_000001.npy"
    assert (run_dir / "raw_frames" / "frame_000001.npy").is_file()
    assert record.preview_path == "preview_frames/latest.png"
    assert (run_dir / "preview_frames" / "latest.png").is_file()
    assert result.manifest.config_snapshot["save_raw_frames"] is True
    assert result.manifest.config_snapshot["raw_frame_count"] == 1


def test_real_camera_run_default_sync_tolerance_accepts_serial_temperature_window(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=OffsetTemperatureController(offset_ms=100),
        measurement=_real_camera_measurement(max_frames=2),
        max_frames=2,
        target_fps=10.0,
    )

    assert result.manifest.config_snapshot["temp_sync_target_ms"] == 1000.0
    assert [item.temperature_delta_ms for item in result.manifest.detection_results] == [100.0, 100.0]
    assert {item.temperature_sync_status for item in result.manifest.detection_results} == {
        TemperatureSyncStatus.TEMP_SYNC_OK
    }
    assert len(result.analysis.temperature_distance) == 2


def test_real_camera_stream_without_frame_limit_saves_partial_run_on_close(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-stream-stop-test",
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
    temperature = FakeTemperatureController()
    events = iter_real_camera_run_events(
        run_store,
        camera_source=source,
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=None,
        target_fps=8.0,
    )

    first_event = next(events)
    events.close()

    assert first_event["event"] == "frame"
    assert first_event["frame_count"] == 0
    assert first_event["total_frames"] == 0
    run_id = first_event["run_id"]
    manifest = run_store.read_run_manifest(run_id)
    assert manifest.config_snapshot["max_frames"] is None
    assert manifest.config_snapshot["processed_frames"] == 1
    assert manifest.config_snapshot["stop_reason"] == "manual_stop_or_stream_closed"
    assert len(manifest.frame_records) == 1
    assert source.closed is True
    assert temperature.stopped is True
    assert temperature.closed is True


def test_real_camera_stream_sync_tolerance_controls_saved_temperature_distance_points(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")

    ok_events = list(
        iter_real_camera_run_events(
            run_store,
            camera_source=FakeCameraSource(),
            temperature_controller=OffsetTemperatureController(offset_ms=100),
            measurement=_real_camera_measurement(max_frames=2),
            max_frames=2,
            target_fps=10.0,
            temp_sync_target_ms=1000.0,
        )
    )
    stale_events = list(
        iter_real_camera_run_events(
            run_store,
            camera_source=FakeCameraSource(),
            temperature_controller=OffsetTemperatureController(offset_ms=100),
            measurement=_real_camera_measurement(max_frames=2),
            max_frames=2,
            target_fps=10.0,
            temp_sync_target_ms=10.0,
        )
    )

    assert len(ok_events[-1]["analysis_result"]["temperature_distance"]) == 2
    assert ok_events[0]["sync_config"]["temp_sync_target_ms"] == 1000.0
    assert ok_events[0]["frame_url"].startswith(f"/api/runs/{ok_events[0]['run_id']}/preview/latest.png")
    assert ok_events[0]["frame_url"].endswith("frame_index=1")
    assert ok_events[0]["storage"] == {
        "save_raw_frames": False,
        "raw_frame_saved": False,
        "save_preview_frames": True,
        "preview_path": "preview_frames/latest.png",
    }
    ok_run_dir = run_store.run_dir(ok_events[-1]["run_manifest"]["run_id"])
    assert not (ok_run_dir / "raw_frames" / "frame_000001.npy").exists()
    assert (ok_run_dir / "preview_frames" / "latest.png").is_file()
    assert list((ok_run_dir / "preview_frames").glob("*.png")) == [ok_run_dir / "preview_frames" / "latest.png"]
    assert ok_events[0]["detection_result"]["temperature_delta_ms"] == 100.0
    assert ok_events[0]["detection_result"]["temperature_sync_status"] == "TEMP_SYNC_OK"
    assert stale_events[-1]["analysis_result"]["temperature_distance"] == []
    assert stale_events[0]["sync_config"]["temp_sync_target_ms"] == 10.0
    assert stale_events[0]["detection_result"]["temperature_delta_ms"] == 100.0
    assert stale_events[0]["detection_result"]["temperature_sync_status"] == "TEMP_SYNC_STALE"


def test_real_camera_stream_stop_callback_saves_manual_stop_run(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-stream-stop-callback-test",
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
    temperature = FakeTemperatureController()

    events = list(
        iter_real_camera_run_events(
            run_store,
            camera_source=source,
            temperature_controller=temperature,
            measurement=measurement,
            max_frames=None,
            target_fps=8.0,
            stop_requested=lambda run_id: True,
        )
    )

    assert [event["event"] for event in events] == ["frame", "complete"]
    run_id = events[0]["run_id"]
    manifest = run_store.read_run_manifest(run_id)
    assert manifest.config_snapshot["max_frames"] is None
    assert manifest.config_snapshot["processed_frames"] == 1
    assert manifest.config_snapshot["stop_reason"] == "manual_stop_requested"
    assert len(manifest.frame_records) == 1
    assert events[-1]["run_manifest"]["run_id"] == run_id
    assert source.closed is True
    assert temperature.stopped is True
    assert temperature.closed is True


def test_real_camera_stream_stops_when_target_temperature_reached(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-stream-target-test",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector=DetectorType.BALLOON_ENVELOPE,
        width_mode=WidthMode.MAX_WIDTH,
        roi=RotatedROI(center_x=60.0, center_y=35.0, width=70.0, height=40.0),
        detector_config=DetectorConfig(
            min_component_area_px=20,
            max_frames_per_run=99,
            mask_open_kernel_px=1,
            mask_close_kernel_px=1,
            mask_dilate_kernel_px=1,
            target_temperature_celsius=22.0,
            temperature_power_percent=68.0,
        ),
    )
    temperature = FakeTemperatureController()

    events = list(
        iter_real_camera_run_events(
            run_store,
            camera_source=FakeCameraSource(),
            temperature_controller=temperature,
            measurement=measurement,
            max_frames=None,
            target_fps=8.0,
        )
    )

    assert [event["event"] for event in events] == ["frame", "frame", "complete"]
    assert events[0]["total_frames"] == 0
    assert events[1]["processed_frames"] == 2
    manifest = run_store.read_run_manifest(events[-1]["run_manifest"]["run_id"])
    assert len(manifest.frame_records) == 2
    assert manifest.config_snapshot["max_frames"] is None
    assert manifest.config_snapshot["stop_reason"] == "target_temperature_reached"
    assert temperature.target_values == [22.0]
    assert temperature.stopped is True
    assert temperature.closed is True


def test_real_camera_run_suspicious_only_uses_enhanced_core_diagnostics(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-suspicious-diagnostics-test",
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
            run_detector_mode="fast",
            run_diagnostics_mode="suspicious_only",
            run_enhanced_detector_on_suspicious=True,
            run_enhanced_detector_policy="all_suspicious",
            suspicious_boundary_reject_ratio=0.0,
        ),
    )

    result = run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        measurement=measurement,
        max_frames=1,
        target_fps=8.0,
    )

    debug = result.manifest.detection_results[0].debug_artifacts
    assert debug["suspicious"] is True
    assert debug["enhanced_rerun_used"] is True
    assert debug["diagnostics_generated"] is True
    assert debug["detector_execution_mode"] == "enhanced"
    assert set(debug["diagnostic_images"]) == {"detected_mask", "envelope_contour"}


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


def test_real_camera_run_keeps_measurement_power_for_power_nonzero_controller(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-temp-power-nonzero-test",
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
    temperature = PowerAsStartTemperatureController(startup_power_percent=100.0)

    run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=1,
        target_fps=10.0,
    )

    assert temperature.power_values == [68.0]
    assert temperature.started is False
    assert temperature.stopped is True
    assert temperature.closed is True


def test_real_camera_run_zero_power_does_not_start_temperature_output(tmp_path: Path) -> None:
    run_store = RunStore(tmp_path / "runs")
    measurement = MeasurementDefinition(
        measurement_id="real-camera-temp-zero-power-test",
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
            temperature_power_percent=0.0,
        ),
    )
    temperature = FakeTemperatureController()

    run_real_camera(
        run_store,
        camera_source=FakeCameraSource(),
        temperature_controller=temperature,
        measurement=measurement,
        max_frames=1,
        target_fps=10.0,
    )

    assert temperature.power_values == [0.0]
    assert temperature.started is False
    assert temperature.stopped is True
    assert temperature.closed is True


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
