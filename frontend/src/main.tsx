import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Camera,
  Database,
  Download,
  Image as ImageIcon,
  Play,
  RefreshCcw,
  RotateCw,
  Square,
  Settings,
  SquareDashedMousePointer,
  Thermometer,
  Usb
} from "lucide-react";
import {
  ApiError,
  apiUrlFromPath,
  artifactDownloadUrl,
  createLiveOfflineRun,
  createRealCameraRun,
  createRunExports,
  frameIndexImageUrl,
  frameImageUrl,
  getTemperatureStatus,
  getRun,
  getRunAvailability,
  getOfflineDatasetSummary,
  listTemperatureSerialPorts,
  listOfflineDatasets,
  previewRealCamera,
  probeFrame,
  probeRealCameraSetupFrame,
  readDiagnosticImages,
  realCameraPreviewImageUrl,
  recomputeRunAnalysis,
  runFrameImageUrl,
  streamLiveOfflineRun,
  type ABPoint,
  type ApiErrorDetail,
  type AfasAnalysisParameters,
  type AfasPreprocessingParameters,
  type AnalysisResult,
  type CameraPreviewResponse,
  type CurvePoint,
  type DetectionResult,
  type DiagnosticImages,
  type MeasurementDefinition,
  type ExportArtifact,
  type LiveOfflineFrameEvent,
  type OfflineDatasetListItem,
  type OfflineDatasetSummary,
  type ProbeResponse,
  type RealCameraSetupProbeResponse,
  type RunResponse,
  type RotatedROI,
  type SerialPortInfo,
  type TemperatureStatusResponse
} from "./api/client";
import {
  displayPointToMeasurement,
  fitSourceToDisplay,
  measurementPointToDisplay,
  measurementRoiToDisplay,
  roiCorners,
  type FrameDisplayTransform
} from "./geometry/coordinates";
import {
  moveRoiFromDrag,
  resizeRoiFromHandle,
  rotateRoiToPointer,
  type RoiResizeHandle
} from "./geometry/roiInteraction";
import {
  SETUP_SOURCE_OPTIONS,
  buildRunSetupSummary,
  buildSetupTemperatureSummary,
  confirmPreviewRoi,
  createDefaultRoiForShape,
  createRealCameraMeasurementFromShape,
  freezePreview,
  frozenFrameSetupChangeMessage,
  previewRefreshStatusLabel,
  resumeLivePreview,
  runModeForSetupSource,
  runResultMatchesSetupSource,
  shouldPollRealCameraPreview,
  shouldRefreshRealCameraFrameAfterSetupChange,
  shouldRefreshRealCameraFrameAfterRoiCommit,
  updateRealCameraPreviewState,
  type PreviewRefreshStatus,
  type RealCameraPreviewMode,
  type RealCameraSetupChange,
  type RealCameraPreviewState,
  type SetupTemperatureError,
  type SetupSourceKind
} from "./setupSources";
import {
  buildAnalysisAfasModel,
  buildAnalysisCurveSpecs,
  buildCurveViewModel,
  buildIndustrialCurveFrameModel,
  buildRunCurveSpecs,
  buildRunTrendModel,
  resolveRunTrendStickyYAxisRange,
  type AnalysisAfasConstructionGuide,
  type AnalysisAfasDataPoint,
  type AnalysisAfasLayerState,
  type AnalysisAfasMarker,
  type AnalysisAfasModel,
  type IndustrialCurveViewVariant,
  type RunTrendPoint,
  type RunTrendYAxisRange,
  type CurveSpec
} from "./curves";
import "./styles.css";

type Page = "setup" | "run" | "playback" | "analysis";

type LiveRunState = {
  runId: string;
  datasetId: string;
  status: "running" | "complete" | "stopped";
  frameIndex: number;
  frameUrl: string;
  frameCount: number;
  totalFrames: number;
  processedFrames: number;
  detectionResult: DetectionResult | null;
  analysis: AnalysisResult;
};

type CameraPreviewError = {
  camera_status: string;
  message: string;
  details: Record<string, unknown>;
  http_status: number | null;
};

const DEFAULT_CONFIG = {
  tie_width_epsilon_px: 2,
  switch_after_n_frames: 3,
  jump_limit_px: 35,
  min_confidence: 0.15,
  dark_enhance_bg_kernel_px: 41,
  hysteresis_low_ratio: 0.45,
  min_component_area_px: 80,
  envelope_quantile: 0.02,
  envelope_window_px: 9,
  envelope_step_px: 2,
  min_window_pixels: 8,
  window_width_keep_ratio: 0.2,
  mask_open_kernel_px: 3,
  mask_close_kernel_px: 11,
  mask_dilate_kernel_px: 1,
  mesh_row_width_keep_ratio: 0.45,
  mesh_row_count_keep_ratio: 0.35,
  envelope_width_percentile: 95,
  envelope_width_outlier_epsilon_px: 8,
  envelope_min_consensus_rows: 3,
  boundary_support_enabled: true,
  boundary_support_window_px: 9,
  boundary_support_min_pixels: 6,
  boundary_support_min_ratio: 0.05,
  distance_jump_limit_px: 18,
  distance_jump_hold_frames: 2,
  distance_jump_policy: "hold_previous" as const,
  contour_box_mode: "component_bbox" as const,
  contour_box_padding_px: 8,
  contour_box_quantile: 0,
  contour_box_min_coverage_ratio: 0.995,
  show_measurement_band_box: true,
  roi_edge_guard_px: 5,
  detection_roi_padding_px: 0,
  bubble_suppress_enabled: true,
  bubble_local_radius_px: 31,
  bubble_bright_z_threshold: 1.2,
  bubble_min_area_px: 20,
  bubble_max_area_px: 800,
  bubble_max_bbox_px: 60,
  bubble_max_aspect_ratio: 2.5,
  bubble_min_compactness: 0.12,
  bubble_suppress_radius_px: 10,
  bubble_suppress_measurement_only: false,
  dark_line_filter_enabled: true,
  dark_line_filter_length_px: 17,
  dark_line_filter_width_px: 3,
  dark_line_min_response: 0,
  endpoint_min_dark_line_response: 0,
  spur_prune_enabled: true,
  spur_prune_max_length_px: 35,
  spur_prune_dilate_px: 3,
  spur_prune_min_ridge_response: 0,
  spur_prune_require_bubble_overlap_or_low_ridge: true,
  processing_scale_enabled: true,
  processing_scale: 0.5,
  processing_scale_mode: "area_downsample" as const,
  refine_endpoint_on_full_res: true,
  full_res_refine_band_px: 12,
  run_detector_mode: "fast" as const,
  run_diagnostics_mode: "suspicious_only" as const,
  run_preview_fps: 5,
  run_result_batch_size: 10,
  run_enhanced_detector_on_suspicious: true,
  endpoint_jump_limit_px: 12,
  suspicious_boundary_reject_ratio: 0.35,
  suspicious_outlier_reject_count: 1,
  max_frames_per_run: 160,
  live_offline_fps: 8,
  target_temperature_celsius: null,
  temperature_power_percent: 100
};

const DEFAULT_AFAS_PREPROCESSING_PARAMETERS: AfasPreprocessingParameters = {
  group_by_temperature: true,
  outlier_window: 11,
  outlier_threshold: 5,
  outlier_max_iterations: 3,
  savgol_window_length: 51,
  savgol_polyorder: 3
};

type AfasAnalysisFormState = {
  low_range_celsius: [number | null, number | null];
  high_range_celsius: [number | null, number | null];
  tangent_offset: number;
};

const DEFAULT_AFAS_ANALYSIS_FORM: AfasAnalysisFormState = {
  low_range_celsius: [null, null],
  high_range_celsius: [null, null],
  tangent_offset: 0
};

const LIVE_FRAME_DISPLAY_MAX_WIDTH = 1024;
const REAL_CAMERA_SETUP_PREVIEW_INTERVAL_MS = 1000;
const REAL_CAMERA_SETUP_CHANGE_DEBOUNCE_MS = 500;

const OBJECT_CLASS_OPTIONS = [
  { value: "A_BALLOON_ENVELOPE", label: "A balloon envelope", detector: "BalloonEnvelopeDetector", widthMode: "max_width" as const },
  { value: "C_BUNDLE_ENVELOPE", label: "C bundle envelope", detector: "BundleEnvelopeDetector", widthMode: "max_width" as const },
  { value: "D_RESERVED_OBJECT", label: "D reserved object", detector: "ReservedObjectDetector", widthMode: "max_width" as const }
];

const DETECTOR_OPTIONS = [
  { value: "BalloonEnvelopeDetector", label: "BalloonEnvelopeDetector" },
  { value: "BundleEnvelopeDetector", label: "BundleEnvelopeDetector" },
  { value: "ReservedObjectDetector", label: "ReservedObjectDetector" }
];

type DetectorConfig = MeasurementDefinition["detector_config"];
type DetectorParameterGroup =
  | "Image processing / Scale"
  | "Mask"
  | "Threshold"
  | "Envelope"
  | "Robust max width"
  | "Boundary support"
  | "Artifact / Bubble suppression"
  | "Line / Ridge"
  | "Spur pruning"
  | "Contour diagnostics"
  | "Temporal stability"
  | "Run performance"
  | "Run";

type DetectorParameterDef = {
  key: keyof DetectorConfig;
  label: string;
  type: "int" | "float" | "bool" | "select";
  group: DetectorParameterGroup;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
  advanced?: boolean;
  options?: Array<{ value: string; label: string }>;
};

const DETECTOR_PARAMETER_DEFS: DetectorParameterDef[] = [
  { key: "processing_scale_enabled", label: "Processing scale", type: "bool", group: "Image processing / Scale", title: "Runs detector masking and envelope selection on a downsampled ROI while preserving source-pixel outputs." },
  { key: "processing_scale", label: "Processing scale factor", type: "float", min: 0.25, max: 1, step: 0.05, group: "Image processing / Scale", title: "ROI-local processing scale; A/B and distance are restored to source pixels." },
  { key: "processing_scale_mode", label: "Scale mode", type: "select", group: "Image processing / Scale", options: [
    { value: "area_downsample", label: "Area downsample" },
    { value: "gaussian_pyramid", label: "Gaussian pyramid" }
  ], title: "Downsampling method used before detector preprocessing." },
  { key: "refine_endpoint_on_full_res", label: "Full-res endpoint refine", type: "bool", group: "Image processing / Scale", title: "Refines restored endpoints in a narrow full-resolution band when scale is below 1.0." },
  { key: "full_res_refine_band_px", label: "Full-res refine band", type: "int", min: 1, max: 80, step: 1, group: "Image processing / Scale", advanced: true, title: "Local source-pixel band used for endpoint refinement." },
  { key: "mask_open_kernel_px", label: "Mask open kernel", type: "int", min: 1, max: 31, step: 2, group: "Mask", title: "Larger values remove more isolated dark pixels." },
  { key: "mask_close_kernel_px", label: "Mask close kernel", type: "int", min: 1, max: 51, step: 2, group: "Mask", title: "Larger values bridge short gaps in the mesh mask." },
  { key: "mask_dilate_kernel_px", label: "Mask dilate kernel", type: "int", min: 1, max: 31, step: 2, group: "Mask", advanced: true, title: "Expands the detected mask after closing." },
  { key: "hysteresis_low_ratio", label: "Hysteresis low ratio", type: "float", min: 0.1, max: 0.9, step: 0.05, group: "Threshold", title: "Lower values retain weaker dark-line responses connected to strong responses." },
  { key: "dark_enhance_bg_kernel_px", label: "Dark enhance kernel", type: "int", min: 3, max: 101, step: 2, group: "Threshold", advanced: true, title: "Background estimation size for dark-line enhancement." },
  { key: "envelope_quantile", label: "Envelope quantile", type: "float", min: 0, max: 0.15, step: 0.005, group: "Envelope", title: "Ignores this fraction of extreme pixels on each side of a row window." },
  { key: "min_window_pixels", label: "Min window pixels", type: "int", min: 1, max: 200, step: 1, group: "Envelope", title: "Minimum foreground support required in a row window." },
  { key: "mesh_row_count_keep_ratio", label: "Row count keep ratio", type: "float", min: 0.1, max: 0.95, step: 0.05, group: "Envelope", title: "Higher values keep only denser row windows." },
  { key: "envelope_window_px", label: "Envelope window px", type: "int", min: 1, max: 101, step: 2, group: "Envelope", advanced: true, title: "Sliding row-window height for envelope measurement." },
  { key: "envelope_step_px", label: "Envelope step px", type: "int", min: 1, max: 20, step: 1, group: "Envelope", advanced: true, title: "Vertical step between row-window candidates." },
  { key: "mesh_row_width_keep_ratio", label: "Row width keep ratio", type: "float", min: 0.1, max: 1, step: 0.05, group: "Envelope", advanced: true, title: "Higher values reject narrower row-window candidates." },
  { key: "min_component_area_px", label: "Min component area", type: "int", min: 1, max: 5000, step: 10, group: "Mask", advanced: true, title: "Minimum component size for the detected target region." },
  { key: "envelope_width_percentile", label: "Robust width percentile", type: "float", min: 80, max: 100, step: 0.5, group: "Robust max width", title: "High-percentile width used as a robust ceiling for row selection." },
  { key: "envelope_width_outlier_epsilon_px", label: "Width outlier epsilon px", type: "float", min: 0, max: 50, step: 1, group: "Robust max width", title: "Extra width allowed above the robust percentile before consensus is required." },
  { key: "envelope_min_consensus_rows", label: "Min consensus rows", type: "int", min: 1, max: 20, step: 1, group: "Robust max width", title: "Nearby rows required before an extra-wide row is trusted." },
  { key: "boundary_support_enabled", label: "Boundary support filter", type: "bool", group: "Boundary support", title: "Rejects row windows whose edge pixels have weak support." },
  { key: "boundary_support_window_px", label: "Boundary support window px", type: "int", min: 1, max: 51, step: 2, group: "Boundary support", title: "Horizontal strip around each candidate boundary for support counting." },
  { key: "boundary_support_min_pixels", label: "Boundary support min pixels", type: "int", min: 1, max: 100, step: 1, group: "Boundary support", title: "Minimum pixels required near each candidate boundary." },
  { key: "boundary_support_min_ratio", label: "Boundary support min ratio", type: "float", min: 0, max: 0.5, step: 0.01, group: "Boundary support", title: "Minimum boundary support relative to row-window foreground pixels." },
  { key: "bubble_suppress_enabled", label: "Bubble suppression", type: "bool", group: "Artifact / Bubble suppression", title: "Suppresses compact bright bubble centers and their nearby dark rims before A/B selection." },
  { key: "bubble_bright_z_threshold", label: "Bubble bright z", type: "float", min: 0.2, max: 5, step: 0.1, group: "Artifact / Bubble suppression", title: "Local brightness threshold for compact bubble-center candidates." },
  { key: "bubble_suppress_radius_px", label: "Bubble suppress radius px", type: "int", min: 1, max: 80, step: 1, group: "Artifact / Bubble suppression", title: "Radius used to expand a bright bubble center over its dark rim." },
  { key: "bubble_min_area_px", label: "Bubble min area", type: "int", min: 1, max: 5000, step: 1, group: "Artifact / Bubble suppression", title: "Minimum bright blob area for bubble suppression." },
  { key: "bubble_max_area_px", label: "Bubble max area", type: "int", min: 1, max: 10000, step: 10, group: "Artifact / Bubble suppression", title: "Maximum bright blob area for bubble suppression." },
  { key: "bubble_max_aspect_ratio", label: "Bubble max aspect", type: "float", min: 1, max: 10, step: 0.1, group: "Artifact / Bubble suppression", title: "Rejects elongated highlights from bubble suppression." },
  { key: "bubble_local_radius_px", label: "Bubble local radius", type: "int", min: 3, max: 101, step: 2, group: "Artifact / Bubble suppression", advanced: true, title: "Local background radius for bright bubble detection." },
  { key: "bubble_max_bbox_px", label: "Bubble max bbox", type: "int", min: 1, max: 200, step: 1, group: "Artifact / Bubble suppression", advanced: true, title: "Maximum width or height for a compact bubble-center candidate." },
  { key: "bubble_min_compactness", label: "Bubble compactness", type: "float", min: 0, max: 1, step: 0.01, group: "Artifact / Bubble suppression", advanced: true, title: "Minimum bbox fill ratio for a compact bubble-center candidate." },
  { key: "bubble_suppress_measurement_only", label: "Measurement-only bubble suppress", type: "bool", group: "Artifact / Bubble suppression", advanced: true, title: "Reserved switch for keeping diagnostic contour boxes closer to raw target masks." },
  { key: "dark_line_filter_enabled", label: "Dark line filter", type: "bool", group: "Line / Ridge", title: "Computes dark line/ridge evidence for measurement filtering and endpoint guard diagnostics." },
  { key: "dark_line_filter_length_px", label: "Line filter length", type: "int", min: 3, max: 101, step: 2, group: "Line / Ridge", title: "Length of the line-response filter." },
  { key: "dark_line_filter_width_px", label: "Line filter width", type: "int", min: 1, max: 31, step: 2, group: "Line / Ridge", title: "Width of the line-response filter." },
  { key: "endpoint_min_dark_line_response", label: "Endpoint min ridge", type: "float", min: 0, max: 255, step: 1, group: "Line / Ridge", title: "Minimum dark-line response required near each endpoint; 0 disables the threshold." },
  { key: "dark_line_min_response", label: "Mask min ridge", type: "float", min: 0, max: 255, step: 1, group: "Line / Ridge", advanced: true, title: "Minimum dark-line response required for measurement-mask pixels; 0 disables the threshold." },
  { key: "spur_prune_enabled", label: "Spur pruning", type: "bool", group: "Spur pruning", title: "Prunes short terminal artifact branches when they overlap bubble zones or weak ridge evidence." },
  { key: "spur_prune_max_length_px", label: "Spur max length px", type: "int", min: 1, max: 200, step: 1, group: "Spur pruning", title: "Maximum terminal branch length eligible for pruning." },
  { key: "spur_prune_dilate_px", label: "Spur dilate px", type: "int", min: 1, max: 30, step: 1, group: "Spur pruning", title: "Local dilation used when removing a rejected terminal spur." },
  { key: "spur_prune_min_ridge_response", label: "Spur min ridge", type: "float", min: 0, max: 255, step: 1, group: "Spur pruning", advanced: true, title: "Minimum mean ridge response for terminal branches; 0 uses bubble overlap only." },
  { key: "spur_prune_require_bubble_overlap_or_low_ridge", label: "Require spur evidence", type: "bool", group: "Spur pruning", advanced: true, title: "Requires bubble overlap or low ridge evidence before pruning short branches." },
  { key: "contour_box_mode", label: "Contour box mode", type: "select", group: "Contour diagnostics", options: [
    { value: "component_bbox", label: "Component bbox" },
    { value: "robust_component_bbox", label: "Robust component bbox" },
    { value: "measurement_band", label: "Measurement band" }
  ], title: "Controls the red diagnostic contour box; formal A/B still uses the measurement row." },
  { key: "contour_box_padding_px", label: "Contour box padding px", type: "float", min: 0, max: 50, step: 1, group: "Contour diagnostics", title: "Expands the full contour diagnostic box." },
  { key: "contour_box_quantile", label: "Contour box quantile", type: "float", min: 0, max: 0.05, step: 0.001, group: "Contour diagnostics", title: "Robust box quantile; 0 preserves all target-mask edges." },
  { key: "show_measurement_band_box", label: "Show measurement band", type: "bool", group: "Contour diagnostics", title: "Shows the orange band actually used for A/B max-width selection." },
  { key: "roi_edge_guard_px", label: "ROI edge guard px", type: "float", min: 0, max: 50, step: 1, group: "Contour diagnostics", advanced: true, title: "Warns when the detected contour is close to the ROI edge." },
  { key: "detection_roi_padding_px", label: "Detection ROI padding px", type: "float", min: 0, max: 100, step: 1, group: "Contour diagnostics", advanced: true, title: "Reserved internal padding for detection; default keeps the formal ROI unchanged." },
  { key: "distance_jump_limit_px", label: "Distance jump limit px", type: "float", min: 0, max: 100, step: 1, group: "Temporal stability", title: "Run-time guard for sudden distance changes." },
  { key: "distance_jump_hold_frames", label: "Distance jump hold frames", type: "int", min: 1, max: 10, step: 1, group: "Temporal stability", advanced: true, title: "Consecutive frames required before accepting a large distance jump." },
  { key: "distance_jump_policy", label: "Distance jump policy", type: "select", group: "Temporal stability", advanced: true, options: [
    { value: "hold_previous", label: "Hold previous" },
    { value: "mark_invalid", label: "Mark invalid" }
  ], title: "How Run handles unconfirmed distance jumps." },
  { key: "endpoint_jump_limit_px", label: "Endpoint jump limit px", type: "float", min: 0, max: 100, step: 1, group: "Temporal stability", advanced: true, title: "Suspicious-frame threshold for selected endpoint/axis jumps." },
  { key: "suspicious_boundary_reject_ratio", label: "Suspicious boundary ratio", type: "float", min: 0, max: 1, step: 0.05, group: "Temporal stability", advanced: true, title: "Run diagnostics trigger when boundary-support rejections are high." },
  { key: "suspicious_outlier_reject_count", label: "Suspicious outlier rows", type: "int", min: 1, max: 20, step: 1, group: "Temporal stability", advanced: true, title: "Run diagnostics trigger when this many width-outlier rows are rejected." },
  { key: "run_detector_mode", label: "Run detector mode", type: "select", group: "Run performance", options: [
    { value: "fast", label: "Fast" },
    { value: "enhanced", label: "Enhanced" },
    { value: "diagnostics", label: "Diagnostics" }
  ], title: "Default detector path used during Run." },
  { key: "run_diagnostics_mode", label: "Run diagnostics", type: "select", group: "Run performance", options: [
    { value: "off", label: "Off" },
    { value: "suspicious_only", label: "Suspicious only" },
    { value: "every_frame", label: "Every frame" }
  ], title: "Controls when Run streams large diagnostic images." },
  { key: "run_preview_fps", label: "Run preview fps", type: "int", min: 1, max: 30, step: 1, group: "Run performance", title: "Limits image/overlay refresh rate during streaming Run." },
  { key: "run_result_batch_size", label: "Run result batch", type: "int", min: 1, max: 100, step: 1, group: "Run performance", title: "Batches Run curve/state updates by processed frames." },
  { key: "run_enhanced_detector_on_suspicious", label: "Enhanced on suspicious", type: "bool", group: "Run performance", advanced: true, title: "Allows suspicious frames to rerun with diagnostics enabled." },
  { key: "max_frames_per_run", label: "Max frames per run", type: "int", min: 1, max: 20000, step: 10, group: "Run", advanced: true, title: "Frame limit for live offline runs." },
  { key: "live_offline_fps", label: "Live offline fps", type: "float", min: 0.5, max: 30, step: 0.5, group: "Run", advanced: true, title: "Playback speed for live offline runs." }
];

function App() {
  const [page, setPage] = useState<Page>("setup");
  const [setupSource, setSetupSource] = useState<SetupSourceKind>("offline_dataset");
  const [datasets, setDatasets] = useState<OfflineDatasetListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<OfflineDatasetSummary | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementDefinition | null>(null);
  const [frameIndex, setFrameIndex] = useState(1);
  const [probe, setProbe] = useState<ProbeResponse | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [liveRun, setLiveRun] = useState<LiveRunState | null>(null);
  const [cameraPreview, setCameraPreview] = useState<CameraPreviewResponse | null>(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState("");
  const [cameraPreviewError, setCameraPreviewError] = useState<CameraPreviewError | null>(null);
  const [cameraPreviewRefreshStatus, setCameraPreviewRefreshStatus] = useState<PreviewRefreshStatus>("idle");
  const [cameraPreviewState, setCameraPreviewState] = useState<RealCameraPreviewState | null>(null);
  const [temperatureStatus, setTemperatureStatus] = useState<TemperatureStatusResponse | null>(null);
  const [temperatureError, setTemperatureError] = useState<SetupTemperatureError | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewingCamera, setPreviewingCamera] = useState(false);
  const [runningCamera, setRunningCamera] = useState(false);
  const [checkingTemperature, setCheckingTemperature] = useState(false);
  const [loadingSerialPorts, setLoadingSerialPorts] = useState(false);
  const [error, setError] = useState("");
  const runAbortRef = useRef<AbortController | null>(null);
  const liveRunIdRef = useRef<string | null>(null);
  const liveRunProcessedFramesRef = useRef(0);
  const cameraPreviewRequestInFlightRef = useRef(false);
  const measurementRef = useRef<MeasurementDefinition | null>(null);
  const cameraPreviewModeRef = useRef<RealCameraPreviewMode>("live");

  useEffect(() => {
    void refreshDatasets();
  }, []);

  useEffect(() => {
    measurementRef.current = measurement;
  }, [measurement]);

  useEffect(() => {
    cameraPreviewModeRef.current = cameraPreviewState?.mode ?? "live";
  }, [cameraPreviewState?.mode]);

  useEffect(() => {
    if (page !== "setup" || setupSource !== "real_camera") return;
    if (temperatureStatus || temperatureError || checkingTemperature) return;
    void readCurrentTemperature();
  }, [page, setupSource, temperatureStatus, temperatureError, checkingTemperature]);

  useEffect(() => {
    if (!shouldPollRealCameraPreview(page, setupSource, cameraPreviewState)) return;
    void previewRealCameraFrame("live");
    const timer = window.setInterval(() => {
      void previewRealCameraFrame("live");
    }, REAL_CAMERA_SETUP_PREVIEW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [page, setupSource, cameraPreviewState?.mode, cameraPreviewState?.cameraStatus]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      setMeasurement(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getOfflineDatasetSummary(selectedId)
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setFrameIndex(1);
        setProbe(null);
        setRunResult(null);
        setLiveRun(null);
        setTemperatureStatus(null);
        applyMeasurement(createDefaultMeasurement(payload.dataset, payload.first_frame.shape));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSummary(null);
          setMeasurement(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function refreshDatasets() {
    setLoading(true);
    setError("");
    try {
      const nextDatasets = await listOfflineDatasets();
      setDatasets(nextDatasets);
      setSelectedId((current) => current || nextDatasets[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runProbe(targetFrame = frameIndex) {
    if (!measurement || !selectedId) return;
    setProbing(true);
    setError("");
    try {
      const response = await probeFrame(selectedId, targetFrame, measurement);
      setProbe(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }

  async function runRealCameraSetupProbe() {
    const currentMeasurement = measurementRef.current;
    if (!currentMeasurement) return;
    const isFrozen = cameraPreviewModeRef.current === "frozen";
    setProbing(true);
    setError("");
    try {
      const response = await probeRealCameraSetupFrame(
        currentMeasurement,
        isFrozen
          ? {
              framePngDataUrl: requireSetupFrameDataUrl(cameraPreviewUrl),
              frameTimestampMs: cameraPreview?.timestamp_ms ?? cameraPreviewState?.timestampMs ?? null,
              cameraMeta: cameraPreview?.camera_meta ?? {}
            }
          : undefined
      );
      applyRealCameraProbeResponse(response, isFrozen ? "frozen" : "live");
      setProbe(response);
      setCameraPreviewRefreshStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }

  async function startLiveOfflineRun() {
    if (!measurement || !selectedId) return;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunning(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    liveRunIdRef.current = null;
    liveRunProcessedFramesRef.current = 0;
    setLiveRun(createInitialLiveRun(selectedId, frameIndex, selectedDataset?.frame_count ?? frameIndex));
    const runPreviewFps = Math.round(clamp(Number(measurement.detector_config.run_preview_fps ?? 5), 1, 30));
    const runResultBatchSize = Math.round(clamp(Number(measurement.detector_config.run_result_batch_size ?? 10), 1, 100));
    const previewIntervalMs = 1000 / runPreviewFps;
    const maxBatchWaitMs = 180;
    let pendingFrameEvents: LiveOfflineFrameEvent[] = [];
    let lastPreviewUpdateMs = 0;
    let batchFlushTimer: number | null = null;

    const clearBatchFlushTimer = () => {
      if (batchFlushTimer == null) return;
      window.clearTimeout(batchFlushTimer);
      batchFlushTimer = null;
    };
    const flushPendingFrameEvents = (forcePreview: boolean) => {
      if (pendingFrameEvents.length === 0) return;
      const events = pendingFrameEvents;
      pendingFrameEvents = [];
      const now = Date.now();
      const refreshPreview = forcePreview || now - lastPreviewUpdateMs >= previewIntervalMs;
      if (refreshPreview) lastPreviewUpdateMs = now;
      setLiveRun((current) => updateLiveRunFromFrames(current, events, { refreshPreview }));
    };

    try {
      const response = await streamLiveOfflineRun(selectedId, measurement, {
        startFrame: frameIndex,
        targetFps: measurement.detector_config.live_offline_fps ?? 8,
        signal: controller.signal
      }, (event) => {
        if (event.event === "frame") {
          liveRunIdRef.current = event.run_id;
          liveRunProcessedFramesRef.current = event.processed_frames;
          pendingFrameEvents.push(event);
          const now = Date.now();
          const shouldRefreshPreview = now - lastPreviewUpdateMs >= previewIntervalMs;
          if (pendingFrameEvents.length >= runResultBatchSize || shouldRefreshPreview) {
            clearBatchFlushTimer();
            flushPendingFrameEvents(shouldRefreshPreview);
          } else if (batchFlushTimer == null) {
            batchFlushTimer = window.setTimeout(() => {
              batchFlushTimer = null;
              flushPendingFrameEvents(false);
            }, maxBatchWaitMs);
          }
        } else if (event.event === "complete") {
          clearBatchFlushTimer();
          flushPendingFrameEvents(true);
          liveRunIdRef.current = event.run_manifest.run_id;
          liveRunProcessedFramesRef.current = event.run_manifest.frame_records.length;
          setLiveRun((current) =>
            current
              ? {
                  ...current,
                  status: "complete",
                  analysis: event.analysis_result,
                  processedFrames: event.run_manifest.frame_records.length,
                  totalFrames: event.run_manifest.frame_records.length
                }
              : current
          );
        }
      });
      setRunResult(response);
    } catch (err) {
      clearBatchFlushTimer();
      flushPendingFrameEvents(true);
      if (controller.signal.aborted) {
        setLiveRun((current) => (current ? { ...current, status: "stopped" } : current));
        const stoppedRunId = liveRunIdRef.current;
        if (stoppedRunId) {
          try {
            const partialResult = await waitForStoppedRun(stoppedRunId);
            applyStoppedRunResult(partialResult);
          } catch (fetchErr) {
            if (measurement && selectedId && liveRunProcessedFramesRef.current > 0) {
              try {
                const partialResult = await createLiveOfflineRun(selectedId, measurement, {
                  startFrame: frameIndex,
                  maxFrames: liveRunProcessedFramesRef.current,
                  targetFps: measurement.detector_config.live_offline_fps ?? 8
                });
                applyStoppedRunResult(partialResult);
              } catch (fallbackErr) {
                setError(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
              }
            } else {
              setError(fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
            }
          }
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setRunResult(null);
      }
    } finally {
      clearBatchFlushTimer();
      if (runAbortRef.current === controller) {
        runAbortRef.current = null;
      }
      setRunning(false);
    }

    function applyStoppedRunResult(partialResult: RunResponse) {
      setRunResult(partialResult);
      setLiveRun((current) =>
        current
          ? {
              ...current,
              status: "stopped",
              runId: partialResult.run_manifest.run_id,
              analysis: partialResult.analysis_result,
              processedFrames: partialResult.run_manifest.frame_records.length,
              totalFrames: partialResult.run_manifest.config_snapshot.max_frames as number
            }
          : current
      );
    }
  }

  function stopLiveOfflineRun() {
    runAbortRef.current?.abort();
  }

  function chooseSetupSource(source: SetupSourceKind) {
    setSetupSource(source);
    setProbe(null);
    setRunResult(null);
    setLiveRun(null);
    setMeasurement((current) => {
      if (!current) return current;
      const next = { ...current, source };
      measurementRef.current = next;
      return next;
    });
    if (source === "real_camera") {
      setCameraPreviewState((current) => resumeLivePreview(current));
    }
  }

  function applyMeasurement(next: MeasurementDefinition) {
    measurementRef.current = next;
    setMeasurement(next);
    if (next.source === "real_camera") {
      setCameraPreviewState((current) => (current ? { ...current, roi: next.roi } : current));
    }
  }

  async function previewRealCameraFrame(
    mode: RealCameraPreviewMode = cameraPreviewState?.mode ?? "live",
    options: { clearProbe?: boolean } = {}
  ) {
    const clearProbe = options.clearProbe ?? true;
    if (cameraPreviewRequestInFlightRef.current) return;
    cameraPreviewRequestInFlightRef.current = true;
    setPreviewingCamera(true);
    setCameraPreviewRefreshStatus("refreshing");
    setCameraPreviewError(null);
    try {
      const response = await previewRealCamera();
      if (mode === "live" && cameraPreviewModeRef.current === "frozen") {
        return;
      }
      const nextMeasurement = createRealCameraMeasurementFromShape(measurementRef.current, response.shape);
      const effectiveMode = mode === "frozen" ? "frozen" : cameraPreviewModeRef.current;
      setCameraPreview(response);
      setCameraPreviewUrl(response.image_data_url ?? realCameraPreviewImageUrl(Date.now()));
      if (clearProbe) setProbe(null);
      setCameraPreviewState((current) =>
        updateRealCameraPreviewState(current, response, nextMeasurement.roi, effectiveMode)
      );
      applyMeasurement(nextMeasurement);
      setCameraPreviewRefreshStatus("ok");
    } catch (err) {
      if (mode === "live" && cameraPreviewModeRef.current === "frozen") {
        return;
      }
      setCameraPreviewError(cameraPreviewErrorFromUnknown(err));
      setCameraPreviewRefreshStatus("unavailable");
      setCameraPreviewState((current) =>
        updateRealCameraPreviewState(
          current,
          {
            timestamp_ms: current?.timestampMs ?? null,
            shape: current?.shape ?? [],
            camera_status: "unavailable"
          },
          measurementRef.current?.roi ?? null,
          mode === "frozen" ? "frozen" : cameraPreviewModeRef.current
        )
      );
    } finally {
      cameraPreviewRequestInFlightRef.current = false;
      setPreviewingCamera(false);
    }
  }

  function freezeRealCameraPreview() {
    cameraPreviewModeRef.current = "frozen";
    setCameraPreviewState((current) => freezePreview(current));
  }

  function resumeRealCameraPreview() {
    cameraPreviewModeRef.current = "live";
    setCameraPreviewState((current) => resumeLivePreview(current));
  }

  function refreshRealCameraSetupFrame() {
    void previewRealCameraFrame(cameraPreviewState?.mode ?? "live");
  }

  function applyRealCameraProbeResponse(response: RealCameraSetupProbeResponse, mode: RealCameraPreviewMode) {
    const nextMeasurement = response.measurement_definition;
    setCameraPreview(response);
    setCameraPreviewUrl(response.image_data_url);
    setCameraPreviewError(null);
    setCameraPreviewState((current) =>
      updateRealCameraPreviewState(current, response, nextMeasurement.roi, mode)
    );
    applyMeasurement(nextMeasurement);
  }

  function requireSetupFrameDataUrl(url: string): string {
    if (url.startsWith("data:image/png;base64,")) return url;
    throw new Error("Frozen setup frame is not available for probe. Capture a setup frame before probing.");
  }

  function confirmRealCameraPreviewRoi() {
    setCameraPreviewState((current) => confirmPreviewRoi(current, measurementRef.current?.roi ?? null));
  }

  async function readCurrentTemperature() {
    setCheckingTemperature(true);
    setError("");
    setTemperatureError(null);
    try {
      setTemperatureStatus(await getTemperatureStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTemperatureError(temperatureErrorFromUnknown(err));
      setTemperatureStatus(null);
    } finally {
      setCheckingTemperature(false);
    }
  }

  async function refreshSerialPorts() {
    setLoadingSerialPorts(true);
    setError("");
    setTemperatureError(null);
    try {
      setSerialPorts(await listTemperatureSerialPorts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTemperatureError(temperatureErrorFromUnknown(err));
      setSerialPorts([]);
    } finally {
      setLoadingSerialPorts(false);
    }
  }

  async function startRealCameraRun() {
    if (!measurement) return;
    setRunningCamera(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    setLiveRun(null);
    try {
      const response = await createRealCameraRun(measurement, {
        maxFrames: measurement.detector_config.max_frames_per_run ?? 120,
        targetFps: measurement.detector_config.live_offline_fps ?? 8,
        cameraProfile: { pixel_format: "mono8" }
      });
      setRunResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCamera(false);
    }
  }

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedId) ?? null,
    [datasets, selectedId]
  );

  const frameCount = selectedDataset?.frame_count ?? 1;
  const frameUrl =
    frameIndex === 1
      ? frameImageUrl(selectedId, "first")
      : frameIndex === frameCount
        ? frameImageUrl(selectedId, "last")
        : frameIndexImageUrl(selectedId, frameIndex);

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <Database size={22} aria-hidden="true" />
          <div>
            <h1>YY/T 1771 G3</h1>
            <span>AF envelope workstation</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Primary">
          <TabButton page="setup" current={page} onSelect={setPage} icon={<Settings size={16} />}>
            Setup
          </TabButton>
          <TabButton page="run" current={page} onSelect={setPage} icon={<Activity size={16} />}>
            Run
          </TabButton>
          <TabButton page="playback" current={page} onSelect={setPage} icon={<Play size={16} />}>
            Playback
          </TabButton>
          <TabButton page="analysis" current={page} onSelect={setPage} icon={<BarChart3 size={16} />}>
            Analysis / Export
          </TabButton>
        </nav>
        <button className="iconButton" onClick={refreshDatasets} type="button" title="Refresh">
          <RefreshCcw size={17} aria-hidden="true" />
        </button>
      </header>

      <section className="workspace">
        <aside className="datasetRail" aria-label="Offline datasets">
          {datasets.map((dataset) => (
            <button
              className={dataset.id === selectedId ? "datasetItem selected" : "datasetItem"}
              key={dataset.id}
              onClick={() => {
                setSetupSource("offline_dataset");
                setSelectedId(dataset.id);
              }}
              type="button"
            >
              <span className="datasetId">{dataset.id}</span>
              <span className="datasetMeta">
                {dataset.object_class} · {dataset.frame_count.toLocaleString()} frames
              </span>
              <span className="datasetMeta">
                {dataset.default_detector} · {dataset.default_width_mode}
              </span>
            </button>
          ))}
        </aside>

        <section className="panelArea">
          {error ? <div className="statusBlock error">{error}</div> : null}
          {loading && !summary ? <div className="statusBlock">Loading</div> : null}
          {!loading && !selectedDataset ? <div className="statusBlock">No datasets</div> : null}
          {selectedDataset && summary && measurement ? (
            <PageContent
              dataset={selectedDataset}
              summary={summary}
              measurement={measurement}
              onMeasurement={applyMeasurement}
              frameIndex={frameIndex}
              onFrameIndex={setFrameIndex}
              frameUrl={frameUrl}
              setupSource={setupSource}
              onSetupSource={chooseSetupSource}
              probe={probe}
              runResult={runResult}
              liveRun={liveRun}
              cameraPreview={cameraPreview}
              cameraPreviewUrl={cameraPreviewUrl}
              cameraPreviewError={cameraPreviewError}
              cameraPreviewRefreshStatus={cameraPreviewRefreshStatus}
              cameraPreviewState={cameraPreviewState}
              temperatureStatus={temperatureStatus}
              temperatureError={temperatureError}
              serialPorts={serialPorts}
              probing={probing}
              running={running}
              previewingCamera={previewingCamera}
              runningCamera={runningCamera}
              checkingTemperature={checkingTemperature}
              loadingSerialPorts={loadingSerialPorts}
              onProbe={runProbe}
              onProbeRealCameraSetup={runRealCameraSetupProbe}
              onStartRun={startLiveOfflineRun}
              onStopRun={stopLiveOfflineRun}
              onPreviewRealCamera={refreshRealCameraSetupFrame}
              onFreezeRealCameraPreview={freezeRealCameraPreview}
              onResumeRealCameraPreview={resumeRealCameraPreview}
              onConfirmRealCameraPreviewRoi={confirmRealCameraPreviewRoi}
              onStartRealCameraRun={startRealCameraRun}
              onReadCurrentTemperature={readCurrentTemperature}
              onRefreshSerialPorts={refreshSerialPorts}
              page={page}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function TabButton({
  page,
  current,
  onSelect,
  icon,
  children
}: {
  page: Page;
  current: Page;
  onSelect: (page: Page) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button className={page === current ? "active" : ""} onClick={() => onSelect(page)} type="button">
      {icon}
      {children}
    </button>
  );
}

function PageContent({
  dataset,
  summary,
  measurement,
  onMeasurement,
  frameIndex,
  onFrameIndex,
  frameUrl,
  setupSource,
  onSetupSource,
  probe,
  runResult,
  liveRun,
  cameraPreview,
  cameraPreviewUrl,
  cameraPreviewError,
  cameraPreviewRefreshStatus,
  cameraPreviewState,
  temperatureStatus,
  temperatureError,
  serialPorts,
  probing,
  running,
  previewingCamera,
  runningCamera,
  checkingTemperature,
  loadingSerialPorts,
  onProbe,
  onProbeRealCameraSetup,
  onStartRun,
  onStopRun,
  onPreviewRealCamera,
  onFreezeRealCameraPreview,
  onResumeRealCameraPreview,
  onConfirmRealCameraPreviewRoi,
  onStartRealCameraRun,
  onReadCurrentTemperature,
  onRefreshSerialPorts,
  page
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  frameIndex: number;
  onFrameIndex: (frameIndex: number) => void;
  frameUrl: string;
  setupSource: SetupSourceKind;
  onSetupSource: (source: SetupSourceKind) => void;
  probe: ProbeResponse | null;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
  cameraPreview: CameraPreviewResponse | null;
  cameraPreviewUrl: string;
  cameraPreviewError: CameraPreviewError | null;
  cameraPreviewRefreshStatus: PreviewRefreshStatus;
  cameraPreviewState: RealCameraPreviewState | null;
  temperatureStatus: TemperatureStatusResponse | null;
  temperatureError: SetupTemperatureError | null;
  serialPorts: SerialPortInfo[];
  probing: boolean;
  running: boolean;
  previewingCamera: boolean;
  runningCamera: boolean;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  onProbe: (frameIndex?: number) => void;
  onProbeRealCameraSetup: () => void;
  onStartRun: () => void;
  onStopRun: () => void;
  onPreviewRealCamera: () => void;
  onFreezeRealCameraPreview: () => void;
  onResumeRealCameraPreview: () => void;
  onConfirmRealCameraPreviewRoi: () => void;
  onStartRealCameraRun: () => void;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
  page: Page;
}) {
  const setupChangeRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (setupChangeRefreshTimerRef.current !== null) {
        window.clearTimeout(setupChangeRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (page === "setup" && setupSource === "real_camera" && cameraPreviewState?.mode === "live") return;
    if (setupChangeRefreshTimerRef.current !== null) {
      window.clearTimeout(setupChangeRefreshTimerRef.current);
      setupChangeRefreshTimerRef.current = null;
    }
  }, [page, setupSource, cameraPreviewState?.mode]);

  if (page === "run") {
    return (
      <RunPage
        dataset={dataset}
        summary={summary}
        measurement={measurement}
        setupSource={setupSource}
        startFrame={frameIndex}
        runResult={runResult}
        liveRun={liveRun}
        running={running}
        runningCamera={runningCamera}
        onStartRun={onStartRun}
        onStopRun={onStopRun}
        onStartRealCameraRun={onStartRealCameraRun}
      />
    );
  }
  if (page === "analysis") {
    return <AnalysisPage probe={probe} runResult={runResult} liveRun={liveRun} />;
  }
  const isSetup = page === "setup";
  const isRealCameraSetup = isSetup && setupSource === "real_camera";
  const activeFrameTitle = isRealCameraSetup
    ? `Real camera · ${cameraPreviewState?.mode === "frozen" ? "Frozen frame" : "Live preview frame"}`
    : `${dataset.id} · frame ${frameIndex}`;
  const activeFrameUrl = isRealCameraSetup ? cameraPreviewUrl : frameUrl;
  const activeSourceShape = isRealCameraSetup ? cameraPreview?.shape ?? cameraPreviewState?.shape ?? summary.first_frame.shape : summary.first_frame.shape;
  const shouldRefreshAfterRoiCommit = shouldRefreshRealCameraFrameAfterRoiCommit(page, setupSource, cameraPreviewState);
  const frozenSetupMessage = frozenFrameSetupChangeMessage(page, setupSource, cameraPreviewState);
  const displayedProbe = isRealCameraSetup
    ? probe?.dataset_id === "real_camera"
      ? probe
      : null
    : probe?.dataset_id === "real_camera"
      ? null
      : probe;

  function scheduleRealCameraSetupRefresh(change: RealCameraSetupChange) {
    if (!shouldRefreshRealCameraFrameAfterSetupChange(page, setupSource, cameraPreviewState, change)) return;
    if (setupChangeRefreshTimerRef.current !== null) {
      window.clearTimeout(setupChangeRefreshTimerRef.current);
    }
    setupChangeRefreshTimerRef.current = window.setTimeout(() => {
      setupChangeRefreshTimerRef.current = null;
      onPreviewRealCamera();
    }, REAL_CAMERA_SETUP_CHANGE_DEBOUNCE_MS);
  }

  function updateRoi(roi: RotatedROI) {
    onMeasurement({ ...measurement, roi });
  }

  function commitRoi(roi: RotatedROI) {
    onMeasurement({ ...measurement, roi });
    if (setupChangeRefreshTimerRef.current !== null) {
      window.clearTimeout(setupChangeRefreshTimerRef.current);
      setupChangeRefreshTimerRef.current = null;
    }
    if (shouldRefreshAfterRoiCommit) {
      onPreviewRealCamera();
    }
  }

  function resetRoi() {
    const nextRoi = createDefaultRoiForShape(activeSourceShape);
    onMeasurement({ ...measurement, roi: nextRoi });
    scheduleRealCameraSetupRefresh({ kind: "roi" });
  }

  return (
    <div className="pageGrid workGrid">
      <section className="toolPanel">
        <h2>{page === "setup" ? "Setup" : "Playback"}</h2>
        {isSetup ? <SetupSourceControls source={setupSource} onSource={onSetupSource} /> : null}
        {isRealCameraSetup ? (
          <CameraSetupStatusPanel
            preview={cameraPreview}
            previewError={cameraPreviewError}
            previewState={cameraPreviewState}
            refreshStatus={cameraPreviewRefreshStatus}
            previewing={previewingCamera}
            probing={probing}
            onRefresh={onPreviewRealCamera}
            onProbe={onProbeRealCameraSetup}
            onFreeze={onFreezeRealCameraPreview}
            onResume={onResumeRealCameraPreview}
            onConfirmRoi={onConfirmRealCameraPreviewRoi}
          />
        ) : (
          <FrameControls
            frameIndex={frameIndex}
            frameCount={dataset.frame_count}
            onFrameIndex={onFrameIndex}
            onProbe={onProbe}
            probing={probing}
          />
        )}
        {frozenSetupMessage ? <div className="inlineWarning">{frozenSetupMessage}</div> : null}
        <MeasurementControls
          measurement={measurement}
          onMeasurement={onMeasurement}
          onResetRoi={resetRoi}
          onPreviewAffectingChange={(change) => scheduleRealCameraSetupRefresh(change)}
        />
        <DetectorSetupControls
          measurement={measurement}
          onMeasurement={onMeasurement}
          onPreviewAffectingChange={(change) => scheduleRealCameraSetupRefresh(change)}
        />
        <TemperatureControlPanel
          measurement={measurement}
          onMeasurement={onMeasurement}
          temperatureStatus={temperatureStatus}
          temperatureError={temperatureError}
          serialPorts={serialPorts}
          fallbackTemperature={isRealCameraSetup ? null : displayedProbe?.detection_result.temperature_celsius ?? null}
          checkingTemperature={checkingTemperature}
          loadingSerialPorts={loadingSerialPorts}
          onReadCurrentTemperature={onReadCurrentTemperature}
          onRefreshSerialPorts={onRefreshSerialPorts}
        />
        {isRealCameraSetup ? (
          <SetupProbeStatus sourceLabel="Real camera setup probe" probe={displayedProbe} />
        ) : (
          <DetectorStatus dataset={dataset} summary={summary} probe={displayedProbe} />
        )}
      </section>
      <div className="setupPreviewStack">
        {isRealCameraSetup && !activeFrameUrl ? (
          <PreviewPlaceholder
            title={activeFrameTitle}
            refreshStatus={cameraPreviewRefreshStatus}
            previewError={cameraPreviewError}
          />
        ) : (
          <FrameCanvas
            title={activeFrameTitle}
            imageUrl={activeFrameUrl}
            sourceShape={activeSourceShape}
            roi={measurement.roi}
            abPoints={displayedProbe?.detection_result.ab_points ?? null}
            debugArtifacts={displayedProbe?.detection_result.debug_artifacts ?? null}
            onRoiChange={updateRoi}
            onRoiCommit={isRealCameraSetup ? commitRoi : undefined}
          />
        )}
        <DetectionDiagnosticImages debugArtifacts={displayedProbe?.detection_result.debug_artifacts ?? null} />
      </div>
    </div>
  );
}

function SetupSourceControls({
  source,
  onSource
}: {
  source: SetupSourceKind;
  onSource: (source: SetupSourceKind) => void;
}) {
  return (
    <div className="controlStack">
      <h3>Source</h3>
      <div className="segmented wide" aria-label="Setup source">
        {SETUP_SOURCE_OPTIONS.map((option) => (
          <button
            className={source === option.kind ? "active" : ""}
            key={option.kind}
            onClick={() => onSource(option.kind)}
            type="button"
          >
            {option.kind === "offline_dataset" ? <Database size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CameraSetupStatusPanel({
  preview,
  previewError,
  previewState,
  refreshStatus,
  previewing,
  probing,
  onRefresh,
  onProbe,
  onFreeze,
  onResume,
  onConfirmRoi
}: {
  preview: CameraPreviewResponse | null;
  previewError: CameraPreviewError | null;
  previewState: RealCameraPreviewState | null;
  refreshStatus: PreviewRefreshStatus;
  previewing: boolean;
  probing: boolean;
  onRefresh: () => void;
  onProbe: () => void;
  onFreeze: () => void;
  onResume: () => void;
  onConfirmRoi: () => void;
}) {
  const mode = previewState?.mode ?? "live";
  const isFrozen = mode === "frozen";
  return (
    <div className="controlStack">
      <h3>Real Camera Preview</h3>
      <div className="segmented wide" aria-label="Real camera preview mode">
        <button className={!isFrozen ? "active" : ""} onClick={onResume} type="button">
          <Play size={15} aria-hidden="true" />
          Live
        </button>
        <button className={isFrozen ? "active" : ""} disabled={!preview} onClick={onFreeze} type="button">
          <Square size={15} aria-hidden="true" />
          Freeze
        </button>
      </div>
      <dl className="metricGrid compact">
        <Metric label="Preview mode" value={isFrozen ? "Frozen frame" : "Live"} />
        <Metric label="camera_status" value={preview?.camera_status ?? previewError?.camera_status ?? "Not previewed"} />
        <Metric label="model" value={previewValue(preview, "model")} />
        <Metric label="serial_number" value={previewValue(preview, "serial_number")} />
        <Metric label="ip" value={previewValue(preview, "ip")} />
        <Metric label="pixel_format" value={previewValue(preview, "pixel_format")} />
        <Metric label="Frame shape" value={preview ? preview.shape.join(" × ") : "None"} />
        <Metric label="Timestamp" value={preview?.timestamp_ms ?? "None"} />
        <Metric label="Frozen timestamp" value={previewState?.frozenTimestampMs ?? "None"} />
        <Metric label="Live refresh" value={isFrozen ? "Paused" : `${1000 / REAL_CAMERA_SETUP_PREVIEW_INTERVAL_MS} fps UI preview`} />
        <Metric label="Preview refresh" value={previewRefreshStatusLabel(refreshStatus)} />
      </dl>
      <div className="buttonPair">
        <button className="secondaryButton" disabled={previewing} onClick={onRefresh} type="button">
          <RefreshCcw size={16} aria-hidden="true" />
          {previewing ? "Refreshing" : isFrozen ? "Capture new setup frame" : "Refresh frame"}
        </button>
        <button className="primaryButton" disabled={probing || (!preview && isFrozen)} onClick={onProbe} type="button">
          <SquareDashedMousePointer size={16} aria-hidden="true" />
          {probing ? "Probing" : "Probe current frame"}
        </button>
      </div>
      {isFrozen ? (
        <button className="primaryButton" onClick={onResume} type="button">
          <Play size={16} aria-hidden="true" />
          Resume live
        </button>
      ) : (
        <button className="secondaryButton" disabled={!preview} onClick={onFreeze} type="button">
          <Square size={16} aria-hidden="true" />
          Freeze
        </button>
      )}
      {previewState?.roiNeedsReconfirm ? (
        <div className="inlineWarning">
          <span>{previewState.shapeChangeMessage}</span>
          <button className="secondaryButton compactButton" onClick={onConfirmRoi} type="button">
            Confirm ROI
          </button>
        </div>
      ) : null}
      {previewError ? (
        <details className="structuredError" open>
          <summary>{previewError.message}</summary>
          <pre>{JSON.stringify(previewError, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function PreviewPlaceholder({
  title,
  refreshStatus,
  previewError
}: {
  title: string;
  refreshStatus: PreviewRefreshStatus;
  previewError: CameraPreviewError | null;
}) {
  return (
    <figure className="frameCanvasFigure">
      <figcaption>{title}</figcaption>
      <div className="frameCanvas previewPlaceholder">
        <div className={previewError ? "frameCanvasStatus error" : "frameCanvasStatus"}>
          {previewError ? previewError.message : previewRefreshStatusLabel(refreshStatus)}
        </div>
      </div>
    </figure>
  );
}

function FrameControls({
  frameIndex,
  frameCount,
  onFrameIndex,
  onProbe,
  probing
}: {
  frameIndex: number;
  frameCount: number;
  onFrameIndex: (frameIndex: number) => void;
  onProbe: (frameIndex?: number) => void;
  probing: boolean;
}) {
  return (
    <div className="controlStack">
      <div className="segmented wide">
        <button onClick={() => onFrameIndex(1)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          First
        </button>
        <button onClick={() => onFrameIndex(frameCount)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          Last
        </button>
      </div>
      <label className="field">
        <span>Frame</span>
        <input
          max={frameCount}
          min={1}
          onChange={(event) => onFrameIndex(Number(event.target.value))}
          type="number"
          value={frameIndex}
        />
      </label>
      <button className="primaryButton" disabled={probing} onClick={() => onProbe()} type="button">
        <SquareDashedMousePointer size={16} aria-hidden="true" />
        {probing ? "Probing" : "Probe current frame"}
      </button>
    </div>
  );
}

function MeasurementControls({
  measurement,
  onMeasurement,
  onResetRoi,
  onPreviewAffectingChange
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onResetRoi?: () => void;
  onPreviewAffectingChange?: (change: RealCameraSetupChange) => void;
}) {
  function patchRoi(patch: Partial<RotatedROI>) {
    onMeasurement({ ...measurement, roi: { ...measurement.roi, ...patch } });
  }

  function commitRoiField() {
    onPreviewAffectingChange?.({ kind: "roi" });
  }

  return (
    <div className="controlStack">
      <h3>Measurement ROI</h3>
      <div className="twoColumnControls">
        <NumberField label="Center X" value={measurement.roi.center_x} onChange={(v) => patchRoi({ center_x: v })} onCommit={commitRoiField} />
        <NumberField label="Center Y" value={measurement.roi.center_y} onChange={(v) => patchRoi({ center_y: v })} onCommit={commitRoiField} />
        <NumberField label="Width" value={measurement.roi.width} onChange={(v) => patchRoi({ width: Math.max(1, v) })} onCommit={commitRoiField} />
        <NumberField label="Height" value={measurement.roi.height} onChange={(v) => patchRoi({ height: Math.max(1, v) })} onCommit={commitRoiField} />
      </div>
      <label className="field">
        <span>
          <RotateCw size={14} aria-hidden="true" />
          Angle
        </span>
        <input
          onChange={(event) => patchRoi({ angle_deg: Number(event.target.value) })}
          onBlur={commitRoiField}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRoiField();
          }}
          step={0.5}
          type="number"
          value={roundForInput(measurement.roi.angle_deg)}
        />
      </label>
      {onResetRoi ? (
        <button className="secondaryButton" onClick={onResetRoi} type="button">
          <SquareDashedMousePointer size={16} aria-hidden="true" />
          New / reset ROI
        </button>
      ) : null}
    </div>
  );
}

function DetectorSetupControls({
  measurement,
  onMeasurement,
  onPreviewAffectingChange
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange?: (change: RealCameraSetupChange) => void;
}) {
  function patchMeasurement(patch: Partial<MeasurementDefinition>, change: RealCameraSetupChange) {
    onMeasurement({ ...measurement, ...patch });
    onPreviewAffectingChange?.(change);
  }

  function patchDetectorConfig(key: keyof DetectorConfig, value: DetectorConfig[keyof DetectorConfig]) {
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        [key]: value
      }
    });
  }

  function commitDetectorConfig(key: string) {
    onPreviewAffectingChange?.({ kind: "detector_config", key });
  }

  function changeObjectClass(value: string) {
    const option = OBJECT_CLASS_OPTIONS.find((item) => item.value === value);
    patchMeasurement(
      {
        object_class: value,
        detector: option?.detector ?? measurement.detector,
        width_mode: option?.widthMode ?? "max_width"
      },
      { kind: "object_class" }
    );
  }

  return (
    <div className="controlStack">
      <h3>Detector Setup</h3>
      <label className="field">
        <span>Object class</span>
        <select onChange={(event) => changeObjectClass(event.target.value)} value={measurement.object_class}>
          {OBJECT_CLASS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Detector</span>
        <select
          onChange={(event) => patchMeasurement({ detector: event.target.value }, { kind: "detector" })}
          value={measurement.detector}
        >
          {DETECTOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Width mode</span>
        <select
          onChange={(event) =>
            patchMeasurement({ width_mode: event.target.value as MeasurementDefinition["width_mode"] }, { kind: "width_mode" })
          }
          value={measurement.width_mode}
        >
          <option value="max_width">max_width</option>
          <option disabled={measurement.object_class !== "D_RESERVED_OBJECT"} value="min_width">
            min_width
          </option>
        </select>
      </label>
      <DetectorParameterGroups
        definitions={DETECTOR_PARAMETER_DEFS.filter((definition) => !definition.advanced)}
        detectorConfig={measurement.detector_config}
        onChange={patchDetectorConfig}
        onCommit={commitDetectorConfig}
      />
      <details className="advancedDetectorParameters">
        <summary>Advanced</summary>
        <DetectorParameterGroups
          definitions={DETECTOR_PARAMETER_DEFS.filter((definition) => definition.advanced)}
          detectorConfig={measurement.detector_config}
          onChange={patchDetectorConfig}
          onCommit={commitDetectorConfig}
        />
      </details>
    </div>
  );
}

function DetectorParameterGroups({
  definitions,
  detectorConfig,
  onChange,
  onCommit
}: {
  definitions: DetectorParameterDef[];
  detectorConfig: DetectorConfig;
  onChange: (key: keyof DetectorConfig, value: DetectorConfig[keyof DetectorConfig]) => void;
  onCommit: (key: string) => void;
}) {
  const groups = Array.from(new Set(definitions.map((definition) => definition.group)));
  return (
    <>
      {groups.map((group) => (
        <div className="detectorParameterGroup" key={group}>
          <h4>{group}</h4>
          <div className="twoColumnControls">
            {definitions
              .filter((definition) => definition.group === group)
              .map((definition) => (
                <DetectorParameterField
                  definition={definition}
                  detectorConfig={detectorConfig}
                  key={String(definition.key)}
                  onChange={onChange}
                  onCommit={onCommit}
                />
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function DetectorParameterField({
  definition,
  detectorConfig,
  onChange,
  onCommit
}: {
  definition: DetectorParameterDef;
  detectorConfig: DetectorConfig;
  onChange: (key: keyof DetectorConfig, value: DetectorConfig[keyof DetectorConfig]) => void;
  onCommit: (key: string) => void;
}) {
  const value = detectorConfig[definition.key] ?? (DEFAULT_CONFIG as DetectorConfig)[definition.key];
  if (definition.type === "bool") {
    return (
      <label className="field checkboxField" title={definition.title}>
        <span>{definition.label}</span>
        <input
          checked={Boolean(value)}
          onChange={(event) => {
            onChange(definition.key, event.target.checked);
            onCommit(String(definition.key));
          }}
          type="checkbox"
        />
      </label>
    );
  }
  if (definition.type === "select") {
    return (
      <label className="field" title={definition.title}>
        <span>{definition.label}</span>
        <select
          onChange={(event) => {
            onChange(definition.key, event.target.value as DetectorConfig[keyof DetectorConfig]);
            onCommit(String(definition.key));
          }}
          value={typeof value === "string" ? value : ""}
        >
          {(definition.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <NumberField
      label={definition.label}
      max={definition.max}
      min={definition.min}
      step={definition.step}
      title={definition.title}
      value={typeof value === "number" ? value : Number(definition.min ?? 0)}
      onChange={(nextValue) => {
        onChange(definition.key, normalizeDetectorNumber(definition, nextValue));
      }}
      onCommit={(nextValue) => {
        onChange(definition.key, normalizeDetectorNumber(definition, nextValue));
        onCommit(String(definition.key));
      }}
    />
  );
}

function normalizeDetectorNumber(definition: DetectorParameterDef, value: number): number {
  const fallback = typeof (DEFAULT_CONFIG as DetectorConfig)[definition.key] === "number"
    ? Number((DEFAULT_CONFIG as DetectorConfig)[definition.key])
    : 0;
  let next = Number.isFinite(value) ? value : fallback;
  if (definition.type === "int") next = Math.round(next);
  if (definition.min != null) next = Math.max(definition.min, next);
  if (definition.max != null) next = Math.min(definition.max, next);
  return next;
}

function TemperatureControlPanel({
  measurement,
  onMeasurement,
  temperatureStatus,
  temperatureError,
  serialPorts,
  fallbackTemperature,
  checkingTemperature,
  loadingSerialPorts,
  onReadCurrentTemperature,
  onRefreshSerialPorts
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  temperatureStatus: TemperatureStatusResponse | null;
  temperatureError: SetupTemperatureError | null;
  serialPorts: SerialPortInfo[];
  fallbackTemperature: number | null;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
}) {
  const summary = buildSetupTemperatureSummary(
    measurement,
    temperatureStatus,
    serialPorts,
    temperatureError,
    fallbackTemperature
  );

  function patchConfig(patch: Partial<MeasurementDefinition["detector_config"]>) {
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        ...patch
      }
    });
  }

  return (
    <div className="controlStack">
      <h3>Temperature Control</h3>
      <dl className="metricGrid compact">
        <Metric label="Current" value={summary.currentTemperature} />
        <Metric label="Status" value={summary.status} />
        <Metric label="Source" value={summary.source} />
        <Metric label="Timestamp" value={summary.timestamp} />
        <Metric label="Target" value={summary.targetTemperatureCelsius} />
        <Metric label="Power" value={summary.temperaturePowerPercent} />
        <Metric label="Ports" value={summary.ports} />
        <Metric label="Port count" value={summary.portCount} />
        <Metric label="Error" value={summary.error} />
      </dl>
      <div className="twoColumnControls">
        <NullableNumberField
          label="target_temperature_celsius"
          value={measurement.detector_config.target_temperature_celsius ?? null}
          onChange={(v) => patchConfig({ target_temperature_celsius: v })}
        />
        <NumberField
          label="temperature_power_percent"
          value={measurement.detector_config.temperature_power_percent ?? 100}
          onChange={(v) => patchConfig({ temperature_power_percent: clamp(v, 0, 100) })}
        />
      </div>
      <div className="buttonPair">
        <button className="secondaryButton" disabled={checkingTemperature} onClick={onReadCurrentTemperature} type="button">
          <Thermometer size={16} aria-hidden="true" />
          {checkingTemperature ? "Reading" : "Read temp"}
        </button>
        <button className="secondaryButton" disabled={loadingSerialPorts} onClick={onRefreshSerialPorts} type="button">
          <Usb size={16} aria-hidden="true" />
          {loadingSerialPorts ? "Scanning" : "Ports"}
        </button>
      </div>
      {temperatureError ? (
        <details className="structuredError" open>
          <summary>{temperatureError.message}</summary>
          <pre>{JSON.stringify(temperatureError, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
  step = 1,
  title
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  step?: number;
  title?: string;
}) {
  return (
    <label className="field" title={title}>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={(event) => onCommit?.(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit?.(Number(event.currentTarget.value));
        }}
        step={step}
        type="number"
        value={roundForInput(value)}
      />
    </label>
  );
}

function NullableNumberField({
  label,
  value,
  min,
  onChange,
  step = 1
}: {
  label: string;
  value: number | null;
  min?: number;
  onChange: (value: number | null) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={min}
        onChange={(event) => {
          const raw = event.target.value.trim();
          onChange(raw === "" ? null : Number(raw));
        }}
        placeholder="None"
        step={step}
        type="number"
        value={value == null ? "" : roundForInput(value)}
      />
    </label>
  );
}

function DetectorStatus({
  dataset,
  summary,
  probe
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  probe: ProbeResponse | null;
}) {
  const result = probe?.detection_result ?? null;
  return (
    <div className="diagnostics">
      <h3>Result</h3>
      <dl className="metricGrid compact">
        <Metric label="Dataset" value={dataset.id} />
        <Metric label="Detector" value={dataset.default_detector} />
        <Metric label="Frames" value={dataset.frame_count.toLocaleString()} />
        <Metric label="Temperature rows" value={summary.temperature.row_count.toLocaleString()} />
        <Metric label="Status" value={result?.detection_status ?? "Not probed"} />
        <Metric label="Distance" value={formatDistance(result)} />
        <Metric label="Rejected" value={result?.rejected_reason || "None"} />
        <Metric label="Temperature" value={formatTemperature(result)} />
        <Metric label="Sync" value={result?.temperature_sync_status ?? "Not probed"} />
      </dl>
      {result ? (
        <details>
          <summary>Diagnostics</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function SetupProbeStatus({
  sourceLabel,
  probe
}: {
  sourceLabel: string;
  probe: ProbeResponse | null;
}) {
  const result = probe?.detection_result ?? null;
  return (
    <div className="diagnostics">
      <h3>Probe Result</h3>
      <dl className="metricGrid compact">
        <Metric label="Source" value={sourceLabel} />
        <Metric label="Frame timestamp" value={probe?.frame.timestamp_ms ?? "Not probed"} />
        <Metric label="Status" value={result?.detection_status ?? "Not probed"} />
        <Metric label="Distance" value={formatDistance(result)} />
        <Metric label="Rejected" value={result?.rejected_reason || "None"} />
        <Metric label="Debug artifacts" value={result ? Object.keys(result.debug_artifacts).length : "None"} />
      </dl>
      {probe ? (
        <details>
          <summary>Diagnostics</summary>
          <pre>{JSON.stringify(probe, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function DetectionDiagnosticImages({
  debugArtifacts
}: {
  debugArtifacts?: Record<string, unknown> | null;
}) {
  const images = readDiagnosticImages(debugArtifacts);
  if (!images) return null;
  const roiWarning =
    debugArtifacts &&
    typeof debugArtifacts.roi_edge_warning === "string"
      ? debugArtifacts.roi_edge_warning
      : null;
  return (
    <section className="diagnosticImagePanel" aria-label="Detection diagnostic images">
      <div className="diagnosticImageHeader">
        <h3>Detection Diagnostics</h3>
        <span>{images[0]?.coordinates ?? "roi_local_pixel"}</span>
      </div>
      {roiWarning ? <div className="diagnosticWarning">{roiWarning}</div> : null}
      <div className="diagnosticImageGrid">
        {images.map((image) => (
          <DiagnosticImageFigure image={image} key={image.label} />
        ))}
      </div>
    </section>
  );
}

function DiagnosticImageFigure({ image }: { image: DiagnosticImages[number] }) {
  const sizeLabel = image.width && image.height ? `${image.width} × ${image.height}` : "";
  return (
    <figure className="diagnosticImageFigure">
      <figcaption>
        <span>{image.label}</span>
        {sizeLabel ? <span>{sizeLabel}</span> : null}
      </figcaption>
      <img src={image.src} alt={image.label} />
    </figure>
  );
}

function FrameCanvas({
  title,
  imageUrl,
  sourceShape,
  roi,
  abPoints,
  debugArtifacts,
  onRoiChange,
  onRoiCommit,
  readOnly = false
}: {
  title: string;
  imageUrl: string;
  sourceShape: number[];
  roi: RotatedROI;
  abPoints: { a: ABPoint; b: ABPoint } | null;
  debugArtifacts?: Record<string, unknown> | null;
  onRoiChange?: (roi: RotatedROI) => void;
  onRoiCommit?: (roi: RotatedROI) => void;
  readOnly?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [rect, setRect] = useState({ width: 800, height: 520 });
  const [dragInteraction, setDragInteraction] = useState<RoiDragInteraction | null>(null);
  const source = { width: sourceShape[1] ?? 1, height: sourceShape[0] ?? 1 };
  const transform = fitSourceToDisplay(source, rect);
  const displayRoi = measurementRoiToDisplay(roi, transform);
  const corners = roiCorners(displayRoi);
  const handles = roiResizeHandles(corners);
  const rotateHandle = roiRotateHandle(corners, displayRoi);
  const editable = !readOnly && Boolean(onRoiChange);
  const stableImage = useStableImageUrl(imageUrl);
  const latestDragRoiRef = useRef<RotatedROI | null>(null);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect;
      if (next) setRect({ width: next.width, height: next.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function pointerToMeasurement(event: React.PointerEvent<SVGElement>) {
    const bounds = svgRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const displayPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    return displayPointToMeasurement(displayPoint, transform, true);
  }

  function beginInteraction(
    event: React.PointerEvent<SVGElement>,
    interaction: RoiDragStart
  ) {
    if (!editable) return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    latestDragRoiRef.current = roi;
    setDragInteraction({
      ...interaction,
      startRoi: roi,
      startPoint: pointerToMeasurement(event)
    });
  }

  function updateInteraction(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragInteraction || !onRoiChange) return;
    const currentPoint = pointerToMeasurement(event);
    let nextRoi: RotatedROI;
    if (dragInteraction.kind === "move") {
      nextRoi = moveRoiFromDrag(dragInteraction.startRoi, dragInteraction.startPoint, currentPoint);
    } else if (dragInteraction.kind === "resize") {
      nextRoi = resizeRoiFromHandle(dragInteraction.startRoi, dragInteraction.handle, currentPoint);
    } else {
      nextRoi = rotateRoiToPointer(dragInteraction.startRoi, currentPoint);
    }
    latestDragRoiRef.current = nextRoi;
    onRoiChange(nextRoi);
  }

  function finishInteraction(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragInteraction) return;
    svgRef.current?.releasePointerCapture(event.pointerId);
    const committedRoi = latestDragRoiRef.current ?? dragInteraction.startRoi;
    latestDragRoiRef.current = null;
    setDragInteraction(null);
    onRoiCommit?.(committedRoi);
  }

  return (
    <figure className="frameCanvasFigure">
      <figcaption>{title}</figcaption>
      <div className="frameCanvas" ref={shellRef}>
        {stableImage.displayedUrl ? (
          <img className="frameCanvasImage" src={stableImage.displayedUrl} alt={title} />
        ) : (
          <div className="frameCanvasStatus">Loading frame...</div>
        )}
        {stableImage.status === "error" && stableImage.errorUrl ? (
          <div className="frameCanvasStatus error">Frame image unavailable</div>
        ) : null}
        <svg
          className={editable ? "overlaySvg" : "overlaySvg readOnly"}
          ref={svgRef}
          onPointerMove={updateInteraction}
          onPointerCancel={finishInteraction}
          onPointerUp={finishInteraction}
          role="img"
        >
          {editable ? (
            <line
              className="roiRotateLine"
              x1={(corners[0].x + corners[1].x) / 2}
              y1={(corners[0].y + corners[1].y) / 2}
              x2={rotateHandle.x}
              y2={rotateHandle.y}
            />
          ) : null}
          <polygon
            className="roiPolygon"
            onPointerDown={(event) => beginInteraction(event, { kind: "move" })}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          />
          {editable ? (
            <>
              <circle
                className="roiHandle roiMoveHandle"
                cx={displayRoi.center_x}
                cy={displayRoi.center_y}
                data-testid="roi-move-handle"
                onPointerDown={(event) => beginInteraction(event, { kind: "move" })}
                r={6}
              />
              {handles.map((handle) => (
                <rect
                  className="roiHandle roiResizeHandle"
                  data-testid={`roi-resize-${handle.handle}`}
                  height={10}
                  key={handle.handle}
                  onPointerDown={(event) => beginInteraction(event, { kind: "resize", handle: handle.handle })}
                  width={10}
                  x={handle.point.x - 5}
                  y={handle.point.y - 5}
                />
              ))}
              <circle
                className="roiHandle roiRotateHandle"
                cx={rotateHandle.x}
                cy={rotateHandle.y}
                data-testid="roi-rotate-handle"
                onPointerDown={(event) => beginInteraction(event, { kind: "rotate" })}
                r={7}
              />
            </>
          ) : null}
          {debugArtifacts ? <ContourProjectionOverlay debugArtifacts={debugArtifacts} transform={transform} /> : null}
          {abPoints ? <ABOverlay abPoints={abPoints} transform={transform} /> : null}
        </svg>
      </div>
    </figure>
  );
}

function useStableImageUrl(imageUrl: string): {
  displayedUrl: string;
  status: "idle" | "loading" | "loaded" | "error";
  errorUrl: string;
} {
  const [displayedUrl, setDisplayedUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [errorUrl, setErrorUrl] = useState("");
  const latestUrlRef = useRef("");
  const displayedUrlRef = useRef("");
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadLatestRef = useRef<() => void>(() => {});
  loadLatestRef.current = () => {
    if (loadingRef.current) return;
    const nextUrl = latestUrlRef.current;
    if (!nextUrl || nextUrl === displayedUrlRef.current) return;

    loadingRef.current = true;
    setStatus(displayedUrlRef.current ? "loaded" : "loading");
    setErrorUrl("");

    const image = new Image();
    const loadUrl = nextUrl;
    image.onload = () => {
      if (!mountedRef.current) return;
      loadingRef.current = false;
      displayedUrlRef.current = loadUrl;
      setDisplayedUrl(loadUrl);
      setStatus("loaded");
      setErrorUrl("");
      if (latestUrlRef.current !== loadUrl) {
        loadLatestRef.current();
      }
    };
    image.onerror = () => {
      if (!mountedRef.current) return;
      loadingRef.current = false;
      setStatus(displayedUrlRef.current ? "loaded" : "error");
      setErrorUrl(loadUrl);
      if (latestUrlRef.current !== loadUrl) {
        loadLatestRef.current();
      }
    };
    image.src = loadUrl;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestUrlRef.current = imageUrl;
    if (!imageUrl) {
      displayedUrlRef.current = "";
      loadingRef.current = false;
      setDisplayedUrl("");
      setStatus("idle");
      setErrorUrl("");
      return;
    }
    loadLatestRef.current();
  }, [imageUrl]);

  return { displayedUrl, status, errorUrl };
}

type RoiDragInteraction =
  | {
      kind: "move";
      startRoi: RotatedROI;
      startPoint: ABPoint;
    }
  | {
      kind: "resize";
      handle: RoiResizeHandle;
      startRoi: RotatedROI;
      startPoint: ABPoint;
    }
  | {
      kind: "rotate";
      startRoi: RotatedROI;
      startPoint: ABPoint;
    };

type RoiDragStart =
  | {
      kind: "move";
    }
  | {
      kind: "resize";
      handle: RoiResizeHandle;
    }
  | {
      kind: "rotate";
    };

function roiResizeHandles(corners: ABPoint[]): Array<{ handle: RoiResizeHandle; point: ABPoint }> {
  const [nw, ne, se, sw] = corners;
  return [
    { handle: "nw", point: nw },
    { handle: "n", point: midpoint(nw, ne) },
    { handle: "ne", point: ne },
    { handle: "e", point: midpoint(ne, se) },
    { handle: "se", point: se },
    { handle: "s", point: midpoint(se, sw) },
    { handle: "sw", point: sw },
    { handle: "w", point: midpoint(sw, nw) }
  ];
}

function roiRotateHandle(corners: ABPoint[], roi: RotatedROI): ABPoint {
  const topCenter = midpoint(corners[0], corners[1]);
  const outward = normalizeVector({ x: topCenter.x - roi.center_x, y: topCenter.y - roi.center_y });
  return {
    x: topCenter.x + outward.x * 32,
    y: topCenter.y + outward.y * 32
  };
}

function midpoint(a: ABPoint, b: ABPoint): ABPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalizeVector(vector: ABPoint): ABPoint {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function readPointArray(value: unknown): ABPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { x?: unknown }).x === "number" &&
      typeof (item as { y?: unknown }).y === "number"
    ) {
      return [{ x: (item as { x: number }).x, y: (item as { y: number }).y }];
    }
    return [];
  });
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrowHeadPath(start: ABPoint, end: ABPoint, size: number, spread: number): string {
  const direction = normalizeVector({ x: end.x - start.x, y: end.y - start.y });
  const normal = { x: -direction.y, y: direction.x };
  const p1 = {
    x: end.x - direction.x * size + normal.x * size * spread,
    y: end.y - direction.y * size + normal.y * size * spread
  };
  const p2 = {
    x: end.x - direction.x * size - normal.x * size * spread,
    y: end.y - direction.y * size - normal.y * size * spread
  };
  return `M ${end.x} ${end.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;
}

function ABOverlay({
  abPoints,
  transform
}: {
  abPoints: { a: ABPoint; b: ABPoint };
  transform: FrameDisplayTransform;
}) {
  const a = measurementPointToDisplay(abPoints.a, transform);
  const b = measurementPointToDisplay(abPoints.b, transform);
  return (
    <g className="abOverlay">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <circle cx={a.x} cy={a.y} r={5} />
      <circle cx={b.x} cy={b.y} r={5} />
      <text x={a.x + 8} y={a.y - 8}>
        A
      </text>
      <text x={b.x + 8} y={b.y + 16}>
        B
      </text>
    </g>
  );
}

function ContourProjectionOverlay({
  debugArtifacts,
  transform
}: {
  debugArtifacts: Record<string, unknown>;
  transform: FrameDisplayTransform;
}) {
  const fullBox = readPointArray(debugArtifacts.contour_full_box);
  const projectionBox = readPointArray(debugArtifacts.contour_projection_box);
  const box = fullBox.length === 4 ? fullBox : projectionBox;
  const bandBox = readPointArray(debugArtifacts.contour_measurement_band_box);
  const arrow = readPointArray(debugArtifacts.contour_direction_arrow);
  if (box.length !== 4 && arrow.length !== 2) return null;
  const displayBox = box.map((point) => measurementPointToDisplay(point, transform));
  const displayBandBox = bandBox.map((point) => measurementPointToDisplay(point, transform));
  const displayArrow = arrow.map((point) => measurementPointToDisplay(point, transform));
  const theta = numberFromUnknown(debugArtifacts.contour_theta_deg);
  const length = numberFromUnknown(debugArtifacts.contour_length_px);
  const showBand = debugArtifacts.show_measurement_band_box !== false;
  const label = `Full detected contour region  ${theta == null ? "theta=?" : `theta=${theta.toFixed(1)} deg`}  ${
    length == null ? "L=?" : `L=${length.toFixed(1)}px`
  }`;
  return (
    <g className="contourProjectionOverlay">
      {displayBox.length === 4 ? (
        <polygon className="contourFullBox" points={displayBox.map((point) => `${point.x},${point.y}`).join(" ")} />
      ) : null}
      {showBand && displayBandBox.length === 4 ? (
        <>
          <polygon className="contourMeasurementBandBox" points={displayBandBox.map((point) => `${point.x},${point.y}`).join(" ")} />
          <text className="contourMeasurementBandLabel" x={displayBandBox[0].x + 8} y={displayBandBox[0].y + 18}>
            Measurement band
          </text>
        </>
      ) : null}
      {displayArrow.length === 2 ? (
        <>
          <line x1={displayArrow[0].x} y1={displayArrow[0].y} x2={displayArrow[1].x} y2={displayArrow[1].y} />
          <path d={arrowHeadPath(displayArrow[0], displayArrow[1], 18, 0.45)} />
        </>
      ) : null}
      <text x={18} y={28}>
        {label}
      </text>
    </g>
  );
}

function RunPage({
  dataset,
  summary,
  measurement,
  setupSource,
  startFrame,
  runResult,
  liveRun,
  running,
  runningCamera,
  onStartRun,
  onStopRun,
  onStartRealCameraRun
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  measurement: MeasurementDefinition;
  setupSource: SetupSourceKind;
  startFrame: number;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
  running: boolean;
  runningCamera: boolean;
  onStartRun: () => void;
  onStopRun: () => void;
  onStartRealCameraRun: () => void;
}) {
  const displayedLiveRun = setupSource === "offline_dataset" ? liveRun : null;
  const displayedRunResult =
    runResult && runResultMatchesSetupSource(setupSource, dataset.id, runResult.run_manifest.dataset_id)
      ? runResult
      : null;
  const manifest = displayedRunResult?.run_manifest ?? null;
  const analysis = displayedLiveRun?.analysis ?? displayedRunResult?.analysis_result ?? null;
  const runMode = runModeForSetupSource(setupSource);
  const setupSummary = buildRunSetupSummary(setupSource, dataset.id, measurement);
  const latestRunMode = manifest?.dataset_id === "real_camera" ? "Real camera run" : "Live offline run";
  const isDisplayedRealCameraRun = displayedLiveRun == null && manifest?.dataset_id === "real_camera";
  const remainingFrames =
    runMode.kind === "real_camera_run"
      ? measurement.detector_config.max_frames_per_run ?? 120
      : Math.max(0, dataset.frame_count - startFrame + 1);
  const latestDetection =
    displayedLiveRun?.detectionResult ??
    (manifest?.detection_results.length
      ? manifest.detection_results[manifest.detection_results.length - 1]
      : null);
  const latestFrameRecord =
    isDisplayedRealCameraRun && latestDetection
      ? manifest?.frame_records.find((record) => record.frame_index === latestDetection.frame_index) ?? null
      : null;
  const latestFrameUrl =
    displayedLiveRun?.frameUrl ??
    (latestDetection
      ? isDisplayedRealCameraRun && manifest
        ? runFrameImageUrl(manifest.run_id, latestDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
        : frameIndexImageUrl(dataset.id, latestDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
      : "");
  const latestFrameTitle =
    latestDetection && isDisplayedRealCameraRun && manifest
      ? `Real camera run · ${manifest.run_id} · frame ${latestDetection.frame_index}`
      : latestDetection
        ? `${dataset.id} · live frame ${latestDetection.frame_index}`
        : "";
  const latestSourceShape =
    isDisplayedRealCameraRun
      ? latestFrameRecord?.shape ?? summary.first_frame.shape
      : summary.first_frame.shape;
  return (
    <div className="pageGrid runGrid">
      <section className="toolPanel">
        <h2>Run</h2>
        <div className="controlStack">
          <h3>Setup Summary</h3>
          <dl className="metricGrid compact">
            <Metric label="Source" value={setupSummary.sourceLabel} />
            <Metric label="Source ID" value={setupSummary.sourceId} />
            <Metric label="Measurement" value={measurement.measurement_id} />
            <Metric label="ROI center" value={setupSummary.roiCenter} />
            <Metric label="ROI size" value={setupSummary.roiSize} />
            <Metric label="ROI angle" value={setupSummary.roiAngle} />
            <Metric label="Object class" value={setupSummary.objectClass} />
            <Metric label="Detector" value={setupSummary.detector} />
            <Metric label="Width mode" value={setupSummary.widthMode} />
            <Metric label="max_frames_per_run" value={setupSummary.maxFramesPerRun} />
            <Metric label="target_fps" value={setupSummary.targetFps} />
            <Metric label="target_temperature_celsius" value={setupSummary.targetTemperatureCelsius} />
            <Metric label="temperature_power_percent" value={setupSummary.temperaturePowerPercent} />
          </dl>
        </div>
        <div className="controlStack">
          <h3>{runMode.kind === "real_camera_run" ? "Real Camera Run" : "Live Offline Run"}</h3>
          <dl className="metricGrid compact">
            <Metric label="Start frame" value={runMode.kind === "real_camera_run" ? "Live" : startFrame.toLocaleString()} />
            <Metric label="Frame budget" value={remainingFrames.toLocaleString()} />
            <Metric
              label="Progress"
              value={
                displayedLiveRun
                  ? `${displayedLiveRun.processedFrames.toLocaleString()} / ${displayedLiveRun.totalFrames.toLocaleString()}`
                  : "Idle"
              }
            />
            <Metric label="Current frame" value={displayedLiveRun?.frameIndex.toLocaleString() ?? "None"} />
            <Metric label="Distance" value={formatDistance(latestDetection)} />
            <Metric label="Temperature" value={formatTemperature(latestDetection)} />
            <Metric label="Sync" value={latestDetection?.temperature_sync_status ?? "None"} />
          </dl>
          <div className="buttonPair">
            <button
              className="primaryButton"
              disabled={runMode.kind === "real_camera_run" ? runningCamera : running}
              onClick={runMode.kind === "real_camera_run" ? onStartRealCameraRun : onStartRun}
              type="button"
            >
              <Play size={16} aria-hidden="true" />
              {(runMode.kind === "real_camera_run" ? runningCamera : running) ? runMode.pendingLabel : runMode.startLabel}
            </button>
            <button className="secondaryButton" disabled={runMode.kind === "real_camera_run" || !running} onClick={onStopRun} type="button">
              <Square size={16} aria-hidden="true" />
              Stop
            </button>
          </div>
        </div>
      </section>
      <div className="runDetailStack">
        {analysis ? (
        <section className="toolPanel">
          <div className="runTrendHeader">
            <div>
              <h2>{liveRun?.status === "running" ? "Live Trend" : "Run Trend"}</h2>
              <p>
                {displayedLiveRun ? "Live offline run" : latestRunMode} · {displayedLiveRun?.runId ?? manifest?.run_id ?? "no run id"}
              </p>
            </div>
            <div className="runTrendStatusLabel" aria-label="Run trend scope">
              {displayedLiveRun?.status === "running" ? "Current run so far" : "Full run"}
            </div>
          </div>
          <RunTrendChart
            analysis={analysis}
            runId={displayedLiveRun?.runId ?? manifest?.run_id ?? null}
            isRunning={displayedLiveRun?.status === "running"}
            targetTemperature={measurement.detector_config.target_temperature_celsius ?? null}
          />
        </section>
        ) : null}
        {latestFrameUrl && latestDetection ? (
          <>
            <FrameCanvas
              title={latestFrameTitle}
              imageUrl={latestFrameUrl}
              sourceShape={latestSourceShape}
              roi={measurement.roi}
              abPoints={latestDetection.ab_points}
              debugArtifacts={latestDetection.debug_artifacts}
              readOnly
            />
            <DetectionDiagnosticImages debugArtifacts={latestDetection.debug_artifacts} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisPage({
  probe,
  runResult,
  liveRun
}: {
  probe: ProbeResponse | null;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
}) {
  const baseAnalysis = runResult?.analysis_result ?? (liveRun?.status === "stopped" ? liveRun.analysis : null);
  const selectedRunId = runResult?.run_manifest.run_id ?? (liveRun?.status === "stopped" ? liveRun.runId : null);
  const [analysisOverride, setAnalysisOverride] = useState<AnalysisResult | null>(null);
  const analysis = analysisOverride ?? baseAnalysis;
  const [artifacts, setArtifacts] = useState<ExportArtifact[]>(analysis?.export_artifacts ?? []);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setAnalysisOverride(null);
  }, [selectedRunId]);

  useEffect(() => {
    setArtifacts(analysis?.export_artifacts ?? []);
    setExportError("");
  }, [analysis]);

  async function exportCurrentRun() {
    if (!selectedRunId) return;
    setExporting(true);
    setExportError("");
    try {
      setArtifacts(await createRunExports(selectedRunId));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pageGrid runGrid analysisPageGrid">
      <section className="toolPanel analysisExportPanel">
        <h2>Analysis / Export</h2>
        <dl className="metricGrid compact">
          <Metric label="Run" value={selectedRunId ?? "No run selected"} />
          <Metric label="Latest probe" value={probe?.detection_result.distance_px ? `${probe.detection_result.distance_px.toFixed(2)} px` : "None"} />
          <Metric label="Formal temp-distance points" value={analysis?.temperature_distance.length ?? 0} />
          <Metric label="AFAS status" value={readAfasStatus(analysis)} />
        </dl>
        <button
          className="primaryButton spaced"
          disabled={!selectedRunId || exporting}
          onClick={exportCurrentRun}
          type="button"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? "Exporting" : "Export"}
        </button>
        {exportError ? <div className="inlineError">{exportError}</div> : null}
        {artifacts.length ? (
          <div className="artifactList">
            {artifacts.map((artifact) => (
              <a href={artifactDownloadUrl(artifact)} key={artifact.artifact_id}>
                {artifact.artifact_type}
              </a>
            ))}
          </div>
        ) : null}
      </section>
      {analysis ? (
        <section className="toolPanel analysisMainPanel">
          <h2>{selectedRunId ? `Analysis · ${selectedRunId}` : "Analysis"}</h2>
          <AnalysisAfasChart analysis={analysis} />
          <details className="analysisParameterDisclosure">
            <summary>
              <Settings size={15} aria-hidden="true" />
              AFAS parameters
            </summary>
            <AfasParameterPanel
              analysis={analysis}
              runId={selectedRunId}
              onAnalysisUpdated={setAnalysisOverride}
            />
          </details>
        </section>
      ) : null}
    </div>
  );
}

function AfasResultPanel({ analysis }: { analysis: AnalysisResult }) {
  const afas = analysis.afas_analysis ?? {};
  const result = readRecord(afas.result);
  const fit = readRecord(afas.fit);
  const status = typeof afas.result_status === "string" ? afas.result_status : "unavailable";
  return (
    <dl className="metricGrid compact afasResultGrid">
      <Metric label="Status" value={status} />
      <Metric label="As" value={formatOptionalNumber(result.As, " °C")} />
      <Metric label="Af-tan" value={formatOptionalNumber(result.Af_tan, " °C")} />
      <Metric label="ΔT" value={formatDeltaT(result.As, result.Af_tan)} />
      <Metric label="Max slope" value={formatOptionalNumber(result.max_slope_temp, " °C")} />
      <Metric label="Outliers" value={typeof afas.outlier_count === "number" ? afas.outlier_count : "None"} />
      <Metric label="Low range" value={formatRange(readRecord(afas.parameters).resolved_low_range_celsius)} />
      <Metric label="High range" value={formatRange(readRecord(afas.parameters).resolved_high_range_celsius)} />
      <Metric label="Tangent slope" value={formatOptionalNumber(readRecord(fit.tangent).slope, " px/°C")} />
    </dl>
  );
}

function AfasParameterPanel({
  analysis,
  runId,
  onAnalysisUpdated
}: {
  analysis: AnalysisResult;
  runId: string | null;
  onAnalysisUpdated: (analysis: AnalysisResult) => void;
}) {
  const [preprocessing, setPreprocessing] = useState<AfasPreprocessingParameters>(() =>
    readAfasPreprocessingParameters(analysis)
  );
  const [tangent, setTangent] = useState<AfasAnalysisFormState>(() => readAfasAnalysisForm(analysis));
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState("");
  const preprocessingPayload = readRecord(analysis.afas_preprocessing);
  const smoothed = readRecord(preprocessingPayload.smoothed);
  const outlierRepair = readRecord(preprocessingPayload.outlier_repair);
  const warnings = readAfasWarnings(analysis);

  useEffect(() => {
    setPreprocessing(readAfasPreprocessingParameters(analysis));
    setTangent(readAfasAnalysisForm(analysis));
    setError("");
  }, [analysis]);

  function patchPreprocessing(patch: Partial<AfasPreprocessingParameters>) {
    setPreprocessing((current) => ({ ...current, ...patch }));
  }

  function patchRange(
    key: "low_range_celsius" | "high_range_celsius",
    index: 0 | 1,
    value: number | null
  ) {
    setTangent((current) => {
      const nextRange: [number | null, number | null] = [current[key][0], current[key][1]];
      nextRange[index] = value;
      return { ...current, [key]: nextRange };
    });
  }

  async function recalculateAnalysis() {
    if (!runId) return;
    setRecalculating(true);
    setError("");
    try {
      const nextPreprocessing = normalizeAfasPreprocessingParameters(preprocessing);
      const nextTangent = normalizeAfasAnalysisParameters(tangent);
      const nextAnalysis = await recomputeRunAnalysis(runId, {
        afas_preprocessing_parameters: nextPreprocessing,
        afas_analysis_parameters: nextTangent
      });
      onAnalysisUpdated(nextAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="analysisParameterPanel">
      <div className="analysisParameterHeader">
        <h3>
          <Settings size={15} aria-hidden="true" />
          AFAS Parameters
        </h3>
        <button
          className="secondaryButton analysisRecalculateButton"
          disabled={!runId || recalculating}
          onClick={recalculateAnalysis}
          type="button"
        >
          <RefreshCcw size={15} aria-hidden="true" />
          {recalculating ? "Recalculating" : "Recalculate"}
        </button>
      </div>
      <div className="analysisControlGrid">
        <fieldset>
          <legend>Preprocessing</legend>
          <label className="field checkboxField">
            <input
              checked={preprocessing.group_by_temperature}
              onChange={(event) => patchPreprocessing({ group_by_temperature: event.target.checked })}
              type="checkbox"
            />
            <span>Group by temperature</span>
          </label>
          <div className="twoColumnControls">
            <NumberField
              label="Outlier window"
              min={3}
              value={preprocessing.outlier_window}
              onChange={(value) => patchPreprocessing({ outlier_window: Math.max(3, Math.round(value)) })}
            />
            <NumberField
              label="Outlier threshold"
              min={0}
              step={0.1}
              value={preprocessing.outlier_threshold}
              onChange={(value) => patchPreprocessing({ outlier_threshold: Math.max(0, value) })}
            />
            <NumberField
              label="Outlier iterations"
              min={0}
              value={preprocessing.outlier_max_iterations}
              onChange={(value) => patchPreprocessing({ outlier_max_iterations: Math.max(0, Math.round(value)) })}
            />
            <NumberField
              label="Savgol window"
              min={3}
              value={preprocessing.savgol_window_length}
              onChange={(value) => patchPreprocessing({ savgol_window_length: Math.max(3, Math.round(value)) })}
            />
            <NumberField
              label="Savgol polyorder"
              min={1}
              value={preprocessing.savgol_polyorder}
              onChange={(value) => patchPreprocessing({ savgol_polyorder: Math.max(1, Math.round(value)) })}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend>Tangent</legend>
          <div className="twoColumnControls">
            <NullableNumberField
              label="Low start °C"
              step={0.1}
              value={tangent.low_range_celsius[0]}
              onChange={(value) => patchRange("low_range_celsius", 0, value)}
            />
            <NullableNumberField
              label="Low end °C"
              step={0.1}
              value={tangent.low_range_celsius[1]}
              onChange={(value) => patchRange("low_range_celsius", 1, value)}
            />
            <NullableNumberField
              label="High start °C"
              step={0.1}
              value={tangent.high_range_celsius[0]}
              onChange={(value) => patchRange("high_range_celsius", 0, value)}
            />
            <NullableNumberField
              label="High end °C"
              step={0.1}
              value={tangent.high_range_celsius[1]}
              onChange={(value) => patchRange("high_range_celsius", 1, value)}
            />
            <NumberField
              label="Tangent offset"
              value={tangent.tangent_offset}
              onChange={(value) => setTangent((current) => ({ ...current, tangent_offset: Math.round(value) }))}
            />
          </div>
        </fieldset>
      </div>
      <dl className="metricGrid compact analysisParameterMetrics">
        <Metric label="Effective Savgol window" value={formatOptionalInteger(smoothed.effective_savgol_window_length)} />
        <Metric label="Smoothed points" value={formatArrayCount(smoothed.temperature_celsius)} />
        <Metric label="Outlier count" value={formatOptionalInteger(outlierRepair.outlier_count)} />
      </dl>
      {warnings.length ? (
        <ul className="analysisWarningList">
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {error ? <div className="inlineError">{error}</div> : null}
    </div>
  );
}

const ANALYSIS_AFAS_CHART_WIDTH = 860;
const ANALYSIS_AFAS_CHART_HEIGHT = 540;

type AnalysisAfasHoverTarget = {
  source: "raw" | "smoothed" | "outlier" | "marker" | "construction";
  label: string;
  temperature: number;
  distance: number;
  frameIndex: number | null;
  x: number;
  y: number;
};

type IndustrialCurveFrameSource = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  xTicks: AnalysisAfasModel["xTicks"];
  yTicks: AnalysisAfasModel["yTicks"];
  xAxisLabel: string;
  yAxisLabel: string;
};

function IndustrialCurveView({
  ariaLabel,
  children,
  className,
  model,
  onMouseDown,
  onMouseLeave,
  onMouseMove,
  onMouseUp,
  underlay,
  variant
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className: string;
  model: IndustrialCurveFrameSource;
  onMouseDown?: React.MouseEventHandler<SVGSVGElement>;
  onMouseLeave?: React.MouseEventHandler<SVGSVGElement>;
  onMouseMove?: React.MouseEventHandler<SVGSVGElement>;
  onMouseUp?: React.MouseEventHandler<SVGSVGElement>;
  underlay?: React.ReactNode;
  variant: IndustrialCurveViewVariant;
}) {
  const frame = buildIndustrialCurveFrameModel({
    variant,
    width: model.width,
    height: model.height,
    plot: model.plot,
    xTicks: model.xTicks,
    yTicks: model.yTicks,
    xAxisLabel: model.xAxisLabel,
    yAxisLabel: model.yAxisLabel
  });
  return (
    <svg
      className={className}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role="img"
      aria-label={ariaLabel}
      onMouseDown={onMouseDown}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <rect
        className={frame.classNames.frame}
        x={0}
        y={0}
        width={frame.width}
        height={frame.height}
        rx={frame.axisLayout.frameRadius}
      />
      {underlay}
      {frame.xTicks.map((tick, index) => (
        <line
          className={frame.classNames.gridLine}
          key={`${frame.variant}-x-grid-${index}-${tick.value}`}
          x1={tick.position}
          x2={tick.position}
          y1={frame.plot.top}
          y2={frame.plot.bottom}
        />
      ))}
      {frame.yTicks.map((tick, index) => (
        <line
          className={frame.classNames.gridLine}
          key={`${frame.variant}-y-grid-${index}-${tick.value}`}
          x1={frame.plot.left}
          x2={frame.plot.right}
          y1={tick.position}
          y2={tick.position}
        />
      ))}
      <line className={frame.classNames.axis} x1={frame.plot.left} x2={frame.plot.right} y1={frame.plot.bottom} y2={frame.plot.bottom} />
      <line className={frame.classNames.axis} x1={frame.plot.left} x2={frame.plot.left} y1={frame.plot.top} y2={frame.plot.bottom} />
      {frame.xTicks.map((tick, index) => (
        <g key={`${frame.variant}-x-tick-${index}-${tick.value}`}>
          <line
            className={frame.classNames.tick}
            x1={tick.position}
            x2={tick.position}
            y1={frame.plot.bottom}
            y2={frame.plot.bottom + frame.axisLayout.tickLength}
          />
          <text
            className={frame.classNames.tickLabel}
            x={tick.position}
            y={frame.plot.bottom + frame.axisLayout.xTickLabelOffset}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {frame.yTicks.map((tick, index) => (
        <g key={`${frame.variant}-y-tick-${index}-${tick.value}`}>
          <line
            className={frame.classNames.tick}
            x1={frame.plot.left - frame.axisLayout.tickLength}
            x2={frame.plot.left}
            y1={tick.position}
            y2={tick.position}
          />
          <text
            className={frame.classNames.tickLabel}
            x={frame.plot.left - frame.axisLayout.yTickLabelXOffset}
            y={tick.position + frame.axisLayout.yTickLabelYOffset}
            textAnchor="end"
          >
            {tick.label}
          </text>
        </g>
      ))}
      <text
        className={frame.classNames.axisLabel}
        x={(frame.plot.left + frame.plot.right) / 2}
        y={frame.axisLayout.xAxisLabelY}
        textAnchor="middle"
      >
        {frame.xAxisLabel}
      </text>
      <text
        className={frame.classNames.axisLabel}
        x={-(frame.plot.top + frame.plot.bottom) / 2}
        y={frame.axisLayout.yAxisLabelY}
        textAnchor="middle"
        transform="rotate(-90)"
      >
        {frame.yAxisLabel}
      </text>
      {children}
    </svg>
  );
}

function AnalysisAfasChart({ analysis }: { analysis: AnalysisResult }) {
  const [layers, setLayers] = useState<AnalysisAfasLayerState>({ raw: false, fit: true, markers: true });
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [hoverTarget, setHoverTarget] = useState<AnalysisAfasHoverTarget | null>(null);
  const [brush, setBrush] = useState<{ start: number; current: number } | null>(null);
  const brushRef = useRef<{ start: number; current: number } | null>(null);
  const model = useMemo(
    () => buildAnalysisAfasModel(analysis, {
      width: ANALYSIS_AFAS_CHART_WIDTH,
      height: ANALYSIS_AFAS_CHART_HEIGHT,
      xDomain,
      layers
    }),
    [analysis, layers, xDomain]
  );
  const brushRect = brush ? brushToRect(brush, model.plot) : null;

  useEffect(() => {
    setXDomain(null);
    setHoverTarget(null);
    setBrush(null);
    brushRef.current = null;
  }, [analysis]);

  function patchLayer(key: keyof AnalysisAfasLayerState, checked: boolean) {
    setLayers((current) => ({ ...current, [key]: checked }));
  }

  function handleMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    const point = svgEventPoint(event, model);
    if (!pointInPlot(point.x, point.y, model.plot)) return;
    event.preventDefault();
    const nextBrush = { start: point.x, current: point.x };
    brushRef.current = nextBrush;
    setBrush(nextBrush);
    setHoverTarget(null);
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const point = svgEventPoint(event, model);
    const activeBrush = brushRef.current;
    if (activeBrush) {
      const nextBrush = { ...activeBrush, current: clamp(point.x, model.plot.left, model.plot.right) };
      brushRef.current = nextBrush;
      setBrush(nextBrush);
      return;
    }
    const nearest = nearestAnalysisAfasTarget(model, point.x, point.y);
    setHoverTarget(nearest);
  }

  function handleMouseUp() {
    const activeBrush = brushRef.current;
    if (!activeBrush) return;
    const start = clamp(activeBrush.start, model.plot.left, model.plot.right);
    const current = clamp(activeBrush.current, model.plot.left, model.plot.right);
    if (Math.abs(current - start) >= 18) {
      const t1 = inverseScaleValue(start, model.plot.left, model.plot.right, model.xRange.min, model.xRange.max);
      const t2 = inverseScaleValue(current, model.plot.left, model.plot.right, model.xRange.min, model.xRange.max);
      setXDomain([Math.min(t1, t2), Math.max(t1, t2)]);
    }
    brushRef.current = null;
    setBrush(null);
  }

  return (
    <div className="analysisAfasShell">
      <AnalysisAfasSummaryStrip model={model} />
      <div className="analysisAfasToolbar">
        <div className="analysisAfasLayerGroup" aria-label="AFAS chart layers">
          <AnalysisLayerToggle
            checked={layers.raw}
            label="Raw"
            onChange={(checked) => patchLayer("raw", checked)}
          />
          <AnalysisLayerToggle
            checked={layers.fit}
            label="Fit"
            onChange={(checked) => patchLayer("fit", checked)}
          />
          <AnalysisLayerToggle
            checked={layers.markers}
            label="Markers"
            onChange={(checked) => patchLayer("markers", checked)}
          />
        </div>
        <button
          className="secondaryButton analysisAfasResetButton"
          disabled={!xDomain}
          onClick={() => setXDomain(null)}
          type="button"
        >
          <RefreshCcw size={15} aria-hidden="true" />
          Reset zoom
        </button>
      </div>
      <figure className="analysisAfasFigure">
        <figcaption>
          <span>AFAS temperature-distance review</span>
          <span>{xDomain ? `${model.xRange.min.toFixed(2)}-${model.xRange.max.toFixed(2)} °C` : "Full analysis range"}</span>
        </figcaption>
        <IndustrialCurveView
          className="analysisAfasSvg"
          ariaLabel="AFAS temperature-distance review chart"
          model={model}
          onMouseDown={handleMouseDown}
          onMouseLeave={() => {
            setHoverTarget(null);
            brushRef.current = null;
            setBrush(null);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          underlay={model.fitLines
            .filter((line) => line.kind === "low_baseline" || line.kind === "high_baseline")
            .map((line) => {
              const x = Math.min(line.x1, line.x2);
              const width = Math.abs(line.x2 - line.x1);
              return (
                <rect
                  className={`analysisAfasFitBand analysisAfasFitBand--${line.kind}`}
                  height={model.plot.bottom - model.plot.top}
                  key={`band-${line.kind}`}
                  width={width}
                  x={x}
                  y={model.plot.top}
                />
              );
            })}
          variant="analysis_review"
        >
          {model.rawPoints.map((point, index) => (
            <circle
              className="analysisAfasRawPoint"
              cx={point.x}
              cy={point.y}
              key={`raw-${point.frameIndex ?? index}-${point.temperature}`}
              r={2.6}
            />
          ))}
          {model.outlierPoints.map((point, index) => (
            <g className="analysisAfasOutlierPoint" key={`outlier-${point.frameIndex ?? index}-${point.temperature}`}>
              <circle cx={point.x} cy={point.y} r={6} />
              <line x1={point.x - 4.2} x2={point.x + 4.2} y1={point.y - 4.2} y2={point.y + 4.2} />
              <line x1={point.x - 4.2} x2={point.x + 4.2} y1={point.y + 4.2} y2={point.y - 4.2} />
            </g>
          ))}
          {model.fitLines
            .filter((line) => line.kind !== "tangent")
            .map((line) => (
              <g className={`analysisAfasFitLineGroup analysisAfasFitLineGroup--${line.kind}`} key={`fit-${line.kind}`}>
                <line className={`analysisAfasFitLine analysisAfasFitLine--${line.kind}`} x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2} />
                <text className="analysisAfasInlineLabel" x={line.labelX} y={line.labelY - 8} textAnchor="middle">
                  {line.label}
                </text>
              </g>
            ))}
          {model.fitLines
            .filter((line) => line.kind === "tangent")
            .map((line) => (
              <g className="analysisAfasFitLineGroup analysisAfasFitLineGroup--tangent" key="fit-tangent">
                <line className="analysisAfasFitLine analysisAfasFitLine--tangent" x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2} />
                <text className="analysisAfasInlineLabel analysisAfasInlineLabel--tangent" x={line.labelX} y={line.labelY - 10} textAnchor="middle">
                  Tangent
                </text>
              </g>
            ))}
          {model.constructionGuides.map((guide) => (
            <line
              aria-label={`${guide.label}; ${guide.role}`}
              className={`analysisAfasConstructionGuide analysisAfasConstructionGuide--${guide.kind}`}
              key={`guide-${guide.kind}`}
              x1={guide.x1}
              x2={guide.x2}
              y1={guide.y1}
              y2={guide.y2}
            />
          ))}
          {model.smoothedPath ? (
            <polyline className="analysisAfasSmoothedLine" points={model.smoothedPath} />
          ) : null}
          {model.smoothedPoints.length ? (
            <text className="analysisAfasSmoothedLabel" x={smoothedLabelX(model)} y={smoothedLabelY(model)}>
              Smoothed curve
            </text>
          ) : null}
          {model.markers.map((marker) => (
            marker.kind === "max_slope" ? (
              <MaxSlopeMarker key={`marker-${marker.kind}`} marker={marker} plot={model.plot} />
            ) : (
              <AfasReferenceMarker key={`marker-${marker.kind}`} marker={marker} plot={model.plot} />
            )
          ))}
          {brushRect ? (
            <rect
              className="analysisAfasBrush"
              height={model.plot.bottom - model.plot.top}
              width={brushRect.width}
              x={brushRect.x}
              y={model.plot.top}
            />
          ) : null}
          {hoverTarget ? <AnalysisAfasTooltip target={hoverTarget} plot={model.plot} /> : null}
          {!model.hasPoints ? (
            <text className="curveEmptyText" x={(model.plot.left + model.plot.right) / 2} y={(model.plot.top + model.plot.bottom) / 2} textAnchor="middle">
              No AFAS temperature-distance points
            </text>
          ) : null}
        </IndustrialCurveView>
        <div className="analysisAfasLegend" aria-label="AFAS chart legend">
          <span className="analysisAfasLegendItem analysisAfasLegendItem--smooth">Smoothed curve</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--construction">As/Af guides</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--fit">Baseline fit</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--tangent">Tangent</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--raw">Raw diagnostic</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--marker">As / Af / Max slope</span>
        </div>
      </figure>
    </div>
  );
}

function AnalysisAfasSummaryStrip({ model }: { model: AnalysisAfasModel }) {
  return (
    <dl className="analysisAfasSummaryStrip">
      <AnalysisAfasSummaryValue label="AFAS status" value={model.summary.status} />
      <AnalysisAfasSummaryValue label="As" value={model.summary.asLabel} />
      <AnalysisAfasSummaryValue label="Af-tan" value={model.summary.afTanLabel} />
      <AnalysisAfasSummaryValue label="ΔT" value={model.summary.deltaLabel} />
      <AnalysisAfasSummaryValue label="Max slope" value={model.summary.maxSlopeLabel} />
      <AnalysisAfasSummaryValue label="Raw points" value={model.summary.rawCountLabel} />
      <AnalysisAfasSummaryValue label="Smoothed points" value={model.summary.smoothedCountLabel} />
      <AnalysisAfasSummaryValue label="Outliers" value={model.summary.outlierLabel} />
    </dl>
  );
}

function AnalysisAfasSummaryValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AnalysisLayerToggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="analysisAfasLayerToggle">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function AfasReferenceMarker({
  marker,
  plot
}: {
  marker: AnalysisAfasMarker;
  plot: AnalysisAfasModel["plot"];
}) {
  const badgeWidth = marker.kind === "af_tan" ? 104 : 86;
  const x = clamp(marker.x - badgeWidth / 2, plot.left + 4, plot.right - badgeWidth - 4);
  const badgeY = plot.top + (marker.kind === "af_tan" ? 38 : 10);
  return (
    <g className={`analysisAfasReferenceMarker analysisAfasReferenceMarker--${marker.kind}`}>
      <line x1={marker.x} x2={marker.x} y1={plot.top} y2={plot.bottom} />
      <circle cx={marker.x} cy={marker.y} r={4.6} />
      <rect x={x} y={badgeY} width={badgeWidth} height={24} rx={4} />
      <text x={x + badgeWidth / 2} y={badgeY + 16} textAnchor="middle">
        {marker.label} {marker.temperature.toFixed(2)}°C
      </text>
    </g>
  );
}

function MaxSlopeMarker({
  marker,
  plot
}: {
  marker: AnalysisAfasMarker;
  plot: AnalysisAfasModel["plot"];
}) {
  const labelX = marker.x > plot.right - 110 ? marker.x - 13 : marker.x + 13;
  const labelY = marker.y < plot.top + 28 ? marker.y + 30 : marker.y - 14;
  const textAnchor = labelX < marker.x ? "end" : "start";
  return (
    <g className="analysisAfasMaxSlopeMarker">
      <polygon points={`${marker.x},${marker.y - 8} ${marker.x + 8},${marker.y} ${marker.x},${marker.y + 8} ${marker.x - 8},${marker.y}`} />
      <text x={labelX} y={labelY} textAnchor={textAnchor}>
        Max slope
      </text>
    </g>
  );
}

function AnalysisAfasTooltip({
  target,
  plot
}: {
  target: AnalysisAfasHoverTarget;
  plot: AnalysisAfasModel["plot"];
}) {
  const seriesLabel = target.source === "construction" ? "AFAS construction guide" : target.label;
  const lines = [
    `series: ${seriesLabel}`,
    `temperature: ${target.temperature.toFixed(2)} °C`,
    `distance: ${target.distance.toFixed(2)} px`,
    `frame_index: ${target.frameIndex ?? "None"}`
  ];
  const width = 238;
  const height = 76;
  const x = target.x > plot.right - width - 14 ? target.x - width - 12 : target.x + 12;
  const y = target.y > plot.bottom - height - 12 ? target.y - height - 12 : target.y + 12;
  return (
    <g className="analysisAfasTooltip">
      <rect x={x} y={y} width={width} height={height} rx={5} />
      {lines.map((line, index) => (
        <text x={x + 10} y={y + 18 + index * 15} key={line}>
          {line}
        </text>
      ))}
    </g>
  );
}

function svgEventPoint(event: React.MouseEvent<SVGSVGElement>, model: AnalysisAfasModel): { x: number; y: number } {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * model.width,
    y: ((event.clientY - bounds.top) / bounds.height) * model.height
  };
}

function pointInPlot(
  x: number,
  y: number,
  plot: AnalysisAfasModel["plot"]
): boolean {
  return x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom;
}

function nearestAnalysisAfasTarget(
  model: AnalysisAfasModel,
  x: number,
  y: number
): AnalysisAfasHoverTarget | null {
  const candidates: AnalysisAfasHoverTarget[] = [
    ...model.rawPoints.map((point) => afasPointHoverTarget(point, "raw", "Raw point")),
    ...model.smoothedPoints.map((point) => afasPointHoverTarget(point, "smoothed", "Smoothed curve")),
    ...model.outlierPoints.map((point) => afasPointHoverTarget(point, "outlier", "Outlier")),
    ...model.constructionGuides.map((guide) => afasConstructionGuideHoverTarget(guide)),
    ...model.markers.map((marker) => ({
      source: "marker" as const,
      label: marker.label,
      temperature: marker.temperature,
      distance: marker.distance,
      frameIndex: null,
      x: marker.x,
      y: marker.y
    }))
  ];
  if (!candidates.length) return null;
  let nearest = candidates[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - x;
    const dy = candidate.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= 1600 ? nearest : null;
}

function afasPointHoverTarget(
  point: AnalysisAfasDataPoint,
  source: AnalysisAfasHoverTarget["source"],
  label: string
): AnalysisAfasHoverTarget {
  return {
    source,
    label,
    temperature: point.temperature,
    distance: point.distance,
    frameIndex: point.frameIndex,
    x: point.x,
    y: point.y
  };
}

function afasConstructionGuideHoverTarget(guide: AnalysisAfasConstructionGuide): AnalysisAfasHoverTarget {
  return {
    source: "construction",
    label: guide.label,
    temperature: guide.temperature,
    distance: guide.distance,
    frameIndex: null,
    x: guide.labelX,
    y: guide.labelY
  };
}

function brushToRect(
  brush: { start: number; current: number },
  plot: AnalysisAfasModel["plot"]
): { x: number; width: number } {
  const start = clamp(brush.start, plot.left, plot.right);
  const current = clamp(brush.current, plot.left, plot.right);
  return {
    x: Math.min(start, current),
    width: Math.abs(current - start)
  };
}

function inverseScaleValue(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (Math.abs(inMax - inMin) < Number.EPSILON) return (outMin + outMax) / 2;
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

function smoothedLabelX(model: AnalysisAfasModel): number {
  const point = model.smoothedPoints[Math.max(0, Math.floor(model.smoothedPoints.length * 0.7))];
  return point ? Math.min(model.plot.right - 132, Math.max(model.plot.left + 12, point.x + 12)) : model.plot.left + 12;
}

function smoothedLabelY(model: AnalysisAfasModel): number {
  const point = model.smoothedPoints[Math.max(0, Math.floor(model.smoothedPoints.length * 0.7))];
  return point ? Math.max(model.plot.top + 28, point.y - 18) : model.plot.top + 28;
}

function RunTrendChart({
  analysis,
  runId,
  isRunning,
  targetTemperature
}: {
  analysis: AnalysisResult;
  runId: string | null;
  isRunning: boolean;
  targetTemperature: number | null;
}) {
  const width = 900;
  const height = 420;
  const stickyYAxisEnabled = isRunning;
  const [stickyYRange, setStickyYRange] = useState<RunTrendYAxisRange | null>(null);
  const model = useMemo(
    () => buildRunTrendModel(analysis, {
      mode: "full",
      width,
      height,
      yAxis: {
        rangeOverride: stickyYAxisEnabled ? stickyYRange : null
      }
    }),
    [analysis, stickyYAxisEnabled, stickyYRange]
  );
  const [hoverPoint, setHoverPoint] = useState<RunTrendPoint | null>(null);

  useEffect(() => {
    setStickyYRange(null);
  }, [runId]);

  useEffect(() => {
    if (!stickyYAxisEnabled) {
      setStickyYRange((current) => (current === null ? current : null));
      return;
    }
    setStickyYRange((current) => {
      const next = resolveRunTrendStickyYAxisRange(current, model.dataYRange);
      return sameYAxisRange(current, next) ? current : next;
    });
  }, [stickyYAxisEnabled, model.dataYRange.min, model.dataYRange.max]);
  const targetX =
    targetTemperature !== null &&
    Number.isFinite(targetTemperature) &&
    targetTemperature >= model.xRange.min &&
    targetTemperature <= model.xRange.max
      ? scaleValue(targetTemperature, model.xRange.min, model.xRange.max, model.plot.left, model.plot.right)
      : null;
  const activePoint = hoverPoint ?? model.latestPoint;

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!model.formalPoints.length && !model.referencePoints.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * model.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * model.height;
    const candidates = [...model.formalPoints, ...model.referencePoints];
    let nearest = candidates[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of candidates) {
      const dx = point.x - x;
      const dy = point.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    setHoverPoint(nearest);
  }

  return (
    <div className="runTrendShell">
      <RunValueStrip valueStrip={model.valueStrip} />
      <figure className="runTrendFigure">
        <figcaption>
          <span>{model.sourceLabel}</span>
          <span>{isRunning ? "Current run so far" : "Full run"}</span>
        </figcaption>
        <IndustrialCurveView
          className="runTrendSvg"
          ariaLabel="Run temperature-distance trend chart"
          model={model}
          onMouseLeave={() => setHoverPoint(null)}
          onMouseMove={handleMouseMove}
          variant="run_monitor"
        >
          {targetX !== null ? (
            <g className="runTrendTargetMarker">
              <rect x={targetX - 9} y={model.plot.top} width={18} height={model.plot.bottom - model.plot.top} />
              <line x1={targetX} x2={targetX} y1={model.plot.top} y2={model.plot.bottom} />
              <text x={targetX + 12} y={model.plot.top + 18}>
                Target {targetTemperature?.toFixed(2)}°C
              </text>
            </g>
          ) : null}
          {model.referencePoints.map((point) => (
            <circle
              className="runTrendReferencePoint"
              cx={point.x}
              cy={point.y}
              key={`run-reference-${point.frameIndex}-${point.temperature}`}
              r={2.3}
            />
          ))}
          {model.formalSegments.map((segment, index) => (
            segment.length > 1 ? (
              <polyline
                className="runTrendFormalLine"
                key={`run-formal-segment-${index}`}
                points={segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")}
              />
            ) : (
              <circle
                className="runTrendFormalPoint"
                cx={segment[0].x}
                cy={segment[0].y}
                key={`run-formal-segment-${index}`}
                r={3.2}
              />
            )
          ))}
          {model.statusRugs.length ? (
            <g className="runTrendRugTrack">
              <line x1={model.plot.left} x2={model.plot.right} y1={model.plot.bottom + 31} y2={model.plot.bottom + 31} />
              {model.statusRugs.map((rug) => (
                <g className={`runTrendRug runTrendRug--${rug.kind}`} key={`rug-${rug.frameIndex}-${rug.kind}`}>
                  <line x1={rug.x} x2={rug.x} y1={rug.y1} y2={rug.y2} />
                  {rug.kind === "invalid" ? <rect x={rug.x - 3.5} y={rug.y2 - 3.5} width={7} height={7} /> : <circle cx={rug.x} cy={rug.y2} r={3.5} />}
                </g>
              ))}
              <text x={model.plot.left} y={model.plot.bottom + 49}>
                status rug: INVALID / stale / missing frames
              </text>
            </g>
          ) : null}
          {model.latestPoint ? (
            <g className="runTrendLatestPoint">
              <line x1={model.latestPoint.x} x2={model.latestPoint.x} y1={model.plot.top} y2={model.plot.bottom} />
              <circle cx={model.latestPoint.x} cy={model.latestPoint.y} r={11} />
              <circle cx={model.latestPoint.x} cy={model.latestPoint.y} r={6.4} />
              <text
                x={model.latestPoint.x > model.plot.right - 250 ? model.latestPoint.x - 10 : model.latestPoint.x + 10}
                y={model.latestPoint.y < model.plot.top + 26 ? model.latestPoint.y + 30 : model.latestPoint.y - 14}
                textAnchor={model.latestPoint.x > model.plot.right - 250 ? "end" : "start"}
              >
                {formatRunTrendPointLabel(model.latestPoint)}
              </text>
            </g>
          ) : null}
          {model.formalPoints.length ? (
            <text
              className="runTrendInlineLabel"
              x={runTrendLineLabelPoint(model).x}
              y={runTrendLineLabelPoint(model).y}
            >
              {runTrendLineLabel(model.source)}
            </text>
          ) : null}
          {activePoint ? <RunTrendTooltip point={activePoint} plot={model.plot} /> : null}
          {!model.hasPoints ? (
            <text className="curveEmptyText" x={(model.plot.left + model.plot.right) / 2} y={(model.plot.top + model.plot.bottom) / 2} textAnchor="middle">
              No formal temperature-distance points
            </text>
          ) : null}
        </IndustrialCurveView>
      </figure>
    </div>
  );
}

function sameYAxisRange(
  current: RunTrendYAxisRange | null,
  next: RunTrendYAxisRange
): boolean {
  return (
    current !== null &&
    Math.abs(current.min - next.min) < 1e-9 &&
    Math.abs(current.max - next.max) < 1e-9
  );
}

function RunValueStrip({ valueStrip }: { valueStrip: ReturnType<typeof buildRunTrendModel>["valueStrip"] }) {
  return (
    <dl className="runValueStrip">
      <RunValue label="Current distance" value={formatNullableNumber(valueStrip.currentDistance, " px", 1)} />
      <RunValue label="Current temperature" value={formatNullableNumber(valueStrip.currentTemperature, " °C", 2)} />
      <RunValue label="Frame" value={valueStrip.currentFrame?.toLocaleString() ?? "None"} />
      <RunValue label="Sync status" value={shortStatus(valueStrip.syncStatus)} tone={statusTone(valueStrip.syncStatus, "sync")} />
      <RunValue label="Valid / Invalid" value={shortStatus(valueStrip.detectionStatus)} tone={statusTone(valueStrip.detectionStatus, "detection")} />
      <RunValue label="Temp-distance points" value={valueStrip.points.toLocaleString()} />
    </dl>
  );
}

function RunValue({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={tone ? `runValue runValue--${tone}` : "runValue"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RunTrendTooltip({
  point,
  plot
}: {
  point: RunTrendPoint;
  plot: { left: number; right: number; top: number; bottom: number };
}) {
  const lines = [
    `frame_index: ${point.frameIndex ?? "None"}`,
    `temperature: ${point.temperature.toFixed(2)} °C`,
    `distance: ${point.distance.toFixed(2)} px`,
    `sync status: ${point.syncStatus ?? "None"}`,
    `detection status: ${point.detectionStatus ?? "VALID"}`,
    `series: ${point.source}`
  ];
  const width = 258;
  const height = 106;
  const x = point.x > plot.right - width - 14 ? point.x - width - 12 : point.x + 12;
  const y = point.y > plot.bottom - height - 12 ? point.y - height - 12 : point.y + 12;
  return (
    <g className="runTrendTooltip">
      <rect x={x} y={y} width={width} height={height} rx={5} />
      {lines.map((line, index) => (
        <text x={x + 10} y={y + 18 + index * 15} key={line}>
          {line}
        </text>
      ))}
    </g>
  );
}

function scaleValue(value: number, min: number, max: number, outMin: number, outMax: number): number {
  if (Math.abs(max - min) < Number.EPSILON) return (outMin + outMax) / 2;
  return outMin + ((value - min) * (outMax - outMin)) / (max - min);
}

function formatRunTrendPointLabel(point: RunTrendPoint): string {
  const prefix = point.frameIndex === null ? "curve point" : `frame ${point.frameIndex}`;
  return `${prefix} · ${point.temperature.toFixed(2)}°C · ${point.distance.toFixed(1)}px`;
}

function runTrendLineLabel(source: RunTrendPoint["source"]): string {
  if (source === "smoothed") return "backend smoothed curve";
  if (source === "grouped") return "backend binned curve";
  return "raw scatter";
}

function runTrendLineLabelPoint(model: ReturnType<typeof buildRunTrendModel>): { x: number; y: number } {
  const point = model.formalPoints[Math.max(0, Math.floor(model.formalPoints.length * 0.7))];
  if (!point) return { x: model.plot.left + 12, y: model.plot.top + 28 };
  return {
    x: Math.min(model.plot.right - 190, Math.max(model.plot.left + 12, point.x + 14)),
    y: point.y < model.plot.top + 48 ? point.y + 44 : point.y - 24
  };
}

function formatNullableNumber(value: number | null, suffix: string, digits: number): string {
  return value === null || !Number.isFinite(value) ? "None" : `${value.toFixed(digits)}${suffix}`;
}

function shortStatus(status: string | null): string {
  if (!status) return "None";
  return status.replace(/^TEMP_SYNC_/, "").replace(/^INVALID_/, "INVALID ");
}

function statusTone(status: string | null, kind: "sync" | "detection"): "ok" | "warn" | "bad" {
  if (kind === "sync") {
    if (status === "TEMP_SYNC_OK") return "ok";
    if (status === "TEMP_SYNC_INTERPOLATED") return "warn";
    return "bad";
  }
  return status === "VALID" ? "ok" : "bad";
}

function CurveGrid({ analysis, variant }: { analysis: AnalysisResult; variant: "run" | "analysis" }) {
  const specs = variant === "run" ? buildRunCurveSpecs(analysis) : buildAnalysisCurveSpecs(analysis);
  return (
    <div className={`curveGrid ${variant === "run" ? "curveGridTwo" : "curveGridAnalysis"}`}>
      {specs.map((spec) => (
        <CurveView key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

function CurveView({ spec }: { spec: CurveSpec }) {
  const width = 360;
  const height = 220;
  const model = buildCurveViewModel(spec, width, height);
  const titleId = `curve-title-${spec.key}`;
  return (
    <figure className="curveView">
      <figcaption id={titleId}>{spec.title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <rect className="curveFrame" x={0} y={0} width={width} height={height} rx={6} />
        {model.xTicks.map((tick, index) => (
          <line
            className="curveGridLine"
            key={`x-grid-${index}-${tick.value}`}
            x1={tick.position}
            x2={tick.position}
            y1={model.plot.top}
            y2={model.plot.bottom}
          />
        ))}
        {model.yTicks.map((tick, index) => (
          <line
            className="curveGridLine"
            key={`y-grid-${index}-${tick.value}`}
            x1={model.plot.left}
            x2={model.plot.right}
            y1={tick.position}
            y2={tick.position}
          />
        ))}
        <line className="curveAxis" x1={model.plot.left} x2={model.plot.right} y1={model.plot.bottom} y2={model.plot.bottom} />
        <line className="curveAxis" x1={model.plot.left} x2={model.plot.left} y1={model.plot.top} y2={model.plot.bottom} />
        {model.xTicks.map((tick, index) => (
          <g key={`x-tick-${index}-${tick.value}`}>
            <line className="curveTick" x1={tick.position} x2={tick.position} y1={model.plot.bottom} y2={model.plot.bottom + 5} />
            <text className="curveTickLabel" x={tick.position} y={model.plot.bottom + 19} textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}
        {model.yTicks.map((tick, index) => (
          <g key={`y-tick-${index}-${tick.value}`}>
            <line className="curveTick" x1={model.plot.left - 5} x2={model.plot.left} y1={tick.position} y2={tick.position} />
            <text className="curveTickLabel" x={model.plot.left - 9} y={tick.position + 4} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <text className="curveAxisLabel" x={(model.plot.left + model.plot.right) / 2} y={height - 9} textAnchor="middle">
          {model.xAxisLabel}
        </text>
        <text
          className="curveAxisLabel"
          x={-(model.plot.top + model.plot.bottom) / 2}
          y={15}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {model.yAxisLabel}
        </text>
        {model.referencePoints.map((point, index) => (
          <circle
            className="curveReferencePoint"
            cx={point.x}
            cy={point.y}
            key={`reference-${index}`}
            r={2}
          />
        ))}
        {model.overlayLines.map((line) => (
          <line
            className={`curveOverlayLine curveOverlayLine--${line.kind}`}
            key={`overlay-line-${line.kind}`}
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
          />
        ))}
        {model.hasPoints ? (
          <polyline className="curveLine" points={model.polyline} style={{ stroke: spec.color }} />
        ) : (
          <text className="curveEmptyText" x={(model.plot.left + model.plot.right) / 2} y={(model.plot.top + model.plot.bottom) / 2} textAnchor="middle">
            No data
          </text>
        )}
        {model.overlayMarkers.map((marker) => {
          const labelX = marker.x > model.plot.right - 56 ? marker.x - 6 : marker.x + 6;
          const labelY = marker.y < model.plot.top + 12 ? marker.y + 14 : marker.y - 5;
          return (
            <g className={`curveMarker curveMarker--${marker.kind}`} key={`marker-${marker.kind}`}>
              <line x1={marker.x} x2={marker.x} y1={model.plot.top} y2={model.plot.bottom} />
              <circle cx={marker.x} cy={marker.y} r={4} />
              <text x={labelX} y={labelY} textAnchor={labelX < marker.x ? "end" : "start"}>
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>
      {model.referencePoints.length || model.overlayLines.length || model.overlayMarkers.length ? (
        <div className="curveLegend">
          {model.referencePoints.length ? <span className="curveLegendItem curveLegendItem--raw">Raw</span> : null}
          <span className="curveLegendItem curveLegendItem--smooth">Smoothed</span>
          {model.overlayLines.map((line) => (
            <span className={`curveLegendItem curveLegendItem--${line.kind}`} key={`legend-${line.kind}`}>
              {line.label}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function previewValue(preview: CameraPreviewResponse | null, key: "model" | "serial_number" | "ip" | "pixel_format"): string {
  const topLevel = preview?.[key];
  if (topLevel) return topLevel;
  const metaValue = preview?.camera_meta[key];
  return typeof metaValue === "string" && metaValue ? metaValue : "None";
}

function cameraPreviewErrorFromUnknown(err: unknown): CameraPreviewError {
  if (err instanceof ApiError) {
    const detail = apiErrorDetailObject(err.detail);
    return {
      camera_status: detail?.camera_status ?? "unavailable",
      message: detail?.message ?? err.message,
      details: detail?.details ?? {},
      http_status: err.status
    };
  }
  return {
    camera_status: "unavailable",
    message: err instanceof Error ? err.message : String(err),
    details: {},
    http_status: null
  };
}

function temperatureErrorFromUnknown(err: unknown): SetupTemperatureError {
  if (err instanceof ApiError) {
    const detail = apiErrorDetailObject(err.detail);
    return {
      temperature_status: detail?.temperature_status ?? "unavailable",
      message: detail?.message ?? err.message,
      details: detail?.details ?? {},
      http_status: err.status
    };
  }
  return {
    temperature_status: "unavailable",
    message: err instanceof Error ? err.message : String(err),
    details: {},
    http_status: null
  };
}

function apiErrorDetailObject(detail: ApiErrorDetail | string | null): ApiErrorDetail | null {
  return typeof detail === "object" && detail !== null ? detail : null;
}

function createDefaultMeasurement(
  dataset: OfflineDatasetListItem,
  shape: number[]
): MeasurementDefinition {
  return {
    measurement_id: `${dataset.id}-default`,
    source: "offline_dataset",
    object_class: dataset.object_class,
    detector: dataset.default_detector,
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: createDefaultRoiForShape(shape),
    detector_config: DEFAULT_CONFIG
  };
}

function createInitialLiveRun(datasetId: string, startFrame: number, frameCount: number): LiveRunState {
  const totalFrames = Math.max(1, frameCount - startFrame + 1);
  const runId = `pending-${datasetId}-${Date.now()}`;
  return {
    runId,
    datasetId,
    status: "running",
    frameIndex: startFrame,
    frameUrl: frameIndexImageUrl(datasetId, startFrame, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount,
    totalFrames,
    processedFrames: 0,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
}

function updateLiveRunFromFrames(
  current: LiveRunState | null,
  events: LiveOfflineFrameEvent[],
  options: { refreshPreview: boolean }
): LiveRunState | null {
  if (events.length === 0) return current;
  return events.reduce<LiveRunState | null>((next, event, index) => (
    updateLiveRunFromFrame(next, event, {
      refreshPreview: options.refreshPreview && index === events.length - 1
    })
  ), current);
}

function updateLiveRunFromFrame(
  current: LiveRunState | null,
  event: LiveOfflineFrameEvent,
  options: { refreshPreview?: boolean } = {}
): LiveRunState {
  const runId = event.run_id;
  const refreshPreview = options.refreshPreview ?? true;
  const previous = current ?? {
    runId,
    datasetId: event.dataset_id,
    status: "running" as const,
    frameIndex: event.frame_index,
    frameUrl: apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: 0,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
  const analysis = appendLiveAnalysis(
    previous.analysis,
    event.detection_result,
    event.curve_points,
    event.afas_preprocessing,
    event.afas_analysis,
    runId
  );
  return {
    ...previous,
    runId,
    datasetId: event.dataset_id,
    status: "running",
    frameIndex: refreshPreview ? event.frame_index : previous.frameIndex,
    frameUrl: refreshPreview ? apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }) : previous.frameUrl,
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: event.processed_frames,
    detectionResult: refreshPreview ? event.detection_result : previous.detectionResult,
    analysis
  };
}

function emptyAnalysis(runId: string): AnalysisResult {
  return {
    analysis_id: `${runId}-live-preview`,
    run_id: runId,
    all_frames: [],
    distance_time: [],
    temperature_time: [],
    temperature_distance: [],
    afas_preprocessing: {},
    afas_analysis: {},
    export_artifacts: [],
    created_at: new Date().toISOString()
  };
}

function appendLiveAnalysis(
  analysis: AnalysisResult,
  detection: DetectionResult,
  curvePoints: LiveOfflineFrameEvent["curve_points"],
  afasPreprocessing: LiveOfflineFrameEvent["afas_preprocessing"],
  afasAnalysis: LiveOfflineFrameEvent["afas_analysis"],
  runId: string
): AnalysisResult {
  return {
    ...analysis,
    run_id: runId,
    analysis_id: `${runId}-live-preview`,
    all_frames: [...analysis.all_frames, detection],
    distance_time: appendCurvePoint(analysis.distance_time, curvePoints.distance_time),
    temperature_time: appendCurvePoint(analysis.temperature_time, curvePoints.temperature_time),
    temperature_distance: appendCurvePoint(analysis.temperature_distance, curvePoints.temperature_distance),
    afas_preprocessing: mergeLiveAfasPreprocessing(analysis.afas_preprocessing, afasPreprocessing),
    afas_analysis: afasAnalysis
  };
}

function appendCurvePoint(points: CurvePoint[], point: CurvePoint | null): CurvePoint[] {
  return point ? [...points, point] : points;
}

function mergeLiveAfasPreprocessing(
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

function formatDistance(result: DetectionResult | null): string {
  return result?.distance_px == null ? "None" : `${result.distance_px.toFixed(2)} px`;
}

function formatTemperature(result: DetectionResult | null): string {
  return result?.temperature_celsius == null ? "None" : `${result.temperature_celsius.toFixed(2)} °C`;
}

function formatTemperatureValue(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "None" : `${value.toFixed(2)} °C`;
}

function formatTemperatureStatus(status: TemperatureStatusResponse | null): string {
  const value = status?.reading.celsius;
  return value == null || !Number.isFinite(value) ? "" : `${value.toFixed(2)} °C`;
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, value));
}

async function waitForStoppedRun(runId: string): Promise<RunResponse> {
  let lastError: unknown = null;
  await sleep(600);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const availability = await getRunAvailability(runId);
      if (availability.exists) {
        return await getRun(runId);
      }
      lastError = new Error(`Run is not available yet: ${runId}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw lastError instanceof Error ? lastError : new Error(`Run not available after stop: ${runId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readAfasStatus(analysis: AnalysisResult | null): string {
  if (!analysis) return "None";
  const status = analysis.afas_analysis.result_status;
  return typeof status === "string" ? status : "unavailable";
}

function readAfasPreprocessingParameters(analysis: AnalysisResult): AfasPreprocessingParameters {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const parameters = readRecord(preprocessing.parameters);
  return normalizeAfasPreprocessingParameters({
    group_by_temperature: readBoolean(parameters.group_by_temperature, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.group_by_temperature),
    outlier_window: readNumber(parameters.outlier_window, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_window),
    outlier_threshold: readNumber(parameters.outlier_threshold, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_threshold),
    outlier_max_iterations: readNumber(parameters.outlier_max_iterations, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_max_iterations),
    savgol_window_length: readNumber(parameters.savgol_window_length, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.savgol_window_length),
    savgol_polyorder: readNumber(parameters.savgol_polyorder, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.savgol_polyorder)
  });
}

function readAfasAnalysisForm(analysis: AnalysisResult): AfasAnalysisFormState {
  const afas = readRecord(analysis.afas_analysis);
  const parameters = readRecord(afas.parameters);
  return {
    low_range_celsius: readNullableRange(parameters.low_range_celsius),
    high_range_celsius: readNullableRange(parameters.high_range_celsius),
    tangent_offset: readNumber(parameters.tangent_offset, DEFAULT_AFAS_ANALYSIS_FORM.tangent_offset)
  };
}

function normalizeAfasPreprocessingParameters(parameters: AfasPreprocessingParameters): AfasPreprocessingParameters {
  return {
    group_by_temperature: parameters.group_by_temperature,
    outlier_window: Math.max(3, Math.round(parameters.outlier_window)),
    outlier_threshold: Math.max(0, Number(parameters.outlier_threshold)),
    outlier_max_iterations: Math.max(0, Math.round(parameters.outlier_max_iterations)),
    savgol_window_length: Math.max(3, Math.round(parameters.savgol_window_length)),
    savgol_polyorder: Math.max(1, Math.round(parameters.savgol_polyorder))
  };
}

function normalizeAfasAnalysisParameters(parameters: AfasAnalysisFormState): AfasAnalysisParameters {
  return {
    low_range_celsius: completeRange(parameters.low_range_celsius),
    high_range_celsius: completeRange(parameters.high_range_celsius),
    tangent_offset: Math.round(parameters.tangent_offset)
  };
}

function completeRange(range: [number | null, number | null]): [number, number] | null {
  const [start, end] = range;
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return start <= end ? [start, end] : [end, start];
}

function readNullableRange(value: unknown): [number | null, number | null] {
  if (!Array.isArray(value) || value.length !== 2) return [null, null];
  const start = typeof value[0] === "number" && Number.isFinite(value[0]) ? value[0] : null;
  const end = typeof value[1] === "number" && Number.isFinite(value[1]) ? value[1] : null;
  return [start, end];
}

function readAfasWarnings(analysis: AnalysisResult): string[] {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const afas = readRecord(analysis.afas_analysis);
  return [...readStringArray(preprocessing.warnings), ...readStringArray(afas.warnings)];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatOptionalNumber(value: unknown, suffix = ""): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "None";
}

function formatOptionalInteger(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}` : "None";
}

function formatArrayCount(value: unknown): string {
  return Array.isArray(value) ? value.length.toLocaleString() : "0";
}

function formatDeltaT(start: unknown, end: unknown): string {
  if (typeof start !== "number" || typeof end !== "number") return "None";
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "None";
  return `${(end - start).toFixed(2)} °C`;
}

function formatRange(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 2) return "None";
  const [start, end] = value;
  if (typeof start !== "number" || typeof end !== "number") return "None";
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "None";
  return `${start.toFixed(2)}-${end.toFixed(2)} °C`;
}

function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}

createRoot(document.getElementById("root")!).render(<App />);
