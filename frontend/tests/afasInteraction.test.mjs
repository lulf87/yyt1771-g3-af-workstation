import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-afas-interaction-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadInteractionModule() {
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
      "--outDir",
      outDir,
      "src/afasInteraction.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "afasInteraction.js")).href}?${Date.now()}`);
}

test("AFAS range edge drag snaps to data and preserves at least two points", async () => {
  const { resizeAfasRange } = await loadInteractionModule();
  const temperatures = [20, 21, 22, 23, 24, 25];

  assert.deepEqual(resizeAfasRange([20, 22], "start", 21.2, temperatures), [21, 22]);
  assert.deepEqual(resizeAfasRange([20, 22], "start", 24.8, temperatures), [21, 22]);
  assert.deepEqual(resizeAfasRange([23, 25], "end", 23.1, temperatures), [23, 24]);
});

test("AFAS range body drag preserves its sampled width and clamps to data", async () => {
  const { moveAfasRange } = await loadInteractionModule();
  const temperatures = [20, 21, 22, 23, 24, 25];

  assert.deepEqual(moveAfasRange([20, 22], 2.2, temperatures), [22, 24]);
  assert.deepEqual(moveAfasRange([23, 25], 5, temperatures), [23, 25]);
});

test("AFAS tangent translation and slope rotation preserve authoritative line parameters", async () => {
  const { rotateAfasTangent, translateAfasTangent } = await loadInteractionModule();
  const domain = {
    temperatureMin: 0,
    temperatureMax: 10,
    distanceMin: 0,
    distanceMax: 30,
    availableTemperatures: [0, 2, 4, 10]
  };

  assert.deepEqual(
    translateAfasTangent(2, 10, { temperature: 2, distance: 14 }, { temperature: 3, distance: 19 }, domain),
    { slope: 2, intercept: 13 }
  );
  assert.deepEqual(
    rotateAfasTangent({ temperature: 2, distance: 14 }, { temperature: 4, distance: 20 }, 2, domain),
    { slope: 3, intercept: 8 }
  );
});

test("AFAS plot and data points clamp to all four interaction bounds", async () => {
  const { clampAfasDataPoint, clampAfasPlotPoint } = await loadInteractionModule();
  const plot = { left: 80, right: 860, top: 40, bottom: 460 };
  const domain = {
    temperatureMin: 20,
    temperatureMax: 50,
    distanceMin: 100,
    distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };

  assert.deepEqual(clampAfasPlotPoint({ x: -10, y: 900 }, plot), { x: 80, y: 460 });
  assert.deepEqual(clampAfasPlotPoint({ x: 900, y: -10 }, plot), { x: 860, y: 40 });
  assert.deepEqual(
    clampAfasDataPoint({ temperature: -10, distance: 900 }, domain),
    { temperature: 20, distance: 160 }
  );
  assert.deepEqual(
    clampAfasDataPoint({ temperature: 900, distance: -10 }, domain),
    { temperature: 50, distance: 100 }
  );
});

test("AFAS tangent translation remains intersecting after an out-of-domain drag", async () => {
  const {
    tangentInterceptBounds,
    tangentIntersectsDomain,
    translateAfasTangent
  } = await loadInteractionModule();
  const domain = {
    temperatureMin: 20,
    temperatureMax: 50,
    distanceMin: 100,
    distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };

  assert.deepEqual(tangentInterceptBounds(2, domain), [0, 120]);
  const tangent = translateAfasTangent(
    2,
    40,
    { temperature: 30, distance: 100 },
    { temperature: 30, distance: 500 },
    domain
  );

  assert.deepEqual(tangent, { slope: 2, intercept: 100 });
  assert.equal(tangentIntersectsDomain(tangent.slope, tangent.intercept, domain), true);
});

test("AFAS tangent endpoint rotation clamps both left and right drags to finite domain segments", async () => {
  const { clampTangentControlPoints, rotateAfasTangent } = await loadInteractionModule();
  const domain = {
    temperatureMin: 20,
    temperatureMax: 50,
    distanceMin: 100,
    distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };
  const rotations = [
    rotateAfasTangent(
      { temperature: 50, distance: 130 },
      { temperature: -100, distance: 500 },
      2,
      domain
    ),
    rotateAfasTangent(
      { temperature: 20, distance: 130 },
      { temperature: 100, distance: -500 },
      2,
      domain
    )
  ];

  for (const tangent of rotations) {
    assert.equal(Number.isFinite(tangent.slope), true);
    assert.equal(Number.isFinite(tangent.intercept), true);
    const points = clampTangentControlPoints(tangent.slope, tangent.intercept, domain);
    assert.equal(points.length, 2);
    assert.ok(points.every((point) => point.temperature >= 20 && point.temperature <= 50));
    assert.ok(points.every((point) => point.distance >= 100 && point.distance <= 160));
  }
});

test("AFAS tangent translation fails closed when its data domain is unavailable", async () => {
  const { translateAfasTangent } = await loadInteractionModule();
  const tangent = translateAfasTangent(
    2,
    40,
    { temperature: 30, distance: 100 },
    { temperature: 30, distance: Number.POSITIVE_INFINITY }
  );

  assert.deepEqual(tangent, { slope: 2, intercept: 40 });
  assert.equal(Number.isFinite(tangent.slope), true);
  assert.equal(Number.isFinite(tangent.intercept), true);
});

test("AFAS tangent rotation fails closed when its data domain is unavailable", async () => {
  const { rotateAfasTangent } = await loadInteractionModule();
  const tangent = rotateAfasTangent(
    { temperature: 30, distance: 100 },
    { temperature: 1000, distance: 500 },
    2,
    1e-6
  );

  assert.deepEqual(tangent, { slope: 2, intercept: 40 });
  assert.equal(Number.isFinite(tangent.slope), true);
  assert.equal(Number.isFinite(tangent.intercept), true);
});

test("AFAS tangent rotation normalizes non-finite fallbacks for tiny temperature deltas", async () => {
  const { rotateAfasTangent } = await loadInteractionModule();
  const domain = {
    temperatureMin: 20,
    temperatureMax: 50,
    distanceMin: 100,
    distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };

  for (const fallbackSlope of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const tangent = rotateAfasTangent(
      { temperature: 30, distance: 120 },
      { temperature: 30 + 1e-12, distance: 160 },
      fallbackSlope,
      domain,
      1e-6
    );
    assert.deepEqual(tangent, { slope: 0, intercept: 120 });
  }

  assert.deepEqual(
    rotateAfasTangent(
      { temperature: 30, distance: 120 },
      { temperature: 30 + 1e-12, distance: 160 },
      4,
      domain,
      1e-6
    ),
    { slope: 4, intercept: 0 }
  );
});

test("AFAS tangent rotation recovers a finite line when slope or intercept arithmetic overflows", async () => {
  const { rotateAfasTangent } = await loadInteractionModule();
  const slopeOverflow = rotateAfasTangent(
    { temperature: 0, distance: 100 },
    { temperature: Number.MIN_VALUE, distance: 160 },
    Number.NaN,
    {
      temperatureMin: 0,
      temperatureMax: 1,
      distanceMin: 100,
      distanceMax: 160,
      availableTemperatures: [0, 1]
    },
    0
  );
  const interceptOverflow = rotateAfasTangent(
    { temperature: 2, distance: 120 },
    { temperature: 2, distance: 160 },
    Number.MAX_VALUE,
    {
      temperatureMin: 0,
      temperatureMax: 10,
      distanceMin: 0,
      distanceMax: 200,
      availableTemperatures: [0, 2, 10]
    },
    1e-6
  );

  assert.deepEqual(slopeOverflow, { slope: 0, intercept: 100 });
  assert.deepEqual(interceptOverflow, { slope: 0, intercept: 120 });
  for (const tangent of [slopeOverflow, interceptOverflow]) {
    assert.equal(Number.isFinite(tangent.slope), true);
    assert.equal(Number.isFinite(tangent.intercept), true);
  }
});
