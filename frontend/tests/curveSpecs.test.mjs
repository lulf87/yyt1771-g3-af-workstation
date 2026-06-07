import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-test-build");

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function loadCurveModule() {
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
      "--outDir",
      outDir,
      "src/curves.ts"
    ],
    { cwd: rootDir, stdio: "pipe" }
  );
  return import(`${pathToFileURL(resolve(outDir, "curves.js")).href}?${Date.now()}`);
}

function sampleAnalysis() {
  return {
    analysis_id: "analysis-1",
    run_id: "run-1",
    all_frames: [],
    distance_time: [
      { x: 1_779_000_000_000, y: 120.5, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
      { x: 1_779_000_001_000, y: 121.5, frame_index: 2, sync_status: "TEMP_SYNC_OK" }
    ],
    temperature_time: [
      { x: 1_779_000_000_000, y: 22.5, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
      { x: 1_779_000_001_000, y: 23.5, frame_index: 2, sync_status: "TEMP_SYNC_OK" }
    ],
    temperature_distance: [
      { x: 22.5, y: 120.5, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
      { x: 23.5, y: 121.5, frame_index: 2, sync_status: "TEMP_SYNC_OK" }
    ],
    export_artifacts: [],
    created_at: "2026-06-04T00:00:00.000Z"
  };
}

function sampleAnalysisWithAfasPreview() {
  return {
    ...sampleAnalysis(),
    temperature_distance: [
      { x: 22.5, y: 124.5, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
      { x: 22.5, y: 126.5, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
      { x: 23.0, y: 130.0, frame_index: 3, sync_status: "TEMP_SYNC_OK" }
    ],
    afas_preprocessing: {
      smoothed: {
        temperature_celsius: [22.5, 23.0],
        values: [125.5, 130.0],
        applied: true,
        effective_savgol_window_length: 5
      }
    },
    afas_analysis: {}
  };
}

function sampleAnalysisWithTangentOverlay() {
  return {
    ...sampleAnalysisWithAfasPreview(),
    afas_analysis: {
      result_status: "ok",
      result: {
        As: 24,
        Af_tan: 42,
        max_slope_temp: 34
      },
      fit: {
        max_slope_temperature_celsius: 34,
        max_slope_value: 127,
        low_baseline: {
          range_celsius: [20, 28],
          slope: 0.2,
          intercept: 121
        },
        high_baseline: {
          range_celsius: [40, 48],
          slope: 0.1,
          intercept: 122
        },
        tangent: {
          slope: 0.2,
          intercept: 121
        }
      }
    }
  };
}

test("run curve specs expose temperature-distance as the live analysis curve", async () => {
  const { buildRunCurveSpecs } = await loadCurveModule();

  const specs = buildRunCurveSpecs(sampleAnalysis());

  assert.deepEqual(
    specs.map((spec) => spec.key),
    ["temperature_distance"]
  );
  assert.equal(specs[0].title, "Distance - temperature");
  assert.equal(specs[0].xAxisLabel, "Temperature (°C)");
  assert.equal(specs[0].yAxisLabel, "Distance (px)");
  assert.equal(specs[0].xAxis.kind, "raw");
});

test("run curve specs prefer backend AFAS smoothed temperature-distance preview", async () => {
  const { buildRunCurveSpecs } = await loadCurveModule();

  const specs = buildRunCurveSpecs(sampleAnalysisWithAfasPreview());

  assert.equal(specs[0].title, "Smoothed distance - temperature");
  assert.deepEqual(
    specs[0].points.map((point) => [point.x, point.y]),
    [
      [22.5, 125.5],
      [23.0, 130.0]
    ]
  );
});

test("analysis curve specs expose temperature-distance as the primary curve", async () => {
  const { buildAnalysisCurveSpecs } = await loadCurveModule();

  const specs = buildAnalysisCurveSpecs(sampleAnalysis());

  assert.deepEqual(
    specs.map((spec) => spec.key),
    ["temperature_distance"]
  );
  assert.equal(specs[0].xAxisLabel, "Temperature (°C)");
  assert.equal(specs[0].yAxisLabel, "Distance (px)");
});

test("curve view model provides axis labels and ticks for temperature-distance values", async () => {
  const { buildRunCurveSpecs, buildCurveViewModel } = await loadCurveModule();
  const [distanceSpec] = buildRunCurveSpecs(sampleAnalysis());

  const model = buildCurveViewModel(distanceSpec, 360, 220);

  assert.equal(model.xAxisLabel, "Temperature (°C)");
  assert.equal(model.yAxisLabel, "Distance (px)");
  assert.ok(model.xTicks.length >= 2);
  assert.ok(model.yTicks.length >= 2);
  assert.match(model.polyline, /^\d/);
});

test("analysis curve view model exposes AFAS tangent overlay lines and markers", async () => {
  const { buildAnalysisCurveSpecs, buildCurveViewModel } = await loadCurveModule();
  const [distanceSpec] = buildAnalysisCurveSpecs(sampleAnalysisWithTangentOverlay());

  const model = buildCurveViewModel(distanceSpec, 360, 220);

  assert.deepEqual(
    model.overlayLines.map((line) => line.kind),
    ["low_baseline", "high_baseline", "tangent"]
  );
  assert.deepEqual(
    model.overlayMarkers.map((marker) => marker.kind),
    ["as", "af_tan", "max_slope"]
  );
  assert.ok(model.overlayLines.every((line) => Number.isFinite(line.x1) && Number.isFinite(line.y1)));
  assert.ok(model.overlayMarkers.every((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.y)));
});

test("curve view model tolerates unstable intermediate AFAS overlay ranges", async () => {
  const { buildCurveViewModel } = await loadCurveModule();

  const model = buildCurveViewModel(
    {
      key: "temperature_distance",
      title: "Smoothed distance - temperature",
      points: [
        { x: 10.0, y: 900.0 },
        { x: 10.000000000001, y: 900.000000000001 }
      ],
      overlays: {
        lines: [
          {
            kind: "tangent",
            label: "Tangent",
            slope: 1e308,
            intercept: -1e308,
            range: [10.0, 10.000000000001]
          }
        ],
        markers: []
      },
      xAxis: { kind: "raw", label: "Temperature (°C)" },
      xAxisLabel: "Temperature (°C)",
      yAxisLabel: "Distance (px)",
      color: "#0f766e"
    },
    360,
    220
  );

  assert.ok(model.xTicks.length >= 2);
  assert.ok(model.yTicks.length >= 2);
  assert.ok(model.xTicks.every((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.position)));
  assert.ok(model.yTicks.every((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.position)));
});

test("curve view model keeps y axis anchored to measured curve when tangent is unstable", async () => {
  const { buildCurveViewModel } = await loadCurveModule();

  const model = buildCurveViewModel(
    {
      key: "temperature_distance",
      title: "Smoothed distance - temperature",
      points: [
        { x: 10.0, y: 900.0 },
        { x: 10.5, y: 910.0 },
        { x: 11.0, y: 920.0 }
      ],
      overlays: {
        lines: [
          {
            kind: "tangent",
            label: "Tangent",
            slope: -37881.907824974274,
            intercept: 413666.8509110991,
            range: null
          }
        ],
        markers: [
          {
            kind: "as",
            label: "As",
            x: 10.894245090419936,
            y: 413666.8509110991 - 37881.907824974274 * 10.894245090419936
          }
        ]
      },
      xAxis: { kind: "raw", label: "Temperature (°C)" },
      xAxisLabel: "Temperature (°C)",
      yAxisLabel: "Distance (px)",
      color: "#0f766e"
    },
    360,
    220
  );

  const tickValues = model.yTicks.map((tick) => tick.value);

  assert.ok(Math.min(...tickValues) >= 850);
  assert.ok(Math.max(...tickValues) <= 950);
});
