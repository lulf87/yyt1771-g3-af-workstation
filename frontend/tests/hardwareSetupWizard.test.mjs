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
    /<ExposureControl[\s\S]{0,420}onBusyChange=\{setExposureBusy\}[\s\S]{0,200}runActive=\{false\}/
  );
});

test("device setup exposure busy gates camera and wizard hardware operations", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(wizard, /const \[exposureBusy, setExposureBusy\] = useState\(false\);/);
  assert.match(wizard, /const wizardBusy =[\s\S]{0,300}exposureBusy/);
  assert.match(wizard, /function selectHardwareCamera\(cameraKey: string\)[\s\S]{0,180}if \(wizardBusy\) return;/);
  assert.match(wizard, /async function runCameraTest\(\)[\s\S]{0,160}if \(wizardBusy\) return;/);
  assert.match(wizard, /disabled=\{wizardBusy \|\| !camera\.is_supported_model\}/);
  assert.match(wizard, /disabled=\{wizardBusy \|\| !selectedCamera\}/);
  assert.match(wizard, /disabled=\{wizardBusy\}[\s\S]{0,100}onClick=\{scanHardwareCameras\}/);
  assert.match(wizard, /disabled=\{wizardBusy \|\| activeStep === 0\}/);
  assert.match(wizard, /disabled=\{wizardBusy \|\| activeStep >= HARDWARE_SETUP_STEPS\.length - 1/);
  assert.match(wizard, /aria-label=\{t\("Cancel"\)\}[\s\S]{0,160}disabled=\{wizardBusy\}/);
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

test("camera test requests use an identity generation guard invalidated by selection and refresh lifecycle", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );

  assert.match(mainSource, /createHardwareCameraTestCoordinator/);
  assert.match(wizard, /cameraTestCoordinatorRef\.current\.run\(/);
  assert.match(
    wizard,
    /function selectHardwareCamera\(cameraKey: string\)[\s\S]{0,220}cameraTestCoordinatorRef\.current\.invalidate\(\)/
  );
  assert.match(
    wizard,
    /async function scanHardwareCameras\(\)[\s\S]{0,220}cameraTestCoordinatorRef\.current\.invalidate\(\)/
  );
  assert.match(
    wizard,
    /useEffect\(\(\) => \{[\s\S]{0,180}cameraTestCoordinatorRef\.current\.invalidate\(\)[\s\S]{0,220}if \(!open\) return;/
  );
});

test("camera refresh gates testing and invalidates requests again before applying a refreshed selection", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );
  const refresh = sourceSlice(
    "async function refreshWizardData()",
    "async function refreshEnvironmentChecks()"
  );
  const scan = sourceSlice(
    "async function scanHardwareCameras()",
    "async function refreshTemperaturePorts()"
  );
  const runCameraTest = sourceSlice(
    "async function runCameraTest()",
    "async function runTemperatureTest()"
  );

  assert.ok(
    (refresh.match(/cameraTestCoordinatorRef\.current\.invalidate\(\)/g) ?? []).length >= 2,
    "full refresh must invalidate camera tests at start and settlement"
  );
  assert.ok(
    (scan.match(/cameraTestCoordinatorRef\.current\.invalidate\(\)/g) ?? []).length >= 2,
    "camera scan must invalidate camera tests at start and settlement"
  );
  assert.match(runCameraTest, /if \(loadingWizardRef\.current\) return;/);
  assert.match(
    wizard,
    /const \[loadingWizard, setLoadingWizard\] = useState\(true\)/
  );
  assert.match(
    wizard,
    /useEffect\(\(\) => \{[\s\S]{0,180}setWizardLoading\(true\);[\s\S]{0,120}if \(!open\) return;/
  );
  assert.match(
    wizard,
    /function selectHardwareCamera\(cameraKey: string\)[\s\S]{0,160}if \(loadingWizardRef\.current\) return;/
  );
  assert.match(wizard, /selectedCameraKeyRef/);
  assert.match(
    runCameraTest,
    /isHardwareCameraTestResultCurrent\(result, selectedCameraKeyRef\.current\)/
  );
  assert.match(
    wizard,
    /disabled=\{wizardBusy \|\| !camera\.is_supported_model\}/
  );
  assert.match(
    wizard,
    /disabled=\{wizardBusy \|\| !selectedCamera\}/
  );
  assert.match(
    wizard,
    /disabled=\{wizardBusy \|\| activeStep >= HARDWARE_SETUP_STEPS\.length - 1 \|\| !canAdvance\}/
  );
});

test("device setup full refresh only applies the latest still-open lifecycle", () => {
  const wizard = sourceSlice(
    "function DeviceSetupWizard({",
    "function HardwareCheckList("
  );
  const refresh = sourceSlice(
    "async function refreshWizardData()",
    "async function refreshEnvironmentChecks()"
  );

  assert.match(mainSource, /createHardwareSetupRefreshCoordinator/);
  assert.match(wizard, /const wizardOpenRef = useRef\(open\)/);
  assert.match(wizard, /wizardOpenRef\.current = open;/);
  assert.match(
    wizard,
    /useEffect\(\(\) => \{[\s\S]{0,220}hardwareSetupRefreshCoordinatorRef\.current\.invalidate\(\)[\s\S]{0,220}if \(!open\) return;/
  );
  assert.match(
    refresh,
    /hardwareSetupRefreshCoordinatorRef\.current\.run\(/
  );
  const awaitResult = refresh.indexOf("await hardwareSetupRefreshCoordinatorRef.current.run(");
  const acceptanceGuard = refresh.indexOf(
    "if (!refreshResult.accepted || !wizardOpenRef.current) return;"
  );
  const settlementApply = refresh.indexOf(
    "cameraTestCoordinatorRef.current.invalidate()",
    awaitResult
  );
  const unlock = refresh.indexOf("setWizardLoading(false)", awaitResult);

  assert.ok(awaitResult >= 0, "full refresh must run through its own coordinator");
  assert.ok(
    acceptanceGuard > awaitResult,
    "the latest/open guard must run after the request settles"
  );
  assert.ok(
    settlementApply > acceptanceGuard,
    "stale refreshes must not clear or replace camera state"
  );
  assert.ok(
    unlock > acceptanceGuard,
    "stale refreshes must not clear the loading gate"
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
  assert.match(component, /scheduleExposureDraft\(/);
  assert.match(component, /onBlur=\{commitDraft\}/);
  assert.match(component, /event\.key === "Enter"[\s\S]{0,120}commitDraft\(\)/);
  assert.match(component, /submitExposureDraft\(/);
  assert.match(component, /const compensationPendingRef = useRef\(false\)/);
  assert.match(
    component,
    /compensationPending:\s*compensationPendingRef\.current/
  );
  assert.match(component, /result\.kind === "compensating"/);
  assert.match(component, /result\.kind === "compensation_pending"/);
  assert.match(component, /result\.kind === "cancelled"/);
  assert.match(exposureLogicSource, /if \(!draft\.trim\(\)\)/);
  assert.match(exposureLogicSource, /Number\.isFinite\(/);
  assert.match(component, /capability\.minimum_us/);
  assert.match(component, /capability\.maximum_us/);
  assert.match(component, /confirmedRef\.current/);
  assert.match(component, /onSuccess:[\s\S]{0,400}setDraft\(String\(actual/);
  assert.match(component, /onError:[\s\S]{0,300}confirmedRef\.current/);
  assert.match(component, /coordinator\.dispose\(\)/);
  assert.match(component, /let acceptResult = true;/);
  assert.match(component, /acceptResult = false;/);
  assert.doesNotMatch(component, /controller\.abort\(\)/);
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
  assert.match(wizard, /disabled=\{wizardBusy \|\| !binding \|\| testResult\?\.overall_status !== "passed"\}/);
});
