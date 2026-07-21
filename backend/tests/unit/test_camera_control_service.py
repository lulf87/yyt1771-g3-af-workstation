from __future__ import annotations

import pytest

from yyt1771_g3.camera.base import CameraExposureCapability
from yyt1771_g3.services.camera_control_service import CameraControlError, apply_camera_exposure


class FakeExposureSource:
    def __init__(self, actual: float = 10000.0, *, rollback_fails: bool = False) -> None:
        self.actual = actual
        self.rollback_fails = rollback_fails
        self.calls: list[float] = []

    def read_exposure_capability(self) -> CameraExposureCapability:
        return CameraExposureCapability(True, 100.0, 100000.0, 1.0, self.actual, self.actual)

    def set_exposure_us(self, value: float) -> float:
        self.calls.append(value)
        if self.rollback_fails and len(self.calls) > 1:
            raise RuntimeError("rollback rejected")
        self.actual = value
        return value


def test_apply_camera_exposure_persists_actual_value() -> None:
    saved: list[float] = []

    result = apply_camera_exposure(FakeExposureSource(), 12345.0, persist=saved.append)

    assert result.actual_us == 12345.0
    assert result.saved is True
    assert saved == [12345.0]


def test_apply_camera_exposure_rolls_back_when_persistence_fails() -> None:
    source = FakeExposureSource()

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(
            source,
            12345.0,
            persist=lambda value: (_ for _ in ()).throw(OSError("disk full")),
        )

    assert exc_info.value.stage == "persist"
    assert source.calls == [12345.0, 10000.0]
    assert exc_info.value.details["rollback_status"] == "restored"


def test_apply_camera_exposure_reports_failed_rollback() -> None:
    source = FakeExposureSource(rollback_fails=True)

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(
            source,
            12345.0,
            persist=lambda value: (_ for _ in ()).throw(OSError("read only")),
        )

    assert exc_info.value.details["rollback_status"] == "failed"
    assert "rollback rejected" in exc_info.value.details["rollback_error"]
