import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
const i18nSource = readFileSync(resolve(rootDir, "src/i18n.ts"), "utf8");

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

test("operator mode renders an array-driven position panel and locks it while running", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );
  const positionsPanel = sourceSlice(
    "function OperatorMeasurementPositionsPanel({",
    "function OperatorDetectionParameterPanel({"
  );

  assert.match(operatorPage, /<OperatorMeasurementPositionsPanel/);
  assert.match(operatorPage, /disabled=\{operatorRunActive\}/);
  assert.match(positionsPanel, /measurement\.regions/);
  assert.match(positionsPanel, /regions\.map/);
  assert.match(positionsPanel, /addRegion\(/);
  assert.match(positionsPanel, /removeRegion\(/);
  assert.match(positionsPanel, /toggleRegionEnabled\(/);
  assert.match(positionsPanel, /renameRegion\(/);
  assert.match(positionsPanel, /Add position/);
  assert.match(positionsPanel, /Delete position/);
  assert.match(positionsPanel, /regions\.length >= MAX_MEASUREMENT_REGIONS/);
  assert.match(positionsPanel, /regions\.length <= 1/);
});

test("operator position panel selects one active ROI and reports per-position probe state", () => {
  const positionsPanel = sourceSlice(
    "function OperatorMeasurementPositionsPanel({",
    "function OperatorDetectionParameterPanel({"
  );

  assert.match(positionsPanel, /activeRegionId/);
  assert.match(positionsPanel, /setActiveRegionId/);
  assert.match(positionsPanel, /regionResultsById/);
  assert.match(positionsPanel, /temperature_distance_point_count/);
  assert.match(positionsPanel, /Current distance/);
  assert.match(positionsPanel, /Current status/);
  assert.match(positionsPanel, /Edit ROI/);
});

test("frame canvas renders all enabled positions and edits only the active ROI", () => {
  const frameCanvas = sourceSlice(
    "function FrameCanvas({",
    "function useStableImageUrl("
  );

  assert.match(mainSource, /type FrameCanvasRegionOverlay/);
  assert.match(frameCanvas, /regionOverlays\.map/);
  assert.match(frameCanvas, /region\.region_id === activeRegionId/);
  assert.match(frameCanvas, /stroke=\{region\.color\}/);
  assert.match(frameCanvas, /onRegionRoiChange\?\.\(activeRegion\.region_id, nextRoi\)/);
  assert.match(frameCanvas, /onRegionRoiCommit\?\.\(activeRegion\.region_id, committedRoi\)/);
  assert.match(frameCanvas, /detection\?\.ab_points/);
});

test("required measurement-position copy is available in Chinese and English", () => {
  for (const value of [
    "Measurement positions",
    "Add position",
    "Delete position",
    "Active edit position",
    "Enabled",
    "Disabled",
    "Edit ROI",
    "Up to 6 measurement positions are supported",
    "At least one measurement position is required",
    "No formal points for this position",
    "Analyzing position {current}/{total}",
    "Combined curves",
    "Position results",
    "Enabled positions"
  ]) {
    assert.match(i18nSource, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const value of [
    "检测位置",
    "添加位置",
    "删除位置",
    "当前编辑位置",
    "最多支持 6 个检测位置",
    "至少保留 1 个检测位置"
  ]) {
    assert.match(i18nSource, new RegExp(value));
  }
});
