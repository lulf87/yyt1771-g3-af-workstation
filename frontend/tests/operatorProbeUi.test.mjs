import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

test("operator mode has a fresh current-frame probe handler", () => {
  const handler = sourceSlice(
    "async function runOperatorRealCameraSetupProbe()",
    "async function runOperatorProbeCurrentFrame()"
  );

  assert.match(handler, /if \(!operatorRealHardwareAvailable\)/);
  assert.match(handler, /await probeRealCameraSetupFrame\(currentMeasurement, \{\s+operatorMode: true,\s+operatorDataSource: "real_camera"\s+\}\);/s);
  assert.match(handler, /applyRealCameraProbeResponse\(response, "live"\);/);
  assert.match(handler, /setProbe\(response\);/);
  assert.doesNotMatch(handler, /framePngDataUrl/);
  assert.doesNotMatch(handler, /requireSetupFrameDataUrl/);
});

test("operator current-frame probe dispatches the startup-selected runtime source", () => {
  const dispatcher = sourceSlice(
    "async function runOperatorProbeCurrentFrame()",
    "async function startLiveOfflineRun("
  );

  assert.match(mainSource, /function readInitialOperatorDataSource\(\): OperatorDataSource \{\s+return "real_camera";\s+\}/);
  assert.doesNotMatch(dispatcher, /operatorDataSource === "offline_dataset"/);
  assert.match(dispatcher, /appRuntime\?\.runtime_source === "simulated_material"/);
  assert.match(dispatcher, /await runProbe\(frameIndex\);/);
  assert.match(dispatcher, /if \(!operatorRealHardwareAvailable\)/);
  assert.match(dispatcher, /await runOperatorRealCameraSetupProbe\(\);/);
});

test("operator run page receives probe state and wires the current-frame probe button", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(mainSource, /onOperatorProbeCurrentFrame=\{runOperatorProbeCurrentFrame\}/);
  assert.match(mainSource, /probe=\{displayedProbe\}/);
  assert.match(mainSource, /probing=\{probing\}/);
  assert.match(mainSource, /onProbeRealCameraSetup=\{onOperatorProbeCurrentFrame\}/);
  assert.match(operatorPage, /probe: ProbeResponse \| null;/);
  assert.match(operatorPage, /probing: boolean;/);
  assert.match(operatorPage, /onProbeRealCameraSetup: \(\) => void;/);
  assert.match(operatorPage, /const operatorRunActive = runningCamera \|\| runningOffline;/);
  assert.match(
    operatorPage,
    /const probeCurrentFrameDisabled =\s+probing \|\| operatorRunActive \|\| !hasMeasurementRoi \|\| !sourceAvailable;/
  );
  assert.match(operatorPage, /disabled=\{probeCurrentFrameDisabled\}/);
  assert.match(operatorPage, /onClick=\{onProbeRealCameraSetup\}/);
  assert.match(operatorPage, /probing \? t\("Probing"\) : t\("Probe current frame"\)/);
  assert.match(operatorPage, /Single-frame probing is disabled during a live test/);
});

test("operator real-camera mode requires real hardware before showing frames or enabling actions", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(mainSource, /const \[operatorSourceStatus, setOperatorSourceStatus\] = useState<OperatorSourceStatus \| null>\(null\);/);
  assert.match(mainSource, /getOperatorSourceStatus\(\{ signal: controller\.signal \}\)/);
  assert.match(mainSource, /operatorDataSource === "real_camera" && !operatorRealHardwareAvailable/);
  assert.match(mainSource, /const operatorTemperatureHardwareUnavailable =/);
  assert.match(mainSource, /const operatorRealHardwareAvailable = operatorSourceRealHardwareAvailable && !operatorTemperatureHardwareUnavailable;/);
  assert.match(operatorPage, /const temperatureHardwareUnavailable = Boolean\(temperatureHardwareMessage\);/);
  assert.match(operatorPage, /const realHardwareAvailable = operatorSourceStatus\?\.real_hardware_available === true && !temperatureHardwareUnavailable;/);
  assert.doesNotMatch(operatorPage, /canUseOfflineDataset/);
  assert.doesNotMatch(operatorPage, /isOfflineSource/);
  assert.match(operatorPage, /!simulatedMode && !realHardwareAvailable \? \(/);
  assert.match(operatorPage, /<RealHardwareUnavailableCard/);
  assert.match(operatorPage, /const startDisabled = operatorRunActive \|\| !sourceAvailable/);
  assert.match(operatorPage, /title=\{!sourceAvailable \? t\("Real hardware unavailable"\) : undefined\}/);
  assert.doesNotMatch(operatorPage, /activeFrameUrl/);
});

test("operator current-frame probe result drives image overlay without engineering diagnostics card", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(operatorPage, /const setupProbeDetection = canShowCurrentSourceData && !operatorRunActive && probe \? probe\.detection_result : null;/);
  assert.match(operatorPage, /\(canShowCurrentSourceData \? liveRun\?\.detectionResult : null\) \?\?\s+setupProbeDetection/s);
  assert.match(operatorPage, /probe\?\.image_data_url \?\? cameraPreviewUrl/);
  assert.match(operatorPage, /probe\?\.region_results/);
  assert.match(operatorPage, /regions=\{frameRegionOverlays\}/);
  assert.match(operatorPage, /activeRegionId=\{activeRegionId\}/);
  assert.match(operatorPage, /detection: regionResultsById\[region\.region_id\]\?\.detection_result \?\? null/);
  assert.match(operatorPage, /operatorProbeSummary\(setupProbeDetection, language\)/);
  assert.doesNotMatch(operatorPage, /<SourceProvenanceBadge provenance=\{sourceProvenance\}/);
  assert.doesNotMatch(operatorPage, /warning=\{sourceWarning\}/);
  assert.doesNotMatch(operatorPage, /operatorSourceWarning/);
  assert.doesNotMatch(operatorPage, /SetupProbeStatus/);
  assert.doesNotMatch(operatorPage, /Probe Result/);
});

test("simulated operator startup displays the selected material before probing", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(mainSource, /startupFrameUrl=\{activeFrameUrl\}/);
  assert.match(operatorPage, /startupFrameUrl: string;/);
  assert.match(
    operatorPage,
    /cameraPreviewUrl \|\| \(simulatedMode \? startupFrameUrl : ""\)/
  );
});

test("imported simulated exports keep a visible source warning", () => {
  const importedSummary = sourceSlice(
    "function ImportedRunSummary({",
    "function ImportedRunCurveReview({"
  );
  const warningHelper = sourceSlice(
    "function sourceProvenanceWarning(",
    "function operatorStartButtonLabel("
  );

  assert.match(importedSummary, /const sourceWarning = sourceProvenanceWarning\(view\.provenance, language\);/);
  assert.match(importedSummary, /warning=\{sourceWarning\}/);
  assert.match(warningHelper, /provenance\.imported_from_provenance/);
  assert.match(warningHelper, /Offline\/simulated material is active/);
});

test("engineering setup probe button remains wired through CameraSetupStatusPanel", () => {
  const setupPanel = sourceSlice(
    "function CameraSetupStatusPanel({",
    "function PreviewPlaceholder({"
  );

  assert.match(mainSource, /onProbeRealCameraSetup=\{runRealCameraSetupProbe\}/);
  assert.match(setupPanel, /onProbe: \(\) => void;/);
  assert.match(setupPanel, /onClick=\{onProbe\}/);
  assert.match(setupPanel, /probing \? t\("Probing"\) : t\("Probe current frame"\)/);
});

test("engineering run button does not forward the React click event as a measurement override", () => {
  const runPage = sourceSlice(
    "function RunPage({",
    "function AnalysisPage({"
  );

  assert.doesNotMatch(
    runPage,
    /onClick=\{runMode\.kind === "real_camera_run" \? onStartRealCameraRun : onStartRun\}/
  );
  assert.match(runPage, /onClick=\{\(\) => \{/);
  assert.match(runPage, /runMode\.kind === "real_camera_run" \? onStartRealCameraRun\(\) : onStartRun\(\);/);
});
