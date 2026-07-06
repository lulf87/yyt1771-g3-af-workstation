export type CurveKey = "distance_time" | "temperature_time" | "temperature_distance";

export type CurvePointInput = {
  x: number;
  y: number;
  frame_index?: number;
  sync_status?: string | null;
};

export type RunTrendFrameInput = {
  frame_index?: number;
  detection_status?: string | null;
  distance_px?: number | null;
  temperature_celsius?: number | null;
  temperature_sync_status?: string | null;
  temperature_delta_ms?: number | null;
  temp_sync_target_ms?: number | null;
};

export type SyncConfigInput = {
  temp_sync_target_ms?: number | null;
};

export type AnalysisCurveSource = {
  all_frames?: RunTrendFrameInput[];
  distance_time: CurvePointInput[];
  temperature_time: CurvePointInput[];
  temperature_distance: CurvePointInput[];
  afas_preprocessing?: Record<string, unknown>;
  afas_analysis?: Record<string, unknown>;
  sync_config?: SyncConfigInput;
  config_snapshot?: Record<string, unknown>;
};

export type CurveXAxis =
  | { kind: "elapsed_time"; frameFallbackLabel: string }
  | { kind: "raw"; label: string };

export type CurveSpec = {
  key: CurveKey;
  title: string;
  points: CurvePointInput[];
  referencePoints?: CurvePointInput[];
  overlays?: CurveOverlaySpec;
  xAxis: CurveXAxis;
  xAxisLabel: string;
  yAxisLabel: string;
  color: string;
};

export type CurveOverlayLineSpec = {
  kind: "low_baseline" | "high_baseline" | "tangent";
  label: string;
  slope: number;
  intercept: number;
  range?: [number, number] | null;
};

export type CurveOverlayMarkerSpec = {
  kind: "as" | "af_tan" | "max_slope";
  label: string;
  x: number;
  y: number;
};

export type CurveOverlaySpec = {
  lines: CurveOverlayLineSpec[];
  markers: CurveOverlayMarkerSpec[];
};

export type CurveTick = {
  value: number;
  position: number;
  label: string;
};

export type CurveViewModel = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  plot: { left: number; right: number; top: number; bottom: number };
  polyline: string;
  referencePoints: Array<{ x: number; y: number }>;
  overlayLines: Array<{
    kind: CurveOverlayLineSpec["kind"];
    label: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  overlayMarkers: Array<{
    kind: CurveOverlayMarkerSpec["kind"];
    label: string;
    x: number;
    y: number;
  }>;
  xTicks: CurveTick[];
  yTicks: CurveTick[];
  xAxisLabel: string;
  yAxisLabel: string;
  hasPoints: boolean;
};

export type IndustrialCurveViewVariant = "run_monitor" | "analysis_review";

export type IndustrialCurveFrameInput = {
  variant: IndustrialCurveViewVariant;
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  xTicks: CurveTick[];
  yTicks: CurveTick[];
  xAxisLabel: string;
  yAxisLabel: string;
};

export type IndustrialCurveFrameModel = IndustrialCurveFrameInput & {
  classNames: {
    frame: string;
    gridLine: string;
    axis: string;
    tick: string;
    tickLabel: string;
    axisLabel: string;
  };
  axisLayout: {
    frameRadius: number;
    tickLength: number;
    xTickLabelOffset: number;
    yTickLabelXOffset: number;
    yTickLabelYOffset: number;
    xAxisLabelY: number;
    yAxisLabelY: number;
  };
  textMetrics: {
    tickLabelFontPx: number;
    axisLabelFontPx: number;
  };
};

export type RunTrendWindowMode = "latest" | "full";
export type RunTrendPointSource = "smoothed" | "grouped" | "raw";

export type RunTrendModelOptions = {
  mode: RunTrendWindowMode;
  width: number;
  height: number;
  yAxis?: RunTrendYAxisOptions;
};

export type RunTrendYAxisRange = {
  min: number;
  max: number;
};

export type RunTrendYAxisOptions = {
  minSpanPx?: number;
  rangeOverride?: RunTrendYAxisRange | null;
};

export type RunTrendStickyYAxisOptions = {
  minSpanPx?: number;
  guardBandRatio?: number;
  expandFactor?: number;
};

export type RunTrendPoint = {
  frameIndex: number | null;
  temperature: number;
  distance: number;
  syncStatus: string | null;
  detectionStatus: string | null;
  source: RunTrendPointSource;
  x: number;
  y: number;
};

export type RunTrendStatusRug = {
  frameIndex: number;
  kind: "invalid" | "sync";
  label: string;
  syncStatus: string | null;
  detectionStatus: string | null;
  temperatureDeltaMs: number | null;
  tempSyncTargetMs: number | null;
  x: number;
  y1: number;
  y2: number;
};

export type RunTrendValueStrip = {
  currentDistance: number | null;
  currentTemperature: number | null;
  currentFrame: number | null;
  syncStatus: string | null;
  detectionStatus: string | null;
  temperatureDeltaMs: number | null;
  tempSyncTargetMs: number | null;
  points: number;
};

export type TrendEmptyState = {
  kind: "status_rugs_only";
  title: string;
  detail: string;
  syncStatus: string | null;
  detectionStatus: string | null;
  frameIndex: number | null;
  temperatureDeltaMs: number | null;
  tempSyncTargetMs: number | null;
};

export type RunTrendModel = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  plot: { left: number; right: number; top: number; bottom: number };
  windowMode: RunTrendWindowMode;
  source: RunTrendPointSource;
  sourceLabel: string;
  formalPoints: RunTrendPoint[];
  referencePoints: RunTrendPoint[];
  formalSegments: RunTrendPoint[][];
  statusRugs: RunTrendStatusRug[];
  latestPoint: RunTrendPoint | null;
  xTicks: CurveTick[];
  yTicks: CurveTick[];
  xAxisLabel: string;
  yAxisLabel: string;
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
  dataYRange: RunTrendYAxisRange;
  valueStrip: RunTrendValueStrip;
  emptyState: TrendEmptyState | null;
  hasPoints: boolean;
};

export type AnalysisAfasLayerKey = "raw" | "fit" | "markers";

export type AnalysisAfasLayerState = Record<AnalysisAfasLayerKey, boolean>;

export type AnalysisAfasModelOptions = {
  width: number;
  height: number;
  xDomain?: [number, number] | null;
  layers?: Partial<AnalysisAfasLayerState>;
};

export type AnalysisAfasDataPoint = {
  temperature: number;
  distance: number;
  frameIndex: number | null;
  x: number;
  y: number;
};

export type AnalysisAfasFitLine = {
  kind: CurveOverlayLineSpec["kind"];
  label: string;
  dataRange: [number, number] | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

export type AnalysisAfasConstructionGuide = {
  kind: "as_vertical" | "af_vertical" | "max_slope_vertical";
  label: string;
  role: "AFAS construction guide";
  temperature: number;
  distance: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

export type AnalysisAfasLabelBox = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
  textY: number;
  textWidth: number;
  paddingX: number;
  paddingY: number;
  fillOpacity: number;
  clipPath: null;
};

export type AnalysisAfasMarker = {
  kind: CurveOverlayMarkerSpec["kind"];
  label: string;
  valueLabel: string;
  temperature: number;
  distance: number;
  x: number;
  y: number;
  yClipped: boolean;
  labelBox: AnalysisAfasLabelBox | null;
};

export type AnalysisAfasSummary = {
  status: string;
  asLabel: string;
  afLabel: string;
  afTanLabel: string;
  deltaLabel: string;
  maxSlopeLabel: string;
  outlierLabel: string;
  rawCountLabel: string;
  smoothedCountLabel: string;
};

export type AnalysisAfasModel = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  plot: { left: number; right: number; top: number; bottom: number };
  layers: AnalysisAfasLayerState;
  rawPoints: AnalysisAfasDataPoint[];
  outlierPoints: AnalysisAfasDataPoint[];
  smoothedPoints: AnalysisAfasDataPoint[];
  smoothedPath: string;
  fitLines: AnalysisAfasFitLine[];
  constructionGuides: AnalysisAfasConstructionGuide[];
  markers: AnalysisAfasMarker[];
  xTicks: CurveTick[];
  yTicks: CurveTick[];
  xAxisLabel: string;
  yAxisLabel: string;
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
  summary: AnalysisAfasSummary;
  constructionNote: string | null;
  emptyState: TrendEmptyState | null;
  hasPoints: boolean;
};

const FORMAL_COLOR = "#0f766e";
const DEFAULT_RUN_TREND_Y_AXIS_MIN_SPAN_PX = 40;
const DEFAULT_RUN_TREND_Y_AXIS_GUARD_BAND_RATIO = 0.1;
const DEFAULT_RUN_TREND_Y_AXIS_EXPAND_FACTOR = 1.5;
const DEFAULT_ANALYSIS_AFAS_Y_AXIS_MIN_SPAN_PX = 20;
const DISPLAY_Y_AXIS_OUTLIER_MIN_DEVIATION_PX = 8;
const DISPLAY_Y_AXIS_OUTLIER_MAD_MULTIPLIER = 8;
const AFAS_MARKER_LABEL_FONT_PX = 12;
const AFAS_MARKER_LABEL_PADDING_X = 8;
const AFAS_MARKER_LABEL_PADDING_Y = 4;
const AFAS_MARKER_LABEL_HEIGHT = 24;
const DEFAULT_ANALYSIS_AFAS_LAYERS: AnalysisAfasLayerState = {
  raw: false,
  fit: true,
  markers: true
};

export function buildIndustrialCurveFrameModel(
  input: IndustrialCurveFrameInput
): IndustrialCurveFrameModel {
  const isRunMonitor = input.variant === "run_monitor";
  return {
    ...input,
    classNames: isRunMonitor
      ? {
        frame: "runTrendPlot",
        gridLine: "runTrendGridLine",
        axis: "runTrendAxis",
        tick: "runTrendTick",
        tickLabel: "runTrendTickLabel",
        axisLabel: "runTrendAxisLabel"
      }
      : {
        frame: "analysisAfasFrame",
        gridLine: "analysisAfasGridLine",
        axis: "analysisAfasAxis",
        tick: "analysisAfasTick",
        tickLabel: "analysisAfasTickLabel",
        axisLabel: "analysisAfasAxisLabel"
      },
    axisLayout: {
      frameRadius: 6,
      tickLength: 6,
      xTickLabelOffset: isRunMonitor ? 24 : 25,
      yTickLabelXOffset: isRunMonitor ? 11 : 12,
      yTickLabelYOffset: 4,
      xAxisLabelY: input.height - (isRunMonitor ? 16 : 18),
      yAxisLabelY: isRunMonitor ? 22 : 24
    },
    textMetrics: {
      tickLabelFontPx: 12,
      axisLabelFontPx: 13
    }
  };
}

type RawOverlayLineSegment = CurveOverlayLineSpec & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function buildRunCurveSpecs(analysis: AnalysisCurveSource): CurveSpec[] {
  const smoothedPoints = readSmoothedTemperatureDistance(analysis);
  return [
    {
      key: "temperature_distance",
      title: smoothedPoints ? "Smoothed distance - temperature" : "Distance - temperature",
      points: smoothedPoints ?? analysis.temperature_distance,
      referencePoints: smoothedPoints ? analysis.temperature_distance : undefined,
      overlays: undefined,
      xAxis: { kind: "raw", label: "Temperature (°C)" },
      xAxisLabel: "Temperature (°C)",
      yAxisLabel: "Distance (px)",
      color: FORMAL_COLOR
    }
  ];
}

export function buildAnalysisCurveSpecs(analysis: AnalysisCurveSource): CurveSpec[] {
  const smoothedPoints = readSmoothedTemperatureDistance(analysis);
  return [
    {
      key: "temperature_distance",
      title: smoothedPoints ? "Smoothed distance - temperature" : "Distance - temperature",
      points: smoothedPoints ?? analysis.temperature_distance,
      referencePoints: smoothedPoints ? analysis.temperature_distance : undefined,
      overlays: readAfasOverlays(analysis),
      xAxis: { kind: "raw", label: "Temperature (°C)" },
      xAxisLabel: "Temperature (°C)",
      yAxisLabel: "Distance (px)",
      color: FORMAL_COLOR
    }
  ];
}

function readSmoothedTemperatureDistance(analysis: AnalysisCurveSource): CurvePointInput[] | null {
  return readPreprocessedTemperatureDistance(analysis, "smoothed", { attachRawFrameMetadata: true });
}

function readPreprocessedTemperatureDistance(
  analysis: AnalysisCurveSource,
  key: "grouped" | "smoothed",
  options: { attachRawFrameMetadata?: boolean } = {}
): CurvePointInput[] | null {
  const preprocessing = analysis.afas_preprocessing;
  if (!preprocessing || typeof preprocessing !== "object") return null;
  const series = (preprocessing as Record<string, unknown>)[key];
  if (!series || typeof series !== "object") return null;
  const temperatures = (series as { temperature_celsius?: unknown }).temperature_celsius;
  const values = (series as { values?: unknown }).values;
  if (!Array.isArray(temperatures) || !Array.isArray(values)) return null;
  const points = temperatures.flatMap((temperature, index) => {
    const value = values[index];
    if (typeof temperature !== "number" || typeof value !== "number") return [];
    if (!Number.isFinite(temperature) || !Number.isFinite(value)) return [];
    const rawPoint = options.attachRawFrameMetadata ? analysis.temperature_distance[index] : null;
    return [{
      x: temperature,
      y: value,
      frame_index: rawPoint?.frame_index,
      sync_status: rawPoint?.sync_status
    }];
  });
  return points.length
    ? [...points].sort((a, b) => a.x - b.x)
    : null;
}

export function buildRunTrendModel(
  analysis: AnalysisCurveSource,
  options: RunTrendModelOptions
): RunTrendModel {
  const width = options.width;
  const height = options.height;
  const padding = { top: 34, right: 28, bottom: 72, left: 76 };
  const plot = {
    left: padding.left,
    right: width - padding.right,
    top: padding.top,
    bottom: height - padding.bottom
  };
  const frameMap = buildFrameMap(analysis.all_frames ?? []);
  const allReferenceData = normalizeRunTrendDataPoints(analysis.temperature_distance, "raw", frameMap)
    .filter((point) => isFormalTrendPoint(point));
  const allStatusData = normalizeRunTrendStatusData(analysis, frameMap);
  const visibleReferenceData = allReferenceData;
  const visibleStatusData = allStatusData;
  const trendSource = readRunTrendCurveSource(analysis);
  const allFormalData = trendSource.points
    ? normalizeRunTrendDataPoints(trendSource.points, trendSource.source, frameMap, { preserveMissingFrameIndex: true })
      .filter((point) => isFormalTrendPoint(point))
      .sort((a, b) => a.temperature - b.temperature)
    : [];
  const visibleFormalData = allFormalData;
  const xValues = [
    ...visibleFormalData.map((point) => point.temperature),
    ...visibleReferenceData.map((point) => point.temperature),
    ...visibleStatusData.map((rug) => rug.temperature)
  ].filter(Number.isFinite);
  const formalYValues = visibleFormalData.map((point) => point.distance).filter(Number.isFinite);
  const referenceYValues = visibleReferenceData.map((point) => point.distance).filter(Number.isFinite);
  const yValues = formalYValues.length ? formalYValues : filterIsolatedDisplayYOutliers(referenceYValues);
  const xRange = paddedRange(xValues.length ? Math.min(...xValues) : 0, xValues.length ? Math.max(...xValues) : 1);
  const dataYRange = observedRange(yValues);
  const yRange = buildRunTrendYAxisRange(yValues, options.yAxis);
  const formalPoints = visibleFormalData.map((point) => scaleRunTrendPoint(point, xRange, yRange, plot));
  const referencePoints = visibleReferenceData.map((point) => scaleRunTrendPoint(point, xRange, yRange, plot));
  const statusRugs = visibleStatusData.map((rug) => scaleRunTrendStatusRug(rug, xRange, plot));
  const formalSegments = buildRunTrendSegments(formalPoints, statusRugs);
  const xTicks = buildTicks(xRange.min, xRange.max, 5).map((value) => ({
    value,
    position: scaleLinear(value, xRange.min, xRange.max, plot.left, plot.right),
    label: formatRunTrendTick(value, xRange)
  }));
  const yTicks = buildTicks(yRange.min, yRange.max, 5).map((value) => ({
    value,
    position: scaleLinear(value, yRange.min, yRange.max, plot.bottom, plot.top),
    label: formatRunTrendTick(value, yRange)
  }));
  const hasPoints = formalPoints.length > 0 || referencePoints.length > 0;

  return {
    width,
    height,
    padding,
    plot,
    windowMode: options.mode,
    source: trendSource.source,
    sourceLabel: trendSource.label,
    formalPoints,
    referencePoints,
    formalSegments,
    statusRugs,
    latestPoint: referencePoints.length ? referencePoints[referencePoints.length - 1] : null,
    xTicks,
    yTicks,
    xAxisLabel: "Temperature (°C)",
    yAxisLabel: "Distance (px)",
    xRange,
    yRange,
    dataYRange,
    valueStrip: buildRunTrendValueStrip(analysis),
    emptyState: hasPoints ? null : buildTrendEmptyState(statusRugs),
    hasPoints
  };
}

export function buildRunTrendYAxisRange(
  yValues: number[],
  options: RunTrendYAxisOptions = {}
): RunTrendYAxisRange {
  const override = options.rangeOverride;
  if (override && isFiniteRange(override)) return override;

  const finiteValues = yValues.filter(Number.isFinite);
  const minSpanPx = Math.max(1, options.minSpanPx ?? DEFAULT_RUN_TREND_Y_AXIS_MIN_SPAN_PX);
  if (!finiteValues.length) {
    return { min: 0, max: minSpanPx };
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const center = median(finiteValues);
  return ensureMinimumRangeSpan(paddedRange(minValue, maxValue), minSpanPx, center);
}

export function buildAnalysisAfasYAxisRange(
  yValues: number[],
  minSpanPx = DEFAULT_ANALYSIS_AFAS_Y_AXIS_MIN_SPAN_PX
): RunTrendYAxisRange {
  const finiteValues = yValues.filter(Number.isFinite);
  const minSpan = Math.max(1, minSpanPx);
  if (!finiteValues.length) {
    return { min: 0, max: minSpan };
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const center = median(finiteValues);
  return ensureMinimumRangeSpan(paddedRange(minValue, maxValue), minSpan, center);
}

export function resolveRunTrendStickyYAxisRange(
  previousRange: RunTrendYAxisRange | null,
  dataRange: RunTrendYAxisRange,
  options: RunTrendStickyYAxisOptions = {}
): RunTrendYAxisRange {
  const minSpanPx = Math.max(1, options.minSpanPx ?? DEFAULT_RUN_TREND_Y_AXIS_MIN_SPAN_PX);
  const hasObservedRange = isFiniteObservedRange(dataRange);
  const observedDataRange = hasObservedRange
    ? dataRange
    : buildRunTrendYAxisRange([], { minSpanPx });
  const initialRange = hasObservedRange
    ? ensureMinimumRangeSpan(observedDataRange, minSpanPx, (observedDataRange.min + observedDataRange.max) / 2)
    : observedDataRange;
  if (!previousRange || !isFiniteRange(previousRange)) return initialRange;

  const previous = ensureMinimumRangeSpan(
    previousRange,
    minSpanPx,
    (previousRange.min + previousRange.max) / 2
  );
  const previousSpan = previous.max - previous.min;
  const guardBandRatio = clampNumber(
    options.guardBandRatio ?? DEFAULT_RUN_TREND_Y_AXIS_GUARD_BAND_RATIO,
    0,
    0.45
  );
  const guardBand = previousSpan * guardBandRatio;
  const touchesGuard =
    observedDataRange.min <= previous.min + guardBand ||
    observedDataRange.max >= previous.max - guardBand;
  const outsideRange = observedDataRange.min < previous.min || observedDataRange.max > previous.max;
  if (!touchesGuard && !outsideRange) return previous;

  const expandFactor = Math.max(1.01, options.expandFactor ?? DEFAULT_RUN_TREND_Y_AXIS_EXPAND_FACTOR);
  const desiredMin = Math.min(previous.min, observedDataRange.min - guardBand);
  const desiredMax = Math.max(previous.max, observedDataRange.max + guardBand);
  const desiredSpan = desiredMax - desiredMin;
  const nextSpan = Math.max(previousSpan * expandFactor, desiredSpan, minSpanPx);
  const nextCenter = (desiredMin + desiredMax) / 2;
  return {
    min: nextCenter - nextSpan / 2,
    max: nextCenter + nextSpan / 2
  };
}

function readRunTrendCurveSource(analysis: AnalysisCurveSource): {
  source: RunTrendPointSource;
  label: string;
  points: CurvePointInput[] | null;
} {
  const smoothed = readPreprocessedTemperatureDistance(analysis, "smoothed");
  if (smoothed?.length) {
    return {
      source: "smoothed",
      label: "Backend smoothed temperature-distance",
      points: smoothed
    };
  }
  const grouped = readPreprocessedTemperatureDistance(analysis, "grouped");
  if (grouped?.length) {
    return {
      source: "grouped",
      label: "Backend binned temperature-distance",
      points: grouped
    };
  }
  return {
    source: "raw",
    label: "Raw frame scatter; backend smooth pending",
    points: null
  };
}

type RunTrendDataPoint = {
  frameIndex: number | null;
  temperature: number;
  distance: number;
  syncStatus: string | null;
  detectionStatus: string | null;
  source: RunTrendPointSource;
};

type RunTrendStatusData = {
  frameIndex: number;
  temperature: number;
  kind: "invalid" | "sync";
  label: string;
  syncStatus: string | null;
  detectionStatus: string | null;
  temperatureDeltaMs: number | null;
  tempSyncTargetMs: number | null;
};

function buildFrameMap(frames: RunTrendFrameInput[]): Map<number, RunTrendFrameInput> {
  const frameMap = new Map<number, RunTrendFrameInput>();
  for (const frame of frames) {
    const frameIndex = readFiniteNumber(frame.frame_index);
    if (frameIndex !== null) frameMap.set(Math.round(frameIndex), frame);
  }
  return frameMap;
}

function normalizeRunTrendDataPoints(
  points: CurvePointInput[],
  source: RunTrendPointSource,
  frameMap: Map<number, RunTrendFrameInput>,
  options: { preserveMissingFrameIndex?: boolean } = {}
): RunTrendDataPoint[] {
  return points.flatMap((point, index) => {
    const temperature = readFiniteNumber(point.x);
    const distance = readFiniteNumber(point.y);
    if (temperature === null || distance === null) return [];
    const rawFrameIndex = readFiniteNumber(point.frame_index);
    const frameIndex = rawFrameIndex === null && options.preserveMissingFrameIndex
      ? null
      : Math.round(rawFrameIndex ?? index + 1);
    const frame = frameIndex === null ? undefined : frameMap.get(frameIndex);
    return [{
      frameIndex,
      temperature,
      distance,
      syncStatus: readString(frame?.temperature_sync_status) ?? readString(point.sync_status),
      detectionStatus: readString(frame?.detection_status),
      source
    }];
  });
}

function normalizeRunTrendStatusData(
  analysis: AnalysisCurveSource,
  frameMap: Map<number, RunTrendFrameInput>
): RunTrendStatusData[] {
  const analysisTempSyncTargetMs = readTempSyncTargetMs(analysis);
  const rawPointByFrame = new Map<number, CurvePointInput>();
  for (const point of analysis.temperature_distance) {
    const frameIndex = readFiniteNumber(point.frame_index);
    if (frameIndex !== null) rawPointByFrame.set(Math.round(frameIndex), point);
  }
  return [...frameMap.entries()].flatMap(([frameIndex, frame]) => {
    const syncStatus = readString(frame.temperature_sync_status);
    const detectionStatus = readString(frame.detection_status);
    const invalid = !isDetectionStatusValid(detectionStatus);
    const syncBlocked = !isSyncStatusFormal(syncStatus);
    if (!invalid && !syncBlocked) return [];
    const temperature = readFiniteNumber(frame.temperature_celsius) ?? readFiniteNumber(rawPointByFrame.get(frameIndex)?.x);
    if (temperature === null) return [];
    const kind: RunTrendStatusData["kind"] = invalid ? "invalid" : "sync";
    return [{
      frameIndex,
      temperature,
      kind,
      label: invalid ? "Invalid" : formatSyncStatusShort(syncStatus),
      syncStatus,
      detectionStatus,
      temperatureDeltaMs: readFiniteNumber(frame.temperature_delta_ms),
      tempSyncTargetMs: readFiniteNumber(frame.temp_sync_target_ms) ?? analysisTempSyncTargetMs
    }];
  }).sort((a, b) => a.frameIndex - b.frameIndex);
}

function isFormalTrendPoint(point: RunTrendDataPoint): boolean {
  return isDetectionStatusValid(point.detectionStatus) && isSyncStatusFormal(point.syncStatus);
}

function isDetectionStatusValid(status: string | null): boolean {
  return status === null || status === "" || status === "VALID";
}

function isSyncStatusFormal(status: string | null): boolean {
  return status === null || status === "" || status === "TEMP_SYNC_OK" || status === "TEMP_SYNC_INTERPOLATED";
}

function scaleRunTrendPoint(
  point: RunTrendDataPoint,
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: RunTrendModel["plot"]
): RunTrendPoint {
  return {
    ...point,
    x: scaleLinear(point.temperature, xRange.min, xRange.max, plot.left, plot.right),
    y: scaleLinear(point.distance, yRange.min, yRange.max, plot.bottom, plot.top)
  };
}

function scaleRunTrendStatusRug(
  rug: RunTrendStatusData,
  xRange: { min: number; max: number },
  plot: RunTrendModel["plot"]
): RunTrendStatusRug {
  return {
    frameIndex: rug.frameIndex,
    kind: rug.kind,
    label: rug.label,
    syncStatus: rug.syncStatus,
    detectionStatus: rug.detectionStatus,
    temperatureDeltaMs: rug.temperatureDeltaMs,
    tempSyncTargetMs: rug.tempSyncTargetMs,
    x: scaleLinear(rug.temperature, xRange.min, xRange.max, plot.left, plot.right),
    y1: plot.bottom + 12,
    y2: plot.bottom + 26
  };
}

function buildRunTrendSegments(
  formalPoints: RunTrendPoint[],
  statusRugs: RunTrendStatusRug[]
): RunTrendPoint[][] {
  if (!formalPoints.length) return [];
  const segments: RunTrendPoint[][] = [];
  let current: RunTrendPoint[] = [];
  for (const point of formalPoints) {
    const previous = current[current.length - 1];
    if (
      previous &&
      previous.frameIndex !== null &&
      point.frameIndex !== null &&
      hasStatusBreakBetween(previous.frameIndex, point.frameIndex, statusRugs)
    ) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

function hasStatusBreakBetween(
  previousFrame: number,
  nextFrame: number,
  statusRugs: RunTrendStatusRug[]
): boolean {
  const low = Math.min(previousFrame, nextFrame);
  const high = Math.max(previousFrame, nextFrame);
  return statusRugs.some((rug) => rug.frameIndex > low && rug.frameIndex < high);
}

function buildRunTrendValueStrip(analysis: AnalysisCurveSource): RunTrendValueStrip {
  const latestFrame = analysis.all_frames?.length ? analysis.all_frames[analysis.all_frames.length - 1] : null;
  const latestPoint = analysis.temperature_distance.length
    ? analysis.temperature_distance[analysis.temperature_distance.length - 1]
    : null;
  const tempSyncTargetMs = readFiniteNumber(latestFrame?.temp_sync_target_ms) ?? readTempSyncTargetMs(analysis);
  return {
    currentDistance: readFiniteNumber(latestFrame?.distance_px) ?? readFiniteNumber(latestPoint?.y),
    currentTemperature: readFiniteNumber(latestFrame?.temperature_celsius) ?? readFiniteNumber(latestPoint?.x),
    currentFrame: Math.round(readFiniteNumber(latestFrame?.frame_index) ?? readFiniteNumber(latestPoint?.frame_index) ?? NaN) || null,
    syncStatus: readString(latestFrame?.temperature_sync_status) ?? readString(latestPoint?.sync_status),
    detectionStatus: readString(latestFrame?.detection_status),
    temperatureDeltaMs: readFiniteNumber(latestFrame?.temperature_delta_ms),
    tempSyncTargetMs,
    points: analysis.temperature_distance.length
  };
}

function buildTrendEmptyState(statusRugs: RunTrendStatusRug[]): TrendEmptyState | null {
  if (!statusRugs.length) return null;
  const latest = statusRugs[statusRugs.length - 1];
  return trendEmptyStateFromDiagnostic({
    frameIndex: latest.frameIndex,
    syncStatus: latest.syncStatus,
    detectionStatus: latest.detectionStatus,
    temperatureDeltaMs: latest.temperatureDeltaMs,
    tempSyncTargetMs: latest.tempSyncTargetMs,
  });
}

function buildAnalysisEmptyState(analysis: AnalysisCurveSource): TrendEmptyState | null {
  const frames = analysis.all_frames ?? [];
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    const syncStatus = readString(frame.temperature_sync_status);
    const detectionStatus = readString(frame.detection_status);
    const hasTemperature = readFiniteNumber(frame.temperature_celsius) !== null;
    const hasDistance = readFiniteNumber(frame.distance_px) !== null;
    if (!hasTemperature && !hasDistance) continue;
    if (isDetectionStatusValid(detectionStatus) && isSyncStatusFormal(syncStatus)) continue;
    return trendEmptyStateFromDiagnostic({
      frameIndex: Math.round(readFiniteNumber(frame.frame_index) ?? NaN) || null,
      syncStatus,
      detectionStatus,
      temperatureDeltaMs: readFiniteNumber(frame.temperature_delta_ms),
      tempSyncTargetMs: readFiniteNumber(frame.temp_sync_target_ms) ?? readTempSyncTargetMs(analysis),
    });
  }
  return null;
}

function trendEmptyStateFromDiagnostic(input: {
  frameIndex: number | null;
  syncStatus: string | null;
  detectionStatus: string | null;
  temperatureDeltaMs: number | null;
  tempSyncTargetMs: number | null;
}): TrendEmptyState {
  const diagnostics = [
    input.syncStatus ? `Current sync status: ${input.syncStatus}` : "",
    input.temperatureDeltaMs !== null ? `Delta=${input.temperatureDeltaMs.toFixed(0)} ms` : "",
    input.tempSyncTargetMs !== null ? `tolerance=${input.tempSyncTargetMs.toFixed(0)} ms` : "",
  ].filter(Boolean).join(", ");
  return {
    kind: "status_rugs_only",
    title: "No formal temperature-distance points",
    detail: `The status markers below the x axis are diagnostics and are not used for formal analysis.${diagnostics ? ` ${diagnostics}.` : ""}`,
    syncStatus: input.syncStatus,
    detectionStatus: input.detectionStatus,
    frameIndex: input.frameIndex,
    temperatureDeltaMs: input.temperatureDeltaMs,
    tempSyncTargetMs: input.tempSyncTargetMs,
  };
}

function readTempSyncTargetMs(analysis: AnalysisCurveSource): number | null {
  return readFiniteNumber(analysis.sync_config?.temp_sync_target_ms) ??
    readFiniteNumber(analysis.config_snapshot?.temp_sync_target_ms);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function formatSyncStatusShort(status: string | null): string {
  if (status === "TEMP_SYNC_STALE") return "Stale";
  if (status === "TEMP_SYNC_MISSING") return "Missing";
  if (status === "TEMP_SYNC_INTERPOLATED") return "Interpolated";
  if (status === "TEMP_SYNC_OK") return "OK";
  return status || "Sync";
}

function formatRunTrendTick(value: number, range: { min: number; max: number }): string {
  const span = Math.abs(range.max - range.min);
  if (span < 1) return value.toFixed(2);
  if (span < 10) return value.toFixed(1);
  return formatTick(value);
}

export function buildAnalysisAfasModel(
  analysis: AnalysisCurveSource,
  options: AnalysisAfasModelOptions
): AnalysisAfasModel {
  const width = options.width;
  const height = options.height;
  const padding = { top: 42, right: 40, bottom: 74, left: 82 };
  const plot = {
    left: padding.left,
    right: width - padding.right,
    top: padding.top,
    bottom: height - padding.bottom
  };
  const layers: AnalysisAfasLayerState = {
    ...DEFAULT_ANALYSIS_AFAS_LAYERS,
    ...(options.layers ?? {})
  };
  const rawData = readAfasRawData(analysis);
  const smoothedData = readAfasSmoothedData(analysis);
  const outlierData = readAfasOutlierData(analysis);
  const overlays = readAfasOverlays(analysis) ?? { lines: [], markers: [] };
  const markerData = readAfasMarkerData(overlays.markers);
  const xDomain = normalizeAnalysisDomain(options.xDomain);
  const xValues = xDomain ? [] : [
    ...rawData.map((point) => point.temperature),
    ...smoothedData.map((point) => point.temperature),
    ...outlierData.map((point) => point.temperature),
    ...overlays.lines.flatMap((line) => line.range ?? []),
    ...markerData.map((marker) => marker.temperature)
  ].filter(Number.isFinite);
  const xRange = xDomain ?? paddedRange(
    xValues.length ? Math.min(...xValues) : 0,
    xValues.length ? Math.max(...xValues) : 1
  );
  const visibleRawData = layers.raw ? rawData.filter((point) => valueInRange(point.temperature, xRange)) : [];
  const visibleOutlierData = layers.raw ? outlierData.filter((point) => valueInRange(point.temperature, xRange)) : [];
  const visibleSmoothedData = smoothedData.filter((point) => valueInRange(point.temperature, xRange));
  const visibleNonOutlierRawData = excludeAnalysisAfasOutlierPoints(visibleRawData, visibleOutlierData);
  const yAxisData = visibleSmoothedData.length
    ? [...visibleSmoothedData, ...visibleNonOutlierRawData]
    : visibleNonOutlierRawData;
  const fallbackYData = yAxisData.length ? yAxisData : visibleRawData;
  const yValues = fallbackYData.map((point) => point.distance).filter(Number.isFinite);
  const yRange = buildAnalysisAfasYAxisRange(yValues);
  const rawPoints = visibleRawData.map((point) => scaleAfasPoint(point, xRange, yRange, plot, { clampY: true }));
  const outlierPoints = visibleOutlierData.map((point) => scaleAfasPoint(point, xRange, yRange, plot, { clampY: true }));
  const smoothedPoints = visibleSmoothedData.map((point) => scaleAfasPoint(point, xRange, yRange, plot));
  const smoothedPath = smoothedPoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const fitLines = layers.fit
    ? overlays.lines
      .flatMap((line) => buildAnalysisAfasFitLine(line, xRange, yRange, plot))
    : [];
  const constructionGuides = layers.fit
    ? buildAnalysisAfasConstructionGuides(markerData, overlays.lines, xRange, yRange, plot)
    : [];
  const markers = layers.markers
    ? buildAnalysisAfasMarkers(markerData, xRange, yRange, plot, width)
    : [];
  const xTicks = buildTicks(xRange.min, xRange.max, 5).map((value) => ({
    value,
    position: scaleLinear(value, xRange.min, xRange.max, plot.left, plot.right),
    label: formatRunTrendTick(value, xRange)
  }));
  const yTicks = buildTicks(yRange.min, yRange.max, 5).map((value) => ({
    value,
    position: scaleLinear(value, yRange.min, yRange.max, plot.bottom, plot.top),
    label: formatRunTrendTick(value, yRange)
  }));
  const hasPoints = smoothedPoints.length > 0 || rawPoints.length > 0;

  return {
    width,
    height,
    padding,
    plot,
    layers,
    rawPoints,
    outlierPoints,
    smoothedPoints,
    smoothedPath,
    fitLines,
    constructionGuides,
    markers,
    xTicks,
    yTicks,
    xAxisLabel: "Temperature (°C)",
    yAxisLabel: "Distance (px)",
    xRange,
    yRange,
    summary: buildAnalysisAfasSummary(analysis, rawData.length, smoothedData.length),
    constructionNote: buildAnalysisAfasConstructionNote(analysis),
    emptyState: hasPoints ? null : buildAnalysisEmptyState(analysis),
    hasPoints
  };
}

type AnalysisAfasRawPoint = {
  temperature: number;
  distance: number;
  frameIndex: number | null;
};

type AnalysisAfasMarkerData = {
  kind: CurveOverlayMarkerSpec["kind"];
  label: string;
  valueLabel: string;
  temperature: number;
  distance: number;
};

function readAfasRawData(analysis: AnalysisCurveSource): AnalysisAfasRawPoint[] {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const raw = readRecord(preprocessing.raw);
  const rawPoints = readAfasSeries(raw.temperature_celsius, raw.values, raw.frame_indexes);
  if (rawPoints.length) return rawPoints;
  return analysis.temperature_distance.flatMap((point, index) => {
    const temperature = readFiniteNumber(point.x);
    const distance = readFiniteNumber(point.y);
    if (temperature === null || distance === null || !isSyncStatusFormal(readString(point.sync_status))) return [];
    return [{
      temperature,
      distance,
      frameIndex: Math.round(readFiniteNumber(point.frame_index) ?? index + 1)
    }];
  });
}

function readAfasSmoothedData(analysis: AnalysisCurveSource): AnalysisAfasRawPoint[] {
  const smoothed = readPreprocessedTemperatureDistance(analysis, "smoothed");
  const grouped = readPreprocessedTemperatureDistance(analysis, "grouped");
  const source = smoothed && smoothed.length ? smoothed : grouped;
  if (!source?.length) return [];
  return source.flatMap((point) => {
    const temperature = readFiniteNumber(point.x);
    const distance = readFiniteNumber(point.y);
    if (temperature === null || distance === null) return [];
    return [{
      temperature,
      distance,
      frameIndex: null
    }];
  });
}

function readAfasOutlierData(analysis: AnalysisCurveSource): AnalysisAfasRawPoint[] {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const outlierRepair = readRecord(preprocessing.outlier_repair);
  const mask = readBooleanArray(outlierRepair.outlier_mask);
  if (!mask.length) return [];
  const grouped = readRecord(preprocessing.grouped);
  const raw = readRecord(preprocessing.raw);
  const source = seriesLengthMatches(grouped, mask.length) ? grouped : raw;
  const points = readAfasSeries(source.temperature_celsius, source.values, source.frame_indexes);
  return points.filter((_, index) => mask[index] === true);
}

function readAfasSeries(
  temperatures: unknown,
  values: unknown,
  frameIndexes: unknown
): AnalysisAfasRawPoint[] {
  if (!Array.isArray(temperatures) || !Array.isArray(values)) return [];
  const frames = Array.isArray(frameIndexes) ? frameIndexes : [];
  return temperatures.flatMap((temperature, index) => {
    const distance = values[index];
    const tempValue = readFiniteNumber(temperature);
    const distanceValue = readFiniteNumber(distance);
    if (tempValue === null || distanceValue === null) return [];
    return [{
      temperature: tempValue,
      distance: distanceValue,
      frameIndex: Math.round(readFiniteNumber(frames[index]) ?? NaN) || null
    }];
  });
}

function seriesLengthMatches(series: Record<string, unknown>, length: number): boolean {
  return Array.isArray(series.temperature_celsius) && Array.isArray(series.values) &&
    series.temperature_celsius.length === length &&
    series.values.length === length;
}

function readBooleanArray(value: unknown): boolean[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item === true);
}

function readAfasMarkerData(markers: CurveOverlayMarkerSpec[]): AnalysisAfasMarkerData[] {
  return markers.flatMap((marker) => {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) return [];
    return [{
      kind: marker.kind,
      label: marker.label,
      valueLabel: marker.kind === "max_slope" ? "Max slope point" : `${marker.label} ${marker.x.toFixed(2)}°C`,
      temperature: marker.x,
      distance: marker.y
    }];
  });
}

function normalizeAnalysisDomain(value: [number, number] | null | undefined): { min: number; max: number } | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = readFiniteNumber(value[0]);
  const end = readFiniteNumber(value[1]);
  if (start === null || end === null || Math.abs(start - end) < Number.EPSILON) return null;
  return { min: Math.min(start, end), max: Math.max(start, end) };
}

function valueInRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function excludeAnalysisAfasOutlierPoints(
  points: AnalysisAfasRawPoint[],
  outliers: AnalysisAfasRawPoint[]
): AnalysisAfasRawPoint[] {
  if (!points.length || !outliers.length) return points;
  return points.filter((point) => !outliers.some((outlier) => analysisAfasPointsMatch(point, outlier)));
}

function analysisAfasPointsMatch(point: AnalysisAfasRawPoint, outlier: AnalysisAfasRawPoint): boolean {
  if (point.frameIndex !== null && outlier.frameIndex !== null) {
    return point.frameIndex === outlier.frameIndex;
  }
  return Math.abs(point.temperature - outlier.temperature) < 1e-9;
}

function scaleAfasPoint(
  point: AnalysisAfasRawPoint,
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"],
  options: { clampY?: boolean } = {}
): AnalysisAfasDataPoint {
  const distance = options.clampY
    ? Math.min(yRange.max, Math.max(yRange.min, point.distance))
    : point.distance;
  return {
    ...point,
    x: scaleLinear(point.temperature, xRange.min, xRange.max, plot.left, plot.right),
    y: scaleLinear(distance, yRange.min, yRange.max, plot.bottom, plot.top)
  };
}

function buildAnalysisAfasFitLine(
  line: CurveOverlayLineSpec,
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"]
): AnalysisAfasFitLine[] {
  const raw = rawOverlayLineSegments([line], xRange)
    .map((segment) => clipOverlayLineToYRange(segment, yRange))
    .filter((segment): segment is RawOverlayLineSegment => segment !== null)[0];
  if (!raw) return [];
  const x1 = scaleLinear(raw.x1, xRange.min, xRange.max, plot.left, plot.right);
  const y1 = scaleLinear(raw.y1, yRange.min, yRange.max, plot.bottom, plot.top);
  const x2 = scaleLinear(raw.x2, xRange.min, xRange.max, plot.left, plot.right);
  const y2 = scaleLinear(raw.y2, yRange.min, yRange.max, plot.bottom, plot.top);
  return [{
    kind: raw.kind,
    label: raw.label,
    dataRange: raw.range ?? null,
    x1,
    y1,
    x2,
    y2,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2
  }];
}

function buildAnalysisAfasConstructionGuides(
  markers: AnalysisAfasMarkerData[],
  lines: CurveOverlayLineSpec[],
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"]
): AnalysisAfasConstructionGuide[] {
  void lines;
  void yRange;
  return markers
    .filter((marker) => marker.kind === "as" || marker.kind === "af_tan" || marker.kind === "max_slope")
    .filter((marker) => valueInRange(marker.temperature, xRange))
    .map((marker) => buildAnalysisAfasConstructionGuide(marker, xRange, plot));
}

function buildAnalysisAfasConstructionGuide(
  marker: AnalysisAfasMarkerData,
  xRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"]
): AnalysisAfasConstructionGuide {
  const x = scaleLinear(marker.temperature, xRange.min, xRange.max, plot.left, plot.right);
  const kind = marker.kind === "as"
    ? "as_vertical"
    : marker.kind === "af_tan"
      ? "af_vertical"
      : "max_slope_vertical";
  const label = marker.kind === "as"
    ? "AS"
    : marker.kind === "af_tan"
      ? "AF"
      : "Max slope point";
  return {
    kind,
    label,
    role: "AFAS construction guide",
    temperature: marker.temperature,
    distance: marker.distance,
    x1: x,
    y1: plot.top,
    x2: x,
    y2: plot.bottom,
    labelX: x,
    labelY: marker.kind === "max_slope" ? plot.top + 54 : plot.top + 28
  };
}

function buildAnalysisAfasMarkers(
  markers: AnalysisAfasMarkerData[],
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"],
  chartWidth: number
): AnalysisAfasMarker[] {
  const scaled = markers
    .filter((marker) => valueInRange(marker.temperature, xRange))
    .map((marker) => scaleAfasMarker(marker, xRange, yRange, plot));
  const referenceMarkers = scaled.filter((marker) => marker.kind === "as" || marker.kind === "af_tan");
  const labelBoxes = new Map<CurveOverlayMarkerSpec["kind"], AnalysisAfasLabelBox>();
  for (const marker of referenceMarkers) {
    const preferredRow = marker.kind === "as" ? 0 : 1;
    labelBoxes.set(marker.kind, buildAfasMarkerLabelBox(marker, plot, chartWidth, preferredRow));
  }
  const asBox = labelBoxes.get("as");
  const afBox = labelBoxes.get("af_tan");
  if (asBox && afBox && boxesOverlap(asBox, afBox)) {
    labelBoxes.set("af_tan", buildAfasMarkerLabelBox(
      scaled.find((marker) => marker.kind === "af_tan") ?? referenceMarkers[0],
      plot,
      chartWidth,
      2
    ));
  }
  return scaled.map((marker) => ({
    ...marker,
    labelBox: labelBoxes.get(marker.kind) ?? null
  }));
}

function scaleAfasMarker(
  marker: AnalysisAfasMarkerData,
  xRange: { min: number; max: number },
  yRange: { min: number; max: number },
  plot: AnalysisAfasModel["plot"]
): AnalysisAfasMarker {
  const yClipped = marker.distance < yRange.min || marker.distance > yRange.max;
  return {
    ...marker,
    x: scaleLinear(marker.temperature, xRange.min, xRange.max, plot.left, plot.right),
    y: scaleLinear(
      Math.min(yRange.max, Math.max(yRange.min, marker.distance)),
      yRange.min,
      yRange.max,
      plot.bottom,
      plot.top
    ),
    yClipped,
    labelBox: null
  };
}

function buildAfasMarkerLabelBox(
  marker: AnalysisAfasMarker,
  plot: AnalysisAfasModel["plot"],
  chartWidth: number,
  row: number
): AnalysisAfasLabelBox {
  const textWidth = estimateSvgTextWidth(marker.valueLabel, AFAS_MARKER_LABEL_FONT_PX);
  const width = Math.ceil(textWidth + AFAS_MARKER_LABEL_PADDING_X * 2);
  const height = AFAS_MARKER_LABEL_HEIGHT;
  const x = clampNumber(marker.x - width / 2, 4, Math.max(4, chartWidth - width - 4));
  const y = Math.min(
    plot.bottom - height - 4,
    plot.top + 10 + Math.max(0, row) * (height + 6)
  );
  return {
    text: marker.valueLabel,
    x,
    y,
    width,
    height,
    textX: x + width / 2,
    textY: y + height / 2 + 4,
    textWidth,
    paddingX: AFAS_MARKER_LABEL_PADDING_X,
    paddingY: AFAS_MARKER_LABEL_PADDING_Y,
    fillOpacity: 1,
    clipPath: null
  };
}

function estimateSvgTextWidth(text: string, fontSizePx: number): number {
  let width = 0;
  for (const character of text) {
    width += /[A-Z0-9.°C]/.test(character) ? fontSizePx * 0.62 : fontSizePx * 0.5;
  }
  return Math.ceil(width);
}

function boxesOverlap(a: AnalysisAfasLabelBox, b: AnalysisAfasLabelBox): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0 && overlapY > 0;
}

function buildAnalysisAfasSummary(
  analysis: AnalysisCurveSource,
  rawCount: number,
  smoothedCount: number
): AnalysisAfasSummary {
  const afas = readRecord(analysis.afas_analysis);
  const result = readRecord(afas.result);
  const fit = readRecord(afas.fit);
  const asValue = readFiniteNumber(result.As);
  const afTan = readAfasAfValue(result);
  const maxSlope = readFiniteNumber(result.max_slope_temp) ?? readFiniteNumber(fit.max_slope_temperature_celsius);
  const outlierCount = readFiniteNumber(afas.outlier_count) ??
    readFiniteNumber(readRecord(readRecord(analysis.afas_preprocessing).outlier_repair).outlier_count);
  return {
    status: readString(afas.result_status) ?? "unavailable",
    asLabel: formatAnalysisAfasTemperature(asValue),
    afLabel: formatAnalysisAfasTemperature(afTan),
    afTanLabel: formatAnalysisAfasTemperature(afTan),
    deltaLabel: asValue !== null && afTan !== null ? `${(afTan - asValue).toFixed(2)} °C` : "None",
    maxSlopeLabel: formatAnalysisAfasTemperature(maxSlope),
    outlierLabel: outlierCount === null ? "None" : `${Math.round(outlierCount)}`,
    rawCountLabel: rawCount.toLocaleString(),
    smoothedCountLabel: smoothedCount.toLocaleString()
  };
}

function formatAnalysisAfasTemperature(value: number | null): string {
  return value === null ? "None" : `${value.toFixed(2)} °C`;
}

function readAfasOverlays(analysis: AnalysisCurveSource): CurveOverlaySpec | undefined {
  const afas = analysis.afas_analysis;
  if (!afas || typeof afas !== "object") return undefined;
  const fit = readRecord((afas as { fit?: unknown }).fit);
  const result = readRecord((afas as { result?: unknown }).result);
  const asValue = readFiniteNumber(result.As);
  const afTan = readAfasAfValue(result);
  const lowBaseline = extendBaselineToMarker(
    readLine(fit.low_baseline, "low_baseline", "AS baseline / Low baseline"),
    asValue,
    "low"
  );
  const highBaseline = extendBaselineToMarker(
    readLine(fit.high_baseline, "high_baseline", "AF baseline / High baseline"),
    afTan,
    "high"
  );
  const tangent = readLine(fit.tangent, "tangent", "Maximum slope tangent");
  const lines = [lowBaseline, highBaseline, tangent].filter((line): line is CurveOverlayLineSpec => line !== null);
  const tangentLine = tangent;
  const markers: CurveOverlayMarkerSpec[] = [];
  if (tangentLine) {
    if (asValue !== null) {
      markers.push({
        kind: "as",
        label: "AS",
        x: asValue,
        y: tangentLine.slope * asValue + tangentLine.intercept
      });
    }
    if (afTan !== null) {
      markers.push({
        kind: "af_tan",
        label: "AF",
        x: afTan,
        y: tangentLine.slope * afTan + tangentLine.intercept
      });
    }
  }
  const maxSlopeTemperature = readFiniteNumber(fit.max_slope_temperature_celsius);
  const maxSlopeValue = readFiniteNumber(fit.max_slope_value);
  if (maxSlopeTemperature !== null && maxSlopeValue !== null) {
    markers.push({
      kind: "max_slope",
      label: "Max slope point",
      x: maxSlopeTemperature,
      y: maxSlopeValue
    });
  }
  return lines.length || markers.length ? { lines, markers } : undefined;
}

function buildAnalysisAfasConstructionNote(analysis: AnalysisCurveSource): string | null {
  const afas = readRecord(analysis.afas_analysis);
  const result = readRecord(afas.result);
  const status = readString(afas.result_status);
  const asValue = readFiniteNumber(result.As);
  const afValue = readAfasAfValue(result);
  if (status !== "ok" && (asValue === null || afValue === null)) return null;
  return "AS = maximum slope tangent × low-temperature baseline; AF = maximum slope tangent × high-temperature baseline. Low/high baselines come from linear fits in their temperature ranges.";
}

function readAfasAfValue(result: Record<string, unknown>): number | null {
  return readFiniteNumber(result.Af_tan) ??
    readFiniteNumber(result.AF) ??
    readFiniteNumber(result.Af) ??
    readFiniteNumber(result.af_tan);
}

function extendBaselineToMarker(
  line: CurveOverlayLineSpec | null,
  markerTemperature: number | null,
  side: "low" | "high"
): CurveOverlayLineSpec | null {
  if (!line || markerTemperature === null) return line;
  const range = line.range;
  if (!range) return line;
  const low = Math.min(range[0], range[1]);
  const high = Math.max(range[0], range[1]);
  return {
    ...line,
    range: side === "low"
      ? [Math.min(low, markerTemperature), Math.max(low, markerTemperature)]
      : [Math.min(high, markerTemperature), Math.max(high, markerTemperature)]
  };
}

function readLine(value: unknown, kind: CurveOverlayLineSpec["kind"], label: string): CurveOverlayLineSpec | null {
  const record = readRecord(value);
  const slope = readFiniteNumber(record.slope);
  const intercept = readFiniteNumber(record.intercept);
  if (slope === null || intercept === null) return null;
  return {
    kind,
    label,
    slope,
    intercept,
    range: readRange(record.range_celsius)
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = readFiniteNumber(value[0]);
  const end = readFiniteNumber(value[1]);
  if (start === null || end === null) return null;
  return [start, end];
}

export function buildCurveViewModel(
  spec: CurveSpec,
  width: number,
  height: number
): CurveViewModel {
  const padding = { top: 18, right: 18, bottom: 46, left: 58 };
  const plot = {
    left: padding.left,
    right: width - padding.right,
    top: padding.top,
    bottom: height - padding.bottom
  };
  const normalized = normalizeCurvePoints(spec);
  const xAxisLabel = resolveXAxisLabel(spec, normalized.usedTimestampAxis);
  const yAxisLabel = spec.yAxisLabel;
  if (normalized.points.length === 0) {
    const xTicks = buildTicks(0, 1, 4).map((value) => ({
      value,
      position: scaleLinear(value, 0, 1, plot.left, plot.right),
      label: formatTick(value)
    }));
    const yTicks = buildTicks(0, 1, 4).map((value) => ({
      value,
      position: scaleLinear(value, 0, 1, plot.bottom, plot.top),
      label: formatTick(value)
    }));
    return {
      width,
      height,
      padding,
      plot,
      polyline: "",
      referencePoints: [],
      overlayLines: [],
      overlayMarkers: [],
      xTicks,
      yTicks,
      xAxisLabel,
      yAxisLabel,
      hasPoints: false
    };
  }

  const xs = normalized.points.map((point) => point.x);
  const ys = normalized.points.map((point) => point.y);
  const referencePoints = normalizeReferencePoints(spec);
  const referenceXs = referencePoints.map((point) => point.x);
  const referenceYs = referencePoints.map((point) => point.y);
  const overlayXValues = overlayDataXValues(spec.overlays, xs);
  const xRange = paddedRange(
    Math.min(...xs, ...referenceXs, ...overlayXValues),
    Math.max(...xs, ...referenceXs, ...overlayXValues)
  );
  const rawOverlayLines = rawOverlayLineSegments(spec.overlays?.lines ?? [], xRange);
  const yRange = paddedRange(
    Math.min(...ys, ...referenceYs),
    Math.max(...ys, ...referenceYs)
  );
  const clippedOverlayLines = rawOverlayLines
    .map((line) => clipOverlayLineToYRange(line, yRange))
    .filter((line): line is RawOverlayLineSegment => line !== null);
  const rawOverlayMarkers = (spec.overlays?.markers ?? [])
    .filter((marker) => markerInsideRange(marker, xRange, yRange));
  const polyline = normalized.points
    .map((point) => {
      const x = scaleLinear(point.x, xRange.min, xRange.max, plot.left, plot.right);
      const y = scaleLinear(point.y, yRange.min, yRange.max, plot.bottom, plot.top);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const scaledReferencePoints = referencePoints.map((point) => ({
    x: scaleLinear(point.x, xRange.min, xRange.max, plot.left, plot.right),
    y: scaleLinear(point.y, yRange.min, yRange.max, plot.bottom, plot.top)
  }));
  const overlayLines = clippedOverlayLines.map((line) => ({
    kind: line.kind,
    label: line.label,
    x1: scaleLinear(line.x1, xRange.min, xRange.max, plot.left, plot.right),
    y1: scaleLinear(line.y1, yRange.min, yRange.max, plot.bottom, plot.top),
    x2: scaleLinear(line.x2, xRange.min, xRange.max, plot.left, plot.right),
    y2: scaleLinear(line.y2, yRange.min, yRange.max, plot.bottom, plot.top)
  }));
  const overlayMarkers = rawOverlayMarkers.map((marker) => ({
    kind: marker.kind,
    label: marker.label,
    x: scaleLinear(marker.x, xRange.min, xRange.max, plot.left, plot.right),
    y: scaleLinear(marker.y, yRange.min, yRange.max, plot.bottom, plot.top)
  }));
  const xTicks = buildTicks(xRange.min, xRange.max, 4).map((value) => ({
    value,
    position: scaleLinear(value, xRange.min, xRange.max, plot.left, plot.right),
    label: formatTick(value)
  }));
  const yTicks = buildTicks(yRange.min, yRange.max, 4).map((value) => ({
    value,
    position: scaleLinear(value, yRange.min, yRange.max, plot.bottom, plot.top),
    label: formatTick(value)
  }));

  return {
    width,
    height,
    padding,
    plot,
    polyline,
    referencePoints: scaledReferencePoints,
    overlayLines,
    overlayMarkers,
    xTicks,
    yTicks,
    xAxisLabel,
    yAxisLabel,
    hasPoints: true
  };
}

function normalizeReferencePoints(spec: CurveSpec): Array<{ x: number; y: number }> {
  return (spec.referencePoints ?? [])
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function overlayDataXValues(overlays: CurveOverlaySpec | undefined, pointXs: number[]): number[] {
  if (!overlays) return [];
  const fallbackMin = pointXs.length ? Math.min(...pointXs) : 0;
  const fallbackMax = pointXs.length ? Math.max(...pointXs) : 1;
  return [
    ...overlays.lines.flatMap((line) => line.range ?? [fallbackMin, fallbackMax]),
    ...overlays.markers.map((marker) => marker.x)
  ];
}

function rawOverlayLineSegments(
  lines: CurveOverlayLineSpec[],
  xRange: { min: number; max: number }
): RawOverlayLineSegment[] {
  return lines
    .map((line) => {
      const range = line.range ?? [xRange.min, xRange.max];
      const x1 = Math.max(xRange.min, Math.min(range[0], range[1]));
      const x2 = Math.min(xRange.max, Math.max(range[0], range[1]));
      return {
        ...line,
        x1,
        y1: line.slope * x1 + line.intercept,
        x2,
        y2: line.slope * x2 + line.intercept
      };
    })
    .filter((line) => [line.x1, line.x2, line.y1, line.y2].every(Number.isFinite));
}

function clipOverlayLineToYRange(
  line: RawOverlayLineSegment,
  yRange: { min: number; max: number }
): RawOverlayLineSegment | null {
  if (![line.x1, line.y1, line.x2, line.y2, yRange.min, yRange.max].every(Number.isFinite)) {
    return null;
  }
  if ((line.y1 < yRange.min && line.y2 < yRange.min) || (line.y1 > yRange.max && line.y2 > yRange.max)) {
    return null;
  }
  if (Math.abs(line.y2 - line.y1) < Number.EPSILON) {
    return line.y1 >= yRange.min && line.y1 <= yRange.max ? line : null;
  }

  let x1 = line.x1;
  let y1 = line.y1;
  let x2 = line.x2;
  let y2 = line.y2;
  const xAtY = (targetY: number) => line.x1 + ((targetY - line.y1) * (line.x2 - line.x1)) / (line.y2 - line.y1);

  if (y1 < yRange.min || y1 > yRange.max) {
    y1 = y1 < yRange.min ? yRange.min : yRange.max;
    x1 = xAtY(y1);
  }
  if (y2 < yRange.min || y2 > yRange.max) {
    y2 = y2 < yRange.min ? yRange.min : yRange.max;
    x2 = xAtY(y2);
  }

  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { ...line, x1, y1, x2, y2 };
}

function markerInsideRange(
  marker: CurveOverlayMarkerSpec,
  xRange: { min: number; max: number },
  yRange: { min: number; max: number }
): boolean {
  return (
    Number.isFinite(marker.x) &&
    Number.isFinite(marker.y) &&
    marker.x >= xRange.min &&
    marker.x <= xRange.max &&
    marker.y >= yRange.min &&
    marker.y <= yRange.max
  );
}

function normalizeCurvePoints(spec: CurveSpec): {
  points: Array<{ x: number; y: number }>;
  usedTimestampAxis: boolean;
} {
  const points = spec.points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (spec.xAxis.kind !== "elapsed_time" || points.length === 0) {
    return { points, usedTimestampAxis: false };
  }
  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX;
  const looksLikeTimestampMs = xs.some((x) => Math.abs(x) >= 100_000) || span >= 1_000;
  if (!looksLikeTimestampMs) {
    return { points, usedTimestampAxis: false };
  }
  return {
    points: points.map((point) => ({ x: (point.x - minX) / 1_000, y: point.y })),
    usedTimestampAxis: true
  };
}

function resolveXAxisLabel(spec: CurveSpec, usedTimestampAxis: boolean): string {
  if (spec.xAxis.kind === "raw") return spec.xAxis.label;
  return usedTimestampAxis ? spec.xAxisLabel : spec.xAxis.frameFallbackLabel;
}

function paddedRange(min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (Math.abs(max - min) < Number.EPSILON) {
    const span = Math.max(1, Math.abs(min) * 0.08);
    return { min: min - span, max: max + span };
  }
  const span = max - min;
  const pad = span * 0.08;
  return { min: min - pad, max: max + pad };
}

function ensureMinimumRangeSpan(
  range: RunTrendYAxisRange,
  minSpan: number,
  center: number
): RunTrendYAxisRange {
  const span = range.max - range.min;
  if (Number.isFinite(span) && span >= minSpan) return range;
  const safeCenter = Number.isFinite(center) ? center : (range.min + range.max) / 2;
  const halfSpan = minSpan / 2;
  return {
    min: safeCenter - halfSpan,
    max: safeCenter + halfSpan
  };
}

function observedRange(values: number[]): RunTrendYAxisRange {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return { min: Number.NaN, max: Number.NaN };
  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues)
  };
}

function filterIsolatedDisplayYOutliers(values: number[]): number[] {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length < 4) return finiteValues;

  const center = median(finiteValues);
  const deviations = finiteValues.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  const threshold = Math.max(
    DISPLAY_Y_AXIS_OUTLIER_MIN_DEVIATION_PX,
    mad * DISPLAY_Y_AXIS_OUTLIER_MAD_MULTIPLIER
  );
  const filtered = finiteValues.filter((value) => Math.abs(value - center) <= threshold);
  return filtered.length >= 2 ? filtered : finiteValues;
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function isFiniteRange(range: RunTrendYAxisRange): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min;
}

function isFiniteObservedRange(range: RunTrendYAxisRange): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max >= range.min;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildTicks(min: number, max: number, targetCount: number): number[] {
  const range = paddedRange(min, max);
  const span = range.max - range.min;
  if (!Number.isFinite(span) || span <= 0) {
    return [0, 1];
  }
  const rawStep = span / Math.max(1, targetCount);
  const step = niceStep(rawStep);
  if (!Number.isFinite(step) || step <= 0) {
    return [range.min, range.max].filter(Number.isFinite);
  }
  const start = Math.ceil(range.min / step) * step;
  const ticks: number[] = [];
  for (let value = start, guard = 0; value <= range.max + step * 0.5 && guard < 24; value += step, guard += 1) {
    ticks.push(Number(value.toFixed(12)));
  }
  if (ticks.length < 2) {
    ticks.push(range.min, range.max);
  }
  return ticks.filter(Number.isFinite).slice(0, 6);
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  if (!Number.isFinite(magnitude) || magnitude <= 0) return rawStep;
  const fraction = rawStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function scaleLinear(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number
): number {
  if (Math.abs(domainMax - domainMin) < Number.EPSILON) {
    return (rangeMin + rangeMax) / 2;
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(decimals).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}
