import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setupOutDir = resolve(rootDir, ".tmp-real-camera-setup-run-test-build");
const apiOutDir = resolve(rootDir, ".tmp-real-camera-api-test-build");

after(() => {
  rmSync(setupOutDir, { recursive: true, force: true });
  rmSync(apiOutDir, { recursive: true, force: true });
});

async function loadSetupSourcesModule() {
  rmSync(setupOutDir, { recursive: true, force: true });
  mkdirSync(setupOutDir, { recursive: true });
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
      setupOutDir,
      "src/setupSources.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(setupOutDir, "setupSources.js")).href}?${Date.now()}`);
}

async function loadApiClientModule() {
  rmSync(apiOutDir, { recursive: true, force: true });
  mkdirSync(apiOutDir, { recursive: true });
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
      apiOutDir,
      "src/api/client.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(apiOutDir, "client.js")).href}?${Date.now()}`);
}

function setupMeasurement(overrides = {}) {
  return {
    measurement_id: "real_camera-preview",
    source: "real_camera",
    object_class: "WHOLE_ENVELOPE",
    detector: "ContrastWidestSpanDetector",
    detector_mode: "contrast_widest_span",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 960,
      center_y: 700,
      width: 900,
      height: 300,
      angle_deg: -4.5
    },
    detector_config: {
      min_component_area_px: 95,
      envelope_window_px: 9,
      envelope_step_px: 2,
      mask_open_kernel_px: 3,
      mask_close_kernel_px: 11,
      mask_dilate_kernel_px: 1,
      max_frames_per_run: 160,
      live_offline_fps: 8,
      target_temperature_celsius: 42.5,
      temperature_power_percent: 55
    },
    ...overrides
  };
}

test("real camera setup derives source-pixel ROI from real frame shape and keeps it through display resizing", async () => {
  const {
    createRealCameraMeasurementFromShape,
    preserveRoiAcrossDisplayResize
  } = await loadSetupSourcesModule();

  const measurement = createRealCameraMeasurementFromShape(null, [1364, 2048]);
  const roiBefore = measurement.roi;
  const roiAfter = preserveRoiAcrossDisplayResize(roiBefore, {
    sourceShape: [1364, 2048],
    fromDisplaySize: { width: 554, height: 518 },
    toDisplaySize: { width: 960, height: 640 }
  });

  assert.equal(measurement.source, "real_camera");
  assert.equal(measurement.measurement_coordinates, "source_pixel");
  assert.deepEqual(roiBefore, {
    type: "rotated_rect",
    center_x: 1024,
    center_y: 682,
    width: 1269.76,
    height: 8,
    angle_deg: 0
  });
  assert.deepEqual(roiAfter, roiBefore);
});

test("real camera setup event plan distinguishes frozen ROI edits, live ROI apply, temperature, detector, and probe refreshes", async () => {
  const {
    planRealCameraSetupFrameUpdate,
    updateRealCameraPreviewState,
    freezePreview
  } = await loadSetupSourcesModule();
  const roi = setupMeasurement().roi;
  const liveState = updateRealCameraPreviewState(
    null,
    { timestamp_ms: 1780854696122, shape: [1364, 2048], camera_status: "ok" },
    roi,
    "live"
  );
  const frozenState = freezePreview(liveState);

  assert.deepEqual(
    planRealCameraSetupFrameUpdate({
      page: "setup",
      source: "real_camera",
      state: frozenState,
      event: { kind: "roi_apply" }
    }),
    {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "frozen_frame"
    }
  );
  assert.deepEqual(
    planRealCameraSetupFrameUpdate({
      page: "setup",
      source: "real_camera",
      state: liveState,
      event: { kind: "roi_apply" }
    }),
    {
      refreshFrame: true,
      refreshProbe: false,
      keepCurrentFrame: false,
      reason: "live_roi_apply"
    }
  );
  assert.deepEqual(
    planRealCameraSetupFrameUpdate({
      page: "setup",
      source: "real_camera",
      state: liveState,
      event: { kind: "temperature_config", key: "target_temperature_celsius" }
    }),
    {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "temperature_does_not_affect_preview"
    }
  );
  assert.deepEqual(
    planRealCameraSetupFrameUpdate({
      page: "setup",
      source: "real_camera",
      state: liveState,
      event: { kind: "detector_config", key: "min_component_area_px" }
    }),
    {
      refreshFrame: true,
      refreshProbe: true,
      keepCurrentFrame: false,
      reason: "detector_preview_affecting_change"
    }
  );
  assert.deepEqual(
    planRealCameraSetupFrameUpdate({
      page: "setup",
      source: "real_camera",
      state: frozenState,
      event: { kind: "detector_config", key: "min_component_area_px" }
    }),
    {
      refreshFrame: false,
      refreshProbe: true,
      keepCurrentFrame: true,
      reason: "frozen_detector_overlay_update"
    }
  );
});

test("real camera run request and frame URL are locked to the saved setup measurement and run artifact endpoint", async () => {
  const { buildRunFrameImageUrl, createRealCameraRun, isRunFrameImageUrl } = await loadApiClientModule();
  const measurement = setupMeasurement();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        run_manifest: {
          run_id: "run-real_camera-regression",
          dataset_id: "real_camera",
          measurement_definition: measurement,
          frame_records: [],
          temperature_records: [],
          detection_results: [],
          export_artifacts: [],
          created_at: "2026-06-08T00:00:00Z",
          config_snapshot: {},
          software: {}
        },
        analysis_result: {
          analysis_id: "analysis-real-camera-regression",
          run_id: "run-real_camera-regression",
          all_frames: [],
          distance_time: [],
          temperature_time: [],
          temperature_distance: [],
          afas_preprocessing: {},
          afas_analysis: {},
          export_artifacts: [],
          created_at: "2026-06-08T00:00:00Z"
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await createRealCameraRun(measurement, {
      maxFrames: 160,
      targetFps: 8,
      cameraProfile: { pixel_format: "mono8" }
    });
    const requestBody = JSON.parse(calls[0].init.body);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/real-camera-runs$/);
    assert.equal(requestBody.measurement_definition.source, undefined);
    assert.equal(requestBody.measurement_definition.measurement_id, measurement.measurement_id);
    assert.equal(requestBody.measurement_definition.detector, measurement.detector);
    assert.deepEqual(requestBody.measurement_definition.roi, measurement.roi);
    assert.deepEqual(requestBody.measurement_definition.detector_config, measurement.detector_config);
    assert.equal(requestBody.measurement_definition.roi.center_x, 960);
    assert.equal(requestBody.measurement_definition.detector_config.target_temperature_celsius, 42.5);
    assert.equal(requestBody.measurement_definition.detector_config.temperature_power_percent, 55);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const frameUrl = buildRunFrameImageUrl("http://127.0.0.1:8032", "run-real_camera-regression", 160, {
    maxWidth: 1024
  });

  assert.equal(
    frameUrl,
    "http://127.0.0.1:8032/api/runs/run-real_camera-regression/frames/160.png?max_width=1024"
  );
  assert.equal(isRunFrameImageUrl(frameUrl, "run-real_camera-regression", 160), true);
  assert.equal(
    isRunFrameImageUrl(
      "http://127.0.0.1:8032/api/offline-datasets/golden_a_20260522_dev_lab/frames/160.png",
      "run-real_camera-regression",
      160
    ),
    false
  );
});
