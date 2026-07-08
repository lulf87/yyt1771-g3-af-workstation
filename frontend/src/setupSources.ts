import type {
  MeasurementDefinition,
  RotatedROI,
  SerialPortInfo,
  TemperatureStatusResponse
} from "./api/client";

export type SetupSourceKind = "offline_dataset" | "real_camera";
export type SetupPageKind = "setup" | "run" | "playback" | "analysis";
type UiLanguage = "zh" | "en";

export type SetupSourceOption = {
  kind: SetupSourceKind;
  label: string;
};

export type PreviewRefreshStatus = "idle" | "refreshing" | "ok" | "unavailable";
export type RealCameraPreviewMode = "live" | "frozen";

export type RealCameraSetupChange =
  | { kind: "roi" }
  | { kind: "object_class" }
  | { kind: "detector" }
  | { kind: "width_mode" }
  | { kind: "detector_config"; key: string }
  | { kind: "temperature_action" }
  | { kind: "analysis_parameters" };

export type RealCameraPreviewFrameLike = {
  timestamp_ms: number | null;
  shape: number[];
  camera_status: string;
};

export type DisplaySize = {
  width: number;
  height: number;
};

export type PreserveRoiAcrossDisplayResizeInput = {
  sourceShape: number[];
  fromDisplaySize: DisplaySize;
  toDisplaySize: DisplaySize;
};

export type RealCameraSetupFrameEvent =
  | { kind: "roi_apply" }
  | { kind: "object_class" }
  | { kind: "detector" }
  | { kind: "width_mode" }
  | { kind: "detector_config"; key: string }
  | { kind: "temperature_config"; key: string }
  | { kind: "temperature_action" }
  | { kind: "analysis_parameters" };

export type RealCameraSetupFrameUpdatePlan = {
  refreshFrame: boolean;
  refreshProbe: boolean;
  keepCurrentFrame: boolean;
  reason:
    | "not_real_camera_setup"
    | "frozen_frame"
    | "live_roi_apply"
    | "temperature_does_not_affect_preview"
    | "detector_preview_affecting_change"
    | "frozen_detector_overlay_update"
    | "analysis_does_not_affect_preview";
};

export type RealCameraSetupFrameUpdateInput = {
  page: SetupPageKind;
  source: SetupSourceKind;
  state: RealCameraPreviewState | null;
  event: RealCameraSetupFrameEvent;
};

export type RealCameraPreviewState = {
  mode: RealCameraPreviewMode;
  timestampMs: number | null;
  frozenTimestampMs: number | null;
  shape: number[];
  cameraStatus: string;
  roi: RotatedROI | null;
  roiNeedsReconfirm: boolean;
  shapeChangeMessage: string;
};

export type SetupRunMode = {
  kind: "live_offline_run" | "real_camera_run";
  startLabel: string;
  pendingLabel: string;
  allowsPreviewAction: boolean;
};

export type RunSetupSummary = {
  sourceLabel: string;
  sourceId: string;
  roiCenter: string;
  roiSize: string;
  roiAngle: string;
  objectClass: string;
  detector: string;
  widthMode: string;
  maxFramesPerRun: string;
  targetFps: string;
  targetTemperatureCelsius: string;
  temperaturePowerPercent: string;
};

export type SetupTemperatureError = {
  temperature_status?: string;
  message: string;
  details?: Record<string, unknown>;
  http_status?: number | null;
};

export type SetupTemperatureSummary = {
  status: string;
  currentTemperature: string;
  source: string;
  timestamp: string;
  targetTemperatureCelsius: string;
  temperaturePowerPercent: string;
  selectedPort: string;
  ports: string;
  portCount: string;
  error: string;
};

export const REAL_CAMERA_SETUP_PREVIEW_INTERVAL_MS = 200;
export const REAL_CAMERA_SETUP_RETRY_INTERVAL_MS = 2000;

const DEFAULT_REAL_CAMERA_CONFIG = {
  tie_width_epsilon_px: 2,
  switch_after_n_frames: 3,
  jump_limit_px: 35,
  min_confidence: 0.15,
  contrast_threshold: 30,
  distance_outlier_filter_enabled: true,
  distance_outlier_reference_count: 5,
  distance_outlier_max_jump_px: 20,
  distance_outlier_baseline: "median" as const,
  min_component_area_px: 80,
  envelope_window_px: 9,
  envelope_step_px: 2,
  min_window_pixels: 8,
  window_width_keep_ratio: 0.2,
  mask_open_kernel_px: 3,
  mask_close_kernel_px: 11,
  mask_dilate_kernel_px: 1,
  max_frames_per_run: 160,
  live_offline_fps: 8,
  setup_preview_fps: 0,
  target_temperature_celsius: null,
  temperature_power_percent: 100,
  temperature_serial_port: ""
};

function uiText(language: UiLanguage, text: string): string {
  if (language === "en") return text;
  const zh: Record<string, string> = {
    "Updating live frame": "正在更新实时画面",
    "Live frame updated": "实时画面已更新",
    "Camera unavailable": "相机不可用",
    "No live frame yet": "尚未取得实时画面",
    "Start real camera run": "开始真实相机测量",
    "Start full offline run": "开始完整离线测量",
    "No frame limit": "无帧数上限",
    "Until stopped or target temperature": "手动停止或达到目标温度",
    Running: "测量中",
    "Real camera": "真实相机",
    "Offline dataset": "离线数据集",
    real_camera: "真实相机",
    None: "无",
    "Not read": "尚未读取",
    unavailable: "不可用",
    "A balloon envelope": "A 类球囊/网状结构整体外包络",
    "C bundle envelope": "C 类多细支/多线束整体外包络",
    "D reserved object": "D 类预留对象",
    "Distance outlier filter": "距离异常点过滤",
    "Maximum allowed jump (px)": "最大允许跳变（像素）",
    "Reference valid point count": "对比最近有效点数量",
    "Distance outlier baseline": "距离异常基准",
    "Last valid": "最近一个有效点",
    Mean: "平均值",
    Median: "中位数",
    max_width: "整体最大宽度",
    min_width: "整体最小宽度（预留）"
  };
  return zh[text] ?? text;
}

function uiNone(language: UiLanguage): string {
  return uiText(language, "None");
}

function uiObjectClass(language: UiLanguage, value: string): string {
  if (language === "en") return value;
  if (value === "A_BALLOON_ENVELOPE") return uiText(language, "A balloon envelope");
  if (value === "C_BUNDLE_ENVELOPE") return uiText(language, "C bundle envelope");
  if (value === "D_RESERVED_OBJECT") return uiText(language, "D reserved object");
  return value;
}

function uiStatus(language: UiLanguage, value: string): string {
  return uiText(language, value);
}

function uiWidthMode(language: UiLanguage, value: string): string {
  return uiText(language, value);
}

export const SETUP_SOURCE_OPTIONS: SetupSourceOption[] = [
  { kind: "offline_dataset", label: "Offline dataset" },
  { kind: "real_camera", label: "Real camera" }
];

const REAL_CAMERA_PREVIEW_AFFECTING_DETECTOR_CONFIG_KEYS = new Set([
  "min_component_area_px",
  "envelope_window_px",
  "envelope_step_px",
  "contrast_threshold",
  "mask_open_kernel_px",
  "mask_close_kernel_px",
  "mask_dilate_kernel_px"
]);

export function createDefaultRoiForShape(shape: number[]): RotatedROI {
  const height = positiveDimension(shape[0]);
  const width = positiveDimension(shape[1]);
  return {
    type: "rotated_rect",
    center_x: round2(width / 2),
    center_y: round2(height / 2),
    width: round2(width * 0.62),
    height: round2(height * 0.28),
    angle_deg: 0
  };
}

export function createRealCameraMeasurementFromShape(
  previous: MeasurementDefinition | null,
  shape: number[]
): MeasurementDefinition {
  const height = positiveDimension(shape[0]);
  const width = positiveDimension(shape[1]);
  const roi = previous?.roi
    ? fitRoiToShape(previous.roi, width, height, previous.measurement_id !== "real_camera-preview")
    : createDefaultRoiForShape(shape);

  return {
    measurement_id: "real_camera-preview",
    source: "real_camera",
    object_class: previous?.object_class ?? "A_BALLOON_ENVELOPE",
    detector: previous?.detector ?? "BalloonEnvelopeDetector",
    detector_mode: previous?.detector_mode ?? "default",
    width_mode: previous?.width_mode ?? "max_width",
    measurement_coordinates: "source_pixel",
    roi,
    detector_config: previous?.detector_config ?? DEFAULT_REAL_CAMERA_CONFIG
  };
}

export function preserveRoiAcrossDisplayResize(
  roi: RotatedROI,
  _input: PreserveRoiAcrossDisplayResizeInput
): RotatedROI {
  return { ...roi };
}

export function previewRefreshStatusLabel(status: PreviewRefreshStatus, language: UiLanguage = "en"): string {
  if (status === "refreshing") return uiText(language, "Updating live frame");
  if (status === "ok") return uiText(language, "Live frame updated");
  if (status === "unavailable") return uiText(language, "Camera unavailable");
  return uiText(language, "No live frame yet");
}

export function normalizeSetupPreviewFps(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function setupPreviewIntervalMs(fps: number | null | undefined): number {
  const normalized = normalizeSetupPreviewFps(fps);
  if (normalized <= 0) return 0;
  return Math.max(0, Math.round(1000 / normalized));
}

export function setupPreviewPollingIntervalMs(
  cameraStatus: string | null | undefined,
  fps: number | null | undefined
): number {
  if (cameraStatus === "unavailable") return REAL_CAMERA_SETUP_RETRY_INTERVAL_MS;
  return setupPreviewIntervalMs(fps) || REAL_CAMERA_SETUP_PREVIEW_INTERVAL_MS;
}

export function setupPreviewFpsLabel(fps: number | null | undefined, language: UiLanguage = "en"): string {
  if (normalizeSetupPreviewFps(fps) <= 0) {
    return language === "zh" ? "自动（默认 5 帧/秒）" : "Auto (5 fps default)";
  }
  if (language === "zh") return `${formatRateNumber(normalizeSetupPreviewFps(fps))} 帧/秒实时显示`;
  return `${formatRateNumber(normalizeSetupPreviewFps(fps))} fps live display`;
}

export function selectSetupTemperatureSerialPort(
  measurement: MeasurementDefinition,
  port: string
): MeasurementDefinition {
  return {
    ...measurement,
    detector_config: {
      ...measurement.detector_config,
      temperature_serial_port: port.trim()
    }
  };
}

export function shouldPollRealCameraPreview(
  page: SetupPageKind,
  source: SetupSourceKind,
  state: RealCameraPreviewState | null
): boolean {
  return page === "setup" && source === "real_camera" && state?.mode !== "frozen";
}

export function shouldReleaseRealCameraPreview(
  previousPage: SetupPageKind,
  previousSource: SetupSourceKind,
  nextPage: SetupPageKind,
  nextSource: SetupSourceKind
): boolean {
  return previousPage === "setup" && previousSource === "real_camera" && (
    nextPage !== "setup" || nextSource !== "real_camera"
  );
}

export function buildRealCameraRunCameraProfile(measurement: MeasurementDefinition): Record<string, unknown> {
  return {
    pixel_format: "mono8",
    target_frame_rate_hz: measurement.detector_config.live_offline_fps ?? 8
  };
}

export function shouldRefreshRealCameraFrameAfterRoiCommit(
  page: SetupPageKind,
  source: SetupSourceKind,
  state: RealCameraPreviewState | null
): boolean {
  return page === "setup" && source === "real_camera" && state?.mode === "live";
}

export function isRealCameraPreviewAffectingDetectorConfigKey(key: string): boolean {
  return REAL_CAMERA_PREVIEW_AFFECTING_DETECTOR_CONFIG_KEYS.has(key);
}

export function shouldRefreshRealCameraFrameAfterSetupChange(
  page: SetupPageKind,
  source: SetupSourceKind,
  state: RealCameraPreviewState | null,
  change: RealCameraSetupChange
): boolean {
  if (page !== "setup" || source !== "real_camera" || state?.mode !== "live") return false;
  if (change.kind === "detector_config") {
    return isRealCameraPreviewAffectingDetectorConfigKey(change.key);
  }
  return change.kind === "roi" || change.kind === "object_class" || change.kind === "detector" || change.kind === "width_mode";
}

export function planRealCameraSetupFrameUpdate({
  page,
  source,
  state,
  event
}: RealCameraSetupFrameUpdateInput): RealCameraSetupFrameUpdatePlan {
  if (page !== "setup" || source !== "real_camera") {
    return {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "not_real_camera_setup"
    };
  }
  if (event.kind === "temperature_config" || event.kind === "temperature_action") {
    return {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "temperature_does_not_affect_preview"
    };
  }
  if (event.kind === "analysis_parameters") {
    return {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "analysis_does_not_affect_preview"
    };
  }
  if (state?.mode === "frozen") {
    if (
      event.kind === "detector_config" ||
      event.kind === "object_class" ||
      event.kind === "detector" ||
      event.kind === "width_mode"
    ) {
      return {
        refreshFrame: false,
        refreshProbe: true,
        keepCurrentFrame: true,
        reason: "frozen_detector_overlay_update"
      };
    }
    return {
      refreshFrame: false,
      refreshProbe: false,
      keepCurrentFrame: true,
      reason: "frozen_frame"
    };
  }
  if (event.kind === "roi_apply") {
    return {
      refreshFrame: true,
      refreshProbe: false,
      keepCurrentFrame: false,
      reason: "live_roi_apply"
    };
  }
  if (
    event.kind === "object_class" ||
    event.kind === "detector" ||
    event.kind === "width_mode" ||
    (event.kind === "detector_config" && isRealCameraPreviewAffectingDetectorConfigKey(event.key))
  ) {
    return {
      refreshFrame: true,
      refreshProbe: true,
      keepCurrentFrame: false,
      reason: "detector_preview_affecting_change"
    };
  }
  return {
    refreshFrame: false,
    refreshProbe: false,
    keepCurrentFrame: true,
    reason: "analysis_does_not_affect_preview"
  };
}

export function frozenFrameSetupChangeMessage(
  page: SetupPageKind,
  source: SetupSourceKind,
  state: RealCameraPreviewState | null,
  language: UiLanguage = "en"
): string {
  if (page === "setup" && source === "real_camera" && state?.mode === "frozen") {
    if (language === "zh") {
      return "当前使用冻结画面：测量区域和检测参数会作用在这张冻结图上。需要查看最新相机画面时，请采集新的配置画面或恢复实时显示。";
    }
    return "Frozen frame: ROI and detector parameters update on the frozen image. Use Capture new setup frame or Resume live to view the latest camera frame.";
  }
  return "";
}

export function updateRealCameraPreviewState(
  previous: RealCameraPreviewState | null,
  frame: RealCameraPreviewFrameLike,
  roi: RotatedROI | null,
  mode: RealCameraPreviewMode
): RealCameraPreviewState {
  const previousShape = previous?.shape ?? [];
  const nextShape = normalizeShape(frame.shape);
  const shapeChanged = previousShape.length > 0 && !sameShape(previousShape, nextShape);
  const shapeChangeMessage = shapeChanged
    ? `Frame shape changed from ${shapeLabel(previousShape)} to ${shapeLabel(nextShape)}; confirm ROI before formal run.`
    : previous?.shapeChangeMessage ?? "";
  const roiNeedsReconfirm = shapeChanged || previous?.roiNeedsReconfirm || false;
  return {
    mode,
    timestampMs: frame.timestamp_ms,
    frozenTimestampMs: mode === "frozen" ? frame.timestamp_ms : null,
    shape: nextShape,
    cameraStatus: frame.camera_status,
    roi,
    roiNeedsReconfirm,
    shapeChangeMessage: roiNeedsReconfirm ? shapeChangeMessage : ""
  };
}

export function freezePreview(state: RealCameraPreviewState | null): RealCameraPreviewState {
  return {
    mode: "frozen",
    timestampMs: state?.timestampMs ?? null,
    frozenTimestampMs: state?.timestampMs ?? null,
    shape: state?.shape ?? [],
    cameraStatus: state?.cameraStatus ?? "unknown",
    roi: state?.roi ?? null,
    roiNeedsReconfirm: state?.roiNeedsReconfirm ?? false,
    shapeChangeMessage: state?.shapeChangeMessage ?? ""
  };
}

export function resumeLivePreview(state: RealCameraPreviewState | null): RealCameraPreviewState {
  return {
    mode: "live",
    timestampMs: state?.timestampMs ?? null,
    frozenTimestampMs: null,
    shape: state?.shape ?? [],
    cameraStatus: state?.cameraStatus ?? "unknown",
    roi: state?.roi ?? null,
    roiNeedsReconfirm: state?.roiNeedsReconfirm ?? false,
    shapeChangeMessage: state?.shapeChangeMessage ?? ""
  };
}

export function confirmPreviewRoi(state: RealCameraPreviewState | null, roi: RotatedROI | null): RealCameraPreviewState | null {
  if (!state) return state;
  return {
    ...state,
    roi,
    roiNeedsReconfirm: false,
    shapeChangeMessage: ""
  };
}

export function runModeForSetupSource(source: SetupSourceKind, language: UiLanguage = "en"): SetupRunMode {
  if (source === "real_camera") {
    return {
      kind: "real_camera_run",
      startLabel: uiText(language, "Start real camera run"),
      pendingLabel: uiText(language, "Running"),
      allowsPreviewAction: false
    };
  }
  return {
    kind: "live_offline_run",
    startLabel: uiText(language, "Start full offline run"),
    pendingLabel: uiText(language, "Running"),
    allowsPreviewAction: false
  };
}

export function buildRunSetupSummary(
  source: SetupSourceKind,
  datasetId: string,
  measurement: MeasurementDefinition,
  language: UiLanguage = "en"
): RunSetupSummary {
  return {
    sourceLabel: source === "real_camera" ? uiText(language, "Real camera") : uiText(language, "Offline dataset"),
    sourceId: source === "real_camera" ? uiText(language, "real_camera") : datasetId,
    roiCenter: `${formatNumber(measurement.roi.center_x)}, ${formatNumber(measurement.roi.center_y)}`,
    roiSize: `${formatNumber(measurement.roi.width)} × ${formatNumber(measurement.roi.height)}`,
    roiAngle: `${formatNumber(measurement.roi.angle_deg)}°`,
    objectClass: uiObjectClass(language, measurement.object_class),
    detector: measurement.detector,
    widthMode: uiWidthMode(language, measurement.width_mode),
    maxFramesPerRun:
      source === "real_camera"
        ? uiText(language, "No frame limit")
        : formatNumber(measurement.detector_config.max_frames_per_run ?? 160, 0),
    targetFps: formatCompactNumber(measurement.detector_config.live_offline_fps ?? 8),
    targetTemperatureCelsius:
      measurement.detector_config.target_temperature_celsius == null
        ? uiNone(language)
        : `${formatNumber(measurement.detector_config.target_temperature_celsius)} °C`,
    temperaturePowerPercent: `${formatNumber(measurement.detector_config.temperature_power_percent ?? 100, 0)} %`
  };
}

export function runResultMatchesSetupSource(
  source: SetupSourceKind,
  datasetId: string,
  manifestDatasetId: string | null | undefined
): boolean {
  if (!manifestDatasetId) return false;
  return source === "real_camera" ? manifestDatasetId === "real_camera" : manifestDatasetId === datasetId;
}

export function buildSetupTemperatureSummary(
  measurement: MeasurementDefinition,
  temperatureStatus: TemperatureStatusResponse | null,
  serialPorts: SerialPortInfo[],
  temperatureError: SetupTemperatureError | null,
  fallbackTemperature: number | null = null,
  language: UiLanguage = "en"
): SetupTemperatureSummary {
  const currentTemperature = temperatureStatus?.reading.celsius ?? fallbackTemperature;
  const statusError = temperatureStatus?.reading.error || "";
  return {
    status: uiStatus(language, temperatureStatus?.temperature_status ?? temperatureError?.temperature_status ?? "Not read"),
    currentTemperature: formatTemperatureValue(currentTemperature, language),
    source: temperatureStatus?.reading.source || uiNone(language),
    timestamp:
      temperatureStatus?.reading.timestamp_ms == null
        ? uiNone(language)
        : String(temperatureStatus.reading.timestamp_ms),
    targetTemperatureCelsius:
      measurement.detector_config.target_temperature_celsius == null
        ? uiNone(language)
        : `${formatNumber(measurement.detector_config.target_temperature_celsius)} °C`,
    temperaturePowerPercent: `${formatNumber(measurement.detector_config.temperature_power_percent ?? 100, 0)} %`,
    selectedPort: measurement.detector_config.temperature_serial_port?.trim() || uiNone(language),
    ports: serialPorts.length ? serialPorts.map((port) => port.device || port.name).join(", ") : uiNone(language),
    portCount: String(serialPorts.length),
    error: statusError || temperatureError?.message || uiNone(language)
  };
}

function fitRoiToShape(roi: RotatedROI, width: number, height: number, resetSize: boolean): RotatedROI {
  const nextWidth = resetSize ? width * 0.62 : roi.width;
  const nextHeight = resetSize ? height * 0.28 : roi.height;
  return {
    type: "rotated_rect",
    center_x: round2(clamp(roi.center_x, 0, width)),
    center_y: round2(clamp(roi.center_y, 0, height)),
    width: round2(clamp(nextWidth, 1, width)),
    height: round2(clamp(nextHeight, 1, height)),
    angle_deg: roi.angle_deg
  };
}

function positiveDimension(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "None";
  return digits === 0 ? Math.round(value).toLocaleString() : value.toFixed(digits);
}

function formatTemperatureValue(value: number | null | undefined, language: UiLanguage = "en"): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} °C` : uiNone(language);
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "None";
  return Number.isInteger(value) ? Math.round(value).toLocaleString() : value.toFixed(2);
}

function formatRateNumber(value: number): string {
  if (!Number.isFinite(value)) return "None";
  return String(Number(value.toFixed(2)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeShape(shape: number[]): number[] {
  return shape.map((value) => positiveDimension(value));
}

function sameShape(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function shapeLabel(shape: number[]): string {
  return shape.length ? shape.join(" x ") : "unknown";
}
