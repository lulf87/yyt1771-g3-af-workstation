import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
const stylesSource = readFileSync(resolve(rootDir, "src/styles.css"), "utf8");
const i18nSource = readFileSync(resolve(rootDir, "src/i18n.ts"), "utf8");
const exposureControlPath = resolve(rootDir, "src/components/camera/ExposureControl.tsx");
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

test("operator real-camera preview mounts the shared exposure control and locks it during a run", () => {
  assert.ok(existsSync(exposureControlPath), "shared ExposureControl component must exist");
  const component = readFileSync(exposureControlPath, "utf8");
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(
    operatorPage,
    /!simulatedMode[\s\S]{0,300}<ExposureControl[\s\S]{0,250}camera=\{null\}/
  );
  assert.match(
    operatorPage,
    /<ExposureControl[\s\S]{0,350}runActive=\{operatorRunActive\}/
  );
  assert.match(
    operatorPage,
    /<ExposureControl[\s\S]{0,300}disabled=\{probing\}/,
    "probing must lock exposure while the camera is owned by the probe operation"
  );
  assert.doesNotMatch(
    operatorPage,
    /<ExposureControl[\s\S]{0,300}disabled=\{[^}]*cameraPreviewRefreshStatus/,
    "20 Hz preview refreshing must not repeatedly disable exposure"
  );
  assert.match(component, /disabled=\{disabled \|\| runActive/);
  assert.match(component, /if \(runActive\)/);
  assert.match(
    component,
    /if \(runActive\) \{[\s\S]{0,120}setLoadedCapability\(null\)/,
    "a stopped run must re-read exposure before stale capability controls can reopen"
  );
  assert.match(component, /readCameraExposure\(camera, controller\.signal\)/);
  assert.match(
    component,
    /useEffect\([\s\S]{0,1200}readCameraExposure\(camera, controller\.signal\)[\s\S]{0,1200}\[cameraKey, disabled, runActive/
  );
});

test("shared exposure control reports balanced read and write busy and cancels only unsent work when locked", () => {
  const component = readFileSync(exposureControlPath, "utf8");

  assert.match(component, /onBusyChange: \(busy: boolean\) => void;/);
  assert.match(component, /createExposureBusyTracker/);
  assert.match(component, /onBusyChange:\s*\(busy\)/);
  assert.match(component, /exposureBusyTrackerRef\.current!?\.begin\(\)/);
  assert.match(component, /readCameraExposure\(camera, controller\.signal\)[\s\S]{0,1000}finally/);
  assert.match(component, /let acceptResult = true;/);
  assert.match(component, /if \(!acceptResult\) return;/);
  assert.match(component, /return \(\) => \{[\s\S]{0,100}acceptResult = false;/);
  assert.doesNotMatch(
    component,
    /controller\.abort\(\)/,
    "effect cleanup must not turn local fetch rejection into false transport settlement"
  );
  assert.match(
    component,
    /if \(!disabled && !runActive\) return;[\s\S]{0,160}coordinatorRef\.current\?\.cancel\(\)/
  );
  assert.doesNotMatch(
    component,
    /\[cameraKey, (?:disabled, )?runActive\][\s\S]{0,80}coordinator\.dispose\(\)/,
    "disabled or run transitions must not dispose an already-sent exposure request"
  );
});

test("operator exposure busy pauses preview polling and gates Probe and Run", () => {
  const app = sourceSlice("function App() {", "function TabButton({");
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(app, /const \[exposureBusy, setExposureBusy\] = useState\(false\);/);
  assert.match(
    app,
    /if \(runningCamera \|\| probing \|\| exposureBusy\) return;/
  );
  assert.match(app, /onExposureBusyChange=\{setExposureBusy\}/);
  assert.match(app, /async function runOperatorProbeCurrentFrame\(\)[\s\S]{0,180}if \(exposureBusy\) return;/);
  assert.match(app, /function startOperatorRun\(\)[\s\S]{0,180}if \(exposureBusy\) return;/);
  assert.match(operatorPage, /onExposureBusyChange: \(busy: boolean\) => void;/);
  assert.match(operatorPage, /onBusyChange=\{onExposureBusyChange\}/);
  assert.match(
    operatorPage,
    /const probeCurrentFrameDisabled =\s+probing \|\| exposureBusy \|\| operatorRunActive/
  );
  assert.match(
    operatorPage,
    /const startDisabled =\s+operatorRunActive \|\|\s+exposureBusy \|\|/
  );
});

test("shared exposure control presents capability, lock, apply, save, unsupported, and error states", () => {
  assert.ok(existsSync(exposureControlPath), "shared ExposureControl component must exist");
  const component = readFileSync(exposureControlPath, "utf8");

  for (const copy of [
    "Camera exposure",
    "Camera exposure slider",
    "Exposure (μs)",
    "Loading exposure",
    "Applying exposure",
    "Applied and saved",
    "Exposure locked during a formal run",
    "Camera does not expose manual exposure control",
    "Exposure update failed"
  ]) {
    assert.match(component, new RegExp(copy.replace(/[()]/g, "\\$&")));
  }
  for (const [key, translation] of [
    ["Camera exposure", "相机曝光"],
    ["Camera exposure slider", "相机曝光滑杆"],
    ["Exposure (μs)", "曝光（μs）"],
    ["Loading exposure", "正在读取曝光"],
    ["Applying exposure", "正在应用曝光"],
    ["Applied and saved", "已应用并保存"],
    ["Exposure locked during a formal run", "正式测量期间曝光已锁定"],
    ["Camera does not expose manual exposure control", "相机未提供手动曝光能力"],
    ["Exposure update failed", "曝光应用失败"]
  ]) {
    assert.match(i18nSource, new RegExp(`"${key.replace(/[()]/g, "\\$&")}": "${translation}"`));
  }
  assert.doesNotMatch(component, /frame rate|fps|gain|auto exposure/i);
});

test("shared exposure control uses a compact responsive two-column layout", () => {
  assert.match(
    stylesSource,
    /\.cameraExposureControl\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(180px, 1fr\) minmax\(132px, 0\.35fr\);/s
  );
  assert.match(
    stylesSource,
    /@media \(max-width:\s*760px\)[\s\S]*\.cameraExposureControl\s*\{[^}]*grid-template-columns:\s*1fr;/
  );
});

test("diagnostic overlays and narrow-band handle order preserve ROI dragging after probing", () => {
  const frameCanvas = sourceSlice("function FrameCanvas({", "function useStableImageUrl(");
  assert.match(
    stylesSource,
    /\.contourProjectionOverlay\s*\{[^}]*pointer-events:\s*none;/s
  );
  assert.match(stylesSource, /\.abOverlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.ok(
    frameCanvas.indexOf("data-testid={`roi-resize-${handle.handle}`}") <
      frameCanvas.indexOf('data-testid="roi-move-handle"'),
    "the move handle must render after overlapping narrow-band resize handles"
  );
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

test("operator results page uses chart-only AFAS range and tangent controls without debug JSON", () => {
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
  assert.match(mainSource, /savgol_window_length:\s*21/);
  assert.match(afasParameterPanel, /Interactive baselines and tangent/);
  assert.match(afasParameterPanel, /Drag the low\/high shaded ranges and the tangent directly in the chart/);
  for (const removedManualField of [
    "Low start °C",
    "Low end °C",
    "High start °C",
    "High end °C",
    "Tangent offset"
  ]) {
    assert.doesNotMatch(afasParameterPanel, new RegExp(removedManualField));
  }
  assert.doesNotMatch(resultsPage, /JSON\.stringify/);
});

test("engineering mode still exposes full setup and detector controls", () => {
  assert.match(mainSource, /function SetupSourceControls\(/);
  assert.match(mainSource, /function DetectorSetupControls\(/);
  assert.doesNotMatch(mainSource, /<CDetectorModeControl/);
  assert.doesNotMatch(mainSource, /const OBJECT_CLASS_OPTIONS/);
  assert.match(mainSource, /Narrow measurement band/);
  assert.match(mainSource, /advancedDetectorParameters/);
  assert.match(mainSource, /Reference valid point count/);
  assert.match(mainSource, /CameraSetupStatusPanel/);
  assert.match(mainSource, /Read temp/);
});
