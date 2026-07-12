import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-temperature-curve-test-build");
after(() => rmSync(outDir, { recursive: true, force: true }));

async function loadModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(resolve(rootDir, "node_modules/.bin/tsc"), [
    "--target", "ES2020", "--module", "ES2020", "--moduleResolution", "node",
    "--strict", "--skipLibCheck", "--types", "vite/client", "--outDir", outDir, "src/temperatureCurve.ts"
  ], { cwd: rootDir, stdio: "pipe" });
  return import(`${pathToFileURL(resolve(outDir, "temperatureCurve.js")).href}?${Date.now()}`);
}

test("grouped bucket updates replace one formal point and preserve raw points", async () => {
  const { upsertGroupedTemperaturePoint, groupedPointsFromMap } = await loadModule();
  const buckets = new Map();
  upsertGroupedTemperaturePoint(buckets, { bin_key: 120, temperature_celsius: 1.2, distance_px: 10, sample_count: 1, minimum_distance_px: 10, maximum_distance_px: 10, first_frame_index: 1, last_frame_index: 1, representative_frame_index: 1, temperature_group_bin_celsius: 0.01 });
  upsertGroupedTemperaturePoint(buckets, { bin_key: 130, temperature_celsius: 1.3, distance_px: 20, sample_count: 1, minimum_distance_px: 20, maximum_distance_px: 20, first_frame_index: 2, last_frame_index: 2, representative_frame_index: 2, temperature_group_bin_celsius: 0.01 });
  upsertGroupedTemperaturePoint(buckets, { bin_key: 120, temperature_celsius: 1.2, distance_px: 30, sample_count: 2, minimum_distance_px: 10, maximum_distance_px: 50, first_frame_index: 1, last_frame_index: 3, representative_frame_index: 2, temperature_group_bin_celsius: 0.01 });
  upsertGroupedTemperaturePoint(buckets, { bin_key: 140, temperature_celsius: 1.4, distance_px: 40, sample_count: 1, minimum_distance_px: 40, maximum_distance_px: 40, first_frame_index: 4, last_frame_index: 4, representative_frame_index: 4, temperature_group_bin_celsius: 0.01 });

  const points = groupedPointsFromMap(buckets);
  assert.deepEqual(points.map((point) => point.x), [1.2, 1.3, 1.4]);
  assert.deepEqual(points.map((point) => point.y), [30, 20, 40]);
  assert.ok(points.every((point, index) => index === 0 || point.x > points[index - 1].x));
});

test("legacy repeated raw temperatures normalize before becoming a formal path", async () => {
  const { groupLegacyCurvePoints, validateStrictlyIncreasingTemperature } = await loadModule();
  const grouped = groupLegacyCurvePoints([
    { x: 1.2, y: 10, frame_index: 1 },
    { x: 1.3, y: 20, frame_index: 2 },
    { x: 1.2, y: 30, frame_index: 3 },
    { x: 1.4, y: 40, frame_index: 4 }
  ], 0.01);
  assert.deepEqual(grouped.map((point) => [point.x, point.y]), [[1.2, 20], [1.3, 20], [1.4, 40]]);
  assert.equal(validateStrictlyIncreasingTemperature(grouped), true);
});
