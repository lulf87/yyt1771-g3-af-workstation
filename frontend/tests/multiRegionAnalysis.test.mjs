import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-multi-region-analysis-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadModule() {
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
      "src/multiRegionAnalysis.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "multiRegionAnalysis.js")).href}?${Date.now()}`);
}

function roi(centerX) {
  return {
    type: "rotated_rect",
    center_x: centerX,
    center_y: 80,
    width: 100,
    height: 40,
    angle_deg: 0
  };
}

function measurement() {
  return {
    measurement_id: "multi-live",
    source: "real_camera",
    object_class: "C_BUNDLE_ENVELOPE",
    detector: "BundleEnvelopeDetector",
    detector_mode: "contrast_widest_span",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: roi(100),
    regions: [
      { region_id: "region_1", index: 1, label: "位置 1", enabled: true, roi: roi(100), color: "#ef4444" },
      { region_id: "region_2", index: 2, label: "位置 2", enabled: true, roi: roi(240), color: "#3b82f6" }
    ],
    detector_config: {}
  };
}

function detection(regionId, frameIndex, overrides = {}) {
  const index = Number(regionId.split("_")[1]);
  return {
    frame_index: frameIndex,
    detection_status: "VALID",
    region_id: regionId,
    region_index: index,
    region_label: `位置 ${index}`,
    region_color: index === 1 ? "#ef4444" : "#3b82f6",
    distance_px: 500 + index,
    stabilized_distance_px: 500 + index,
    raw_distance_px: 500 + index,
    curve_point_status: "valid",
    temperature_sync_status: "TEMP_SYNC_OK",
    temperature_celsius: 30 + frameIndex,
    distance_outlier_filtered: false,
    rejected_reason: "",
    curve_exclusion_reason: "",
    ...overrides
  };
}

function regionResult(regionId, frameIndex, formal, overrides = {}) {
  const result = detection(regionId, frameIndex, overrides);
  return {
    region_id: result.region_id,
    region_index: result.region_index,
    region_label: result.region_label,
    color: result.region_color,
    detection_result: result,
    curve_points: {
      distance_time: null,
      temperature_time: null,
      temperature_distance: formal
        ? {
            x: result.temperature_celsius,
            y: result.distance_px,
            frame_index: frameIndex,
            sync_status: result.temperature_sync_status
          }
        : null
    },
    live_point_status: {
      region_id: result.region_id,
      region_index: result.region_index,
      region_label: result.region_label,
      temperature_distance_present: formal,
      temperature_distance_point_count: formal ? 1 : 0,
      reason_if_missing: formal ? "" : "distance_outlier_filtered",
      detection_status: result.detection_status,
      curve_point_status: result.curve_point_status,
      temperature_sync_status: result.temperature_sync_status,
      distance_outlier_filtered: !formal
    }
  };
}

function frameEvent(regionResults, frameIndex = 12) {
  return {
    event: "frame",
    run_id: "run-multi",
    dataset_id: "real_camera",
    frame_index: frameIndex,
    region_results: regionResults,
    detection_result: regionResults[0].detection_result,
    curve_points: regionResults[0].curve_points,
    live_point_status: regionResults[0].live_point_status
  };
}

test("an invalid first position does not stop the second formal curve", async () => {
  const { appendRegionFrameEvent, emptyRegionLiveState } = await loadModule();
  const initial = emptyRegionLiveState(measurement());
  const next = appendRegionFrameEvent(
    initial,
    frameEvent([
      regionResult("region_1", 12, false, { distance_outlier_filtered: true }),
      regionResult("region_2", 12, true)
    ])
  );

  assert.equal(next.region_1.temperatureDistance.length, 0);
  assert.equal(next.region_1.latestMissingReason, "distance_outlier_filtered");
  assert.equal(next.region_2.temperatureDistance.length, 1);
  assert.equal(next.region_2.lastFormalFrameIndex, 12);
  assert.equal(next.region_2.formalPointCount, 1);
});

test("each position keeps independent smoothing without mutating formal points", async () => {
  const { appendRegionFrameEvent, emptyRegionLiveState } = await loadModule();
  let state = emptyRegionLiveState(measurement());
  const rawDistances = [500, 560, 502];
  for (let offset = 0; offset < rawDistances.length; offset += 1) {
    const frameIndex = offset + 1;
    state = appendRegionFrameEvent(
      state,
      frameEvent([
        regionResult("region_1", frameIndex, true, { distance_px: rawDistances[offset] }),
        regionResult("region_2", frameIndex, true, { distance_px: 610 + offset })
      ], frameIndex),
      { smoothingWindowSize: 3 }
    );
  }

  assert.deepEqual(state.region_1.temperatureDistance.map((point) => point.y), rawDistances);
  assert.notDeepEqual(state.region_1.displayTemperatureDistance.map((point) => point.y), rawDistances);
  assert.deepEqual(state.region_2.temperatureDistance.map((point) => point.y), [610, 611, 612]);
});

test("combined trend uses shared axes and stable region colors", async () => {
  const { buildMultiRegionTrendModel } = await loadModule();
  const sources = [
    {
      region_id: "region_1",
      region_index: 1,
      region_label: "位置 1",
      color: "#ef4444",
      temperature_distance: [
        { x: 30, y: 500, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
        { x: 40, y: 510, frame_index: 2, sync_status: "TEMP_SYNC_OK" }
      ],
      all_frames: [detection("region_1", 1), detection("region_1", 2)]
    },
    {
      region_id: "region_2",
      region_index: 2,
      region_label: "位置 2",
      color: "#3b82f6",
      temperature_distance: [
        { x: 32, y: 600, frame_index: 1, sync_status: "TEMP_SYNC_INTERPOLATED" },
        { x: 42, y: 620, frame_index: 2, sync_status: "TEMP_SYNC_OK" }
      ],
      all_frames: [detection("region_2", 1), detection("region_2", 2)]
    }
  ];
  const model = buildMultiRegionTrendModel(sources, {
    width: 900,
    height: 420,
    visibleRegionIds: new Set(["region_1", "region_2"]),
    displaySmoothing: { enabled: true, windowSize: 3 }
  });

  assert.equal(model.series.length, 2);
  assert.equal(model.series[0].color, "#ef4444");
  assert.equal(model.series[1].color, "#3b82f6");
  assert.deepEqual(model.series[0].xRange, model.series[1].xRange);
  assert.deepEqual(model.series[0].yRange, model.series[1].yRange);
  assert.equal(model.xAxisLabel, "Temperature (°C)");
  assert.equal(model.yAxisLabel, "Distance (px)");
  assert.equal(model.series[1].points[0].syncStatus, "TEMP_SYNC_INTERPOLATED");
});

test("legend visibility excludes only the hidden position", async () => {
  const { buildMultiRegionTrendModel } = await loadModule();
  const sources = [
    { region_id: "region_1", region_index: 1, region_label: "位置 1", color: "#ef4444", temperature_distance: [{ x: 30, y: 500, frame_index: 1, sync_status: "TEMP_SYNC_OK" }], all_frames: [] },
    { region_id: "region_2", region_index: 2, region_label: "位置 2", color: "#3b82f6", temperature_distance: [{ x: 31, y: 600, frame_index: 1, sync_status: "TEMP_SYNC_OK" }], all_frames: [] }
  ];
  const model = buildMultiRegionTrendModel(sources, {
    width: 700,
    height: 360,
    visibleRegionIds: new Set(["region_2"])
  });

  assert.deepEqual(model.series.map((series) => series.regionId), ["region_2"]);
  assert.deepEqual(model.legend.map((item) => [item.regionId, item.visible]), [
    ["region_1", false],
    ["region_2", true]
  ]);
});
