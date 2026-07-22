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
  assert.match(review, /<AnalysisAfasChart/);
  assert.match(review, /analysis=\{selectedAnalysis\}/);
  assert.match(review, /runId=\{runId\}/);
  assert.match(review, /regionId=\{selectedRegion\.region_id\}/);
  assert.match(review, /mergeRegionAnalysisUpdate\(analysis, nextAnalysis, selectedRegion\.region_id\)/);
  assert.match(review, /regionColorSwatch/);
  assert.match(adapter, /region\.afas_preprocessing/);
  assert.match(adapter, /region\.afas_analysis/);
  assert.doesNotMatch(adapter, /analysis\.afas_preprocessing/);
  assert.doesNotMatch(adapter, /analysis\.afas_analysis/);
});

test("AFAS chart exposes range, tangent-position, and tangent-slope drag handles with backend preview and save", () => {
  const chart = sourceSlice(
    "function AnalysisAfasChart({",
    "function AnalysisAfasSummaryStrip("
  );

  assert.match(chart, /analysisAfasRangeMoveTarget/);
  assert.match(chart, /analysisAfasRangeHandle/);
  assert.match(chart, /analysisAfasRangeHandleHitTarget/);
  assert.match(chart, /Drag low-temperature start boundary/);
  assert.match(chart, /Drag high-temperature end boundary/);
  assert.match(chart, /analysisAfasTangentMoveTarget/);
  assert.match(chart, /analysisAfasTangentSlopeHandle/);
  assert.match(chart, /previewRunAfasAdjustment\(/);
  assert.match(chart, /applyAfasPreviewToAnalysis\(analysis, preview\)/);
  assert.match(chart, /previewAbortRef\.current\?\.abort\(\)/);
  assert.match(chart, /requestId !== previewRequestIdRef\.current/);
  assert.match(chart, /setPointerCapture\(event\.pointerId\)/);
  assert.match(chart, /if \(acceptedParameters\) void persistInteractiveAdjustment\(acceptedParameters\)/);
  assert.match(chart, /recomputeRunAnalysis\(runId/);
  assert.match(chart, /Restore automatic calculation/);
  assert.match(chart, /persistInteractiveAdjustment\(DEFAULT_AFAS_ANALYSIS_FORM, "automatic"\)/);
  assert.match(chart, /disabled=\{!manualOverridesActive \|\| editBusy\}/);
  assert.match(chart, /mode === "automatic" \? "restoring" : "saving"/);
  assert.match(
    stylesSource,
    /\.analysisAfasReferenceMarker,[\s\S]*?\.analysisAfasMaxSlopeMarker\s*\{[^}]*pointer-events:\s*none/
  );
  assert.match(
    stylesSource,
    /\.analysisAfasRangeHandleHitTarget\s*\{[^}]*fill:\s*transparent[^}]*pointer-events:\s*all/
  );
});

test("AFAS chart shows AS/AF order violations as an invalid adjustment instead of raw backend JSON", () => {
  const chart = sourceSlice(
    "function AnalysisAfasChart({",
    "function AnalysisAfasSummaryStrip("
  );
  const helper = sourceSlice(
    "function userFacingAfasAdjustmentError(",
    "function AnalysisAfasSummaryStrip("
  );

  assert.match(chart, /\"invalid\" \| \"error\"/);
  assert.match(chart, /const adjustmentError = userFacingAfasAdjustmentError\(error, t\)/);
  assert.match(chart, /setEditStatus\(adjustmentError\.kind\)/);
  assert.match(chart, /editStatus === \"invalid\" \? \"Adjustment invalid\"/);
  assert.match(helper, /Manual AFAS adjustment must satisfy AS < AF\|AS\\\\s\*<\\\\s\*AF/);
  assert.match(helper, /AS must remain lower than AF/);
  assert.doesNotMatch(chart, /422 Unprocessable Entity/);
});

test("AFAS range and tangent endpoint drags preserve the initial pointer grab offset", () => {
  const chart = sourceSlice(
    "function AnalysisAfasChart({",
    "function AnalysisAfasSummaryStrip("
  );

  assert.match(chart, /grabOffsetTemperature:\s*dataPoint\.temperature - edgeTemperature/);
  assert.match(
    chart,
    /resizeAfasRange\([\s\S]*?dataPoint\.temperature - activeEdit\.grabOffsetTemperature/
  );
  assert.match(chart, /const draggedEndpoint = mode === "slope_start" \? tangentControlPoints\[0\] : tangentControlPoints\[1\]/);
  assert.match(chart, /grabOffset:\s*\{[\s\S]*?temperature:\s*dataPoint\.temperature - draggedEndpoint\.temperature/);
  assert.match(chart, /distance:\s*dataPoint\.distance - draggedEndpoint\.distance/);
  assert.match(
    chart,
    /rotateAfasTangent\([\s\S]*?temperature:\s*dataPoint\.temperature - activeEdit\.grabOffset\.temperature[\s\S]*?distance:\s*dataPoint\.distance - activeEdit\.grabOffset\.distance/
  );
});

test("AFAS chart clamps edits and saves only backend-accepted parameters", () => {
  const chart = sourceSlice(
    "function AnalysisAfasChart({",
    "function AnalysisAfasSummaryStrip("
  );
  const dataPointHelper = sourceSlice(
    "function analysisAfasChartDataPoint(",
    "function pointInPlot("
  );

  assert.match(dataPointHelper, /clampAfasPlotPoint/);
  assert.match(dataPointHelper, /clampAfasDataPoint/);
  assert.match(chart, /model\.interactionDomain\.availableTemperatures/);
  assert.match(chart, /candidateParametersRef/);
  assert.match(chart, /acceptedParametersRef/);
  assert.match(chart, /acceptedParametersRef\.current\s*=\s*parameters/);
  assert.match(chart, /previewAbortRef\.current\?\.abort\(\)/);
  assert.match(chart, /persistInteractiveAdjustment\(acceptedParameters/);
  assert.doesNotMatch(chart, /persistInteractiveAdjustment\(candidateParameters/);
});

test("AFAS plot visuals and hit targets share a unique SVG clip", () => {
  const chart = sourceSlice(
    "function AnalysisAfasChart({",
    "function AnalysisAfasSummaryStrip("
  );

  assert.match(chart, /useId\(\)/);
  assert.match(chart, /<clipPath id=\{plotClipId\}>/);
  assert.match(
    chart,
    /<rect[\s\S]*x=\{model\.plot\.left\}[\s\S]*height=\{model\.plot\.bottom - model\.plot\.top\}/
  );
  assert.ok((chart.match(/clipPath=\{plotClipUrl\}/g) ?? []).length >= 2);
  assert.match(chart, /data-layer="afas-clipped-plot"/);
  assert.match(chart, /data-layer="afas-unclipped-labels"/);
  assert.match(chart, /<AnalysisAfasTooltip/);
});

test("AFAS automatic restore detects every persisted manual override without treating resolved ranges as manual", () => {
  const helper = sourceSlice(
    "function hasManualAfasOverrides(",
    "function normalizeAfasPreprocessingParameters("
  );

  assert.match(helper, /parameters\.low_range_celsius/);
  assert.match(helper, /parameters\.high_range_celsius/);
  assert.match(helper, /parameters\.tangent_offset/);
  assert.match(helper, /parameters\.tangent_slope_override/);
  assert.match(helper, /parameters\.tangent_intercept_override/);
  assert.doesNotMatch(helper, /resolved_low_range_celsius|resolved_high_range_celsius/);
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
