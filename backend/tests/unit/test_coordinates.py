from __future__ import annotations

import pytest

from yyt1771_g3.core.coordinates import (
    DisplayRect,
    SourceImageSize,
    display_point_to_measurement,
    display_roi_to_measurement,
    fit_source_to_display,
    measurement_point_to_display,
    measurement_roi_to_display,
)
from yyt1771_g3.core.models import RotatedROI


def test_point_mapping_handles_contain_fit_and_letterbox_offset() -> None:
    transform = fit_source_to_display(
        SourceImageSize(width=2000, height=1000),
        DisplayRect(width=1000, height=800),
    )

    assert transform.scale == pytest.approx(0.5)
    assert transform.offset_x == pytest.approx(0.0)
    assert transform.offset_y == pytest.approx(150.0)

    measurement = display_point_to_measurement(250.0, 300.0, transform)
    assert measurement == pytest.approx((500.0, 300.0))

    display = measurement_point_to_display(measurement[0], measurement[1], transform)
    assert display == pytest.approx((250.0, 300.0))


def test_roi_mapping_is_invariant_to_display_scale() -> None:
    source = SourceImageSize(width=2048, height=1364)
    roi = RotatedROI(center_x=1024.0, center_y=682.0, width=600.0, height=220.0, angle_deg=-7.5)

    compact = fit_source_to_display(source, DisplayRect(width=512, height=341))
    large = fit_source_to_display(source, DisplayRect(width=1024, height=682))

    compact_display = measurement_roi_to_display(roi, compact)
    large_display = measurement_roi_to_display(roi, large)

    compact_round_trip = display_roi_to_measurement(compact_display, compact)
    large_round_trip = display_roi_to_measurement(large_display, large)

    assert compact_round_trip == roi
    assert large_round_trip == roi


def test_display_roi_clamps_to_source_pixel_bounds() -> None:
    transform = fit_source_to_display(
        SourceImageSize(width=100, height=50),
        DisplayRect(width=200, height=100),
    )
    display_roi = RotatedROI(center_x=-10.0, center_y=120.0, width=240.0, height=160.0, angle_deg=0.0)

    roi = display_roi_to_measurement(display_roi, transform, clamp=True)

    assert roi.center_x == 0.0
    assert roi.center_y == 50.0
    assert roi.width == 100.0
    assert roi.height == 50.0
