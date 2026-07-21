export type AfasRange = [number, number];
export type AfasDataPoint = { temperature: number; distance: number };
export type AfasDataDomain = {
  temperatureMin: number;
  temperatureMax: number;
  distanceMin: number;
  distanceMax: number;
  availableTemperatures: number[];
};
export type AfasPlotBounds = { left: number; right: number; top: number; bottom: number };
export type AfasPlotPoint = { x: number; y: number };

export function clampAfasPlotPoint(point: AfasPlotPoint, bounds: AfasPlotBounds): AfasPlotPoint {
  return {
    x: clampNumber(point.x, bounds.left, bounds.right),
    y: clampNumber(point.y, bounds.top, bounds.bottom)
  };
}

export function clampAfasDataPoint(point: AfasDataPoint, domain: AfasDataDomain): AfasDataPoint {
  return {
    temperature: clampNumber(point.temperature, domain.temperatureMin, domain.temperatureMax),
    distance: clampNumber(point.distance, domain.distanceMin, domain.distanceMax)
  };
}

export function resizeAfasRange(
  range: AfasRange,
  edge: "start" | "end",
  pointerTemperature: number,
  availableTemperatures: number[]
): AfasRange {
  const temperatures = normalizedTemperatures(availableTemperatures);
  if (temperatures.length < 2) return normalizedRange(range);
  const startIndex = nearestTemperatureIndex(range[0], temperatures);
  const endIndex = nearestTemperatureIndex(range[1], temperatures);
  const pointerIndex = nearestTemperatureIndex(pointerTemperature, temperatures);
  if (edge === "start") {
    const nextStart = Math.min(pointerIndex, Math.max(0, endIndex - 1));
    return [temperatures[nextStart], temperatures[Math.max(nextStart + 1, endIndex)]];
  }
  const nextEnd = Math.max(pointerIndex, Math.min(temperatures.length - 1, startIndex + 1));
  return [temperatures[Math.min(startIndex, nextEnd - 1)], temperatures[nextEnd]];
}

export function moveAfasRange(
  range: AfasRange,
  temperatureDelta: number,
  availableTemperatures: number[]
): AfasRange {
  const temperatures = normalizedTemperatures(availableTemperatures);
  if (temperatures.length < 2) return normalizedRange(range);
  const startIndex = nearestTemperatureIndex(range[0], temperatures);
  const endIndex = Math.max(startIndex + 1, nearestTemperatureIndex(range[1], temperatures));
  const indexSpan = Math.min(temperatures.length - 1, endIndex - startIndex);
  const desiredStart = nearestTemperatureIndex(range[0] + temperatureDelta, temperatures);
  const nextStart = Math.max(0, Math.min(temperatures.length - 1 - indexSpan, desiredStart));
  return [temperatures[nextStart], temperatures[nextStart + indexSpan]];
}

export function translateAfasTangent(
  slope: number,
  intercept: number,
  start: AfasDataPoint,
  current: AfasDataPoint,
  domain?: AfasDataDomain
): { slope: number; intercept: number } {
  const boundedCurrent = domain ? clampAfasDataPoint(current, domain) : current;
  const candidateIntercept = intercept +
    (boundedCurrent.distance - start.distance) -
    slope * (boundedCurrent.temperature - start.temperature);
  return {
    slope,
    intercept: domain
      ? clampNumber(candidateIntercept, ...tangentInterceptBounds(slope, domain))
      : candidateIntercept
  };
}

export function rotateAfasTangent(
  anchor: AfasDataPoint,
  pointer: AfasDataPoint,
  fallbackSlope: number,
  domain: AfasDataDomain,
  minimumTemperatureDelta?: number
): { slope: number; intercept: number };
export function rotateAfasTangent(
  anchor: AfasDataPoint,
  pointer: AfasDataPoint,
  fallbackSlope: number,
  minimumTemperatureDelta?: number
): { slope: number; intercept: number };
export function rotateAfasTangent(
  anchor: AfasDataPoint,
  pointer: AfasDataPoint,
  fallbackSlope: number,
  domainOrMinimumTemperatureDelta?: AfasDataDomain | number,
  requestedMinimumTemperatureDelta = 1e-6
): { slope: number; intercept: number } {
  const domain = typeof domainOrMinimumTemperatureDelta === "object"
    ? domainOrMinimumTemperatureDelta
    : null;
  const minimumTemperatureDelta = typeof domainOrMinimumTemperatureDelta === "number"
    ? domainOrMinimumTemperatureDelta
    : requestedMinimumTemperatureDelta;
  const boundedAnchor = domain ? clampAfasDataPoint(anchor, domain) : anchor;
  const boundedPointer = domain ? clampAfasDataPoint(pointer, domain) : pointer;
  const temperatureDelta = boundedPointer.temperature - boundedAnchor.temperature;
  const candidateSlope = Math.abs(temperatureDelta) < minimumTemperatureDelta
    ? fallbackSlope
    : (boundedPointer.distance - boundedAnchor.distance) / temperatureDelta;
  const slope = Number.isFinite(candidateSlope) ? candidateSlope : fallbackSlope;
  return {
    slope,
    intercept: boundedAnchor.distance - slope * boundedAnchor.temperature
  };
}

export function tangentInterceptBounds(slope: number, domain: AfasDataDomain): AfasRange {
  const products = [slope * domain.temperatureMin, slope * domain.temperatureMax];
  return [
    domain.distanceMin - Math.max(...products),
    domain.distanceMax - Math.min(...products)
  ];
}

export function clampTangentControlPoints(
  slope: number,
  intercept: number,
  domain: AfasDataDomain
): AfasDataPoint[] {
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return [];
  const candidates: AfasDataPoint[] = [
    {
      temperature: domain.temperatureMin,
      distance: slope * domain.temperatureMin + intercept
    },
    {
      temperature: domain.temperatureMax,
      distance: slope * domain.temperatureMax + intercept
    }
  ];
  if (slope !== 0) {
    candidates.push(
      {
        temperature: (domain.distanceMin - intercept) / slope,
        distance: domain.distanceMin
      },
      {
        temperature: (domain.distanceMax - intercept) / slope,
        distance: domain.distanceMax
      }
    );
  }

  const intersections: AfasDataPoint[] = [];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.temperature) || !Number.isFinite(candidate.distance)) continue;
    if (!pointInAfasDomain(candidate, domain)) continue;
    const bounded = clampAfasDataPoint(candidate, domain);
    if (intersections.some((point) => afasDataPointsEqual(point, bounded))) continue;
    intersections.push(bounded);
  }
  if (intersections.length <= 2) return intersections;

  let farthest: [AfasDataPoint, AfasDataPoint] = [intersections[0], intersections[1]];
  let farthestDistanceSquared = dataPointDistanceSquared(...farthest);
  for (let left = 0; left < intersections.length - 1; left += 1) {
    for (let right = left + 1; right < intersections.length; right += 1) {
      const distanceSquared = dataPointDistanceSquared(intersections[left], intersections[right]);
      if (distanceSquared > farthestDistanceSquared) {
        farthest = [intersections[left], intersections[right]];
        farthestDistanceSquared = distanceSquared;
      }
    }
  }
  return farthest;
}

export function tangentIntersectsDomain(
  slope: number,
  intercept: number,
  domain: AfasDataDomain
): boolean {
  return clampTangentControlPoints(slope, intercept, domain).length > 0;
}

function normalizedRange(range: AfasRange): AfasRange {
  return range[0] <= range[1] ? range : [range[1], range[0]];
}

function normalizedTemperatures(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function nearestTemperatureIndex(value: number, temperatures: number[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < temperatures.length; index += 1) {
    const distance = Math.abs(temperatures[index] - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function clampNumber(value: number, lower: number, upper: number): number {
  const minimum = Math.min(lower, upper);
  const maximum = Math.max(lower, upper);
  return Math.min(maximum, Math.max(minimum, value));
}

function pointInAfasDomain(point: AfasDataPoint, domain: AfasDataDomain): boolean {
  const tolerance = 1e-9;
  return point.temperature >= domain.temperatureMin - tolerance &&
    point.temperature <= domain.temperatureMax + tolerance &&
    point.distance >= domain.distanceMin - tolerance &&
    point.distance <= domain.distanceMax + tolerance;
}

function afasDataPointsEqual(left: AfasDataPoint, right: AfasDataPoint): boolean {
  return Math.abs(left.temperature - right.temperature) <= 1e-9 &&
    Math.abs(left.distance - right.distance) <= 1e-9;
}

function dataPointDistanceSquared(left: AfasDataPoint, right: AfasDataPoint): number {
  const temperatureDelta = left.temperature - right.temperature;
  const distanceDelta = left.distance - right.distance;
  return temperatureDelta * temperatureDelta + distanceDelta * distanceDelta;
}
