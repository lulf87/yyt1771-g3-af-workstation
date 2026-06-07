import type { ABPoint, RotatedROI } from "../api/client";

export type SourceImageSize = {
  width: number;
  height: number;
};

export type DisplayRect = {
  width: number;
  height: number;
};

export type FrameDisplayTransform = {
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function fitSourceToDisplay(
  source: SourceImageSize,
  display: DisplayRect
): FrameDisplayTransform {
  const scale = Math.min(display.width / source.width, display.height / source.height);
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;
  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    displayWidth: display.width,
    displayHeight: display.height,
    renderedWidth,
    renderedHeight,
    scale,
    offsetX: (display.width - renderedWidth) / 2,
    offsetY: (display.height - renderedHeight) / 2
  };
}

export function displayPointToMeasurement(
  point: ABPoint,
  transform: FrameDisplayTransform,
  clamp = false
): ABPoint {
  const mapped = {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale
  };
  if (!clamp) return mapped;
  return {
    x: clampValue(mapped.x, 0, transform.sourceWidth),
    y: clampValue(mapped.y, 0, transform.sourceHeight)
  };
}

export function measurementPointToDisplay(
  point: ABPoint,
  transform: FrameDisplayTransform
): ABPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY
  };
}

export function displayRoiToMeasurement(
  roi: RotatedROI,
  transform: FrameDisplayTransform
): RotatedROI {
  const center = displayPointToMeasurement({ x: roi.center_x, y: roi.center_y }, transform, true);
  return {
    ...roi,
    center_x: center.x,
    center_y: center.y,
    width: clampValue(roi.width / transform.scale, 1, transform.sourceWidth),
    height: clampValue(roi.height / transform.scale, 1, transform.sourceHeight)
  };
}

export function measurementRoiToDisplay(
  roi: RotatedROI,
  transform: FrameDisplayTransform
): RotatedROI {
  const center = measurementPointToDisplay({ x: roi.center_x, y: roi.center_y }, transform);
  return {
    ...roi,
    center_x: center.x,
    center_y: center.y,
    width: roi.width * transform.scale,
    height: roi.height * transform.scale
  };
}

export function roiCorners(roi: RotatedROI): ABPoint[] {
  const theta = (roi.angle_deg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [
    [-roi.width / 2, -roi.height / 2],
    [roi.width / 2, -roi.height / 2],
    [roi.width / 2, roi.height / 2],
    [-roi.width / 2, roi.height / 2]
  ].map(([du, dv]) => ({
    x: roi.center_x + du * cos - dv * sin,
    y: roi.center_y + du * sin + dv * cos
  }));
}

function clampValue(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
