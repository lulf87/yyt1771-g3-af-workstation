import type {
  AnalysisResult,
  CurvePoint,
  DetectionResult,
  LiveOfflineFrameEvent,
  SyncConfig
} from "./api/client";

export type LiveRunDiagnostics = {
  receivedFrameEventCount: number;
  latestEventFrameIndex: number | null;
  latestDetectionDistancePx: number | null;
  latestDetectionTemperatureC: number | null;
  latestCurvePointPresent: boolean;
  latestCurvePointMissingReason: string;
  formalTemperatureDistancePointCount: number;
  smoothedPreviewPointCount: number;
  afasPreviewStatus: string | null;
  lastFormalPointFrameIndex: number | null;
  lastFormalPointTemperature: number | null;
  lastFormalPointDistance: number | null;
  detectionStatus: string | null;
  curvePointStatus: string | null;
  temperatureSyncStatus: string | null;
  distanceOutlierFiltered: boolean;
  exclusionReason: string;
};

export function emptyAnalysis(runId: string): AnalysisResult {
  return {
    analysis_id: `${runId}-live-preview`,
    run_id: runId,
    all_frames: [],
    distance_time: [],
    raw_distance_time: [],
    stabilized_distance_time: [],
    temperature_time: [],
    temperature_distance: [],
    raw_temperature_distance: [],
    stabilized_temperature_distance: [],
    afas_preprocessing: {},
    afas_analysis: {},
    export_artifacts: [],
    created_at: new Date().toISOString()
  };
}

export function emptyLiveRunDiagnostics(): LiveRunDiagnostics {
  return {
    receivedFrameEventCount: 0,
    latestEventFrameIndex: null,
    latestDetectionDistancePx: null,
    latestDetectionTemperatureC: null,
    latestCurvePointPresent: false,
    latestCurvePointMissingReason: "",
    formalTemperatureDistancePointCount: 0,
    smoothedPreviewPointCount: 0,
    afasPreviewStatus: null,
    lastFormalPointFrameIndex: null,
    lastFormalPointTemperature: null,
    lastFormalPointDistance: null,
    detectionStatus: null,
    curvePointStatus: null,
    temperatureSyncStatus: null,
    distanceOutlierFiltered: false,
    exclusionReason: ""
  };
}

export function appendLiveAnalysis(
  analysis: AnalysisResult,
  detection: DetectionResult,
  curvePoints: LiveOfflineFrameEvent["curve_points"],
  afasPreprocessing: LiveOfflineFrameEvent["afas_preprocessing"],
  afasAnalysis: LiveOfflineFrameEvent["afas_analysis"],
  runId: string,
  syncConfig?: SyncConfig
): AnalysisResult {
  const nextSyncConfig = syncConfig?.temp_sync_target_ms !== undefined
    ? { ...analysis.sync_config, temp_sync_target_ms: syncConfig.temp_sync_target_ms }
    : analysis.sync_config;
  return {
    ...analysis,
    run_id: runId,
    analysis_id: `${runId}-live-preview`,
    all_frames: [...analysis.all_frames, detection],
    distance_time: appendCurvePoint(analysis.distance_time, curvePoints.distance_time),
    raw_distance_time: appendCurvePoint(analysis.raw_distance_time ?? [], curvePoints.raw_distance_time ?? liveRawDistancePoint(detection)),
    stabilized_distance_time: appendCurvePoint(analysis.stabilized_distance_time ?? [], curvePoints.stabilized_distance_time ?? liveStabilizedDistancePoint(detection)),
    temperature_time: appendCurvePoint(analysis.temperature_time, curvePoints.temperature_time),
    temperature_distance: appendCurvePoint(analysis.temperature_distance, curvePoints.temperature_distance),
    raw_temperature_distance: appendCurvePoint(analysis.raw_temperature_distance ?? [], curvePoints.raw_temperature_distance ?? liveRawTemperatureDistancePoint(detection)),
    stabilized_temperature_distance: appendCurvePoint(analysis.stabilized_temperature_distance ?? [], curvePoints.stabilized_temperature_distance ?? liveStabilizedTemperatureDistancePoint(detection)),
    afas_preprocessing: mergeLiveAfasPreprocessing(analysis.afas_preprocessing, afasPreprocessing),
    afas_analysis: afasAnalysis,
    sync_config: nextSyncConfig
  };
}

export function detectionWithSyncConfig(
  detection: DetectionResult,
  syncConfig?: SyncConfig
): DetectionResult {
  const tempSyncTargetMs = numberFromUnknown(syncConfig?.temp_sync_target_ms);
  return tempSyncTargetMs === null
    ? detection
    : { ...detection, temp_sync_target_ms: tempSyncTargetMs };
}

export function buildLiveRunDiagnostics(
  previous: LiveRunDiagnostics | null,
  event: LiveOfflineFrameEvent,
  analysis: AnalysisResult,
  detection: DetectionResult = event.detection_result
): LiveRunDiagnostics {
  const lastFormalPoint = analysis.temperature_distance.length
    ? analysis.temperature_distance[analysis.temperature_distance.length - 1]
    : null;
  const status = event.live_point_status;
  const pointPresent = status?.temperature_distance_present ?? event.curve_points.temperature_distance !== null;
  const missingReason = pointPresent
    ? ""
    : status?.reason_if_missing || livePointMissingReason(detection, event.curve_points);
  return {
    receivedFrameEventCount: (previous?.receivedFrameEventCount ?? 0) + 1,
    latestEventFrameIndex: event.frame_index,
    latestDetectionDistancePx: numberFromUnknown(detection.distance_px),
    latestDetectionTemperatureC: numberFromUnknown(detection.temperature_celsius),
    latestCurvePointPresent: pointPresent,
    latestCurvePointMissingReason: missingReason,
    formalTemperatureDistancePointCount: analysis.temperature_distance.length,
    smoothedPreviewPointCount: readSmoothedPreviewPointCount(analysis.afas_preprocessing),
    afasPreviewStatus: readString(readRecord(analysis.afas_preprocessing).preview_status),
    lastFormalPointFrameIndex: lastFormalPoint ? Math.round(numberFromUnknown(lastFormalPoint.frame_index) ?? NaN) || null : null,
    lastFormalPointTemperature: numberFromUnknown(lastFormalPoint?.x),
    lastFormalPointDistance: numberFromUnknown(lastFormalPoint?.y),
    detectionStatus: detection.detection_status ?? null,
    curvePointStatus: detection.curve_point_status ?? null,
    temperatureSyncStatus: detection.temperature_sync_status ?? null,
    distanceOutlierFiltered: Boolean(detection.distance_outlier_filtered),
    exclusionReason: detection.curve_exclusion_reason || detection.rejected_reason || missingReason
  };
}

export function mergeLiveAfasPreprocessing(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const incomingRecord = readRecord(incoming);
  if (Object.keys(readRecord(incomingRecord.smoothed)).length > 0) {
    return incomingRecord;
  }

  const previousRecord = readRecord(previous);
  if (Object.keys(readRecord(previousRecord.smoothed)).length === 0) {
    return incomingRecord;
  }

  return {
    ...previousRecord,
    preview_status: incomingRecord.preview_status ?? previousRecord.preview_status,
    point_count: incomingRecord.point_count ?? previousRecord.point_count,
    temperature_distance_point_count:
      incomingRecord.temperature_distance_point_count ?? previousRecord.temperature_distance_point_count,
    preview_interval_frames: incomingRecord.preview_interval_frames ?? previousRecord.preview_interval_frames
  };
}

export function livePointStatusMessage(
  status: LiveOfflineFrameEvent["live_point_status"] | string | null | undefined
): string {
  const reason = typeof status === "string"
    ? status
    : status?.temperature_distance_present
      ? ""
      : status?.reason_if_missing;
  if (!reason) return "";
  return `Current frame did not enter the formal curve: ${livePointMissingReasonLabel(reason)}`;
}

export function livePointMissingReasonLabel(reason: string): string {
  if (reason === "detection_invalid") return "detection is invalid";
  if (reason === "curve_point_status_not_valid") return "curve point status is not valid";
  if (reason === "missing_distance") return "distance is missing";
  if (reason === "missing_temperature") return "temperature is missing";
  if (reason === "temperature_sync_not_formal") return "temperature sync status is not formal";
  if (reason === "distance_outlier_filtered") return "distance jump outlier was filtered";
  return "unknown reason";
}

function appendCurvePoint(points: CurvePoint[], point: CurvePoint | null): CurvePoint[] {
  return point ? [...points, point] : points;
}

function isFormalCurveDetection(detection: DetectionResult): boolean {
  return detection.detection_status === "VALID" && (detection.curve_point_status ?? "valid") === "valid";
}

function liveRawDistancePoint(detection: DetectionResult): CurvePoint | null {
  const distance = detection.raw_distance_px;
  if (!isFormalCurveDetection(detection) || distance == null) return null;
  return {
    x: detection.frame_timestamp_ms ?? detection.frame_index,
    y: distance,
    frame_index: detection.frame_index,
    sync_status: detection.temperature_sync_status
  };
}

function liveStabilizedDistancePoint(detection: DetectionResult): CurvePoint | null {
  const distance = detection.stabilized_distance_px;
  if (!isFormalCurveDetection(detection) || distance == null) return null;
  return {
    x: detection.frame_timestamp_ms ?? detection.frame_index,
    y: distance,
    frame_index: detection.frame_index,
    sync_status: detection.temperature_sync_status
  };
}

function liveRawTemperatureDistancePoint(detection: DetectionResult): CurvePoint | null {
  return liveTemperatureDistancePoint(detection, detection.raw_distance_px);
}

function liveStabilizedTemperatureDistancePoint(detection: DetectionResult): CurvePoint | null {
  return liveTemperatureDistancePoint(detection, detection.stabilized_distance_px);
}

function liveTemperatureDistancePoint(detection: DetectionResult, distance: number | null): CurvePoint | null {
  if (!isFormalCurveDetection(detection) || distance == null || detection.temperature_celsius == null) return null;
  if (!["TEMP_SYNC_OK", "TEMP_SYNC_INTERPOLATED"].includes(detection.temperature_sync_status)) return null;
  return {
    x: detection.temperature_celsius,
    y: distance,
    frame_index: detection.frame_index,
    sync_status: detection.temperature_sync_status
  };
}

function livePointMissingReason(
  detection: DetectionResult,
  curvePoints: LiveOfflineFrameEvent["curve_points"]
): string {
  if (detection.detection_status !== "VALID") return "detection_invalid";
  if (detection.distance_outlier_filtered || detection.curve_point_status === "distance_jump_outlier") {
    return "distance_outlier_filtered";
  }
  if ((detection.curve_point_status ?? "valid") !== "valid") return "curve_point_status_not_valid";
  if (detection.distance_px == null) return "missing_distance";
  if (detection.temperature_celsius == null) return "missing_temperature";
  if (!["TEMP_SYNC_OK", "TEMP_SYNC_INTERPOLATED"].includes(detection.temperature_sync_status)) {
    return "temperature_sync_not_formal";
  }
  if (curvePoints.temperature_distance === null) return "unknown";
  return "";
}

function readSmoothedPreviewPointCount(afasPreprocessing: Record<string, unknown>): number {
  const smoothed = readRecord(readRecord(afasPreprocessing).smoothed);
  const temperatures = smoothed.temperature_celsius;
  return Array.isArray(temperatures) ? temperatures.length : 0;
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
