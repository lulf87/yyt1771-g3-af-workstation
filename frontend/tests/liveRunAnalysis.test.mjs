import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-live-analysis-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadLiveRunAnalysisModule() {
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
      "src/liveRunAnalysis.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "liveRunAnalysis.js")).href}?${Date.now()}`);
}

async function loadCurveModule() {
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
      "--outDir",
      outDir,
      "src/curves.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "curves.js")).href}?${Date.now()}`);
}

function curvePoint(index, temperature = 20 + index * 0.1, distance = 500 + index) {
  return {
    x: temperature,
    y: distance,
    frame_index: index,
    sync_status: "TEMP_SYNC_OK"
  };
}

function sampleAnalysis(pointCount = 0) {
  const points = Array.from({ length: pointCount }, (_, index) => curvePoint(index + 1));
  return {
    analysis_id: "run-live-preview",
    run_id: "run-live",
    all_frames: points.map((point) => sampleDetection(point.frame_index, point.y, point.x)),
    distance_time: [],
    raw_distance_time: [],
    stabilized_distance_time: [],
    temperature_time: [],
    temperature_distance: points,
    raw_temperature_distance: [],
    stabilized_temperature_distance: [],
    afas_preprocessing: {
      preview_status: "updated",
      smoothed: {
        temperature_celsius: [20.1, 20.2],
        values: [501, 502],
        applied: true
      }
    },
    afas_analysis: {},
    export_artifacts: [],
    created_at: "2026-07-08T00:00:00.000Z"
  };
}

function sampleDetection(frameIndex, distance = 500 + frameIndex, temperature = 20 + frameIndex * 0.1, overrides = {}) {
  return {
    frame_index: frameIndex,
    detection_status: "VALID",
    ab_points: null,
    measurement_segment: null,
    distance_px: distance,
    raw_ab_points: null,
    raw_distance_px: distance,
    stabilized_ab_points: null,
    stabilized_distance_px: distance,
    result_display_source: "raw",
    raw_best_candidate: null,
    selected_candidate: null,
    stabilized_candidate: null,
    rejected_candidates: [],
    quality: {
      confidence: 0.9,
      edge_strength: null,
      contour_area: null,
      roi_coverage: null,
      jump_from_previous_px: null
    },
    rejected_reason: "",
    curve_point_status: "valid",
    curve_exclusion_reason: "",
    raw_detected_distance_px: distance,
    distance_outlier_filtered: false,
    distance_outlier_baseline_px: null,
    distance_outlier_deviation_px: null,
    distance_outlier_max_jump_px: null,
    distance_outlier_reference_count: null,
    distance_outlier_reference_values: [],
    debug_artifacts: {},
    temperature_sync_status: "TEMP_SYNC_OK",
    frame_timestamp_ms: 1000 + frameIndex * 100,
    temperature_timestamp_ms: 1002 + frameIndex * 100,
    temperature_celsius: temperature,
    temperature_delta_ms: 2,
    temperature_source: "fixture",
    temperature_sampled_this_frame: true,
    ...overrides
  };
}

function sampleFrameEvent(frameIndex, overrides = {}) {
  const detection = overrides.detection_result ?? sampleDetection(frameIndex);
  const temperatureDistance = overrides.temperature_distance === undefined
    ? curvePoint(frameIndex, detection.temperature_celsius, detection.distance_px)
    : overrides.temperature_distance;
  return {
    event: "frame",
    run_id: "run-live",
    dataset_id: "golden_run",
    operator_data_source: "real_camera",
    frame_index: frameIndex,
    frame_count: 0,
    total_frames: 0,
    processed_frames: frameIndex,
    frame_url: `/api/runs/run-live/preview/latest.png?frame_index=${frameIndex}`,
    frame_record: {
      frame_index: frameIndex,
      shape: [80, 120],
      dtype: "uint8",
      source: "camera",
      frame_path: "",
      timestamp_ms: detection.frame_timestamp_ms,
      camera_meta: {}
    },
    temperature_record: {
      timestamp_ms: detection.temperature_timestamp_ms,
      celsius: detection.temperature_celsius,
      source: "fixture",
      sampled_this_frame: true,
      error: ""
    },
    detection_result: detection,
    sync_config: { temp_sync_target_ms: 1000 },
    curve_points: {
      distance_time: curvePoint(frameIndex, detection.frame_timestamp_ms, detection.distance_px),
      temperature_time: curvePoint(frameIndex, detection.frame_timestamp_ms, detection.temperature_celsius),
      temperature_distance: temperatureDistance,
      raw_distance_time: curvePoint(frameIndex, detection.frame_timestamp_ms, detection.raw_distance_px),
      raw_temperature_distance: temperatureDistance,
      stabilized_distance_time: curvePoint(frameIndex, detection.frame_timestamp_ms, detection.stabilized_distance_px),
      stabilized_temperature_distance: temperatureDistance
    },
    afas_preprocessing: {
      preview_status: "unchanged",
      point_count: frameIndex,
      temperature_distance_point_count: frameIndex,
      preview_interval_frames: 300
    },
    afas_analysis: { result_status: "pending" },
    live_point_status: overrides.live_point_status ?? {
      temperature_distance_present: temperatureDistance !== null,
      temperature_distance_point_count: frameIndex,
      reason_if_missing: temperatureDistance === null ? "unknown" : "",
      detection_status: detection.detection_status,
      curve_point_status: detection.curve_point_status,
      temperature_sync_status: detection.temperature_sync_status,
      distance_outlier_filtered: detection.distance_outlier_filtered
    }
  };
}

test("appendLiveAnalysis appends formal temperature-distance points even when AFAS preview is unchanged", async () => {
  const { appendLiveAnalysis } = await loadLiveRunAnalysisModule();
  const initial = sampleAnalysis(10);
  const event = sampleFrameEvent(11);

  const next = appendLiveAnalysis(
    initial,
    event.detection_result,
    event.curve_points,
    event.afas_preprocessing,
    event.afas_analysis,
    event.run_id,
    event.sync_config
  );

  assert.equal(next.temperature_distance.length, 11);
  assert.equal(next.temperature_distance.at(-1)?.frame_index, 11);
  assert.deepEqual(next.afas_preprocessing.smoothed, initial.afas_preprocessing.smoothed);
  assert.equal(next.afas_preprocessing.preview_status, "unchanged");
});

test("unchanged AFAS previews cannot stop repeated live formal point growth", async () => {
  const { appendLiveAnalysis } = await loadLiveRunAnalysisModule();
  const { buildRunTrendModel } = await loadCurveModule();
  let analysis = sampleAnalysis(10);

  for (const frameIndex of [11, 12, 13, 14, 15]) {
    const event = sampleFrameEvent(frameIndex);
    analysis = appendLiveAnalysis(
      analysis,
      event.detection_result,
      event.curve_points,
      event.afas_preprocessing,
      event.afas_analysis,
      event.run_id,
      event.sync_config
    );
    const model = buildRunTrendModel(analysis, { mode: "full", width: 900, height: 420 });
    assert.equal(analysis.temperature_distance.length, frameIndex);
    assert.equal(model.formalPoints.length, frameIndex);
  }
});

test("live run diagnostics explain when distance and temperature exist but the frame is not formal", async () => {
  const { buildLiveRunDiagnostics, livePointStatusMessage } = await loadLiveRunAnalysisModule();
  const staleDetection = sampleDetection(42, 506, 31.5, {
    temperature_sync_status: "TEMP_SYNC_STALE",
    temperature_delta_ms: 120
  });
  const event = sampleFrameEvent(42, {
    detection_result: staleDetection,
    temperature_distance: null,
    live_point_status: {
      temperature_distance_present: false,
      temperature_distance_point_count: 17,
      reason_if_missing: "temperature_sync_not_formal",
      detection_status: "VALID",
      curve_point_status: "valid",
      temperature_sync_status: "TEMP_SYNC_STALE",
      distance_outlier_filtered: false
    }
  });
  const diagnostics = buildLiveRunDiagnostics(null, event, sampleAnalysis(17), staleDetection);

  assert.equal(diagnostics.latestDetectionDistancePx, 506);
  assert.equal(diagnostics.latestDetectionTemperatureC, 31.5);
  assert.equal(diagnostics.latestCurvePointPresent, false);
  assert.equal(diagnostics.latestCurvePointMissingReason, "temperature_sync_not_formal");
  assert.equal(
    livePointStatusMessage(event.live_point_status),
    "Current frame did not enter the formal curve: temperature sync status is not formal"
  );
});

test("operator UI contains the formal-curve missing reason copy", () => {
  const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const i18nSource = readFileSync(resolve(rootDir, "src/i18n.ts"), "utf8");

  assert.match(mainSource, /livePointStatusMessage/);
  assert.match(i18nSource, /当前帧未进入正式曲线：温度同步状态不满足正式分析/);
});
