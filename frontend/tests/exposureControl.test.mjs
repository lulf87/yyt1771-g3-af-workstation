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
      "--types",
      "vite/client",
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

test("numeric submission equal to the confirmed value queues behind an in-flight slider intent without blur duplication", async () => {
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
  assert.equal(pending[0].signal.aborted, false);
  assert.equal(pending.length, 1);
  assert.equal(lastRequestedUs, 200);

  const blurResult = submitExposureDraft({
    draft: "100",
    minimumUs: 10,
    maximumUs: 1000,
    confirmedUs: 100,
    latestIntentUs: 100,
    lastRequestedUs,
    coordinator
  });
  assert.deepEqual(blurResult, { kind: "submitted", value: 100 });
  assert.equal(pending.length, 1);

  pending[0].resolve({ actual_us: 200 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pending.length, 2);
  assert.equal(pending[1].value, 100);
  assert.equal(lastRequestedUs, 100);
  pending[1].resolve({ actual_us: 100 });
  await Promise.resolve();
});

test("a new slider schedule supersedes queued intent without aborting the active value", async () => {
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
  assert.equal(pending[0].signal.aborted, false);
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
  assert.equal(pending.length, 1);
  pending[0].resolve({ actual_us: 200 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pending.length, 2);
  assert.equal(pending[1].value, 200);
  pending[1].resolve({ actual_us: 200 });
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
        assert.equal(pending[0].signal.aborted, false);
        assert.equal(pending.length, 1);
        pending[0].resolve({ actual_us: 200 });
        await Promise.resolve();
        await Promise.resolve();
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

test("exposure coordinator queues a newer request without aborting the active request", async () => {
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

  assert.equal(pending.length, 1);
  assert.equal(pending[0].signal.aborted, false);
  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pending.length, 2);
  assert.equal(pending[1].signal.aborted, false);
  pending[1].resolve({ actual_us: 13000 });
  await Promise.resolve();
});

test("exposure coordinator reports intermediate and latest responses in serialized order", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: (actualUs, _response, context) => successes.push({ actualUs, context }),
    onError: (error) => errors.push(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.commit(13000);
  pending[0].resolve({ actual_us: 12000 });
  await Promise.resolve();
  await Promise.resolve();
  pending[1].resolve({ actual_us: 12999.5 });
  await Promise.resolve();

  assert.deepEqual(successes, [
    { actualUs: 12000, context: { isLatestIntent: false } },
    { actualUs: 12999.5, context: { isLatestIntent: true } }
  ]);
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

test("exposure coordinator reports active success as intermediate when a newer value is scheduled", async () => {
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
    onSuccess: (actualUs, _response, context) => successes.push({ actualUs, context }),
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
  assert.deepEqual(successes, [
    { actualUs: 12000, context: { isLatestIntent: false } }
  ]);
  assert.deepEqual(errors, []);
  assert.equal(pending[0].signal.aborted, false);

  scheduler.fireOnlyTimer();
  assert.equal(pending[1].value, 13000);
  assert.deepEqual(pendingValues, [12000, 13000]);
  pending[1].resolve({ actual_us: 13000 });
  await Promise.resolve();
  assert.deepEqual(successes, [
    { actualUs: 12000, context: { isLatestIntent: false } },
    { actualUs: 13000, context: { isLatestIntent: true } }
  ]);
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
  assert.equal(pending[0].signal.aborted, false);
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

test("exposure coordinator dispose clears unsent work without aborting active transport, ignores late completion, and stays inert", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const pendingValues = [];
  const successes = [];
  const errors = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: (value, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("transport aborted")), {
        once: true
      });
      pending.push({ value, signal, resolve, reject });
    }),
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
  assert.equal(pending[0].signal.aborted, false);
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

test("exposure coordinator keeps one apply in flight, coalesces A-B-C to A-C, and rolls final failure back to A", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const errors = [];
  let activeApplies = 0;
  let maximumActiveApplies = 0;
  let confirmedUs = 9000;
  let visibleDraftUs = 9000;

  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: (value, signal) => new Promise((resolve, reject) => {
      activeApplies += 1;
      maximumActiveApplies = Math.max(maximumActiveApplies, activeApplies);
      pending.push({
        value,
        signal,
        resolve(response) {
          activeApplies -= 1;
          resolve(response);
        },
        reject(error) {
          activeApplies -= 1;
          reject(error);
        }
      });
    }),
    onSuccess: (actualUs, response, context) => {
      confirmedUs = actualUs;
      if (context.isLatestIntent) visibleDraftUs = actualUs;
      successes.push({ actualUs, response, context });
    },
    onError: (error) => {
      visibleDraftUs = confirmedUs;
      errors.push(error);
    },
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(10000);
  visibleDraftUs = 11000;
  coordinator.commit(11000);
  visibleDraftUs = 12000;
  coordinator.commit(12000);

  assert.deepEqual(pending.map(({ value }) => value), [10000]);
  assert.equal(pending[0].signal.aborted, false);
  assert.equal(maximumActiveApplies, 1);

  const intermediateResponse = { actual_us: 10025, requested_us: 10000 };
  pending[0].resolve(intermediateResponse);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(pending.map(({ value }) => value), [10000, 12000]);
  assert.equal(maximumActiveApplies, 1);
  assert.equal(confirmedUs, 10025);
  assert.equal(visibleDraftUs, 12000);
  assert.deepEqual(successes, [
    {
      actualUs: 10025,
      response: intermediateResponse,
      context: { isLatestIntent: false }
    }
  ]);

  const finalError = new Error("final exposure failed");
  pending[1].reject(finalError);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(visibleDraftUs, 10025);
  assert.deepEqual(errors, [finalError]);
  assert.equal(maximumActiveApplies, 1);
});

test("exposure compensation waits behind the active apply without treating abort as server cancellation", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const successes = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onSuccess: (actualUs, _response, context) => successes.push({ actualUs, context }),
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(12000);
  coordinator.cancel();
  coordinator.commit(10000);

  assert.deepEqual(pending.map(({ value }) => value), [12000]);
  assert.equal(pending[0].signal.aborted, false);

  pending[0].resolve({ actual_us: 11950 });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(pending.map(({ value }) => value), [12000, 10000]);
  assert.deepEqual(successes, [
    { actualUs: 11950, context: { isLatestIntent: false } }
  ]);

  pending[1].resolve({ actual_us: 10010 });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(successes, [
    { actualUs: 11950, context: { isLatestIntent: false } },
    { actualUs: 10010, context: { isLatestIntent: true } }
  ]);
});

test("exposure coordinator stays busy from debounce through the final coalesced apply", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const busyChanges = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: createPendingApply(pending),
    onBusyChange: (busy) => busyChanges.push(busy),
    onSuccess: () => {},
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.schedule(10000);
  assert.deepEqual(busyChanges, [true]);

  scheduler.fireOnlyTimer();
  coordinator.commit(11000);
  coordinator.commit(12000);
  assert.deepEqual(busyChanges, [true]);
  assert.deepEqual(pending.map(({ value }) => value), [10000]);

  pending[0].resolve({ actual_us: 10000 });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(busyChanges, [true]);
  assert.deepEqual(pending.map(({ value }) => value), [10000, 12000]);

  pending[1].resolve({ actual_us: 12000 });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(busyChanges, [true, false]);
});

test("exposure coordinator does not release active busy early when disposed", async () => {
  const { createExposureCommitCoordinator } = await loadExposureControlModule();
  const scheduler = createScheduler();
  const pending = [];
  const busyChanges = [];
  const coordinator = createExposureCommitCoordinator({
    delayMs: 200,
    apply: (value, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("transport aborted")), {
        once: true
      });
      pending.push({ value, signal, resolve, reject });
    }),
    onBusyChange: (busy) => busyChanges.push(busy),
    onSuccess: () => assert.fail("disposed request must not report success"),
    onError: (error) => assert.fail(error),
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  coordinator.commit(10000);
  coordinator.commit(11000);
  coordinator.dispose();

  assert.equal(pending[0].signal.aborted, false);
  assert.deepEqual(busyChanges, [true]);
  assert.deepEqual(pending.map(({ value }) => value), [10000]);

  pending[0].resolve({ actual_us: 10000 });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(busyChanges, [true, false]);
  assert.deepEqual(pending.map(({ value }) => value), [10000]);
});

test("exposure busy tracker balances overlapping read and write lifetimes", async () => {
  const { createExposureBusyTracker } = await loadExposureControlModule();
  const busyChanges = [];
  const tracker = createExposureBusyTracker((busy) => busyChanges.push(busy));

  const finishRead = tracker.begin();
  const finishWrite = tracker.begin();
  assert.deepEqual(busyChanges, [true]);

  finishRead();
  finishRead();
  assert.deepEqual(busyChanges, [true]);

  finishWrite();
  assert.deepEqual(busyChanges, [true, false]);
});

test("disposing a never-settling exposure read aborts it and releases only its busy lease", async () => {
  const {
    createExposureBusyTracker,
    createExposureReadLifetime
  } = await loadExposureControlModule();
  const busyChanges = [];
  const tracker = createExposureBusyTracker((busy) => busyChanges.push(busy));

  const oldRead = createExposureReadLifetime(tracker);
  assert.equal(oldRead.signal.aborted, false);
  assert.deepEqual(busyChanges, [true]);

  oldRead.dispose();
  assert.equal(oldRead.signal.aborted, true);
  assert.deepEqual(busyChanges, [true, false]);

  const newRead = createExposureReadLifetime(tracker);
  assert.deepEqual(busyChanges, [true, false, true]);

  oldRead.dispose();
  assert.deepEqual(busyChanges, [true, false, true]);

  newRead.dispose();
  assert.equal(newRead.signal.aborted, true);
  assert.deepEqual(busyChanges, [true, false, true, false]);
});
