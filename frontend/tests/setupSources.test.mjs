import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-setup-sources-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadSetupSourcesModule() {
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
      "--types",
      "vite/client",
      "--outDir",
      outDir,
      "src/setupSources.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "setupSources.js")).href}?${Date.now()}`);
}

test("setup exposes offline dataset and real camera source options", async () => {
  const { SETUP_SOURCE_OPTIONS } = await loadSetupSourcesModule();

  assert.deepEqual(
    SETUP_SOURCE_OPTIONS.map((option) => [option.kind, option.label]),
    [
      ["offline_dataset", "Offline dataset"],
      ["real_camera", "Real camera"]
    ]
  );
});

test("real camera measurement is derived from preview shape without changing detector config", async () => {
  const { createRealCameraMeasurementFromShape } = await loadSetupSourcesModule();
  const previous = {
    measurement_id: "golden-a-default",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 1024,
      center_y: 682,
      width: 1200,
      height: 380,
      angle_deg: -1.5
    },
    detector_config: {
      tie_width_epsilon_px: 2,
      live_offline_fps: 8,
      target_temperature_celsius: 55
    }
  };

  const measurement = createRealCameraMeasurementFromShape(previous, [1364, 2048]);

  assert.equal(measurement.measurement_id, "real_camera-preview");
  assert.equal(measurement.object_class, "A_BALLOON_ENVELOPE");
  assert.equal(measurement.detector, "BalloonEnvelopeDetector");
  assert.equal(measurement.detector_mode, "default");
  assert.equal(measurement.source, "real_camera");
  assert.equal(measurement.width_mode, "max_width");
  assert.equal(measurement.measurement_coordinates, "source_pixel");
  assert.deepEqual(measurement.detector_config, previous.detector_config);
  assert.equal(measurement.roi.center_x, 1024);
  assert.equal(measurement.roi.center_y, 682);
  assert.equal(measurement.roi.width, 1269.76);
  assert.equal(measurement.roi.height, 381.92);
  assert.equal(measurement.roi.angle_deg, -1.5);
});

test("real camera frame refresh preserves all configured measurement positions", async () => {
  const { createRealCameraMeasurementFromShape } = await loadSetupSourcesModule();
  const firstRoi = {
    type: "rotated_rect",
    center_x: 480,
    center_y: 320,
    width: 300,
    height: 100,
    angle_deg: 0
  };
  const secondRoi = { ...firstRoi, center_x: 980, angle_deg: 4 };
  const previous = {
    measurement_id: "real_camera-preview",
    source: "real_camera",
    object_class: "C_BUNDLE_ENVELOPE",
    detector: "BundleEnvelopeDetector",
    detector_mode: "contrast_widest_span",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: firstRoi,
    regions: [
      { region_id: "region_1", index: 1, label: "位置 1", enabled: true, roi: firstRoi, color: "#ef4444" },
      { region_id: "region_2", index: 2, label: "位置 2", enabled: true, roi: secondRoi, color: "#3b82f6" }
    ],
    detector_config: { contrast_threshold: 55 }
  };

  const next = createRealCameraMeasurementFromShape(previous, [1364, 2048]);

  assert.equal(next.regions.length, 2);
  assert.deepEqual(next.regions.map((region) => region.region_id), ["region_1", "region_2"]);
  assert.deepEqual(next.regions.map((region) => region.color), ["#ef4444", "#3b82f6"]);
  assert.deepEqual(next.regions[1].roi, secondRoi);
  assert.deepEqual(next.roi, next.regions[0].roi);
});

test("real camera frame status labels do not expose preview semantics", async () => {
  const { previewRefreshStatusLabel } = await loadSetupSourcesModule();

  assert.equal(previewRefreshStatusLabel("refreshing"), "Updating live frame");
  assert.equal(previewRefreshStatusLabel("ok"), "Live frame updated");
  assert.equal(previewRefreshStatusLabel("unavailable"), "Camera unavailable");
  assert.equal(previewRefreshStatusLabel("idle"), "No live frame yet");
});

test("run page mode is derived from setup source without a run preview action", async () => {
  const { runModeForSetupSource } = await loadSetupSourcesModule();

  assert.deepEqual(runModeForSetupSource("offline_dataset"), {
    kind: "live_offline_run",
    startLabel: "Start full offline run",
    pendingLabel: "Running",
    allowsPreviewAction: false
  });
  assert.deepEqual(runModeForSetupSource("real_camera"), {
    kind: "real_camera_run",
    startLabel: "Start real camera run",
    pendingLabel: "Running",
    allowsPreviewAction: false
  });
});

test("run setup summary is derived from the saved setup measurement definition", async () => {
  const { buildRunSetupSummary } = await loadSetupSourcesModule();
  const measurement = {
    measurement_id: "setup-real-camera",
    source: "real_camera",
    object_class: "C_BUNDLE_ENVELOPE",
    detector: "BundleEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 957.46,
      center_y: 726.36,
      width: 1269.76,
      height: 381.92,
      angle_deg: -2.5
    },
    detector_config: {
      max_frames_per_run: 77,
      live_offline_fps: 4,
      target_temperature_celsius: 42.5,
      temperature_power_percent: 55
    }
  };

  assert.deepEqual(buildRunSetupSummary("real_camera", "golden_a_20260522_dev_lab", measurement), {
    sourceLabel: "Real camera",
    sourceId: "real_camera",
    roiCenter: "957.46, 726.36",
    roiSize: "1269.76 × 381.92",
    roiAngle: "-2.50°",
    objectClass: "C_BUNDLE_ENVELOPE",
    detector: "BundleEnvelopeDetector",
    widthMode: "max_width",
    maxFramesPerRun: "No frame limit",
    targetFps: "4",
    targetTemperatureCelsius: "42.50 °C",
    temperaturePowerPercent: "55 %"
  });
});

test("run result display must match the current setup source", async () => {
  const { runResultMatchesSetupSource } = await loadSetupSourcesModule();

  assert.equal(
    runResultMatchesSetupSource("real_camera", "golden_a_20260522_dev_lab", "real_camera"),
    true
  );
  assert.equal(
    runResultMatchesSetupSource("real_camera", "golden_a_20260522_dev_lab", "golden_a_20260522_dev_lab"),
    false
  );
  assert.equal(
    runResultMatchesSetupSource("offline_dataset", "golden_a_20260522_dev_lab", "golden_a_20260522_dev_lab"),
    true
  );
  assert.equal(
    runResultMatchesSetupSource("offline_dataset", "golden_a_20260522_dev_lab", "real_camera"),
    false
  );
});

test("real camera setup preview controls live polling and frozen frames", async () => {
  const {
    freezePreview,
    shouldRefreshRealCameraFrameAfterRoiCommit,
    setupPreviewPollingIntervalMs,
    shouldPollRealCameraPreview,
    shouldReleaseRealCameraPreview,
    updateRealCameraPreviewState
  } = await loadSetupSourcesModule();
  const roi = {
    type: "rotated_rect",
    center_x: 50,
    center_y: 40,
    width: 30,
    height: 20,
    angle_deg: 2
  };
  const firstFrame = {
    timestamp_ms: 1000,
    shape: [80, 120],
    camera_status: "ok"
  };

  const liveState = updateRealCameraPreviewState(null, firstFrame, roi, "live");

  assert.equal(liveState.mode, "live");
  assert.equal(liveState.frozenTimestampMs, null);
  assert.equal(liveState.roiNeedsReconfirm, false);
  assert.equal(shouldPollRealCameraPreview("setup", "real_camera", liveState), true);
  assert.equal(shouldReleaseRealCameraPreview("setup", "real_camera", "run", "real_camera"), true);
  assert.equal(shouldReleaseRealCameraPreview("setup", "real_camera", "setup", "offline_dataset"), true);
  assert.equal(shouldReleaseRealCameraPreview("setup", "real_camera", "setup", "real_camera"), false);
  assert.equal(shouldReleaseRealCameraPreview("run", "real_camera", "setup", "real_camera"), false);
  assert.equal(shouldRefreshRealCameraFrameAfterRoiCommit("setup", "real_camera", liveState), true);
  assert.equal(
    shouldPollRealCameraPreview("setup", "real_camera", {
      ...liveState,
      cameraStatus: "unavailable"
    }),
    true
  );
  assert.equal(setupPreviewPollingIntervalMs("ok", 0), 200);
  assert.equal(setupPreviewPollingIntervalMs("ok", 10), 100);
  assert.equal(setupPreviewPollingIntervalMs("unavailable", 10), 2000);

  const frozenState = freezePreview(liveState);

  assert.equal(frozenState.mode, "frozen");
  assert.equal(frozenState.frozenTimestampMs, 1000);
  assert.equal(shouldPollRealCameraPreview("setup", "real_camera", frozenState), false);
  assert.equal(shouldRefreshRealCameraFrameAfterRoiCommit("setup", "real_camera", frozenState), false);

  const refreshedFrozenState = updateRealCameraPreviewState(
    frozenState,
    {
      timestamp_ms: 1200,
      shape: [80, 120],
      camera_status: "ok"
    },
    roi,
    "frozen"
  );

  assert.equal(refreshedFrozenState.mode, "frozen");
  assert.equal(refreshedFrozenState.frozenTimestampMs, 1200);
  assert.equal(refreshedFrozenState.roiNeedsReconfirm, false);
  assert.deepEqual(refreshedFrozenState.roi, roi);

  const shapeChangedState = updateRealCameraPreviewState(
    refreshedFrozenState,
    {
      timestamp_ms: 1400,
      shape: [100, 140],
      camera_status: "ok"
    },
    roi,
    "live"
  );

  assert.equal(shapeChangedState.mode, "live");
  assert.equal(shapeChangedState.roiNeedsReconfirm, true);
  assert.equal(shapeChangedState.shapeChangeMessage, "Frame shape changed from 80 x 120 to 100 x 140; confirm ROI before formal run.");
});

test("real camera setup refreshes live frames only for preview-affecting changes", async () => {
  const {
    freezePreview,
    frozenFrameSetupChangeMessage,
    isRealCameraPreviewAffectingDetectorConfigKey,
    shouldRefreshRealCameraFrameAfterSetupChange,
    updateRealCameraPreviewState
  } = await loadSetupSourcesModule();
  const roi = {
    type: "rotated_rect",
    center_x: 50,
    center_y: 40,
    width: 30,
    height: 20,
    angle_deg: 2
  };
  const liveState = updateRealCameraPreviewState(
    null,
    {
      timestamp_ms: 1000,
      shape: [80, 120],
      camera_status: "ok"
    },
    roi,
    "live"
  );

  for (const change of [
    { kind: "roi" },
    { kind: "object_class" },
    { kind: "detector" },
    { kind: "width_mode" },
    { kind: "detector_config", key: "min_component_area_px" },
    { kind: "detector_config", key: "envelope_window_px" },
    { kind: "detector_config", key: "envelope_step_px" },
    { kind: "detector_config", key: "mask_open_kernel_px" },
    { kind: "detector_config", key: "mask_close_kernel_px" },
    { kind: "detector_config", key: "mask_dilate_kernel_px" },
    { kind: "detector_config", key: "contrast_threshold" }
  ]) {
    assert.equal(shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, change), true);
  }

  assert.equal(isRealCameraPreviewAffectingDetectorConfigKey("min_component_area_px"), true);
  assert.equal(isRealCameraPreviewAffectingDetectorConfigKey("contrast_threshold"), true);
  assert.equal(isRealCameraPreviewAffectingDetectorConfigKey("distance_outlier_max_jump_px"), false);
  assert.equal(isRealCameraPreviewAffectingDetectorConfigKey("target_temperature_celsius"), false);
  assert.equal(isRealCameraPreviewAffectingDetectorConfigKey("temperature_power_percent"), false);

  for (const change of [
    { kind: "detector_config", key: "target_temperature_celsius" },
    { kind: "detector_config", key: "temperature_power_percent" },
    { kind: "temperature_action" },
    { kind: "analysis_parameters" }
  ]) {
    assert.equal(shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, change), false);
  }

  const frozenState = freezePreview(liveState);

  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", frozenState, {
      kind: "detector_config",
      key: "min_component_area_px"
    }),
    false
  );
  assert.equal(
    frozenFrameSetupChangeMessage("setup", "real_camera", frozenState),
    "Frozen frame: ROI and detector parameters update on the frozen image. Use Capture new setup frame or Resume live to view the latest camera frame."
  );
  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "offline_dataset", liveState, { kind: "roi" }),
    false
  );
});

test("setup temperature summary exposes controller status without being preview-affecting", async () => {
  const {
    buildSetupTemperatureSummary,
    selectSetupTemperatureSerialPort,
    shouldRefreshRealCameraFrameAfterSetupChange,
    updateRealCameraPreviewState
  } = await loadSetupSourcesModule();
  const measurement = {
    measurement_id: "setup-real-camera",
    source: "real_camera",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 957.46,
      center_y: 726.36,
      width: 1269.76,
      height: 381.92,
      angle_deg: 0
    },
    detector_config: {
      target_temperature_celsius: 42.5,
      temperature_power_percent: 55,
      temperature_serial_port: "/dev/cu.usbserial-1210"
    }
  };
  const status = {
    temperature_status: "ok",
    reading: {
      timestamp_ms: 1779448000123,
      celsius: 23.4,
      source: "lu92xx_modbus_rtu",
      error: ""
    }
  };
  const ports = [
    {
      device: "/dev/cu.usbserial-1210",
      name: "usbserial-1210",
      description: "LU92XX USB serial",
      hwid: "USB VID:PID"
    }
  ];

  assert.deepEqual(buildSetupTemperatureSummary(measurement, status, ports, null), {
    status: "ok",
    currentTemperature: "23.40 °C",
    source: "lu92xx_modbus_rtu",
    timestamp: "1779448000123",
    targetTemperatureCelsius: "42.50 °C",
    temperaturePowerPercent: "55 %",
    selectedPort: "/dev/cu.usbserial-1210",
    ports: "/dev/cu.usbserial-1210",
    portCount: "1",
    error: "None"
  });

  const selected = selectSetupTemperatureSerialPort(measurement, "/dev/ttys000");

  assert.equal(selected.detector_config.temperature_serial_port, "/dev/ttys000");
  assert.equal(selected.detector_config.target_temperature_celsius, 42.5);
  assert.equal(selected.detector_config.temperature_power_percent, 55);

  assert.deepEqual(
    buildSetupTemperatureSummary(measurement, null, [], {
      temperature_status: "unavailable",
      message: "/dev/cu.usbserial-1210 not found"
    }),
    {
      status: "unavailable",
      currentTemperature: "None",
      source: "None",
      timestamp: "None",
      targetTemperatureCelsius: "42.50 °C",
      temperaturePowerPercent: "55 %",
      selectedPort: "/dev/cu.usbserial-1210",
      ports: "None",
      portCount: "0",
      error: "/dev/cu.usbserial-1210 not found"
    }
  );

  const liveState = updateRealCameraPreviewState(
    null,
    {
      timestamp_ms: 1000,
      shape: [80, 120],
      camera_status: "ok"
    },
    measurement.roi,
    "live"
  );

  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, {
      kind: "temperature_action"
    }),
    false
  );
  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, {
      kind: "detector_config",
      key: "target_temperature_celsius"
    }),
    false
  );
  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, {
      kind: "detector_config",
      key: "temperature_power_percent"
    }),
    false
  );
  assert.equal(
    shouldRefreshRealCameraFrameAfterSetupChange("setup", "real_camera", liveState, {
      kind: "detector_config",
      key: "temperature_serial_port"
    }),
    false
  );
});

test("real camera setup live polling uses fast default interval, slow unavailable retry, and run fps profile", async () => {
  const {
    buildRealCameraRunCameraProfile,
    createRealCameraMeasurementFromShape,
    normalizeSetupPreviewFps,
    setupPreviewFpsLabel,
    setupPreviewIntervalMs,
    setupPreviewPollingIntervalMs
  } = await loadSetupSourcesModule();

  const measurement = createRealCameraMeasurementFromShape(null, [1364, 2048]);

  assert.equal(measurement.detector_config.contrast_threshold, 55);
  assert.equal(measurement.detector_config.distance_outlier_max_jump_px, 100);
  assert.equal(measurement.detector_config.setup_preview_fps, 0);
  assert.equal(normalizeSetupPreviewFps(null), 0);
  assert.equal(normalizeSetupPreviewFps(0), 0);
  assert.equal(normalizeSetupPreviewFps(2.5), 2.5);
  assert.equal(normalizeSetupPreviewFps(9), 9);
  assert.equal(normalizeSetupPreviewFps(120), 120);
  assert.equal(setupPreviewIntervalMs(0), 0);
  assert.equal(setupPreviewIntervalMs(1), 1000);
  assert.equal(setupPreviewIntervalMs(2.5), 400);
  assert.equal(setupPreviewIntervalMs(30), 33);
  assert.equal(setupPreviewFpsLabel(0), "Auto (5 fps default)");
  assert.equal(setupPreviewFpsLabel(2.5), "2.5 fps live display");
  assert.equal(setupPreviewPollingIntervalMs("ok", measurement.detector_config.setup_preview_fps), 200);
  assert.equal(setupPreviewPollingIntervalMs("unavailable", measurement.detector_config.setup_preview_fps), 2000);
  assert.deepEqual(buildRealCameraRunCameraProfile(measurement), {
    pixel_format: "mono8",
    target_frame_rate_hz: 8
  });
  assert.deepEqual(
    buildRealCameraRunCameraProfile({
      ...measurement,
      detector_config: { ...measurement.detector_config, live_offline_fps: 12 }
    }),
    {
      pixel_format: "mono8",
      target_frame_rate_hz: 12
    }
  );
});
