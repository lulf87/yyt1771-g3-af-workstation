const API_REGION_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4"
] as const;

export type OfflineDatasetListItem = {
  id: string;
  label: string;
  object_class: string;
  g3_type: string;
  default_detector: string;
  default_width_mode: string;
  legacy_profile?: Record<string, string>;
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

export type MeasurementRegion = {
  region_id: string;
  index: number;
  label: string;
  enabled: boolean;
  roi: RotatedROI;
  color: string;
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
  runtime_source: "real_hardware" | "simulated_material";
  product_mode: "production" | "development";
  configuration_valid: boolean;
  configuration_error_zh: string;
  configuration_error_en: string;
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

export type AppRuntime = {
  runtime_source: "real_hardware" | "simulated_material";
  display_label_zh: string;
  display_label_en: string;
  simulation_enabled: boolean;
  simulation_allowed: boolean;
  product_mode: "production" | "development";
  production_mode: boolean;
  simulated_dataset_id: string;
};

export type HardwareSetupCheckStatus = "passed" | "failed" | "warning" | string;

export type HardwareSetupCheck = {
  id: string;
  label: string;
  status: HardwareSetupCheckStatus;
  message: string;
  suggestion: string;
  details: Record<string, unknown>;
};

export type HardwareSetupEnvironment = {
  overall_status: "passed" | "failed" | string;
  checks: HardwareSetupCheck[];
};

export type HardwareSdkPathsSaveResponse = {
  saved: boolean;
  config_path: string;
  sdk_python_paths: string[];
  sdk_library_path: string;
  environment: HardwareSetupEnvironment;
};

export type HardwareCameraDevice = {
  backend: string;
  transport: string;
  model: string;
  serial_number: string;
  ip: string;
  user_defined_name: string;
  is_supported_model: boolean;
  is_selected: boolean;
};

export type CameraExposureIdentity = Pick<
  HardwareCameraDevice,
  "backend" | "transport" | "model" | "serial_number" | "ip" | "user_defined_name"
>;

export type CameraExposureState = {
  supported: boolean;
  minimum_us: number | null;
  maximum_us: number | null;
  increment_us: number | null;
  requested_us: number | null;
  actual_us: number | null;
  saved: boolean;
  editable: boolean;
  lock_reason: string;
};

export type CameraExposureUpdateState = Omit<CameraExposureState, "actual_us"> & {
  actual_us: number;
};

export type HardwareTemperatureBinding = {
  backend: "lu92xx_modbus_rtu" | string;
  serial_port: string;
  baudrate?: number | null;
  slave_address?: number | null;
};

export type HardwareBinding = {
  camera: HardwareCameraDevice;
  temperature: HardwareTemperatureBinding;
};

export type HardwareBindingTestItem = {
  status: "passed" | "failed" | string;
  message: string;
  suggestion: string;
  details: Record<string, unknown>;
};

export type HardwareBindingTestResponse = {
  overall_status: "passed" | "failed" | string;
  camera: HardwareBindingTestItem;
  temperature: HardwareBindingTestItem;
};

export type HardwareBindingSaveResponse = {
  saved: boolean;
  config_path: string;
  camera?: Record<string, unknown>;
  temperature?: Record<string, unknown>;
  source_status?: OperatorSourceStatus;
  real_hardware_available?: boolean;
};

export type HardwareCameraTestResponse = {
  status: "passed" | "failed" | string;
  message?: string;
  error: string;
  suggestion?: string;
  preview_image_data_url: string;
  shape: number[];
  camera_meta: Record<string, unknown>;
  details: Record<string, unknown>;
};

export type HardwareTemperatureTestRequest = {
  serial_port: string;
  baudrate?: number | null;
  slave_address?: number | null;
};

export type HardwareTemperatureTestResponse = {
  status: "passed" | "failed" | string;
  message?: string;
  error: string;
  suggestion?: string;
  temperature_celsius: number | null;
  serial_port: string;
  details: Record<string, unknown>;
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
  regions?: MeasurementRegion[];
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
  region_id?: string;
  region_index?: number;
  region_label?: string;
  region_color?: string;
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
  region_results: RegionResult[];
  overlay: {
    roi: RotatedROI;
    ab_points: { a: ABPoint; b: ABPoint } | null;
    status: string;
  };
  region_overlays: RegionOverlay[];
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
  runtime_source?: "real_hardware" | "simulated_material" | string;
  product_mode?: "production" | "development" | string;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  provenance?: SourceProvenance;
  frame_records: FrameRecord[];
  temperature_records: TemperatureRecord[];
  detection_results: DetectionResult[];
  region_detection_results?: DetectionResult[];
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

export type LivePointStatus = {
  region_id?: string;
  region_index?: number;
  region_label?: string;
  temperature_distance_present: boolean;
  temperature_distance_point_count: number;
  reason_if_missing: string;
  detection_status: string;
  curve_point_status: string;
  temperature_sync_status: string;
  distance_outlier_filtered: boolean;
};

export type RegionCurvePoints = {
  distance_time: CurvePoint | null;
  temperature_time: CurvePoint | null;
  temperature_distance: CurvePoint | null;
  raw_distance_time?: CurvePoint | null;
  raw_temperature_distance?: CurvePoint | null;
  stabilized_distance_time?: CurvePoint | null;
  stabilized_temperature_distance?: CurvePoint | null;
};

export type RegionResult = {
  region_id: string;
  region_index: number;
  region_label: string;
  color: string;
  detection_result: DetectionResult;
  curve_points: RegionCurvePoints;
  live_point_status?: LivePointStatus;
  afas_preprocessing?: Record<string, unknown>;
  grouped_temperature_point_update?: GroupedTemperaturePoint | null;
};

export type RegionOverlay = {
  region_id: string;
  region_index: number;
  region_label: string;
  color: string;
  roi: RotatedROI;
  ab_points: { a: ABPoint; b: ABPoint } | null;
  measurement_segment?: ABPoint[] | null;
  status: string;
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
  runtime_source?: "real_hardware" | "simulated_material" | string;
  product_mode?: "production" | "development" | string;
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
  regions?: RegionAnalysisResult[];
  export_artifacts: ExportArtifact[];
  created_at: string;
  sync_config?: SyncConfig;
  config_snapshot?: Record<string, unknown>;
};

export type RegionAnalysisResult = {
  region_id: string;
  region_index: number;
  region_label: string;
  color: string;
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
  summary: Record<string, unknown>;
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
  tangent_slope_override: number | null;
  tangent_intercept_override: number | null;
};

export type AfasAnalysisPreview = {
  region_id: string;
  afas_analysis: Record<string, unknown>;
  summary: Record<string, unknown>;
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
  region_results: RegionResult[];
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
  live_point_status?: LivePointStatus;
};

export type LiveOfflineCompleteEvent = {
  event: "complete";
  run_id: string;
  state: "READY" | string;
  run_manifest?: RunManifest;
  analysis_result?: AnalysisResult;
};

export type RunCompletion = { run_id: string; state: string };

export type RunStateV2 = {
  schema_version: 2;
  run_id: string;
  state: "RUNNING" | "STOP_REQUESTED" | "FINALIZING" | "READY" | "ERROR";
  stage: string;
  processed_frames: number;
  region_count: number;
  stop_reason: string;
  error: string | null;
};

export type RunSummaryV2 = {
  run_meta: {
    schema_version: 2;
    run_id: string;
    dataset_id: string;
    runtime_source: string;
    product_mode: string;
    operator_data_source: string;
    provenance: SourceProvenance;
    measurement_definition: MeasurementDefinition;
    config_snapshot: Record<string, unknown>;
    software: Record<string, unknown>;
    created_at: string;
  };
  run_state: RunStateV2;
  analysis_summary: {
    analysis_id: string;
    run_id: string;
    runtime_source: string;
    product_mode: string;
    operator_data_source: string;
    provenance: SourceProvenance;
    regions: RegionAnalysisResult[];
    counts: Record<string, number>;
    created_at: string;
  };
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

export type LiveOfflineAnalysisRegionEvent = {
  event: "analyzing_region" | "analysis_region_complete";
  run_id: string;
  dataset_id?: string;
  operator_data_source?: "real_camera" | "offline_dataset" | string;
  processed_frames?: number;
  frame_count?: number;
  total_frames?: number;
  current: number;
  total: number;
  region_id: string;
  region_index: number;
  region_label: string;
  color: string;
  region_analysis?: RegionAnalysisResult;
};

export type LiveOfflineErrorEvent = {
  event: "error";
  message: string;
  issues?: Array<{ field: string; path: string; message: string }>;
};

export type LiveOfflineRunStreamEvent =
  | LiveOfflineFrameEvent
  | LiveOfflineProgressEvent
  | LiveOfflineAnalysisRegionEvent
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
  runtime_source?: "real_hardware" | "simulated_material" | string;
  product_mode?: "production" | "development" | string;
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

export type ExportBundleBlob = ExportDownloadResult & {
  blob: Blob;
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

const API_BASE = import.meta.env?.VITE_G3_API_BASE ?? "";

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

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
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
  return normalizeProbeResponse(await response.json() as ProbeResponse);
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
  return normalizeProbeResponse(await response.json() as RealCameraSetupProbeResponse);
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
  return normalizeRunResponse(await response.json() as RunResponse);
}

export async function streamLiveOfflineRun(
  datasetId: string,
  measurementDefinition: MeasurementDefinition,
  options: { startFrame: number; maxFrames?: number; targetFps: number; signal?: AbortSignal },
  onEvent: (event: LiveOfflineRunStreamEvent) => void
): Promise<RunCompletion> {
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
  let complete: RunCompletion | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = normalizeStreamEvent(JSON.parse(line) as LiveOfflineRunStreamEvent);
      onEvent(event);
      if (event.event === "error") {
        throw new Error(event.message);
      }
      if (event.event === "complete") {
        complete = { run_id: event.run_id, state: event.state };
      }
    }

    if (done) break;
  }

  if (buffered.trim()) {
    const event = normalizeStreamEvent(JSON.parse(buffered) as LiveOfflineRunStreamEvent);
    onEvent(event);
    if (event.event === "error") {
      throw new Error(event.message);
    }
    if (event.event === "complete") {
      complete = { run_id: event.run_id, state: event.state };
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

export async function getOperatorSourceStatus(options: { signal?: AbortSignal } = {}): Promise<OperatorSourceStatus> {
  return requestJson<OperatorSourceStatus>("/api/operator/source-status", { signal: options.signal });
}

export async function getAppRuntime(): Promise<AppRuntime> {
  return requestJson<AppRuntime>("/api/app/runtime");
}

export async function getHardwareProfile(): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/api/hardware/profile");
}

export async function getHardwareSetupEnvironment(): Promise<HardwareSetupEnvironment> {
  return requestJson<HardwareSetupEnvironment>("/api/hardware/setup/environment");
}

export async function saveHardwareSdkPaths(request: {
  sdk_python_paths: string[];
  sdk_library_path: string;
}): Promise<HardwareSdkPathsSaveResponse> {
  const response = await fetch(`${API_BASE}/api/hardware/setup/sdk-paths`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<HardwareSdkPathsSaveResponse>;
}

export async function listHardwareCameras(): Promise<HardwareCameraDevice[]> {
  return requestJson<HardwareCameraDevice[]>("/api/hardware/cameras");
}

export async function readCameraExposure(
  camera: CameraExposureIdentity | null,
  signal?: AbortSignal
): Promise<CameraExposureState> {
  return requestJson<CameraExposureState>("/api/camera/exposure/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera }),
    signal
  });
}

export async function updateCameraExposure(
  exposureUs: number,
  camera: CameraExposureIdentity | null,
  signal?: AbortSignal
): Promise<CameraExposureUpdateState> {
  const state = await requestJson<CameraExposureState>("/api/camera/exposure", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera, exposure_us: exposureUs }),
    signal
  });
  if (typeof state.actual_us !== "number" || !Number.isFinite(state.actual_us)) {
    throw new Error("Camera exposure update response must include a numeric actual_us.");
  }
  return state as CameraExposureUpdateState;
}

export async function testHardwareCamera(camera: HardwareCameraDevice): Promise<HardwareCameraTestResponse> {
  const response = await fetch(`${API_BASE}/api/hardware/cameras/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camera)
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<HardwareCameraTestResponse>;
}

export async function testHardwareTemperature(
  request: HardwareTemperatureTestRequest
): Promise<HardwareTemperatureTestResponse> {
  const response = await fetch(`${API_BASE}/api/hardware/temperature/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<HardwareTemperatureTestResponse>;
}

export async function testHardwareBinding(binding: HardwareBinding): Promise<HardwareBindingTestResponse> {
  const response = await fetch(`${API_BASE}/api/hardware/binding/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(binding)
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<HardwareBindingTestResponse>;
}

export async function saveHardwareBinding(binding: HardwareBinding): Promise<HardwareBindingSaveResponse> {
  const response = await fetch(`${API_BASE}/api/hardware/binding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(binding)
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<HardwareBindingSaveResponse>;
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
  return normalizeRunResponse(await response.json() as RunResponse);
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
): Promise<RunResponse | RunCompletion> {
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
  let complete: RunResponse | RunCompletion | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = normalizeStreamEvent(JSON.parse(line) as RealCameraRunStreamEvent);
      onEvent(event);
      if (event.event === "error") {
        throw new Error(event.message);
      }
      if (event.event === "complete") {
        complete = event.run_manifest && event.analysis_result
          ? { run_manifest: event.run_manifest, analysis_result: event.analysis_result }
          : { run_id: event.run_id, state: event.state };
      }
    }

    if (done) break;
  }

  if (buffered.trim()) {
    const event = normalizeStreamEvent(JSON.parse(buffered) as RealCameraRunStreamEvent);
    onEvent(event);
    if (event.event === "error") {
      throw new Error(event.message);
    }
    if (event.event === "complete") {
      complete = event.run_manifest && event.analysis_result
        ? { run_manifest: event.run_manifest, analysis_result: event.analysis_result }
        : { run_id: event.run_id, state: event.state };
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
  const normalized = normalizeApiMeasurementDefinition(measurementDefinition);
  const { source: _source, ...backendDefinition } = normalized;
  return backendDefinition;
}

function normalizeApiMeasurementDefinition(
  measurement: MeasurementDefinition
): MeasurementDefinition & { regions: MeasurementRegion[] } {
  const regions = measurement.regions?.length
    ? measurement.regions.map((region) => ({ ...region, roi: { ...region.roi } }))
    : [{
        region_id: "region_1",
        index: 1,
        label: "位置 1",
        enabled: true,
        roi: { ...measurement.roi },
        color: API_REGION_COLORS[0]
      }];
  if (regions.length > API_REGION_COLORS.length) {
    throw new Error("Up to six measurement positions are supported");
  }
  const firstEnabled = [...regions]
    .filter((region) => region.enabled)
    .sort((left, right) => left.index - right.index)[0];
  if (!firstEnabled) {
    throw new Error("At least one enabled measurement position is required");
  }
  return {
    ...measurement,
    roi: { ...firstEnabled.roi },
    regions
  };
}

export function regionResultsFromEvent(event: {
  region_results?: RegionResult[];
  detection_result: DetectionResult;
  curve_points: RegionCurvePoints;
  live_point_status?: LivePointStatus;
  afas_preprocessing?: Record<string, unknown>;
}): RegionResult[] {
  if (event.region_results?.length) {
    return event.region_results.map(normalizeRegionResult);
  }
  const detection = withRegionMetadata(event.detection_result, {
    region_id: "region_1",
    region_index: 1,
    region_label: "位置 1",
    color: API_REGION_COLORS[0]
  });
  return [{
    region_id: "region_1",
    region_index: 1,
    region_label: "位置 1",
    color: API_REGION_COLORS[0],
    detection_result: detection,
    curve_points: event.curve_points,
    live_point_status: event.live_point_status,
    afas_preprocessing: event.afas_preprocessing
  }];
}

export function normalizeAnalysisRegions(
  analysis: AnalysisResult
): AnalysisResult & { regions: RegionAnalysisResult[] } {
  const regions = analysis.regions?.length
    ? analysis.regions.map(normalizeRegionAnalysis)
    : [normalizeRegionAnalysis({
        region_id: "region_1",
        region_index: 1,
        region_label: "位置 1",
        color: API_REGION_COLORS[0],
        all_frames: analysis.all_frames ?? [],
        distance_time: analysis.distance_time ?? [],
        raw_distance_time: analysis.raw_distance_time ?? [],
        stabilized_distance_time: analysis.stabilized_distance_time ?? [],
        temperature_time: analysis.temperature_time ?? [],
        temperature_distance: analysis.temperature_distance ?? [],
        raw_temperature_distance: analysis.raw_temperature_distance ?? [],
        stabilized_temperature_distance: analysis.stabilized_temperature_distance ?? [],
        afas_preprocessing: analysis.afas_preprocessing ?? {},
        afas_analysis: analysis.afas_analysis ?? {},
        summary: {}
      })];
  const first = [...regions].sort((left, right) => left.region_index - right.region_index)[0];
  return {
    ...analysis,
    all_frames: first.all_frames,
    distance_time: first.distance_time,
    raw_distance_time: first.raw_distance_time,
    stabilized_distance_time: first.stabilized_distance_time,
    temperature_time: first.temperature_time,
    temperature_distance: first.temperature_distance,
    raw_temperature_distance: first.raw_temperature_distance,
    stabilized_temperature_distance: first.stabilized_temperature_distance,
    afas_preprocessing: first.afas_preprocessing,
    afas_analysis: first.afas_analysis,
    regions
  };
}

function normalizeProbeResponse<T extends ProbeResponse>(response: T): T {
  const measurement = normalizeApiMeasurementDefinition(response.measurement_definition);
  const curvePoints = emptyRegionCurvePoints();
  const regionResults = regionResultsFromEvent({
    region_results: response.region_results,
    detection_result: response.detection_result,
    curve_points: curvePoints
  });
  const first = regionResults[0];
  const regionOverlays = response.region_overlays?.length
    ? response.region_overlays
    : [{
        region_id: first.region_id,
        region_index: first.region_index,
        region_label: first.region_label,
        color: first.color,
        roi: measurement.roi,
        ab_points: response.overlay.ab_points,
        status: response.overlay.status
      }];
  return {
    ...response,
    measurement_definition: measurement,
    detection_result: first.detection_result,
    region_results: regionResults,
    region_overlays: regionOverlays
  };
}

function normalizeRunManifest(manifest: RunManifest): RunManifest {
  const legacyResults = manifest.detection_results.map((result) => withDefaultRegionMetadata(result));
  const allRegionResults = (manifest.region_detection_results?.length
    ? manifest.region_detection_results
    : legacyResults).map((result) => withDefaultRegionMetadata(result));
  return {
    ...manifest,
    measurement_definition: normalizeApiMeasurementDefinition(manifest.measurement_definition),
    detection_results: legacyResults,
    region_detection_results: allRegionResults
  };
}

function normalizeRunResponse(response: RunResponse): RunResponse {
  return {
    run_manifest: normalizeRunManifest(response.run_manifest),
    analysis_result: normalizeAnalysisRegions(response.analysis_result)
  };
}

function normalizeStreamEvent(
  event: LiveOfflineRunStreamEvent
): LiveOfflineRunStreamEvent {
  if (event.event === "frame") {
    const regionResults = regionResultsFromEvent(event);
    return {
      ...event,
      detection_result: regionResults[0].detection_result,
      region_results: regionResults
    };
  }
  if (event.event === "complete") {
    if (!event.run_manifest || !event.analysis_result) return event;
    return {
      ...event,
      run_manifest: normalizeRunManifest(event.run_manifest),
      analysis_result: normalizeAnalysisRegions(event.analysis_result)
    };
  }
  if (event.event === "analysis_region_complete" && event.region_analysis) {
    return {
      ...event,
      region_analysis: normalizeRegionAnalysis(event.region_analysis)
    };
  }
  return event;
}

function normalizeImportedRunView(view: ImportedRunView): ImportedRunView {
  return {
    ...view,
    run_manifest: view.run_manifest ? normalizeRunManifest(view.run_manifest) : null,
    measurement_definition: view.measurement_definition
      ? normalizeApiMeasurementDefinition(view.measurement_definition)
      : null,
    analysis_result: view.analysis_result ? normalizeAnalysisRegions(view.analysis_result) : null
  };
}

function normalizeRegionResult(result: RegionResult): RegionResult {
  const metadata = {
    region_id: result.region_id || result.detection_result.region_id || "region_1",
    region_index: result.region_index || result.detection_result.region_index || 1,
    region_label: result.region_label || result.detection_result.region_label || "位置 1",
    color: result.color || result.detection_result.region_color || API_REGION_COLORS[0]
  };
  return {
    ...result,
    ...metadata,
    detection_result: withRegionMetadata(result.detection_result, metadata)
  };
}

function normalizeRegionAnalysis(region: RegionAnalysisResult): RegionAnalysisResult {
  const metadata = {
    region_id: region.region_id || "region_1",
    region_index: region.region_index || 1,
    region_label: region.region_label || "位置 1",
    color: region.color || API_REGION_COLORS[0]
  };
  return {
    ...region,
    ...metadata,
    all_frames: (region.all_frames ?? []).map((result) => withRegionMetadata(result, metadata)),
    distance_time: region.distance_time ?? [],
    raw_distance_time: region.raw_distance_time ?? [],
    stabilized_distance_time: region.stabilized_distance_time ?? [],
    temperature_time: region.temperature_time ?? [],
    temperature_distance: region.temperature_distance ?? [],
    raw_temperature_distance: region.raw_temperature_distance ?? [],
    stabilized_temperature_distance: region.stabilized_temperature_distance ?? [],
    afas_preprocessing: region.afas_preprocessing ?? {},
    afas_analysis: region.afas_analysis ?? {},
    summary: region.summary ?? {}
  };
}

function withDefaultRegionMetadata(result: DetectionResult): DetectionResult {
  return withRegionMetadata(result, {
    region_id: result.region_id || "region_1",
    region_index: result.region_index || 1,
    region_label: result.region_label || "位置 1",
    color: result.region_color || API_REGION_COLORS[0]
  });
}

function withRegionMetadata(
  result: DetectionResult,
  metadata: { region_id: string; region_index: number; region_label: string; color: string }
): DetectionResult {
  return {
    ...result,
    region_id: metadata.region_id,
    region_index: metadata.region_index,
    region_label: metadata.region_label,
    region_color: metadata.color
  };
}

function emptyRegionCurvePoints(): RegionCurvePoints {
  return {
    distance_time: null,
    temperature_time: null,
    temperature_distance: null
  };
}

export async function getRun(runId: string): Promise<RunResponse> {
  return normalizeRunResponse(await requestJson<RunResponse>(`/api/runs/${runId}`));
}

export async function stopRun(runId: string): Promise<RunStateV2 & { stop_requested: boolean }> {
  return requestJson<RunStateV2 & { stop_requested: boolean }>(`/api/runs/${runId}/stop`, { method: "POST" });
}

export async function getRunStatus(runId: string): Promise<RunStateV2> {
  return requestJson<RunStateV2>(`/api/runs/${runId}/status`);
}

export async function getRunSummary(runId: string): Promise<RunSummaryV2> {
  return requestJson<RunSummaryV2>(`/api/runs/${runId}/summary`);
}

export function runResponseFromSummary(summary: RunSummaryV2): RunResponse {
  const regions = summary.analysis_summary.regions.map((region) => normalizeRegionAnalysis(region));
  const first = [...regions].sort((left, right) => left.region_index - right.region_index)[0];
  const analysis = normalizeAnalysisRegions({
    analysis_id: summary.analysis_summary.analysis_id,
    run_id: summary.analysis_summary.run_id,
    runtime_source: summary.analysis_summary.runtime_source,
    product_mode: summary.analysis_summary.product_mode,
    operator_data_source: summary.analysis_summary.operator_data_source,
    provenance: summary.analysis_summary.provenance,
    all_frames: [],
    distance_time: first?.distance_time ?? [],
    raw_distance_time: first?.raw_distance_time ?? [],
    stabilized_distance_time: first?.stabilized_distance_time ?? [],
    temperature_time: first?.temperature_time ?? [],
    temperature_distance: first?.temperature_distance ?? [],
    raw_temperature_distance: first?.raw_temperature_distance ?? [],
    stabilized_temperature_distance: first?.stabilized_temperature_distance ?? [],
    afas_preprocessing: first?.afas_preprocessing ?? {},
    afas_analysis: first?.afas_analysis ?? {},
    regions,
    export_artifacts: [],
    created_at: summary.analysis_summary.created_at
  });
  return {
    run_manifest: {
      run_id: summary.run_meta.run_id,
      dataset_id: summary.run_meta.dataset_id,
      measurement_definition: normalizeApiMeasurementDefinition(summary.run_meta.measurement_definition),
      runtime_source: summary.run_meta.runtime_source,
      product_mode: summary.run_meta.product_mode,
      operator_data_source: summary.run_meta.operator_data_source,
      provenance: summary.run_meta.provenance,
      frame_records: [],
      temperature_records: [],
      detection_results: [],
      region_detection_results: [],
      export_artifacts: [],
      created_at: summary.run_meta.created_at,
      config_snapshot: {
        ...summary.run_meta.config_snapshot,
        processed_frames: summary.run_state.processed_frames,
        stop_reason: summary.run_state.stop_reason
      },
      software: summary.run_meta.software
    },
    analysis_result: analysis
  };
}

export async function getRunAvailability(runId: string): Promise<RunAvailability> {
  return requestJson<RunAvailability>(`/api/runs/${runId}/availability`);
}

export async function recomputeRunAnalysis(
  runId: string,
  parameters: {
    region_id?: string;
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
  return normalizeAnalysisRegions(payload.analysis_result);
}

export async function previewRunAfasAdjustment(
  runId: string,
  parameters: {
    region_id: string;
    afas_analysis_parameters: AfasAnalysisParameters;
  },
  signal?: AbortSignal
): Promise<AfasAnalysisPreview> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}/analysis/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
    signal
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  const payload = await response.json() as { analysis_preview: AfasAnalysisPreview };
  return payload.analysis_preview;
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
  const bundle = await fetchRunExportBundle(runId);
  triggerBlobDownload(bundle.blob, bundle.filename, options);
  return { filename: bundle.filename, size: bundle.size };
}

export async function fetchRunExportBundle(runId: string): Promise<ExportBundleBlob> {
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
  return { blob, filename, size: blob.size };
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
  return normalizeImportedRunView(await response.json() as ImportedRunView);
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
