export type CurveKey = "distance_time" | "temperature_time" | "temperature_distance";

export type CurvePointInput = {
  x: number;
  y: number;
  frame_index?: number;
  sync_status?: string | null;
};

export type AnalysisCurveSource = {
  distance_time: CurvePointInput[];
  temperature_time: CurvePointInput[];
  temperature_distance: CurvePointInput[];
  afas_preprocessing?: Record<string, unknown>;
  afas_analysis?: Record<string, unknown>;
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

const FORMAL_COLOR = "#0f766e";

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
  const preprocessing = analysis.afas_preprocessing;
  if (!preprocessing || typeof preprocessing !== "object") return null;
  const smoothed = (preprocessing as { smoothed?: unknown }).smoothed;
  if (!smoothed || typeof smoothed !== "object") return null;
  const temperatures = (smoothed as { temperature_celsius?: unknown }).temperature_celsius;
  const values = (smoothed as { values?: unknown }).values;
  if (!Array.isArray(temperatures) || !Array.isArray(values)) return null;
  const points = temperatures.flatMap((temperature, index) => {
    const value = values[index];
    if (typeof temperature !== "number" || typeof value !== "number") return [];
    if (!Number.isFinite(temperature) || !Number.isFinite(value)) return [];
    return [{ x: temperature, y: value, frame_index: index + 1, sync_status: null }];
  });
  return points.length ? points : null;
}

function readAfasOverlays(analysis: AnalysisCurveSource): CurveOverlaySpec | undefined {
  const afas = analysis.afas_analysis;
  if (!afas || typeof afas !== "object") return undefined;
  const fit = readRecord((afas as { fit?: unknown }).fit);
  const result = readRecord((afas as { result?: unknown }).result);
  const lowBaseline = readLine(fit.low_baseline, "low_baseline", "Low baseline");
  const highBaseline = readLine(fit.high_baseline, "high_baseline", "High baseline");
  const tangent = readLine(fit.tangent, "tangent", "Tangent");
  const lines = [lowBaseline, highBaseline, tangent].filter((line): line is CurveOverlayLineSpec => line !== null);
  const tangentLine = tangent;
  const markers: CurveOverlayMarkerSpec[] = [];
  if (tangentLine) {
    const asValue = readFiniteNumber(result.As);
    const afTan = readFiniteNumber(result.Af_tan);
    if (asValue !== null) {
      markers.push({
        kind: "as",
        label: "As",
        x: asValue,
        y: tangentLine.slope * asValue + tangentLine.intercept
      });
    }
    if (afTan !== null) {
      markers.push({
        kind: "af_tan",
        label: "Af-tan",
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
      label: "Max slope",
      x: maxSlopeTemperature,
      y: maxSlopeValue
    });
  }
  return lines.length || markers.length ? { lines, markers } : undefined;
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
