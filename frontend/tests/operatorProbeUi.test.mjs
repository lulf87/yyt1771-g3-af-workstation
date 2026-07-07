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

test("operator current-frame probe dispatches real camera and offline dataset sources", () => {
  const dispatcher = sourceSlice(
    "async function runOperatorProbeCurrentFrame()",
    "async function startLiveOfflineRun("
  );

  assert.match(mainSource, /const OPERATOR_SOURCE_STORAGE_KEY = "yyt1771-g3-operator-source";/);
  assert.match(mainSource, /return stored === "offline_dataset" \|\| stored === "real_camera" \? stored : "real_camera";/);
  assert.match(dispatcher, /if \(operatorDataSource === "offline_dataset"\)/);
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
    /const probeCurrentFrameDisabled =\s+probing \|\| operatorRunActive \|\| !hasMeasurementRoi \|\| \(isRealCameraMode && !realHardwareAvailable\);/
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
  const buttonLabelHelper = sourceSlice(
    "function operatorStartButtonLabel(",
    "function operatorDatasetOptionLabel("
  );

  assert.match(mainSource, /const \[operatorSourceStatus, setOperatorSourceStatus\] = useState<OperatorSourceStatus \| null>\(null\);/);
  assert.match(mainSource, /getOperatorSourceStatus\(\)/);
  assert.match(mainSource, /operatorDataSource === "real_camera" && !operatorRealHardwareAvailable/);
  assert.match(operatorPage, /const realHardwareAvailable = operatorSourceStatus\?\.real_hardware_available === true;/);
  assert.match(operatorPage, /const canUseRealCamera = isRealCameraMode && realHardwareAvailable;/);
  assert.match(operatorPage, /const canUseOfflineDataset = isOfflineSource && Boolean\(selectedDatasetId\);/);
  assert.match(operatorPage, /isRealCameraMode && !realHardwareAvailable \? \(/);
  assert.match(operatorPage, /<RealHardwareUnavailableCard/);
  assert.match(operatorPage, /const startDisabled = operatorRunActive \|\| \(isRealCameraMode && !realHardwareAvailable\)/);
  assert.match(operatorPage, /title=\{isRealCameraMode && !realHardwareAvailable \? t\("Real hardware unavailable"\) : undefined\}/);
  assert.match(operatorPage, /\(isOfflineSource \|\| canUseRealCamera \? activeFrameUrl : ""\)/);
  assert.doesNotMatch(buttonLabelHelper, /camera_is_simulated/);
  assert.match(buttonLabelHelper, /if \(source === "offline_dataset"\)/);
});

test("operator current-frame probe result drives image overlay without engineering diagnostics card", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorSourceControls({"
  );

  assert.match(operatorPage, /const setupProbeDetection = canShowCurrentSourceData && !operatorRunActive && probe \? probe\.detection_result : null;/);
  assert.match(operatorPage, /\(canShowCurrentSourceData \? liveRun\?\.detectionResult : null\) \?\?\s+setupProbeDetection/s);
  assert.match(operatorPage, /probe\?\.image_data_url \?\? \(isOfflineSource \? activeFrameUrl : cameraPreviewUrl\)/);
  assert.match(operatorPage, /abPoints=\{latestDetection\?\.ab_points \?\? null\}/);
  assert.match(operatorPage, /debugArtifacts=\{latestDetection\?\.debug_artifacts \?\? null\}/);
  assert.match(operatorPage, /operatorProbeSummary\(setupProbeDetection, language\)/);
  assert.doesNotMatch(operatorPage, /<SourceProvenanceBadge provenance=\{sourceProvenance\}/);
  assert.doesNotMatch(operatorPage, /warning=\{sourceWarning\}/);
  assert.doesNotMatch(operatorPage, /operatorSourceWarning/);
  assert.doesNotMatch(operatorPage, /SetupProbeStatus/);
  assert.doesNotMatch(operatorPage, /Probe Result/);
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
