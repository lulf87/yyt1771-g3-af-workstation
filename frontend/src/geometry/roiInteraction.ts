import type { ABPoint, RotatedROI } from "../api/client";

export type RoiResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const MIN_MEASUREMENT_BAND_HEIGHT_PX = 8;
const MIN_ROI_SIZE_PX = MIN_MEASUREMENT_BAND_HEIGHT_PX;

export function moveRoiFromDrag(
  roi: RotatedROI,
  startPoint: ABPoint,
  currentPoint: ABPoint
): RotatedROI {
  return {
    ...roi,
    center_x: roi.center_x + currentPoint.x - startPoint.x,
    center_y: roi.center_y + currentPoint.y - startPoint.y
  };
}

export function resizeRoiFromHandle(
  roi: RotatedROI,
  handle: RoiResizeHandle,
  currentPoint: ABPoint,
  minSizePx = MIN_ROI_SIZE_PX
): RotatedROI {
  const { u, v } = roiAxes(roi);
  const signs = handleSigns(handle);
  const anchor = resizeAnchorPoint(roi, handle, u, v);
  const span = {
    x: currentPoint.x - anchor.x,
    y: currentPoint.y - anchor.y
  };

  const nextWidth = signs.x === 0 ? roi.width : Math.max(minSizePx, signs.x * dot(span, u));
  const nextHeight = signs.y === 0 ? roi.height : Math.max(minSizePx, signs.y * dot(span, v));
  const center = {
    x: anchor.x + (signs.x * nextWidth * u.x) / 2 + (signs.y * nextHeight * v.x) / 2,
    y: anchor.y + (signs.x * nextWidth * u.y) / 2 + (signs.y * nextHeight * v.y) / 2
  };

  return {
    ...roi,
    center_x: center.x,
    center_y: center.y,
    width: nextWidth,
    height: nextHeight
  };
}

export function rotateRoiToPointer(roi: RotatedROI, currentPoint: ABPoint): RotatedROI {
  const angleFromCenter = radiansToDegrees(
    Math.atan2(currentPoint.y - roi.center_y, currentPoint.x - roi.center_x)
  );
  return {
    ...roi,
    angle_deg: normalizeAngleDeg(angleFromCenter + 90)
  };
}

function roiAxes(roi: RotatedROI) {
  const theta = degreesToRadians(roi.angle_deg);
  return {
    u: { x: Math.cos(theta), y: Math.sin(theta) },
    v: { x: -Math.sin(theta), y: Math.cos(theta) }
  };
}

function handleSigns(handle: RoiResizeHandle): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0,
    y: handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0
  };
}

function resizeAnchorPoint(
  roi: RotatedROI,
  handle: RoiResizeHandle,
  u: ABPoint,
  v: ABPoint
): ABPoint {
  const signs = handleSigns(handle);
  return {
    x: roi.center_x - (signs.x * roi.width * u.x) / 2 - (signs.y * roi.height * v.x) / 2,
    y: roi.center_y - (signs.x * roi.width * u.y) / 2 - (signs.y * roi.height * v.y) / 2
  };
}

function dot(a: ABPoint, b: ABPoint): number {
  return a.x * b.x + a.y * b.y;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeAngleDeg(angle: number): number {
  let normalized = ((angle + 180) % 360) - 180;
  if (normalized < -180) normalized += 360;
  return normalized;
}
