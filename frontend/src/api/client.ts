export type OfflineDatasetListItem = {
  id: string;
  label: string;
  object_class: string;
  g3_type: string;
  default_detector: string;
  default_width_mode: string;
  frame_count: number;
  validation_issues?: Array<{ field: string; path: string; message: string }>;
};

export type FrameSummary = {
  frame_index: number;
  shape: number[];
  dtype: string;
};

export type OfflineDatasetSummary = {
  dataset: OfflineDatasetListItem;
  manifest: {
    frame_count: number;
    target_fps: number | null;
    achieved_fps: number | null;
    started_at_ms: number | null;
    camera_profile: string | null;
    temperature_csv: string | null;
    first_frame: Record<string, unknown> | null;
    last_frame: Record<string, unknown> | null;
  };
  temperature: {
    row_count: number;
    columns: string[];
    first_row: Record<string, string> | null;
    last_row: Record<string, string> | null;
  };
  first_frame: FrameSummary;
  last_frame: FrameSummary;
};

export type RotatedROI = {
  type: "rotated_rect";
  center_x: number;
  center_y: number;
  width: number;
  height: number;
  angle_deg: number;
};

export type DetectorConfig = {
  tie_width_epsilon_px?: number;
  switch_after_n_frames?: number;
  jump_limit_px?: number;
  min_confidence?: number;
  contrast_threshold?: number;
  dark_enhance_bg_kernel_px?: number;
  hysteresis_low_ratio?: number;
  min_component_area_px?: number;
  envelope_quantile?: number;
  envelope_window_px?: number;
  envelope_step_px?: number;
  min_window_pixels?: number;
  window_width_keep_ratio?: number;
  contour_close_kernel?: number;
  contour_smooth_window?: number;
  mask_open_kernel_px?: number;
  mask_close_kernel_px?: number;
  mask_dilate_kernel_px?: number;
  mesh_row_width_keep_ratio?: number;
  mesh_row_count_keep_ratio?: number;
  envelope_width_percentile?: number;
  envelope_width_outlier_epsilon_px?: number;
  envelope_min_consensus_rows?: number;
  boundary_support_window_px?: number;
  boundary_support_min_pixels?: number;
  boundary_support_min_ratio?: number;
  boundary_support_enabled?: boolean;
  distance_jump_limit_px?: number;
  distance_jump_hold_frames?: number;
  distance_jump_policy?: "hold_previous" | "mark_invalid";
  distance_outlier_filter_enabled?: boolean;
  distance_outlier_reference_count?: number;
  distance_outlier_max_jump_px?: number;
  distance_outlier_baseline?: "last" | "mean" | "median";
  temporal_stabilization_enabled?: boolean;
  temporal_stabilization_strength?: "weak" | "medium" | "strong";
  save_temporal_masks?: boolean;
  contour_box_mode?: "component_bbox" | "robust_component_bbox" | "measurement_band";
  contour_box_padding_px?: number;
  contour_box_quantile?: number;
  contour_box_min_coverage_ratio?: number;
  show_measurement_band_box?: boolean;
  roi_edge_guard_px?: number;
  detection_roi_padding_px?: number;
  bubble_suppress_enabled?: boolean;
  bubble_local_radius_px?: number;
  bubble_bright_z_threshold?: number;
  bubble_min_area_px?: number;
  bubble_max_area_px?: number;
  bubble_max_bbox_px?: number;
  bubble_max_aspect_ratio?: number;
  bubble_min_compactness?: number;
  bubble_suppress_radius_px?: number;
  bubble_suppress_measurement_only?: boolean;
  dark_line_filter_enabled?: boolean;
  dark_line_filter_length_px?: number;
  dark_line_filter_width_px?: number;
  dark_line_min_response?: number;
  endpoint_min_dark_line_response?: number;
  spur_prune_enabled?: boolean;
  spur_prune_max_length_px?: number;
  spur_prune_dilate_px?: number;
  spur_prune_min_ridge_response?: number;
  spur_prune_require_bubble_overlap_or_low_ridge?: boolean;
  processing_scale_enabled?: boolean;
  processing_scale?: number;
  processing_scale_mode?: "area_downsample" | "gaussian_pyramid";
  refine_endpoint_on_full_res?: boolean;
  full_res_refine_band_px?: number;
  detector_execution_mode?: "fast" | "enhanced" | "diagnostics";
  show_advanced_diagnostics?: boolean;
  run_detector_mode?: "fast" | "enhanced" | "diagnostics";
  run_diagnostics_mode?: "off" | "suspicious_only" | "every_frame";
  run_preview_fps?: number;
  run_result_batch_size?: number;
  run_enhanced_detector_on_suspicious?: boolean;
  run_enhanced_detector_policy?: "never" | "rerun_worthy_only" | "all_suspicious";
  endpoint_jump_limit_px?: number;
  endpoint_jump_warmup_frames?: number;
  endpoint_jump_confirm_frames?: number;
  suspicious_boundary_reject_ratio?: number;
  suspicious_outlier_reject_count?: number;
  max_frames_per_run?: number;
  live_offline_fps?: number;
  setup_preview_fps?: number;
  target_temperature_celsius?: number | null;
  temperature_power_percent?: number;
  temperature_serial_port?: string;
};

export type SourceProvenance = {
  acquisition_source: "offline_dataset" | "camera_runtime" | "imported_file" | "unknown" | string;
  camera_backend: string;
  camera_backend_kind: "real_hardware" | "simulated_dataset" | "mock" | "unknown" | string;
  camera_is_simulated: boolean;
  camera_label: string;
  camera_serial: string;
  simulated_dataset_id: string;
  temperature_backend: string;
  temperature_backend_kind: "real_hardware" | "simulated" | "mock" | "unknown" | string;
  temperature_is_simulated: boolean;
  overall_kind: "real_hardware" | "simulated" | "mixed" | "offline" | "imported" | "unknown" | string;
  display_label_zh: string;
  display_label_en: string;
  imported_from_provenance?: SourceProvenance;
};

export type OperatorSourceStatus = {
  real_hardware_available: boolean;
  real_camera_available: boolean;
  real_temperature_available: boolean;
  camera_is_simulated: boolean;
  temperature_is_simulated: boolean;
  camera_label: string;
  camera_serial: string;
  camera_backend?: string;
  temperature_backend: string;
  temperature_serial_port_configured?: boolean;
  offline_datasets_available: boolean;
  errors: string[];
  warnings: string[];
  provenance?: SourceProvenance;
};

export type MeasurementDefinition = {
  measurement_id: string;
  source: "offline_dataset" | "real_camera";
  object_class: string;
  detector: string;
  detector_mode?: "default" | "c_envelope_legacy" | "contrast_widest_span";
  width_mode: "max_width" | "min_width";
  measurement_coordinates: "source_pixel";
  roi: RotatedROI;
  detector_config: DetectorConfig;
};

type BackendMeasurementDefinition = Omit<MeasurementDefinition, "source">;

export type ABPoint = { x: number; y: number };

export type DetectionCandidate = {
  candidate_id: string;
  axis_position_px: number;
  width_px: number;
  a: ABPoint;
  b: ABPoint;
  confidence: number;
  rejected_reason: string;
  metadata: Record<string, unknown>;
};

export type DetectionResult = {
  frame_index: number;
  detection_status: string;
  ab_points: { a: ABPoint; b: ABPoint } | null;
  measurement_segment: ABPoint[] | null;
  distance_px: number | null;
  raw_ab_points: { a: ABPoint; b: ABPoint } | null;
  raw_distance_px: number | null;
  stabilized_ab_points: { a: ABPoint; b: ABPoint } | null;
  stabilized_distance_px: number | null;
  result_display_source: "raw" | "stabilized";
  raw_best_candidate: DetectionCandidate | null;
  selected_candidate: DetectionCandidate | null;
  stabilized_candidate: DetectionCandidate | null;
  rejected_candidates: DetectionCandidate[];
  quality: {
    confidence: number;
    edge_strength: number | null;
    contour_area: number | null;
    roi_coverage: number | null;
    jump_from_previous_px: number | null;
  };
  rejected_reason: string;
  curve_point_status: string;
  curve_exclusion_reason: string;
  raw_detected_distance_px: number | null;
  distance_outlier_filtered: boolean;
  distance_outlier_baseline_px: number | null;
  distance_outlier_deviation_px: number | null;
  distance_outlier_max_jump_px: number | null;
  distance_outlier_reference_count: number | null;
  distance_outlier_reference_values: number[];
  debug_artifacts: Record<string, unknown>;
  temperature_sync_status: string;
  frame_timestamp_ms: number | null;
  temperature_timestamp_ms: number | null;
  temperature_celsius: number | null;
  temperature_delta_ms: number | null;
  temperature_source: string;
  temperature_sampled_this_frame: boolean;
  temp_sync_target_ms?: number | null;
};

export type DiagnosticImageInfo = {
  label: string;
  src: string;
  coordinates: string;
  width: number | null;
  height: number | null;
};

export type DiagnosticImages = DiagnosticImageInfo[] & {
  mask?: DiagnosticImageInfo;
  contour?: DiagnosticImageInfo;
};

export type ProbeResponse = {
  dataset_id: string;
  frame: FrameSummary & { timestamp_ms: number | null };
  measurement_definition: MeasurementDefinition;
  detection_result: DetectionResult;
  overlay: {
    roi: RotatedROI;
    ab_points: { a: ABPoint; b: ABPoint } | null;
    status: string;
  };
  image_data_url?: string;
  provenance?: SourceProvenance;
};

export type FrameRecord = {
  frame_index: number;
  shape: number[];
  dtype: string;
  source: string;
  frame_path: string;
  raw_frame_saved?: boolean;
  preview_path?: string;
  timestamp_ms: number | null;
  camera_meta: Record<string, unknown>;
};

export type TemperatureRecord = {
  timestamp_ms: number | null;
  celsius: number | null;
  source: string;
  sampled_this_frame: boolean;
  error: string;
};

export type RunManifest = {
  run_id: string;
  dataset_id: string;
  measurement_definition: MeasurementDefinition;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  provenance?: SourceProvenance;
  frame_records: FrameRecord[];
  temperature_records: TemperatureRecord[];
  detection_results: DetectionResult[];
  export_artifacts: ExportArtifact[];
  created_at: string;
  config_snapshot: Record<string, unknown>;
  software: Record<string, unknown>;
};

export type CurvePoint = {
  x: number;
  y: number;
  frame_index: number;
  sync_status: string | null;
};

export type ExportArtifact = {
  artifact_id: string;
  artifact_type: string;
  path: string;
  source_run_id: string | null;
  source_analysis_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  download_url?: string;
};

export type AnalysisResult = {
  analysis_id: string;
  run_id: string;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  provenance?: SourceProvenance;
  all_frames: DetectionResult[];
  distance_time: CurvePoint[];
  raw_distance_time: CurvePoint[];
  stabilized_distance_time: CurvePoint[];
  temperature_time: CurvePoint[];
  temperature_distance: CurvePoint[];
  raw_temperature_distance: CurvePoint[];
  stabilized_temperature_distance: CurvePoint[];
  afas_preprocessing: Record<string, unknown>;
  afas_analysis: Record<string, unknown>;
  export_artifacts: ExportArtifact[];
  created_at: string;
  sync_config?: SyncConfig;
  config_snapshot?: Record<string, unknown>;
};

export type SyncConfig = {
  temp_sync_target_ms?: number | null;
};

export type AfasPreprocessingParameters = {
  group_by_temperature: boolean;
  outlier_window: number;
  outlier_threshold: number;
  outlier_max_iterations: number;
  savgol_window_length: number;
  savgol_polyorder: number;
};

export type AfasAnalysisParameters = {
  low_range_celsius: [number, number] | null;
  high_range_celsius: [number, number] | null;
  tangent_offset: number;
};

export type RunResponse = {
  run_manifest: RunManifest;
  analysis_result: AnalysisResult;
};

export type RunAvailability = {
  run_id: string;
  exists: boolean;
  manifest_exists: boolean;
  analysis_exists: boolean;
};

export type RealCameraStopResponse = {
  run_id: string;
  stop_requested: boolean;
  already_complete: boolean;
};

export type LiveOfflineFrameEvent = {
  event: "frame";
  run_id: string;
  dataset_id: string;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  provenance?: SourceProvenance;
  frame_index: number;
  frame_count: number;
  total_frames: number;
  processed_frames: number;
  frame_url: string;
  frame_record: FrameRecord;
  temperature_record: TemperatureRecord;
  detection_result: DetectionResult;
  storage?: {
    save_raw_frames?: boolean;
    raw_frame_saved?: boolean;
    save_preview_frames?: boolean;
    preview_path?: string;
  };
  sync_config?: SyncConfig;
  curve_points: {
    distance_time: CurvePoint | null;
    temperature_time: CurvePoint | null;
    temperature_distance: CurvePoint | null;
    raw_distance_time?: CurvePoint | null;
    raw_temperature_distance?: CurvePoint | null;
    stabilized_distance_time?: CurvePoint | null;
    stabilized_temperature_distance?: CurvePoint | null;
  };
  afas_preprocessing: Record<string, unknown>;
  afas_analysis: Record<string, unknown>;
};

export type LiveOfflineCompleteEvent = {
  event: "complete";
  run_manifest: RunManifest;
  analysis_result: AnalysisResult;
};

export type LiveOfflineProgressEvent = {
  event: "stopping" | "saving_manifest" | "building_analysis";
  run_id: string;
  dataset_id?: string;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  processed_frames: number;
  frame_count: number;
  total_frames: number;
  stop_reason?: string;
};

export type LiveOfflineErrorEvent = {
  event: "error";
  message: string;
  issues?: Array<{ field: string; path: string; message: string }>;
};

export type LiveOfflineRunStreamEvent =
  | LiveOfflineFrameEvent
  | LiveOfflineProgressEvent
  | LiveOfflineCompleteEvent
  | LiveOfflineErrorEvent;

export type RealCameraRunStreamEvent = LiveOfflineRunStreamEvent;

export type CameraPreviewResponse = {
  camera_status: string;
  timestamp_ms: number | null;
  shape: number[];
  dtype: string;
  model: string;
  serial_number: string;
  ip: string;
  pixel_format: string;
  camera_meta: Record<string, unknown>;
  image_data_url?: string;
  provenance?: SourceProvenance;
};

export type RealCameraSetupProbeResponse = ProbeResponse &
  CameraPreviewResponse & {
  image_data_url: string;
};

export type CameraPreviewReleaseResponse = {
  camera_status: string;
};

export type ApiErrorDetail = {
  camera_status?: string;
  temperature_status?: string;
  message?: string;
  details?: Record<string, unknown>;
  issues?: Array<{ field: string; path: string; message: string }>;
};

export type ExportDownloadResult = {
  filename: string;
  size: number;
};

export type ImportedFrameSummary = {
  total_frames: number;
  valid_frames: number;
  temperature_distance_points: number;
  invalid_reason_counts: Record<string, number>;
};

export type ImportedRunView = {
  filename: string;
  warnings: string[];
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  provenance?: SourceProvenance;
  run_manifest: RunManifest | null;
  analysis_result: AnalysisResult | null;
  measurement_definition: MeasurementDefinition | null;
  frame_summary: ImportedFrameSummary;
  temperature_distance_image_data_url: string | null;
};

type BlobDownloadAnchor = {
  href: string;
  download: string;
  click(): void;
  remove(): void;
};

type BlobDownloadDocument = {
  body: {
    appendChild(node: BlobDownloadAnchor): unknown;
  };
  createElement(tagName: "a"): BlobDownloadAnchor;
};

type BlobDownloadUrlFactory = {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
};

export type ExportDownloadOptions = {
  document?: BlobDownloadDocument;
  url?: BlobDownloadUrlFactory;
};

export type SerialPortInfo = {
  device: string;
  name: string;
  description: string;
  hwid: string;
};

export type TemperatureStatusResponse = {
  temperature_status: string;
  reading: {
    timestamp_ms: number | null;
    celsius: number | null;
    source: string;
    error: string;
  };
};

const API_BASE = import.meta.env?.VITE_G3_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  statusText: string;
  detail: ApiErrorDetail | string | null;
  body: string;

  constructor({
    body,
    detail,
    status,
    statusText
  }: {
    body: string;
    detail: ApiErrorDetail | string | null;
    status: number;
    statusText: string;
  }) {
    const message =
      typeof detail === "object" && detail !== null && typeof detail.message === "string"
        ? detail.message
        : `${status} ${statusText}: ${body}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
    this.body = body;
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<T>;
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const body = await response.text();
  let detail: ApiErrorDetail | string | null = null;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      detail = parsed.detail;
    } else if (typeof parsed.detail === "object" && parsed.detail !== null) {
      detail = parsed.detail as ApiErrorDetail;
    }
  } catch {
    detail = null;
  }
  return new ApiError({
    body,
    detail,
    status: response.status,
    statusText: response.statusText
  });
}

export async function listOfflineDatasets(): Promise<OfflineDatasetListItem[]> {
  const payload = await requestJson<{ datasets: OfflineDatasetListItem[] }>(
    "/api/offline-datasets"
  );
  return payload.datasets;
}

export async function getOfflineDatasetSummary(
  datasetId: string
): Promise<OfflineDatasetSummary> {
  return requestJson<OfflineDatasetSummary>(`/api/offline-datasets/${datasetId}`);
}

type FrameImageUrlOptions = {
  maxWidth?: number;
};

export function frameImageUrl(
  datasetId: string,
  frameSelector: "first" | "last",
  options?: FrameImageUrlOptions
): string {
  return withFrameImageUrlOptions(
    `${API_BASE}/api/offline-datasets/${datasetId}/frames/${frameSelector}.png`,
    options
  );
}

export function frameIndexImageUrl(
  datasetId: string,
  frameIndex: number,
  options?: FrameImageUrlOptions
): string {
  return withFrameImageUrlOptions(
    `${API_BASE}/api/offline-datasets/${datasetId}/frames/${frameIndex}.png`,
    options
  );
}

export function buildRunFrameImageUrl(
  apiBase: string,
  runId: string,
  frameIndex: number,
  options?: FrameImageUrlOptions
): string {
  return withFrameImageUrlOptions(
    `${apiBase}/api/runs/${encodeURIComponent(runId)}/frames/${frameIndex}.png`,
    options
  );
}

export function runFrameImageUrl(
  runId: string,
  frameIndex: number,
  options?: FrameImageUrlOptions
): string {
  return buildRunFrameImageUrl(API_BASE, runId, frameIndex, options);
}

export function isRunFrameImageUrl(url: string, runId: string, frameIndex: number): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.pathname ===
      `/api/runs/${encodeURIComponent(runId)}/frames/${frameIndex}.png`
    );
  } catch {
    return false;
  }
}

export function apiUrlFromPath(path: string, options?: FrameImageUrlOptions): string {
  const normalizedPath = path.trim();
  if (!normalizedPath) return "";
  const url = normalizedPath.startsWith("http")
    ? normalizedPath
    : `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  return withFrameImageUrlOptions(url, options);
}

export function readDiagnosticImages(debugArtifacts: Record<string, unknown> | null | undefined): DiagnosticImages | null {
  if (!debugArtifacts || typeof debugArtifacts !== "object") return null;
  const diagnosticImages = debugArtifacts.diagnostic_images;
  if (!diagnosticImages || typeof diagnosticImages !== "object") return null;
  const source = diagnosticImages as Record<string, unknown>;
  const images = Object.entries(source)
    .map(([key, value]) => readDiagnosticImage(value, key))
    .filter((image): image is DiagnosticImageInfo => image !== null);
  if (images.length === 0) return null;
  const result = images as DiagnosticImages;
  result.mask =
    readDiagnosticImage(source.detected_mask, "Detected mask") ??
    readDiagnosticImage(source.mask, "Detected mask") ??
    undefined;
  result.contour =
    readDiagnosticImage(source.envelope_contour, "Envelope contour") ??
    readDiagnosticImage(source.contour, "Envelope contour") ??
    undefined;
  return result;
}

function readDiagnosticImage(value: unknown, fallbackLabel: string): DiagnosticImageInfo | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const rawSource = stringFromUnknown(item.data_url) ?? stringFromUnknown(item.url) ?? stringFromUnknown(item.src);
  if (!rawSource) return null;
  const src = rawSource.startsWith("data:") ? rawSource : apiUrlFromPath(rawSource);
  return {
    label: stringFromUnknown(item.label) ?? fallbackLabel,
    src,
    coordinates: stringFromUnknown(item.coordinates) ?? "roi_local_pixel",
    width: numberFromUnknown(item.width),
    height: numberFromUnknown(item.height)
  };
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function withFrameImageUrlOptions(url: string, options?: FrameImageUrlOptions): string {
  if (!options?.maxWidth) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}max_width=${encodeURIComponent(Math.round(options.maxWidth))}`;
}

export async function probeFrame(
  datasetId: string,
  frameIndex: number,
  measurementDefinition: MeasurementDefinition
): Promise<ProbeResponse> {
  const response = await fetch(`${API_BASE}/api/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_id: datasetId,
      frame_index: frameIndex,
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<ProbeResponse>;
}

export async function probeRealCameraSetupFrame(
  measurementDefinition: MeasurementDefinition,
  options?: {
    framePngDataUrl?: string;
    frameTimestampMs?: number | null;
    cameraMeta?: Record<string, unknown>;
    operatorMode?: boolean;
    operatorDataSource?: "real_camera" | "offline_dataset";
  }
): Promise<RealCameraSetupProbeResponse> {
  const response = await fetch(`${API_BASE}/api/camera/setup-probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      measurement_definition: backendMeasurementDefinition(measurementDefinition),
      frame_png_data_url: options?.framePngDataUrl,
      frame_timestamp_ms: options?.frameTimestampMs,
      camera_meta: options?.cameraMeta,
      operator_mode: options?.operatorMode,
      operator_data_source: options?.operatorDataSource
    })
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<RealCameraSetupProbeResponse>;
}

export async function createLiveOfflineRun(
  datasetId: string,
  measurementDefinition: MeasurementDefinition,
  options: { startFrame: number; maxFrames?: number; targetFps: number }
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/live-offline-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataset_id: datasetId,
      start_frame: options.startFrame,
      max_frames: options.maxFrames,
      target_fps: options.targetFps,
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<RunResponse>;
}

export async function streamLiveOfflineRun(
  datasetId: string,
  measurementDefinition: MeasurementDefinition,
  options: { startFrame: number; maxFrames?: number; targetFps: number; signal?: AbortSignal },
  onEvent: (event: LiveOfflineRunStreamEvent) => void
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/live-offline-runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      dataset_id: datasetId,
      start_frame: options.startFrame,
      max_frames: options.maxFrames,
      target_fps: options.targetFps,
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let complete: RunResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as LiveOfflineRunStreamEvent;
      onEvent(event);
      if (event.event === "error") {
        throw new Error(event.message);
      }
      if (event.event === "complete") {
        complete = {
          run_manifest: event.run_manifest,
          analysis_result: event.analysis_result
        };
      }
    }

    if (done) break;
  }

  if (buffered.trim()) {
    const event = JSON.parse(buffered) as LiveOfflineRunStreamEvent;
    onEvent(event);
    if (event.event === "error") {
      throw new Error(event.message);
    }
    if (event.event === "complete") {
      complete = {
        run_manifest: event.run_manifest,
        analysis_result: event.analysis_result
      };
    }
  }

  if (!complete) {
    throw new Error("Live offline stream ended before the run completed");
  }
  return complete;
}

export async function previewRealCamera(): Promise<CameraPreviewResponse> {
  return requestJson<CameraPreviewResponse>("/api/camera/preview");
}

export async function getOperatorSourceStatus(): Promise<OperatorSourceStatus> {
  return requestJson<OperatorSourceStatus>("/api/operator/source-status");
}

export async function releaseRealCameraPreview(): Promise<CameraPreviewReleaseResponse> {
  const response = await fetch(`${API_BASE}/api/camera/preview/release`, { method: "POST" });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<CameraPreviewReleaseResponse>;
}

export function realCameraPreviewImageUrl(cacheKey: number): string {
  return `${API_BASE}/api/camera/preview.png?t=${cacheKey}`;
}

export async function getTemperatureStatus(options: { port?: string } = {}): Promise<TemperatureStatusResponse> {
  const params = new URLSearchParams();
  const port = options.port?.trim();
  if (port) params.set("port", port);
  const query = params.toString();
  return requestJson<TemperatureStatusResponse>(`/api/temperature/status${query ? `?${query}` : ""}`);
}

export async function listTemperatureSerialPorts(): Promise<SerialPortInfo[]> {
  const payload = await requestJson<{ ports: SerialPortInfo[] }>("/api/temperature/serial-ports");
  return payload.ports;
}

export async function createRealCameraRun(
  measurementDefinition: MeasurementDefinition,
  options: {
    maxFrames?: number;
    targetFps: number;
    cameraProfile?: Record<string, unknown>;
    operatorMode?: boolean;
    operatorDataSource?: "real_camera" | "offline_dataset";
  }
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/real-camera-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_frames: options.maxFrames,
      target_fps: options.targetFps,
      camera_profile: options.cameraProfile ?? { pixel_format: "mono8" },
      operator_mode: options.operatorMode,
      operator_data_source: options.operatorDataSource,
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<RunResponse>;
}

export async function streamRealCameraRun(
  measurementDefinition: MeasurementDefinition,
  options: {
    maxFrames?: number;
    targetFps: number;
    cameraProfile?: Record<string, unknown>;
    signal?: AbortSignal;
    operatorMode?: boolean;
    operatorDataSource?: "real_camera" | "offline_dataset";
  },
  onEvent: (event: RealCameraRunStreamEvent) => void
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/real-camera-runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      max_frames: options.maxFrames,
      target_fps: options.targetFps,
      camera_profile: options.cameraProfile ?? { pixel_format: "mono8" },
      operator_mode: options.operatorMode,
      operator_data_source: options.operatorDataSource,
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let complete: RunResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as RealCameraRunStreamEvent;
      onEvent(event);
      if (event.event === "error") {
        throw new Error(event.message);
      }
      if (event.event === "complete") {
        complete = {
          run_manifest: event.run_manifest,
          analysis_result: event.analysis_result
        };
      }
    }

    if (done) break;
  }

  if (buffered.trim()) {
    const event = JSON.parse(buffered) as RealCameraRunStreamEvent;
    onEvent(event);
    if (event.event === "error") {
      throw new Error(event.message);
    }
    if (event.event === "complete") {
      complete = {
        run_manifest: event.run_manifest,
        analysis_result: event.analysis_result
      };
    }
  }

  if (!complete) {
    throw new Error("Real camera stream ended before the run completed");
  }
  return complete;
}

export async function stopRealCameraRun(runId: string): Promise<RealCameraStopResponse> {
  const response = await fetch(`${API_BASE}/api/real-camera-runs/${runId}/stop`, {
    method: "POST"
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<RealCameraStopResponse>;
}

function backendMeasurementDefinition(
  measurementDefinition: MeasurementDefinition
): BackendMeasurementDefinition {
  const { source: _source, ...backendDefinition } = measurementDefinition;
  return backendDefinition;
}

export async function getRun(runId: string): Promise<RunResponse> {
  return requestJson<RunResponse>(`/api/runs/${runId}`);
}

export async function getRunAvailability(runId: string): Promise<RunAvailability> {
  return requestJson<RunAvailability>(`/api/runs/${runId}/availability`);
}

export async function recomputeRunAnalysis(
  runId: string,
  parameters: {
    afas_preprocessing_parameters: AfasPreprocessingParameters;
    afas_analysis_parameters: AfasAnalysisParameters;
  }
): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parameters)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  const payload = await response.json() as { analysis_result: AnalysisResult };
  return payload.analysis_result;
}

export async function createRunExports(runId: string): Promise<ExportArtifact[]> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}/exports`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `导出失败：后端返回 ${response.status}`));
  }
  const payload = (await response.json()) as { artifacts: ExportArtifact[] };
  return payload.artifacts;
}

export async function downloadRunExportBundle(
  runId: string,
  options: ExportDownloadOptions = {}
): Promise<ExportDownloadResult> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}/exports/download`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `导出失败：后端返回 ${response.status}`));
  }
  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("导出失败：后端返回空文件");
  }
  const filename = parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    `yyt1771-g3-export-${runId}.zip`;
  triggerBlobDownload(blob, filename, options);
  return { filename, size: blob.size };
}

export async function importRunExportFile(file: File): Promise<ImportedRunView> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/imports/run-export`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `导入失败：后端返回 ${response.status}`));
  }
  return response.json() as Promise<ImportedRunView>;
}

export function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) return null;
  const starMatch = /(?:^|;)\s*filename\*=([^;]+)/i.exec(value);
  if (starMatch) {
    const raw = starMatch[1].trim();
    const encoded = raw.replace(/^UTF-8''/i, "").replace(/^"(.*)"$/, "$1");
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded || null;
    }
  }
  const match = /(?:^|;)\s*filename=([^;]+)/i.exec(value);
  if (!match) return null;
  const filename = match[1].trim().replace(/^"(.*)"$/, "$1");
  return filename || null;
}

export function artifactDownloadUrl(artifact: ExportArtifact): string {
  if (!artifact.download_url) return artifact.path;
  if (artifact.download_url.startsWith("http")) return artifact.download_url;
  return `${API_BASE}${artifact.download_url}`;
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json() as { detail?: unknown; message?: unknown };
      const detail = payload.detail;
      if (typeof detail === "string" && detail.trim()) return detail;
      if (detail && typeof detail === "object") {
        const message = (detail as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message;
      }
      if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
    } catch {
      return fallback;
    }
  }
  try {
    const body = await response.text();
    return body.trim() ? `${fallback}: ${body}` : fallback;
  } catch {
    return fallback;
  }
}

function triggerBlobDownload(blob: Blob, filename: string, options: ExportDownloadOptions): void {
  const doc = (options.document ?? globalThis.document) as BlobDownloadDocument | undefined;
  const urlFactory = options.url ?? globalThis.URL;
  if (!doc || !urlFactory?.createObjectURL || !urlFactory?.revokeObjectURL) {
    throw new Error("导出失败：当前浏览器不支持文件下载");
  }
  const url = urlFactory.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    urlFactory.revokeObjectURL(url);
  }
}
