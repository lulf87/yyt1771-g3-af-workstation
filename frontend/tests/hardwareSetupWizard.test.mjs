import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
const exposureControlPath = resolve(rootDir, "src/components/camera/ExposureControl.tsx");
const exposureLogicSource = readFileSync(resolve(rootDir, "src/exposureControl.ts"), "utf8");

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

test("top bar exposes a device setup entry and renders the wizard modal", () => {
  assert.match(mainSource, /const \[deviceSetupOpen, setDeviceSetupOpen\] = useState\(false\);/);
  assert.match(mainSource, /title=\{t\("Device setup"\)\}/);
  assert.match(mainSource, /setDeviceSetupOpen\(true\)/);
  assert.match(mainSource, /<DeviceSetupWizard/);
  assert.match(mainSource, /onSaved=\{handleDeviceSetupSaved\}/);
});

test("hardware unavailable card prompts operators to open device setup", () => {
  const card = sourceSlice(
    "function RealHardwareUnavailableCard({",
    "function OperatorTemperaturePanel({"
  );

  assert.match(card, /onOpenDeviceSetup\?: \(\) => void;/);
  assert.match(card, /onRecheck\?: \(\) => void;/);
  assert.match(card, /Device binding incomplete guidance/);
  assert.match(card, /Real camera is unavailable\. Check the device connection or open device setup\./);
  assert.match(card, /Last checked/);
  assert.match(card, /Rechecking/);
  assert.match(card, /Open device setup/);
  assert.match(card, /onClick=\{onRecheck\}/);
  assert.match(card, /onClick=\{onOpenDeviceSetup\}/);
  assert.doesNotMatch(card, /loading \? t\("Checking real hardware"\)/);
});

test("device setup wizard has five production setup steps and uses hardware APIs", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  for (const label of [
    "Environment check",
    "Scan camera",
    "Select temperature controller",
    "Test binding",
    "Save configuration"
  ]) {
    assert.match(wizard, new RegExp(label));
  }
  assert.match(wizard, /getHardwareSetupEnvironment\(\)/);
  assert.match(wizard, /listHardwareCameras\(\)/);
  assert.match(wizard, /listTemperatureSerialPorts\(\)/);
  assert.match(wizard, /testHardwareBinding\(binding\)/);
  assert.match(wizard, /saveHardwareBinding\(binding\)/);
});

test("device setup wizard supports separate camera and temperature tests", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(wizard, /testHardwareCamera\(selectedCamera\)/);
  assert.match(wizard, /testHardwareTemperature\(/);
  assert.match(wizard, /Test camera/);
  assert.match(wizard, /Test temperature/);

  const cameraResult = sourceSlice(
    "function HardwareCameraTestResult(",
    "function HardwareTemperatureTestResult("
  );
  const temperatureResult = sourceSlice(
    "function HardwareTemperatureTestResult(",
    "function HardwareBindingSummary("
  );
  assert.match(cameraResult, /result\.preview_image_data_url/);
  assert.match(temperatureResult, /result\.temperature_celsius/);
});

test("device setup mounts the shared exposure control after a successful camera test", () => {
  assert.ok(existsSync(exposureControlPath), "shared ExposureControl component must exist");
  const component = readFileSync(exposureControlPath, "utf8");
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.equal(
    component.match(/export function ExposureControl/g)?.length,
    1,
    "ExposureControl must have one shared definition"
  );
  assert.match(mainSource, /import \{ ExposureControl \} from "\.\/components\/camera\/ExposureControl";/);
  assert.match(
    wizard,
    /cameraTestResult\?\.status === "passed"[\s\S]{0,500}<ExposureControl[\s\S]{0,300}camera=\{selectedCamera\}/
  );
  assert.match(
    wizard,
    /<ExposureControl[\s\S]{0,350}disabled=\{testingCamera \|\| testingBinding \|\| savingBinding\}[\s\S]{0,200}runActive=\{false\}/
  );
});

test("selecting another camera synchronously clears the previous camera test before exposure can mount", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(
    wizard,
    /function selectHardwareCamera\(cameraKey: string\)[\s\S]{0,300}setCameraTestResult\(null\)[\s\S]{0,300}setSelectedCameraKey\(cameraKey\)/,
    "camera selection must invalidate the previous camera result in the same event"
  );
  assert.match(
    wizard,
    /onChange=\{\(\) => selectHardwareCamera\(hardwareCameraKey\(camera\)\)\}/
  );
  assert.doesNotMatch(
    wizard,
    /onChange=\{\(\) => setSelectedCameraKey\(hardwareCameraKey\(camera\)\)\}/
  );
});

test("shared exposure control validates camera bounds and restores the last confirmed value", () => {
  assert.ok(existsSync(exposureControlPath), "shared ExposureControl component must exist");
  const component = readFileSync(exposureControlPath, "utf8");

  assert.match(component, /createExposureCommitCoordinator/);
  assert.match(component, /delayMs:\s*200/);
  assert.match(component, /type="range"/);
  assert.match(component, /min=\{capability\.minimum_us \?\? undefined\}/);
  assert.match(component, /max=\{capability\.maximum_us \?\? undefined\}/);
  assert.match(component, /step=\{capability\.increment_us \?\? "any"\}/);
  assert.match(component, /coordinatorRef\.current\?\.schedule\(/);
  assert.match(component, /onBlur=\{commitDraft\}/);
  assert.match(component, /event\.key === "Enter"[\s\S]{0,120}commitDraft\(\)/);
  assert.match(component, /submitExposureDraft\(/);
  assert.match(exposureLogicSource, /if \(!draft\.trim\(\)\)/);
  assert.match(exposureLogicSource, /Number\.isFinite\(/);
  assert.match(component, /capability\.minimum_us/);
  assert.match(component, /capability\.maximum_us/);
  assert.match(component, /confirmedRef\.current/);
  assert.match(component, /onSuccess:[\s\S]{0,400}setDraft\(String\(actual/);
  assert.match(component, /onError:[\s\S]{0,300}confirmedRef\.current/);
  assert.match(component, /coordinator\.dispose\(\)/);
  assert.match(component, /controller\.abort\(\)/);
  assert.doesNotMatch(
    component,
    /\[[^\]]*confirmed[^\]]*\]/,
    "confirmed exposure changes must not recreate the coordinator"
  );
});

test("device setup wizard refresh buttons only scan the active hardware scope", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(wizard, /async function refreshEnvironmentChecks\(\)/);
  assert.match(wizard, /async function scanHardwareCameras\(\)/);
  assert.match(wizard, /async function refreshTemperaturePorts\(\)/);
  assert.match(wizard, /onClick=\{refreshEnvironmentChecks\}/);
  assert.match(wizard, /onClick=\{scanHardwareCameras\}/);
  assert.match(wizard, /onClick=\{refreshTemperaturePorts\}/);
  assert.doesNotMatch(wizard, /Refresh checks[\s\S]{0,220}onClick=\{refreshWizardData\}/);
  assert.doesNotMatch(wizard, /Scan camera[\s\S]{0,220}onClick=\{refreshWizardData\}/);
  assert.doesNotMatch(wizard, /Refresh ports[\s\S]{0,220}onClick=\{refreshWizardData\}/);
});

test("device setup environment checks render SDK path details for field repair", () => {
  const checks = sourceSlice(
    "function HardwareCheckList({",
    "function HardwareCameraTestResult("
  );

  assert.match(checks, /HardwareCheckDetails/);
  assert.match(checks, /current_sdk_python_paths/);
  assert.match(checks, /current_mvs_dynamic_library_path/);
  assert.match(checks, /suggested_sdk_python_paths/);
  assert.match(checks, /suggested_mvs_dynamic_library_paths/);
  assert.match(checks, /windows_runtime_library_dir/);
  assert.match(checks, /fix_instructions/);
});

test("device setup environment step can auto-fill, validate, and save MVS SDK paths", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(wizard, /MVS Python binding path/);
  assert.match(wizard, /MVS x64 runtime DLL path/);
  assert.match(wizard, /applyDetectedSdkPaths/);
  assert.match(wizard, /saveHardwareSdkPaths\(/);
  assert.match(wizard, /Validate and save paths/);
  assert.match(wizard, /setEnvironment\(result\.environment\)/);
});

test("device setup wizard does not silently select the first camera when multiple cameras are present", () => {
  const helper = sourceSlice(
    "function selectDefaultHardwareCamera(",
    "function RealHardwareUnavailableCard({"
  );

  assert.match(helper, /supported\.length === 1/);
  assert.doesNotMatch(helper, /supported\[0\] \?\? cameras\[0\]/);
  assert.match(helper, /return null;/);
});

test("device setup save refreshes hardware profile and source status and warns when unavailable", () => {
  assert.match(mainSource, /async function handleDeviceSetupSaved\(\)/);
  assert.match(mainSource, /await refreshHardwareProfile\(\)/);
  assert.match(mainSource, /await refreshOperatorSourceStatus\(\{ reason: "saved" \}\)/);

  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );
  assert.match(wizard, /Configuration saved but hardware unavailable/);
  assert.match(wizard, /saveResult\.real_hardware_available === false/);
});

test("device setup Finish saves before closing and stays open when save fails", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(wizard, /async function saveBinding\(\): Promise<boolean>/);
  assert.match(wizard, /const freshTestResult = await testHardwareBinding\(binding\);/);
  assert.match(wizard, /if \(freshTestResult\.overall_status !== "passed"\)/);
  assert.match(wizard, /async function finishWizard\(\)/);
  assert.match(wizard, /const saved = saveResult\?\.saved === true \|\| await saveBinding\(\);/);
  assert.match(wizard, /if \(saved\) onClose\(\);/);
  assert.match(wizard, /onClick=\{\(\) => void finishWizard\(\)\}/);
  assert.match(wizard, /disabled=\{!binding \|\| testResult\?\.overall_status !== "passed" \|\| savingBinding\}/);
});
