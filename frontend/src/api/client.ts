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
  dark_enhance_bg_kernel_px?: number;
  hysteresis_low_ratio?: number;
  min_component_area_px?: number;
  envelope_quantile?: number;
  envelope_window_px?: number;
  envelope_step_px?: number;
  min_window_pixels?: number;
  window_width_keep_ratio?: number;
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
  run_detector_mode?: "fast" | "enhanced" | "diagnostics";
  run_diagnostics_mode?: "off" | "suspicious_only" | "every_frame";
  run_preview_fps?: number;
  run_result_batch_size?: number;
  run_enhanced_detector_on_suspicious?: boolean;
  endpoint_jump_limit_px?: number;
  suspicious_boundary_reject_ratio?: number;
  suspicious_outlier_reject_count?: number;
  max_frames_per_run?: number;
  live_offline_fps?: number;
  target_temperature_celsius?: number | null;
  temperature_power_percent?: number;
};

export type MeasurementDefinition = {
  measurement_id: string;
  source: "offline_dataset" | "real_camera";
  object_class: string;
  detector: string;
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
  distance_px: number | null;
  raw_best_candidate: DetectionCandidate | null;
  selected_candidate: DetectionCandidate | null;
  rejected_candidates: DetectionCandidate[];
  quality: {
    confidence: number;
    edge_strength: number | null;
    contour_area: number | null;
    roi_coverage: number | null;
    jump_from_previous_px: number | null;
  };
  rejected_reason: string;
  debug_artifacts: Record<string, unknown>;
  temperature_sync_status: string;
  frame_timestamp_ms: number | null;
  temperature_timestamp_ms: number | null;
  temperature_celsius: number | null;
  temperature_delta_ms: number | null;
  temperature_source: string;
  temperature_sampled_this_frame: boolean;
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
};

export type FrameRecord = {
  frame_index: number;
  frame_path: string;
  timestamp_ms: number | null;
  shape: number[];
  dtype: string;
  source: string;
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
  all_frames: DetectionResult[];
  distance_time: CurvePoint[];
  temperature_time: CurvePoint[];
  temperature_distance: CurvePoint[];
  afas_preprocessing: Record<string, unknown>;
  afas_analysis: Record<string, unknown>;
  export_artifacts: ExportArtifact[];
  created_at: string;
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

export type LiveOfflineFrameEvent = {
  event: "frame";
  run_id: string;
  dataset_id: string;
  frame_index: number;
  frame_count: number;
  total_frames: number;
  processed_frames: number;
  frame_url: string;
  frame_record: FrameRecord;
  temperature_record: TemperatureRecord;
  detection_result: DetectionResult;
  curve_points: {
    distance_time: CurvePoint | null;
    temperature_time: CurvePoint | null;
    temperature_distance: CurvePoint | null;
  };
  afas_preprocessing: Record<string, unknown>;
  afas_analysis: Record<string, unknown>;
};

export type LiveOfflineCompleteEvent = {
  event: "complete";
  run_manifest: RunManifest;
  analysis_result: AnalysisResult;
};

export type LiveOfflineErrorEvent = {
  event: "error";
  message: string;
  issues?: Array<{ field: string; path: string; message: string }>;
};

export type LiveOfflineRunStreamEvent =
  | LiveOfflineFrameEvent
  | LiveOfflineCompleteEvent
  | LiveOfflineErrorEvent;

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
};

export type RealCameraSetupProbeResponse = ProbeResponse &
  CameraPreviewResponse & {
    image_data_url: string;
  };

export type ApiErrorDetail = {
  camera_status?: string;
  temperature_status?: string;
  message?: string;
  details?: Record<string, unknown>;
  issues?: Array<{ field: string; path: string; message: string }>;
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
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
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
  result.mask = readDiagnosticImage(source.mask, "Detected mask") ?? undefined;
  result.contour = readDiagnosticImage(source.contour, "Envelope contour") ?? undefined;
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
  }
): Promise<RealCameraSetupProbeResponse> {
  const response = await fetch(`${API_BASE}/api/camera/setup-probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      measurement_definition: backendMeasurementDefinition(measurementDefinition),
      frame_png_data_url: options?.framePngDataUrl,
      frame_timestamp_ms: options?.frameTimestampMs,
      camera_meta: options?.cameraMeta
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

export function realCameraPreviewImageUrl(cacheKey: number): string {
  return `${API_BASE}/api/camera/preview.png?t=${cacheKey}`;
}

export async function getTemperatureStatus(): Promise<TemperatureStatusResponse> {
  return requestJson<TemperatureStatusResponse>("/api/temperature/status");
}

export async function listTemperatureSerialPorts(): Promise<SerialPortInfo[]> {
  const payload = await requestJson<{ ports: SerialPortInfo[] }>("/api/temperature/serial-ports");
  return payload.ports;
}

export async function createRealCameraRun(
  measurementDefinition: MeasurementDefinition,
  options: { maxFrames: number; targetFps: number; cameraProfile?: Record<string, unknown> }
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/api/real-camera-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_frames: options.maxFrames,
      target_fps: options.targetFps,
      camera_profile: options.cameraProfile ?? { pixel_format: "mono8" },
      measurement_definition: backendMeasurementDefinition(measurementDefinition)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<RunResponse>;
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
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  const payload = (await response.json()) as { artifacts: ExportArtifact[] };
  return payload.artifacts;
}

export function artifactDownloadUrl(artifact: ExportArtifact): string {
  if (!artifact.download_url) return artifact.path;
  if (artifact.download_url.startsWith("http")) return artifact.download_url;
  return `${API_BASE}${artifact.download_url}`;
}
