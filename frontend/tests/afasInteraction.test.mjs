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

  assert.deepEqual(
    translateAfasTangent(2, 10, { temperature: 2, distance: 14 }, { temperature: 3, distance: 19 }),
    { slope: 2, intercept: 13 }
  );
  assert.deepEqual(
    rotateAfasTangent({ temperature: 2, distance: 14 }, { temperature: 4, distance: 20 }, 2),
    { slope: 3, intercept: 8 }
  );
});
