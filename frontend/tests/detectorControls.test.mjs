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

test("operator mode exposes C detector mode control without advanced detector internals", () => {
  const match = mainSource.match(/function OperatorRunPage\(\{[\s\S]*?function OperatorSourceControls\(\{/);
  assert.ok(match, "OperatorRunPage block should exist");
  const block = match[0];

  assert.match(block, /<CDetectorModeControl/);
  assert.match(block, /isContrastWidestSpanMode\(measurement\) \? \(/);
  assert.match(block, /<ContrastThresholdControl/);
  assert.match(block, /<DistanceOutlierFilterControl/);
  assert.match(block, /Object class/);
  assert.doesNotMatch(block, /<DetectorSetupControls/);
  assert.doesNotMatch(block, /Advanced detection parameters/);
  assert.doesNotMatch(block, /advancedDetectorParameters/);
});

test("operator distance outlier filter exposes only enable and max jump controls", () => {
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

test("C object class defaults to the legacy bundle envelope detector", () => {
  const objectOptions = mainSource.match(/const OBJECT_CLASS_OPTIONS = \[[\s\S]*?\];/);
  assert.ok(objectOptions, "OBJECT_CLASS_OPTIONS should exist");

  assert.match(
    objectOptions[0],
    /value: "C_BUNDLE_ENVELOPE", label: "C bundle envelope", detector: "BundleEnvelopeDetector"/
  );
});

test("C detector mode options keep contrast widest-span optional", () => {
  const match = mainSource.match(/const C_DETECTOR_MODE_OPTIONS = \[[\s\S]*?\];/);
  assert.ok(match, "C_DETECTOR_MODE_OPTIONS should exist");
  const block = match[0];

  assert.match(block, /value: "default", label: "Original envelope detection"/);
  assert.match(block, /value: "c_envelope_legacy", label: "Original envelope detection"/);
  assert.match(block, /value: "contrast_widest_span", label: "Contrast widest-span detection"/);
  assert.doesNotMatch(block, /selected.*contrast_widest_span/);
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
