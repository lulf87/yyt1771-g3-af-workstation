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
  assert.match(card, /Device binding incomplete guidance/);
  assert.match(card, /Open device setup/);
  assert.match(card, /onClick=\{onOpenDeviceSetup\}/);
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
