import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-exposure-control-test-build");
const typecheckDir = resolve(rootDir, ".tmp-exposure-control-typecheck");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
  rmSync(typecheckDir, { recursive: true, force: true });
});

function typecheckExposureApiIntegration() {
  rmSync(typecheckDir, { recursive: true, force: true });
  mkdirSync(typecheckDir, { recursive: true });
  const fixturePath = resolve(typecheckDir, "integration.ts");
  writeFileSync(
    fixturePath,
    `import { updateCameraExposure } from "../src/api/client";
import { createExposureCommitCoordinator } from "../src/exposureControl";

const coordinator = createExposureCommitCoordinator({
  delayMs: 200,
  apply: (value, signal) => updateCameraExposure(value, null, signal),
  onSuccess: (actualUs, response) => {
    actualUs.toFixed(1);
    response.actual_us.toFixed(1);
  },
  onError: () => {},
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer)
});

coordinator.dispose();
`,
    "utf8"
  );
  try {
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
        "--noEmit",
        fixturePath
      ],
      { cwd: rootDir, stdio: "pipe" }
    );
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((chunk) => chunk.toString())
      .join("\n");
    assert.fail(output || error.message);
  }
}

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

test("camera exposure update composes with the coordinator under strict TypeScript", () => {
  typecheckExposureApiIntegration();
});

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

test("numeric submission equal to the confirmed value replaces a scheduled slider intent", async () => {
  const {
    createExposureCommitCoordinator,
    submitExposureDraft
  } = await loadExposureControlModule();
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

  coordinator.schedule(200);
  const result = submitExposureDraft({
    draft: "100",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: 100,
    latestIntentUs: 200,
    lastRequestedUs: null,
    coordinator
  });

  assert.deepEqual(result, { kind: "submitted", value: 100 });
  assert.equal(scheduler.timers.size, 0);
  assert.deepEqual(scheduler.cleared, [1]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].value, 100);
  pending[0].resolve({ actual_us: 100 });
  await Promise.resolve();
});

test("numeric submission equal to the confirmed value aborts an in-flight slider intent without blur duplication", async () => {
  const {
    createExposureCommitCoordinator,
    submitExposureDraft
  } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  let lastRequestedUs = null;
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onPending: (value) => {
      lastRequestedUs = value;
    },
    onSuccess: () => {},
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.schedule(200);
  scheduler.fireOnlyTimer();
  assert.equal(lastRequestedUs, 200);

  const enterResult = submitExposureDraft({
    draft: "100",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: 100,
    latestIntentUs: 200,
    lastRequestedUs,
    coordinator
  });
  assert.deepEqual(enterResult, { kind: "submitted", value: 100 });
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending.length, 2);
  assert.equal(pending[1].value, 100);
  assert.equal(lastRequestedUs, 100);

  const blurResult = submitExposureDraft({
    draft: "100",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: 100,
    latestIntentUs: 100,
    lastRequestedUs,
    coordinator
  });
  assert.deepEqual(blurResult, { kind: "pending", value: 100 });
  assert.equal(pending.length, 2);

  pending[1].resolve({ actual_us: 100 });
  pending[0].resolve({ actual_us: 200 });
  await Promise.resolve();
});

test("a new slider schedule invalidates the old active value before numeric resubmission", async () => {
  const {
    createExposureCommitCoordinator,
    scheduleExposureDraft,
    submitExposureDraft
  } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  let latestIntentUs = null;
  let lastRequestedUs = null;
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onPending: (value) => {
      lastRequestedUs = value;
    },
    onSuccess: () => {},
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(200);
  assert.equal(lastRequestedUs, 200);

  scheduleExposureDraft({
    value: 300,
    coordinator,
    onIntent: (intent) => {
      latestIntentUs = intent.latestIntentUs;
      lastRequestedUs = intent.lastRequestedUs;
    }
  });
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(latestIntentUs, 300);
  assert.equal(lastRequestedUs, null);
  assert.equal(scheduler.timers.size, 1);

  const result = submitExposureDraft({
    draft: "200",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: 100,
    latestIntentUs,
    lastRequestedUs,
    coordinator
  });

  assert.deepEqual(result, { kind: "submitted", value: 200 });
  assert.equal(scheduler.timers.size, 0);
  assert.equal(pending.length, 2);
  assert.equal(pending[1].value, 200);
  pending[1].resolve({ actual_us: 200 });
  pending[0].resolve({ actual_us: 200 });
  await Promise.resolve();
});

for (const invalidDraft of [
  { label: "empty", value: "" },
  { label: "non-finite", value: "NaN" },
  { label: "out-of-range", value: "1001" }
]) {
  for (const phase of ["scheduled", "in-flight"]) {
    test(`${invalidDraft.label} numeric submission compensates a ${phase} slider intent exactly once`, async () => {
      const {
        createExposureCommitCoordinator,
        scheduleExposureDraft,
        submitExposureDraft
      } = await loadExposureControlModule();
      const scheduler = createScheduler();
      const pending = [];
      let latestIntentUs = null;
      let lastRequestedUs = null;
      const coordinator = createExposureCommitCoordinator({
        delayMs: 200,
        apply: createPendingApply(pending),
        onPending: (value) => {
          lastRequestedUs = value;
        },
        onSuccess: () => {},
        onError: (error) => assert.fail(error),
        setTimer: scheduler.setTimer,
        clearTimer: scheduler.clearTimer
      });

      scheduleExposureDraft({
        value: 200,
        coordinator,
        onIntent: (intent) => {
          latestIntentUs = intent.latestIntentUs;
          lastRequestedUs = intent.lastRequestedUs;
        }
      });
      if (phase === "in-flight") {
        scheduler.fireOnlyTimer();
        assert.equal(lastRequestedUs, 200);
      }

      const result = submitExposureDraft({
        draft: invalidDraft.value,
        minimumUs: 10,
        maximumUs: 1000,
        confirmedUs: 100,
        latestIntentUs,
        lastRequestedUs,
        compensationPending: false,
        coordinator
      });

      assert.deepEqual(result, {
        kind: "compensating",
        reason: invalidDraft.label === "out-of-range" ? "range" : "finite",
        value: 100
      });
      assert.equal(scheduler.timers.size, 0);
      if (phase === "in-flight") {
        assert.equal(pending[0].signal.aborted, true);
      }
      const compensation = pending.at(-1);
      assert.equal(compensation.value, 100);
      assert.equal(compensation.signal.aborted, false);
      const applyCount = pending.length;

      const blurResult = submitExposureDraft({
        draft: invalidDraft.value,
        minimumUs: 10,
        maximumUs: 1000,
        confirmedUs: 100,
        latestIntentUs: 100,
        lastRequestedUs: 100,
        compensationPending: true,
        coordinator
      });
      assert.deepEqual(blurResult, {
        kind: "compensation_pending",
        reason: invalidDraft.label === "out-of-range" ? "range" : "finite",
        value: 100
      });
      assert.equal(pending.length, applyCount);

      compensation.resolve({ actual_us: 100 });
      if (phase === "in-flight") pending[0].resolve({ actual_us: 200 });
      await Promise.resolve();
    });
  }
}

test("invalid numeric submission without a confirmed value cancels the old intent without applying", async () => {
  const {
    createExposureCommitCoordinator,
    scheduleExposureDraft,
    submitExposureDraft
  } = await loadExposureControlModule();
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

  scheduleExposureDraft({
    value: 200,
    coordinator,
    onIntent: () => {}
  });
  const result = submitExposureDraft({
    draft: "",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: null,
    latestIntentUs: 200,
    lastRequestedUs: null,
    compensationPending: false,
    coordinator
  });

  assert.deepEqual(result, { kind: "cancelled", reason: "finite" });
  assert.equal(scheduler.timers.size, 0);
  assert.equal(pending.length, 0);
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

test("exposure coordinator ignores an active success as soon as a newer value is scheduled", async () => {
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
  assert.equal(pending.length, 1);
  assert.deepEqual(pendingValues, [12000]);

  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
  assert.deepEqual(successes, []);
  assert.deepEqual(errors, []);
  assert.equal(pending[0].signal.aborted, true);

  scheduler.fireOnlyTimer();
  assert.equal(pending[1].value, 13000);
  assert.deepEqual(pendingValues, [12000, 13000]);
  pending[1].resolve({ actual_us: 13000 });
  await Promise.resolve();
  assert.deepEqual(successes, [13000]);
});

test("exposure coordinator ignores an active failure as soon as a newer value is scheduled", async () => {
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
  coordinator.schedule(13000);
  pending[0].reject(new Error("superseded failure"));
  await Promise.resolve();

  assert.deepEqual(successes, []);
  assert.deepEqual(errors, []);
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending.length, 1);

  scheduler.fireOnlyTimer();
  pending[1].resolve({ actual_us: 13000 });
  await Promise.resolve();
  assert.deepEqual(successes, [13000]);
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
