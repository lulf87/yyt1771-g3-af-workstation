from __future__ import annotations

import math
from dataclasses import dataclass

from yyt1771_g3.core.models import ABPoint, RotatedROI


@dataclass(frozen=True)
class SourceImageSize:
    width: int
    height: int


@dataclass(frozen=True)
class DisplayRect:
    width: float
    height: float


@dataclass(frozen=True)
class FrameDisplayTransform:
    source_width: int
    source_height: int
    display_width: float
    display_height: float
    rendered_width: float
    rendered_height: float
    scale: float
    offset_x: float
    offset_y: float


def fit_source_to_display(source: SourceImageSize, display: DisplayRect) -> FrameDisplayTransform:
    if source.width <= 0 or source.height <= 0:
        raise ValueError("source image size must be positive")
    if display.width <= 0 or display.height <= 0:
        raise ValueError("display rect must be positive")

    scale = min(display.width / source.width, display.height / source.height)
    rendered_width = source.width * scale
    rendered_height = source.height * scale
    return FrameDisplayTransform(
        source_width=source.width,
        source_height=source.height,
        display_width=display.width,
        display_height=display.height,
        rendered_width=rendered_width,
        rendered_height=rendered_height,
        scale=scale,
        offset_x=(display.width - rendered_width) / 2.0,
        offset_y=(display.height - rendered_height) / 2.0,
    )


def display_point_to_measurement(
    x: float,
    y: float,
    transform: FrameDisplayTransform,
    *,
    clamp: bool = False,
) -> tuple[float, float]:
    mx = (x - transform.offset_x) / transform.scale
    my = (y - transform.offset_y) / transform.scale
    if clamp:
        mx = _clamp(mx, 0.0, float(transform.source_width))
        my = _clamp(my, 0.0, float(transform.source_height))
    return (mx, my)


def measurement_point_to_display(
    x: float,
    y: float,
    transform: FrameDisplayTransform,
) -> tuple[float, float]:
    return (
        x * transform.scale + transform.offset_x,
        y * transform.scale + transform.offset_y,
    )


def display_roi_to_measurement(
    roi: RotatedROI,
    transform: FrameDisplayTransform,
    *,
    clamp: bool = False,
) -> RotatedROI:
    center_x, center_y = display_point_to_measurement(
        roi.center_x,
        roi.center_y,
        transform,
        clamp=clamp,
    )
    width = roi.width / transform.scale
    height = roi.height / transform.scale
    if clamp:
        width = _clamp(width, 1.0, float(transform.source_width))
        height = _clamp(height, 1.0, float(transform.source_height))
    return RotatedROI(
        center_x=center_x,
        center_y=center_y,
        width=width,
        height=height,
        angle_deg=roi.angle_deg,
    )


def measurement_roi_to_display(roi: RotatedROI, transform: FrameDisplayTransform) -> RotatedROI:
    center_x, center_y = measurement_point_to_display(roi.center_x, roi.center_y, transform)
    return RotatedROI(
        center_x=center_x,
        center_y=center_y,
        width=roi.width * transform.scale,
        height=roi.height * transform.scale,
        angle_deg=roi.angle_deg,
    )


def roi_local_to_measurement_point(roi: RotatedROI, u: float, v: float) -> ABPoint:
    theta = math.radians(roi.angle_deg)
    du = u - roi.width / 2.0
    dv = v - roi.height / 2.0
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    return ABPoint(
        x=roi.center_x + du * cos_t - dv * sin_t,
        y=roi.center_y + du * sin_t + dv * cos_t,
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
