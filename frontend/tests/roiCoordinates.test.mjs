import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-roi-coordinates-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadCoordinatesModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    resolve(rootDir, "node_modules/.bin/tsc"),
    [
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
      "src/geometry/coordinates.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "geometry", "coordinates.js")).href}?${Date.now()}`);
}

test("real camera ROI coordinates stay in source pixels across display sizes", async () => {
  const {
    displayPointToMeasurement,
    fitSourceToDisplay,
    measurementPointToDisplay
  } = await loadCoordinatesModule();
  const source = { width: 2048, height: 1364 };
  const sourcePoint = { x: 1024, y: 682 };
  const compact = fitSourceToDisplay(source, { width: 640, height: 420 });
  const wide = fitSourceToDisplay(source, { width: 1280, height: 720 });

  const compactDisplayPoint = measurementPointToDisplay(sourcePoint, compact);
  const wideDisplayPoint = measurementPointToDisplay(sourcePoint, wide);

  assert.deepEqual(displayPointToMeasurement(compactDisplayPoint, compact, true), sourcePoint);
  assert.deepEqual(displayPointToMeasurement(wideDisplayPoint, wide, true), sourcePoint);
});
