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

test("application root exposes only the actual-use operator workflow", () => {
  const app = sourceSlice("function App() {", "function TabButton({");

  assert.doesNotMatch(app, /<UiModeSwitch/);
  assert.doesNotMatch(app, /uiMode === "engineering"/);
  assert.doesNotMatch(app, /readInitialUiMode/);
  assert.doesNotMatch(app, /persistUiMode/);
  assert.doesNotMatch(app, /setUiMode/);
  assert.match(app, /navItemsForUiMode\("operator"\)/);
});

test("operator workflow is driven by backend runtime source without a source switch", () => {
  const app = sourceSlice("function App() {", "function TabButton({");
  const operatorPage = sourceSlice("function OperatorRunPage({", "function OperatorSourceControls({");

  assert.match(app, /getAppRuntime\(\)/);
  assert.match(app, /appRuntime\?\.runtime_source === "simulated_material"/);
  assert.match(operatorPage, /Simulated material debug/);
  assert.match(operatorPage, /Simulated material debug mode is active\. This is not real test data\./);
  assert.match(operatorPage, /Start simulated test/);
  assert.doesNotMatch(operatorPage, /<OperatorSourceControls/);
});

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

test("operator camera area treats connected hardware without a probed frame as an idle empty state", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(
    operatorPage,
    /cameraPreviewRefreshStatus === "unavailable" && realHardwareAvailable && !cameraPreviewError\s+\? "idle"\s+: cameraPreviewRefreshStatus/
  );
});

test("operator mode auto-opens a 20 fps real camera preview after hardware setup succeeds", () => {
  const app = sourceSlice(
    "function App() {",
    "function TabButton({"
  );

  assert.match(mainSource, /const OPERATOR_CAMERA_PREVIEW_FPS = 20;/);
  assert.match(app, /const operatorPreviewAllowed =/);
  assert.match(app, /operatorSourceStatus\?\.real_hardware_available === true/);
  assert.match(app, /if \(uiMode === "operator" && !operatorPreviewAllowed\) return;/);
  assert.match(mainSource, /setup_preview_fps: OPERATOR_CAMERA_PREVIEW_FPS/);
  assert.doesNotMatch(app, /if \(uiMode === "operator"\) return;\s+if \(!shouldPollRealCameraPreview/);
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

test("operator source-status refresh is stable and does not clear old status on failures", () => {
  const app = sourceSlice(
    "function App() {",
    "function TabButton({"
  );

  assert.match(mainSource, /OPERATOR_SOURCE_STATUS_RETRY_DELAYS_MS\s*=\s*\[5000, 10000, 30000\]/);
  assert.match(app, /operatorSourceStatusRequestInFlightRef/);
  assert.match(app, /operatorSourceStatusAbortRef/);
  assert.match(app, /operatorSourceStatusRetryTimerRef/);
  assert.match(app, /sameOperatorSourceStatus\(current, nextStatus\)/);
  assert.match(app, /setOperatorSourceStatus\(\(current\) =>/);
  assert.match(app, /scheduleOperatorSourceStatusRetry\(\)/);
  assert.doesNotMatch(app, /setOperatorSourceStatus\(null\)/);
});

test("operator temperature polling runs every 500ms only when real temperature is available and idle", async () => {
  const app = sourceSlice(
    "function App() {",
    "function TabButton({"
  );
  const {
    OPERATOR_TEMPERATURE_IDLE_POLL_MS,
    shouldAutoPollOperatorTemperature
  } = await loadOperatorTemperaturePollingModule();

  assert.equal(OPERATOR_TEMPERATURE_IDLE_POLL_MS, 500);
  assert.match(app, /hardwareSetupWizardOpen:\s*deviceSetupOpen/);
  assert.match(app, /operatorTemperaturePollInFlightRef/);
  assert.match(app, /window\.setInterval\(\s*tick,\s*OPERATOR_TEMPERATURE_IDLE_POLL_MS\s*\)/s);
  assert.match(app, /window\.clearInterval\(id\)/);
  assert.match(app, /if \(operatorTemperaturePollInFlightRef\.current\) return/);
  assert.match(app, /operatorTemperaturePollInFlightRef\.current = true/);
  assert.match(app, /operatorTemperaturePollInFlightRef\.current = false/);
  assert.match(app, /const ok = await readCurrentTemperature/);
  assert.match(app, /if \(!ok && !cancelled\)/);
  assert.match(app, /deviceSetupOpen,\s+operatorSettings\?\.serialPort/s);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: true,
    hasTemperatureError: false,
    runningCamera: false,
    runningOffline: false,
    hardwareSetupWizardOpen: false
  }), true);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: true,
    hasTemperatureError: false,
    runningCamera: true,
    runningOffline: false,
    hardwareSetupWizardOpen: false
  }), false);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: false,
    hasTemperatureError: false,
    runningCamera: false,
    runningOffline: false,
    hardwareSetupWizardOpen: false
  }), false);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: true,
    hasTemperatureError: true,
    runningCamera: false,
    runningOffline: false,
    hardwareSetupWizardOpen: false
  }), false);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "operator",
    page: "operatorRun",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: true,
    hasTemperatureError: false,
    runningCamera: false,
    runningOffline: false,
    hardwareSetupWizardOpen: true
  }), false);
  assert.equal(shouldAutoPollOperatorTemperature({
    uiMode: "engineering",
    page: "setup",
    operatorDataSource: "real_camera",
    realTemperatureAvailable: true,
    hasTemperatureError: false,
    runningCamera: false,
    runningOffline: false,
    hardwareSetupWizardOpen: false
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
  assert.match(resultsPage, /buttonLabel="Re-analyze current position"/);
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
