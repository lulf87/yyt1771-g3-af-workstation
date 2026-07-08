import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
const outDir = resolve(rootDir, ".tmp-operator-actual-use-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

async function loadOperatorTemperaturePollingModule() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    resolve(rootDir, "node_modules/.bin/tsc"),
    [
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
      "src/operatorTemperaturePolling.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "operatorTemperaturePolling.js")).href}?${Date.now()}`);
}

test("operator run page does not render data source, offline dataset, object class, or detector mode selectors", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.doesNotMatch(operatorPage, /<OperatorSourceControls/);
  assert.doesNotMatch(operatorPage, /onOperatorDataSource/);
  assert.doesNotMatch(operatorPage, /selectedDataset/);
  assert.doesNotMatch(operatorPage, /Offline dataset/);
  assert.doesNotMatch(operatorPage, /Object class/);
  assert.doesNotMatch(operatorPage, /CDetectorModeControl/);
  assert.doesNotMatch(operatorPage, /Detection method/);
  assert.match(operatorPage, /<OperatorDetectionParameterPanel/);
});

test("operator camera area only exposes current-frame probe and hides engineering camera fields", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(operatorPage, /Probe current frame/);
  for (const hiddenField of [
    "Camera status",
    "Current camera backend",
    "Current temperature backend",
    "Real temperature controller",
    "Live display",
    "model",
    "serial_number",
    "pixel_format"
  ]) {
    assert.doesNotMatch(operatorPage, new RegExp(hiddenField));
  }
});

test("operator temperature panel auto-read path removes manual read temperature button", () => {
  const panel = sourceSlice(
    "function OperatorTemperaturePanel({",
    "function OperatorImportPage({"
  );

  assert.match(panel, /Current temperature/);
  assert.match(panel, /Target temperature/);
  assert.match(panel, /Temperature power/);
  assert.match(panel, /Temperature serial port/);
  assert.match(panel, /Confirm test settings/);
  assert.match(panel, /Refresh ports/);
  assert.doesNotMatch(panel, /onReadCurrentTemperature/);
  assert.doesNotMatch(panel, /Read temp/);
});

test("operator temperature polling runs every 500ms only while idle", async () => {
  const {
    OPERATOR_TEMPERATURE_POLL_INTERVAL_MS,
    shouldAutoPollOperatorTemperature
  } = await loadOperatorTemperaturePollingModule();

  assert.equal(OPERATOR_TEMPERATURE_POLL_INTERVAL_MS, 500);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realHardwareAvailable: true,
    runningCamera: false,
    runningOffline: false
  }), true);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realHardwareAvailable: true,
    runningCamera: true,
    runningOffline: false
  }), false);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "engineering",
    page: "setup",
    operatorDataSource: "real_camera",
    realHardwareAvailable: true,
    runningCamera: false,
    runningOffline: false
  }), false);
});

test("operator results page keeps AFAS re-analysis controls without debug JSON", () => {
  const resultsPage = sourceSlice(
    "function OperatorResultsPage({",
    "function ImportedRunSummary("
  );
  const afasParameterPanel = sourceSlice(
    "function AfasParameterPanel({",
    "const ANALYSIS_AFAS_CHART_WIDTH"
  );

  assert.match(resultsPage, /<AfasParameterPanel/);
  assert.match(resultsPage, /buttonLabel="Re-analyze"/);
  assert.match(afasParameterPanel, /Savgol window/);
  assert.match(afasParameterPanel, /Low start °C/);
  assert.match(afasParameterPanel, /High start °C/);
  assert.doesNotMatch(resultsPage, /JSON\.stringify/);
});

test("engineering mode still exposes full setup and detector controls", () => {
  assert.match(mainSource, /function SetupSourceControls\(/);
  assert.match(mainSource, /function DetectorSetupControls\(/);
  assert.match(mainSource, /<CDetectorModeControl/);
  assert.match(mainSource, /Object class/);
  assert.match(mainSource, /Detection method/);
  assert.match(mainSource, /advancedDetectorParameters/);
  assert.match(mainSource, /Reference valid point count/);
  assert.match(mainSource, /CameraSetupStatusPanel/);
  assert.match(mainSource, /Read temp/);
});
