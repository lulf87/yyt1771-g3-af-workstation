export type GroupedTemperaturePoint = {
  bin_key: number;
  temperature_celsius: number;
  distance_px: number;
  sample_count: number;
  minimum_distance_px: number;
  maximum_distance_px: number;
  first_frame_index: number;
  last_frame_index: number;
  representative_frame_index: number;
  temperature_group_bin_celsius: number;
};

export type TemperatureCurvePoint = {
  x: number;
  y: number;
  frame_index: number;
  sync_status: string | null;
};
type TemperatureCurvePointInput = Omit<TemperatureCurvePoint, "frame_index" | "sync_status"> & {
  frame_index?: number;
  sync_status?: string | null;
};

export type GroupedTemperaturePointMap = Map<number, GroupedTemperaturePoint>;

export function upsertGroupedTemperaturePoint(
  buckets: GroupedTemperaturePointMap,
  update: GroupedTemperaturePoint
): void {
  buckets.set(update.bin_key, { ...update });
}

export function groupedPointsFromMap(buckets: GroupedTemperaturePointMap): TemperatureCurvePoint[] {
  return [...buckets.values()]
    .sort((left, right) => left.bin_key - right.bin_key)
    .map((point) => ({
      x: point.temperature_celsius,
      y: point.distance_px,
      frame_index: point.representative_frame_index,
      sync_status: "TEMP_SYNC_OK"
    }));
}

export function groupLegacyCurvePoints(points: TemperatureCurvePointInput[], binCelsius: number): TemperatureCurvePoint[] {
  const bins = new Map<number, { sum: number; count: number; frames: number[]; syncStatus: string | null }>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const key = roundHalfToEven(point.x / binCelsius);
    const bucket = bins.get(key) ?? { sum: 0, count: 0, frames: [], syncStatus: point.sync_status ?? null };
    bucket.sum += point.y;
    bucket.count += 1;
    bucket.frames.push(point.frame_index ?? 0);
    bins.set(key, bucket);
  }
  return [...bins.entries()].sort(([left], [right]) => left - right).map(([key, bucket]) => ({
    x: Number((key * binCelsius).toFixed(Math.max(0, Math.ceil(-Math.log10(binCelsius)) + 2))),
    y: bucket.sum / bucket.count,
    frame_index: Math.round(bucket.frames.reduce((sum, frame) => sum + frame, 0) / bucket.frames.length),
    sync_status: bucket.syncStatus
  }));
}

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) < 1e-12) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}

export function validateStrictlyIncreasingTemperature(points: Array<{ x: number }>): boolean {
  return points.every((point, index) => index === 0 || point.x > points[index - 1].x);
}

export function formalCurvePoints(
  preprocessing: Record<string, unknown> | undefined,
  legacyRaw: TemperatureCurvePointInput[],
  defaultBinCelsius = 0.01
): TemperatureCurvePoint[] {
  for (const key of ["smoothed_temperature_points", "repaired_temperature_points", "grouped_temperature_points"] as const) {
    const series = preprocessing?.[key];
    if (!Array.isArray(series) || !series.length) continue;
    const points = series.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const x = Number(record.temperature_celsius);
      const y = Number(record.distance_px);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [{ x, y, frame_index: Number(record.representative_frame_index ?? 0), sync_status: "TEMP_SYNC_OK" }];
    });
    if (points.length && validateStrictlyIncreasingTemperature(points)) return points;
  }
  const parameters = preprocessing?.parameters;
  const bin = parameters && typeof parameters === "object"
    ? Number((parameters as Record<string, unknown>).temperature_group_bin_celsius)
    : defaultBinCelsius;
  return groupLegacyCurvePoints(legacyRaw, Number.isFinite(bin) && bin > 0 ? bin : defaultBinCelsius);
}
