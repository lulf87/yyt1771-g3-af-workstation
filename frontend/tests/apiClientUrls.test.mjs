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

test("empty frame image path stays empty", async () => {
  const { apiUrlFromPath } = await loadApiClientModule();

  assert.equal(apiUrlFromPath("", { maxWidth: 720 }), "");
});

test("diagnostic image metadata exposes mask and contour display sources", async () => {
  const { readDiagnosticImages } = await loadApiClientModule();

  const images = readDiagnosticImages({
    diagnostic_images: {
      detected_mask: {
        label: "Detected mask",
        coordinates: "roi_local_full_res",
        data_url: "data:image/png;base64,mask"
      },
      envelope_contour: {
        label: "Envelope contour",
        coordinates: "roi_local_full_res",
        url: "/api/debug/contour.png"
      }
    }
  });

  assert.equal(images.mask.label, "Detected mask");
  assert.equal(images.mask.src, "data:image/png;base64,mask");
  assert.equal(images.mask.coordinates, "roi_local_full_res");
  assert.equal(images.contour.label, "Envelope contour");
  assert.match(images.contour.src, /\/api\/debug\/contour\.png$/);
  assert.equal(images.length, 2);
});

test("export bundle download parses Content-Disposition and triggers a blob download", async () => {
  const { downloadRunExportBundle, parseContentDispositionFilename } = await loadApiClientModule();
  assert.equal(
    parseContentDispositionFilename("attachment; filename=\"yyt1771-g3-export-run-1.zip\""),
    "yyt1771-g3-export-run-1.zip"
  );
  assert.equal(
    parseContentDispositionFilename("attachment; filename*=UTF-8''yyt1771-g3-export-run-2.zip"),
    "yyt1771-g3-export-run-2.zip"
  );

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(new Blob(["zip-bytes"], { type: "application/zip" }), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=\"bundle.zip\""
      }
    });
  };
  const clicks = [];
  const removed = [];
  const appended = [];
  const fakeDocument = {
    body: {
      appendChild(node) {
        appended.push(node);
      }
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return {
        href: "",
        download: "",
        click() {
          clicks.push(this.download);
        },
        remove() {
          removed.push(this.download);
        }
      };
    }
  };
  const objectUrls = [];
  const revoked = [];
  const fakeUrl = {
    createObjectURL(blob) {
      objectUrls.push(blob);
      return "blob:export";
    },
    revokeObjectURL(url) {
      revoked.push(url);
    }
  };

  try {
    const result = await downloadRunExportBundle("run-1", {
      document: fakeDocument,
      url: fakeUrl
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/runs\/run-1\/exports\/download$/);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(result.filename, "bundle.zip");
    assert.equal(result.size, 9);
    assert.equal(appended.length, 1);
    assert.deepEqual(clicks, ["bundle.zip"]);
    assert.deepEqual(removed, ["bundle.zip"]);
    assert.deepEqual(revoked, ["blob:export"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("export bundle can be fetched as a blob without triggering a browser download", async () => {
  const { fetchRunExportBundle } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(new Blob(["zip-bytes"], { type: "application/zip" }), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=\"picked-folder.zip\""
      }
    });
  };

  try {
    const result = await fetchRunExportBundle("run-picker");

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/runs\/run-picker\/exports\/download$/);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(result.filename, "picked-folder.zip");
    assert.equal(result.size, 9);
    assert.equal(result.blob.size, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("export bundle download surfaces structured backend errors", async () => {
  const { downloadRunExportBundle } = await loadApiClientModule();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ detail: { message: "文件生成失败，请查看后端日志", stage: "zip_bundle" } }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );

  try {
    await assert.rejects(
      () => downloadRunExportBundle("run-bad", {
        document: { body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; } },
        url: { createObjectURL() { return "blob:bad"; }, revokeObjectURL() {} }
      }),
      /文件生成失败，请查看后端日志/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("run export import uploads a selected export file to the import endpoint", async () => {
  const { importRunExportFile } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  const file = new File(["{}"], "run_export.json", { type: "application/json" });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.equal(init.method, "POST");
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("file"), file);
    return new Response(
      JSON.stringify({
        filename: "run_export.json",
        warnings: [],
        run_manifest: null,
        analysis_result: {
          run_id: "run-imported",
          temperature_distance: [],
          afas_preprocessing: {},
          afas_analysis: {}
        },
        measurement_definition: null,
        frame_summary: {
          total_frames: 0,
          valid_frames: 0,
          temperature_distance_points: 0,
          invalid_reason_counts: {}
        },
        temperature_distance_image_data_url: null
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const view = await importRunExportFile(file);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/imports\/run-export$/);
    assert.equal(view.filename, "run_export.json");
    assert.equal(view.analysis_result.run_id, "run-imported");
    assert.equal(view.analysis_result.regions.length, 1);
    assert.equal(view.analysis_result.regions[0].region_id, "region_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy frame events and analyses normalize to position one", async () => {
  const { normalizeAnalysisRegions, regionResultsFromEvent } = await loadApiClientModule();
  const detection = {
    frame_index: 12,
    detection_status: "INVALID",
    distance_px: null,
    temperature_sync_status: "TEMP_SYNC_MISSING"
  };
  const curvePoints = {
    distance_time: null,
    temperature_time: null,
    temperature_distance: null
  };
  const livePointStatus = {
    temperature_distance_present: false,
    temperature_distance_point_count: 0,
    reason_if_missing: "invalid_detection",
    detection_status: "INVALID",
    curve_point_status: "INVALID_DETECTION",
    temperature_sync_status: "TEMP_SYNC_MISSING",
    distance_outlier_filtered: false
  };

  const regionResults = regionResultsFromEvent({
    detection_result: detection,
    curve_points: curvePoints,
    live_point_status: livePointStatus
  });
  assert.equal(regionResults.length, 1);
  assert.equal(regionResults[0].region_id, "region_1");
  assert.equal(regionResults[0].color, "#ef4444");
  assert.equal(regionResults[0].detection_result.region_id, "region_1");
  assert.equal(regionResults[0].curve_points, curvePoints);

  const legacyAnalysis = {
    analysis_id: "analysis-legacy",
    run_id: "run-legacy",
    all_frames: [detection],
    distance_time: [],
    raw_distance_time: [],
    stabilized_distance_time: [],
    temperature_time: [],
    temperature_distance: [],
    raw_temperature_distance: [],
    stabilized_temperature_distance: [],
    afas_preprocessing: { temperature_distance_point_count: 0 },
    afas_analysis: { result_status: "unavailable" },
    export_artifacts: [],
    created_at: "2026-07-11T00:00:00Z"
  };
  const normalized = normalizeAnalysisRegions(legacyAnalysis);
  assert.equal(normalized.regions.length, 1);
  assert.equal(normalized.regions[0].region_id, "region_1");
  assert.equal(normalized.regions[0].region_label, "位置 1");
  assert.equal(normalized.regions[0].afas_analysis.result_status, "unavailable");
});

test("operator source status uses the dedicated endpoint", async () => {
  const { getOperatorSourceStatus } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        real_hardware_available: false,
        real_camera_available: false,
        real_temperature_available: false,
        camera_is_simulated: true,
        temperature_is_simulated: true,
        camera_label: "G3 simulated dataset camera",
        camera_serial: "SIM-DATASET-golden_a_20260522_dev_lab",
        camera_backend: "simulated",
        temperature_backend: "simulated_temperature",
        offline_datasets_available: true,
        errors: [],
        warnings: []
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const status = await getOperatorSourceStatus();

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/operator\/source-status$/);
    assert.equal(status.real_hardware_available, false);
    assert.equal(status.camera_is_simulated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hardware setup APIs use dedicated environment, camera, test, and save endpoints", async () => {
  const {
    getHardwareSetupEnvironment,
    listHardwareCameras,
    testHardwareCamera,
    testHardwareTemperature,
    testHardwareBinding,
    saveHardwareBinding
  } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(String(url)).pathname;
    if (path === "/api/hardware/setup/environment") {
      return new Response(
        JSON.stringify({
          overall_status: "failed",
          checks: [{ id: "hik_mvs_sdk_import", status: "failed", message: "missing", suggestion: "", details: {} }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path === "/api/hardware/cameras") {
      return new Response(
        JSON.stringify([
          {
            backend: "hik_gige_mvs",
            transport: "gige_vision",
            model: "MV-CA060-11GM",
            serial_number: "00J67378626",
            ip: "192.168.3.211",
            user_defined_name: "Line 1",
            is_supported_model: true,
            is_selected: false
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path === "/api/hardware/binding/test") {
      return new Response(
        JSON.stringify({
          overall_status: "passed",
          camera: { status: "passed", message: "ok", suggestion: "", details: {} },
          temperature: { status: "passed", message: "ok", suggestion: "", details: {} }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path === "/api/hardware/cameras/test") {
      return new Response(
        JSON.stringify({
          status: "passed",
          error: "",
          preview_image_data_url: "data:image/png;base64,abc",
          shape: [6, 8],
          camera_meta: { serial_number: "00J67378626" },
          details: {}
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path === "/api/hardware/temperature/test") {
      return new Response(
        JSON.stringify({
          status: "passed",
          error: "",
          temperature_celsius: 31.2,
          serial_port: "/dev/cu.usbserial-11210",
          details: {}
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path === "/api/hardware/binding") {
      return new Response(
        JSON.stringify({
          saved: true,
          config_path: "/tmp/realcamera_temp.local.yaml",
          real_hardware_available: false,
          source_status: { real_hardware_available: false }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`unexpected path ${path}`);
  };
  const binding = {
    camera: {
      backend: "hik_gige_mvs",
      transport: "gige_vision",
      model: "MV-CA060-11GM",
      serial_number: "00J67378626",
      ip: "192.168.3.211",
      user_defined_name: "Line 1"
    },
    temperature: {
      backend: "lu92xx_modbus_rtu",
      serial_port: "/dev/cu.usbserial-11210"
    }
  };

  try {
    const environment = await getHardwareSetupEnvironment();
    const cameras = await listHardwareCameras();
    const cameraResult = await testHardwareCamera(binding.camera);
    const temperatureResult = await testHardwareTemperature({
      serial_port: "/dev/cu.usbserial-11210",
      baudrate: 19200,
      slave_address: 1
    });
    const testResult = await testHardwareBinding(binding);
    const saveResult = await saveHardwareBinding(binding);

    assert.equal(environment.overall_status, "failed");
    assert.equal(cameras[0].serial_number, "00J67378626");
    assert.equal(cameraResult.preview_image_data_url, "data:image/png;base64,abc");
    assert.equal(temperatureResult.temperature_celsius, 31.2);
    assert.equal(testResult.overall_status, "passed");
    assert.equal(saveResult.saved, true);
    assert.equal(saveResult.real_hardware_available, false);
    assert.equal(calls.length, 6);
    assert.match(calls[0].url, /\/api\/hardware\/setup\/environment$/);
    assert.match(calls[1].url, /\/api\/hardware\/cameras$/);
    assert.match(calls[2].url, /\/api\/hardware\/cameras\/test$/);
    assert.equal(calls[2].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[2].init.body), binding.camera);
    assert.match(calls[3].url, /\/api\/hardware\/temperature\/test$/);
    assert.equal(calls[3].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[3].init.body), {
      serial_port: "/dev/cu.usbserial-11210",
      baudrate: 19200,
      slave_address: 1
    });
    assert.match(calls[4].url, /\/api\/hardware\/binding\/test$/);
    assert.equal(calls[4].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[4].init.body), binding);
    assert.match(calls[5].url, /\/api\/hardware\/binding$/);
    assert.equal(calls[5].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[5].init.body), binding);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera setup probe posts measurement definition and optional frozen frame", async () => {
  const { probeRealCameraSetupFrame } = await loadApiClientModule();
  const measurement = {
    measurement_id: "real-camera-setup-probe",
    source: "real_camera",
    object_class: "A_BALLOON_ENVELOPE",
    detector: "BalloonEnvelopeDetector",
    detector_mode: "default",
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
    assert.equal(body.measurement_definition.detector_mode, "default");
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.equal(body.measurement_definition.regions.length, 1);
    assert.equal(body.measurement_definition.regions[0].region_id, "region_1");
    assert.deepEqual(body.measurement_definition.regions[0].roi, measurement.roi);
    assert.deepEqual(body.measurement_definition.detector_config, measurement.detector_config);
    assert.equal(body.frame_png_data_url, "data:image/png;base64,frozen");
    assert.equal(body.frame_timestamp_ms, 1779448000123);
    assert.deepEqual(body.camera_meta, { model: "fixture" });
    assert.equal(response.region_results.length, 1);
    assert.equal(response.region_results[0].region_id, "region_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera setup probe omits cached frame fields by default", async () => {
  const { probeRealCameraSetupFrame } = await loadApiClientModule();
  const measurement = {
    measurement_id: "real-camera-setup-probe-fresh",
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
          timestamp_ms: 1779448000456
        },
        measurement_definition: measurement,
        detection_result: {
          frame_index: 1,
          detection_status: "VALID",
          ab_points: { a: { x: 1, y: 2 }, b: { x: 10, y: 2 } },
          distance_px: 9,
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
          temperature_sync_status: "TEMP_SYNC_MISSING",
          frame_timestamp_ms: 1779448000456,
          temperature_timestamp_ms: null,
          temperature_celsius: null,
          temperature_delta_ms: null,
          temperature_source: "",
          temperature_sampled_this_frame: false
        },
        overlay: {
          roi: measurement.roi,
          ab_points: { a: { x: 1, y: 2 }, b: { x: 10, y: 2 } },
          status: "VALID"
        },
        camera_status: "ok",
        camera_meta: { model: "fixture" },
        image_data_url: "data:image/png;base64,fresh"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const response = await probeRealCameraSetupFrame(measurement);

    assert.equal(response.dataset_id, "real_camera");
    assert.equal(response.image_data_url, "data:image/png;base64,fresh");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/camera\/setup-probe$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.measurement_definition.measurement_id, measurement.measurement_id);
    assert.equal("frame_png_data_url" in body, false);
    assert.equal("frame_timestamp_ms" in body, false);
    assert.equal("camera_meta" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operator real camera setup probe posts strict source guard flags", async () => {
  const { probeRealCameraSetupFrame } = await loadApiClientModule();
  const measurement = {
    measurement_id: "operator-real-camera-setup-probe",
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
        frame: { frame_index: 1, shape: [80, 120], dtype: "uint8", timestamp_ms: 1 },
        measurement_definition: measurement,
        detection_result: {
          frame_index: 1,
          detection_status: "INVALID",
          ab_points: null,
          distance_px: null,
          raw_best_candidate: null,
          selected_candidate: null,
          rejected_candidates: [],
          quality: { confidence: 0, edge_strength: null, contour_area: null, roi_coverage: null, jump_from_previous_px: null },
          rejected_reason: "fixture invalid",
          debug_artifacts: {},
          temperature_sync_status: "TEMP_SYNC_MISSING",
          frame_timestamp_ms: 1,
          temperature_timestamp_ms: null,
          temperature_celsius: null,
          temperature_delta_ms: null,
          temperature_source: "",
          temperature_sampled_this_frame: false
        },
        overlay: { roi: measurement.roi, ab_points: null, status: "INVALID" },
        image_data_url: "data:image/png;base64,abc"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await probeRealCameraSetupFrame(measurement, {
      operatorMode: true,
      operatorDataSource: "real_camera"
    });

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.operator_mode, true);
    assert.equal(body.operator_data_source, "real_camera");
    assert.equal(body.frame_png_data_url, undefined);
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
    detector_mode: "contrast_widest_span",
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
      temperature_serial_port: "/dev/ttys000",
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
    assert.equal(body.measurement_definition.detector_mode, "contrast_widest_span");
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.deepEqual(body.measurement_definition.detector_config, measurement.detector_config);
    assert.equal(body.max_frames, 77);
    assert.equal(body.target_fps, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operator real camera stream posts strict source guard flags", async () => {
  const { streamRealCameraRun } = await loadApiClientModule();
  const measurement = {
    measurement_id: "operator-real-camera-stream",
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
      live_offline_fps: 4,
      target_temperature_celsius: 42.5,
      temperature_power_percent: 55
    }
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        event: "complete",
        run_manifest: {
          run_id: "run-real_camera-operator-stream",
          dataset_id: "real_camera",
          operator_data_source: "real_camera",
          measurement_definition: measurement,
          frame_records: [],
          temperature_records: [],
          detection_results: [],
          export_artifacts: [],
          created_at: "2026-07-07T00:00:00Z",
          config_snapshot: {},
          software: {}
        },
        analysis_result: {
          analysis_id: "analysis-operator-stream",
          run_id: "run-real_camera-operator-stream",
          all_frames: [],
          distance_time: [],
          raw_distance_time: [],
          stabilized_distance_time: [],
          temperature_time: [],
          temperature_distance: [],
          raw_temperature_distance: [],
          stabilized_temperature_distance: [],
          afas_preprocessing: {},
          afas_analysis: {},
          export_artifacts: [],
          created_at: "2026-07-07T00:00:00Z"
        }
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    );
  };

  try {
    await streamRealCameraRun(
      measurement,
      {
        targetFps: 4,
        cameraProfile: { pixel_format: "mono8" },
        operatorMode: true,
        operatorDataSource: "real_camera"
      },
      () => {}
    );

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.operator_mode, true);
    assert.equal(body.operator_data_source, "real_camera");
    assert.equal(body.max_frames, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera stream omits max_frames by default for unbounded hardware measurement", async () => {
  const { streamRealCameraRun } = await loadApiClientModule();
  const measurement = {
    measurement_id: "setup-real-camera-stream",
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
      temperature_serial_port: "/dev/ttys000",
      min_component_area_px: 123
    }
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      [
        JSON.stringify({
          event: "complete",
          run_manifest: {
            run_id: "run-real_camera-stream",
            dataset_id: "real_camera",
            measurement_definition: measurement,
            frame_records: [],
            temperature_records: [],
            detection_results: [],
            export_artifacts: [],
            created_at: "2026-07-06T00:00:00Z",
            config_snapshot: { max_frames: null },
            software: {}
          },
          analysis_result: {
            analysis_id: "analysis-stream",
            run_id: "run-real_camera-stream",
            all_frames: [],
            distance_time: [],
            raw_distance_time: [],
            stabilized_distance_time: [],
            temperature_time: [],
            temperature_distance: [],
            raw_temperature_distance: [],
            stabilized_temperature_distance: [],
            afas_preprocessing: {},
            afas_analysis: {},
            export_artifacts: [],
            created_at: "2026-07-06T00:00:00Z"
          }
        })
      ].join("\n"),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    );
  };

  try {
    const events = [];
    await streamRealCameraRun(
      measurement,
      {
        targetFps: 4,
        cameraProfile: { pixel_format: "mono8" }
      },
      (event) => events.push(event)
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/real-camera-runs\/stream$/);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.max_frames, undefined);
    assert.equal(body.target_fps, 4);
    assert.equal(body.measurement_definition.source, undefined);
    assert.deepEqual(body.measurement_definition.roi, measurement.roi);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "complete");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera stop posts the active stream run id", async () => {
  const { stopRealCameraRun } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        run_id: "run-real_camera-stop-fixture",
        stop_requested: true,
        already_complete: false
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const response = await stopRealCameraRun("run-real_camera-stop-fixture");

    assert.deepEqual(response, {
      run_id: "run-real_camera-stop-fixture",
      stop_requested: true,
      already_complete: false
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/real-camera-runs\/run-real_camera-stop-fixture\/stop$/);
    assert.equal(calls[0].init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("temperature status request can target the selected serial port", async () => {
  const { getTemperatureStatus } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        temperature_status: "ok",
        reading: {
          timestamp_ms: 1779448000123,
          celsius: 24.2,
          source: "lu92xx_modbus_rtu",
          error: ""
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await getTemperatureStatus({ port: "/dev/ttys000" });

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/temperature\/status\?port=%2Fdev%2Fttys000$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("real camera preview release uses the setup preview release endpoint", async () => {
  const { releaseRealCameraPreview } = await loadApiClientModule();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ camera_status: "released" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const payload = await releaseRealCameraPreview();

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/camera\/preview\/release$/);
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(payload, { camera_status: "released" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
