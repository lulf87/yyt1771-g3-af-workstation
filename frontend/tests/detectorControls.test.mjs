import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf-8");

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
