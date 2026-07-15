import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf-8");
const liveRunAnalysisSource = readFileSync(resolve(rootDir, "src/liveRunAnalysis.ts"), "utf-8");

function basicKeyBlock() {
  const match = mainSource.match(/const BASIC_DETECTOR_PARAMETER_KEYS = new Set<keyof DetectorConfig>\(\[([\s\S]*?)\]\);/);
  assert.ok(match, "BASIC_DETECTOR_PARAMETER_KEYS block should exist");
  return match[1];
}

function presetBlock(id) {
  const match = mainSource.match(new RegExp(`id: "${id}",[\\s\\S]*?patch: \\{([\\s\\S]*?)\\n    \\}`));
  assert.ok(match, `${id} preset should exist`);
  return match[1];
}

test("basic detector controls only expose contour and temporal core parameters", () => {
  const block = basicKeyBlock();
  for (const key of [
    "contour_close_kernel",
    "contour_smooth_window",
    "temporal_stabilization_enabled",
    "temporal_stabilization_strength"
  ]) {
    assert.match(block, new RegExp(`"${key}"`));
  }
  for (const advancedKey of [
    "processing_scale",
    "run_detector_mode",
    "run_diagnostics_mode",
    "run_enhanced_detector_policy",
    "bubble_suppress_enabled",
    "dark_line_filter_enabled",
    "spur_prune_enabled",
    "boundary_support_enabled",
    "envelope_width_percentile",
    "envelope_quantile",
    "min_window_pixels",
    "mesh_row_width_keep_ratio",
    "mesh_row_count_keep_ratio"
  ]) {
    assert.doesNotMatch(block, new RegExp(`"${advancedKey}"`));
  }
});

test("operator actual-use mode hides object and detector mode while exposing only contrast and jump threshold", () => {
  const pageMatch = mainSource.match(/function OperatorRunPage\(\{[\s\S]*?function OperatorDetectionParameterPanel\(\{/);
  assert.ok(pageMatch, "OperatorRunPage block should exist");
  const pageBlock = pageMatch[0];
  const panelMatch = mainSource.match(/function OperatorDetectionParameterPanel\(\{[\s\S]*?function OperatorSourceControls\(\{/);
  assert.ok(panelMatch, "OperatorDetectionParameterPanel block should exist");
  const panelBlock = panelMatch[0];

  assert.match(pageBlock, /<OperatorDetectionParameterPanel/);
  assert.match(panelBlock, /contrast_threshold/);
  assert.match(panelBlock, /distance_outlier_max_jump_px/);
  assert.doesNotMatch(pageBlock, /<CDetectorModeControl/);
  assert.doesNotMatch(pageBlock, /<DistanceOutlierFilterControl/);
  assert.doesNotMatch(pageBlock, /Object class/);
  assert.doesNotMatch(pageBlock, /Detection method/);
  assert.doesNotMatch(pageBlock, /distance_outlier_filter_enabled/);
  assert.doesNotMatch(pageBlock, /<DetectorSetupControls/);
  assert.doesNotMatch(pageBlock, /Advanced detection parameters/);
  assert.doesNotMatch(pageBlock, /advancedDetectorParameters/);
});

test("engineering distance outlier filter keeps enable and max jump controls", () => {
  const match = mainSource.match(/function DistanceOutlierFilterControl\([\s\S]*?function DetectorParameterGroups\(/);
  assert.ok(match, "DistanceOutlierFilterControl block should exist");
  const block = match[0];

  assert.match(block, /distance_outlier_filter_enabled/);
  assert.match(block, /distance_outlier_max_jump_px/);
  assert.doesNotMatch(block, /distance_outlier_reference_count/);
  assert.doesNotMatch(block, /distance_outlier_baseline/);
});

test("live raw and stabilized fallback curve points respect curve point status", () => {
  const match = liveRunAnalysisSource.match(/function isFormalCurveDetection\([\s\S]*?function livePointMissingReason\(/);
  assert.ok(match, "live curve point helper block should exist");
  const block = match[0];

  assert.match(block, /detection\.curve_point_status \?\? "valid"/);
  assert.match(block, /function liveRawDistancePoint/);
  assert.match(block, /function liveStabilizedDistancePoint/);
  assert.match(block, /function liveTemperatureDistancePoint/);
  assert.match(block, /if \(!isFormalCurveDetection\(detection\) \|\| distance == null\) return null;/);
  assert.match(
    block,
    /if \(!isFormalCurveDetection\(detection\) \|\| distance == null \|\| detection\.temperature_celsius == null\) return null;/
  );
});

test("current setup uses one whole-envelope detector without legacy class selectors", () => {
  const match = mainSource.match(/function DetectorSetupControls\([\s\S]*?function DistanceOutlierFilterControl\(/);
  assert.ok(match, "DetectorSetupControls block should exist");
  const block = match[0];

  assert.match(mainSource, /object_class: CURRENT_OBJECT_CLASS/);
  assert.match(mainSource, /detector: CURRENT_DETECTOR/);
  assert.match(mainSource, /detector_mode: CURRENT_DETECTOR_MODE/);
  assert.doesNotMatch(block, /Object class/);
  assert.doesNotMatch(block, /CDetectorModeControl/);
  assert.doesNotMatch(block, /DETECTOR_OPTIONS/);
  assert.doesNotMatch(block, /Width mode/);
});

test("overlay prefers backend measurement_segment for A/B line drawing", () => {
  assert.match(mainSource, /measurementSegment=\{latestDetection\?\.measurement_segment \?\? null\}/);
  assert.match(mainSource, /function ABOverlay\(\{\s+abPoints,\s+measurementSegment,\s+transform/s);
  assert.match(mainSource, /const segment = measurementSegment \?\? \[abPoints\.a, abPoints\.b\];/);
});

test("detector presets map to run performance defaults", () => {
  const fast = presetBlock("fast_afas_run");
  assert.match(fast, /processing_scale:\s*0\.5/);
  assert.match(fast, /run_detector_mode:\s*"fast"/);
  assert.match(fast, /run_diagnostics_mode:\s*"off"/);
  assert.match(fast, /run_enhanced_detector_on_suspicious:\s*false/);
  assert.match(fast, /show_advanced_diagnostics:\s*false/);

  const balanced = presetBlock("balanced_afas_run");
  assert.match(balanced, /run_enhanced_detector_on_suspicious:\s*true/);
  assert.match(balanced, /run_enhanced_detector_policy:\s*"rerun_worthy_only"/);

  const diagnostics = presetBlock("diagnostics_tuning");
  assert.match(diagnostics, /detector_execution_mode:\s*"diagnostics"/);
  assert.match(diagnostics, /run_diagnostics_mode:\s*"every_frame"/);
  assert.match(diagnostics, /show_advanced_diagnostics:\s*true/);
});
