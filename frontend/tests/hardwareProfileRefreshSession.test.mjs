import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sessionSource = resolve(rootDir, "src/hardwareProfileRefreshSession.ts");
const outDir = resolve(rootDir, ".tmp-hardware-profile-refresh-session-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadModules() {
  assert.equal(
    existsSync(sessionSource),
    true,
    "hardware profile refresh must use a production last-write-wins session"
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
      "src/api/client.ts",
      "src/hardwareProfileRefreshSession.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return {
    api: await import(
      `${pathToFileURL(resolve(outDir, "api/client.js")).href}?${Date.now()}`
    ),
    session: await import(
      `${pathToFileURL(resolve(outDir, "hardwareProfileRefreshSession.js")).href}?${Date.now()}`
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

function hardwareProfile(serialNumber, ip, userDefinedName) {
  return {
    camera: {
      backend: "hik_gige_mvs",
      transport: "gige_vision",
      model: "MV-CA060-11GM",
      serial_number: serialNumber,
      ip,
      user_defined_name: userDefinedName
    },
    temp: {},
    run: {}
  };
}

test("new saved profile B remains authoritative when older startup profile A fulfills later", async () => {
  const { api, session: sessionModule } = await loadModules();
  const session = sessionModule.createHardwareProfileRefreshSession();
  const requestP1 = deferred();
  const requestP2 = deferred();
  let displayedProfile = null;
  const applied = [];
  const apply = (result) => {
    applied.push(result);
    if (result.status === "fulfilled") displayedProfile = result.value;
  };

  const pendingP1 = session.refresh(() => requestP1.promise, apply);
  const pendingP2 = session.refresh(() => requestP2.promise, apply);

  requestP2.resolve(hardwareProfile("CAM-B", "192.168.3.212", "B"));
  assert.equal(await pendingP2, true);
  assert.equal(
    api.hardwareProfileCameraIdentity(displayedProfile).serial_number,
    "CAM-B"
  );

  requestP1.resolve(hardwareProfile("CAM-A", "192.168.3.211", "A"));
  assert.equal(await pendingP1, false);
  assert.equal(applied.length, 1);
  assert.equal(
    api.hardwareProfileCameraIdentity(displayedProfile).serial_number,
    "CAM-B"
  );
});

test("older startup rejection is silent after saved profile B has committed", async () => {
  const { api, session: sessionModule } = await loadModules();
  const session = sessionModule.createHardwareProfileRefreshSession();
  const requestP1 = deferred();
  const requestP2 = deferred();
  let displayedProfile = null;
  const errors = [];
  const apply = (result) => {
    if (result.status === "fulfilled") displayedProfile = result.value;
    else errors.push(result.reason);
  };

  const pendingP1 = session.refresh(() => requestP1.promise, apply);
  const pendingP2 = session.refresh(() => requestP2.promise, apply);

  requestP2.resolve(hardwareProfile("CAM-B", "192.168.3.212", "B"));
  assert.equal(await pendingP2, true);
  requestP1.reject(new Error("stale startup profile failed"));
  assert.equal(await pendingP1, false);

  assert.equal(errors.length, 0);
  assert.equal(
    api.hardwareProfileCameraIdentity(displayedProfile).serial_number,
    "CAM-B"
  );
});

test("current hardware profile rejection is applied exactly once", async () => {
  const { session: sessionModule } = await loadModules();
  const session = sessionModule.createHardwareProfileRefreshSession();
  const failure = new Error("current profile failed");
  const applied = [];

  assert.equal(
    await session.refresh(() => Promise.reject(failure), (result) => applied.push(result)),
    true
  );
  assert.equal(applied.length, 1);
  assert.equal(applied[0].status, "rejected");
  assert.equal(applied[0].reason, failure);
});
