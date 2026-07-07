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
  SlidersHorizontal,
  Square,
  Settings,
  SquareDashedMousePointer,
  Thermometer,
  Upload,
  Usb
} from "lucide-react";
import {
  ApiError,
  apiUrlFromPath,
  artifactDownloadUrl,
  createLiveOfflineRun,
  createRunExports,
  downloadRunExportBundle,
  frameIndexImageUrl,
  frameImageUrl,
  getTemperatureStatus,
  getRun,
  getRunAvailability,
  getOfflineDatasetSummary,
  importRunExportFile,
  listTemperatureSerialPorts,
  listOfflineDatasets,
  previewRealCamera,
  probeFrame,
  probeRealCameraSetupFrame,
  readDiagnosticImages,
  realCameraPreviewImageUrl,
  releaseRealCameraPreview,
  recomputeRunAnalysis,
  runFrameImageUrl,
  stopRealCameraRun,
  streamLiveOfflineRun,
  streamRealCameraRun,
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
  type ImportedRunView,
  type LiveOfflineFrameEvent,
  type OfflineDatasetListItem,
  type OfflineDatasetSummary,
  type ProbeResponse,
  type RealCameraSetupProbeResponse,
  type RunResponse,
  type RotatedROI,
  type SerialPortInfo,
  type SourceProvenance,
  type TemperatureStatusResponse
} from "./api/client";
import {
  SourceProvenanceBadge,
  provenanceLabel,
  provenanceNeedsSimulatedWarning
} from "./components/operator/SourceProvenanceBadge";
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
  buildRealCameraRunCameraProfile,
  buildRunSetupSummary,
  buildSetupTemperatureSummary,
  confirmPreviewRoi,
  createDefaultRoiForShape,
  createRealCameraMeasurementFromShape,
  freezePreview,
  frozenFrameSetupChangeMessage,
  normalizeSetupPreviewFps,
  previewRefreshStatusLabel,
  resumeLivePreview,
  runModeForSetupSource,
  runResultMatchesSetupSource,
  selectSetupTemperatureSerialPort,
  shouldPollRealCameraPreview,
  shouldReleaseRealCameraPreview,
  shouldRefreshRealCameraFrameAfterSetupChange,
  shouldRefreshRealCameraFrameAfterRoiCommit,
  setupPreviewFpsLabel,
  setupPreviewPollingIntervalMs,
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
  type TrendEmptyState,
  type RunTrendYAxisRange,
  type CurveSpec
} from "./curves";
import {
  UI_LANGUAGE_OPTIONS,
  UI_LANGUAGE_STORAGE_KEY,
  readInitialUiLanguage,
  uiDatasetLabel,
  uiDetector,
  uiNone,
  uiNumberSuffix,
  uiObjectClass,
  uiStatus,
  uiText,
  uiValue,
  uiWidthMode,
  type UiLanguage
} from "./i18n";
import {
  applyConfirmedSettingsToMeasurement,
  confirmOperatorSettings,
  createOperatorSettingsDraft,
  localizeOperatorStartMessage,
  operatorSettingsSummary,
  patchOperatorSettingsDraft,
  validateOperatorStart,
  type OperatorConfirmedSettings
} from "./operatorSettings";
import {
  defaultPageForUiMode,
  navItemsForUiMode,
  normalizePageForUiMode,
  pageForSetupSourceEffects,
  persistUiMode,
  readInitialUiMode,
  type AppPage,
  type UiMode
} from "./uiMode";
import "./styles.css";

type Page = AppPage;

const UiLanguageContext = React.createContext<UiLanguage>("en");

function useUiLanguage(): UiLanguage {
  return React.useContext(UiLanguageContext);
}

function useUiText(): (text: string) => string {
  const language = useUiLanguage();
  return (text: string) => uiText(language, text);
}

type LiveRunState = {
  runId: string;
  datasetId: string;
  operatorDataSource: OperatorDataSource;
  provenance: SourceProvenance | null;
  status: "running" | "complete" | "stopped";
  frameIndex: number;
  frameUrl: string;
  frameCount: number;
  totalFrames: number;
  processedFrames: number;
  frameShape: number[] | null;
  detectionResult: DetectionResult | null;
  analysis: AnalysisResult;
};

type OperatorDataSource = "offline_dataset" | "real_camera";

const OPERATOR_SOURCE_STORAGE_KEY = "yyt1771-g3-operator-source";

type DetectionResultSource = "stabilized" | "raw";

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
  contour_close_kernel: 21,
  contour_smooth_window: 7,
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
  temporal_stabilization_enabled: false,
  temporal_stabilization_strength: "medium" as const,
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
  detector_execution_mode: "diagnostics" as const,
  show_advanced_diagnostics: false,
  run_detector_mode: "fast" as const,
  run_diagnostics_mode: "suspicious_only" as const,
  run_preview_fps: 5,
  run_result_batch_size: 10,
  run_enhanced_detector_on_suspicious: true,
  run_enhanced_detector_policy: "rerun_worthy_only" as const,
  endpoint_jump_limit_px: 12,
  endpoint_jump_warmup_frames: 3,
  endpoint_jump_confirm_frames: 2,
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

const DETECTOR_PRESETS = [
  {
    id: "fast_afas_run",
    label: "Fast AF/As Run",
    patch: {
      processing_scale_enabled: true,
      processing_scale: 0.5,
      run_detector_mode: "fast" as const,
      run_diagnostics_mode: "off" as const,
      run_enhanced_detector_on_suspicious: false,
      show_advanced_diagnostics: false
    }
  },
  {
    id: "balanced_afas_run",
    label: "Balanced AF/As Run",
    patch: {
      processing_scale_enabled: true,
      processing_scale: 0.5,
      run_detector_mode: "fast" as const,
      run_diagnostics_mode: "off" as const,
      run_enhanced_detector_on_suspicious: true,
      run_enhanced_detector_policy: "rerun_worthy_only" as const,
      show_advanced_diagnostics: false
    }
  },
  {
    id: "diagnostics_tuning",
    label: "Diagnostics / Tuning",
    patch: {
      detector_execution_mode: "diagnostics" as const,
      run_detector_mode: "diagnostics" as const,
      run_diagnostics_mode: "every_frame" as const,
      run_enhanced_detector_on_suspicious: true,
      run_enhanced_detector_policy: "all_suspicious" as const,
      show_advanced_diagnostics: true
    }
  }
] satisfies Array<{ id: string; label: string; patch: Partial<DetectorConfig> }>;

const BASIC_DETECTOR_PARAMETER_KEYS = new Set<keyof DetectorConfig>([
  "contour_close_kernel",
  "contour_smooth_window",
  "temporal_stabilization_enabled",
  "temporal_stabilization_strength"
]);

type DetectorConfig = MeasurementDefinition["detector_config"];
type DetectorParameterGroup =
  | "Spatial contour repair"
  | "Contour smoothing"
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
  { key: "contour_close_kernel", label: "contour_close_kernel", type: "int", min: 1, max: 101, step: 2, group: "Spatial contour repair", title: "Connects broken contour regions within one frame; larger values also increase artifact adhesion risk." },
  { key: "contour_smooth_window", label: "contour_smooth_window", type: "int", min: 1, max: 51, step: 2, group: "Contour smoothing", title: "Smooths single-frame contour points to reduce jagged edges; it does not decide temporal noise." },
  { key: "temporal_stabilization_enabled", label: "temporal_stabilization_enabled", type: "bool", group: "Temporal stability", title: "Uses neighboring-frame mask support to remove contours that appear in too few frames before extracting the displayed contour." },
  { key: "temporal_stabilization_strength", label: "temporal_stabilization_strength", type: "select", group: "Temporal stability", options: [
    { value: "weak", label: "Weak" },
    { value: "medium", label: "Medium" },
    { value: "strong", label: "Strong" }
  ], title: "Controls temporal support radius and overlap threshold." },
  { key: "processing_scale_enabled", label: "Processing scale", type: "bool", group: "Image processing / Scale", title: "Runs detector masking and envelope selection on a downsampled ROI while preserving source-pixel outputs." },
  { key: "processing_scale", label: "Processing scale factor", type: "float", min: 0.25, max: 1, step: 0.05, group: "Image processing / Scale", title: "ROI-local processing scale; A/B and distance are restored to source pixels." },
  { key: "processing_scale_mode", label: "Scale mode", type: "select", group: "Image processing / Scale", options: [
    { value: "area_downsample", label: "Area downsample" },
    { value: "gaussian_pyramid", label: "Gaussian pyramid" }
  ], title: "Downsampling method used before detector preprocessing." },
  { key: "refine_endpoint_on_full_res", label: "Full-res endpoint refine", type: "bool", group: "Image processing / Scale", title: "Refines restored endpoints in a narrow full-resolution band when scale is below 1.0." },
  { key: "full_res_refine_band_px", label: "Full-res refine band", type: "int", min: 1, max: 80, step: 1, group: "Image processing / Scale", advanced: true, title: "Local source-pixel band used for endpoint refinement." },
  { key: "detector_execution_mode", label: "Probe detector mode", type: "select", group: "Run performance", options: [
    { value: "fast", label: "Fast" },
    { value: "enhanced", label: "Enhanced" },
    { value: "diagnostics", label: "Diagnostics" }
  ], title: "Detector path used by Probe and single-frame playback." },
  { key: "show_advanced_diagnostics", label: "Advanced diagnostics", type: "bool", group: "Contour diagnostics", title: "Shows additional process masks beyond Detected mask and Envelope contour." },
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
  { key: "endpoint_jump_warmup_frames", label: "Endpoint jump warm-up", type: "int", min: 0, max: 20, step: 1, group: "Temporal stability", advanced: true, title: "Run frames ignored before endpoint-jump rerun decisions." },
  { key: "endpoint_jump_confirm_frames", label: "Endpoint jump confirm", type: "int", min: 1, max: 20, step: 1, group: "Temporal stability", advanced: true, title: "Consecutive endpoint-jump frames required before enhanced rerun." },
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
  { key: "run_preview_fps", label: "Run display fps", type: "int", min: 1, max: 30, step: 1, group: "Run performance", title: "Limits image/overlay display rate during streaming Run." },
  { key: "run_result_batch_size", label: "Run result batch", type: "int", min: 1, max: 100, step: 1, group: "Run performance", title: "Batches Run curve/state updates by processed frames." },
  { key: "run_enhanced_detector_on_suspicious", label: "Enhanced on suspicious", type: "bool", group: "Run performance", advanced: true, title: "Allows suspicious frames to rerun with diagnostics enabled." },
  { key: "run_enhanced_detector_policy", label: "Enhanced rerun policy", type: "select", group: "Run performance", advanced: true, options: [
    { value: "never", label: "Never" },
    { value: "rerun_worthy_only", label: "Rerun-worthy only" },
    { value: "all_suspicious", label: "All suspicious" }
  ], title: "Controls which suspicious reasons can upgrade Run frames to enhanced." },
  { key: "max_frames_per_run", label: "Max frames per run", type: "int", min: 1, max: 20000, step: 10, group: "Run", advanced: true, title: "Frame limit for live offline runs." },
  { key: "live_offline_fps", label: "Live offline fps", type: "float", min: 0.5, max: 30, step: 0.5, group: "Run", advanced: true, title: "Playback speed for live offline runs." }
];

function readInitialOperatorDataSource(): OperatorDataSource {
  try {
    const stored = window.localStorage.getItem(OPERATOR_SOURCE_STORAGE_KEY);
    return stored === "offline_dataset" || stored === "real_camera" ? stored : "real_camera";
  } catch {
    return "real_camera";
  }
}

function persistOperatorDataSource(source: OperatorDataSource): void {
  try {
    window.localStorage.setItem(OPERATOR_SOURCE_STORAGE_KEY, source);
  } catch {
    return;
  }
}

function App() {
  const initialUiMode = useMemo(() => readInitialUiMode(), []);
  const initialOperatorDataSource = useMemo(() => readInitialOperatorDataSource(), []);
  const [uiMode, setUiMode] = useState<UiMode>(initialUiMode);
  const [page, setPage] = useState<Page>(() => defaultPageForUiMode(initialUiMode));
  const [language, setLanguage] = useState<UiLanguage>(() => readInitialUiLanguage());
  const [setupSource, setSetupSource] = useState<SetupSourceKind>(() =>
    initialUiMode === "operator" ? initialOperatorDataSource : "offline_dataset"
  );
  const [operatorDataSource, setOperatorDataSource] = useState<OperatorDataSource>(initialOperatorDataSource);
  const [datasets, setDatasets] = useState<OfflineDatasetListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<OfflineDatasetSummary | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementDefinition | null>(null);
  const [operatorSettings, setOperatorSettings] = useState<OperatorConfirmedSettings | null>(null);
  const [operatorStartMessage, setOperatorStartMessage] = useState("");
  const [importedRun, setImportedRun] = useState<ImportedRunView | null>(null);
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
  const cameraPreviewPollGenerationRef = useRef(0);
  const measurementRef = useRef<MeasurementDefinition | null>(null);
  const cameraPreviewModeRef = useRef<RealCameraPreviewMode>("live");
  const wasInRealCameraSetupRef = useRef(false);
  const pageForSetupEffects = pageForSetupSourceEffects(page);

  useEffect(() => {
    void refreshDatasets();
  }, []);

  useEffect(() => {
    setPage((current) => normalizePageForUiMode(uiMode, current));
    if (uiMode === "operator") {
      chooseSetupSource(operatorDataSource);
    }
  }, [uiMode, operatorDataSource]);

  useEffect(() => {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    measurementRef.current = measurement;
  }, [measurement]);

  useEffect(() => {
    cameraPreviewModeRef.current = cameraPreviewState?.mode ?? "live";
  }, [cameraPreviewState?.mode]);

  useEffect(() => {
    const inRealCameraSetup = pageForSetupEffects === "setup" && setupSource === "real_camera";
    if (
      wasInRealCameraSetupRef.current &&
      shouldReleaseRealCameraPreview("setup", "real_camera", pageForSetupEffects, setupSource)
    ) {
      void releaseRealCameraSetupPreview();
    }
    wasInRealCameraSetupRef.current = inRealCameraSetup;
  }, [pageForSetupEffects, setupSource]);

  useEffect(() => {
    if (pageForSetupEffects !== "setup" || setupSource !== "real_camera") return;
    if (temperatureStatus || temperatureError || checkingTemperature) return;
    void readCurrentTemperature();
  }, [pageForSetupEffects, setupSource, temperatureStatus, temperatureError, checkingTemperature]);

  useEffect(() => {
    if (!shouldPollRealCameraPreview(pageForSetupEffects, setupSource, cameraPreviewState)) return;
    if (runningCamera || probing) return;
    let cancelled = false;
    let timer: number | null = null;
    const generation = cameraPreviewPollGenerationRef.current + 1;
    cameraPreviewPollGenerationRef.current = generation;
    const pollLiveFrame = async () => {
      await previewRealCameraFrame("live", { clearProbe: false });
      if (cancelled || cameraPreviewPollGenerationRef.current !== generation) return;
      const previewIntervalMs = setupPreviewPollingIntervalMs(
        cameraPreviewState?.cameraStatus,
        measurementRef.current?.detector_config.setup_preview_fps
      );
      timer = window.setTimeout(() => {
        void pollLiveFrame();
      }, previewIntervalMs);
    };
    void pollLiveFrame();
    return () => {
      cancelled = true;
      if (cameraPreviewPollGenerationRef.current === generation) {
        cameraPreviewPollGenerationRef.current += 1;
      }
      if (timer != null) window.clearTimeout(timer);
    };
  }, [
    pageForSetupEffects,
    setupSource,
    cameraPreviewState?.mode,
    cameraPreviewState?.cameraStatus,
    measurement?.detector_config.setup_preview_fps,
    runningCamera,
    probing
  ]);

  useEffect(() => {
    if (!measurement) return;
    setOperatorSettings((current) => current ?? createOperatorSettingsDraft(measurement));
  }, [measurement]);

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

  function changeUiMode(nextMode: UiMode) {
    setUiMode(nextMode);
    persistUiMode(window.localStorage, nextMode);
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

  async function runOperatorRealCameraSetupProbe() {
    const currentMeasurement = measurementRef.current;
    if (!currentMeasurement) return;
    setProbing(true);
    setError("");
    try {
      const response = await probeRealCameraSetupFrame(currentMeasurement);
      applyRealCameraProbeResponse(response, "live");
      setProbe(response);
      setCameraPreviewRefreshStatus("ok");
    } catch (err) {
      const detail = err instanceof ApiError ? apiErrorDetailObject(err.detail) : null;
      setError(
        err instanceof ApiError && (err.status === 409 || detail?.camera_status === "busy")
          ? uiText(language, "Camera is busy. Stop the live test before probing current frame.")
          : err instanceof Error
            ? err.message
            : String(err)
      );
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }

  async function runOperatorProbeCurrentFrame() {
    if (operatorDataSource === "offline_dataset") {
      await runProbe(frameIndex);
      return;
    }
    await runOperatorRealCameraSetupProbe();
  }

  async function startLiveOfflineRun(measurementOverride?: MeasurementDefinition) {
    const measurementForRun = measurementOverride ?? measurement;
    if (!measurementForRun || !selectedId) return;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunning(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    liveRunIdRef.current = null;
    liveRunProcessedFramesRef.current = 0;
    setLiveRun(createInitialLiveRun(selectedId, frameIndex, selectedDataset?.frame_count ?? frameIndex));
    const runPreviewFps = Math.round(clamp(Number(measurementForRun.detector_config.run_preview_fps ?? 5), 1, 30));
    const runResultBatchSize = Math.round(clamp(Number(measurementForRun.detector_config.run_result_batch_size ?? 10), 1, 100));
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
      const response = await streamLiveOfflineRun(selectedId, measurementForRun, {
        startFrame: frameIndex,
        targetFps: measurementForRun.detector_config.live_offline_fps ?? 8,
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
                  operatorDataSource: event.run_manifest.operator_data_source === "real_camera" ? "real_camera" : "offline_dataset",
                  provenance: event.run_manifest.provenance ?? event.analysis_result.provenance ?? current.provenance,
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
            if (measurementForRun && selectedId && liveRunProcessedFramesRef.current > 0) {
              try {
                const partialResult = await createLiveOfflineRun(selectedId, measurementForRun, {
                  startFrame: frameIndex,
                  maxFrames: liveRunProcessedFramesRef.current,
                  targetFps: measurementForRun.detector_config.live_offline_fps ?? 8
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
              operatorDataSource: partialResult.run_manifest.operator_data_source === "real_camera" ? "real_camera" : "offline_dataset",
              provenance: partialResult.run_manifest.provenance ?? partialResult.analysis_result.provenance ?? current.provenance,
              analysis: partialResult.analysis_result,
              processedFrames: partialResult.run_manifest.frame_records.length,
              totalFrames: partialResult.run_manifest.config_snapshot.max_frames as number
            }
          : current
      );
    }
  }

  function stopLiveOfflineRun() {
    if (runningCamera) {
      const runId = liveRunIdRef.current;
      if (runId) {
        void stopRealCameraRun(runId).catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
          runAbortRef.current?.abort();
        });
        return;
      }
    }
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
      window.setTimeout(() => {
        if (measurementRef.current?.source === "real_camera") {
          void previewRealCameraFrame("live", { clearProbe: false });
        }
      }, 0);
    }
  }

  function chooseOperatorDataSource(source: OperatorDataSource) {
    setOperatorDataSource(source);
    persistOperatorDataSource(source);
    setOperatorStartMessage("");
  }

  function patchOperatorSettings(patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>) {
    setOperatorSettings((current) => {
      const draft = current ?? (measurement ? createOperatorSettingsDraft(measurement) : null);
      return draft ? patchOperatorSettingsDraft(draft, patch) : draft;
    });
    setOperatorStartMessage("");
  }

  function confirmCurrentOperatorSettings() {
    setOperatorSettings((current) => {
      const draft = current ?? (measurement ? createOperatorSettingsDraft(measurement) : null);
      return draft ? confirmOperatorSettings(draft) : draft;
    });
    setOperatorStartMessage("");
  }

  function startOperatorRun() {
    if (operatorDataSource === "offline_dataset") {
      startOperatorOfflineRun();
      return;
    }
    startOperatorRealCameraRun();
  }

  function startOperatorOfflineRun() {
    const settings = operatorSettings ?? (measurement ? createOperatorSettingsDraft(measurement) : null);
    const validation = validateOperatorStart({
      cameraOk: true,
      measurement,
      settings: settings ?? {
        targetTemperatureC: null,
        temperaturePowerPercent: 100,
        serialPort: null,
        confirmedAt: null,
        dirty: true
      },
      serialPortRequired: false
    });
    if (!validation.ok) {
      setOperatorStartMessage(localizeOperatorStartMessage(validation.message, language));
      return;
    }
    if (!measurement || !settings) return;
    const confirmedMeasurement = {
      ...applyConfirmedSettingsToMeasurement(measurement, settings),
      source: "offline_dataset" as const
    };
    applyMeasurement(confirmedMeasurement);
    setOperatorStartMessage("");
    void startLiveOfflineRun(confirmedMeasurement);
  }

  function startOperatorRealCameraRun() {
    const settings = operatorSettings ?? (measurement ? createOperatorSettingsDraft(measurement) : null);
    const validation = validateOperatorStart({
      cameraOk: (cameraPreview?.camera_status ?? cameraPreviewState?.cameraStatus ?? "") === "ok",
      measurement,
      settings: settings ?? {
        targetTemperatureC: null,
        temperaturePowerPercent: 100,
        serialPort: null,
        confirmedAt: null,
        dirty: true
      },
      serialPortRequired: false
    });
    if (!validation.ok) {
      setOperatorStartMessage(localizeOperatorStartMessage(validation.message, language));
      return;
    }
    if (!measurement || !settings) return;
    const confirmedMeasurement = {
      ...applyConfirmedSettingsToMeasurement(measurement, settings),
      source: "real_camera" as const
    };
    applyMeasurement(confirmedMeasurement);
    setOperatorStartMessage("");
    void startRealCameraRunWithMeasurement(confirmedMeasurement);
  }

  async function importOperatorRunExport(file: File) {
    return importRunExportFile(file).then((view) => {
      setImportedRun(view);
      return view;
    });
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
  ): Promise<boolean> {
    const clearProbe = options.clearProbe ?? true;
    if (cameraPreviewRequestInFlightRef.current) return false;
    cameraPreviewRequestInFlightRef.current = true;
    setPreviewingCamera(true);
    setCameraPreviewRefreshStatus("refreshing");
    setCameraPreviewError(null);
    try {
      const response = await previewRealCamera();
      if (mode === "live" && cameraPreviewModeRef.current === "frozen") {
        return false;
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
      return true;
    } catch (err) {
      if (mode === "live" && cameraPreviewModeRef.current === "frozen") {
        return false;
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
      return false;
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
      setTemperatureStatus(
        await getTemperatureStatus({
          port: measurementRef.current?.detector_config.temperature_serial_port
        })
      );
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
    await startRealCameraRunWithMeasurement(measurement);
  }

  async function startRealCameraRunWithMeasurement(measurementForRun: MeasurementDefinition) {
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunningCamera(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    liveRunIdRef.current = null;
    liveRunProcessedFramesRef.current = 0;
    setLiveRun(createInitialRealCameraLiveRun());
    const runPreviewFps = Math.round(clamp(Number(measurementForRun.detector_config.run_preview_fps ?? 5), 1, 30));
    const runResultBatchSize = Math.round(clamp(Number(measurementForRun.detector_config.run_result_batch_size ?? 10), 1, 100));
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
      await releaseRealCameraSetupPreview({ surfaceError: true });
      const response = await streamRealCameraRun(measurementForRun, {
        targetFps: measurementForRun.detector_config.live_offline_fps ?? 8,
        cameraProfile: buildRealCameraRunCameraProfile(measurementForRun),
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
                  operatorDataSource: event.run_manifest.operator_data_source === "offline_dataset" ? "offline_dataset" : "real_camera",
                  provenance: event.run_manifest.provenance ?? event.analysis_result.provenance ?? current.provenance,
                  analysis: event.analysis_result,
                  processedFrames: event.run_manifest.frame_records.length,
                  totalFrames: event.run_manifest.frame_records.length,
                  frameShape:
                    event.run_manifest.frame_records[event.run_manifest.frame_records.length - 1]?.shape ??
                    current.frameShape
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
            applyStoppedRealCameraRunResult(partialResult);
          } catch (fetchErr) {
            setError(fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
          }
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearBatchFlushTimer();
      if (runAbortRef.current === controller) {
        runAbortRef.current = null;
      }
      setRunningCamera(false);
    }

    function applyStoppedRealCameraRunResult(partialResult: RunResponse) {
      setRunResult(partialResult);
      setLiveRun((current) =>
        current
          ? {
              ...current,
              status: "stopped",
              runId: partialResult.run_manifest.run_id,
              operatorDataSource: partialResult.run_manifest.operator_data_source === "offline_dataset" ? "offline_dataset" : "real_camera",
              provenance: partialResult.run_manifest.provenance ?? partialResult.analysis_result.provenance ?? current.provenance,
              analysis: partialResult.analysis_result,
              processedFrames: partialResult.run_manifest.frame_records.length,
              totalFrames: partialResult.run_manifest.frame_records.length,
              frameShape:
                partialResult.run_manifest.frame_records[partialResult.run_manifest.frame_records.length - 1]?.shape ??
                current.frameShape
            }
          : current
      );
    }
  }

  async function releaseRealCameraSetupPreview(options: { surfaceError?: boolean } = {}) {
    try {
      await releaseRealCameraPreview();
    } catch (err) {
      if (options.surfaceError) {
        throw err;
      }
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

  const t = (text: string) => uiText(language, text);

  return (
    <UiLanguageContext.Provider value={language}>
    <main className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <Database size={22} aria-hidden="true" />
          <div>
            <h1>YY/T 1771 G3</h1>
            <span>{t("AF envelope workstation")}</span>
          </div>
        </div>
        <nav className="tabs" aria-label={t("Primary")}>
          {navItemsForUiMode(uiMode).map((item) => (
            <TabButton page={item.page} current={page} onSelect={setPage} icon={pageIcon(item.page)} key={item.page}>
              {t(item.label)}
            </TabButton>
          ))}
        </nav>
        <UiModeSwitch mode={uiMode} onMode={changeUiMode} />
        <label className="languageControl">
          <span>{t("Language")}</span>
          <select onChange={(event) => setLanguage(event.target.value as UiLanguage)} value={language}>
            {UI_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {language === "zh" ? (option.value === "zh" ? "中文" : "英文") : option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="iconButton" onClick={refreshDatasets} type="button" title={t("Refresh")}>
          <RefreshCcw size={17} aria-hidden="true" />
        </button>
      </header>

      <section className={uiMode === "operator" ? "workspace operatorWorkspace" : "workspace"}>
        {uiMode === "engineering" ? (
        <aside className="datasetRail" aria-label={t("Offline datasets")}>
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
              <span className="datasetId">{uiDatasetLabel(language, dataset)}</span>
              <span className="datasetMeta">
                {uiObjectClass(language, dataset.object_class)} · {dataset.frame_count.toLocaleString()} {t("frames")}
              </span>
              <span className="datasetMeta">
                {uiDetector(language, dataset.default_detector)} · {uiWidthMode(language, dataset.default_width_mode)}
              </span>
            </button>
          ))}
        </aside>
        ) : null}

        <section className="panelArea">
          {error ? <div className="statusBlock error">{error}</div> : null}
          {loading && !summary ? <div className="statusBlock">{t("Loading")}</div> : null}
          {!loading && !selectedDataset ? <div className="statusBlock">{t("No datasets")}</div> : null}
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
              datasets={datasets}
              selectedId={selectedId}
              operatorDataSource={operatorDataSource}
              onSelectedDataset={setSelectedId}
              onOperatorDataSource={chooseOperatorDataSource}
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
              uiMode={uiMode}
              operatorSettings={operatorSettings}
              operatorStartMessage={operatorStartMessage}
              importedRun={importedRun}
              onOperatorSettingsPatch={patchOperatorSettings}
              onOperatorSettingsConfirm={confirmCurrentOperatorSettings}
              onOperatorStartRun={startOperatorRun}
              onImportRunExport={importOperatorRunExport}
              onImportedRun={setImportedRun}
              onProbe={runProbe}
              onProbeRealCameraSetup={runRealCameraSetupProbe}
              onOperatorProbeCurrentFrame={runOperatorProbeCurrentFrame}
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
    </UiLanguageContext.Provider>
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

function UiModeSwitch({
  mode,
  onMode
}: {
  mode: UiMode;
  onMode: (mode: UiMode) => void;
}) {
  const t = useUiText();
  return (
    <div className="uiModeSwitch segmented" aria-label={t("UI mode")}>
      <button className={mode === "operator" ? "active" : ""} onClick={() => onMode("operator")} type="button">
        <Activity size={15} aria-hidden="true" />
        {t("Operator")}
      </button>
      <button className={mode === "engineering" ? "active" : ""} onClick={() => onMode("engineering")} type="button">
        <SlidersHorizontal size={15} aria-hidden="true" />
        {t("Engineering")}
      </button>
    </div>
  );
}

function pageIcon(page: Page): React.ReactNode {
  if (page === "setup" || page === "operatorRun") return <Settings size={16} />;
  if (page === "run") return <Activity size={16} />;
  if (page === "playback") return <Play size={16} />;
  if (page === "operatorImport") return <Upload size={16} />;
  return <BarChart3 size={16} />;
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
  datasets,
  selectedId,
  operatorDataSource,
  onSelectedDataset,
  onOperatorDataSource,
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
  uiMode,
  operatorSettings,
  operatorStartMessage,
  importedRun,
  onOperatorSettingsPatch,
  onOperatorSettingsConfirm,
  onOperatorStartRun,
  onImportRunExport,
  onImportedRun,
  onProbe,
  onProbeRealCameraSetup,
  onOperatorProbeCurrentFrame,
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
  datasets: OfflineDatasetListItem[];
  selectedId: string;
  operatorDataSource: OperatorDataSource;
  onSelectedDataset: (datasetId: string) => void;
  onOperatorDataSource: (source: OperatorDataSource) => void;
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
  uiMode: UiMode;
  operatorSettings: OperatorConfirmedSettings | null;
  operatorStartMessage: string;
  importedRun: ImportedRunView | null;
  onOperatorSettingsPatch: (patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>) => void;
  onOperatorSettingsConfirm: () => void;
  onOperatorStartRun: () => void;
  onImportRunExport: (file: File) => Promise<ImportedRunView>;
  onImportedRun: (view: ImportedRunView | null) => void;
  onProbe: (frameIndex?: number) => void;
  onProbeRealCameraSetup: () => void;
  onOperatorProbeCurrentFrame: () => void;
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
  const language = useUiLanguage();
  const t = useUiText();
  const setupChangeRefreshTimerRef = useRef<number | null>(null);
  const setupPageForEffects = pageForSetupSourceEffects(page);

  useEffect(() => {
    return () => {
      if (setupChangeRefreshTimerRef.current !== null) {
        window.clearTimeout(setupChangeRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (setupPageForEffects === "setup" && setupSource === "real_camera" && cameraPreviewState?.mode === "live") return;
    if (setupChangeRefreshTimerRef.current !== null) {
      window.clearTimeout(setupChangeRefreshTimerRef.current);
      setupChangeRefreshTimerRef.current = null;
    }
  }, [setupPageForEffects, setupSource, cameraPreviewState?.mode]);

  if (page === "operatorImport") {
    return (
      <OperatorImportPage
        importedRun={importedRun}
        onImportRunExport={onImportRunExport}
        onImportedRun={onImportedRun}
      />
    );
  }

  if (page === "operatorResults") {
    return (
      <OperatorResultsPage
        importedRun={importedRun}
        liveRun={liveRun}
        runResult={runResult}
      />
    );
  }

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
  const isOperatorRun = page === "operatorRun";
  const isRealCameraSetup =
    (isSetup && setupSource === "real_camera") ||
    (isOperatorRun && operatorDataSource === "real_camera");
  const displayedProbe = isRealCameraSetup
    ? probe?.dataset_id === "real_camera"
      ? probe
      : null
    : probe?.dataset_id === "real_camera"
      ? null
      : probe;
  const activeFrameTitle = isRealCameraSetup
    ? `${t("Real camera")} · ${cameraPreviewState?.mode === "frozen" ? t("Frozen frame") : t("Live camera frame")}`
    : `${uiDatasetLabel(language, dataset)} · ${t("frame")} ${frameIndex}`;
  const activeFrameUrl = isRealCameraSetup ? cameraPreviewUrl : displayedProbe?.image_data_url ?? frameUrl;
  const activeSourceShape = isRealCameraSetup
    ? cameraPreview?.shape ?? cameraPreviewState?.shape ?? summary.first_frame.shape
    : displayedProbe?.frame.shape ?? summary.first_frame.shape;
  const shouldRefreshAfterRoiCommit = shouldRefreshRealCameraFrameAfterRoiCommit(setupPageForEffects, setupSource, cameraPreviewState);
  const frozenSetupMessage = frozenFrameSetupChangeMessage(setupPageForEffects, setupSource, cameraPreviewState, language);

  function scheduleRealCameraSetupRefresh(change: RealCameraSetupChange) {
    if (!shouldRefreshRealCameraFrameAfterSetupChange(setupPageForEffects, setupSource, cameraPreviewState, change)) return;
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

  if (isOperatorRun) {
    return (
      <OperatorRunPage
        measurement={measurement}
        onMeasurement={onMeasurement}
        onResetRoi={resetRoi}
        onPreviewAffectingChange={(change) => scheduleRealCameraSetupRefresh(change)}
        cameraPreview={cameraPreview}
        cameraPreviewUrl={cameraPreviewUrl}
        cameraPreviewError={cameraPreviewError}
        cameraPreviewRefreshStatus={cameraPreviewRefreshStatus}
        cameraPreviewState={cameraPreviewState}
        activeSourceShape={activeSourceShape}
        activeFrameTitle={activeFrameTitle}
        activeFrameUrl={activeFrameUrl}
        datasets={datasets}
        selectedDataset={dataset}
        selectedDatasetId={selectedId}
        operatorDataSource={operatorDataSource}
        onSelectedDataset={onSelectedDataset}
        onOperatorDataSource={onOperatorDataSource}
        probe={displayedProbe}
        probing={probing}
        operatorSettings={operatorSettings ?? createOperatorSettingsDraft(measurement)}
        operatorStartMessage={operatorStartMessage}
        temperatureStatus={temperatureStatus}
        temperatureError={temperatureError}
        serialPorts={serialPorts}
        checkingTemperature={checkingTemperature}
        loadingSerialPorts={loadingSerialPorts}
        runningCamera={runningCamera}
        runningOffline={running}
        liveRun={liveRun}
        runResult={runResult}
        onOperatorSettingsPatch={onOperatorSettingsPatch}
        onOperatorSettingsConfirm={onOperatorSettingsConfirm}
        onOperatorStartRun={onOperatorStartRun}
        onProbeRealCameraSetup={onOperatorProbeCurrentFrame}
        onStopRun={onStopRun}
        onReadCurrentTemperature={onReadCurrentTemperature}
        onRefreshSerialPorts={onRefreshSerialPorts}
        onRoiChange={updateRoi}
        onRoiCommit={commitRoi}
      />
    );
  }

  return (
    <div className="pageGrid workGrid">
      <section className="toolPanel">
        <h2>{page === "setup" ? t("Setup") : t("Playback")}</h2>
        {isSetup ? <SetupSourceControls source={setupSource} onSource={onSetupSource} /> : null}
        {isRealCameraSetup ? (
          <CameraSetupStatusPanel
            preview={cameraPreview}
            previewError={cameraPreviewError}
            previewState={cameraPreviewState}
            refreshStatus={cameraPreviewRefreshStatus}
            previewFps={measurement.detector_config.setup_preview_fps}
            previewing={previewingCamera}
            probing={probing}
            onPreviewFpsChange={(fps) =>
              onMeasurement({
                ...measurement,
                detector_config: {
                  ...measurement.detector_config,
                  setup_preview_fps: normalizeSetupPreviewFps(fps)
                }
              })
            }
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
          <SetupProbeStatus sourceLabel={language === "zh" ? "真实相机配置检测" : "Real camera setup probe"} probe={displayedProbe} />
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
        <DetectionDiagnosticImages
          debugArtifacts={displayedProbe?.detection_result.debug_artifacts ?? null}
          roi={measurement?.roi ?? null}
        />
      </div>
    </div>
  );
}

function OperatorRunPage({
  measurement,
  onMeasurement,
  onResetRoi,
  onPreviewAffectingChange,
  cameraPreview,
  cameraPreviewUrl,
  cameraPreviewError,
  cameraPreviewRefreshStatus,
  cameraPreviewState,
  activeSourceShape,
  activeFrameTitle,
  activeFrameUrl,
  datasets,
  selectedDataset,
  selectedDatasetId,
  operatorDataSource,
  onSelectedDataset,
  onOperatorDataSource,
  probe,
  probing,
  operatorSettings,
  operatorStartMessage,
  temperatureStatus,
  temperatureError,
  serialPorts,
  checkingTemperature,
  loadingSerialPorts,
  runningCamera,
  runningOffline,
  liveRun,
  runResult,
  onOperatorSettingsPatch,
  onOperatorSettingsConfirm,
  onOperatorStartRun,
  onProbeRealCameraSetup,
  onStopRun,
  onReadCurrentTemperature,
  onRefreshSerialPorts,
  onRoiChange,
  onRoiCommit
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onResetRoi: () => void;
  onPreviewAffectingChange: (change: RealCameraSetupChange) => void;
  cameraPreview: CameraPreviewResponse | null;
  cameraPreviewUrl: string;
  cameraPreviewError: CameraPreviewError | null;
  cameraPreviewRefreshStatus: PreviewRefreshStatus;
  cameraPreviewState: RealCameraPreviewState | null;
  activeSourceShape: number[];
  activeFrameTitle: string;
  activeFrameUrl: string;
  datasets: OfflineDatasetListItem[];
  selectedDataset: OfflineDatasetListItem;
  selectedDatasetId: string;
  operatorDataSource: OperatorDataSource;
  onSelectedDataset: (datasetId: string) => void;
  onOperatorDataSource: (source: OperatorDataSource) => void;
  probe: ProbeResponse | null;
  probing: boolean;
  operatorSettings: OperatorConfirmedSettings;
  operatorStartMessage: string;
  temperatureStatus: TemperatureStatusResponse | null;
  temperatureError: SetupTemperatureError | null;
  serialPorts: SerialPortInfo[];
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  runningCamera: boolean;
  runningOffline: boolean;
  liveRun: LiveRunState | null;
  runResult: RunResponse | null;
  onOperatorSettingsPatch: (patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>) => void;
  onOperatorSettingsConfirm: () => void;
  onOperatorStartRun: () => void;
  onProbeRealCameraSetup: () => void;
  onStopRun: () => void;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
  onRoiChange: (roi: RotatedROI) => void;
  onRoiCommit: (roi: RotatedROI) => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const latestAnalysis = liveRun?.analysis ?? runResult?.analysis_result ?? null;
  const operatorRunActive = runningCamera || runningOffline;
  const isOfflineSource = operatorDataSource === "offline_dataset";
  const sourceProvenance = currentSourceProvenance({
    operatorDataSource,
    selectedDataset,
    cameraPreview,
    probe,
    liveRun,
    runResult
  });
  const setupProbeDetection = !operatorRunActive && probe ? probe.detection_result : null;
  const latestRunResultDetection = runResult?.run_manifest.detection_results.length
    ? runResult.run_manifest.detection_results[runResult.run_manifest.detection_results.length - 1]
    : null;
  const latestDetection =
    liveRun?.detectionResult ??
    setupProbeDetection ??
    latestRunResultDetection;
  const setupProbeFrameUrl = setupProbeDetection ? probe?.image_data_url ?? (isOfflineSource ? activeFrameUrl : cameraPreviewUrl) : "";
  const latestRunResultFrameUrl = runResult?.run_manifest.run_id && latestRunResultDetection
    ? runFrameImageUrl(runResult.run_manifest.run_id, latestRunResultDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
    : "";
  const latestFrameUrl =
    liveRun?.frameUrl ??
    (setupProbeFrameUrl || latestRunResultFrameUrl || activeFrameUrl);
  const latestFrameShape =
    liveRun?.frameShape ??
    (setupProbeDetection ? probe?.frame.shape ?? cameraPreview?.shape ?? activeSourceShape : null) ??
    runResult?.run_manifest.frame_records[runResult.run_manifest.frame_records.length - 1]?.shape ??
    activeSourceShape;
  const latestFrameTitle = liveRun?.detectionResult
    ? `${provenanceLabel(sourceProvenance, language)} · ${t("frame")} ${liveRun.detectionResult.frame_index}`
    : setupProbeDetection
      ? `${t("Current frame probe")} · ${t("frame")} ${setupProbeDetection.frame_index}`
    : latestDetection
        ? `${provenanceLabel(sourceProvenance, language)} · ${t("frame")} ${latestDetection.frame_index}`
        : activeFrameTitle;
  const serialPortOptions = uniqueStrings([
    operatorSettings.serialPort ?? "",
    measurement.detector_config.temperature_serial_port ?? "",
    ...serialPorts.map((port) => port.device || port.name)
  ]);
  const currentTemperature = temperatureStatus?.reading.celsius ?? latestDetection?.temperature_celsius ?? null;
  const cameraOk = (cameraPreview?.camera_status ?? cameraPreviewState?.cameraStatus ?? "") === "ok";
  const hasMeasurementRoi = measurement.roi.width > 0 && measurement.roi.height > 0;
  const probeCurrentFrameDisabled = probing || operatorRunActive || (!isOfflineSource && !cameraOk) || !hasMeasurementRoi;
  const setupProbeSummary = setupProbeDetection ? operatorProbeSummary(setupProbeDetection, language) : "";
  const startButtonLabel = operatorStartButtonLabel(operatorDataSource, sourceProvenance);

  function changeObjectClass(value: string) {
    const option = OBJECT_CLASS_OPTIONS.find((item) => item.value === value);
    onMeasurement({
      ...measurement,
      object_class: value,
      detector: option?.detector ?? measurement.detector,
      width_mode: option?.widthMode ?? "max_width"
    });
    onPreviewAffectingChange({ kind: "object_class" });
  }

  return (
    <div className="operatorRunGrid">
      <section className="toolPanel operatorControlPanel">
        <h2>{t("Live Test")}</h2>
        <OperatorSourceControls
          datasets={datasets}
          selectedDataset={selectedDataset}
          selectedDatasetId={selectedDatasetId}
          source={operatorDataSource}
          disabled={operatorRunActive}
          onDataset={onSelectedDataset}
          onSource={onOperatorDataSource}
        />
        <div className="controlStack">
          <h3>{t("Test object")}</h3>
          <label className="field">
            <span>{t("Object class")}</span>
            <select disabled={operatorRunActive} onChange={(event) => changeObjectClass(event.target.value)} value={measurement.object_class}>
              {OBJECT_CLASS_OPTIONS.filter((option) => option.value !== "D_RESERVED_OBJECT").map((option) => (
                <option key={option.value} value={option.value}>
                  {uiObjectClass(language, option.value)}
                </option>
              ))}
            </select>
          </label>
          <details className="advancedDetectorParameters">
            <summary>{t("Advanced detection parameters")} · {t("Usually no change needed")}</summary>
            <DetectorSetupControls
              measurement={measurement}
              onMeasurement={onMeasurement}
              onPreviewAffectingChange={onPreviewAffectingChange}
            />
          </details>
        </div>
        <div className="controlStack operatorCameraStatus">
          <h3>{isOfflineSource ? t("Offline material") : t("Camera")}</h3>
          {isOfflineSource ? (
            <dl className="metricGrid compact">
              <Metric label="Source" value={uiDatasetLabel(language, selectedDataset)} />
              <Metric label="Current frame" value={probe?.frame.frame_index ?? t("Not probed")} />
            </dl>
          ) : (
            <dl className="metricGrid compact">
              <Metric label="Camera status" value={cameraOk ? "ok" : "Camera unavailable"} />
              <Metric label="Live display" value={cameraPreviewState?.mode === "frozen" ? "Paused" : "Live"} />
            </dl>
          )}
          {!isOfflineSource && cameraPreviewError && !cameraOk ? <div className="inlineError">{cameraPreviewError.message}</div> : null}
          <button
            className="primaryButton"
            disabled={probeCurrentFrameDisabled}
            onClick={onProbeRealCameraSetup}
            type="button"
          >
            <SquareDashedMousePointer size={16} aria-hidden="true" />
            {probing ? t("Probing") : t("Probe current frame")}
          </button>
          {operatorRunActive ? <div className="inlineWarning">{t("Single-frame probing is disabled during a live test")}</div> : null}
          {setupProbeSummary ? (
            <div className={setupProbeDetection?.detection_status === "VALID" ? "inlineSuccess" : "inlineWarning"}>
              {setupProbeSummary}
            </div>
          ) : null}
        </div>
        <OperatorTemperaturePanel
          currentTemperature={currentTemperature}
          operatorSettings={operatorSettings}
          serialPortOptions={serialPortOptions}
          temperatureStatus={temperatureStatus}
          temperatureError={temperatureError}
          checkingTemperature={checkingTemperature}
          loadingSerialPorts={loadingSerialPorts}
          simulatedMode={isOfflineSource}
          onPatch={onOperatorSettingsPatch}
          onConfirm={onOperatorSettingsConfirm}
          onReadCurrentTemperature={onReadCurrentTemperature}
          onRefreshSerialPorts={onRefreshSerialPorts}
        />
        <details className="operatorRoiDisclosure">
          <summary>
            {t("Measurement ROI")}: {measurement.roi.width > 0 && measurement.roi.height > 0 ? t("Set") : t("Not set")}
          </summary>
          <MeasurementControls
            measurement={measurement}
            onMeasurement={onMeasurement}
            onResetRoi={onResetRoi}
            onPreviewAffectingChange={onPreviewAffectingChange}
          />
        </details>
        {operatorStartMessage ? <div className="inlineWarning">{operatorStartMessage}</div> : null}
        <div className="operatorRunActions">
          <button className="primaryButton" disabled={operatorRunActive} onClick={onOperatorStartRun} type="button">
            <Play size={16} aria-hidden="true" />
            {operatorRunActive ? t("Running") : t(startButtonLabel)}
          </button>
          <button className="secondaryButton" disabled={!operatorRunActive} onClick={onStopRun} type="button">
            <Square size={16} aria-hidden="true" />
            {t("Stop test")}
          </button>
        </div>
      </section>
      <section className="operatorVisualStack">
        {latestFrameUrl ? (
          <FrameCanvas
            title={latestFrameTitle}
            imageUrl={latestFrameUrl}
            sourceShape={latestFrameShape}
            roi={measurement.roi}
            abPoints={latestDetection?.ab_points ?? null}
            debugArtifacts={latestDetection?.debug_artifacts ?? null}
            onRoiChange={operatorRunActive ? undefined : onRoiChange}
            onRoiCommit={operatorRunActive ? undefined : onRoiCommit}
            readOnly={operatorRunActive}
          />
        ) : (
          <PreviewPlaceholder
            title={activeFrameTitle}
            refreshStatus={cameraPreviewRefreshStatus}
            previewError={cameraPreviewError}
          />
        )}
        <section className="toolPanel operatorTrendPanel">
          <div className="runTrendHeader">
            <div>
              <h2>{t("Live Trend")}</h2>
              <p>{provenanceLabel(sourceProvenance, language)}</p>
            </div>
            <div className="runTrendStatusLabel">{liveRun?.status === "running" ? t("Current run so far") : t("Full run")}</div>
          </div>
          {latestAnalysis ? (
            <RunTrendChart
              analysis={analysisForResultSource(latestAnalysis, "stabilized")}
              runId={liveRun?.runId ?? runResult?.run_manifest.run_id ?? null}
              isRunning={liveRun?.status === "running"}
              targetTemperature={measurement.detector_config.target_temperature_celsius ?? null}
              compact
            />
          ) : (
            <div className="statusBlock">{t("No formal temperature-distance points operator")}</div>
          )}
        </section>
      </section>
    </div>
  );
}

function OperatorSourceControls({
  datasets,
  selectedDataset,
  selectedDatasetId,
  source,
  disabled,
  onDataset,
  onSource
}: {
  datasets: OfflineDatasetListItem[];
  selectedDataset: OfflineDatasetListItem;
  selectedDatasetId: string;
  source: OperatorDataSource;
  disabled: boolean;
  onDataset: (datasetId: string) => void;
  onSource: (source: OperatorDataSource) => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <div className="controlStack operatorSourceControls">
      <h3>{t("Data source")}</h3>
      <div className="segmented wide" aria-label={t("Data source")}>
        <button
          className={source === "offline_dataset" ? "active" : ""}
          disabled={disabled}
          onClick={() => onSource("offline_dataset")}
          type="button"
        >
          <Database size={15} aria-hidden="true" />
          {t("Offline dataset")}
        </button>
        <button
          className={source === "real_camera" ? "active" : ""}
          disabled={disabled}
          onClick={() => onSource("real_camera")}
          type="button"
        >
          <Camera size={15} aria-hidden="true" />
          {t("Real camera")}
        </button>
      </div>
      {source === "offline_dataset" ? (
        <label className="field">
          <span>{t("Offline material")}</span>
          <select disabled={disabled} onChange={(event) => onDataset(event.target.value)} value={selectedDatasetId}>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {operatorDatasetOptionLabel(dataset, language)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="operatorSourceHint">{uiText(language, "Real camera source uses the live camera API.")}</div>
      )}
      {source === "offline_dataset" ? (
        <div className="operatorSourceHint">{uiDatasetLabel(language, selectedDataset)}</div>
      ) : null}
    </div>
  );
}

function OperatorTemperaturePanel({
  currentTemperature,
  operatorSettings,
  serialPortOptions,
  temperatureStatus,
  temperatureError,
  checkingTemperature,
  loadingSerialPorts,
  simulatedMode,
  onPatch,
  onConfirm,
  onReadCurrentTemperature,
  onRefreshSerialPorts
}: {
  currentTemperature: number | null;
  operatorSettings: OperatorConfirmedSettings;
  serialPortOptions: string[];
  temperatureStatus: TemperatureStatusResponse | null;
  temperatureError: SetupTemperatureError | null;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  simulatedMode: boolean;
  onPatch: (patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>) => void;
  onConfirm: () => void;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <div className="controlStack operatorTemperaturePanel">
      <h3>{t("Temperature Control")}</h3>
      {simulatedMode ? (
        <div className="inlineWarning">{t("No real temperature controller is connected in simulated mode.")}</div>
      ) : (
        <>
          <div className="operatorTemperatureReadout">
            <span>{formatTemperatureValue(currentTemperature, language)}</span>
            <small>{temperatureStatus?.temperature_status ? uiStatus(language, temperatureStatus.temperature_status) : t("Not read")}</small>
          </div>
          {temperatureError ? <div className="inlineError">{temperatureError.message}</div> : null}
        </>
      )}
      <div className="twoColumnControls">
        <NullableNumberField
          label="Target temperature"
          value={operatorSettings.targetTemperatureC}
          onChange={(value) => onPatch({ targetTemperatureC: value })}
        />
        <NumberField
          label="Temperature power"
          min={0}
          max={100}
          value={operatorSettings.temperaturePowerPercent}
          onChange={(value) => onPatch({ temperaturePowerPercent: clamp(value, 0, 100) })}
        />
      </div>
      {!simulatedMode ? (
        <label className="field">
          <span>{t("Temperature serial port")}</span>
          <select onChange={(event) => onPatch({ serialPort: event.target.value || null })} value={operatorSettings.serialPort ?? ""}>
            <option value="">{t("Configured/default")}</option>
            {serialPortOptions.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="buttonPair">
        <button className="primaryButton" onClick={onConfirm} type="button">
          {t("Confirm test settings")}
        </button>
        {!simulatedMode ? (
          <button className="secondaryButton" disabled={loadingSerialPorts} onClick={onRefreshSerialPorts} type="button">
            <Usb size={16} aria-hidden="true" />
            {loadingSerialPorts ? t("Scanning") : t("Refresh ports")}
          </button>
        ) : null}
      </div>
      {!simulatedMode ? (
        <button className="secondaryButton compactOperatorButton" disabled={checkingTemperature} onClick={onReadCurrentTemperature} type="button">
          <Thermometer size={16} aria-hidden="true" />
          {checkingTemperature ? t("Reading") : t("Read temp")}
        </button>
      ) : null}
      <div className={operatorSettings.dirty || !operatorSettings.confirmedAt ? "inlineWarning" : "inlineSuccess"}>
        {operatorSettingsSummary(operatorSettings, language)}
      </div>
    </div>
  );
}

function OperatorImportPage({
  importedRun,
  onImportRunExport,
  onImportedRun
}: {
  importedRun: ImportedRunView | null;
  onImportRunExport: (file: File) => Promise<ImportedRunView>;
  onImportedRun: (view: ImportedRunView | null) => void;
}) {
  const t = useUiText();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function importFile(file: File | null | undefined) {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      await onImportRunExport(file);
    } catch (err) {
      onImportedRun(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="operatorImportGrid">
      <section className="toolPanel operatorImportPanel">
        <h2>{t("History Import")}</h2>
        <label
          className="operatorDropZone"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void importFile(event.dataTransfer.files.item(0));
          }}
        >
          <Upload size={24} aria-hidden="true" />
          <span>{t("Choose or drop export file")}</span>
          <small>{t("Supports G3 zip or json export")}</small>
          <input
            accept=".zip,.json,application/json,application/zip"
            onChange={(event) => void importFile(event.currentTarget.files?.item(0))}
            type="file"
          />
        </label>
        {importing ? <div className="statusBlock">{t("Importing")}</div> : null}
        {error ? <div className="inlineError">{error}</div> : null}
      </section>
      <section className="toolPanel operatorImportedView">
        <h2>{importedRun ? importedRun.filename : t("Imported result")}</h2>
        {importedRun ? (
          <>
            <ImportedRunSummary view={importedRun} />
            <ImportedRunCurveReview view={importedRun} />
          </>
        ) : (
          <div className="statusBlock">{t("No imported file")}</div>
        )}
      </section>
    </div>
  );
}

function OperatorResultsPage({
  importedRun,
  liveRun,
  runResult
}: {
  importedRun: ImportedRunView | null;
  liveRun: LiveRunState | null;
  runResult: RunResponse | null;
}) {
  const t = useUiText();
  const language = useUiLanguage();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const currentAnalysis =
    runResult?.analysis_result ??
    (liveRun?.status === "stopped" || liveRun?.status === "complete" ? liveRun.analysis : null);
  const currentRunId = runResult?.run_manifest.run_id ?? (
    liveRun?.status === "stopped" || liveRun?.status === "complete" ? liveRun.runId : null
  );
  const analysis = currentAnalysis ?? importedRun?.analysis_result ?? null;
  const isImported = !currentAnalysis && importedRun?.analysis_result;
  const resultProvenance =
    runResult?.run_manifest.provenance ??
    liveRun?.provenance ??
    importedRun?.provenance ??
    null;
  const resultSourceWarning = sourceProvenanceWarning(resultProvenance, language);

  async function exportCurrentRun() {
    if (!currentRunId) return;
    setExporting(true);
    setExportError("");
    setExportMessage("");
    try {
      const download = await downloadRunExportBundle(currentRunId);
      setExportMessage(`${t("Export complete")}: ${download.filename}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="operatorResultsGrid">
      <section className="toolPanel operatorResultSummary">
        <h2>{t("Results / Export")}</h2>
        <SourceProvenanceBadge provenance={resultProvenance} language={language} compact warning={resultSourceWarning} />
        <dl className="metricGrid compact operatorSummaryMetrics">
          <Metric label="Run" value={currentRunId ?? importedRun?.run_manifest?.run_id ?? importedRun?.filename ?? "No run selected"} />
          <Metric label="AFAS status" value={readAfasStatus(analysis)} />
          <Metric label="Formal temp-distance points" value={analysis?.temperature_distance.length ?? importedRun?.frame_summary.temperature_distance_points ?? 0} />
          <Metric label="Source" value={resultProvenance ? provenanceLabel(resultProvenance, language) : isImported ? "Imported file" : "Current run so far"} />
        </dl>
        {analysis ? <OperatorAfasSummary analysis={analysis} /> : null}
        <button
          className="primaryButton spaced"
          disabled={!currentRunId || exporting}
          onClick={exportCurrentRun}
          type="button"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? t("Exporting") : t("Export result")}
        </button>
        {exportError ? <div className="inlineError">{exportError}</div> : null}
        {exportMessage ? <div className="inlineSuccess">{exportMessage}</div> : null}
        {importedRun?.warnings.length ? (
          <ul className="operatorWarningList">
            {importedRun.warnings.map((warning) => (
              <li key={warning}>{localizeDisplayString(warning, language)}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="toolPanel operatorResultChart">
        <h2>{t("AFAS temperature-distance review")}</h2>
        {analysis ? (
          <AnalysisAfasChart analysis={analysisForResultSource(analysis, "stabilized")} />
        ) : importedRun?.temperature_distance_image_data_url ? (
          <figure className="importedPngFigure">
            <img src={importedRun.temperature_distance_image_data_url} alt={t("Distance - temperature")} />
            <figcaption>{t("Imported image only")}</figcaption>
          </figure>
        ) : (
          <div className="statusBlock">{t("No AFAS temperature-distance points")}</div>
        )}
      </section>
      {importedRun ? (
        <section className="toolPanel operatorImportedDetails">
          <h2>{t("Imported result")}</h2>
          <ImportedRunSummary view={importedRun} />
        </section>
      ) : null}
    </div>
  );
}

function ImportedRunSummary({ view }: { view: ImportedRunView }) {
  const language = useUiLanguage();
  const measurement = view.measurement_definition;
  const analysis = view.analysis_result;
  const sourceWarning = sourceProvenanceWarning(view.provenance, language);
  return (
    <div className="importedRunSummary">
      <SourceProvenanceBadge provenance={view.provenance} language={language} compact warning={sourceWarning} />
      <dl className="metricGrid compact operatorSummaryMetrics">
        <Metric label="File" value={view.filename} />
        <Metric label="Run" value={view.run_manifest?.run_id ?? analysis?.run_id ?? "None"} />
        <Metric label="Object class" value={measurement?.object_class ?? "None"} />
        <Metric label="Width mode" value={measurement?.width_mode ?? "None"} />
        <Metric label="target_temperature_celsius" value={formatOptionalNumber(readRecord(measurement?.detector_config).target_temperature_celsius, " °C", language)} />
        <Metric label="temperature_power_percent" value={formatOptionalNumber(readRecord(measurement?.detector_config).temperature_power_percent, " %", language)} />
        <Metric label="Frames" value={view.frame_summary.total_frames.toLocaleString()} />
        <Metric label="Valid / Invalid" value={`${view.frame_summary.valid_frames.toLocaleString()} / ${Math.max(0, view.frame_summary.total_frames - view.frame_summary.valid_frames).toLocaleString()}`} />
        <Metric label="Temp-distance points" value={view.frame_summary.temperature_distance_points.toLocaleString()} />
        <Metric label="AFAS status" value={readAfasStatus(analysis)} />
      </dl>
      <OperatorAfasSummary analysis={analysis} />
      {Object.keys(view.frame_summary.invalid_reason_counts).length ? (
        <details className="operatorDetailsDisclosure">
          <summary>{uiText(language, "Invalid reason statistics")}</summary>
          <pre>{JSON.stringify(view.frame_summary.invalid_reason_counts, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ImportedRunCurveReview({ view }: { view: ImportedRunView }) {
  const t = useUiText();
  const analysis = view.analysis_result;
  return (
    <div className="operatorImportedChart">
      <h3>{t("Temperature-distance curve")}</h3>
      {analysis ? (
        <AnalysisAfasChart analysis={analysisForResultSource(analysis, "stabilized")} />
      ) : view.temperature_distance_image_data_url ? (
        <figure className="importedPngFigure">
          <img src={view.temperature_distance_image_data_url} alt={t("Distance - temperature")} />
          <figcaption>{t("Imported image only")}</figcaption>
        </figure>
      ) : (
        <div className="statusBlock">{t("No AFAS temperature-distance points")}</div>
      )}
    </div>
  );
}

function OperatorAfasSummary({ analysis }: { analysis: AnalysisResult | null }) {
  const language = useUiLanguage();
  const result = readRecord(analysis?.afas_analysis?.result);
  const afValue = readAfasAfValue(result);
  return (
    <dl className="operatorAfasSummary">
      <Metric label="AS" value={formatOptionalNumber(result.As, " °C", language)} />
      <Metric label="AF" value={formatOptionalNumber(afValue, " °C", language)} />
      <Metric label="ΔT" value={formatDeltaT(result.As, afValue, language)} />
      <Metric label="Max slope" value={formatOptionalNumber(result.max_slope_temp, " °C", language)} />
      <Metric label="Raw points" value={analysis?.temperature_distance.length.toLocaleString() ?? "0"} />
      <Metric label="Smoothed points" value={formatArrayCount(readRecord(analysis?.afas_preprocessing?.smoothed).temperature_celsius)} />
      <Metric label="Status" value={readAfasStatus(analysis)} />
    </dl>
  );
}

function SetupSourceControls({
  source,
  onSource
}: {
  source: SetupSourceKind;
  onSource: (source: SetupSourceKind) => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <div className="controlStack">
      <h3>{t("Source")}</h3>
      <div className="segmented wide" aria-label={t("Source")}>
        {SETUP_SOURCE_OPTIONS.map((option) => (
          <button
            className={source === option.kind ? "active" : ""}
            key={option.kind}
            onClick={() => onSource(option.kind)}
            type="button"
          >
            {option.kind === "offline_dataset" ? <Database size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
            {t(option.label)}
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
  previewFps,
  previewing,
  probing,
  onPreviewFpsChange,
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
  previewFps: number | null | undefined;
  previewing: boolean;
  probing: boolean;
  onPreviewFpsChange: (fps: number) => void;
  onRefresh: () => void;
  onProbe: () => void;
  onFreeze: () => void;
  onResume: () => void;
  onConfirmRoi: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const mode = previewState?.mode ?? "live";
  const isFrozen = mode === "frozen";
  return (
    <div className="controlStack">
      <h3>{t("Real Camera Source")}</h3>
      <div className="segmented wide" aria-label={t("Real Camera Source")}>
        <button className={!isFrozen ? "active" : ""} onClick={onResume} type="button">
          <Play size={15} aria-hidden="true" />
          {t("Live")}
        </button>
        <button className={isFrozen ? "active" : ""} disabled={!preview} onClick={onFreeze} type="button">
          <Square size={15} aria-hidden="true" />
          {t("Freeze")}
        </button>
      </div>
      <dl className="metricGrid compact">
        <Metric label="Display mode" value={isFrozen ? "Frozen frame" : "Live"} />
        <Metric label="camera_status" value={preview?.camera_status ?? previewError?.camera_status ?? "No camera frame"} />
        <Metric label="model" value={previewValue(preview, "model")} />
        <Metric label="serial_number" value={previewValue(preview, "serial_number")} />
        <Metric label="ip" value={previewValue(preview, "ip")} />
        <Metric label="pixel_format" value={previewValue(preview, "pixel_format")} />
        <Metric label="Frame shape" value={preview ? preview.shape.join(" × ") : "None"} />
        <Metric label="Timestamp" value={preview?.timestamp_ms ?? "None"} />
        <Metric label="Frozen timestamp" value={previewState?.frozenTimestampMs ?? "None"} />
        <Metric label="Live display rate" value={isFrozen ? "Paused" : setupPreviewFpsLabel(previewFps, language)} />
      </dl>
      <NumberField
        label="setup_live_fps"
        min={0}
        onChange={(value) => onPreviewFpsChange(normalizeSetupPreviewFps(value))}
        step={1}
        title={t("Real camera Setup live display update rate.")}
        value={normalizeSetupPreviewFps(previewFps)}
      />
      <div className="buttonPair">
        <button className="secondaryButton" disabled={previewing} onClick={onRefresh} type="button">
          <RefreshCcw size={16} aria-hidden="true" />
          {previewing ? t("Updating") : isFrozen ? t("Capture new setup frame") : t("Capture latest frame")}
        </button>
        <button className="primaryButton" disabled={probing || (!preview && isFrozen)} onClick={onProbe} type="button">
          <SquareDashedMousePointer size={16} aria-hidden="true" />
          {probing ? t("Probing") : t("Probe current frame")}
        </button>
      </div>
      {isFrozen ? (
        <button className="primaryButton" onClick={onResume} type="button">
          <Play size={16} aria-hidden="true" />
          {t("Resume live")}
        </button>
      ) : (
        <button className="secondaryButton" disabled={!preview} onClick={onFreeze} type="button">
          <Square size={16} aria-hidden="true" />
          {t("Freeze")}
        </button>
      )}
      {previewState?.roiNeedsReconfirm ? (
        <div className="inlineWarning">
          <span>{localizeShapeChangeMessage(previewState.shapeChangeMessage, language)}</span>
          <button className="secondaryButton compactButton" onClick={onConfirmRoi} type="button">
            {t("Confirm ROI")}
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
  const language = useUiLanguage();
  return (
    <figure className="frameCanvasFigure">
      <figcaption>{title}</figcaption>
      <div className="frameCanvas previewPlaceholder">
        <div className={previewError ? "frameCanvasStatus error" : "frameCanvasStatus"}>
          {previewError ? previewError.message : previewRefreshStatusLabel(refreshStatus, language)}
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
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <div className="controlStack">
      <div className="segmented wide">
        <button onClick={() => onFrameIndex(1)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          {t("First")}
        </button>
        <button onClick={() => onFrameIndex(frameCount)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          {t("Last")}
        </button>
      </div>
      <label className="field">
        <span>{t("Frame")}</span>
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
        {probing ? t("Probing") : t("Probe current frame")}
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
  const language = useUiLanguage();
  const t = useUiText();
  function patchRoi(patch: Partial<RotatedROI>) {
    onMeasurement({ ...measurement, roi: { ...measurement.roi, ...patch } });
  }

  function commitRoiField() {
    onPreviewAffectingChange?.({ kind: "roi" });
  }

  return (
    <div className="controlStack">
      <h3>{t("Measurement ROI")}</h3>
      <div className="twoColumnControls">
        <NumberField label="Center X" value={measurement.roi.center_x} onChange={(v) => patchRoi({ center_x: v })} onCommit={commitRoiField} />
        <NumberField label="Center Y" value={measurement.roi.center_y} onChange={(v) => patchRoi({ center_y: v })} onCommit={commitRoiField} />
        <NumberField label="Width" value={measurement.roi.width} onChange={(v) => patchRoi({ width: Math.max(1, v) })} onCommit={commitRoiField} />
        <NumberField label="Height" value={measurement.roi.height} onChange={(v) => patchRoi({ height: Math.max(1, v) })} onCommit={commitRoiField} />
      </div>
      <label className="field">
        <span>
          <RotateCw size={14} aria-hidden="true" />
          {t("Angle")}
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
          {t("New / reset ROI")}
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
  const language = useUiLanguage();
  const t = useUiText();
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

  function applyDetectorPreset(patch: Partial<DetectorConfig>) {
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        ...patch
      }
    });
    onPreviewAffectingChange?.({ kind: "detector_config", key: "preset" });
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
      <h3>{t("Detector Setup")}</h3>
      <label className="field">
        <span>{t("Object class")}</span>
        <select onChange={(event) => changeObjectClass(event.target.value)} value={measurement.object_class}>
          {OBJECT_CLASS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {uiObjectClass(language, option.value)}
            </option>
          ))}
        </select>
      </label>
      <div className="detectorPresetGroup">
        {DETECTOR_PRESETS.map((preset) => (
          <button className="secondaryButton compactButton" key={preset.id} onClick={() => applyDetectorPreset(preset.patch)} type="button">
            {t(preset.label)}
          </button>
        ))}
      </div>
      <DetectorParameterGroups
        definitions={DETECTOR_PARAMETER_DEFS.filter((definition) => BASIC_DETECTOR_PARAMETER_KEYS.has(definition.key))}
        detectorConfig={measurement.detector_config}
        onChange={patchDetectorConfig}
        onCommit={commitDetectorConfig}
      />
      <details className="advancedDetectorParameters">
        <summary>{t("Advanced")}</summary>
        <label className="field">
          <span>{t("Detector")}</span>
          <select
            onChange={(event) => patchMeasurement({ detector: event.target.value }, { kind: "detector" })}
            value={measurement.detector}
          >
            {DETECTOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {uiDetector(language, option.value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("Width mode")}</span>
          <select
            onChange={(event) =>
              patchMeasurement({ width_mode: event.target.value as MeasurementDefinition["width_mode"] }, { kind: "width_mode" })
            }
            value={measurement.width_mode}
        >
            <option value="max_width">{uiWidthMode(language, "max_width")}</option>
            <option disabled={measurement.object_class !== "D_RESERVED_OBJECT"} value="min_width">
              {uiWidthMode(language, "min_width")}
            </option>
          </select>
        </label>
        <DetectorParameterGroups
          definitions={DETECTOR_PARAMETER_DEFS.filter((definition) => !BASIC_DETECTOR_PARAMETER_KEYS.has(definition.key))}
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
  const language = useUiLanguage();
  const t = useUiText();
  const groups = Array.from(new Set(definitions.map((definition) => definition.group)));
  return (
    <>
      {groups.map((group) => (
        <div className="detectorParameterGroup" key={group}>
          <h4>{t(group)}</h4>
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
  const language = useUiLanguage();
  const t = useUiText();
  const value = detectorConfig[definition.key] ?? (DEFAULT_CONFIG as DetectorConfig)[definition.key];
  if (definition.type === "bool") {
    return (
      <label className="field checkboxField" title={language === "zh" ? undefined : definition.title}>
        <span>{t(definition.label)}</span>
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
      <label className="field" title={language === "zh" ? undefined : definition.title}>
        <span>{t(definition.label)}</span>
        <select
          onChange={(event) => {
            onChange(definition.key, event.target.value as DetectorConfig[keyof DetectorConfig]);
            onCommit(String(definition.key));
          }}
          value={typeof value === "string" ? value : ""}
        >
          {(definition.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {uiValue(language, option.label)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <NumberField
      label={t(definition.label)}
      max={definition.max}
      min={definition.min}
      step={definition.step}
      title={language === "zh" ? undefined : definition.title}
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
  const language = useUiLanguage();
  const t = useUiText();
  const summary = buildSetupTemperatureSummary(
    measurement,
    temperatureStatus,
    serialPorts,
    temperatureError,
    fallbackTemperature,
    language
  );
  const selectedPort = measurement.detector_config.temperature_serial_port?.trim() ?? "";
  const serialPortOptions = uniqueStrings([
    selectedPort,
    ...serialPorts.map((port) => port.device || port.name)
  ]);

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
      <h3>{t("Temperature Control")}</h3>
      <dl className="metricGrid compact">
        <Metric label="Current" value={summary.currentTemperature} />
        <Metric label="Status" value={summary.status} />
        <Metric label="Source" value={summary.source} />
        <Metric label="Timestamp" value={summary.timestamp} />
        <Metric label="Target" value={summary.targetTemperatureCelsius} />
        <Metric label="Power" value={summary.temperaturePowerPercent} />
        <Metric label="Selected port" value={summary.selectedPort} />
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
      <label className="field">
        <span>{t("temperature_serial_port")}</span>
        <select
          onChange={(event) => onMeasurement(selectSetupTemperatureSerialPort(measurement, event.target.value))}
          value={selectedPort}
        >
          <option value="">{t("Configured/default")}</option>
          {serialPortOptions.map((port) => (
            <option key={port} value={port}>
              {port}
            </option>
          ))}
        </select>
      </label>
      <div className="buttonPair">
        <button className="secondaryButton" disabled={checkingTemperature} onClick={onReadCurrentTemperature} type="button">
          <Thermometer size={16} aria-hidden="true" />
          {checkingTemperature ? t("Reading") : t("Read temp")}
        </button>
        <button className="secondaryButton" disabled={loadingSerialPorts} onClick={onRefreshSerialPorts} type="button">
          <Usb size={16} aria-hidden="true" />
          {loadingSerialPorts ? t("Scanning") : t("Ports")}
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
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <label className="field" title={title}>
      <span>{t(label)}</span>
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
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <label className="field">
      <span>{t(label)}</span>
      <input
        min={min}
        onChange={(event) => {
          const raw = event.target.value.trim();
          onChange(raw === "" ? null : Number(raw));
        }}
        placeholder={t("None")}
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
  const language = useUiLanguage();
  const t = useUiText();
  const result = probe?.detection_result ?? null;
  return (
    <div className="diagnostics">
      <h3>{t("Result")}</h3>
      <dl className="metricGrid compact">
        <Metric label="Dataset" value={uiDatasetLabel(language, dataset)} />
        <Metric label="Detector" value={uiDetector(language, dataset.default_detector)} />
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
          <summary>{t("Diagnostics")}</summary>
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
  const t = useUiText();
  const result = probe?.detection_result ?? null;
  return (
    <div className="diagnostics">
      <h3>{t("Probe Result")}</h3>
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
          <summary>{t("Diagnostics")}</summary>
          <pre>{JSON.stringify(probe, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function DetectionDiagnosticImages({
  debugArtifacts,
  roi
}: {
  debugArtifacts?: Record<string, unknown> | null;
  roi?: RotatedROI | null;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const images = readDiagnosticImages(debugArtifacts);
  if (!images) return null;
  const roiWarning =
    debugArtifacts &&
    typeof debugArtifacts.roi_edge_warning === "string"
      ? debugArtifacts.roi_edge_warning
      : null;
  return (
    <section className="diagnosticImagePanel" aria-label={t("Detection Diagnostics")}>
      <div className="diagnosticImageHeader">
        <h3>{t("Detection Diagnostics")}</h3>
        <span>{uiValue(language, images[0]?.coordinates ?? "roi_local_pixel")}</span>
      </div>
      {roiWarning ? <div className="diagnosticWarning">{localizeDisplayString(roiWarning, language)}</div> : null}
      <div className="diagnosticImageGrid">
        {images.map((image) => (
          <DiagnosticImageFigure debugArtifacts={debugArtifacts ?? null} image={image} key={image.label} roi={roi ?? null} />
        ))}
      </div>
    </section>
  );
}

function DiagnosticImageFigure({
  debugArtifacts,
  image,
  roi
}: {
  debugArtifacts: Record<string, unknown> | null;
  image: DiagnosticImages[number];
  roi: RotatedROI | null;
}) {
  const t = useUiText();
  const sizeLabel = image.width && image.height ? `${image.width} × ${image.height}` : "";
  const overlay = diagnosticOverlayModel(debugArtifacts, roi, image);
  return (
    <figure className="diagnosticImageFigure">
      <figcaption>
        <span>{t(image.label)}</span>
        {sizeLabel ? <span>{sizeLabel}</span> : null}
      </figcaption>
      <div className="diagnosticImageCanvas">
        <img src={image.src} alt={t(image.label)} />
        {overlay ? (
          <svg className="diagnosticImageOverlay" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${overlay.width} ${overlay.height}`}>
            {overlay.fullBox.length === 4 ? (
              <polygon className="diagnosticFullBox" points={overlay.fullBox.map((point) => `${point.x},${point.y}`).join(" ")} />
            ) : null}
            {overlay.bandBox.length === 4 ? (
              <>
                <polygon className="diagnosticBandBox" points={overlay.bandBox.map((point) => `${point.x},${point.y}`).join(" ")} />
                <text className="diagnosticBandLabel" x={overlay.bandBox[0].x + 8} y={overlay.bandBox[0].y + 18}>
                  {t("Measurement band")}
                </text>
              </>
            ) : null}
            {overlay.measurementLine.length === 2 ? (
              <line
                className="diagnosticMeasurementLine"
                x1={overlay.measurementLine[0].x}
                x2={overlay.measurementLine[1].x}
                y1={overlay.measurementLine[0].y}
                y2={overlay.measurementLine[1].y}
              />
            ) : null}
            {overlay.pointA ? (
              <>
                <circle className="diagnosticABPoint" cx={overlay.pointA.x} cy={overlay.pointA.y} r={5} />
                <text className="diagnosticABLabel" x={overlay.pointA.x + 7} y={overlay.pointA.y - 7}>
                  A
                </text>
              </>
            ) : null}
            {overlay.pointB ? (
              <>
                <circle className="diagnosticABPoint" cx={overlay.pointB.x} cy={overlay.pointB.y} r={5} />
                <text className="diagnosticABLabel" x={overlay.pointB.x + 7} y={overlay.pointB.y + 15}>
                  B
                </text>
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
    </figure>
  );
}

function diagnosticOverlayModel(
  debugArtifacts: Record<string, unknown> | null,
  roi: RotatedROI | null,
  image: DiagnosticImages[number]
): {
  width: number;
  height: number;
  fullBox: ABPoint[];
  bandBox: ABPoint[];
  measurementLine: ABPoint[];
  pointA: ABPoint | null;
  pointB: ABPoint | null;
} | null {
  if (!debugArtifacts || !roi || !image.width || !image.height) return null;
  if (image.coordinates !== "roi_local_full_res") return null;
  const fullBox = readPointArray(debugArtifacts.contour_full_box).map((point) => measurementPointToRoiLocal(point, roi));
  const projectionBox = readPointArray(debugArtifacts.contour_projection_box).map((point) => measurementPointToRoiLocal(point, roi));
  const bandBox = readPointArray(debugArtifacts.contour_measurement_band_box).map((point) => measurementPointToRoiLocal(point, roi));
  const measurementLine = readPointArray(debugArtifacts.measurement_line).map((point) => measurementPointToRoiLocal(point, roi));
  const pointA = readPoint(debugArtifacts.point_a);
  const pointB = readPoint(debugArtifacts.point_b);
  return {
    width: image.width,
    height: image.height,
    fullBox: fullBox.length === 4 ? fullBox : projectionBox,
    bandBox,
    measurementLine,
    pointA: pointA ? measurementPointToRoiLocal(pointA, roi) : null,
    pointB: pointB ? measurementPointToRoiLocal(pointB, roi) : null
  };
}

function measurementPointToRoiLocal(point: ABPoint, roi: RotatedROI): ABPoint {
  const theta = (roi.angle_deg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = point.x - roi.center_x;
  const dy = point.y - roi.center_y;
  return {
    x: dx * cos + dy * sin + roi.width / 2,
    y: -dx * sin + dy * cos + roi.height / 2
  };
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
  const t = useUiText();
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
          <div className="frameCanvasStatus">{t("Loading frame...")}</div>
        )}
        {stableImage.status === "error" && stableImage.errorUrl ? (
          <div className="frameCanvasStatus error">{t("Frame image unavailable")}</div>
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
    const point = readPoint(item);
    return point ? [point] : [];
  });
}

function readPoint(value: unknown): ABPoint | null {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number"
  ) {
    return { x: (value as { x: number }).x, y: (value as { y: number }).y };
  }
  return null;
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
  const language = useUiLanguage();
  const t = useUiText();
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
  const label = language === "zh"
    ? `${t("Full detected contour region")}  ${theta == null ? "角度=?" : `角度=${theta.toFixed(1)}°`}  ${
        length == null ? "长度=?" : `长度=${length.toFixed(1)} 像素`
      }`
    : `Full detected contour region  ${theta == null ? "theta=?" : `theta=${theta.toFixed(1)} deg`}  ${
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
            {t("Measurement band")}
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
  const language = useUiLanguage();
  const t = useUiText();
  const [resultSource, setResultSource] = useState<DetectionResultSource>("stabilized");
  const displayedLiveRun =
    liveRun && runResultMatchesSetupSource(setupSource, dataset.id, liveRun.datasetId)
      ? liveRun
      : null;
  const displayedRunResult =
    runResult && runResultMatchesSetupSource(setupSource, dataset.id, runResult.run_manifest.dataset_id)
      ? runResult
      : null;
  const manifest = displayedRunResult?.run_manifest ?? null;
  const analysis = displayedLiveRun?.analysis
    ? analysisWithSyncConfigSnapshot(displayedLiveRun.analysis, manifest?.config_snapshot)
    : displayedRunResult
      ? analysisWithSyncConfigSnapshot(displayedRunResult.analysis_result, displayedRunResult.run_manifest.config_snapshot)
      : null;
  const displayedAnalysis = analysis ? analysisForResultSource(analysis, resultSource) : null;
  const runMode = runModeForSetupSource(setupSource, language);
  const setupSummary = buildRunSetupSummary(setupSource, uiDatasetLabel(language, dataset), measurement, language);
  const latestRunMode = manifest?.dataset_id === "real_camera" ? t("Real camera run") : t("Live offline run");
  const isDisplayedRealCameraRun = displayedLiveRun?.datasetId === "real_camera" || (displayedLiveRun == null && manifest?.dataset_id === "real_camera");
  const remainingFrames =
    runMode.kind === "real_camera_run"
      ? t("Until stopped or target temperature")
      : Math.max(0, dataset.frame_count - startFrame + 1);
  const progressValue = displayedLiveRun
    ? displayedLiveRun.totalFrames > 0
      ? `${displayedLiveRun.processedFrames.toLocaleString()} / ${displayedLiveRun.totalFrames.toLocaleString()}`
      : displayedLiveRun.processedFrames.toLocaleString()
    : t("Idle");
  const latestDetection =
    displayedLiveRun?.detectionResult ??
    (manifest?.detection_results.length
      ? manifest.detection_results[manifest.detection_results.length - 1]
      : null);
  const latestFrameRecord =
    isDisplayedRealCameraRun && latestDetection
      ? manifest?.frame_records.find((record) => record.frame_index === latestDetection.frame_index) ?? null
      : null;
  const latestRunId = displayedLiveRun?.runId ?? manifest?.run_id ?? null;
  const latestFrameUrl =
    displayedLiveRun?.frameUrl ??
    (latestDetection
      ? isDisplayedRealCameraRun && manifest
        ? runFrameImageUrl(manifest.run_id, latestDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
        : frameIndexImageUrl(dataset.id, latestDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
      : "");
  const latestFrameTitle =
    latestDetection && isDisplayedRealCameraRun
      ? `${t("Real camera run")} · ${latestRunId ?? t("no run id")} · ${t("frame")} ${latestDetection.frame_index}`
      : latestDetection
        ? `${uiDatasetLabel(language, dataset)} · ${t("Live")} ${t("frame")} ${latestDetection.frame_index}`
        : "";
  const latestSourceShape =
    isDisplayedRealCameraRun
      ? displayedLiveRun?.frameShape ?? latestFrameRecord?.shape ?? summary.first_frame.shape
      : summary.first_frame.shape;
  return (
    <div className="pageGrid runGrid">
      <section className="toolPanel">
        <h2>{t("Run")}</h2>
        <div className="controlStack">
          <h3>{t("Setup Summary")}</h3>
          <dl className="metricGrid compact">
            <Metric label="Source" value={setupSummary.sourceLabel} />
            <Metric label="Source ID" value={setupSummary.sourceId} />
            <Metric label="Measurement" value={language === "zh" ? "当前测量定义" : measurement.measurement_id} />
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
          <h3>{runMode.kind === "real_camera_run" ? t("Real Camera Run") : t("Live Offline Run")}</h3>
          <dl className="metricGrid compact">
            <Metric label="Start frame" value={runMode.kind === "real_camera_run" ? "Live" : startFrame.toLocaleString()} />
            <Metric label="Frame budget" value={typeof remainingFrames === "number" ? remainingFrames.toLocaleString() : remainingFrames} />
            <Metric
              label="Progress"
              value={progressValue}
            />
            <Metric label="Current frame" value={displayedLiveRun?.frameIndex.toLocaleString() ?? "None"} />
            <Metric label="Distance" value={formatDistance(latestDetection, resultSource)} />
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
            <button className="secondaryButton" disabled={runMode.kind === "real_camera_run" ? !runningCamera : !running} onClick={onStopRun} type="button">
              <Square size={16} aria-hidden="true" />
              {t("Stop")}
            </button>
          </div>
        </div>
      </section>
      <div className="runDetailStack">
        {analysis ? (
        <section className="toolPanel">
          <div className="runTrendHeader">
            <div>
              <h2>{liveRun?.status === "running" ? t("Live Trend") : t("Run Trend")}</h2>
              <p>
                {displayedLiveRun ? (displayedLiveRun.datasetId === "real_camera" ? t("Real camera run") : t("Live offline run")) : latestRunMode} · {latestRunId ?? t("no run id")}
              </p>
            </div>
            <div className="runTrendStatusLabel" aria-label={t("Run trend scope")}>
              {displayedLiveRun?.status === "running" ? t("Current run so far") : t("Full run")}
            </div>
          </div>
          <ResultSourceToggle source={resultSource} onSource={setResultSource} />
          <RunTrendChart
            analysis={displayedAnalysis ?? analysis}
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
              abPoints={abPointsForResultSource(latestDetection, resultSource)}
              debugArtifacts={latestDetection.debug_artifacts}
              readOnly
            />
            <DetectionDiagnosticImages debugArtifacts={latestDetection.debug_artifacts} roi={measurement.roi} />
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
  const language = useUiLanguage();
  const t = useUiText();
  const [resultSource, setResultSource] = useState<DetectionResultSource>("stabilized");
  const baseAnalysis = runResult
    ? analysisWithSyncConfigSnapshot(runResult.analysis_result, runResult.run_manifest.config_snapshot)
    : liveRun?.status === "stopped"
      ? liveRun.analysis
      : null;
  const selectedRunId = runResult?.run_manifest.run_id ?? (liveRun?.status === "stopped" ? liveRun.runId : null);
  const [analysisOverride, setAnalysisOverride] = useState<AnalysisResult | null>(null);
  const analysis = analysisOverride ?? baseAnalysis;
  const displayedAnalysis = analysis ? analysisForResultSource(analysis, resultSource) : null;
  const [artifacts, setArtifacts] = useState<ExportArtifact[]>(analysis?.export_artifacts ?? []);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    setAnalysisOverride(null);
  }, [selectedRunId]);

  useEffect(() => {
    setArtifacts(analysis?.export_artifacts ?? []);
    setExportError("");
    setExportMessage("");
  }, [analysis]);

  async function exportCurrentRun() {
    if (!selectedRunId) return;
    setExporting(true);
    setExportError("");
    setExportMessage("");
    try {
      const download = await downloadRunExportBundle(selectedRunId);
      setExportMessage(`${t("Export complete")}: ${download.filename}`);
      setArtifacts(await createRunExports(selectedRunId));
    } catch (err) {
      console.error("[export] failed", err);
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pageGrid runGrid analysisPageGrid">
      <section className="toolPanel analysisExportPanel">
        <h2>{t("Analysis / Export")}</h2>
        <dl className="metricGrid compact">
          <Metric label="Run" value={selectedRunId ?? "No run selected"} />
          <Metric label="Latest probe" value={formatDistance(probe?.detection_result ?? null, resultSource)} />
          <Metric label="Formal temp-distance points" value={displayedAnalysis?.temperature_distance.length ?? 0} />
          <Metric label="AFAS status" value={readAfasStatus(analysis)} />
        </dl>
        <button
          className="primaryButton spaced"
          disabled={!selectedRunId || exporting}
          onClick={exportCurrentRun}
          type="button"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? t("Exporting") : t("Export")}
        </button>
        {exportError ? <div className="inlineError">{exportError}</div> : null}
        {exportMessage ? <div className="inlineSuccess">{exportMessage}</div> : null}
        {artifacts.length ? (
          <div className="artifactList">
            {artifacts.map((artifact) => (
              <a href={artifactDownloadUrl(artifact)} key={artifact.artifact_id}>
                {localizeArtifactType(artifact.artifact_type, language)}
              </a>
            ))}
          </div>
        ) : null}
      </section>
      {analysis ? (
        <section className="toolPanel analysisMainPanel">
          <h2>{selectedRunId ? `${t("Analysis")} · ${selectedRunId}` : t("Analysis")}</h2>
          <ResultSourceToggle source={resultSource} onSource={setResultSource} />
          <AnalysisAfasChart analysis={displayedAnalysis ?? analysis} />
          <details className="analysisParameterDisclosure">
            <summary>
              <Settings size={15} aria-hidden="true" />
              {t("AFAS parameters")}
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

function ResultSourceToggle({
  source,
  onSource
}: {
  source: DetectionResultSource;
  onSource: (source: DetectionResultSource) => void;
}) {
  const t = useUiText();
  return (
    <div className="segmented wide resultSourceToggle" aria-label={t("Detection result source")}>
      <button className={source === "stabilized" ? "active" : ""} onClick={() => onSource("stabilized")} type="button">
        {t("Stabilized")}
      </button>
      <button className={source === "raw" ? "active" : ""} onClick={() => onSource("raw")} type="button">
        {t("Raw")}
      </button>
    </div>
  );
}

function AfasResultPanel({ analysis }: { analysis: AnalysisResult }) {
  const language = useUiLanguage();
  const afas = analysis.afas_analysis ?? {};
  const result = readRecord(afas.result);
  const fit = readRecord(afas.fit);
  const afValue = readAfasAfValue(result);
  const status = typeof afas.result_status === "string" ? uiStatus(language, afas.result_status) : uiText(language, "unavailable");
  return (
    <dl className="metricGrid compact afasResultGrid">
      <Metric label="Status" value={status} />
      <Metric label="AS" value={formatOptionalNumber(result.As, " °C", language)} />
      <Metric label="AF" value={formatOptionalNumber(afValue, " °C", language)} />
      <Metric label="ΔT" value={formatDeltaT(result.As, afValue, language)} />
      <Metric label="Max slope" value={formatOptionalNumber(result.max_slope_temp, " °C", language)} />
      <Metric label="Outliers" value={typeof afas.outlier_count === "number" ? afas.outlier_count : uiNone(language)} />
      <Metric label="Low range" value={formatRange(readRecord(afas.parameters).resolved_low_range_celsius)} />
      <Metric label="High range" value={formatRange(readRecord(afas.parameters).resolved_high_range_celsius)} />
      <Metric label="Tangent slope" value={formatOptionalNumber(readRecord(fit.tangent).slope, uiNumberSuffix(language, " px/°C"), language)} />
    </dl>
  );
}

function readAfasAfValue(result: Record<string, unknown>): number | undefined {
  for (const value of [result.Af_tan, result.AF, result.Af, result.af_tan]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
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
  const language = useUiLanguage();
  const t = useUiText();
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
          {t("AFAS Parameters")}
        </h3>
        <button
          className="secondaryButton analysisRecalculateButton"
          disabled={!runId || recalculating}
          onClick={recalculateAnalysis}
          type="button"
        >
          <RefreshCcw size={15} aria-hidden="true" />
          {recalculating ? t("Recalculating") : t("Recalculate")}
        </button>
      </div>
      <div className="analysisControlGrid">
        <fieldset>
          <legend>{t("Preprocessing")}</legend>
          <label className="field checkboxField">
            <input
              checked={preprocessing.group_by_temperature}
              onChange={(event) => patchPreprocessing({ group_by_temperature: event.target.checked })}
              type="checkbox"
            />
            <span>{t("Group by temperature")}</span>
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
          <legend>{t("Tangent")}</legend>
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
            <li key={`${warning}-${index}`}>{localizeDisplayString(warning, language)}</li>
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
  const t = useUiText();
  const frame = buildIndustrialCurveFrameModel({
    variant,
    width: model.width,
    height: model.height,
    plot: model.plot,
    xTicks: model.xTicks,
    yTicks: model.yTicks,
    xAxisLabel: t(model.xAxisLabel),
    yAxisLabel: t(model.yAxisLabel)
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
  const language = useUiLanguage();
  const t = useUiText();
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
        <div className="analysisAfasLayerGroup" aria-label={t("AFAS chart layers")}>
          <AnalysisLayerToggle
            checked={layers.raw}
            label={t("Raw")}
            onChange={(checked) => patchLayer("raw", checked)}
          />
          <AnalysisLayerToggle
            checked={layers.fit}
            label={t("Fit")}
            onChange={(checked) => patchLayer("fit", checked)}
          />
          <AnalysisLayerToggle
            checked={layers.markers}
            label={t("Markers")}
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
          {t("Reset zoom")}
        </button>
      </div>
      <figure className="analysisAfasFigure">
        <figcaption>
          <span>{t("AFAS temperature-distance review")}</span>
          <span>{xDomain ? `${model.xRange.min.toFixed(2)}-${model.xRange.max.toFixed(2)} °C` : t("Full analysis range")}</span>
        </figcaption>
        <IndustrialCurveView
          className="analysisAfasSvg"
          ariaLabel={t("AFAS temperature-distance review chart")}
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
                  {t(line.label)}
                </text>
              </g>
            ))}
          {model.fitLines
            .filter((line) => line.kind === "tangent")
            .map((line) => (
              <g className="analysisAfasFitLineGroup analysisAfasFitLineGroup--tangent" key="fit-tangent">
                <line className="analysisAfasFitLine analysisAfasFitLine--tangent" x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2} />
                <text className="analysisAfasInlineLabel analysisAfasInlineLabel--tangent" x={line.labelX} y={line.labelY - 10} textAnchor="middle">
                  {t(line.label)}
                </text>
              </g>
            ))}
          {model.constructionGuides.map((guide) => (
            <line
              aria-label={`${t(guide.label)}; ${t(guide.role)}`}
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
              {t("Smoothed curve")}
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
            <CurveEmptyText
              emptyState={model.emptyState}
              fallback="No AFAS temperature-distance points"
              x={(model.plot.left + model.plot.right) / 2}
              y={(model.plot.top + model.plot.bottom) / 2}
            />
          ) : null}
        </IndustrialCurveView>
        <div className="analysisAfasLegend" aria-label={t("AFAS chart legend")}>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--smooth">{t("Smoothed curve")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--raw">{t("Raw diagnostic")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--lowBaseline">{t("AS baseline / Low baseline")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--highBaseline">{t("AF baseline / High baseline")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--tangent">{t("Maximum slope tangent")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--asMarker">{t("AS point")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--afMarker">{t("AF point")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--maxSlope">{t("Max slope point")}</span>
          <span className="analysisAfasLegendItem analysisAfasLegendItem--construction">{t("Vertical guides")}</span>
        </div>
        {model.constructionNote ? (
          <p className="analysisAfasConstructionNote">{t(model.constructionNote)}</p>
        ) : null}
        {!model.constructionNote && !model.hasPoints && model.emptyState ? (
          <p className="analysisAfasConstructionNote">{localizeDisplayString(model.emptyState.detail, language)}</p>
        ) : null}
      </figure>
    </div>
  );
}

function AnalysisAfasSummaryStrip({ model }: { model: AnalysisAfasModel }) {
  const language = useUiLanguage();
  return (
    <dl className="analysisAfasSummaryStrip">
      <AnalysisAfasSummaryValue label="AFAS status" value={uiStatus(language, model.summary.status)} />
      <AnalysisAfasSummaryValue label="AS" value={localizeDisplayString(model.summary.asLabel, language)} />
      <AnalysisAfasSummaryValue label="AF" value={localizeDisplayString(model.summary.afLabel, language)} />
      <AnalysisAfasSummaryValue label="ΔT" value={localizeDisplayString(model.summary.deltaLabel, language)} />
      <AnalysisAfasSummaryValue label="Max slope" value={localizeDisplayString(model.summary.maxSlopeLabel, language)} />
      <AnalysisAfasSummaryValue label="Raw points" value={model.summary.rawCountLabel} />
      <AnalysisAfasSummaryValue label="Smoothed points" value={model.summary.smoothedCountLabel} />
      <AnalysisAfasSummaryValue label="Outliers" value={localizeDisplayString(model.summary.outlierLabel, language)} />
    </dl>
  );
}

function AnalysisAfasSummaryValue({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useUiText();
  return (
    <div>
      <dt>{t(label)}</dt>
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
  const language = useUiLanguage();
  const labelBox = marker.labelBox;
  return (
    <g className={`analysisAfasReferenceMarker analysisAfasReferenceMarker--${marker.kind}`}>
      <line x1={marker.x} x2={marker.x} y1={plot.top} y2={plot.bottom} />
      <circle cx={marker.x} cy={marker.y} r={4.6} />
      {labelBox ? (
        <g className="analysisAfasReferenceMarkerLabel">
          <rect
            x={labelBox.x}
            y={labelBox.y}
            width={labelBox.width}
            height={labelBox.height}
            rx={5}
          />
          <text x={labelBox.textX} y={labelBox.textY} textAnchor="middle">
            {localizeDisplayString(labelBox.text, language)}
          </text>
        </g>
      ) : null}
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
  const t = useUiText();
  const labelX = marker.x > plot.right - 110 ? marker.x - 13 : marker.x + 13;
  const labelY = marker.y < plot.top + 28 ? marker.y + 30 : marker.y - 14;
  const textAnchor = labelX < marker.x ? "end" : "start";
  return (
    <g className="analysisAfasMaxSlopeMarker">
      <polygon points={`${marker.x},${marker.y - 8} ${marker.x + 8},${marker.y} ${marker.x},${marker.y + 8} ${marker.x - 8},${marker.y}`} />
      <text x={labelX} y={labelY} textAnchor={textAnchor}>
        {t(marker.label)}
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
  const language = useUiLanguage();
  const t = useUiText();
  const seriesLabel = target.source === "construction" ? t("AFAS construction guide") : t(target.label);
  const lines = language === "zh"
    ? [
        `序列：${seriesLabel}`,
        `温度：${target.temperature.toFixed(2)} °C`,
        `距离：${target.distance.toFixed(2)} 像素`,
        `帧序号：${target.frameIndex ?? t("None")}`
      ]
    : [
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
  targetTemperature,
  compact = false
}: {
  analysis: AnalysisResult;
  runId: string | null;
  isRunning: boolean;
  targetTemperature: number | null;
  compact?: boolean;
}) {
  const language = useUiLanguage();
  const t = useUiText();
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
      <RunValueStrip valueStrip={model.valueStrip} compact={compact} />
      <figure className="runTrendFigure">
        <figcaption>
          <span>{t(model.sourceLabel)}</span>
          <span>{isRunning ? t("Current run so far") : t("Full run")}</span>
        </figcaption>
        <IndustrialCurveView
          className="runTrendSvg"
          ariaLabel={t("Run temperature-distance trend chart")}
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
                {t("Target")} {targetTemperature?.toFixed(2)}°C
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
                {t("status rug: INVALID / stale / missing frames")}
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
                {formatRunTrendPointLabel(model.latestPoint, language)}
              </text>
            </g>
          ) : null}
          {model.formalPoints.length ? (
            <text
              className="runTrendInlineLabel"
              x={runTrendLineLabelPoint(model).x}
              y={runTrendLineLabelPoint(model).y}
            >
              {runTrendLineLabel(model.source, language)}
            </text>
          ) : null}
          {activePoint ? <RunTrendTooltip point={activePoint} plot={model.plot} /> : null}
          {!model.hasPoints ? (
            <CurveEmptyText
              emptyState={model.emptyState}
              fallback="No formal temperature-distance points"
              x={(model.plot.left + model.plot.right) / 2}
              y={(model.plot.top + model.plot.bottom) / 2}
            />
          ) : null}
        </IndustrialCurveView>
      </figure>
    </div>
  );
}

function CurveEmptyText({
  emptyState,
  fallback,
  x,
  y
}: {
  emptyState: TrendEmptyState | null;
  fallback: string;
  x: number;
  y: number;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const lines = emptyState ? trendEmptyStateLines(emptyState, language) : [t(fallback)];
  const firstY = y - Math.max(0, lines.length - 1) * 9;
  return (
    <text className="curveEmptyText" textAnchor="middle">
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} y={index === 0 ? firstY : undefined} dy={index === 0 ? 0 : 18}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function trendEmptyStateLines(emptyState: TrendEmptyState, language: UiLanguage): string[] {
  const diagnostic = trendEmptyStateDiagnosticLine(emptyState, language);
  if (language === "zh") {
    return [
      "暂无正式温度-距离点",
      "当前帧被判为温度滞后/无效；x 轴下方为状态标记",
      "状态标记不参与正式分析；请检查温控时间戳或调大同步容差",
      diagnostic
    ].filter((line) => line.length > 0);
  }
  return [
    emptyState.title,
    "Markers below the x axis are status markers, not the formal curve.",
    "Status markers are excluded from formal analysis; check timestamps or increase sync tolerance.",
    diagnostic
  ].filter((line) => line.length > 0);
}

function trendEmptyStateDiagnosticLine(emptyState: TrendEmptyState, language: UiLanguage): string {
  const parts: string[] = [];
  if (emptyState.syncStatus) {
    parts.push(language === "zh"
      ? `同步状态：${shortStatus(emptyState.syncStatus, language)}`
      : `sync status: ${emptyState.syncStatus}`);
  }
  if (emptyState.temperatureDeltaMs !== null) {
    parts.push(language === "zh"
      ? `Δt=${emptyState.temperatureDeltaMs.toFixed(0)} ms`
      : `Δt=${emptyState.temperatureDeltaMs.toFixed(0)} ms`);
  }
  if (emptyState.tempSyncTargetMs !== null) {
    parts.push(language === "zh"
      ? `容差=${emptyState.tempSyncTargetMs.toFixed(0)} ms`
      : `tolerance=${emptyState.tempSyncTargetMs.toFixed(0)} ms`);
  }
  return parts.join(language === "zh" ? "，" : ", ");
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

function RunValueStrip({
  valueStrip,
  compact = false
}: {
  valueStrip: ReturnType<typeof buildRunTrendModel>["valueStrip"];
  compact?: boolean;
}) {
  const language = useUiLanguage();
  return (
    <dl className="runValueStrip">
      <RunValue label="Current distance" value={formatNullableNumber(valueStrip.currentDistance, uiNumberSuffix(language, " px"), 1, language)} />
      <RunValue label="Current temperature" value={formatNullableNumber(valueStrip.currentTemperature, " °C", 2, language)} />
      <RunValue label="Frame" value={valueStrip.currentFrame?.toLocaleString() ?? uiNone(language)} />
      <RunValue label="Sync status" value={shortStatus(valueStrip.syncStatus, language)} tone={statusTone(valueStrip.syncStatus, "sync")} />
      {compact ? null : (
        <>
          <RunValue label="Sync Δt" value={formatNullableNumber(valueStrip.temperatureDeltaMs, " ms", 0, language)} tone={statusTone(valueStrip.syncStatus, "sync")} />
          <RunValue label="Sync tolerance" value={formatNullableNumber(valueStrip.tempSyncTargetMs, " ms", 0, language)} />
        </>
      )}
      <RunValue label="Valid / Invalid" value={shortStatus(valueStrip.detectionStatus, language)} tone={statusTone(valueStrip.detectionStatus, "detection")} />
      <RunValue label="Temp-distance points" value={valueStrip.points.toLocaleString()} />
    </dl>
  );
}

function RunValue({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const t = useUiText();
  return (
    <div className={tone ? `runValue runValue--${tone}` : "runValue"}>
      <dt>{t(label)}</dt>
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
  const language = useUiLanguage();
  const t = useUiText();
  const lines = language === "zh"
    ? [
        `帧序号：${point.frameIndex ?? t("None")}`,
        `温度：${point.temperature.toFixed(2)} °C`,
        `距离：${point.distance.toFixed(2)} 像素`,
        `同步状态：${shortStatus(point.syncStatus, language)}`,
        `检测状态：${shortStatus(point.detectionStatus ?? "VALID", language)}`,
        `序列：${runTrendLineLabel(point.source, language)}`
      ]
    : [
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

function formatRunTrendPointLabel(point: RunTrendPoint, language: UiLanguage = "en"): string {
  const prefix = point.frameIndex === null
    ? uiText(language, "curve point")
    : language === "zh"
      ? `${uiText(language, "frame")} ${point.frameIndex}`
      : `frame ${point.frameIndex}`;
  const distanceSuffix = language === "zh" ? "像素" : "px";
  return `${prefix} · ${point.temperature.toFixed(2)}°C · ${point.distance.toFixed(1)}${distanceSuffix}`;
}

function runTrendLineLabel(source: RunTrendPoint["source"], language: UiLanguage = "en"): string {
  if (source === "smoothed") return uiText(language, "backend smoothed curve");
  if (source === "grouped") return uiText(language, "backend binned curve");
  return uiText(language, "raw scatter");
}

function runTrendLineLabelPoint(model: ReturnType<typeof buildRunTrendModel>): { x: number; y: number } {
  const point = model.formalPoints[Math.max(0, Math.floor(model.formalPoints.length * 0.7))];
  if (!point) return { x: model.plot.left + 12, y: model.plot.top + 28 };
  return {
    x: Math.min(model.plot.right - 190, Math.max(model.plot.left + 12, point.x + 14)),
    y: point.y < model.plot.top + 48 ? point.y + 44 : point.y - 24
  };
}

function formatNullableNumber(value: number | null, suffix: string, digits: number, language: UiLanguage = "en"): string {
  return value === null || !Number.isFinite(value) ? uiNone(language) : `${value.toFixed(digits)}${suffix}`;
}

function shortStatus(status: string | null, language: UiLanguage = "en"): string {
  if (!status) return uiNone(language);
  if (language === "zh") return uiStatus(language, status);
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
  const t = useUiText();
  const width = 360;
  const height = 220;
  const localizedSpec = {
    ...spec,
    title: t(spec.title),
    xAxisLabel: t(spec.xAxisLabel),
    yAxisLabel: t(spec.yAxisLabel),
    overlays: spec.overlays
      ? {
          lines: spec.overlays.lines.map((line) => ({ ...line, label: t(line.label) })),
          markers: spec.overlays.markers.map((marker) => ({ ...marker, label: t(marker.label) }))
        }
      : undefined
  };
  const model = buildCurveViewModel(localizedSpec, width, height);
  const titleId = `curve-title-${spec.key}`;
  return (
    <figure className="curveView">
      <figcaption id={titleId}>{localizedSpec.title}</figcaption>
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
            {t("No data")}
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
          {model.referencePoints.length ? <span className="curveLegendItem curveLegendItem--raw">{t("Raw")}</span> : null}
          <span className="curveLegendItem curveLegendItem--smooth">{t("Smoothed")}</span>
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
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <div>
      <dt>{t(label)}</dt>
      <dd>{typeof value === "string" ? localizeDisplayString(value, language) : value}</dd>
    </div>
  );
}

function localizeDisplayString(value: string, language: UiLanguage): string {
  if (language === "en") return value;
  if (/^-?\d+(\.\d+)? px$/.test(value)) return value.replace(/ px$/, " 像素");
  if (/^-?\d+(\.\d+)? px\/°C$/.test(value)) return value.replace(/ px\/°C$/, " 像素/°C");
  if (/^\d+ frames$/.test(value)) return value.replace(" frames", " 帧");
  if (value === "A_BALLOON_ENVELOPE" || value === "C_BUNDLE_ENVELOPE" || value === "D_RESERVED_OBJECT") {
    return uiObjectClass(language, value);
  }
  if (value === "BalloonEnvelopeDetector" || value === "BundleEnvelopeDetector" || value === "ReservedObjectDetector") {
    return uiDetector(language, value);
  }
  if (value === "max_width" || value === "min_width") return uiWidthMode(language, value);
  return uiValue(language, value);
}

function localizeShapeChangeMessage(message: string, language: UiLanguage): string {
  if (language === "en") return message;
  const match = /^Frame shape changed from (.+) to (.+); confirm ROI before formal run\.$/.exec(message);
  if (match) return `画面尺寸由 ${match[1]} 变为 ${match[2]}；正式测量前请确认测量区域。`;
  return uiValue(language, message);
}

function localizeArtifactType(value: string, language: UiLanguage): string {
  if (language === "en") return value;
  const normalized = value.toLowerCase();
  if (normalized === "csv") return "CSV 表格";
  if (normalized === "json") return "JSON 记录";
  if (normalized === "png") return "PNG 图像";
  if (normalized.includes("overlay")) return "叠加图";
  if (normalized.includes("curve")) return "曲线图";
  return value;
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

function currentSourceProvenance({
  operatorDataSource,
  selectedDataset,
  cameraPreview,
  probe,
  liveRun,
  runResult
}: {
  operatorDataSource: OperatorDataSource;
  selectedDataset: OfflineDatasetListItem;
  cameraPreview: CameraPreviewResponse | null;
  probe: ProbeResponse | null;
  liveRun: LiveRunState | null;
  runResult: RunResponse | null;
}): SourceProvenance {
  if (operatorDataSource === "offline_dataset") {
    return (
      liveRun?.provenance ??
      runResult?.run_manifest.provenance ??
      runResult?.analysis_result.provenance ??
      probe?.provenance ??
      offlineFallbackProvenance(selectedDataset)
    );
  }
  return (
    liveRun?.provenance ??
    runResult?.run_manifest.provenance ??
    runResult?.analysis_result.provenance ??
    probe?.provenance ??
    cameraPreview?.provenance ??
    unknownFallbackProvenance()
  );
}

function sourceProvenanceWarning(
  provenance: SourceProvenance | null | undefined,
  language: UiLanguage
): string {
  const warningSource =
    provenance?.overall_kind === "imported" && provenance.imported_from_provenance
      ? provenance.imported_from_provenance
      : provenance;
  if (!warningSource) return "";
  if (warningSource.overall_kind === "mixed") {
    return uiText(
      language,
      "Mixed source mode is active. Some data comes from simulated devices; do not use as a formal test result."
    );
  }
  if (warningSource.overall_kind === "offline" || warningSource.overall_kind === "simulated") {
    return uiText(
      language,
      "Offline/simulated material is active. Use this only for UI or algorithm debugging; it is not real test data."
    );
  }
  if (provenanceNeedsSimulatedWarning(warningSource)) {
    return uiText(language, "Current source includes simulated hardware. Do not use this as real test data.");
  }
  return "";
}

function operatorStartButtonLabel(
  source: OperatorDataSource,
  provenance: SourceProvenance | null | undefined
): string {
  if (source === "offline_dataset" || provenance?.camera_is_simulated) {
    return "Start simulated test";
  }
  return "Start live test";
}

function operatorDatasetOptionLabel(dataset: OfflineDatasetListItem, language: UiLanguage): string {
  const captureId = dataset.label.includes("：")
    ? dataset.label.split("：").pop() || dataset.id
    : dataset.id.replace(/^golden_[ac]_/, "");
  if (language === "zh") {
    const prefix = dataset.object_class === "C_BUNDLE_ENVELOPE" ? "C 类多细支/多线束" : "A 类球囊/网状结构";
    return `${prefix}：${captureId}`;
  }
  const prefix = dataset.object_class === "C_BUNDLE_ENVELOPE" ? "C bundle" : "A balloon/mesh";
  return `${prefix}: ${captureId}`;
}

function offlineFallbackProvenance(dataset: OfflineDatasetListItem): SourceProvenance {
  return {
    acquisition_source: "offline_dataset",
    camera_backend: "offline_dataset",
    camera_backend_kind: "simulated_dataset",
    camera_is_simulated: true,
    camera_label: dataset.label || dataset.id,
    camera_serial: "",
    simulated_dataset_id: dataset.id,
    temperature_backend: "offline_temperature_csv",
    temperature_backend_kind: "simulated",
    temperature_is_simulated: true,
    overall_kind: "offline",
    display_label_zh: "离线/模拟素材",
    display_label_en: "Offline/simulated material"
  };
}

function unknownFallbackProvenance(): SourceProvenance {
  return {
    acquisition_source: "unknown",
    camera_backend: "",
    camera_backend_kind: "unknown",
    camera_is_simulated: false,
    camera_label: "",
    camera_serial: "",
    simulated_dataset_id: "",
    temperature_backend: "",
    temperature_backend_kind: "unknown",
    temperature_is_simulated: false,
    overall_kind: "unknown",
    display_label_zh: "未知来源",
    display_label_en: "Unknown source"
  };
}

function createInitialLiveRun(datasetId: string, startFrame: number, frameCount: number): LiveRunState {
  const totalFrames = Math.max(1, frameCount - startFrame + 1);
  const runId = `pending-${datasetId}-${Date.now()}`;
  return {
    runId,
    datasetId,
    operatorDataSource: "offline_dataset",
    provenance: null,
    status: "running",
    frameIndex: startFrame,
    frameUrl: frameIndexImageUrl(datasetId, startFrame, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount,
    totalFrames,
    processedFrames: 0,
    frameShape: null,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
}

function createInitialRealCameraLiveRun(): LiveRunState {
  const runId = `pending-real_camera-${Date.now()}`;
  return {
    runId,
    datasetId: "real_camera",
    operatorDataSource: "real_camera",
    provenance: null,
    status: "running",
    frameIndex: 0,
    frameUrl: "",
    frameCount: 0,
    totalFrames: 0,
    processedFrames: 0,
    frameShape: null,
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
    operatorDataSource: event.operator_data_source === "real_camera" ? "real_camera" : "offline_dataset",
    provenance: event.provenance ?? null,
    status: "running" as const,
    frameIndex: event.frame_index,
    frameUrl: apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: 0,
    frameShape: event.frame_record.shape,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
  const detection = detectionWithSyncConfig(event.detection_result, event.sync_config);
  const analysis = appendLiveAnalysis(
    previous.analysis,
    detection,
    event.curve_points,
    event.afas_preprocessing,
    event.afas_analysis,
    runId,
    event.sync_config
  );
  return {
    ...previous,
    runId,
    datasetId: event.dataset_id,
    operatorDataSource: event.operator_data_source === "real_camera" ? "real_camera" : event.operator_data_source === "offline_dataset" ? "offline_dataset" : previous.operatorDataSource,
    provenance: event.provenance ?? previous.provenance,
    status: "running",
    frameIndex: refreshPreview ? event.frame_index : previous.frameIndex,
    frameUrl: refreshPreview ? apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }) : previous.frameUrl,
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: event.processed_frames,
    frameShape: refreshPreview ? event.frame_record.shape : previous.frameShape,
    detectionResult: refreshPreview ? detection : previous.detectionResult,
    analysis
  };
}

function emptyAnalysis(runId: string): AnalysisResult {
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

function appendLiveAnalysis(
  analysis: AnalysisResult,
  detection: DetectionResult,
  curvePoints: LiveOfflineFrameEvent["curve_points"],
  afasPreprocessing: LiveOfflineFrameEvent["afas_preprocessing"],
  afasAnalysis: LiveOfflineFrameEvent["afas_analysis"],
  runId: string,
  syncConfig?: LiveOfflineFrameEvent["sync_config"]
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

function appendCurvePoint(points: CurvePoint[], point: CurvePoint | null): CurvePoint[] {
  return point ? [...points, point] : points;
}

function detectionWithSyncConfig(
  detection: DetectionResult,
  syncConfig?: LiveOfflineFrameEvent["sync_config"]
): DetectionResult {
  const tempSyncTargetMs = numberFromUnknown(syncConfig?.temp_sync_target_ms);
  return tempSyncTargetMs === null
    ? detection
    : { ...detection, temp_sync_target_ms: tempSyncTargetMs };
}

function analysisWithSyncConfigSnapshot(
  analysis: AnalysisResult,
  configSnapshot?: Record<string, unknown>
): AnalysisResult {
  const tempSyncTargetMs = numberFromUnknown(configSnapshot?.temp_sync_target_ms);
  if (tempSyncTargetMs === null) return analysis;
  return {
    ...analysis,
    sync_config: {
      ...analysis.sync_config,
      temp_sync_target_ms: tempSyncTargetMs
    },
    config_snapshot: configSnapshot,
    all_frames: analysis.all_frames.map((frame) => (
      frame.temp_sync_target_ms === undefined || frame.temp_sync_target_ms === null
        ? { ...frame, temp_sync_target_ms: tempSyncTargetMs }
        : frame
    ))
  };
}

function analysisForResultSource(analysis: AnalysisResult, source: DetectionResultSource): AnalysisResult {
  if (source === "raw") {
    return {
      ...analysis,
      all_frames: framesForResultSource(analysis.all_frames, source),
      distance_time: analysis.raw_distance_time?.length ? analysis.raw_distance_time : analysis.distance_time,
      temperature_distance: analysis.raw_temperature_distance?.length
        ? analysis.raw_temperature_distance
        : analysis.temperature_distance
    };
  }
  return {
    ...analysis,
    all_frames: framesForResultSource(analysis.all_frames, source),
    distance_time: analysis.stabilized_distance_time?.length ? analysis.stabilized_distance_time : analysis.distance_time,
    temperature_distance: analysis.stabilized_temperature_distance?.length
      ? analysis.stabilized_temperature_distance
      : analysis.temperature_distance
  };
}

function framesForResultSource(frames: DetectionResult[], source: DetectionResultSource): DetectionResult[] {
  return frames.map((frame) => ({
    ...frame,
    ab_points: abPointsForResultSource(frame, source),
    distance_px: distanceForResultSource(frame, source)
  }));
}

function abPointsForResultSource(
  result: DetectionResult | null,
  source: DetectionResultSource
): { a: ABPoint; b: ABPoint } | null {
  if (!result) return null;
  if (source === "raw") return result.raw_ab_points ?? result.ab_points;
  return result.stabilized_ab_points ?? result.ab_points;
}

function distanceForResultSource(result: DetectionResult | null, source: DetectionResultSource): number | null {
  if (!result) return null;
  if (source === "raw") return result.raw_distance_px ?? result.distance_px;
  return result.stabilized_distance_px ?? result.distance_px;
}

function liveRawDistancePoint(detection: DetectionResult): CurvePoint | null {
  const distance = detection.raw_distance_px;
  if (detection.detection_status !== "VALID" || distance == null) return null;
  return {
    x: detection.frame_timestamp_ms ?? detection.frame_index,
    y: distance,
    frame_index: detection.frame_index,
    sync_status: detection.temperature_sync_status
  };
}

function liveStabilizedDistancePoint(detection: DetectionResult): CurvePoint | null {
  const distance = detection.stabilized_distance_px;
  if (detection.detection_status !== "VALID" || distance == null) return null;
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
  if (detection.detection_status !== "VALID" || distance == null || detection.temperature_celsius == null) return null;
  if (!["TEMP_SYNC_OK", "TEMP_SYNC_INTERPOLATED"].includes(detection.temperature_sync_status)) return null;
  return {
    x: detection.temperature_celsius,
    y: distance,
    frame_index: detection.frame_index,
    sync_status: detection.temperature_sync_status
  };
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

function formatDistance(result: DetectionResult | null, source: DetectionResultSource = "stabilized", language: UiLanguage = "en"): string {
  const value = distanceForResultSource(result, source);
  return value == null ? uiNone(language) : `${value.toFixed(2)}${uiNumberSuffix(language, " px")}`;
}

function operatorProbeSummary(result: DetectionResult, language: UiLanguage): string {
  if (result.detection_status === "VALID") {
    return `${uiText(language, "Current frame probe valid")}: ${uiText(language, "Distance")} ${formatDistance(result, result.result_display_source ?? "stabilized", language)}`;
  }
  const reason = result.rejected_reason || result.detection_status || uiNone(language);
  return `${uiText(language, "Current frame probe invalid")}: ${localizeDisplayString(reason, language)}`;
}

function formatTemperature(result: DetectionResult | null, language: UiLanguage = "en"): string {
  return result?.temperature_celsius == null ? uiNone(language) : `${result.temperature_celsius.toFixed(2)} °C`;
}

function formatTemperatureValue(value: number | null, language: UiLanguage = "en"): string {
  return value == null || !Number.isFinite(value) ? uiNone(language) : `${value.toFixed(2)} °C`;
}

function formatTemperatureStatus(status: TemperatureStatusResponse | null): string {
  const value = status?.reading.celsius;
  return value == null || !Number.isFinite(value) ? "" : `${value.toFixed(2)} °C`;
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, value));
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
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
  if (typeof status === "string" && status !== "unavailable") return status;
  const result = readRecord(analysis.afas_analysis.result);
  const hasAfasValues =
    Number.isFinite(readNumber(result.As, Number.NaN)) &&
    Number.isFinite(readAfasAfValue(result));
  return hasAfasValues ? "ok" : typeof status === "string" ? status : "unavailable";
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

function formatOptionalNumber(value: unknown, suffix = "", language: UiLanguage = "en"): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : uiNone(language);
}

function formatOptionalInteger(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}` : "None";
}

function formatArrayCount(value: unknown): string {
  return Array.isArray(value) ? value.length.toLocaleString() : "0";
}

function formatDeltaT(start: unknown, end: unknown, language: UiLanguage = "en"): string {
  if (typeof start !== "number" || typeof end !== "number") return uiNone(language);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return uiNone(language);
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
