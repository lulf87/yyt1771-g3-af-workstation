import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ownershipSource = resolve(rootDir, "src/cameraOperationOwnership.ts");
const outDir = resolve(rootDir, ".tmp-camera-operation-ownership-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadModules() {
  assert.equal(
    existsSync(ownershipSource),
    true,
    "camera/exposure ownership must be aggregated by a production owner-token registry"
  );
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
      "--lib",
      "ES2020,DOM",
      "--outDir",
      outDir,
      "src/cameraOperationOwnership.ts",
      "src/exposureControl.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return {
    ownership: await import(
      `${pathToFileURL(resolve(outDir, "cameraOperationOwnership.js")).href}?${Date.now()}`
    ),
    exposure: await import(
      `${pathToFileURL(resolve(outDir, "exposureControl.js")).href}?${Date.now()}`
    )
  };
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function exerciseOldInstanceSettlement(lateOutcome) {
  const { exposure, ownership } = await loadModules();
  const aggregateEvents = [];
  let appBusy = false;
  const registry = ownership.createCameraBusyOwnerRegistry((busy) => {
    appBusy = busy;
    aggregateEvents.push(busy);
  });

  const ownerE1 = ownership.createCameraBusyOwnerToken();
  const trackerE1 = exposure.createExposureBusyTracker((busy) => {
    registry.setOwnerBusy(ownerE1, busy);
  });
  const write = deferred();
  let finishWrite = null;
  const coordinatorE1 = exposure.createExposureCommitCoordinator({
    delayMs: 200,
    apply: () => write.promise,
    onBusyChange(busy) {
      if (busy && finishWrite === null) finishWrite = trackerE1.begin();
      else if (!busy && finishWrite !== null) {
        finishWrite();
        finishWrite = null;
      }
    },
    onSuccess() {},
    onError() {},
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer)
  });

  coordinatorE1.commit(11000);
  assert.equal(appBusy, true);
  coordinatorE1.dispose();
  assert.equal(
    appBusy,
    true,
    "leaving Operator must not release an already-sent E1 write"
  );

  const ownerE2 = ownership.createCameraBusyOwnerToken();
  assert.notEqual(ownerE1, ownerE2, "every remount needs a unique owner token");
  const trackerE2 = exposure.createExposureBusyTracker((busy) => {
    registry.setOwnerBusy(ownerE2, busy);
  });
  const finishReadE2 = trackerE2.begin();
  assert.equal(appBusy, true);

  if (lateOutcome === "fulfilled") {
    write.resolve({ actual_us: 11000 });
  } else {
    write.reject(new Error("old E1 write failed after remount"));
  }
  await flushPromises();

  assert.equal(registry.isBusy(), true);
  assert.equal(appBusy, true);
  assert.deepEqual(
    {
      previewLocked: appBusy,
      probeLocked: appBusy,
      runLocked: appBusy
    },
    { previewLocked: true, probeLocked: true, runLocked: true },
    `old E1 ${lateOutcome} must not unlock E2`
  );

  finishReadE2();
  assert.equal(registry.isBusy(), false);
  assert.equal(appBusy, false);

  const eventCount = aggregateEvents.length;
  finishReadE2();
  registry.setOwnerBusy(ownerE1, false);
  registry.setOwnerBusy(ownership.createCameraBusyOwnerToken(), false);
  assert.equal(aggregateEvents.length, eventCount, "cleanup and unknown release are idempotent");
}

test("Operator remount keeps E2 locked when old E1 fulfilled write settles first", async () => {
  await exerciseOldInstanceSettlement("fulfilled");
});

test("Operator remount keeps E2 locked when old E1 rejected write settles first", async () => {
  await exerciseOldInstanceSettlement("rejected");
});

test("camera busy owner registry makes duplicate acquire/release and unknown release idempotent", async () => {
  const { ownership } = await loadModules();
  const events = [];
  const registry = ownership.createCameraBusyOwnerRegistry((busy) => events.push(busy));
  const owner = ownership.createCameraBusyOwnerToken();

  registry.setOwnerBusy(owner, true);
  registry.setOwnerBusy(owner, true);
  registry.setOwnerBusy(ownership.createCameraBusyOwnerToken(), false);
  registry.setOwnerBusy(owner, false);
  registry.setOwnerBusy(owner, false);

  assert.deepEqual(events, [true, false]);
  assert.equal(registry.isBusy(), false);
});

test("pending exposure debounce blocks Device Setup and starts its scan only after settlement", async () => {
  const { exposure, ownership } = await loadModules();
  let appBusy = false;
  let scheduledCallback = null;
  let openCalls = 0;
  let cameraScanCalls = 0;
  const registry = ownership.createCameraBusyOwnerRegistry((busy) => {
    appBusy = busy;
  });
  const owner = ownership.createCameraBusyOwnerToken();
  const tracker = exposure.createExposureBusyTracker((busy) => {
    registry.setOwnerBusy(owner, busy);
  });
  let finishWrite = null;
  const coordinator = exposure.createExposureCommitCoordinator({
    delayMs: 200,
    apply: async () => ({ actual_us: 12000 }),
    onBusyChange(busy) {
      if (busy && finishWrite === null) finishWrite = tracker.begin();
      else if (!busy && finishWrite !== null) {
        finishWrite();
        finishWrite = null;
      }
    },
    onSuccess() {},
    onError() {},
    setTimer(callback) {
      scheduledCallback = callback;
      return 1;
    },
    clearTimer() {
      scheduledCallback = null;
    }
  });
  const openAndScan = () => {
    openCalls += 1;
    cameraScanCalls += 1;
  };

  coordinator.schedule(12000);
  assert.equal(appBusy, true);
  assert.equal(scheduledCallback instanceof Function, true);
  assert.equal(ownership.runWhenCameraIdle(registry, openAndScan), false);
  assert.equal(openCalls, 0);
  assert.equal(cameraScanCalls, 0);

  coordinator.cancel();
  assert.equal(appBusy, false);
  assert.equal(ownership.runWhenCameraIdle(registry, openAndScan), true);
  assert.equal(openCalls, 1);
  assert.equal(cameraScanCalls, 1);
});

test("in-flight exposure PUT blocks Device Setup and starts its scan after transport settles", async () => {
  const { exposure, ownership } = await loadModules();
  const request = deferred();
  let appBusy = false;
  let openCalls = 0;
  let cameraScanCalls = 0;
  const registry = ownership.createCameraBusyOwnerRegistry((busy) => {
    appBusy = busy;
  });
  const owner = ownership.createCameraBusyOwnerToken();
  const tracker = exposure.createExposureBusyTracker((busy) => {
    registry.setOwnerBusy(owner, busy);
  });
  let finishWrite = null;
  const coordinator = exposure.createExposureCommitCoordinator({
    delayMs: 200,
    apply: () => request.promise,
    onBusyChange(busy) {
      if (busy && finishWrite === null) finishWrite = tracker.begin();
      else if (!busy && finishWrite !== null) {
        finishWrite();
        finishWrite = null;
      }
    },
    onSuccess() {},
    onError() {},
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer)
  });
  const openAndScan = () => {
    openCalls += 1;
    cameraScanCalls += 1;
  };

  coordinator.commit(13000);
  assert.equal(appBusy, true);
  assert.equal(ownership.runWhenCameraIdle(registry, openAndScan), false);
  assert.equal(cameraScanCalls, 0);

  request.resolve({ actual_us: 13000 });
  await flushPromises();
  assert.equal(appBusy, false);
  assert.equal(ownership.runWhenCameraIdle(registry, openAndScan), true);
  assert.equal(openCalls, 1);
  assert.equal(cameraScanCalls, 1);
});
