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


def test_configured_cap_wins_when_it_is_the_smallest() -> None:
    from yyt1771_g3.camera.base import EXPOSURE_LIMIT_SOURCE_CONFIG, exposure_limits

    value, source = exposure_limits(
        camera_maximum_us=2499840.0,
        timeout_ms=1000,
        configured_maximum_us=300_000.0,
    )

    assert value == 300_000.0
    assert source == EXPOSURE_LIMIT_SOURCE_CONFIG


def test_frame_timeout_still_wins_over_a_generous_configured_cap() -> None:
    from yyt1771_g3.camera.base import EXPOSURE_LIMIT_SOURCE_FRAME_TIMEOUT, exposure_limits

    value, source = exposure_limits(
        camera_maximum_us=2499840.0,
        timeout_ms=1000,
        configured_maximum_us=2_000_000.0,
    )

    assert value == 400_000.0
    assert source == EXPOSURE_LIMIT_SOURCE_FRAME_TIMEOUT


def test_camera_maximum_wins_when_it_is_the_smallest() -> None:
    from yyt1771_g3.camera.base import EXPOSURE_LIMIT_SOURCE_CAMERA, exposure_limits

    value, source = exposure_limits(
        camera_maximum_us=50_000.0,
        timeout_ms=1000,
        configured_maximum_us=300_000.0,
    )

    assert value == 50_000.0
    assert source == EXPOSURE_LIMIT_SOURCE_CAMERA
