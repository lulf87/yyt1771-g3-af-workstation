import {
  moveRoiFromDrag,
  resizeRoiFromHandle,
  rotateRoiToPointer
} from "../src/geometry/roiInteraction";
import type { RotatedROI } from "../src/api/client";

const roi: RotatedROI = {
  type: "rotated_rect",
  center_x: 100,
  center_y: 80,
  width: 80,
  height: 40,
  angle_deg: 0
};

function approx(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function testMoveRoi() {
  const moved = moveRoiFromDrag(roi, { x: 110, y: 90 }, { x: 150, y: 120 });

  approx(moved.center_x, 140, "moved center_x");
  approx(moved.center_y, 110, "moved center_y");
  approx(moved.width, 80, "moved width");
  approx(moved.height, 40, "moved height");
  approx(moved.angle_deg, 0, "moved angle");
}

function testResizeRoiFromCornerHandle() {
  const resized = resizeRoiFromHandle(roi, "se", { x: 160, y: 120 });

  approx(resized.center_x, 110, "resized center_x");
  approx(resized.center_y, 90, "resized center_y");
  approx(resized.width, 100, "resized width");
  approx(resized.height, 60, "resized height");
  approx(resized.angle_deg, 0, "resized angle");
}

function testResizeKeepsRotatedAxis() {
  const rotated: RotatedROI = { ...roi, angle_deg: 30 };
  const theta = (30 * Math.PI) / 180;
  const u = { x: Math.cos(theta), y: Math.sin(theta) };
  const v = { x: -Math.sin(theta), y: Math.cos(theta) };
  const nw = {
    x: rotated.center_x - (rotated.width / 2) * u.x - (rotated.height / 2) * v.x,
    y: rotated.center_y - (rotated.width / 2) * u.y - (rotated.height / 2) * v.y
  };
  const targetSe = {
    x: nw.x + 100 * u.x + 60 * v.x,
    y: nw.y + 100 * u.y + 60 * v.y
  };

  const resized = resizeRoiFromHandle(rotated, "se", targetSe);

  approx(resized.width, 100, "rotated resized width");
  approx(resized.height, 60, "rotated resized height");
  approx(resized.angle_deg, 30, "rotated resized angle");
}

function testRotateRoiToPointer() {
  const rotated = rotateRoiToPointer(roi, { x: 160, y: 80 });

  approx(rotated.center_x, 100, "rotated center_x");
  approx(rotated.center_y, 80, "rotated center_y");
  approx(rotated.width, 80, "rotated width");
  approx(rotated.height, 40, "rotated height");
  approx(rotated.angle_deg, 90, "rotated angle");
}

testMoveRoi();
testResizeRoiFromCornerHandle();
testResizeKeepsRotatedAxis();
testRotateRoiToPointer();
