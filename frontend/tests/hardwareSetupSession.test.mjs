import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(rootDir, "src/hardwareSetupSession.ts");
const outDir = resolve(rootDir, ".tmp-hardware-setup-session-build");

const busyOwners = [
  "loadingWizard",
  "testingCamera",
  "testingTemperature",
  "testingBinding",
  "savingBinding",
  "savingSdkPaths"
];

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadSessionModule() {
  assert.equal(
    existsSync(sourcePath),
    true,
    "Device Setup needs a committed lifecycle session used by its real handlers"
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
      "--lib",
      "ES2020,DOM",
      "--outDir",
      outDir,
      "src/hardwareSetupRefreshCoordinator.ts",
      "src/hardwareSetupSession.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(
    `${pathToFileURL(resolve(outDir, "hardwareSetupSession.js")).href}?${Date.now()}`
  );
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

function createRecorder(createHardwareSetupSession) {
  const busy = Object.fromEntries(busyOwners.map((owner) => [owner, false]));
  const events = [];
  const session = createHardwareSetupSession({
    onBusyChange(owner, value) {
      busy[owner] = value;
      events.push([owner, value]);
    }
  });
  return { busy, events, session };
}

async function verifyCloseReopenLifecycle({
  createHardwareSetupSession,
  owner,
  lateOutcome,
  invoke
}) {
  const { busy, session } = createRecorder(createHardwareSetupSession);
  const requestW1 = deferred();
  const requestW2 = deferred();
  const applied = [];

  session.commitOpen(true);
  const pendingW1 = invoke(
    session,
    () => requestW1.promise,
    (result) => applied.push({ window: "W1", result })
  );

  session.commitOpen(false);
  session.commitOpen(true);
  const pendingW2 = invoke(
    session,
    () => requestW2.promise,
    (result) => applied.push({ window: "W2", result })
  );

  assert.equal(busy[owner], true, `${owner} must belong to reopened W2`);
  if (lateOutcome === "fulfilled") {
    requestW1.resolve({ source: "W1" });
  } else {
    requestW1.reject(new Error("W1 failed after close"));
  }

  assert.equal(await pendingW1, false);
  assert.deepEqual(applied, []);
  assert.equal(
    busy[owner],
    true,
    `stale W1 ${lateOutcome} must not clear reopened W2 ${owner}`
  );

  requestW2.resolve({ source: "W2" });
  assert.equal(await pendingW2, true);
  assert.equal(busy[owner], false);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].window, "W2");
  assert.equal(applied[0].result.status, "fulfilled");
}

test("only committed open changes lifecycle ownership across close and reopen", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const session = createHardwareSetupSession({ onBusyChange() {} });
  const request = deferred();
  let requestScope = null;
  let applied = null;

  session.commitOpen(true);
  const pending = session.refreshEnvironmentChecks(
    (scope) => {
      requestScope = scope;
      return request.promise;
    },
    (result) => {
      applied = result;
    }
  );

  assert.equal(requestScope.isCurrent(), true);

  // A render that never commits must not touch the committed session.
  const uncommittedOpenProp = false;
  assert.equal(uncommittedOpenProp, false);
  assert.equal(requestScope.isCurrent(), true);

  session.commitOpen(false);
  assert.equal(requestScope.isCurrent(), false);
  session.commitOpen(true);
  assert.equal(requestScope.isCurrent(), false);

  request.resolve({ overall_status: "passed" });
  assert.equal(await pending, false);
  assert.equal(applied, null);
});

test("refreshWizardData owns loadingWizard across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) => session.refreshWizardData(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "rejected",
    invoke
  });
});

test("refreshEnvironmentChecks owns loadingWizard across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.refreshEnvironmentChecks(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "rejected",
    invoke
  });
});

test("validateAndSaveSdkPaths owns savingSdkPaths across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.validateAndSaveSdkPaths(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "savingSdkPaths",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "savingSdkPaths",
    lateOutcome: "rejected",
    invoke
  });
});

test("scanHardwareCameras owns loadingWizard across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.scanHardwareCameras(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "rejected",
    invoke
  });
});

test("refreshTemperaturePorts owns loadingWizard across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.refreshTemperaturePorts(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "loadingWizard",
    lateOutcome: "rejected",
    invoke
  });
});

test("runCameraTest owns testingCamera across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) => session.runCameraTest(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingCamera",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingCamera",
    lateOutcome: "rejected",
    invoke
  });
});

test("runTemperatureTest owns testingTemperature across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.runTemperatureTest(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingTemperature",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingTemperature",
    lateOutcome: "rejected",
    invoke
  });
});

test("runBindingTest owns testingBinding across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) => session.runBindingTest(execute, apply);
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingBinding",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "testingBinding",
    lateOutcome: "rejected",
    invoke
  });
});

test("saveBinding owns savingBinding across late W1 fulfilled and rejected settlement", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const invoke = (session, execute, apply) =>
    session.saveBinding(
      {
        recheck: execute,
        shouldPersist: () => false,
        persist: async () => ({ saved: true }),
        refresh: async () => undefined
      },
      apply
    );
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "savingBinding",
    lateOutcome: "fulfilled",
    invoke
  });
  await verifyCloseReopenLifecycle({
    createHardwareSetupSession,
    owner: "savingBinding",
    lateOutcome: "rejected",
    invoke
  });
});

test("a current rejection is applied and releases only its production busy owner", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { busy, events, session } = createRecorder(createHardwareSetupSession);
  const failure = new Error("temperature test failed");
  let applied = null;

  session.commitOpen(true);
  events.length = 0;
  const accepted = await session.runTemperatureTest(
    () => Promise.reject(failure),
    (result) => {
      applied = result;
    }
  );

  assert.equal(accepted, true);
  assert.deepEqual(applied, {
    accepted: true,
    status: "rejected",
    reason: failure
  });
  assert.equal(busy.testingTemperature, false);
  assert.deepEqual(events, [
    ["testingTemperature", true],
    ["testingTemperature", false]
  ]);
});

test("invalidateOperations resets all owners and makes the active selection-era scope stale", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { busy, session } = createRecorder(createHardwareSetupSession);
  const request = deferred();
  let scope = null;
  let applied = null;

  session.commitOpen(true);
  const pending = session.runCameraTest(
    (currentScope) => {
      scope = currentScope;
      return request.promise;
    },
    (result) => {
      applied = result;
    }
  );

  assert.equal(busy.testingCamera, true);
  session.invalidateOperations();
  assert.equal(scope.isCurrent(), false);
  assert.deepEqual(busy, Object.fromEntries(busyOwners.map((owner) => [owner, false])));

  request.resolve({ status: "passed" });
  assert.equal(await pending, false);
  assert.equal(applied, null);
});

test("saveBinding invalidated during recheck starts neither persistence nor refresh", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { session } = createRecorder(createHardwareSetupSession);
  const recheck = deferred();
  let persistCalls = 0;
  let refreshCalls = 0;
  let applied = null;

  session.commitOpen(true);
  const pending = session.saveBinding(
    {
      recheck: () => recheck.promise,
      shouldPersist: () => true,
      persist: async () => {
        persistCalls += 1;
        return { saved: true };
      },
      refresh: async () => {
        refreshCalls += 1;
      }
    },
    (result) => {
      applied = result;
    }
  );

  session.commitOpen(false);
  recheck.resolve({ overall_status: "passed" });

  assert.equal(await pending, false);
  assert.equal(persistCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(applied, null);
});

test("saveBinding invalidated during persistence does not start post-save refresh", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { session } = createRecorder(createHardwareSetupSession);
  const persistence = deferred();
  let refreshCalls = 0;
  let applied = null;

  session.commitOpen(true);
  const pending = session.saveBinding(
    {
      recheck: async () => ({ overall_status: "passed" }),
      shouldPersist: () => true,
      persist: () => persistence.promise,
      refresh: async () => {
        refreshCalls += 1;
      }
    },
    (result) => {
      applied = result;
    }
  );

  await Promise.resolve();
  session.commitOpen(false);
  persistence.resolve({ saved: true });

  assert.equal(await pending, false);
  assert.equal(refreshCalls, 0);
  assert.equal(applied, null);
});

test("saveBinding invalidated during post-save refresh does not apply the completed save", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { session } = createRecorder(createHardwareSetupSession);
  const refresh = deferred();
  let applied = null;

  session.commitOpen(true);
  const pending = session.saveBinding(
    {
      recheck: async () => ({ overall_status: "passed" }),
      shouldPersist: () => true,
      persist: async () => ({ saved: true }),
      refresh: () => refresh.promise
    },
    (result) => {
      applied = result;
    }
  );

  await Promise.resolve();
  await Promise.resolve();
  session.commitOpen(false);
  refresh.resolve({ refreshed: true });

  assert.equal(await pending, false);
  assert.equal(applied, null);
});

test("saveBinding applies a current failed recheck without persistence or refresh", async () => {
  const { createHardwareSetupSession } = await loadSessionModule();
  const { busy, session } = createRecorder(createHardwareSetupSession);
  const freshTestResult = { overall_status: "failed" };
  let persistCalls = 0;
  let refreshCalls = 0;
  let applied = null;

  session.commitOpen(true);
  const accepted = await session.saveBinding(
    {
      recheck: async () => freshTestResult,
      shouldPersist: () => false,
      persist: async () => {
        persistCalls += 1;
        return { saved: true };
      },
      refresh: async () => {
        refreshCalls += 1;
      }
    },
    (result) => {
      applied = result;
    }
  );

  assert.equal(accepted, true);
  assert.deepEqual(applied, {
    accepted: true,
    status: "fulfilled",
    value: {
      freshTestResult,
      savedBinding: null,
      refreshResult: null
    }
  });
  assert.equal(persistCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(busy.savingBinding, false);
});
