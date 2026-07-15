export type AfasRange = [number, number];
export type AfasDataPoint = { temperature: number; distance: number };

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
  current: AfasDataPoint
): { slope: number; intercept: number } {
  return {
    slope,
    intercept: intercept + (current.distance - start.distance) - slope * (current.temperature - start.temperature)
  };
}

export function rotateAfasTangent(
  anchor: AfasDataPoint,
  pointer: AfasDataPoint,
  fallbackSlope: number,
  minimumTemperatureDelta = 1e-6
): { slope: number; intercept: number } {
  const temperatureDelta = pointer.temperature - anchor.temperature;
  const slope = Math.abs(temperatureDelta) < minimumTemperatureDelta
    ? fallbackSlope
    : (pointer.distance - anchor.distance) / temperatureDelta;
  return {
    slope,
    intercept: anchor.distance - slope * anchor.temperature
  };
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
