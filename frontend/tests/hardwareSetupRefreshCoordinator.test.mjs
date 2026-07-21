import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(rootDir, "src/hardwareSetupRefreshCoordinator.ts");
const outDir = resolve(rootDir, ".tmp-hardware-setup-refresh-coordinator-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadCoordinatorModule() {
  assert.equal(
    existsSync(sourcePath),
    true,
    "device setup needs one shared async-operation lifecycle coordinator"
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
      "src/hardwareSetupRefreshCoordinator.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(
    `${pathToFileURL(resolve(outDir, "hardwareSetupRefreshCoordinator.js")).href}?${Date.now()}`
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

const guardedOperationNames = [
  "full refresh",
  "environment refresh",
  "SDK path save",
  "camera scan",
  "temperature port refresh",
  "camera test",
  "temperature test",
  "binding test",
  "configuration save"
];

for (const operationName of guardedOperationNames) {
  for (const lateOutcome of ["fulfilled", "rejected"]) {
    test(`${operationName}: closed R1 ${lateOutcome} cannot write state or unlock reopened R2`, async () => {
      const { createHardwareSetupOperationCoordinator } = await loadCoordinatorModule();
      const coordinator = createHardwareSetupOperationCoordinator();
      const operationR1 = deferred();
      const operationR2 = deferred();
      let wizardOpen = true;
      let operationBusy = true;
      let appliedState = null;
      let appliedError = null;

      function applyResult(result) {
        if (!result.accepted || !wizardOpen) return;
        operationBusy = false;
        if (result.status === "fulfilled") appliedState = result.value;
        else appliedError = result.reason;
      }

      const pendingR1 = coordinator.run(() => operationR1.promise);

      wizardOpen = false;
      coordinator.invalidate();
      wizardOpen = true;
      const pendingR2 = coordinator.run(() => operationR2.promise);

      if (lateOutcome === "fulfilled") {
        operationR1.resolve({ source: "R1", operationName });
      } else {
        operationR1.reject(new Error(`${operationName} R1 failed after close`));
      }
      const resultR1 = await pendingR1;
      assert.deepEqual(resultR1, { accepted: false });
      applyResult(resultR1);

      assert.equal(operationBusy, true);
      assert.equal(appliedState, null);
      assert.equal(appliedError, null);

      operationR2.resolve({ source: "R2", operationName });
      const resultR2 = await pendingR2;
      assert.deepEqual(resultR2, {
        accepted: true,
        status: "fulfilled",
        value: { source: "R2", operationName }
      });
      applyResult(resultR2);

      assert.equal(operationBusy, false);
      assert.deepEqual(appliedState, { source: "R2", operationName });
      assert.equal(appliedError, null);
    });
  }
}

test("a staged operation scope becomes stale immediately after close invalidation", async () => {
  const { createHardwareSetupOperationCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareSetupOperationCoordinator();
  const operation = deferred();
  let operationScope = null;

  const pending = coordinator.run((scope) => {
    operationScope = scope;
    return operation.promise;
  });

  assert.equal(operationScope.isCurrent(), true);
  coordinator.invalidate();
  assert.equal(operationScope.isCurrent(), false);
  operation.resolve({ saved: false });
  assert.deepEqual(await pending, { accepted: false });
});

test("configuration save invalidated during binding recheck does not start the save stage", async () => {
  const { createHardwareSetupOperationCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareSetupOperationCoordinator();
  const bindingRecheck = deferred();
  let saveCalls = 0;

  const pending = coordinator.run(async (scope) => {
    const bindingResult = await bindingRecheck.promise;
    if (!scope.isCurrent()) return null;
    saveCalls += 1;
    return { bindingResult, saved: true };
  });

  coordinator.invalidate();
  bindingRecheck.resolve({ overall_status: "passed" });

  assert.deepEqual(await pending, { accepted: false });
  assert.equal(saveCalls, 0);
});

test("configuration save invalidated during persistence does not start post-save refresh", async () => {
  const { createHardwareSetupOperationCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareSetupOperationCoordinator();
  const persistence = deferred();
  let postSaveRefreshCalls = 0;

  const pending = coordinator.run(async (scope) => {
    const savedBinding = await persistence.promise;
    if (!scope.isCurrent()) return null;
    postSaveRefreshCalls += 1;
    return savedBinding;
  });

  coordinator.invalidate();
  persistence.resolve({ saved: true });

  assert.deepEqual(await pending, { accepted: false });
  assert.equal(postSaveRefreshCalls, 0);
});

test("the current operation rejection is accepted without throwing", async () => {
  const { createHardwareSetupOperationCoordinator } = await loadCoordinatorModule();
  const coordinator = createHardwareSetupOperationCoordinator();
  const failure = new Error("current operation failed");

  assert.deepEqual(
    await coordinator.run(() => Promise.reject(failure)),
    {
      accepted: true,
      status: "rejected",
      reason: failure
    }
  );
});
