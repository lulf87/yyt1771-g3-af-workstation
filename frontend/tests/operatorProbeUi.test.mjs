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
    "async function startLiveOfflineRun()"
  );

  assert.match(handler, /await probeRealCameraSetupFrame\(currentMeasurement\);/);
  assert.match(handler, /applyRealCameraProbeResponse\(response, "live"\);/);
  assert.match(handler, /setProbe\(response\);/);
  assert.doesNotMatch(handler, /framePngDataUrl/);
  assert.doesNotMatch(handler, /requireSetupFrameDataUrl/);
});

test("operator run page receives probe state and wires the current-frame probe button", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorTemperaturePanel({"
  );

  assert.match(mainSource, /onOperatorProbeCurrentFrame=\{runOperatorRealCameraSetupProbe\}/);
  assert.match(mainSource, /probe=\{displayedProbe\}/);
  assert.match(mainSource, /probing=\{probing\}/);
  assert.match(mainSource, /onProbeRealCameraSetup=\{onOperatorProbeCurrentFrame\}/);
  assert.match(operatorPage, /probe: ProbeResponse \| null;/);
  assert.match(operatorPage, /probing: boolean;/);
  assert.match(operatorPage, /onProbeRealCameraSetup: \(\) => void;/);
  assert.match(operatorPage, /const probeCurrentFrameDisabled = probing \|\| runningCamera/);
  assert.match(operatorPage, /disabled=\{probeCurrentFrameDisabled\}/);
  assert.match(operatorPage, /onClick=\{onProbeRealCameraSetup\}/);
  assert.match(operatorPage, /probing \? t\("Probing"\) : t\("Probe current frame"\)/);
  assert.match(operatorPage, /Single-frame probing is disabled during a live test/);
});

test("operator current-frame probe result drives image overlay without engineering diagnostics card", () => {
  const operatorPage = sourceSlice(
    "function OperatorRunPage({",
    "function OperatorTemperaturePanel({"
  );

  assert.match(operatorPage, /const setupProbeDetection = !runningCamera && probe\?\.dataset_id === "real_camera" \? probe\.detection_result : null;/);
  assert.match(operatorPage, /liveRun\?\.detectionResult \?\?\s+setupProbeDetection/s);
  assert.match(operatorPage, /const setupProbeFrameUrl = setupProbeDetection \? cameraPreviewUrl : "";/);
  assert.match(operatorPage, /abPoints=\{latestDetection\?\.ab_points \?\? null\}/);
  assert.match(operatorPage, /debugArtifacts=\{latestDetection\?\.debug_artifacts \?\? null\}/);
  assert.match(operatorPage, /operatorProbeSummary\(setupProbeDetection, language\)/);
  assert.doesNotMatch(operatorPage, /SetupProbeStatus/);
  assert.doesNotMatch(operatorPage, /Probe Result/);
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
