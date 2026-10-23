from __future__ import annotations

from yyt1771_g3.camera.base import FIRST_FRAME_PERIOD_FACTOR, safe_exposure_maximum_us


def test_safe_maximum_is_limited_by_the_frame_timeout() -> None:
    # 1 s timeout, camera allows up to 2.5 s: the first frame needs more than two exposure periods.
    assert safe_exposure_maximum_us(camera_maximum_us=2499840.0, timeout_ms=1000) == 400_000.0


def test_safe_maximum_keeps_the_camera_limit_when_it_is_lower() -> None:
    assert safe_exposure_maximum_us(camera_maximum_us=300.0, timeout_ms=1000) == 300.0


def test_safe_maximum_without_timeout_falls_back_to_the_camera_limit() -> None:
    assert safe_exposure_maximum_us(camera_maximum_us=2_500_000.0, timeout_ms=None) == 2_500_000.0
    assert safe_exposure_maximum_us(camera_maximum_us=2_500_000.0, timeout_ms=0) == 2_500_000.0


def test_safe_maximum_without_any_limit_is_unknown() -> None:
    assert safe_exposure_maximum_us(camera_maximum_us=None, timeout_ms=None) is None


def test_safe_maximum_scales_with_a_raised_timeout() -> None:
    # Raising camera.timeout_ms to 2500 ms must allow a 1 s exposure again.
    assert safe_exposure_maximum_us(camera_maximum_us=2499840.0, timeout_ms=2500) == 1_000_000.0


def test_first_frame_factor_matches_the_observed_behaviour() -> None:
    # Site data: 300 ms exposure worked with a 1 s timeout, 691 ms did not.
    limit = safe_exposure_maximum_us(camera_maximum_us=2499840.0, timeout_ms=1000)
    assert limit is not None
    assert limit < 691000.0
    assert limit > 300000.0
    assert FIRST_FRAME_PERIOD_FACTOR == 2.5
