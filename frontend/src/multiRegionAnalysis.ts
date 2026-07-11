import type {
  CurvePoint,
  DetectionResult,
  LiveOfflineFrameEvent,
  LivePointStatus,
  MeasurementDefinition,
  MeasurementRegion,
  RegionResult
} from "./api/client";

export type RegionLiveState = {
  regionId: string;
  regionIndex: number;
  regionLabel: string;
  color: string;
  latestResult: RegionResult | null;
  allFrames: DetectionResult[];
  temperatureDistance: CurvePoint[];
  displayTemperatureDistance: CurvePoint[];
  formalPointCount: number;
  lastFormalFrameIndex: number | null;
  latestMissingReason: string;
};

export type RegionLiveStateById = Record<string, RegionLiveState>;

export type RegionTrendSource = {
  region_id: string;
  region_index: number;
  region_label: string;
  color: string;
  temperature_distance?: CurvePoint[];
  temperatureDistance?: CurvePoint[];
  displayTemperatureDistance?: CurvePoint[];
  all_frames?: DetectionResult[];
  allFrames?: DetectionResult[];
  afas_preprocessing?: Record<string, unknown>;
};

export type MultiRegionTrendPoint = {
  frameIndex: number | null;
  temperature: number;
  distance: number;
  detectionStatus: string | null;
  syncStatus: string | null;
  x: number;
  y: number;
};

export type MultiRegionTrendSeries = {
  regionId: string;
  regionIndex: number;
  regionLabel: string;
  color: string;
  points: MultiRegionTrendPoint[];
  rawPoints: MultiRegionTrendPoint[];
  afasPoints: MultiRegionTrendPoint[];
  path: string;
  afasPath: string;
  latestPoint: MultiRegionTrendPoint | null;
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
};

export type MultiRegionTrendModel = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  xTicks: Array<{ value: number; label: string; position: number }>;
  yTicks: Array<{ value: number; label: string; position: number }>;
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
  xAxisLabel: "Temperature (°C)";
  yAxisLabel: "Distance (px)";
  series: MultiRegionTrendSeries[];
  legend: Array<{
    regionId: string;
    regionLabel: string;
    color: string;
    visible: boolean;
    pointCount: number;
  }>;
  hasPoints: boolean;
};

export type MultiRegionTrendOptions = {
  width: number;
  height: number;
  visibleRegionIds?: Set<string>;
  displaySmoothing?: { enabled?: boolean; windowSize?: number };
  maxPointsPerRegion?: number;
  layers?: {
    formalPoints: boolean;
    displayTrend: boolean;
    afasSmoothed: boolean;
  };
};

export function emptyRegionLiveState(
  measurement: MeasurementDefinition
): RegionLiveStateById {
  const regions = measurement.regions?.length
    ? measurement.regions
    : [{
        region_id: "region_1",
        index: 1,
        label: "位置 1",
        enabled: true,
        roi: measurement.roi,
        color: "#ef4444"
      }];
  return Object.fromEntries(
    regions.filter((region) => region.enabled).map((region) => [
      region.region_id,
      emptyRegionState(region)
    ])
  );
}

export function appendRegionFrameEvent(
  previous: RegionLiveStateById,
  event: Pick<
    LiveOfflineFrameEvent,
    "region_results" | "detection_result" | "curve_points" | "live_point_status"
  >,
  options: { smoothingWindowSize?: number } = {}
): RegionLiveStateById {
  const next: RegionLiveStateById = { ...previous };
  for (const result of event.region_results) {
    const current = next[result.region_id] ?? emptyRegionState(regionFromResult(result));
    const formalPoint = result.curve_points.temperature_distance;
    const temperatureDistance = formalPoint
      ? appendUniqueCurvePoint(current.temperatureDistance, formalPoint)
      : current.temperatureDistance;
    const lastFormalPoint = temperatureDistance[temperatureDistance.length - 1] ?? null;
    next[result.region_id] = {
      ...current,
      regionId: result.region_id,
      regionIndex: result.region_index,
      regionLabel: result.region_label,
      color: result.color,
      latestResult: result,
      allFrames: appendUniqueDetection(current.allFrames, result.detection_result),
      temperatureDistance,
      displayTemperatureDistance: smoothDisplayPoints(
        temperatureDistance,
        options.smoothingWindowSize ?? 5
      ),
      formalPointCount: temperatureDistance.length,
      lastFormalFrameIndex: lastFormalPoint?.frame_index ?? current.lastFormalFrameIndex,
      latestMissingReason: formalPoint ? "" : result.live_point_status?.reason_if_missing ?? ""
    };
  }
  return next;
}

export function regionTrendSourcesFromLiveState(
  states: RegionLiveStateById
): RegionTrendSource[] {
  return Object.values(states)
    .sort((left, right) => left.regionIndex - right.regionIndex)
    .map((state) => ({
      region_id: state.regionId,
      region_index: state.regionIndex,
      region_label: state.regionLabel,
      color: state.color,
      temperatureDistance: state.temperatureDistance,
      displayTemperatureDistance: state.displayTemperatureDistance,
      allFrames: state.allFrames
    }));
}

export function buildMultiRegionTrendModel(
  sources: RegionTrendSource[],
  options: MultiRegionTrendOptions
): MultiRegionTrendModel {
  const width = options.width;
  const height = options.height;
  const plot = { left: 76, right: width - 28, top: 34, bottom: height - 64 };
  const visibleRegionIds = options.visibleRegionIds ?? new Set(sources.map((source) => source.region_id));
  const maxPoints = Math.max(20, Math.round(options.maxPointsPerRegion ?? 1200));
  const prepared = sources
    .filter((source) => visibleRegionIds.has(source.region_id))
    .sort((left, right) => left.region_index - right.region_index)
    .map((source) => {
      const rawPoints = source.temperatureDistance ?? source.temperature_distance ?? [];
      const displayPoints = source.displayTemperatureDistance?.length
        ? source.displayTemperatureDistance
        : options.displaySmoothing?.enabled
          ? smoothDisplayPoints(rawPoints, options.displaySmoothing.windowSize ?? 5)
          : rawPoints.map((point) => ({ ...point }));
      return {
        source,
        rawPoints,
        displayPoints: downsampleDisplayPoints(displayPoints, maxPoints),
        afasPoints: downsampleDisplayPoints(readAfasSmoothedPoints(source), maxPoints),
        frames: source.allFrames ?? source.all_frames ?? []
      };
    });
  const layers = options.layers ?? { formalPoints: true, displayTrend: true, afasSmoothed: true };
  const domainPoints = prepared.flatMap(({ rawPoints, displayPoints, afasPoints }) => [
    ...(layers.formalPoints ? rawPoints : []),
    ...(layers.displayTrend ? displayPoints : []),
    ...(layers.afasSmoothed ? afasPoints : [])
  ]);
  const xValues = domainPoints.map((point) => point.x);
  const yValues = domainPoints.map((point) => point.y);
  const xRange = paddedRange(xValues, 1);
  const yRange = paddedRange(yValues, 10);
  const series = prepared.map(({ source, rawPoints, displayPoints, afasPoints, frames }) => {
    const frameMap = new Map(frames.map((frame) => [frame.frame_index, frame]));
    const scalePoints = (input: CurvePoint[]) => input.flatMap((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
      const frame = frameMap.get(point.frame_index);
      return [{
        frameIndex: Number.isFinite(point.frame_index) ? point.frame_index : null,
        temperature: point.x,
        distance: point.y,
        detectionStatus: frame?.detection_status ?? null,
        syncStatus: point.sync_status ?? frame?.temperature_sync_status ?? null,
        x: scale(point.x, xRange, plot.left, plot.right),
        y: scale(point.y, yRange, plot.bottom, plot.top)
      }];
    });
    const points = scalePoints(displayPoints);
    const scaledRawPoints = scalePoints(rawPoints);
    const scaledAfasPoints = scalePoints(afasPoints);
    return {
      regionId: source.region_id,
      regionIndex: source.region_index,
      regionLabel: source.region_label,
      color: source.color,
      points,
      rawPoints: scaledRawPoints,
      afasPoints: scaledAfasPoints,
      path: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      afasPath: scaledAfasPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      latestPoint: points[points.length - 1] ?? null,
      xRange,
      yRange
    };
  });
  return {
    width,
    height,
    plot,
    xTicks: buildTicks(xRange, plot.left, plot.right),
    yTicks: buildTicks(yRange, plot.bottom, plot.top),
    xRange,
    yRange,
    xAxisLabel: "Temperature (°C)",
    yAxisLabel: "Distance (px)",
    series,
    legend: [...sources]
      .sort((left, right) => left.region_index - right.region_index)
      .map((source) => ({
        regionId: source.region_id,
        regionLabel: source.region_label,
        color: source.color,
        visible: visibleRegionIds.has(source.region_id),
        pointCount: (source.temperatureDistance ?? source.temperature_distance ?? []).length
      })),
    hasPoints: series.some((item) =>
      (layers.formalPoints && item.rawPoints.length > 0) ||
      (layers.displayTrend && item.points.length > 0) ||
      (layers.afasSmoothed && item.afasPoints.length > 0)
    )
  };
}

function emptyRegionState(region: MeasurementRegion): RegionLiveState {
  return {
    regionId: region.region_id,
    regionIndex: region.index,
    regionLabel: region.label,
    color: region.color,
    latestResult: null,
    allFrames: [],
    temperatureDistance: [],
    displayTemperatureDistance: [],
    formalPointCount: 0,
    lastFormalFrameIndex: null,
    latestMissingReason: ""
  };
}

function regionFromResult(result: RegionResult): MeasurementRegion {
  return {
    region_id: result.region_id,
    index: result.region_index,
    label: result.region_label,
    enabled: true,
    roi: { type: "rotated_rect", center_x: 0, center_y: 0, width: 1, height: 1, angle_deg: 0 },
    color: result.color
  };
}

function appendUniqueCurvePoint(points: CurvePoint[], point: CurvePoint): CurvePoint[] {
  const previous = points[points.length - 1];
  if (previous?.frame_index === point.frame_index) {
    return [...points.slice(0, -1), { ...point }];
  }
  return [...points, { ...point }];
}

function appendUniqueDetection(points: DetectionResult[], point: DetectionResult): DetectionResult[] {
  const previous = points[points.length - 1];
  if (previous?.frame_index === point.frame_index) {
    return [...points.slice(0, -1), point];
  }
  return [...points, point];
}

function smoothDisplayPoints(points: CurvePoint[], windowSize: number): CurvePoint[] {
  const size = Math.max(1, Math.round(windowSize));
  if (size <= 1 || points.length <= 2) return points.map((point) => ({ ...point }));
  const radius = Math.floor(size / 2);
  return points.map((point, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(points.length - 1, index + radius);
    const values = points.slice(start, end + 1).map((candidate) => candidate.y).filter(Number.isFinite);
    return {
      ...point,
      y: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : point.y
    };
  });
}

function downsampleDisplayPoints(points: CurvePoint[], limit: number): CurvePoint[] {
  if (points.length <= limit) return points.map((point) => ({ ...point }));
  const result: CurvePoint[] = [];
  const step = (points.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    result.push({ ...points[Math.round(index * step)] });
  }
  return result;
}

function readAfasSmoothedPoints(source: RegionTrendSource): CurvePoint[] {
  const preprocessing = source.afas_preprocessing;
  if (!preprocessing || typeof preprocessing !== "object") return [];
  const smoothed = preprocessing.smoothed;
  if (!smoothed || typeof smoothed !== "object" || Array.isArray(smoothed)) return [];
  const temperatures = (smoothed as Record<string, unknown>).temperature_celsius;
  const values = (smoothed as Record<string, unknown>).values;
  if (!Array.isArray(temperatures) || !Array.isArray(values)) return [];
  return temperatures.flatMap((temperature, index) => {
    const distance = values[index];
    if (typeof temperature !== "number" || typeof distance !== "number") return [];
    if (!Number.isFinite(temperature) || !Number.isFinite(distance)) return [];
    return [{
      x: temperature,
      y: distance,
      frame_index: source.temperature_distance?.[index]?.frame_index ?? index + 1,
      sync_status: source.temperature_distance?.[index]?.sync_status ?? null
    }];
  });
}

function paddedRange(values: number[], minimumSpan: number): { min: number; max: number } {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: minimumSpan };
  const observedMin = Math.min(...finite);
  const observedMax = Math.max(...finite);
  const center = (observedMin + observedMax) / 2;
  const span = Math.max(minimumSpan, observedMax - observedMin);
  const padding = Math.max(span * 0.05, minimumSpan * 0.02);
  return { min: center - span / 2 - padding, max: center + span / 2 + padding };
}

function scale(
  value: number,
  domain: { min: number; max: number },
  rangeStart: number,
  rangeEnd: number
): number {
  return rangeStart + ((value - domain.min) / (domain.max - domain.min || 1)) * (rangeEnd - rangeStart);
}

function buildTicks(
  range: { min: number; max: number },
  start: number,
  end: number
): Array<{ value: number; label: string; position: number }> {
  return Array.from({ length: 5 }, (_, index) => {
    const value = range.min + ((range.max - range.min) * index) / 4;
    return {
      value,
      label: Math.abs(range.max - range.min) < 10 ? value.toFixed(1) : value.toFixed(0),
      position: scale(value, range, start, end)
    };
  });
}
