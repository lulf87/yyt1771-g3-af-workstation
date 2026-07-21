import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-hardware-camera-test-coordinator-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadCoordinatorModule() {
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
      "--lib",
      "ES2020,DOM",
      "--outDir",
      outDir,
      "src/hardwareCameraTestCoordinator.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "hardwareCameraTestCoordinator.js")).href}?${Date.now()}`);
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

test("a late camera A result is ignored after selecting B and only B can be accepted", async () => {
  const { createHardwareCameraTestCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareCameraTestCoordinator();
  const cameraA = deferred();
  const cameraB = deferred();

  const pendingA = coordinator.run("camera-A", () => cameraA.promise);
  coordinator.invalidate();
  const pendingB = coordinator.run("camera-B", () => cameraB.promise);

  cameraA.resolve({ status: "passed", serial: "camera-A" });
  assert.deepEqual(await pendingA, {
    accepted: false,
    cameraKey: "camera-A"
  });

  cameraB.resolve({ status: "passed", serial: "camera-B" });
  assert.deepEqual(await pendingB, {
    accepted: true,
    cameraKey: "camera-B",
    status: "fulfilled",
    value: { status: "passed", serial: "camera-B" }
  });
});

test("refresh or close invalidation rejects a late camera test result", async () => {
  const { createHardwareCameraTestCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareCameraTestCoordinator();
  const camera = deferred();
  const pending = coordinator.run("camera-A", () => camera.promise);

  coordinator.invalidate();
  camera.resolve({ status: "passed", serial: "camera-A" });

  assert.deepEqual(await pending, {
    accepted: false,
    cameraKey: "camera-A"
  });
});

test("the current camera rejection is accepted without throwing", async () => {
  const { createHardwareCameraTestCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareCameraTestCoordinator();
  const failure = new Error("camera unavailable");

  assert.deepEqual(
    await coordinator.run("camera-A", () => Promise.reject(failure)),
    {
      accepted: true,
      cameraKey: "camera-A",
      status: "rejected",
      reason: failure
    }
  );
});
