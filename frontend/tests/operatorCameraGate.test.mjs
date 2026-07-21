import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-operator-camera-gate-build");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadModule() {
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
      "--outDir",
      outDir,
      "src/operatorCameraGate.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "operatorCameraGate.js")).href}?${Date.now()}`);
}

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

test("temperature unavailable or error removes an unreadable initial exposure gate", async () => {
  const gate = await loadModule();
  const readable = {
    operatorMode: true,
    operatorRunPage: true,
    realCameraSource: true,
    sourceRealHardwareAvailable: true,
    cameraIdentityAvailable: true,
    deviceSetupOpen: false,
    temperatureUnavailable: false
  };

  assert.equal(gate.operatorExposureControlCanRead(readable), true);
  assert.equal(gate.operatorExposureReadPending(readable, true), true);

  const unavailable = { ...readable, temperatureUnavailable: true };
  assert.equal(gate.operatorExposureControlCanRead(unavailable), false);
  assert.equal(gate.operatorExposureReadPending(unavailable, true), false);

  const error = { ...readable, temperatureUnavailable: true };
  assert.equal(gate.operatorExposureControlCanRead(error), false);
  assert.equal(gate.operatorExposureReadPending(error, true), false);
});

test("programmatic Probe and Start actions do not dispatch during the initial exposure read", async () => {
  const gate = await loadModule();
  let probeApiCalls = 0;
  let startApiCalls = 0;

  const probeResult = gate.runOperatorCameraAction(true, () => {
    probeApiCalls += 1;
    return "probe";
  });
  const startResult = gate.runOperatorCameraAction(true, () => {
    startApiCalls += 1;
    return "start";
  });

  assert.equal(probeResult, undefined);
  assert.equal(startResult, undefined);
  assert.equal(probeApiCalls, 0);
  assert.equal(startApiCalls, 0);
  assert.equal(gate.runOperatorCameraAction(false, () => ++probeApiCalls), 1);
  assert.equal(gate.runOperatorCameraAction(false, () => ++startApiCalls), 1);
});

test("App and Operator page wire the shared initial-read lock into mounts, handlers, and buttons", () => {
  const app = sourceSlice("function App() {", "function TabButton({");
  const operatorPage = sourceSlice("function OperatorRunPage({", "function OperatorSourceControls({");

  assert.match(app, /const operatorExposureControlCanRead = canReadOperatorExposureControl\(/);
  assert.match(app, /const operatorExposureReadPending = isOperatorExposureReadPending\(/);
  assert.match(app, /const operatorCameraActionLocked = exposureBusy \|\| operatorExposureReadPending;/);
  assert.match(
    app,
    /async function runOperatorProbeCurrentFrame\(\)[\s\S]{0,220}runOperatorCameraAction\(operatorCameraActionLocked/
  );
  assert.match(
    app,
    /function startOperatorRun\(\)[\s\S]{0,220}runOperatorCameraAction\(operatorCameraActionLocked/
  );
  assert.match(app, /operatorCameraActionLocked=\{operatorCameraActionLocked\}/);
  assert.match(operatorPage, /operatorCameraActionLocked: boolean;/);
  assert.match(
    operatorPage,
    /const probeCurrentFrameDisabled =[\s\S]{0,120}operatorCameraActionLocked/
  );
  assert.match(
    operatorPage,
    /const startDisabled =[\s\S]{0,120}operatorCameraActionLocked/
  );
  assert.match(operatorPage, /operatorExposureControlCanRead \? \([\s\S]{0,120}<ExposureControl/);
});
