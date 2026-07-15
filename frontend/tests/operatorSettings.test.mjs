import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-operator-settings-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadOperatorSettingsModule() {
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
      "--types",
      "vite/client",
      "--outDir",
      outDir,
      "src/operatorSettings.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "operatorSettings.js")).href}?${Date.now()}`);
}

function measurement(overrides = {}) {
  return {
    measurement_id: "real-camera-preview",
    source: "real_camera",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 1024,
      center_y: 682,
      width: 1269.76,
      height: 381.92,
      angle_deg: 0
    },
    detector_config: {
      target_temperature_celsius: null,
      temperature_power_percent: 100,
      temperature_serial_port: ""
    },
    ...overrides
  };
}

test("operator settings start dirty and only confirmed values are applied to measurement", async () => {
  const {
    applyConfirmedSettingsToMeasurement,
    confirmOperatorSettings,
    createOperatorSettingsDraft,
    patchOperatorSettingsDraft
  } = await loadOperatorSettingsModule();
  const base = measurement();
  const draft = createOperatorSettingsDraft(base);

  assert.equal(draft.dirty, true);
  assert.equal(draft.confirmedAt, null);

  const edited = patchOperatorSettingsDraft(draft, {
    targetTemperatureC: 42.5,
    temperaturePowerPercent: 55,
    serialPort: "/dev/cu.usbserial-11210"
  });
  assert.equal(edited.dirty, true);
  assert.equal(base.detector_config.target_temperature_celsius, null);
  assert.equal(base.detector_config.temperature_power_percent, 100);

  const confirmed = confirmOperatorSettings(edited, "2026-07-07T12:00:00.000Z");
  const nextMeasurement = applyConfirmedSettingsToMeasurement(base, confirmed);

  assert.equal(confirmed.dirty, false);
  assert.equal(confirmed.confirmedAt, "2026-07-07T12:00:00.000Z");
  assert.equal(nextMeasurement.detector_config.target_temperature_celsius, 42.5);
  assert.equal(nextMeasurement.detector_config.temperature_power_percent, 55);
  assert.equal(nextMeasurement.detector_config.temperature_serial_port, "/dev/cu.usbserial-11210");
});

test("operator start validation blocks unconfirmed or dirty settings before camera run", async () => {
  const {
    confirmOperatorSettings,
    createOperatorSettingsDraft,
    patchOperatorSettingsDraft,
    validateOperatorStart
  } = await loadOperatorSettingsModule();
  const base = measurement();
  const draft = createOperatorSettingsDraft(base);

  assert.deepEqual(validateOperatorStart({
    cameraOk: true,
    measurement: base,
    settings: draft,
    serialPortRequired: false
  }), {
    ok: false,
    message: "Test settings are not confirmed. Confirm this test setup first."
  });

  const confirmed = confirmOperatorSettings(draft, "2026-07-07T12:00:00.000Z");
  assert.deepEqual(validateOperatorStart({
    cameraOk: true,
    measurement: base,
    settings: confirmed,
    serialPortRequired: false
  }), {
    ok: true,
    message: ""
  });

  const dirtyAgain = patchOperatorSettingsDraft(confirmed, { temperaturePowerPercent: 75 });
  assert.deepEqual(validateOperatorStart({
    cameraOk: true,
    measurement: base,
    settings: dirtyAgain,
    serialPortRequired: false
  }), {
    ok: false,
    message: "Test settings changed after confirmation. Confirm this test setup first."
  });
});

test("operator confirmed settings summary distinguishes empty target temperature", async () => {
  const { confirmOperatorSettings, createOperatorSettingsDraft, operatorSettingsSummary } = await loadOperatorSettingsModule();
  const confirmed = confirmOperatorSettings(createOperatorSettingsDraft(measurement()), "2026-07-07T12:00:00.000Z");

  assert.equal(
    operatorSettingsSummary(confirmed, "en"),
    "Confirmed: no target temperature, power 100%"
  );
  assert.equal(
    operatorSettingsSummary(confirmed, "zh"),
    "已确认：不设置目标温度，功率 100%"
  );
});
