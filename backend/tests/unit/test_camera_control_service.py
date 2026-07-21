from __future__ import annotations

import pytest

from yyt1771_g3.camera.base import CameraExposureCapability
from yyt1771_g3.services.camera_control_service import CameraControlError, apply_camera_exposure


class FakeExposureSource:
    def __init__(
        self,
        actual: float = 10000.0,
        *,
        applied_actual: float | None = None,
        rollback_actual: float | None = None,
        rollback_fails: bool = False,
        capability_reads: list[CameraExposureCapability | Exception] | None = None,
    ) -> None:
        self.actual = actual
        self.applied_actual = applied_actual
        self.rollback_actual = rollback_actual
        self.rollback_fails = rollback_fails
        self.capability_reads = list(capability_reads or [])
        self.calls: list[float] = []

    def read_exposure_capability(self) -> CameraExposureCapability:
        if self.capability_reads:
            response = self.capability_reads.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        return CameraExposureCapability(True, 100.0, 100000.0, 1.0, self.actual, self.actual)

    def set_exposure_us(self, value: float) -> float:
        self.calls.append(value)
        if self.rollback_fails and len(self.calls) > 1:
            raise RuntimeError("rollback rejected")
        if len(self.calls) == 1:
            self.actual = value if self.applied_actual is None else self.applied_actual
        else:
            self.actual = value if self.rollback_actual is None else self.rollback_actual
        return self.actual


def test_apply_camera_exposure_persists_actual_value() -> None:
    saved: list[float] = []

    result = apply_camera_exposure(
        FakeExposureSource(applied_actual=12348.0),
        12345.0,
        persist=saved.append,
    )

    assert result.actual_us == 12348.0
    assert result.saved is True
    assert result.capability.supported is True
    assert result.capability.actual_us == 12348.0
    assert saved == [12348.0]


def test_apply_camera_exposure_translates_initial_capability_read_failure() -> None:
    saved: list[float] = []
    source = FakeExposureSource(capability_reads=[RuntimeError("capability unavailable")])

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(source, 12345.0, persist=saved.append)

    assert exc_info.value.stage == "capability"
    assert "capability unavailable" in str(exc_info.value)
    assert exc_info.value.details == {
        "requested_us": 12345.0,
        "error": "capability unavailable",
    }
    assert source.calls == []
    assert saved == []


def test_apply_camera_exposure_uses_committed_fallback_when_post_read_raises() -> None:
    saved: list[float] = []
    previous = CameraExposureCapability(True, 100.0, 100000.0, 1.0, 10000.0, 10000.0)
    source = FakeExposureSource(
        applied_actual=12348.0,
        capability_reads=[previous, RuntimeError("refresh unavailable")],
    )

    result = apply_camera_exposure(source, 12345.0, persist=saved.append)

    assert result.saved is True
    assert result.actual_us == 12348.0
    assert result.capability == CameraExposureCapability(
        supported=True,
        minimum_us=100.0,
        maximum_us=100000.0,
        increment_us=1.0,
        requested_us=12348.0,
        actual_us=12348.0,
    )
    assert source.calls == [12345.0]
    assert saved == [12348.0]


@pytest.mark.parametrize(
    "refreshed",
    [
        CameraExposureCapability(False, 1.0, 2.0, 0.5, 12348.0, 12348.0),
        CameraExposureCapability(True, 1.0, 2.0, 0.5, 12348.0, None),
        CameraExposureCapability(True, 1.0, 2.0, 0.5, 12000.0, 12000.0),
    ],
    ids=["unsupported", "missing-actual", "mismatched-actual"],
)
def test_apply_camera_exposure_uses_committed_fallback_for_invalid_post_read(
    refreshed: CameraExposureCapability,
) -> None:
    previous = CameraExposureCapability(True, 100.0, 100000.0, 1.0, 10000.0, 10000.0)
    source = FakeExposureSource(
        applied_actual=12348.0,
        capability_reads=[previous, refreshed],
    )

    result = apply_camera_exposure(source, 12345.0, persist=lambda value: None)

    assert result.saved is True
    assert result.actual_us == 12348.0
    assert result.capability == CameraExposureCapability(
        supported=True,
        minimum_us=100.0,
        maximum_us=100000.0,
        increment_us=1.0,
        requested_us=12348.0,
        actual_us=12348.0,
    )
    assert source.calls == [12345.0]


def test_apply_camera_exposure_returns_valid_refreshed_capability() -> None:
    previous = CameraExposureCapability(True, 100.0, 100000.0, 1.0, 10000.0, 10000.0)
    refreshed = CameraExposureCapability(True, 80.0, 120000.0, 0.5, 12345.0, 12348.0)
    source = FakeExposureSource(
        applied_actual=12348.0,
        capability_reads=[previous, refreshed],
    )

    result = apply_camera_exposure(source, 12345.0, persist=lambda value: None)

    assert result.capability == refreshed
    assert result.actual_us == 12348.0
    assert result.saved is True


def test_apply_camera_exposure_rolls_back_when_persistence_fails() -> None:
    source = FakeExposureSource(
        applied_actual=12348.0,
        rollback_actual=10000.0000005,
    )

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(
            source,
            12345.0,
            persist=lambda value: (_ for _ in ()).throw(OSError("disk full")),
        )

    assert exc_info.value.stage == "persist"
    assert source.calls == [12345.0, 10000.0]
    assert exc_info.value.details["rollback_status"] == "restored"
    assert exc_info.value.details["rollback_expected_us"] == 10000.0
    assert exc_info.value.details["rollback_actual_us"] == 10000.0000005


def test_apply_camera_exposure_reports_rollback_returning_different_actual() -> None:
    source = FakeExposureSource(
        applied_actual=12348.0,
        rollback_actual=10004.0,
    )

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(
            source,
            12345.0,
            persist=lambda value: (_ for _ in ()).throw(OSError("disk full")),
        )

    assert exc_info.value.stage == "persist"
    assert source.calls == [12345.0, 10000.0]
    assert exc_info.value.details["rollback_status"] == "failed"
    assert exc_info.value.details["rollback_expected_us"] == 10000.0
    assert exc_info.value.details["rollback_actual_us"] == 10004.0
    assert "expected 10000.0" in exc_info.value.details["rollback_error"]
    assert "returned 10004.0" in exc_info.value.details["rollback_error"]


def test_apply_camera_exposure_reports_failed_rollback() -> None:
    source = FakeExposureSource(applied_actual=12348.0, rollback_fails=True)

    with pytest.raises(CameraControlError) as exc_info:
        apply_camera_exposure(
            source,
            12345.0,
            persist=lambda value: (_ for _ in ()).throw(OSError("read only")),
        )

    assert exc_info.value.details["rollback_status"] == "failed"
    assert exc_info.value.details["rollback_expected_us"] == 10000.0
    assert "rollback rejected" in exc_info.value.details["rollback_error"]
