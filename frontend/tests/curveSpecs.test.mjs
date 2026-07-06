import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
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
    afas_preprocessing: {
      ...sampleAnalysisWithAfasPreview().afas_preprocessing,
      raw: {
        temperature_celsius: [22.5, 22.8, 23.2, 24.0, 34.0, 42.0],
        values: [124.5, 170.0, 130.0, 126.0, 127.0, 129.5],
        frame_indexes: [1, 2, 3, 4, 5, 6]
      },
      outlier_repair: {
        temperature_celsius: [22.5, 22.8, 23.2, 24.0, 34.0, 42.0],
        values: [124.5, 126.0, 130.0, 126.0, 127.0, 129.5],
        outlier_mask: [false, true, false, false, false, false],
        outlier_count: 1
      },
      smoothed: {
        temperature_celsius: [22.5, 24.0, 34.0, 42.0],
        values: [125.5, 126.0, 127.0, 129.5],
        applied: true,
        effective_savgol_window_length: 5
      }
    },
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

function sampleAnalysisWithYAxisStress() {
  return {
    ...sampleAnalysis(),
    temperature_distance: [
      { x: 1.0, y: 100.0, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
      { x: 1.2, y: 101.0, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
      { x: 1.4, y: 180.0, frame_index: 3, sync_status: "TEMP_SYNC_OK" },
      { x: 1.6, y: 102.0, frame_index: 4, sync_status: "TEMP_SYNC_OK" },
      { x: 1.8, y: 103.0, frame_index: 5, sync_status: "TEMP_SYNC_OK" }
    ],
    afas_preprocessing: {
      raw: {
        temperature_celsius: [1.0, 1.2, 1.4, 1.6, 1.8],
        values: [100.0, 101.0, 180.0, 102.0, 103.0],
        frame_indexes: [1, 2, 3, 4, 5]
      },
      outlier_repair: {
        temperature_celsius: [1.0, 1.2, 1.4, 1.6, 1.8],
        values: [100.0, 101.0, 101.5, 102.0, 103.0],
        outlier_mask: [false, false, true, false, false],
        outlier_count: 1
      },
      smoothed: {
        temperature_celsius: [1.0, 1.2, 1.4, 1.6, 1.8],
        values: [100.0, 101.0, 101.5, 102.0, 103.0],
        applied: true
      }
    },
    afas_analysis: {
      result_status: "ok",
      result: {
        As: 1.2,
        Af_tan: 1.8,
        max_slope_temp: 1.4
      },
      fit: {
        max_slope_temperature_celsius: 1.4,
        max_slope_value: 500.0,
        low_baseline: {
          range_celsius: [0.8, 1.25],
          slope: 1.0,
          intercept: 99.0
        },
        high_baseline: {
          range_celsius: [1.55, 2.0],
          slope: 1.0,
          intercept: 101.0
        },
        tangent: {
          slope: 500.0,
          intercept: -600.0
        }
      }
    }
  };
}

test("analysis AFAS model separates review layers and extends baselines to AS and AF", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540,
    layers: { raw: true, fit: true, markers: true }
  });

  assert.equal(model.width, 980);
  assert.equal(model.height, 540);
  assert.equal(model.rawPoints.length, 6);
  assert.equal(model.outlierPoints.length, 1);
  assert.equal(model.smoothedPoints.length, 4);
  assert.equal(model.smoothedPath.split(" ").length, 4);
  assert.deepEqual(
    model.fitLines.map((line) => [line.kind, line.label]),
    [
      ["low_baseline", "AS baseline / Low baseline"],
      ["high_baseline", "AF baseline / High baseline"],
      ["tangent", "Maximum slope tangent"]
    ]
  );
  const lowBaseline = model.fitLines.find((line) => line.kind === "low_baseline");
  const highBaseline = model.fitLines.find((line) => line.kind === "high_baseline");
  assert.deepEqual(lowBaseline?.dataRange, [20, 24]);
  assert.deepEqual(highBaseline?.dataRange, [42, 48]);
  assert.ok(model.fitLines.every((line) => Number.isFinite(line.x1) && Number.isFinite(line.y1)));
  assert.deepEqual(
    model.markers.map((marker) => marker.kind),
    ["as", "af_tan", "max_slope"]
  );
  assert.ok(model.summary.asLabel.includes("24.00"));
  assert.ok(model.summary.afTanLabel.includes("42.00"));
  assert.ok(model.xRange.min <= 20);
  assert.ok(model.xRange.max >= 48);
  assert.ok(model.xTicks.length >= 4);
  assert.ok(model.yTicks.length >= 4);
});

test("analysis AFAS model exposes AS and AF construction semantics with user-facing labels", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540,
    layers: { raw: true, fit: true, markers: true }
  });

  assert.deepEqual(
    model.fitLines.map((line) => [line.kind, line.label, line.dataRange]),
    [
      ["low_baseline", "AS baseline / Low baseline", [20, 24]],
      ["high_baseline", "AF baseline / High baseline", [42, 48]],
      ["tangent", "Maximum slope tangent", null]
    ]
  );
  assert.deepEqual(
    model.constructionGuides.map((guide) => [guide.kind, guide.label]),
    [
      ["as_vertical", "AS"],
      ["af_vertical", "AF"],
      ["max_slope_vertical", "Max slope point"]
    ]
  );
  const asMarker = model.markers.find((marker) => marker.kind === "as");
  const afMarker = model.markers.find((marker) => marker.kind === "af_tan");
  const maxSlopeMarker = model.markers.find((marker) => marker.kind === "max_slope");
  assert.equal(asMarker?.label, "AS");
  assert.equal(asMarker?.valueLabel, "AS 24.00°C");
  assert.equal(afMarker?.label, "AF");
  assert.equal(afMarker?.valueLabel, "AF 42.00°C");
  assert.equal(maxSlopeMarker?.label, "Max slope point");
  assert.equal(asMarker?.distance, 0.2 * 24 + 121);
  assert.equal(afMarker?.distance, 0.2 * 42 + 121);
  assert.equal(model.constructionNote, "AS = maximum slope tangent × low-temperature baseline; AF = maximum slope tangent × high-temperature baseline. Low/high baselines come from linear fits in their temperature ranges.");
});

test("analysis AFAS marker labels reserve padded backgrounds and avoid AS AF overlap", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();
  const analysis = {
    ...sampleAnalysisWithTangentOverlay(),
    afas_analysis: {
      ...sampleAnalysisWithTangentOverlay().afas_analysis,
      result: {
        As: 24.0,
        Af_tan: 24.12,
        max_slope_temp: 24.06
      },
      fit: {
        ...sampleAnalysisWithTangentOverlay().afas_analysis.fit,
        max_slope_temperature_celsius: 24.06,
        max_slope_value: 125.812
      }
    }
  };

  const model = buildAnalysisAfasModel(analysis, {
    width: 420,
    height: 300,
    layers: { raw: false, fit: true, markers: true }
  });
  const asBox = model.markers.find((marker) => marker.kind === "as")?.labelBox;
  const afBox = model.markers.find((marker) => marker.kind === "af_tan")?.labelBox;

  assert.ok(asBox);
  assert.ok(afBox);
  assert.equal(asBox.clipPath, null);
  assert.equal(afBox.clipPath, null);
  assert.equal(asBox.fillOpacity, 1);
  assert.equal(afBox.fillOpacity, 1);
  assert.ok(asBox.width >= asBox.textWidth + asBox.paddingX * 2);
  assert.ok(afBox.width >= afBox.textWidth + afBox.paddingX * 2);
  assert.ok(asBox.x >= 0 && asBox.x + asBox.width <= model.width);
  assert.ok(afBox.x >= 0 && afBox.x + afBox.width <= model.width);
  const overlapX = Math.max(0, Math.min(asBox.x + asBox.width, afBox.x + afBox.width) - Math.max(asBox.x, afBox.x));
  const overlapY = Math.max(0, Math.min(asBox.y + asBox.height, afBox.y + afBox.height) - Math.max(asBox.y, afBox.y));
  assert.equal(overlapX * overlapY, 0);
});

test("analysis AFAS UI source does not expose Af-tan as a user label", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");

  assert.doesNotMatch(source, /label="Af-tan"/);
  assert.doesNotMatch(source, /t\("Af-tan"\)/);
});

test("analysis AFAS model honors layer toggles and zoom domain without recalculating data", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540,
    xDomain: [23, 35],
    layers: { raw: false, fit: false, markers: true }
  });

  assert.equal(model.rawPoints.length, 0);
  assert.equal(model.fitLines.length, 0);
  assert.deepEqual(model.xRange, { min: 23, max: 35 });
  assert.deepEqual(
    model.smoothedPoints.map((point) => point.temperature),
    [24, 34]
  );
  assert.deepEqual(
    model.markers.map((marker) => marker.kind),
    ["as", "max_slope"]
  );
  assert.equal(model.outlierPoints.length, 0);
});

test("analysis AFAS y axis ignores outliers and extreme markers by default", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithYAxisStress(), {
    width: 980,
    height: 540,
    layers: { raw: true, fit: true, markers: true }
  });

  assert.equal(model.rawPoints.length, 5);
  assert.equal(model.outlierPoints.length, 1);
  assert.equal(model.markers.find((marker) => marker.kind === "max_slope")?.yClipped, true);
  assert.ok(model.yRange.max < 130);
  assert.ok(model.yRange.max - model.yRange.min >= 20);
});

test("analysis AFAS y axis refits to brush zoom and reset full range with minimum span", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();
  const analysis = {
    ...sampleAnalysis(),
    afas_preprocessing: {
      raw: {
        temperature_celsius: [1, 2, 8, 9],
        values: [100, 101, 180, 182],
        frame_indexes: [1, 2, 3, 4]
      },
      smoothed: {
        temperature_celsius: [1, 2, 8, 9],
        values: [100, 101, 180, 182],
        applied: true
      }
    },
    afas_analysis: {}
  };

  const full = buildAnalysisAfasModel(analysis, {
    width: 980,
    height: 540,
    layers: { raw: true, fit: false, markers: false }
  });
  const zoomed = buildAnalysisAfasModel(analysis, {
    width: 980,
    height: 540,
    xDomain: [1, 2],
    layers: { raw: true, fit: false, markers: false }
  });
  const reset = buildAnalysisAfasModel(analysis, {
    width: 980,
    height: 540,
    xDomain: null,
    layers: { raw: true, fit: false, markers: false }
  });

  assert.ok(full.yRange.max >= 182);
  assert.ok(zoomed.yRange.max < 120);
  assert.ok(zoomed.yRange.max - zoomed.yRange.min >= 20);
  assert.deepEqual(reset.xRange, full.xRange);
  assert.deepEqual(reset.yRange, full.yRange);
});

test("analysis AFAS y axis ignores raw points when raw layer is hidden", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();
  const analysis = {
    ...sampleAnalysis(),
    afas_preprocessing: {
      raw: {
        temperature_celsius: [1, 2, 3],
        values: [100, 140, 101],
        frame_indexes: [1, 2, 3]
      },
      smoothed: {
        temperature_celsius: [1, 2, 3],
        values: [100, 100.5, 101],
        applied: true
      }
    },
    afas_analysis: {}
  };

  const model = buildAnalysisAfasModel(analysis, {
    width: 980,
    height: 540,
    layers: { raw: false, fit: false, markers: false }
  });

  assert.equal(model.rawPoints.length, 0);
  assert.ok(model.yRange.max < 120);
  assert.ok(model.yRange.max - model.yRange.min >= 20);
});

test("analysis AFAS defaults to formal curve only and keeps raw diagnostic points off", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540
  });

  assert.equal(model.layers.raw, false);
  assert.equal(model.layers.fit, true);
  assert.equal(model.layers.markers, true);
  assert.equal(model.rawPoints.length, 0);
  assert.equal(model.outlierPoints.length, 0);
  assert.equal(model.smoothedPoints.length, 4);
  assert.equal(model.smoothedPath.split(" ").length, 4);
  assert.ok(model.hasPoints);
});

test("analysis AFAS model explains stale frames when saved formal curve is empty", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();
  const model = buildAnalysisAfasModel(
    {
      ...sampleAnalysis(),
      all_frames: [
        {
          frame_index: 1,
          detection_status: "VALID",
          distance_px: 758,
          temperature_celsius: 17.5,
          temperature_sync_status: "TEMP_SYNC_STALE",
          temperature_delta_ms: 100,
          temp_sync_target_ms: 10
        }
      ],
      temperature_distance: [],
      afas_preprocessing: {}
    },
    { width: 980, height: 540 }
  );

  assert.equal(model.hasPoints, false);
  assert.equal(model.emptyState?.kind, "status_rugs_only");
  assert.match(model.emptyState?.title ?? "", /No formal temperature-distance points/);
  assert.match(model.emptyState?.detail ?? "", /status markers below the x axis/);
  assert.equal(model.emptyState?.syncStatus, "TEMP_SYNC_STALE");
  assert.equal(model.emptyState?.temperatureDeltaMs, 100);
  assert.equal(model.emptyState?.tempSyncTargetMs, 10);
});

test("analysis AFAS shows AS, AF, and max slope vertical guides without stretching y axis", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540,
    layers: { raw: false, fit: true, markers: true }
  });

  assert.deepEqual(
    model.constructionGuides.map((guide) => guide.kind),
    ["as_vertical", "af_vertical", "max_slope_vertical"]
  );
  assert.ok(model.constructionGuides.every((guide) => guide.role === "AFAS construction guide"));
  assert.ok(model.constructionGuides.every((guide) => guide.x1 >= model.plot.left && guide.x1 <= model.plot.right));
  assert.ok(model.constructionGuides.every((guide) => guide.x2 >= model.plot.left && guide.x2 <= model.plot.right));
  assert.ok(model.constructionGuides.every((guide) => guide.y1 >= model.plot.top && guide.y1 <= model.plot.bottom));
  assert.ok(model.constructionGuides.every((guide) => guide.y2 >= model.plot.top && guide.y2 <= model.plot.bottom));
  assert.ok(model.yRange.max < 150);
});

test("analysis AFAS keeps the smoothed curve independent from fit and marker toggles", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();

  const model = buildAnalysisAfasModel(sampleAnalysisWithTangentOverlay(), {
    width: 980,
    height: 540,
    layers: { raw: false, fit: false, markers: false }
  });

  assert.equal(model.rawPoints.length, 0);
  assert.equal(model.fitLines.length, 0);
  assert.equal(model.constructionGuides.length, 0);
  assert.equal(model.markers.length, 0);
  assert.equal(model.smoothedPoints.length, 4);
  assert.equal(model.smoothedPath.split(" ").length, 4);
  assert.ok(model.hasPoints);
});

test("analysis AFAS chart source starts with raw diagnostics disabled", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");

  assert.match(
    source,
    /useState<AnalysisAfasLayerState>\(\{\s*raw:\s*false,\s*fit:\s*true,\s*markers:\s*true\s*\}\)/
  );
});

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

test("run trend model breaks invalid and stale points out of the formal curve", async () => {
  const { buildRunTrendModel } = await loadCurveModule();

  const model = buildRunTrendModel(
    {
      ...sampleAnalysis(),
      all_frames: [
        {
          frame_index: 1,
          detection_status: "VALID",
          distance_px: 100,
          temperature_celsius: 20,
          temperature_sync_status: "TEMP_SYNC_OK"
        },
        {
          frame_index: 2,
          detection_status: "VALID",
          distance_px: 101,
          temperature_celsius: 21,
          temperature_sync_status: "TEMP_SYNC_OK"
        },
        {
          frame_index: 3,
          detection_status: "VALID",
          distance_px: 102,
          temperature_celsius: 22,
          temperature_sync_status: "TEMP_SYNC_STALE"
        },
        {
          frame_index: 4,
          detection_status: "INVALID",
          distance_px: 103,
          temperature_celsius: 23,
          temperature_sync_status: "TEMP_SYNC_OK"
        },
        {
          frame_index: 5,
          detection_status: "VALID",
          distance_px: 104,
          temperature_celsius: 24,
          temperature_sync_status: "TEMP_SYNC_INTERPOLATED"
        }
      ],
      temperature_distance: [
        { x: 20, y: 100, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
        { x: 21, y: 101, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
        { x: 24, y: 104, frame_index: 5, sync_status: "TEMP_SYNC_INTERPOLATED" }
      ]
    },
    { mode: "full", width: 900, height: 420 }
  );

  assert.deepEqual(model.formalSegments, []);
  assert.deepEqual(
    model.referencePoints.map((point) => point.frameIndex),
    [1, 2, 5]
  );
  assert.deepEqual(
    model.statusRugs.map((rug) => [rug.frameIndex, rug.kind]),
    [
      [3, "sync"],
      [4, "invalid"]
    ]
  );
  assert.equal(model.latestPoint?.frameIndex, 5);
  assert.equal(model.valueStrip.points, 3);
});

test("run trend model explains stale status rugs when no formal temperature-distance points exist", async () => {
  const { buildRunTrendModel } = await loadCurveModule();

  const model = buildRunTrendModel(
    {
      ...sampleAnalysis(),
      all_frames: [
        {
          frame_index: 1,
          detection_status: "VALID",
          distance_px: 758,
          temperature_celsius: 17.5,
          temperature_sync_status: "TEMP_SYNC_STALE",
          temperature_delta_ms: 100,
          temp_sync_target_ms: 10
        }
      ],
      temperature_distance: [],
      afas_preprocessing: {}
    },
    { mode: "full", width: 900, height: 420 }
  );

  assert.equal(model.hasPoints, false);
  assert.equal(model.statusRugs.length, 1);
  assert.equal(model.emptyState?.kind, "status_rugs_only");
  assert.match(model.emptyState?.title ?? "", /No formal temperature-distance points/);
  assert.match(model.emptyState?.detail ?? "", /status markers below the x axis/);
  assert.equal(model.emptyState?.syncStatus, "TEMP_SYNC_STALE");
  assert.equal(model.emptyState?.temperatureDeltaMs, 100);
  assert.equal(model.emptyState?.tempSyncTargetMs, 10);
  assert.equal(model.valueStrip.temperatureDeltaMs, 100);
  assert.equal(model.valueStrip.tempSyncTargetMs, 10);
});

test("run trend model renders raw frame points as scatter while connecting backend smoothed temperatures", async () => {
  const { buildRunTrendModel } = await loadCurveModule();

  const model = buildRunTrendModel(
    {
      ...sampleAnalysis(),
      temperature_distance: [
        { x: 1.20, y: 1018.0, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
        { x: 1.20, y: 1019.0, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
        { x: 1.24, y: 1018.4, frame_index: 3, sync_status: "TEMP_SYNC_OK" },
        { x: 1.21, y: 1018.8, frame_index: 4, sync_status: "TEMP_SYNC_OK" }
      ],
      afas_preprocessing: {
        smoothed: {
          temperature_celsius: [1.20, 1.21, 1.24],
          values: [1018.5, 1018.7, 1018.6],
          applied: true
        }
      }
    },
    { mode: "full", width: 900, height: 420 }
  );

  assert.equal(model.source, "smoothed");
  assert.equal(model.sourceLabel, "Backend smoothed temperature-distance");
  assert.deepEqual(
    model.referencePoints.map((point) => [point.frameIndex, point.temperature, point.distance]),
    [
      [1, 1.20, 1018.0],
      [2, 1.20, 1019.0],
      [3, 1.24, 1018.4],
      [4, 1.21, 1018.8]
    ]
  );
  assert.deepEqual(
    model.formalPoints.map((point) => point.temperature),
    [1.20, 1.21, 1.24]
  );
  assert.deepEqual(
    model.formalSegments.map((segment) => segment.map((point) => point.temperature)),
    [[1.20, 1.21, 1.24]]
  );
  assert.equal(model.latestPoint?.frameIndex, 4);
  assert.equal(model.latestPoint?.source, "raw");
});

test("run trend y axis keeps pixel jitter from filling the plot", async () => {
  const { buildRunTrendModel } = await loadCurveModule();

  const model = buildRunTrendModel(
    {
      ...sampleAnalysis(),
      temperature_distance: [
        { x: 1.20, y: 1018.0, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
        { x: 1.20, y: 1019.0, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
        { x: 1.21, y: 1018.4, frame_index: 3, sync_status: "TEMP_SYNC_OK" },
        { x: 1.22, y: 1018.8, frame_index: 4, sync_status: "TEMP_SYNC_OK" },
        { x: 1.23, y: 1068.0, frame_index: 5, sync_status: "TEMP_SYNC_OK" }
      ],
      afas_preprocessing: {
        smoothed: {
          temperature_celsius: [1.20, 1.21, 1.22],
          values: [1018.5, 1018.6, 1018.4],
          applied: true
        }
      }
    },
    { mode: "latest", width: 900, height: 420 }
  );

  assert.ok(model.yRange.max - model.yRange.min >= 40);
  assert.ok(model.yRange.max < 1040);
});

test("run trend y axis ignores a single raw reference outlier when backend formal curve is unavailable", async () => {
  const { buildRunTrendModel } = await loadCurveModule();

  const model = buildRunTrendModel(
    {
      ...sampleAnalysis(),
      temperature_distance: [
        { x: 1.20, y: 1000.0, frame_index: 1, sync_status: "TEMP_SYNC_OK" },
        { x: 1.21, y: 1001.0, frame_index: 2, sync_status: "TEMP_SYNC_OK" },
        { x: 1.22, y: 999.5, frame_index: 3, sync_status: "TEMP_SYNC_OK" },
        { x: 1.23, y: 1060.0, frame_index: 4, sync_status: "TEMP_SYNC_OK" }
      ],
      afas_preprocessing: {}
    },
    { mode: "full", width: 900, height: 420 }
  );

  assert.equal(model.source, "raw");
  assert.equal(model.referencePoints.length, 4);
  assert.ok(model.yRange.max - model.yRange.min >= 40);
  assert.ok(model.yRange.max < 1030);
});

test("run trend sticky y axis expands near guards without shrinking during live updates", async () => {
  const { resolveRunTrendStickyYAxisRange } = await loadCurveModule();
  const previousRange = { min: 998, max: 1038 };

  assert.deepEqual(
    resolveRunTrendStickyYAxisRange(previousRange, { min: 1018, max: 1019 }, {
      minSpanPx: 40,
      guardBandRatio: 0.1,
      expandFactor: 1.5
    }),
    previousRange
  );

  const expanded = resolveRunTrendStickyYAxisRange(previousRange, { min: 1035, max: 1037 }, {
    minSpanPx: 40,
    guardBandRatio: 0.1,
    expandFactor: 1.5
  });

  assert.ok(expanded.min <= previousRange.min);
  assert.ok(expanded.max > previousRange.max);
  assert.ok(expanded.max - expanded.min >= 60);
});

test("run trend model shows the current run so far even when latest mode is requested", async () => {
  const { buildRunTrendModel } = await loadCurveModule();
  const analysis = {
    ...sampleAnalysis(),
    temperature_distance: Array.from({ length: 140 }, (_, index) => ({
      x: 20 + index * 0.1,
      y: 900 + index,
      frame_index: index + 1,
      sync_status: "TEMP_SYNC_OK"
    }))
  };

  const latest = buildRunTrendModel(analysis, { mode: "latest", width: 900, height: 420 });
  const full = buildRunTrendModel(analysis, { mode: "full", width: 900, height: 420 });

  assert.equal(latest.windowMode, "latest");
  assert.equal(latest.formalPoints.length, 0);
  assert.equal(latest.referencePoints.length, 140);
  assert.equal(latest.referencePoints[0].frameIndex, 1);
  assert.equal(latest.latestPoint?.frameIndex, 140);
  assert.ok(latest.xRange.min <= 20);
  assert.ok(latest.xRange.max >= 33.9);
  assert.deepEqual(
    latest.referencePoints.map((point) => point.frameIndex),
    full.referencePoints.map((point) => point.frameIndex)
  );
  assert.equal(full.formalPoints.length, 0);
  assert.equal(full.referencePoints.length, 140);
});

test("run trend model does not crop backend smoothed curve to a local latest temperature window", async () => {
  const { buildRunTrendModel } = await loadCurveModule();
  const temperatureDistance = Array.from({ length: 140 }, (_, index) => ({
    x: 20 + index * 0.1,
    y: 900 + index,
    frame_index: index + 1,
    sync_status: "TEMP_SYNC_OK"
  }));
  const analysis = {
    ...sampleAnalysis(),
    temperature_distance: temperatureDistance,
    afas_preprocessing: {
      smoothed: {
        temperature_celsius: [20, 22, 24, 26, 28, 30, 32, 33.9],
        values: [900, 906, 916, 930, 948, 970, 996, 1039],
        applied: true
      }
    }
  };

  const model = buildRunTrendModel(analysis, { mode: "latest", width: 900, height: 420 });

  assert.equal(model.source, "smoothed");
  assert.deepEqual(
    model.formalPoints.map((point) => point.temperature),
    [20, 22, 24, 26, 28, 30, 32, 33.9]
  );
  assert.equal(model.referencePoints.length, 140);
  assert.ok(model.xRange.min <= 20);
  assert.ok(model.xRange.max >= 33.9);
});

test("run page exposes current-run-so-far status instead of latest/full window buttons", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");

  assert.match(source, /Current run so far/);
  assert.doesNotMatch(source, /Latest window/);
  assert.doesNotMatch(source, /aria-label="Run trend window"/);
});

test("industrial curve frame model exposes shared Run and Analysis variants with readable text", async () => {
  const { buildIndustrialCurveFrameModel } = await loadCurveModule();
  const baseFrame = {
    width: 900,
    height: 420,
    plot: { left: 76, right: 872, top: 34, bottom: 348 },
    xTicks: [{ value: 20, position: 100, label: "20.0" }],
    yTicks: [{ value: 900, position: 200, label: "900" }],
    xAxisLabel: "Temperature (°C)",
    yAxisLabel: "Distance (px)"
  };

  const runFrame = buildIndustrialCurveFrameModel({
    ...baseFrame,
    variant: "run_monitor"
  });
  const analysisFrame = buildIndustrialCurveFrameModel({
    ...baseFrame,
    height: 540,
    variant: "analysis_review"
  });

  assert.equal(runFrame.variant, "run_monitor");
  assert.equal(analysisFrame.variant, "analysis_review");
  assert.equal(runFrame.classNames.frame, "runTrendPlot");
  assert.equal(analysisFrame.classNames.frame, "analysisAfasFrame");
  assert.ok(runFrame.textMetrics.tickLabelFontPx >= 12);
  assert.ok(runFrame.textMetrics.axisLabelFontPx >= 13);
  assert.ok(analysisFrame.textMetrics.tickLabelFontPx >= 12);
  assert.ok(analysisFrame.textMetrics.axisLabelFontPx >= 13);
  assert.equal(runFrame.axisLayout.xAxisLabelY, baseFrame.height - 16);
  assert.equal(analysisFrame.axisLayout.xAxisLabelY, 540 - 18);
});
