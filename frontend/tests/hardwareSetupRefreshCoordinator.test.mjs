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
    "device setup needs an independent full-refresh lifecycle coordinator"
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

for (const lateOutcome of ["fulfilled", "rejected"]) {
  test(`closed R1 ${lateOutcome} result cannot write state or unlock reopened R2`, async () => {
    const { createHardwareSetupRefreshCoordinator } = await loadCoordinatorModule();
    const coordinator = createHardwareSetupRefreshCoordinator();
    const refreshR1 = deferred();
    const refreshR2 = deferred();
    let wizardOpen = true;
    let loadingWizard = true;
    let appliedState = null;
    let appliedError = null;

    function applyResult(result) {
      if (!result.accepted || !wizardOpen) return;
      loadingWizard = false;
      if (result.status === "fulfilled") appliedState = result.value;
      else appliedError = result.reason;
    }

    const pendingR1 = coordinator.run(() => refreshR1.promise);

    wizardOpen = false;
    coordinator.invalidate();
    wizardOpen = true;
    const pendingR2 = coordinator.run(() => refreshR2.promise);

    if (lateOutcome === "fulfilled") {
      refreshR1.resolve({ source: "R1" });
    } else {
      refreshR1.reject(new Error("R1 failed after close"));
    }
    const resultR1 = await pendingR1;
    assert.deepEqual(resultR1, { accepted: false });
    applyResult(resultR1);

    assert.equal(loadingWizard, true);
    assert.equal(appliedState, null);
    assert.equal(appliedError, null);

    refreshR2.resolve({ source: "R2" });
    const resultR2 = await pendingR2;
    assert.deepEqual(resultR2, {
      accepted: true,
      status: "fulfilled",
      value: { source: "R2" }
    });
    applyResult(resultR2);

    assert.equal(loadingWizard, false);
    assert.deepEqual(appliedState, { source: "R2" });
    assert.equal(appliedError, null);
  });
}
