import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
const stylesSource = readFileSync(resolve(rootDir, "src/styles.css"), "utf8");

function sourceSlice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mainSource.slice(start, end);
}

test("operator results render one summary card per analysis position", () => {
  const resultsPage = sourceSlice(
    "function OperatorResultsPage({",
    "function ExportSaveDialog({"
  );
  const regionResults = sourceSlice(
    "function OperatorRegionResults({",
    "function OperatorAfasSummary("
  );

  assert.match(resultsPage, /<OperatorRegionResults analysis=\{analysis\}/);
  assert.match(regionResults, /analysis\.regions\?\.map/);
  assert.match(regionResults, /Position results/);
  assert.match(regionResults, /raw_point_count/);
  assert.match(regionResults, /smoothed_point_count/);
  assert.match(regionResults, /max_slope_temperature/);
  assert.match(regionResults, /failure_reason/);
  assert.match(regionResults, /AS/);
  assert.match(regionResults, /AF/);
  assert.match(regionResults, /ΔT/);
  assert.match(
    stylesSource,
    /\.operatorRegionResultGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s
  );
});

test("current and imported results use the combined multi-position chart", () => {
  const resultsPage = sourceSlice(
    "function OperatorResultsPage({",
    "function ExportSaveDialog({"
  );
  const importedReview = sourceSlice(
    "function ImportedRunCurveReview({",
    "function OperatorRegionResults({"
  );

  assert.match(resultsPage, /Combined curves/);
  assert.match(resultsPage, /<MultiRegionTrendChart/);
  assert.match(resultsPage, /<MultiRegionAfasReview/);
  assert.match(resultsPage, /variant="result"/);
  assert.match(importedReview, /<MultiRegionTrendChart/);
  assert.match(importedReview, /<MultiRegionAfasReview/);
  assert.match(importedReview, /analysisRegionTrendSources/);
});

test("results page stacks summary, combined chart, AFAS detail, and parameters at full width", () => {
  const resultsPage = sourceSlice(
    "function OperatorResultsPage({",
    "function ExportSaveDialog({"
  );
  const order = [
    'className="toolPanel operatorResultSummary"',
    'className="toolPanel operatorResultChart"',
    'className="toolPanel operatorAfasDetailPanel"',
    'className="toolPanel operatorReanalysisPanel"'
  ].map((marker) => resultsPage.indexOf(marker));

  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  for (const className of [
    "operatorResultSummary",
    "operatorResultChart",
    "operatorAfasDetailPanel",
    "operatorReanalysisPanel"
  ]) {
    assert.match(stylesSource, new RegExp(`\\.${className}[^}]*grid-column:\\s*1 / -1`, "s"));
  }
});

test("multi-position AFAS review switches one region into the existing detail chart", () => {
  const review = sourceSlice(
    "function MultiRegionAfasReview({",
    "function OperatorRegionResults({"
  );
  const adapter = sourceSlice(
    "function analysisForRegion(",
    "function analysisRegionTrendSources("
  );

  assert.match(review, /selectedRegionId/);
  assert.match(review, /analysis\.regions/);
  assert.match(review, /<AnalysisAfasChart analysis=\{selectedAnalysis\}/);
  assert.match(review, /regionColorSwatch/);
  assert.match(adapter, /region\.afas_preprocessing/);
  assert.match(adapter, /region\.afas_analysis/);
  assert.doesNotMatch(adapter, /analysis\.afas_preprocessing/);
  assert.doesNotMatch(adapter, /analysis\.afas_analysis/);
});

test("result chart exposes formal, display trend, and AFAS smoothing layers", () => {
  const chart = sourceSlice(
    "function MultiRegionTrendChart({",
    "function MultiRegionTrendTooltip("
  );

  assert.match(chart, /showFormalPoints/);
  assert.match(chart, /showDisplayTrend/);
  assert.match(chart, /showAfasSmoothed/);
  assert.match(chart, /Formal points/);
  assert.match(chart, /Live smoothed trend/);
  assert.match(chart, /Smoothed curve/);
});

test("one global re-analysis request updates all normalized analysis regions", () => {
  const panel = sourceSlice(
    "function AfasParameterPanel({",
    "function IndustrialCurveView({"
  );

  assert.match(panel, /recomputeRunAnalysis\(runId/);
  assert.match(panel, /region_id: regionId/);
  assert.match(panel, /Apply to all positions/);
  assert.match(panel, /onAnalysisUpdated\(nextAnalysis\)/);
  assert.doesNotMatch(panel, /for \(const region/);
});

test("stream progress reports the current analysis position and merges completed positions", () => {
  assert.match(mainSource, /event\.event === "analyzing_region"/);
  assert.match(mainSource, /event\.event === "analysis_region_complete"/);
  assert.match(mainSource, /updateLiveRunFromRegionAnalysis/);
  assert.match(mainSource, /analysisProgress/);
  assert.match(mainSource, /Analyzing position \{current\}\/\{total\}/);
});
