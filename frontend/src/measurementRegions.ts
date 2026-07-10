import type {
  MeasurementDefinition,
  MeasurementRegion,
  RotatedROI
} from "./api/client";

export const REGION_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4"
] as const;

export const MAX_MEASUREMENT_REGIONS = REGION_COLORS.length;

export type NormalizedMeasurementDefinition = Omit<MeasurementDefinition, "regions"> & {
  regions: MeasurementRegion[];
};

export function normalizeMeasurementRegions(
  measurement: MeasurementDefinition
): NormalizedMeasurementDefinition {
  const suppliedRegions = measurement.regions ?? [];
  const regions = suppliedRegions.length > 0
    ? suppliedRegions.map(cloneRegion)
    : [legacyRegion(measurement.roi)];

  assertRegionCollection(regions);
  return mirrorCompatibilityRoi({ ...measurement, regions });
}

export function mirrorCompatibilityRoi(
  measurement: MeasurementDefinition
): NormalizedMeasurementDefinition {
  const regions = (measurement.regions ?? []).map(cloneRegion);
  assertRegionCollection(regions);
  const firstEnabled = [...regions]
    .filter((region) => region.enabled)
    .sort((left, right) => left.index - right.index)[0];
  if (!firstEnabled) {
    throw new Error("At least one enabled measurement position is required");
  }
  return {
    ...measurement,
    roi: cloneRoi(firstEnabled.roi),
    regions
  };
}

export function addRegion(measurement: MeasurementDefinition): NormalizedMeasurementDefinition {
  const normalized = normalizeMeasurementRegions(measurement);
  if (normalized.regions.length >= MAX_MEASUREMENT_REGIONS) {
    throw new Error("Up to six measurement positions are supported");
  }

  const usedColors = new Set(normalized.regions.map((region) => region.color.toLowerCase()));
  const color = REGION_COLORS.find((candidate) => !usedColors.has(candidate)) ?? REGION_COLORS[0];
  const nextIndex = normalized.regions.length + 1;
  const nextRegion: MeasurementRegion = {
    region_id: firstUnusedRegionId(normalized.regions),
    index: nextIndex,
    label: `位置 ${nextIndex}`,
    enabled: true,
    roi: cloneRoi(normalized.roi),
    color
  };
  return mirrorCompatibilityRoi({
    ...normalized,
    regions: [...normalized.regions, nextRegion]
  });
}

export function removeRegion(
  measurement: MeasurementDefinition,
  regionId: string
): NormalizedMeasurementDefinition {
  const normalized = normalizeMeasurementRegions(measurement);
  assertKnownRegion(normalized.regions, regionId);
  if (normalized.regions.length <= 1) {
    throw new Error("At least one measurement position is required");
  }

  const regions = normalized.regions
    .filter((region) => region.region_id !== regionId)
    .map((region, offset) => reindexRegion(region, offset + 1));
  return mirrorCompatibilityRoi({ ...normalized, regions });
}

export function updateRegionRoi(
  measurement: MeasurementDefinition,
  regionId: string,
  roi: RotatedROI
): NormalizedMeasurementDefinition {
  return updateRegion(measurement, regionId, (region) => ({
    ...region,
    roi: cloneRoi(roi)
  }));
}

export function toggleRegionEnabled(
  measurement: MeasurementDefinition,
  regionId: string,
  enabled?: boolean
): NormalizedMeasurementDefinition {
  const normalized = normalizeMeasurementRegions(measurement);
  const target = assertKnownRegion(normalized.regions, regionId);
  const nextEnabled = enabled ?? !target.enabled;
  if (!nextEnabled && target.enabled && normalized.regions.filter((region) => region.enabled).length <= 1) {
    throw new Error("At least one enabled measurement position is required");
  }
  return updateRegion(normalized, regionId, (region) => ({ ...region, enabled: nextEnabled }));
}

export function renameRegion(
  measurement: MeasurementDefinition,
  regionId: string,
  label: string
): NormalizedMeasurementDefinition {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    throw new Error("Measurement position label must not be empty");
  }
  return updateRegion(measurement, regionId, (region) => ({
    ...region,
    label: normalizedLabel
  }));
}

function updateRegion(
  measurement: MeasurementDefinition,
  regionId: string,
  updater: (region: MeasurementRegion) => MeasurementRegion
): NormalizedMeasurementDefinition {
  const normalized = normalizeMeasurementRegions(measurement);
  assertKnownRegion(normalized.regions, regionId);
  return mirrorCompatibilityRoi({
    ...normalized,
    regions: normalized.regions.map((region) =>
      region.region_id === regionId ? updater(cloneRegion(region)) : cloneRegion(region)
    )
  });
}

function legacyRegion(roi: RotatedROI): MeasurementRegion {
  return {
    region_id: "region_1",
    index: 1,
    label: "位置 1",
    enabled: true,
    roi: cloneRoi(roi),
    color: REGION_COLORS[0]
  };
}

function cloneRegion(region: MeasurementRegion): MeasurementRegion {
  return {
    ...region,
    roi: cloneRoi(region.roi),
    color: region.color.toLowerCase()
  };
}

function cloneRoi(roi: RotatedROI): RotatedROI {
  return { ...roi };
}

function reindexRegion(region: MeasurementRegion, index: number): MeasurementRegion {
  const usesDefaultLabel = /^位置\s+\d+$/.test(region.label) || /^Position\s+\d+$/i.test(region.label);
  return {
    ...cloneRegion(region),
    index,
    label: usesDefaultLabel ? `位置 ${index}` : region.label
  };
}

function firstUnusedRegionId(regions: MeasurementRegion[]): string {
  const used = new Set(regions.map((region) => region.region_id));
  let suffix = 1;
  while (used.has(`region_${suffix}`)) suffix += 1;
  return `region_${suffix}`;
}

function assertKnownRegion(regions: MeasurementRegion[], regionId: string): MeasurementRegion {
  const region = regions.find((candidate) => candidate.region_id === regionId);
  if (!region) throw new Error(`Measurement position ${regionId} is missing`);
  return region;
}

function assertRegionCollection(regions: MeasurementRegion[]): void {
  if (regions.length < 1) throw new Error("At least one measurement position is required");
  if (regions.length > MAX_MEASUREMENT_REGIONS) {
    throw new Error("Up to six measurement positions are supported");
  }
  if (new Set(regions.map((region) => region.region_id)).size !== regions.length) {
    throw new Error("Measurement position IDs must be unique");
  }
  if (regions.every((region) => !region.enabled)) {
    throw new Error("At least one enabled measurement position is required");
  }
}
