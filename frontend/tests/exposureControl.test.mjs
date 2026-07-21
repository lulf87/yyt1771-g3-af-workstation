import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-exposure-control-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadExposureControlModule() {
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
      "src/exposureControl.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "exposureControl.js")).href}?${Date.now()}`);
}

function createScheduler() {
  const timers = new Map();
  const delays = [];
  const cleared = [];
  let nextTimer = 0;

  return {
    timers,
    delays,
    cleared,
    setTimer(callback, delayMs) {
      const timer = ++nextTimer;
      timers.set(timer, callback);
      delays.push({ timer, delayMs });
      return timer;
    },
    clearTimer(timer) {
      cleared.push(timer);
      timers.delete(timer);
    },
    fireOnlyTimer() {
      assert.equal(timers.size, 1);
      const [timer, callback] = timers.entries().next().value;
      timers.delete(timer);
      callback();
    }
  };
}

function createPendingApply(pending) {
  return (value, signal) => new Promise((resolve, reject) => {
    pending.push({ value, signal, resolve, reject });
  });
}

test("exposure coordinator debounces slider input for 200 ms and applies only the latest value", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const pendingValues = [];
  const successes = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onPending: (value) => pendingValues.push(value),
    onSuccess: (actualUs) => successes.push(actualUs),
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.schedule(11000);
  coordinator.schedule(12000);

  assert.equal(scheduler.timers.size, 1);
  assert.deepEqual(scheduler.delays.map(({ delayMs }) => delayMs), [200, 200]);
  assert.deepEqual(pendingValues, []);
  assert.equal(pending.length, 0);

  scheduler.fireOnlyTimer();

  assert.equal(pending.length, 1);
  assert.equal(pending[0].value, 12000);
  assert.deepEqual(pendingValues, [12000]);
  pending[0].resolve({ actual_us: 11999.5 });
  await Promise.resolve();
  assert.deepEqual(successes, [11999.5]);
});

test("exposure coordinator commit clears a scheduled slider update and applies immediately", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const pendingValues = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onPending: (value) => pendingValues.push(value),
    onSuccess: () => {},
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.schedule(11000);
  coordinator.commit(13000);

  assert.equal(scheduler.timers.size, 0);
  assert.deepEqual(scheduler.cleared, [1]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].value, 13000);
  assert.deepEqual(pendingValues, [13000]);
  pending[0].resolve({ actual_us: 13000 });
  await Promise.resolve();
});

test("exposure coordinator aborts the older request when a newer apply starts", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: () => {},
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.commit(13000);

  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].signal.aborted, false);
  pending[1].resolve({ actual_us: 13000 });
  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
});

test("exposure coordinator ignores an older response that resolves after the latest request", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: (actualUs) => successes.push(actualUs),
    onError: (error) => errors.push(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.commit(13000);
  pending[1].resolve({ actual_us: 12999.5 });
  await Promise.resolve();
  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();

  assert.deepEqual(successes, [12999.5]);
  assert.deepEqual(errors, []);
});

test("exposure coordinator ignores an older rejection after a newer request starts", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: (actualUs) => successes.push(actualUs),
    onError: (error) => errors.push(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.commit(13000);
  pending[0].reject(new Error("stale failure"));
  await Promise.resolve();
  pending[1].resolve({ actual_us: 13000 });
  await Promise.resolve();

  assert.deepEqual(successes, [13000]);
  assert.deepEqual(errors, []);
});

test("exposure coordinator reports backend actual exposure and the full response", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: (actualUs, response) => successes.push({ actualUs, response }),
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });
  const response = { actual_us: 12999.5, requested_us: 13000, saved: true };

  coordinator.commit(13000);
  pending[0].resolve(response);
  await Promise.resolve();

  assert.equal(successes.length, 1);
  assert.equal(successes[0].actualUs, 12999.5);
  assert.notEqual(successes[0].actualUs, 13000);
  assert.equal(successes[0].response, response);
});

test("exposure coordinator reports a current non-aborted failure exactly once", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: () => assert.fail("unexpected success"),
    onError: (error) => errors.push(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });
  const error = new Error("camera rejected exposure");

  coordinator.commit(13000);
  pending[0].reject(error);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, [error]);
  assert.equal(pending[0].signal.aborted, false);
});

test("exposure coordinator dispose clears and aborts work, ignores late completion, and stays inert", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const pendingValues = [];
  const successes = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onPending: (value) => pendingValues.push(value),
    onSuccess: (actualUs) => successes.push(actualUs),
    onError: (error) => errors.push(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.schedule(13000);
  const scheduledCallback = [...scheduler.timers.values()][0];

  coordinator.dispose();
  coordinator.dispose();

  assert.equal(scheduler.timers.size, 0);
  assert.equal(pending[0].signal.aborted, true);
  scheduledCallback();
  coordinator.schedule(14000);
  coordinator.commit(15000);
  assert.equal(pending.length, 1);
  assert.deepEqual(pendingValues, [12000]);

  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
  assert.deepEqual(successes, []);
  assert.deepEqual(errors, []);
});
