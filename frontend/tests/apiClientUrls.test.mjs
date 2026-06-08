import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-api-client-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadApiClientModule() {
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
      "src/api/client.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "client.js")).href}?${Date.now()}`);
}

test("run frame image URL targets run raw frame endpoint", async () => {
  const { buildRunFrameImageUrl } = await loadApiClientModule();

  const url = buildRunFrameImageUrl("http://127.0.0.1:8031", "run-real_camera-abc", 160, {
    maxWidth: 720
  });

  assert.equal(
    url,
    "http://127.0.0.1:8031/api/runs/run-real_camera-abc/frames/160.png?max_width=720"
  );
});

test("diagnostic image metadata exposes mask and contour display sources", async () => {
  const { readDiagnosticImages } = await loadApiClientModule();

  const images = readDiagnosticImages({
    diagnostic_images: {
      mask: {
        label: "Detected mask",
        coordinates: "roi_local_pixel",
        overlay_box: {
          source: "selected_candidate_local_projection_bounds",
          coordinates: "roi_local_pixel",
          left: 12,
          top: 5,
          right: 62,
          bottom: 27,
          stroke: "#ff4040",
          stroke_width_px: 2
        },
        data_url: "data:image/png;base64,mask"
      },
      contour: {
        label: "Envelope contour",
        coordinates: "roi_local_pixel",
        url: "/api/debug/contour.png"
      }
    }
  });

  assert.equal(images.mask.label, "Detected mask");
  assert.equal(images.mask.src, "data:image/png;base64,mask");
  assert.equal(images.mask.overlayBox.source, "selected_candidate_local_projection_bounds");
  assert.equal(images.mask.overlayBox.left, 12);
  assert.equal(images.mask.overlayBox.strokeWidthPx, 2);
  assert.equal(images.contour.label, "Envelope contour");
  assert.match(images.contour.src, /\/api\/debug\/contour\.png$/);
  assert.equal(images.contour.overlayBox, null);
});

test("real camera setup probe posts measurement definition and optional frozen frame", async () => {
  const { probeRealCameraSetupFrame } = await loadApiClientModule();
  const measurement = {
    measurement_id: "real-camera-setup-probe",
    source: "real_camera",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 60,
      center_y: 35,
      width: 70,
      height: 40,
      angle_deg: 0
    },
    detector_config: {
      min_component_area_px: 20
    }
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        dataset_id: "real_camera",
        frame: {
          frame_index: 1,
          shape: [80, 120],
          dtype: "uint8",
          timestamp_ms: 1779448000123
        },
        measurement_definition: measurement,
        detection_result: {
          frame_index: 1,
          detection_status: "INVALID",
          ab_points: null,
          distance_px: null,
          raw_best_candidate: null,
          selected_candidate: null,
          rejected_candidates: [],
          quality: {
            confidence: 0,
            edge_strength: null,
            contour_area: null,
            roi_coverage: null,
            jump_from_previous_px: null
          },
          rejected_reason: "fixture invalid",
          debug_artifacts: {
            contour_measurement_mode: "archived_mesh_envelope_rows"
          },
          temperature_sync_status: "TEMP_SYNC_MISSING",
          frame_timestamp_ms: 1779448000123,
          temperature_timestamp_ms: null,
          temperature_celsius: null,
          temperature_delta_ms: null,
          temperature_source: "",
          temperature_sampled_this_frame: false
        },
        overlay: {
          roi: measurement.roi,
          ab_points: null,
          status: "INVALID"
        },
        camera_status: "ok",
        camera_meta: { model: "fixture" },
        image_data_url: "data:image/png;base64,abc"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const response = await probeRealCameraSetupFrame(measurement, {
      framePngDataUrl: "data:image/png;base64,frozen",
      frameTimestampMs: 1779448000123,
      cameraMeta: { model: "fixture" }
    });

    assert.equal(response.dataset_id, "real_camera");
    assert.equal(response.detection_result.detection_status, "INVALID");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/camera\/setup-probe$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.measurement_definition.source, undefined);
    assert.equal(body.measurement_definition.measurement_id, measurement.measurement_id);
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.deepEqual(body.measurement_definition.detector_config, measurement.detector_config);
    assert.equal(body.frame_png_data_url, "data:image/png;base64,frozen");
    assert.equal(body.frame_timestamp_ms, 1779448000123);
    assert.deepEqual(body.camera_meta, { model: "fixture" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offline probe strips setup source before posting backend measurement definition", async () => {
  const { probeFrame } = await loadApiClientModule();
  const measurement = {
    measurement_id: "offline-probe",
    source: "offline_dataset",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: 1113.98,
      center_y: 520.9,
      width: 1269.76,
      height: 381.92,
      angle_deg: -14.93
    },
    detector_config: {
      min_component_area_px: 20
    }
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        dataset_id: "golden_a_20260522_dev_lab",
        frame: {
          frame_index: 1,
          shape: [1364, 2048],
          dtype: "uint8"
        },
        measurement_definition: { ...measurement, source: undefined },
        detection_result: {
          frame_index: 1,
          detection_status: "VALID",
          ab_points: null,
          distance_px: 987,
          raw_best_candidate: null,
          selected_candidate: null,
          rejected_candidates: [],
          quality: {
            confidence: 1,
            edge_strength: null,
            contour_area: null,
            roi_coverage: null,
            jump_from_previous_px: null
          },
          rejected_reason: "",
          debug_artifacts: {},
          temperature_sync_status: "TEMP_SYNC_INTERPOLATED",
          frame_timestamp_ms: null,
          temperature_timestamp_ms: null,
          temperature_celsius: 1.2,
          temperature_delta_ms: null,
          temperature_source: "offline",
          temperature_sampled_this_frame: false
        },
        overlay: {
          roi: measurement.roi,
          ab_points: null,
          status: "VALID"
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await probeFrame("golden_a_20260522_dev_lab", 1, measurement);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/probe$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.dataset_id, "golden_a_20260522_dev_lab");
    assert.equal(body.frame_index, 1);
    assert.equal(body.measurement_definition.source, undefined);
    assert.equal(body.measurement_definition.measurement_id, "offline-probe");
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.deepEqual(body.measurement_definition.detector_config, measurement.detector_config);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera run posts the saved setup measurement definition without overriding ROI", async () => {
  const { createRealCameraRun } = await loadApiClientModule();
  const measurement = {
    measurement_id: "setup-real-camera-run",
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
      temperature_power_percent: 55,
      min_component_area_px: 123
    }
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        run_manifest: {
          run_id: "run-real_camera-fixture",
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
          analysis_id: "analysis-fixture",
          run_id: "run-real_camera-fixture",
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
      maxFrames: 77,
      targetFps: 4,
      cameraProfile: { pixel_format: "mono8" }
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/real-camera-runs$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.measurement_definition.source, undefined);
    assert.equal(body.measurement_definition.measurement_id, measurement.measurement_id);
    assert.equal(body.measurement_definition.detector, measurement.detector);
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.deepEqual(body.measurement_definition.detector_config, measurement.detector_config);
    assert.equal(body.max_frames, 77);
    assert.equal(body.target_fps, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
