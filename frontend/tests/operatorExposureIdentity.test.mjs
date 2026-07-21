import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-operator-exposure-identity-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadModules() {
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
      "src/exposureControl.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return {
    api: await import(`${pathToFileURL(resolve(outDir, "api/client.js")).href}?${Date.now()}`),
    exposure: await import(`${pathToFileURL(resolve(outDir, "exposureControl.js")).href}?${Date.now()}`)
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
      user_defined_name: userDefinedName,
      exposure_us: 10000
    },
    temp: {},
    run: {}
  };
}

function capability(actualUs, minimumUs, maximumUs) {
  return {
    supported: true,
    minimum_us: minimumUs,
    maximum_us: maximumUs,
    increment_us: 1,
    requested_us: actualUs,
    actual_us: actualUs,
    saved: true,
    editable: true,
    lock_reason: ""
  };
}

async function identityFromFetchedProfile(api, profile) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(profile);
  try {
    return api.hardwareProfileCameraIdentity(await api.getHardwareProfile());
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Operator exposure A to B to A reads each fetched profile identity and rejects old fulfilled state", async () => {
  const { api, exposure } = await loadModules();
  const cameraA = await identityFromFetchedProfile(
    api,
    hardwareProfile("CAM-A", "192.168.3.211", "A")
  );
  const cameraB = await identityFromFetchedProfile(
    api,
    hardwareProfile("CAM-B", "192.168.3.212", "B")
  );
  const cameraAAgain = await identityFromFetchedProfile(
    api,
    hardwareProfile("CAM-A", "192.168.3.211", "A")
  );
  const session = exposure.createCameraExposureReadSession();
  const reads = [];
  const pendingReads = [];
  let displayed = null;

  function execute(identity) {
    const request = deferred();
    reads.push(identity);
    pendingReads.push(request);
    return request.promise;
  }

  const readA1 = session.read(cameraA, execute, (result) => {
    displayed = result;
  });
  const readB = session.read(cameraB, execute, (result) => {
    displayed = result;
  });

  pendingReads[1].resolve(capability(22000, 200, 80000));
  assert.equal(await readB, true);
  assert.equal(displayed.status, "fulfilled");
  assert.deepEqual(displayed.value, capability(22000, 200, 80000));

  pendingReads[0].resolve(capability(11111, 100, 100000));
  assert.equal(await readA1, false);
  assert.deepEqual(displayed.value, capability(22000, 200, 80000));

  const readA2 = session.read(cameraAAgain, execute, (result) => {
    displayed = result;
  });
  pendingReads[2].resolve(capability(12345, 150, 90000));
  assert.equal(await readA2, true);
  assert.deepEqual(displayed.value, capability(12345, 150, 90000));
  assert.deepEqual(
    reads.map(({ serial_number, ip }) => [serial_number, ip]),
    [
      ["CAM-A", "192.168.3.211"],
      ["CAM-B", "192.168.3.212"],
      ["CAM-A", "192.168.3.211"]
    ]
  );
});

test("Operator exposure identity change rejects an old camera read error", async () => {
  const { api, exposure } = await loadModules();
  const cameraA = await identityFromFetchedProfile(
    api,
    hardwareProfile("CAM-A", "192.168.3.211", "A")
  );
  const cameraB = await identityFromFetchedProfile(
    api,
    hardwareProfile("CAM-B", "192.168.3.212", "B")
  );
  const session = exposure.createCameraExposureReadSession();
  const requestA = deferred();
  const requestB = deferred();
  const applied = [];

  const readA = session.read(cameraA, () => requestA.promise, (result) => applied.push(result));
  const readB = session.read(cameraB, () => requestB.promise, (result) => applied.push(result));

  requestA.reject(new Error("late CAM-A failure"));
  assert.equal(await readA, false);
  assert.deepEqual(applied, []);

  requestB.resolve(capability(24000, 250, 75000));
  assert.equal(await readB, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].status, "fulfilled");
  assert.deepEqual(applied[0].value, capability(24000, 250, 75000));
});

test("exposure read settlement notifies only the accepted current session", async () => {
  const { exposure } = await loadModules();
  const session = exposure.createCameraExposureReadSession();
  const settled = [];
  const applied = [];

  assert.equal(
    await session.read(
      null,
      async () => capability(12000, 100, 100000),
      (result) => applied.push(result),
      () => settled.push("success")
    ),
    true
  );
  assert.deepEqual(settled, ["success"]);

  assert.equal(
    await session.read(
      null,
      async () => {
        throw new Error("current read failed");
      },
      (result) => applied.push(result),
      () => settled.push("error")
    ),
    true
  );
  assert.deepEqual(settled, ["success", "error"]);

  const staleRequest = deferred();
  const staleRead = session.read(
    null,
    () => staleRequest.promise,
    (result) => applied.push(result),
    () => settled.push("stale")
  );
  const currentRead = session.read(
    null,
    async () => capability(13000, 100, 100000),
    (result) => applied.push(result),
    () => settled.push("current")
  );
  assert.equal(await currentRead, true);
  staleRequest.resolve(capability(99999, 100, 100000));
  assert.equal(await staleRead, false);
  assert.deepEqual(settled, ["success", "error", "current"]);
});
