import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-measurement-regions-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadMeasurementRegionsModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      resolve(rootDir, "node_modules/typescript/bin/tsc"),
      "--target",
      "ES2020",
      "--module",
      "ES2020",
      "--moduleResolution",
      "node",
      "--strict",
      "--skipLibCheck",
      "--types",
      "vite/client",
      "--outDir",
      outDir,
      "src/measurementRegions.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "measurementRegions.js")).href}?${Date.now()}`);
}

function roi(centerX = 100) {
  return {
    type: "rotated_rect",
    center_x: centerX,
    center_y: 80,
    width: 120,
    height: 40,
    angle_deg: 0
  };
}

function legacyMeasurement() {
  return {
    measurement_id: "legacy-measurement",
    source: "real_camera",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    detector_mode: "contrast_widest_span",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: roi(),
    detector_config: {}
  };
}

test("legacy ROI normalizes to one enabled region", async () => {
  const { normalizeMeasurementRegions } = await loadMeasurementRegionsModule();
  const measurement = normalizeMeasurementRegions(legacyMeasurement());

  assert.equal(measurement.regions.length, 1);
  assert.deepEqual(measurement.regions[0], {
    region_id: "region_1",
    index: 1,
    label: "位置 1",
    enabled: true,
    roi: roi(),
    color: "#ef4444"
  });
  assert.deepEqual(measurement.roi, measurement.regions[0].roi);
});

test("position operations enforce the six-position maximum", async () => {
  const { addRegion, normalizeMeasurementRegions } = await loadMeasurementRegionsModule();
  let measurement = normalizeMeasurementRegions(legacyMeasurement());

  for (let index = 0; index < 5; index += 1) {
    measurement = addRegion(measurement);
  }

  assert.equal(measurement.regions.length, 6);
  assert.throws(() => addRegion(measurement), /six|6/i);
});

test("position deletion preserves remaining IDs and colors and keeps one position", async () => {
  const { addRegion, normalizeMeasurementRegions, removeRegion } = await loadMeasurementRegionsModule();
  let measurement = addRegion(addRegion(normalizeMeasurementRegions(legacyMeasurement())));
  const kept = measurement.regions[2];

  measurement = removeRegion(measurement, measurement.regions[1].region_id);

  const keptAfterDelete = measurement.regions.find((item) => item.region_id === kept.region_id);
  assert.equal(keptAfterDelete.color, kept.color);
  assert.equal(keptAfterDelete.index, 2);
  assert.equal(keptAfterDelete.label, "位置 2");
  assert.throws(
    () => removeRegion(normalizeMeasurementRegions(legacyMeasurement()), "region_1"),
    /one|1/i
  );
});

test("new positions use the first unused color without changing existing colors", async () => {
  const { addRegion, normalizeMeasurementRegions, removeRegion } = await loadMeasurementRegionsModule();
  let measurement = addRegion(addRegion(normalizeMeasurementRegions(legacyMeasurement())));
  const first = measurement.regions[0];
  const third = measurement.regions[2];

  measurement = removeRegion(measurement, measurement.regions[1].region_id);
  measurement = addRegion(measurement);

  assert.equal(measurement.regions[0].region_id, first.region_id);
  assert.equal(measurement.regions[0].color, first.color);
  assert.equal(measurement.regions[1].region_id, third.region_id);
  assert.equal(measurement.regions[1].color, third.color);
  assert.equal(measurement.regions[2].color, "#3b82f6");
  assert.equal(new Set(measurement.regions.map((item) => item.region_id)).size, 3);
});

test("ROI edits, rename, and enabled state affect only the selected position", async () => {
  const {
    addRegion,
    normalizeMeasurementRegions,
    renameRegion,
    toggleRegionEnabled,
    updateRegionRoi
  } = await loadMeasurementRegionsModule();
  const base = addRegion(normalizeMeasurementRegions(legacyMeasurement()));
  const secondId = base.regions[1].region_id;
  const editedRoi = roi(260);

  let measurement = updateRegionRoi(base, secondId, editedRoi);
  measurement = renameRegion(measurement, secondId, "远端位置");
  measurement = toggleRegionEnabled(measurement, secondId, false);

  assert.deepEqual(measurement.regions[0].roi, roi());
  assert.deepEqual(measurement.roi, measurement.regions[0].roi);
  assert.deepEqual(measurement.regions[1].roi, editedRoi);
  assert.equal(measurement.regions[1].label, "远端位置");
  assert.equal(measurement.regions[1].enabled, false);
  assert.equal(base.regions[1].enabled, true);
});

test("the final enabled position cannot be disabled", async () => {
  const { addRegion, normalizeMeasurementRegions, toggleRegionEnabled } = await loadMeasurementRegionsModule();
  let measurement = addRegion(normalizeMeasurementRegions(legacyMeasurement()));
  measurement = toggleRegionEnabled(measurement, "region_2", false);

  assert.throws(
    () => toggleRegionEnabled(measurement, "region_1", false),
    /enabled|启用/i
  );
});

test("missing region IDs are rejected instead of silently changing another position", async () => {
  const {
    normalizeMeasurementRegions,
    removeRegion,
    renameRegion,
    toggleRegionEnabled,
    updateRegionRoi
  } = await loadMeasurementRegionsModule();
  const measurement = normalizeMeasurementRegions(legacyMeasurement());

  assert.throws(() => removeRegion(measurement, "missing"), /missing/i);
  assert.throws(() => renameRegion(measurement, "missing", "x"), /missing/i);
  assert.throws(() => toggleRegionEnabled(measurement, "missing", false), /missing/i);
  assert.throws(() => updateRegionRoi(measurement, "missing", roi(300)), /missing/i);
});
