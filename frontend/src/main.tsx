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
  fetchRunExportBundle,
  frameIndexImageUrl,
  frameImageUrl,
  getHardwareSetupEnvironment,
  getHardwareProfile,
  getAppRuntime,
  getOperatorSourceStatus,
  getTemperatureStatus,
  getRun,
  getRunAvailability,
  getOfflineDatasetSummary,
  importRunExportFile,
  listHardwareCameras,
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
  saveHardwareBinding,
  stopRealCameraRun,
  streamLiveOfflineRun,
  streamRealCameraRun,
  testHardwareCamera,
  testHardwareBinding,
  testHardwareTemperature,
  type ABPoint,
  type ApiErrorDetail,
  type AfasAnalysisParameters,
  type AfasPreprocessingParameters,
  type AnalysisResult,
  type AppRuntime,
  type CameraPreviewResponse,
  type DetectionResult,
  type DiagnosticImages,
  type MeasurementDefinition,
  type MeasurementRegion,
  type RegionResult,
  type ExportArtifact,
  type HardwareBinding,
  type HardwareBindingSaveResponse,
  type HardwareCameraTestResponse,
  type HardwareBindingTestResponse,
  type HardwareCameraDevice,
  type HardwareSetupEnvironment,
  type HardwareTemperatureTestResponse,
  type ImportedRunView,
  type LiveOfflineAnalysisRegionEvent,
  type LiveOfflineFrameEvent,
  type LiveOfflineProgressEvent,
  type OfflineDatasetListItem,
  type OfflineDatasetSummary,
  type OperatorSourceStatus,
  type ProbeResponse,
  type RealCameraSetupProbeResponse,
  type RegionAnalysisResult,
  type RunResponse,
  type RotatedROI,
  type SerialPortInfo,
  type SourceProvenance,
  type TemperatureStatusResponse
} from "./api/client";
import {
  MAX_MEASUREMENT_REGIONS,
  addRegion,
  normalizeMeasurementRegions,
  removeRegion,
  renameRegion,
  toggleRegionEnabled,
  updateRegionRoi
} from "./measurementRegions";
import {
  appendLiveAnalysis,
  buildLiveRunDiagnostics,
  detectionWithSyncConfig,
  emptyAnalysis,
  emptyLiveRunDiagnostics,
  livePointStatusMessage,
  type LiveRunDiagnostics
} from "./liveRunAnalysis";
import {
  appendRegionFrameEvent,
  buildMultiRegionTrendModel,
  emptyRegionLiveState,
  regionTrendSourcesFromLiveState,
  type MultiRegionTrendModel,
  type MultiRegionTrendPoint,
  type RegionLiveStateById,
  type RegionTrendSource
} from "./multiRegionAnalysis";
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
  type LiveDisplaySmoothingOptions,
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
  uiDetectorMode,
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
  chooseExportDirectory,
  createIndexedDbExportDirectoryStore,
  isExportDirectoryPickerSupported,
  queryExportDirectoryPermission,
  writeBlobToDirectory
} from "./exportSaveTarget";
import {
  OPERATOR_TEMPERATURE_IDLE_POLL_MS,
  shouldAutoPollOperatorTemperature
} from "./operatorTemperaturePolling";
import {
  defaultPageForUiMode,
  navItemsForUiMode,
  normalizePageForUiMode,
  pageForSetupSourceEffects,
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
  statusMessage: string;
  frameIndex: number;
  frameUrl: string;
  frameCount: number;
  totalFrames: number;
  processedFrames: number;
  frameShape: number[] | null;
  detectionResult: DetectionResult | null;
  analysis: AnalysisResult;
  regionLiveStateById: RegionLiveStateById;
  analysisProgress: {
    current: number;
    total: number;
    regionId: string;
    regionLabel: string;
  } | null;
  diagnostics: LiveRunDiagnostics;
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
  contrast_threshold: 30,
  distance_outlier_filter_enabled: true,
  distance_outlier_reference_count: 5,
  distance_outlier_max_jump_px: 20,
  distance_outlier_baseline: "median" as const,
  save_temporal_masks: false,
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
const OPERATOR_SOURCE_STATUS_RETRY_DELAYS_MS = [5000, 10000, 30000] as const;

const OBJECT_CLASS_OPTIONS = [
  { value: "A_BALLOON_ENVELOPE", label: "A balloon envelope", detector: "BalloonEnvelopeDetector", widthMode: "max_width" as const },
  { value: "C_BUNDLE_ENVELOPE", label: "C bundle envelope", detector: "BundleEnvelopeDetector", widthMode: "max_width" as const },
  { value: "D_RESERVED_OBJECT", label: "D reserved object", detector: "ReservedObjectDetector", widthMode: "max_width" as const }
];

const C_DETECTOR_MODE_OPTIONS = [
  { value: "default", label: "Original envelope detection" },
  { value: "c_envelope_legacy", label: "Original envelope detection" },
  { value: "contrast_widest_span", label: "Contrast widest-span detection" }
] as const;

const DETECTOR_OPTIONS = [
  { value: "BalloonEnvelopeDetector", label: "BalloonEnvelopeDetector" },
  { value: "ContrastWidestSpanDetector", label: "ContrastWidestSpanDetector" },
  { value: "BundleEnvelopeDetector", label: "BundleEnvelopeDetector" },
  { value: "LegacyBundleEnvelopeDetector", label: "LegacyBundleEnvelopeDetector" },
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
  | "Distance outlier filter"
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
  { key: "contrast_threshold", label: "Contrast threshold", type: "float", min: 0, max: 255, step: 1, group: "Threshold", title: "Dark-object contrast below the ROI median background." },
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
  { key: "distance_outlier_filter_enabled", label: "Distance outlier filter", type: "bool", group: "Distance outlier filter", title: "Drops sudden distance jumps before live curves and AFAS analysis." },
  { key: "distance_outlier_max_jump_px", label: "Maximum allowed jump (px)", type: "float", min: 1, max: 200, step: 1, group: "Distance outlier filter", title: "Maximum accepted distance change from the recent valid baseline." },
  { key: "distance_outlier_reference_count", label: "Reference valid point count", type: "int", min: 1, max: 20, step: 1, group: "Distance outlier filter", advanced: true, title: "Number of recent accepted distances used to compute the baseline." },
  { key: "distance_outlier_baseline", label: "Distance outlier baseline", type: "select", group: "Distance outlier filter", advanced: true, options: [
    { value: "last", label: "Last valid" },
    { value: "mean", label: "Mean" },
    { value: "median", label: "Median" }
  ], title: "Baseline statistic used for distance jump filtering." },
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
  return "real_camera";
}

function persistOperatorDataSource(source: OperatorDataSource): void {
  try {
    window.localStorage.setItem(OPERATOR_SOURCE_STORAGE_KEY, source);
  } catch {
    return;
  }
}

function App() {
  const initialOperatorDataSource = useMemo(() => readInitialOperatorDataSource(), []);
  const uiMode: UiMode = "operator";
  const [page, setPage] = useState<Page>(() => defaultPageForUiMode("operator"));
  const [language, setLanguage] = useState<UiLanguage>(() => readInitialUiLanguage());
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const [appRuntime, setAppRuntime] = useState<AppRuntime | null>(null);
  const [setupSource, setSetupSource] = useState<SetupSourceKind>(initialOperatorDataSource);
  const [operatorDataSource, setOperatorDataSource] = useState<OperatorDataSource>(initialOperatorDataSource);
  const [datasets, setDatasets] = useState<OfflineDatasetListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<OfflineDatasetSummary | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementDefinition | null>(null);
  const [operatorSettings, setOperatorSettings] = useState<OperatorConfirmedSettings | null>(null);
  const [operatorStartMessage, setOperatorStartMessage] = useState("");
  const [operatorSourceStatus, setOperatorSourceStatus] = useState<OperatorSourceStatus | null>(null);
  const [operatorSourceStatusError, setOperatorSourceStatusError] = useState("");
  const [loadingOperatorSourceStatus, setLoadingOperatorSourceStatus] = useState(false);
  const [operatorSourceStatusLastCheckedAt, setOperatorSourceStatusLastCheckedAt] = useState<number | null>(null);
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
  const operatorSourceStatusRequestInFlightRef = useRef(false);
  const operatorSourceStatusAbortRef = useRef<AbortController | null>(null);
  const operatorSourceStatusRetryTimerRef = useRef<number | null>(null);
  const operatorSourceStatusRetryCountRef = useRef(0);
  const operatorTemperaturePollInFlightRef = useRef(false);
  const measurementRef = useRef<MeasurementDefinition | null>(null);
  const cameraPreviewModeRef = useRef<RealCameraPreviewMode>("live");
  const wasInRealCameraSetupRef = useRef(false);
  const pageForSetupEffects = pageForSetupSourceEffects(page);
  const operatorSourceRealHardwareAvailable = operatorSourceStatus?.real_hardware_available === true;
  const operatorTemperatureHardwareUnavailable =
    temperatureError !== null ||
    temperatureStatus?.temperature_status === "unavailable" ||
    Boolean(temperatureStatus?.reading.error);
  const operatorRealHardwareAvailable = operatorSourceRealHardwareAvailable && !operatorTemperatureHardwareUnavailable;

  useEffect(() => {
    void refreshAppRuntime();
    void refreshDatasets();
  }, []);

  useEffect(() => {
    if (appRuntime?.runtime_source !== "simulated_material") return;
    setOperatorDataSource("offline_dataset");
    setSetupSource("offline_dataset");
    if (appRuntime.simulated_dataset_id) {
      setSelectedId(appRuntime.simulated_dataset_id);
    }
  }, [appRuntime]);

  useEffect(() => {
    if (uiMode !== "operator" || operatorDataSource !== "real_camera") {
      clearOperatorSourceStatusRetry();
      operatorSourceStatusAbortRef.current?.abort();
      return;
    }
    void refreshOperatorSourceStatus({ reason: "initial" });
  }, [uiMode, operatorDataSource]);

  useEffect(() => {
    return () => {
      clearOperatorSourceStatusRetry();
      operatorSourceStatusAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (uiMode !== "operator" || operatorDataSource !== "real_camera") return;
    if (operatorSourceStatus == null) return;
    if (operatorSourceStatus.real_hardware_available) {
      return;
    }
    setCameraPreview(null);
    setCameraPreviewUrl("");
    setCameraPreviewError(null);
    setCameraPreviewRefreshStatus("unavailable");
    setCameraPreviewState((current) =>
      current
        ? {
            ...current,
            cameraStatus: "unavailable",
            mode: "live"
          }
        : current
    );
    setProbe((current) => (current?.dataset_id === "real_camera" ? null : current));
  }, [
    uiMode,
    operatorDataSource,
    operatorSourceStatus?.real_hardware_available
  ]);

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
    if (uiMode === "operator") return;
    if (temperatureStatus || temperatureError || checkingTemperature) return;
    void readCurrentTemperature();
  }, [
    pageForSetupEffects,
    setupSource,
    temperatureStatus,
    temperatureError,
    checkingTemperature,
    uiMode
  ]);

  useEffect(() => {
    if (!shouldAutoPollOperatorTemperature({
      uiMode,
      page,
      operatorDataSource,
      realTemperatureAvailable: operatorSourceStatus?.real_temperature_available === true,
      hasTemperatureError: operatorTemperatureHardwareUnavailable,
      runningCamera,
      runningOffline: running,
      hardwareSetupWizardOpen: deviceSetupOpen
    })) {
      return;
    }
    let cancelled = false;
    let id: number | null = null;
    async function tick() {
      if (cancelled) return;
      if (operatorTemperaturePollInFlightRef.current) return;
      operatorTemperaturePollInFlightRef.current = true;
      try {
        const ok = await readCurrentTemperature({
          quiet: true,
          port: operatorSettings?.serialPort ?? measurementRef.current?.detector_config.temperature_serial_port
        });
        if (!ok && !cancelled) {
          cancelled = true;
          if (id !== null) window.clearInterval(id);
        }
      } finally {
        operatorTemperaturePollInFlightRef.current = false;
      }
    }
    void tick();
    id = window.setInterval(tick, OPERATOR_TEMPERATURE_IDLE_POLL_MS);
    return () => {
      cancelled = true;
      if (id !== null) window.clearInterval(id);
    };
  }, [
    uiMode,
    page,
    operatorDataSource,
    operatorSourceStatus?.real_temperature_available,
    operatorTemperatureHardwareUnavailable,
    runningCamera,
    running,
    deviceSetupOpen,
    operatorSettings?.serialPort
  ]);

  useEffect(() => {
    if (uiMode === "operator") return;
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
    probing,
    uiMode
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

  function clearOperatorSourceStatusRetry() {
    if (operatorSourceStatusRetryTimerRef.current === null) return;
    window.clearTimeout(operatorSourceStatusRetryTimerRef.current);
    operatorSourceStatusRetryTimerRef.current = null;
  }

  function scheduleOperatorSourceStatusRetry() {
    if (uiMode !== "operator" || operatorDataSource !== "real_camera") return;
    if (operatorSourceStatusRetryTimerRef.current !== null) return;
    const delayMs = operatorSourceStatusRetryDelayMs(operatorSourceStatusRetryCountRef.current);
    operatorSourceStatusRetryCountRef.current += 1;
    operatorSourceStatusRetryTimerRef.current = window.setTimeout(() => {
      operatorSourceStatusRetryTimerRef.current = null;
      void refreshOperatorSourceStatus({ reason: "retry" });
    }, delayMs);
  }

  async function refreshOperatorSourceStatus(options: { reason?: "initial" | "manual" | "saved" | "retry" } = {}) {
    const reason = options.reason ?? "manual";
    const canReplaceInFlight = reason === "manual" || reason === "saved";
    if (operatorSourceStatusRequestInFlightRef.current) {
      if (!canReplaceInFlight) return;
      operatorSourceStatusAbortRef.current?.abort();
    }
    clearOperatorSourceStatusRetry();
    const controller = new AbortController();
    operatorSourceStatusAbortRef.current = controller;
    operatorSourceStatusRequestInFlightRef.current = true;
    setLoadingOperatorSourceStatus(true);
    if (reason !== "retry") setOperatorSourceStatusError("");
    try {
      const nextStatus = await getOperatorSourceStatus({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setOperatorSourceStatus((current) => (sameOperatorSourceStatus(current, nextStatus) ? current : nextStatus));
      setOperatorSourceStatusError("");
      setOperatorSourceStatusLastCheckedAt(Date.now());
      operatorSourceStatusRetryCountRef.current = 0;
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setOperatorSourceStatusError(err instanceof Error ? err.message : String(err));
      setOperatorSourceStatusLastCheckedAt(Date.now());
      scheduleOperatorSourceStatusRetry();
    } finally {
      if (operatorSourceStatusAbortRef.current === controller) {
        operatorSourceStatusAbortRef.current = null;
        operatorSourceStatusRequestInFlightRef.current = false;
        setLoadingOperatorSourceStatus(false);
      }
    }
  }

  async function refreshHardwareProfile() {
    await getHardwareProfile();
  }

  async function refreshAppRuntime() {
    try {
      const runtime = await getAppRuntime();
      setAppRuntime(runtime);
      const source = runtime.runtime_source === "simulated_material" ? "offline_dataset" : "real_camera";
      setOperatorDataSource(source);
      setSetupSource(source);
      if (runtime.simulated_dataset_id) setSelectedId(runtime.simulated_dataset_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeviceSetupSaved() {
    await refreshHardwareProfile();
    await refreshOperatorSourceStatus({ reason: "saved" });
    await refreshSerialPorts();
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
    const currentMeasurement = measurementRef.current ? toOperatorActualUseMeasurement(measurementRef.current) : null;
    if (!currentMeasurement) return;
    if (!operatorRealHardwareAvailable) {
      setOperatorStartMessage(t("Real hardware unavailable"));
      setError("");
      setProbe(null);
      return;
    }
    setProbing(true);
    setError("");
    try {
      const response = await probeRealCameraSetupFrame(currentMeasurement, {
        operatorMode: true,
        operatorDataSource: "real_camera"
      });
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
    if (appRuntime?.runtime_source === "simulated_material") {
      await runProbe(frameIndex);
      return;
    }
    if (!operatorRealHardwareAvailable) {
      setOperatorStartMessage(t("Real hardware unavailable"));
      setProbe(null);
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
    setLiveRun(createInitialLiveRun(
      selectedId,
      frameIndex,
      selectedDataset?.frame_count ?? frameIndex,
      measurementForRun
    ));
    const runPreviewFps = Math.round(clamp(Number(measurementForRun.detector_config.run_preview_fps ?? 5), 1, 30));
    const previewIntervalMs = 1000 / runPreviewFps;
    let lastPreviewUpdateMs = 0;
    const applyLiveFrameEvent = (event: LiveOfflineFrameEvent, forcePreview = false) => {
      const now = Date.now();
      const refreshPreview = forcePreview || now - lastPreviewUpdateMs >= previewIntervalMs;
      if (refreshPreview) lastPreviewUpdateMs = now;
      setLiveRun((current) => updateLiveRunFromFrame(current, event, { refreshPreview }));
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
          applyLiveFrameEvent(event);
        } else if (event.event === "complete") {
          liveRunIdRef.current = event.run_manifest.run_id;
          liveRunProcessedFramesRef.current = event.run_manifest.frame_records.length;
          setLiveRun((current) =>
            current
              ? {
                  ...current,
                  status: "complete",
                  operatorDataSource: event.run_manifest.operator_data_source === "real_camera" ? "real_camera" : "offline_dataset",
                  provenance: event.run_manifest.provenance ?? event.analysis_result.provenance ?? current.provenance,
                  statusMessage: "",
                  analysisProgress: null,
                  analysis: event.analysis_result,
                  processedFrames: event.run_manifest.frame_records.length,
                  totalFrames: event.run_manifest.frame_records.length
                }
              : current
          );
        } else if (event.event === "analyzing_region" || event.event === "analysis_region_complete") {
          setLiveRun((current) => updateLiveRunFromRegionAnalysis(current, event));
        } else if (isLiveProgressEvent(event)) {
          setLiveRun((current) => updateLiveRunFromProgress(current, event));
        }
      });
      setRunResult(response);
    } catch (err) {
      if (controller.signal.aborted) {
        setLiveRun((current) => (current ? { ...current, status: "stopped", statusMessage: "", analysisProgress: null } : current));
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
              statusMessage: "",
              analysisProgress: null,
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
    const canPreviewRealCamera =
      source === "real_camera" &&
      uiMode !== "operator";
    if (canPreviewRealCamera) {
      setCameraPreviewState((current) => resumeLivePreview(current));
      window.setTimeout(() => {
        if (measurementRef.current?.source === "real_camera") {
          void previewRealCameraFrame("live", { clearProbe: false });
        }
      }, 0);
    } else if (source === "real_camera" && uiMode === "operator") {
      setCameraPreview(null);
      setCameraPreviewUrl("");
      setCameraPreviewError(null);
      setCameraPreviewRefreshStatus("unavailable");
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
    if (appRuntime?.runtime_source === "simulated_material") {
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
    if (!operatorRealHardwareAvailable) {
      setOperatorStartMessage(t("Real hardware unavailable"));
      setError("");
      return;
    }
    const settings = operatorSettings ?? (measurement ? createOperatorSettingsDraft(measurement) : null);
    const validation = validateOperatorStart({
      cameraOk: operatorRealHardwareAvailable,
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
    const confirmedMeasurement = toOperatorActualUseMeasurement({
      ...applyConfirmedSettingsToMeasurement(measurement, settings),
      source: "real_camera" as const
    });
    applyMeasurement(confirmedMeasurement);
    setOperatorStartMessage("");
    void startRealCameraRunWithMeasurement(confirmedMeasurement, {
      operatorMode: true,
      operatorDataSource: "real_camera"
    });
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
    if (uiMode === "operator" && operatorDataSource === "real_camera" && !operatorRealHardwareAvailable) {
      setCameraPreview(null);
      setCameraPreviewUrl("");
      setCameraPreviewError(null);
      setCameraPreviewRefreshStatus("unavailable");
      return false;
    }
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

  async function readCurrentTemperature(options: { quiet?: boolean; port?: string | null } = {}): Promise<boolean> {
    if (
      uiMode === "operator" &&
      operatorDataSource === "real_camera" &&
      operatorSourceStatus?.real_temperature_available !== true
    ) {
      return false;
    }
    setCheckingTemperature(true);
    if (!options.quiet) setError("");
    setTemperatureError(null);
    try {
      setTemperatureStatus(
        await getTemperatureStatus({
          port: options.port ?? measurementRef.current?.detector_config.temperature_serial_port
        })
      );
      return true;
    } catch (err) {
      if (!options.quiet) setError(err instanceof Error ? err.message : String(err));
      setTemperatureError(temperatureErrorFromUnknown(err));
      setTemperatureStatus(null);
      return false;
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

  async function startRealCameraRunWithMeasurement(
    measurementForRun: MeasurementDefinition,
    options: { operatorMode?: boolean; operatorDataSource?: OperatorDataSource } = {}
  ) {
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunningCamera(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    liveRunIdRef.current = null;
    liveRunProcessedFramesRef.current = 0;
    setLiveRun(createInitialRealCameraLiveRun(measurementForRun));
    const runPreviewFps = Math.round(clamp(Number(measurementForRun.detector_config.run_preview_fps ?? 5), 1, 30));
    const previewIntervalMs = 1000 / runPreviewFps;
    let lastPreviewUpdateMs = 0;
    const applyLiveFrameEvent = (event: LiveOfflineFrameEvent, forcePreview = false) => {
      const now = Date.now();
      const refreshPreview = forcePreview || now - lastPreviewUpdateMs >= previewIntervalMs;
      if (refreshPreview) lastPreviewUpdateMs = now;
      setLiveRun((current) => updateLiveRunFromFrame(current, event, { refreshPreview }));
    };

    try {
      await releaseRealCameraSetupPreview({ surfaceError: true });
      const response = await streamRealCameraRun(measurementForRun, {
        targetFps: measurementForRun.detector_config.live_offline_fps ?? 8,
        cameraProfile: buildRealCameraRunCameraProfile(measurementForRun),
        signal: controller.signal,
        operatorMode: options.operatorMode,
        operatorDataSource: options.operatorDataSource
      }, (event) => {
        if (event.event === "frame") {
          liveRunIdRef.current = event.run_id;
          liveRunProcessedFramesRef.current = event.processed_frames;
          applyLiveFrameEvent(event);
        } else if (event.event === "complete") {
          liveRunIdRef.current = event.run_manifest.run_id;
          liveRunProcessedFramesRef.current = event.run_manifest.frame_records.length;
          setLiveRun((current) =>
            current
              ? {
                  ...current,
                  status: "complete",
                  operatorDataSource: event.run_manifest.operator_data_source === "offline_dataset" ? "offline_dataset" : "real_camera",
                  provenance: event.run_manifest.provenance ?? event.analysis_result.provenance ?? current.provenance,
                  statusMessage: "",
                  analysisProgress: null,
                  analysis: event.analysis_result,
                  processedFrames: event.run_manifest.frame_records.length,
                  totalFrames: event.run_manifest.frame_records.length,
                  frameShape:
                    event.run_manifest.frame_records[event.run_manifest.frame_records.length - 1]?.shape ??
                    current.frameShape
                }
              : current
          );
        } else if (event.event === "analyzing_region" || event.event === "analysis_region_complete") {
          setLiveRun((current) => updateLiveRunFromRegionAnalysis(current, event));
        } else if (isLiveProgressEvent(event)) {
          setLiveRun((current) => updateLiveRunFromProgress(current, event));
        }
      });
      setRunResult(response);
    } catch (err) {
      if (controller.signal.aborted) {
        setLiveRun((current) => (current ? { ...current, status: "stopped", statusMessage: "", analysisProgress: null } : current));
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
              statusMessage: "",
              analysisProgress: null,
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
          {navItemsForUiMode("operator").map((item) => (
            <TabButton page={item.page} current={page} onSelect={setPage} icon={pageIcon(item.page)} key={item.page}>
              {t(item.label)}
            </TabButton>
          ))}
        </nav>
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
        {appRuntime?.runtime_source !== "simulated_material" ? <button className="iconButton" onClick={() => setDeviceSetupOpen(true)} type="button" title={t("Device setup")}>
          <Settings size={17} aria-hidden="true" />
        </button> : null}
        <button className="iconButton" onClick={refreshDatasets} type="button" title={t("Refresh")}>
          <RefreshCcw size={17} aria-hidden="true" />
        </button>
      </header>

      <section className="workspace operatorWorkspace">

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
              appRuntime={appRuntime}
              operatorSourceStatus={operatorSourceStatus}
              operatorSourceStatusError={operatorSourceStatusError}
              loadingOperatorSourceStatus={loadingOperatorSourceStatus}
              operatorSourceStatusLastCheckedAt={operatorSourceStatusLastCheckedAt}
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
              onRefreshOperatorSourceStatus={() => void refreshOperatorSourceStatus({ reason: "manual" })}
              onOpenDeviceSetup={() => setDeviceSetupOpen(true)}
              page={page}
            />
          ) : null}
        </section>
      </section>
      {appRuntime?.runtime_source !== "simulated_material" ? <DeviceSetupWizard
        open={deviceSetupOpen}
        onClose={() => setDeviceSetupOpen(false)}
        onSaved={handleDeviceSetupSaved}
      /> : null}
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
  appRuntime,
  operatorSourceStatus,
  operatorSourceStatusError,
  loadingOperatorSourceStatus,
  operatorSourceStatusLastCheckedAt,
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
  onRefreshOperatorSourceStatus,
  onOpenDeviceSetup,
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
  appRuntime: AppRuntime | null;
  operatorSourceStatus: OperatorSourceStatus | null;
  operatorSourceStatusError: string;
  loadingOperatorSourceStatus: boolean;
  operatorSourceStatusLastCheckedAt: number | null;
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
  onRefreshOperatorSourceStatus: () => void;
  onOpenDeviceSetup: () => void;
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
    onMeasurement(updatePrimaryMeasurementRoi(measurement, roi));
  }

  function commitRoi(roi: RotatedROI) {
    onMeasurement(updatePrimaryMeasurementRoi(measurement, roi));
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
    onMeasurement(updatePrimaryMeasurementRoi(measurement, nextRoi));
    scheduleRealCameraSetupRefresh({ kind: "roi" });
  }

  if (isOperatorRun) {
    return (
      <OperatorRunPage
        appRuntime={appRuntime}
        measurement={measurement}
        onMeasurement={onMeasurement}
        onPreviewAffectingChange={(change) => scheduleRealCameraSetupRefresh(change)}
        cameraPreview={cameraPreview}
        cameraPreviewUrl={cameraPreviewUrl}
        cameraPreviewError={cameraPreviewError}
        cameraPreviewRefreshStatus={cameraPreviewRefreshStatus}
        cameraPreviewState={cameraPreviewState}
        activeSourceShape={activeSourceShape}
        operatorSourceStatus={operatorSourceStatus}
        operatorSourceStatusError={operatorSourceStatusError}
        loadingOperatorSourceStatus={loadingOperatorSourceStatus}
        operatorSourceStatusLastCheckedAt={operatorSourceStatusLastCheckedAt}
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
        onRefreshSerialPorts={onRefreshSerialPorts}
        onRefreshOperatorSourceStatus={onRefreshOperatorSourceStatus}
        onOpenDeviceSetup={onOpenDeviceSetup}
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
            measurementSegment={displayedProbe?.detection_result.measurement_segment ?? null}
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
  appRuntime,
  measurement,
  onMeasurement,
  onPreviewAffectingChange,
  cameraPreview,
  cameraPreviewUrl,
  cameraPreviewError,
  cameraPreviewRefreshStatus,
  cameraPreviewState,
  activeSourceShape,
  operatorSourceStatus,
  operatorSourceStatusError,
  loadingOperatorSourceStatus,
  operatorSourceStatusLastCheckedAt,
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
  onRefreshSerialPorts,
  onRefreshOperatorSourceStatus,
  onOpenDeviceSetup
}: {
  appRuntime: AppRuntime | null;
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange: (change: RealCameraSetupChange) => void;
  cameraPreview: CameraPreviewResponse | null;
  cameraPreviewUrl: string;
  cameraPreviewError: CameraPreviewError | null;
  cameraPreviewRefreshStatus: PreviewRefreshStatus;
  cameraPreviewState: RealCameraPreviewState | null;
  activeSourceShape: number[];
  operatorSourceStatus: OperatorSourceStatus | null;
  operatorSourceStatusError: string;
  loadingOperatorSourceStatus: boolean;
  operatorSourceStatusLastCheckedAt: number | null;
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
  onRefreshSerialPorts: () => void;
  onRefreshOperatorSourceStatus: () => void;
  onOpenDeviceSetup: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const normalizedMeasurement = useMemo(
    () => normalizeMeasurementRegions(measurement),
    [measurement]
  );
  const [activeRegionId, setActiveRegionId] = useState(
    () => normalizedMeasurement.regions[0].region_id
  );
  const latestAnalysis = liveRun?.analysis ?? runResult?.analysis_result ?? null;
  const operatorRunActive = runningCamera || runningOffline;
  const simulatedMode = appRuntime?.runtime_source === "simulated_material";
  const temperatureHardwareMessage =
    temperatureError?.message ??
    (temperatureStatus?.temperature_status === "unavailable" ? temperatureStatus.reading.error : "");
  const temperatureHardwareUnavailable = Boolean(temperatureHardwareMessage);
  const realHardwareAvailable = operatorSourceStatus?.real_hardware_available === true && !temperatureHardwareUnavailable;
  const sourceAvailable = simulatedMode || realHardwareAvailable;
  const runtimeConfigurationError = operatorSourceStatus?.configuration_valid === false
    ? language === "zh"
      ? operatorSourceStatus.configuration_error_zh
      : operatorSourceStatus.configuration_error_en
    : "";
  const realHardwareError = runtimeConfigurationError || operatorSourceStatusError || temperatureHardwareMessage;
  const canShowCurrentSourceData = sourceAvailable;
  useEffect(() => {
    if (normalizedMeasurement.regions.some((region) => region.region_id === activeRegionId)) return;
    setActiveRegionId(normalizedMeasurement.regions[0].region_id);
  }, [activeRegionId, normalizedMeasurement.regions]);
  const setupProbeDetection = canShowCurrentSourceData && !operatorRunActive && probe ? probe.detection_result : null;
  const latestRunResultDetection = canShowCurrentSourceData && runResult?.run_manifest.detection_results.length
    ? runResult.run_manifest.detection_results[runResult.run_manifest.detection_results.length - 1]
    : null;
  const latestDetection =
    (canShowCurrentSourceData ? liveRun?.detectionResult : null) ??
    setupProbeDetection ??
    latestRunResultDetection;
  const latestRunRegionDetections = runResult?.run_manifest.region_detection_results ?? [];
  const latestRunRegionResults = normalizedMeasurement.regions.flatMap((region) => {
    const detection = [...latestRunRegionDetections]
      .reverse()
      .find((candidate) => candidate.region_id === region.region_id);
    return detection ? [regionResultFromDetection(region, detection)] : [];
  });
  const liveRegionResults = Object.values(liveRun?.regionLiveStateById ?? {})
    .flatMap((state) => state.latestResult ? [state.latestResult] : []);
  const latestRegionResults = canShowCurrentSourceData
    ? !operatorRunActive && probe?.region_results?.length
      ? probe.region_results
      : liveRegionResults.length
        ? liveRegionResults
        : latestRunRegionResults
    : [];
  const regionResultsById = Object.fromEntries(
    latestRegionResults.map((result) => [result.region_id, result])
  ) as Record<string, RegionResult>;
  const frameRegionOverlays: FrameCanvasRegionOverlay[] = normalizedMeasurement.regions
    .filter((region) => region.enabled)
    .map((region) => ({
      region,
      detection: regionResultsById[region.region_id]?.detection_result ?? null
    }));
  const setupProbeFrameUrl = setupProbeDetection ? probe?.image_data_url ?? cameraPreviewUrl : "";
  const latestRunResultFrameUrl = canShowCurrentSourceData && runResult?.run_manifest.run_id && latestRunResultDetection
    ? runFrameImageUrl(runResult.run_manifest.run_id, latestRunResultDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
    : "";
  const latestFrameUrl =
    canShowCurrentSourceData
      ? liveRun?.frameUrl ??
        (setupProbeFrameUrl || latestRunResultFrameUrl || cameraPreviewUrl)
      : "";
  const latestFrameShape =
    liveRun?.frameShape ??
    (setupProbeDetection ? probe?.frame.shape ?? cameraPreview?.shape ?? activeSourceShape : null) ??
    runResult?.run_manifest.frame_records[runResult.run_manifest.frame_records.length - 1]?.shape ??
    activeSourceShape;
  const runtimeFrameLabel = simulatedMode ? t("Simulated material debug") : t("Real camera");
  const latestFrameTitle = liveRun?.detectionResult
    ? `${runtimeFrameLabel} · ${t("frame")} ${liveRun.detectionResult.frame_index}`
    : setupProbeDetection
      ? `${t("Current frame probe")} · ${t("frame")} ${setupProbeDetection.frame_index}`
    : latestDetection
        ? `${runtimeFrameLabel} · ${t("frame")} ${latestDetection.frame_index}`
        : runtimeFrameLabel;
  const serialPortOptions = uniqueStrings([
    operatorSettings.serialPort ?? "",
    measurement.detector_config.temperature_serial_port ?? "",
    ...serialPorts.map((port) => port.device || port.name)
  ]);
  const currentTemperature = operatorRunActive
    ? latestDetection?.temperature_celsius ?? temperatureStatus?.reading.celsius ?? null
    : temperatureStatus?.reading.celsius ?? latestDetection?.temperature_celsius ?? null;
  const cameraOk = realHardwareAvailable && (cameraPreview?.camera_status ?? cameraPreviewState?.cameraStatus ?? "ok") === "ok";
  const hasMeasurementRoi = normalizedMeasurement.regions
    .filter((region) => region.enabled)
    .every((region) => region.roi.width > 0 && region.roi.height > 0);
  const probeCurrentFrameDisabled =
    probing || operatorRunActive || !hasMeasurementRoi || !sourceAvailable;
  const setupProbeSummary = setupProbeDetection ? operatorProbeSummary(setupProbeDetection, language) : "";
  const startDisabled = operatorRunActive || !sourceAvailable;
  const sourceBadgeLabel = simulatedMode
    ? "Simulated material debug"
    : realHardwareAvailable
      ? "Real hardware ready"
      : "Real hardware unavailable";
  const completedRegionTrendSources = analysisRegionTrendSources(latestAnalysis);
  const liveRegionTrendSources = regionTrendSourcesFromLiveState(liveRun?.regionLiveStateById ?? {});
  const multiRegionTrendSources = liveRun ? liveRegionTrendSources : completedRegionTrendSources;

  function changeRegionRoi(regionId: string, roi: RotatedROI) {
    if (operatorRunActive) return;
    onMeasurement(updateRegionRoi(normalizedMeasurement, regionId, roi));
  }

  return (
    <div className="operatorRunGrid">
      <section className="toolPanel operatorControlPanel">
        <div className="operatorModeHeader">
          <h2>{simulatedMode ? t("Simulated test") : t("Real camera test")}</h2>
          <span className={sourceAvailable ? "operatorSourceBadge" : "operatorSourceBadge warning"}>
            {t(sourceBadgeLabel)}
          </span>
        </div>
        {simulatedMode ? (
          <div className="statusBlock warning">
            {t("Simulated material debug mode is active. This is not real test data.")}
          </div>
        ) : null}
        {!simulatedMode && !realHardwareAvailable ? (
          <RealHardwareUnavailableCard
            loading={loadingOperatorSourceStatus}
            lastCheckedAt={operatorSourceStatusLastCheckedAt}
            sourceStatus={operatorSourceStatus}
            statusError={realHardwareError}
            onRecheck={onRefreshOperatorSourceStatus}
            onOpenDeviceSetup={onOpenDeviceSetup}
          />
        ) : null}
        <OperatorDetectionParameterPanel
          disabled={operatorRunActive}
          measurement={normalizedMeasurement}
          onMeasurement={onMeasurement}
          onPreviewAffectingChange={onPreviewAffectingChange}
        />
        <OperatorMeasurementPositionsPanel
          activeRegionId={activeRegionId}
          disabled={operatorRunActive}
          measurement={normalizedMeasurement}
          regionLiveStateById={liveRun?.regionLiveStateById ?? {}}
          regionResultsById={regionResultsById}
          setActiveRegionId={setActiveRegionId}
          onMeasurement={onMeasurement}
          onPreviewAffectingChange={onPreviewAffectingChange}
          onResetActiveRoi={() => {
            changeRegionRoi(activeRegionId, createDefaultRoiForShape(activeSourceShape));
            onPreviewAffectingChange({ kind: "roi" });
          }}
        />
        <div className="controlStack operatorCameraStatus">
          <h3>{t("Camera")}</h3>
          {cameraPreviewError && !cameraOk && realHardwareAvailable ? <div className="inlineError">{cameraPreviewError.message}</div> : null}
          <button
            className="primaryButton"
            disabled={probeCurrentFrameDisabled}
            onClick={onProbeRealCameraSetup}
            title={!sourceAvailable ? t("Real hardware unavailable") : undefined}
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
          operatorRunActive={operatorRunActive}
          mode={simulatedMode ? "offline_dataset" : realHardwareAvailable ? "real_camera_available" : "real_camera_unavailable"}
          onPatch={onOperatorSettingsPatch}
          onConfirm={onOperatorSettingsConfirm}
          onRefreshSerialPorts={onRefreshSerialPorts}
        />
        {operatorStartMessage ? <div className="inlineWarning">{operatorStartMessage}</div> : null}
        {liveRun?.analysisProgress ? (
          <div className="statusBlock operatorAnalysisProgress">
            {analysisProgressLabel(liveRun.analysisProgress, language)}
          </div>
        ) : null}
        <div className="operatorRunActions">
          <button
            className="primaryButton"
            disabled={startDisabled}
            onClick={onOperatorStartRun}
            title={!sourceAvailable ? t("Real hardware unavailable") : undefined}
            type="button"
          >
            <Play size={16} aria-hidden="true" />
            {operatorRunActive ? t("Running") : simulatedMode ? t("Start simulated test") : t("Start live test")}
          </button>
          <button className="secondaryButton" disabled={!operatorRunActive} onClick={onStopRun} type="button">
            <Square size={16} aria-hidden="true" />
            {t("Stop test")}
          </button>
        </div>
      </section>
      <section className="operatorVisualStack">
        {!simulatedMode && !realHardwareAvailable ? (
          <RealHardwareUnavailableCard
            loading={loadingOperatorSourceStatus}
            lastCheckedAt={operatorSourceStatusLastCheckedAt}
            sourceStatus={operatorSourceStatus}
            statusError={realHardwareError}
            onRecheck={onRefreshOperatorSourceStatus}
            onOpenDeviceSetup={onOpenDeviceSetup}
          />
        ) : latestFrameUrl ? (
          <FrameCanvas
            title={latestFrameTitle}
            imageUrl={latestFrameUrl}
            sourceShape={latestFrameShape}
            roi={normalizedMeasurement.roi}
            abPoints={latestDetection?.ab_points ?? null}
            measurementSegment={latestDetection?.measurement_segment ?? null}
            debugArtifacts={latestDetection?.debug_artifacts ?? null}
            regions={frameRegionOverlays}
            activeRegionId={activeRegionId}
            onRegionRoiChange={operatorRunActive ? undefined : changeRegionRoi}
            onRegionRoiCommit={operatorRunActive ? undefined : (regionId, roi) => {
              changeRegionRoi(regionId, roi);
              onPreviewAffectingChange({ kind: "roi" });
            }}
            readOnly={operatorRunActive}
          />
        ) : (
              <PreviewPlaceholder
                title={runtimeFrameLabel}
            refreshStatus={cameraPreviewRefreshStatus}
            previewError={cameraPreviewError}
          />
        )}
        {!sourceAvailable ? null : (
        <section className="toolPanel operatorTrendPanel">
          <div className="runTrendHeader">
            <div>
              <h2>{t("Live Trend")}</h2>
              <p>{t(sourceBadgeLabel)}</p>
            </div>
            <div className="runTrendStatusLabel">{liveRun?.status === "running" ? t("Current run so far") : t("Full run")}</div>
          </div>
          {multiRegionTrendSources.length ? (
            <MultiRegionTrendChart
              sources={multiRegionTrendSources}
              isRunning={liveRun?.status === "running"}
              targetTemperature={measurement.detector_config.target_temperature_celsius ?? null}
            />
          ) : (
            <div className="statusBlock">{t("No formal temperature-distance points operator")}</div>
          )}
        </section>
        )}
      </section>
    </div>
  );
}

function OperatorMeasurementPositionsPanel({
  activeRegionId,
  disabled,
  measurement,
  regionLiveStateById,
  regionResultsById,
  setActiveRegionId,
  onMeasurement,
  onPreviewAffectingChange,
  onResetActiveRoi
}: {
  activeRegionId: string;
  disabled: boolean;
  measurement: MeasurementDefinition;
  regionLiveStateById: RegionLiveStateById;
  regionResultsById: Record<string, RegionResult>;
  setActiveRegionId: (regionId: string) => void;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange: (change: RealCameraSetupChange) => void;
  onResetActiveRoi: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const regions = measurement.regions ?? [];
  const activeRegion = regions.find((region) => region.region_id === activeRegionId) ?? regions[0];
  const enabledCount = regions.filter((region) => region.enabled).length;

  function selectActiveRegion(regionId: string) {
    setActiveRegionId(regionId);
  }

  function addMeasurementPosition() {
    const next = addRegion(measurement);
    const nextRegion = next.regions[next.regions.length - 1];
    onMeasurement(next);
    setActiveRegionId(nextRegion.region_id);
  }

  function deleteMeasurementPosition(regionId: string) {
    const next = removeRegion(measurement, regionId);
    onMeasurement(next);
    if (regionId === activeRegionId) {
      setActiveRegionId(next.regions[0].region_id);
    }
  }

  return (
    <div className="controlStack operatorMeasurementPositions">
      <div className="operatorPositionHeader">
        <h3>{t("Measurement positions")}</h3>
        <span>{t("Enabled positions")}: {enabledCount}</span>
      </div>
      {disabled ? <div className="inlineWarning">{t("Test running positions locked")}</div> : null}
      <div className="operatorPositionList">
        {regions.map((region) => {
          const result = regionResultsById[region.region_id];
          const liveState = regionLiveStateById[region.region_id];
          const pointCount = liveState?.formalPointCount ??
            result?.live_point_status?.temperature_distance_point_count ??
            0;
          const missingPointMessage = livePointStatusMessage(
            result?.live_point_status ?? liveState?.latestMissingReason
          );
          const isActive = region.region_id === activeRegionId;
          const cannotDisable = region.enabled && enabledCount <= 1;
          return (
            <article
              className={isActive ? "operatorPositionCard active" : "operatorPositionCard"}
              key={region.region_id}
              style={{ "--region-color": region.color } as React.CSSProperties}
            >
              <div className="operatorPositionTitleRow">
                <button
                  className="operatorPositionSelect"
                  disabled={disabled}
                  onClick={() => selectActiveRegion(region.region_id)}
                  type="button"
                >
                  <span className="regionColorSwatch" style={{ backgroundColor: region.color }} />
                  {isActive ? `${t("Active edit position")}: ` : ""}
                  {measurementRegionDisplayLabel(region, language)}
                </button>
                <label className="operatorPositionEnabled">
                  <input
                    checked={region.enabled}
                    disabled={disabled || cannotDisable}
                    onChange={(event) =>
                      onMeasurement(toggleRegionEnabled(measurement, region.region_id, event.target.checked))
                    }
                    type="checkbox"
                  />
                  {t(region.enabled ? "Enabled" : "Disabled")}
                </label>
              </div>
              <label className="field compactField">
                <span>{t("Position")}</span>
                <input
                  defaultValue={region.label}
                  disabled={disabled}
                  key={`${region.region_id}:${region.label}`}
                  onBlur={(event) => {
                    const nextLabel = event.currentTarget.value.trim();
                    if (!nextLabel) {
                      event.currentTarget.value = region.label;
                      return;
                    }
                    if (nextLabel !== region.label) {
                      onMeasurement(renameRegion(measurement, region.region_id, nextLabel));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <dl className="operatorPositionMetrics">
                <Metric label="Current distance" value={formatDistance(result?.detection_result ?? null, "stabilized", language)} />
                <Metric label="Current status" value={result?.detection_result.detection_status ?? t("No data")} />
                <Metric label="Formal points" value={pointCount.toLocaleString()} />
                <Metric
                  label="Latest formal frame"
                  value={liveState?.lastFormalFrameIndex ?? result?.curve_points.temperature_distance?.frame_index ?? t("No data")}
                />
              </dl>
              {missingPointMessage ? (
                <div className="operatorPositionEmpty">{t(missingPointMessage)}</div>
              ) : !pointCount ? (
                <div className="operatorPositionEmpty">{t("No formal points for this position")}</div>
              ) : null}
              <div className="buttonPair operatorPositionActions">
                <button
                  className="secondaryButton compactButton"
                  disabled={disabled || !region.enabled}
                  onClick={() => selectActiveRegion(region.region_id)}
                  type="button"
                >
                  {t("Edit ROI")}
                </button>
                <button
                  className="secondaryButton compactButton dangerButton"
                  disabled={disabled || regions.length <= 1}
                  onClick={() => deleteMeasurementPosition(region.region_id)}
                  title={regions.length <= 1 ? t("At least one measurement position is required") : undefined}
                  type="button"
                >
                  {t("Delete position")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <button
        className="secondaryButton"
        disabled={disabled || regions.length >= MAX_MEASUREMENT_REGIONS}
        onClick={addMeasurementPosition}
        title={regions.length >= MAX_MEASUREMENT_REGIONS ? t("Up to 6 measurement positions are supported") : undefined}
        type="button"
      >
        {t("Add position")}
      </button>
      {regions.length >= MAX_MEASUREMENT_REGIONS ? (
        <div className="operatorPositionLimit">{t("Up to 6 measurement positions are supported")}</div>
      ) : null}
      {activeRegion ? (
        <details className="operatorRoiDisclosure" open>
          <summary>{t("Edit ROI")}: {measurementRegionDisplayLabel(activeRegion, language)}</summary>
          <MeasurementControls
            disabled={disabled}
            measurement={{ ...measurement, roi: activeRegion.roi }}
            onMeasurement={onMeasurement}
            onResetRoi={onResetActiveRoi}
            onPreviewAffectingChange={onPreviewAffectingChange}
            regionId={activeRegion.region_id}
          />
        </details>
      ) : null}
    </div>
  );
}

function OperatorDetectionParameterPanel({
  disabled,
  measurement,
  onMeasurement,
  onPreviewAffectingChange
}: {
  disabled: boolean;
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange: (change: RealCameraSetupChange) => void;
}) {
  const t = useUiText();
  const contrast_threshold = measurement.detector_config.contrast_threshold ?? DEFAULT_CONFIG.contrast_threshold;
  const distance_outlier_max_jump_px =
    measurement.detector_config.distance_outlier_max_jump_px ?? DEFAULT_CONFIG.distance_outlier_max_jump_px;

  function patchDetectorConfig(patch: Partial<MeasurementDefinition["detector_config"]>) {
    onMeasurement(toOperatorActualUseMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        ...patch,
        distance_outlier_filter_enabled: true
      }
    }));
  }

  return (
    <div className="controlStack operatorDetectionParameters">
      <h3>{t("Detector Setup")}</h3>
      <NumberField
        disabled={disabled}
        label="Contrast threshold"
        max={255}
        min={0}
        value={contrast_threshold}
        onChange={(value) => {
          const nextValue = Math.max(0, Math.min(255, Number.isFinite(value) ? value : DEFAULT_CONFIG.contrast_threshold));
          patchDetectorConfig({ contrast_threshold: nextValue });
          onPreviewAffectingChange({ kind: "detector_config", key: "contrast_threshold" });
        }}
      />
      <NumberField
        disabled={disabled}
        label="Maximum allowed jump (px)"
        max={200}
        min={1}
        value={distance_outlier_max_jump_px}
        onChange={(value) => {
          const fallback = DEFAULT_CONFIG.distance_outlier_max_jump_px;
          const nextValue = Math.max(1, Math.min(200, Number.isFinite(value) ? value : fallback));
          patchDetectorConfig({ distance_outlier_max_jump_px: nextValue });
        }}
      />
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

const HARDWARE_SETUP_STEPS = [
  "Environment check",
  "Scan camera",
  "Select temperature controller",
  "Test binding",
  "Save configuration"
] as const;

function DeviceSetupWizard({
  open,
  onClose,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useUiText();
  const [activeStep, setActiveStep] = useState(0);
  const [environment, setEnvironment] = useState<HardwareSetupEnvironment | null>(null);
  const [cameras, setCameras] = useState<HardwareCameraDevice[]>([]);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedCameraKey, setSelectedCameraKey] = useState("");
  const [selectedPort, setSelectedPort] = useState("");
  const [cameraTestResult, setCameraTestResult] = useState<HardwareCameraTestResponse | null>(null);
  const [temperatureTestResult, setTemperatureTestResult] = useState<HardwareTemperatureTestResponse | null>(null);
  const [testResult, setTestResult] = useState<HardwareBindingTestResponse | null>(null);
  const [saveResult, setSaveResult] = useState<HardwareBindingSaveResponse | null>(null);
  const [loadingWizard, setLoadingWizard] = useState(false);
  const [testingCamera, setTestingCamera] = useState(false);
  const [testingTemperature, setTestingTemperature] = useState(false);
  const [testingBinding, setTestingBinding] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveStep(0);
    setCameraTestResult(null);
    setTemperatureTestResult(null);
    setTestResult(null);
    setSaveResult(null);
    setError("");
    void refreshWizardData();
  }, [open]);

  useEffect(() => {
    setCameraTestResult(null);
    setTestResult(null);
    setSaveResult(null);
  }, [selectedCameraKey]);

  useEffect(() => {
    setTemperatureTestResult(null);
    setTestResult(null);
    setSaveResult(null);
  }, [selectedPort]);

  if (!open) return null;

  const selectedCamera = cameras.find((camera) => hardwareCameraKey(camera) === selectedCameraKey) ?? null;
  const binding = selectedCamera && selectedPort
    ? {
        camera: selectedCamera,
        temperature: {
          backend: "lu92xx_modbus_rtu",
          serial_port: selectedPort
        }
      } satisfies HardwareBinding
    : null;
  const canAdvance =
    activeStep === 0
      ? true
      : activeStep === 1
        ? Boolean(selectedCamera) && cameraTestResult?.status === "passed"
        : activeStep === 2
          ? Boolean(selectedPort) && temperatureTestResult?.status === "passed"
          : activeStep === 3
            ? testResult?.overall_status === "passed"
            : true;

  async function refreshWizardData() {
    setLoadingWizard(true);
    setError("");
    const [environmentResult, cameraResult, portResult] = await Promise.allSettled([
      getHardwareSetupEnvironment(),
      listHardwareCameras(),
      listTemperatureSerialPorts()
    ]);
    if (environmentResult.status === "fulfilled") {
      setEnvironment(environmentResult.value);
    } else {
      setEnvironment(null);
      setError(environmentResult.reason instanceof Error ? environmentResult.reason.message : String(environmentResult.reason));
    }
    if (cameraResult.status === "fulfilled") {
      setCameras(cameraResult.value);
      setSelectedCameraKey((current) => {
        if (current && cameraResult.value.some((camera) => hardwareCameraKey(camera) === current)) return current;
        return hardwareCameraKey(selectDefaultHardwareCamera(cameraResult.value));
      });
    } else {
      setCameras([]);
      setSelectedCameraKey("");
      setError(cameraResult.reason instanceof Error ? cameraResult.reason.message : String(cameraResult.reason));
    }
    if (portResult.status === "fulfilled") {
      setPorts(portResult.value);
      setSelectedPort((current) => current || portResult.value[0]?.device || "");
    } else {
      setPorts([]);
      setSelectedPort("");
      setError(portResult.reason instanceof Error ? portResult.reason.message : String(portResult.reason));
    }
    setLoadingWizard(false);
  }

  async function refreshEnvironmentChecks() {
    setLoadingWizard(true);
    setError("");
    try {
      setEnvironment(await getHardwareSetupEnvironment());
    } catch (err) {
      setEnvironment(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingWizard(false);
    }
  }

  async function scanHardwareCameras() {
    setLoadingWizard(true);
    setError("");
    setCameraTestResult(null);
    setTestResult(null);
    setSaveResult(null);
    try {
      const nextCameras = await listHardwareCameras();
      setCameras(nextCameras);
      setSelectedCameraKey((current) => {
        if (current && nextCameras.some((camera) => hardwareCameraKey(camera) === current)) return current;
        return hardwareCameraKey(selectDefaultHardwareCamera(nextCameras));
      });
    } catch (err) {
      setCameras([]);
      setSelectedCameraKey("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingWizard(false);
    }
  }

  async function refreshTemperaturePorts() {
    setLoadingWizard(true);
    setError("");
    setTemperatureTestResult(null);
    setTestResult(null);
    setSaveResult(null);
    try {
      const nextPorts = await listTemperatureSerialPorts();
      setPorts(nextPorts);
      setSelectedPort((current) => current || nextPorts[0]?.device || "");
    } catch (err) {
      setPorts([]);
      setSelectedPort("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingWizard(false);
    }
  }

  async function runCameraTest() {
    if (!selectedCamera) {
      setError(t("Select camera before testing"));
      return;
    }
    setTestingCamera(true);
    setError("");
    try {
      setCameraTestResult(await testHardwareCamera(selectedCamera));
    } catch (err) {
      setCameraTestResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingCamera(false);
    }
  }

  async function runTemperatureTest() {
    if (!selectedPort) {
      setError(t("Select serial port before testing"));
      return;
    }
    setTestingTemperature(true);
    setError("");
    try {
      setTemperatureTestResult(
        await testHardwareTemperature({
          serial_port: selectedPort,
          baudrate: 19200,
          slave_address: 1
        })
      );
    } catch (err) {
      setTemperatureTestResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingTemperature(false);
    }
  }

  async function runBindingTest() {
    if (!binding) {
      setError(t("Select camera and serial port before testing"));
      return;
    }
    setTestingBinding(true);
    setError("");
    try {
      const result = await testHardwareBinding(binding);
      setTestResult(result);
      if (result.overall_status === "passed") setActiveStep(4);
    } catch (err) {
      setTestResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingBinding(false);
    }
  }

  async function saveBinding() {
    if (!binding) {
      setError(t("Select camera and serial port before saving"));
      return;
    }
    if (testResult?.overall_status !== "passed") {
      setError(t("Run binding test before saving"));
      return;
    }
    setSavingBinding(true);
    setError("");
    try {
      const result = await saveHardwareBinding(binding);
      setSaveResult(result);
      await onSaved();
    } catch (err) {
      setSaveResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingBinding(false);
    }
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="deviceSetupDialog" role="dialog">
        <header>
          <div>
            <h2>{t("Device setup")}</h2>
            <p>{t("Camera and temperature controller binding")}</p>
          </div>
          <button aria-label={t("Cancel")} className="iconButton" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <ol className="wizardStepList">
          {HARDWARE_SETUP_STEPS.map((step, index) => (
            <li className={index === activeStep ? "active" : index < activeStep ? "complete" : ""} key={step}>
              <button onClick={() => setActiveStep(index)} type="button">
                <span>{index + 1}</span>
                {t(step)}
              </button>
            </li>
          ))}
        </ol>
        {error ? <div className="inlineError">{error}</div> : null}
        {loadingWizard ? <div className="statusBlock">{t("Scanning")}</div> : null}
        <div className="wizardBody">
          {activeStep === 0 ? (
            <section className="wizardStepPanel">
              <h3>{t("Environment check")}</h3>
              <HardwareCheckList checks={environment?.checks ?? []} />
              <button className="secondaryButton" disabled={loadingWizard} onClick={refreshEnvironmentChecks} type="button">
                <RefreshCcw size={16} aria-hidden="true" />
                {t("Refresh checks")}
              </button>
            </section>
          ) : null}
          {activeStep === 1 ? (
            <section className="wizardStepPanel">
              <h3>{t("Scan camera")}</h3>
              <div className="wizardDeviceList">
                {cameras.map((camera) => (
                  <label className={camera.is_supported_model ? "wizardDeviceOption" : "wizardDeviceOption warning"} key={hardwareCameraKey(camera)}>
                    <input
                      checked={hardwareCameraKey(camera) === selectedCameraKey}
                      disabled={!camera.is_supported_model}
                      onChange={() => setSelectedCameraKey(hardwareCameraKey(camera))}
                      type="radio"
                    />
                    <span>
                      <strong>{camera.model || t("Unknown camera")}</strong>
                      <small>
                        {camera.serial_number || t("No serial")} · {camera.ip || camera.transport || t("None")}
                      </small>
                      {camera.user_defined_name ? <small>{camera.user_defined_name}</small> : null}
                    </span>
                  </label>
                ))}
              </div>
              {!cameras.length ? <div className="statusBlock">{t("No Hik cameras found")}</div> : null}
              {cameras.length > 1 && !selectedCamera ? <div className="inlineWarning">{t("Select one camera to continue")}</div> : null}
              {cameraTestResult ? <HardwareCameraTestResult result={cameraTestResult} /> : null}
              <button className="primaryButton" disabled={!selectedCamera || testingCamera} onClick={runCameraTest} type="button">
                <Camera size={16} aria-hidden="true" />
                {testingCamera ? t("Testing") : t("Test camera")}
              </button>
              <button className="secondaryButton" disabled={loadingWizard} onClick={scanHardwareCameras} type="button">
                <Camera size={16} aria-hidden="true" />
                {t("Scan camera")}
              </button>
            </section>
          ) : null}
          {activeStep === 2 ? (
            <section className="wizardStepPanel">
              <h3>{t("Select temperature controller")}</h3>
              <label className="field">
                <span>{t("Temperature serial port")}</span>
                <select onChange={(event) => setSelectedPort(event.target.value)} value={selectedPort}>
                  <option value="">{t("Select serial port")}</option>
                  {ports.map((port) => (
                    <option key={port.device || port.name} value={port.device}>
                      {port.device || port.name} {port.description ? `· ${port.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!ports.length ? <div className="statusBlock">{t("No serial ports found")}</div> : null}
              {temperatureTestResult ? <HardwareTemperatureTestResult result={temperatureTestResult} /> : null}
              <button className="primaryButton" disabled={!selectedPort || testingTemperature} onClick={runTemperatureTest} type="button">
                <Usb size={16} aria-hidden="true" />
                {testingTemperature ? t("Testing") : t("Test temperature")}
              </button>
              <button className="secondaryButton" disabled={loadingWizard} onClick={refreshTemperaturePorts} type="button">
                <Usb size={16} aria-hidden="true" />
                {t("Refresh ports")}
              </button>
            </section>
          ) : null}
          {activeStep === 3 ? (
            <section className="wizardStepPanel">
              <h3>{t("Test binding")}</h3>
              <HardwareBindingSummary camera={selectedCamera} serialPort={selectedPort} />
              {testResult ? <HardwareTestResult result={testResult} /> : null}
              <button className="primaryButton" disabled={!binding || testingBinding} onClick={runBindingTest} type="button">
                <Activity size={16} aria-hidden="true" />
                {testingBinding ? t("Testing") : t("Test binding")}
              </button>
            </section>
          ) : null}
          {activeStep === 4 ? (
            <section className="wizardStepPanel">
              <h3>{t("Save configuration")}</h3>
              <HardwareBindingSummary camera={selectedCamera} serialPort={selectedPort} />
              {saveResult ? (
                <div className={saveResult.real_hardware_available === false ? "inlineWarning" : "inlineSuccess"}>
                  {saveResult.real_hardware_available === false
                    ? t("Configuration saved but hardware unavailable")
                    : t("Real camera + real temperature controller")}
                  : {saveResult.config_path}
                </div>
              ) : null}
              <div className="buttonPair">
                <button className="primaryButton" disabled={!binding || testResult?.overall_status !== "passed" || savingBinding} onClick={saveBinding} type="button">
                  <Settings size={16} aria-hidden="true" />
                  {savingBinding ? t("Saving") : t("Save configuration")}
                </button>
                <button className="secondaryButton" onClick={onClose} type="button">
                  {t("Finish")}
                </button>
              </div>
            </section>
          ) : null}
        </div>
        <footer className="wizardFooter">
          <button className="secondaryButton" disabled={activeStep === 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))} type="button">
            {t("Back")}
          </button>
          <button
            className="secondaryButton"
            disabled={activeStep >= HARDWARE_SETUP_STEPS.length - 1 || !canAdvance}
            onClick={() => setActiveStep((step) => Math.min(HARDWARE_SETUP_STEPS.length - 1, step + 1))}
            type="button"
          >
            {t("Next")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function HardwareCheckList({ checks }: { checks: HardwareSetupEnvironment["checks"] }) {
  const language = useUiLanguage();
  const t = useUiText();
  if (!checks.length) return <div className="statusBlock">{t("No checks available")}</div>;
  return (
    <div className="hardwareCheckList">
      {checks.map((check) => (
        <article className={check.status === "passed" ? "hardwareCheck passed" : "hardwareCheck failed"} key={check.id}>
          <div>
            <strong>{t(check.label)}</strong>
            <span>{t(check.status)}</span>
          </div>
          <p>{localizeDisplayString(check.message, language)}</p>
          {check.suggestion ? <small>{localizeDisplayString(check.suggestion, language)}</small> : null}
          <HardwareCheckDetails details={check.details} />
        </article>
      ))}
    </div>
  );
}

const HARDWARE_CHECK_DETAIL_FIELDS: Array<[string, string]> = [
  ["current_sdk_python_paths", "Current SDK Python path"],
  ["current_sdk_python_path_env", "Current SDK Python path env"],
  ["current_mvs_dynamic_library_path", "Current MVS dynamic library path"],
  ["current_mvs_dynamic_library_path_env", "Current MVS dynamic library path env"],
  ["suggested_sdk_python_paths", "Suggested SDK Python path"],
  ["suggested_mvs_dynamic_library_paths", "Suggested MVS dynamic library path"],
  ["windows_sdk_library_dir", "Windows SDK library dir"],
  ["fix_instructions", "Fix instructions"]
];

function HardwareCheckDetails({ details }: { details: Record<string, unknown> }) {
  const language = useUiLanguage();
  const t = useUiText();
  const rows = HARDWARE_CHECK_DETAIL_FIELDS.map(([key, label]) => ({
    key,
    label,
    value: details[key]
  })).filter((row) => hasHardwareCheckDetailValue(row.value));
  if (!rows.length) return null;
  return (
    <details className="hardwareCheckDetails">
      <summary>{t("SDK path details")}</summary>
      <dl>
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{t(row.label)}</dt>
            <dd>{formatHardwareCheckDetailValue(row.value, language, t)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function hasHardwareCheckDetailValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatHardwareCheckDetailValue(value: unknown, language: UiLanguage, t: (key: string) => string): string {
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => localizeDisplayString(String(item), language)).join("; ") : t("Not configured");
  }
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  const text = String(value ?? "").trim();
  return text ? localizeDisplayString(text, language) : t("Not configured");
}

function HardwareCameraTestResult({ result }: { result: HardwareCameraTestResponse }) {
  const t = useUiText();
  return (
    <div className={result.status === "passed" ? "inlineSuccess" : "inlineWarning"}>
      <strong>{t(result.status === "passed" ? "Camera test passed" : "Camera test failed")}</strong>
      {result.error ? <span>{result.error}</span> : null}
      {result.preview_image_data_url ? (
        <img alt={t("Camera preview")} className="devicePreviewImage" src={result.preview_image_data_url} />
      ) : null}
    </div>
  );
}

function HardwareTemperatureTestResult({ result }: { result: HardwareTemperatureTestResponse }) {
  const language = useUiLanguage();
  const t = useUiText();
  const temperature =
    result.temperature_celsius == null || !Number.isFinite(result.temperature_celsius)
      ? t("None")
      : formatTemperatureValue(result.temperature_celsius, language);
  return (
    <div className={result.status === "passed" ? "inlineSuccess" : "inlineWarning"}>
      <strong>{t(result.status === "passed" ? "Temperature test passed" : "Temperature test failed")}</strong>
      {result.error ? <span>{result.error}</span> : <span>{temperature}</span>}
    </div>
  );
}

function HardwareBindingSummary({
  camera,
  serialPort
}: {
  camera: HardwareCameraDevice | null;
  serialPort: string;
}) {
  const t = useUiText();
  return (
    <dl className="metricGrid compact">
      <Metric label="Camera" value={camera ? `${camera.model || "Unknown camera"} / ${camera.serial_number || "No serial"}` : "None"} />
      <Metric label="ip" value={camera?.ip || "None"} />
      <Metric label="Temperature serial port" value={serialPort || "None"} />
      <Metric label="Source" value={t("Real camera + real temperature controller")} />
    </dl>
  );
}

function HardwareTestResult({ result }: { result: HardwareBindingTestResponse }) {
  const t = useUiText();
  return (
    <div className={result.overall_status === "passed" ? "inlineSuccess" : "inlineWarning"}>
      <strong>{t(result.overall_status === "passed" ? "Binding test passed" : "Binding test failed")}</strong>
      <span>{t("Camera")}: {result.camera.message}</span>
      <span>{t("Temperature")}: {result.temperature.message}</span>
    </div>
  );
}

function hardwareCameraKey(camera: HardwareCameraDevice | null | undefined): string {
  if (!camera) return "";
  return [camera.backend, camera.transport, camera.model, camera.serial_number, camera.ip].join("|");
}

function selectDefaultHardwareCamera(cameras: HardwareCameraDevice[]): HardwareCameraDevice | null {
  const supported = cameras.filter((camera) => camera.is_supported_model);
  if (supported.length === 1) return supported[0];
  return null;
}

function RealHardwareUnavailableCard({
  loading,
  lastCheckedAt,
  sourceStatus,
  statusError,
  onRecheck,
  onOpenDeviceSetup
}: {
  loading: boolean;
  lastCheckedAt: number | null;
  sourceStatus: OperatorSourceStatus | null;
  statusError: string;
  onRecheck?: () => void;
  onOpenDeviceSetup?: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <section className="operatorHardwareErrorCard" aria-live="polite">
      <h3>{t("Real hardware unavailable")}</h3>
      <p>{t("Real camera is unavailable. Check the device connection or open device setup.")}</p>
      <p>{t("Device binding incomplete guidance")}</p>
      <div className="operatorHardwareMeta">
        <span>{t("Last checked")}: {formatOperatorLastCheckedAt(lastCheckedAt, language)}</span>
        {loading ? <span>{t("Rechecking")}...</span> : null}
      </div>
      {statusError ? <div className="inlineError">{statusError}</div> : null}
      {sourceStatus?.errors.length ? (
        <ul className="operatorWarningList compactList">
          {sourceStatus.errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="buttonPair">
        {onRecheck ? (
          <button className="secondaryButton" disabled={loading} onClick={onRecheck} type="button">
            <RefreshCcw size={16} aria-hidden="true" />
            {loading ? t("Rechecking") : t("Recheck")}
          </button>
        ) : null}
        {onOpenDeviceSetup ? (
          <button className="secondaryButton" onClick={onOpenDeviceSetup} type="button">
            <Settings size={16} aria-hidden="true" />
            {t("Open device setup")}
          </button>
        ) : null}
      </div>
    </section>
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
  operatorRunActive,
  mode,
  onPatch,
  onConfirm,
  onRefreshSerialPorts
}: {
  currentTemperature: number | null;
  operatorSettings: OperatorConfirmedSettings;
  serialPortOptions: string[];
  temperatureStatus: TemperatureStatusResponse | null;
  temperatureError: SetupTemperatureError | null;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  operatorRunActive: boolean;
  mode: "offline_dataset" | "real_camera_available" | "real_camera_unavailable";
  onPatch: (patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>) => void;
  onConfirm: () => void;
  onRefreshSerialPorts: () => void;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const simulatedMode = mode === "offline_dataset";
  const hardwareUnavailable = mode === "real_camera_unavailable";
  const temperatureReadoutStatus = operatorRunActive
    ? t("From live test")
    : checkingTemperature || temperatureStatus?.temperature_status === "ok"
      ? t("Auto refreshing")
      : temperatureStatus?.temperature_status
        ? uiStatus(language, temperatureStatus.temperature_status)
        : t("Not read");
  return (
    <div className="controlStack operatorTemperaturePanel">
      <h3>{t("Temperature Control")}</h3>
      {simulatedMode || hardwareUnavailable ? (
        <div className={hardwareUnavailable ? "inlineError" : "inlineWarning"}>
          {hardwareUnavailable
            ? t("Temperature controller unavailable. Open device setup.")
            : t("Offline dataset mode does not connect to a real temperature controller.")}
        </div>
      ) : (
        <>
          <div className="operatorTemperatureReadout">
            <small>{t("Current temperature")}</small>
            <span>{formatTemperatureValue(currentTemperature, language)}</span>
            <small>{temperatureReadoutStatus}</small>
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
          <select
            disabled={hardwareUnavailable}
            onChange={(event) => onPatch({ serialPort: event.target.value || null })}
            value={operatorSettings.serialPort ?? ""}
          >
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
  const [exportMessage, setExportMessage] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [analysisOverride, setAnalysisOverride] = useState<AnalysisResult | null>(null);
  const currentAnalysis =
    runResult?.analysis_result ??
    (liveRun?.status === "stopped" || liveRun?.status === "complete" ? liveRun.analysis : null);
  const currentRunId = runResult?.run_manifest.run_id ?? (
    liveRun?.status === "stopped" || liveRun?.status === "complete" ? liveRun.runId : null
  );
  const analysis = analysisOverride ?? currentAnalysis ?? importedRun?.analysis_result ?? null;
  const isImported = !currentAnalysis && importedRun?.analysis_result;
  const resultProvenance =
    runResult?.run_manifest.provenance ??
    liveRun?.provenance ??
    importedRun?.provenance ??
    null;
  const resultSourceWarning = sourceProvenanceWarning(resultProvenance, language);

  useEffect(() => {
    setAnalysisOverride(null);
    setExportMessage("");
  }, [currentRunId]);

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
        {analysis ? <OperatorRegionResults analysis={analysis} /> : null}
        <button
          className="primaryButton spaced"
          disabled={!currentRunId}
          onClick={() => {
            setExportMessage("");
            setExportDialogOpen(true);
          }}
          type="button"
        >
          <Download size={16} aria-hidden="true" />
          {t("Export result")}
        </button>
        {exportMessage ? <div className="inlineSuccess">{exportMessage}</div> : null}
        <ExportSaveDialog
          defaultFilename={currentRunId ? `yyt1771-g3-export-${currentRunId}.zip` : "yyt1771-g3-export.zip"}
          open={exportDialogOpen}
          runId={currentRunId}
          onClose={() => setExportDialogOpen(false)}
          onComplete={(filename) => setExportMessage(`${t("Export complete")}: ${filename}`)}
        />
        {importedRun?.warnings.length ? (
          <ul className="operatorWarningList">
            {importedRun.warnings.map((warning) => (
              <li key={warning}>{localizeDisplayString(warning, language)}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="toolPanel operatorResultChart">
        <h2>{t("Combined curves")}</h2>
        {analysis ? (
          <MultiRegionTrendChart
            sources={analysisRegionTrendSources(analysis)}
            isRunning={false}
            targetTemperature={null}
            variant="result"
          />
        ) : importedRun?.temperature_distance_image_data_url ? (
          <figure className="importedPngFigure">
            <img src={importedRun.temperature_distance_image_data_url} alt={t("Distance - temperature")} />
            <figcaption>{t("Imported image only")}</figcaption>
          </figure>
        ) : (
          <div className="statusBlock">{t("No AFAS temperature-distance points")}</div>
        )}
      </section>
      {analysis && currentRunId ? (
        <section className="toolPanel operatorReanalysisPanel">
          <AfasParameterPanel
            analysis={analysis}
            buttonLabel="Re-analyze"
            runId={currentRunId}
            onAnalysisUpdated={setAnalysisOverride}
          />
        </section>
      ) : null}
      {importedRun ? (
        <section className="toolPanel operatorImportedDetails">
          <h2>{t("Imported result")}</h2>
          <ImportedRunSummary view={importedRun} />
        </section>
      ) : null}
    </div>
  );
}

function ExportSaveDialog({
  defaultFilename,
  open,
  runId,
  onClose,
  onComplete
}: {
  defaultFilename: string;
  open: boolean;
  runId: string | null;
  onClose: () => void;
  onComplete: (filename: string) => void;
}) {
  const t = useUiText();
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [directoryMessage, setDirectoryMessage] = useState("");
  const [filename, setFilename] = useState(defaultFilename);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const store = useMemo(() => createIndexedDbExportDirectoryStore(), []);
  const browserHasShowDirectoryPicker = isExportDirectoryPickerSupported(globalThis);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFilename(defaultFilename);
    setError("");
    setDirectoryMessage("");
    if (!browserHasShowDirectoryPicker) return;
    store.load()
      .then(async (handle) => {
        if (cancelled || !handle) return;
        const permission = await queryExportDirectoryPermission(handle);
        if (cancelled) return;
        setDirectoryHandle(handle);
        if (permission !== "granted" && permission !== "unsupported") {
          setDirectoryMessage(t("Saved export folder permission expired"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setDirectoryMessage(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [browserHasShowDirectoryPicker, defaultFilename, open, store]);

  if (!open) return null;

  async function chooseDirectory() {
    setError("");
    setDirectoryMessage("");
    try {
      const handle = await chooseExportDirectory(globalThis);
      setDirectoryHandle(handle);
      await store.save(handle);
      setDirectoryMessage(`${t("Selected export folder")}: ${handle.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function exportRun() {
    if (!runId) return;
    setExporting(true);
    setError("");
    try {
      if (browserHasShowDirectoryPicker) {
        if (!directoryHandle) {
          setError(t("Choose a save folder before exporting"));
          return;
        }
        const bundle = await fetchRunExportBundle(runId);
        setFilename(bundle.filename);
        await writeBlobToDirectory(directoryHandle, bundle.filename, bundle.blob);
        onComplete(bundle.filename);
      } else {
        const download = await downloadRunExportBundle(runId);
        setFilename(download.filename);
        onComplete(download.filename);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  const saveLocation = browserHasShowDirectoryPicker
    ? directoryHandle?.name ?? t("No export folder selected")
    : t("Browser default downloads");

  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="exportSaveDialog" role="dialog">
        <header>
          <h2>{t("Choose export save folder")}</h2>
          <button aria-label={t("Cancel")} className="iconButton" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <label className="field">
          <span>{t("Export filename")}</span>
          <input readOnly type="text" value={filename} />
        </label>
        <dl className="metricGrid compact">
          <Metric label="Current default save location" value={saveLocation} />
        </dl>
        {!browserHasShowDirectoryPicker ? (
          <div className="inlineWarning">
            {t("This browser does not support choosing a save folder. The default browser download will be used.")}
          </div>
        ) : null}
        {directoryMessage ? <div className="inlineSuccess">{directoryMessage}</div> : null}
        {error ? <div className="inlineError">{error}</div> : null}
        <div className="buttonPair">
          <button
            className="secondaryButton"
            disabled={!browserHasShowDirectoryPicker || exporting}
            onClick={chooseDirectory}
            type="button"
          >
            {t("Choose save folder")}
          </button>
          <button className="primaryButton" disabled={!runId || exporting} onClick={exportRun} type="button">
            <Download size={16} aria-hidden="true" />
            {exporting ? t("Exporting") : t("Export")}
          </button>
          <button className="secondaryButton" disabled={exporting} onClick={onClose} type="button">
            {t("Cancel")}
          </button>
        </div>
      </section>
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
      {analysis ? <OperatorRegionResults analysis={analysis} /> : null}
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
        <MultiRegionTrendChart
          sources={analysisRegionTrendSources(analysis)}
          isRunning={false}
          targetTemperature={null}
          variant="result"
        />
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

function OperatorRegionResults({ analysis }: { analysis: AnalysisResult }) {
  const language = useUiLanguage();
  const t = useUiText();
  if (!analysis.regions?.length) return <OperatorAfasSummary analysis={analysis} />;
  return (
    <section className="operatorRegionResults">
      <h3>{t("Position results")}</h3>
      <div className="operatorRegionResultGrid">
        {analysis.regions?.map((region) => {
          const summary = readRecord(region.summary);
          const status = String(summary.status ?? readAfasStatusForRegion(region));
          const failureReason = String(summary.failure_reason ?? "");
          return (
            <article
              className={status === "ok" ? "operatorRegionResultCard ok" : "operatorRegionResultCard warning"}
              key={region.region_id}
              style={{ "--region-color": region.color } as React.CSSProperties}
            >
              <header>
                <span className="regionColorSwatch" style={{ backgroundColor: region.color }} />
                <strong>{measurementRegionDisplayLabel(regionAnalysisMeasurementRegion(region), language)}</strong>
                <small>{uiStatus(language, status)}</small>
              </header>
              <dl>
                <Metric label="Raw points" value={formatOptionalInteger(summary.raw_point_count ?? region.temperature_distance.length)} />
                <Metric label="Smoothed points" value={formatOptionalInteger(summary.smoothed_point_count)} />
                <Metric label="AS" value={formatOptionalNumber(summary.As, " °C", language)} />
                <Metric label="AF" value={formatOptionalNumber(summary.Af, " °C", language)} />
                <Metric label="ΔT" value={formatOptionalNumber(summary.delta_t, " °C", language)} />
                <Metric label="Max slope" value={formatOptionalNumber(summary.max_slope_temperature, " °C", language)} />
                <Metric label="Status" value={uiStatus(language, status)} />
              </dl>
              {failureReason ? <div className="operatorRegionFailure">{failureReason}</div> : null}
            </article>
          );
        })}
      </div>
    </section>
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
  onPreviewAffectingChange,
  disabled = false,
  regionId
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onResetRoi?: () => void;
  onPreviewAffectingChange?: (change: RealCameraSetupChange) => void;
  disabled?: boolean;
  regionId?: string;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  function patchRoi(patch: Partial<RotatedROI>) {
    const roi = { ...measurement.roi, ...patch };
    if (measurement.regions?.length) {
      const targetRegionId = regionId ??
        [...measurement.regions]
          .filter((region) => region.enabled)
          .sort((left, right) => left.index - right.index)[0]?.region_id;
      if (targetRegionId) {
        onMeasurement(updateRegionRoi(measurement, targetRegionId, roi));
        return;
      }
    }
    onMeasurement({ ...measurement, roi });
  }

  function commitRoiField() {
    onPreviewAffectingChange?.({ kind: "roi" });
  }

  return (
    <div className="controlStack">
      <h3>{t("Measurement ROI")}</h3>
      <div className="twoColumnControls">
        <NumberField disabled={disabled} label="Center X" value={measurement.roi.center_x} onChange={(v) => patchRoi({ center_x: v })} onCommit={commitRoiField} />
        <NumberField disabled={disabled} label="Center Y" value={measurement.roi.center_y} onChange={(v) => patchRoi({ center_y: v })} onCommit={commitRoiField} />
        <NumberField disabled={disabled} label="Width" value={measurement.roi.width} onChange={(v) => patchRoi({ width: Math.max(1, v) })} onCommit={commitRoiField} />
        <NumberField disabled={disabled} label="Height" value={measurement.roi.height} onChange={(v) => patchRoi({ height: Math.max(1, v) })} onCommit={commitRoiField} />
      </div>
      <label className="field">
        <span>
          <RotateCw size={14} aria-hidden="true" />
          {t("Angle")}
        </span>
        <input
          disabled={disabled}
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
        <button className="secondaryButton" disabled={disabled} onClick={onResetRoi} type="button">
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
        detector_mode: "default",
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
      {measurement.object_class === "C_BUNDLE_ENVELOPE" ? (
        <CDetectorModeControl
          measurement={measurement}
          onMeasurement={onMeasurement}
          onPreviewAffectingChange={onPreviewAffectingChange}
        />
      ) : null}
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

function CDetectorModeControl({
  measurement,
  onMeasurement,
  onPreviewAffectingChange,
  disabled = false
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange?: (change: RealCameraSetupChange) => void;
  disabled?: boolean;
}) {
  const language = useUiLanguage();
  const t = useUiText();

  function changeDetectorMode(value: MeasurementDefinition["detector_mode"]) {
    const normalized = value ?? "default";
    onMeasurement({
      ...measurement,
      detector: normalized === "contrast_widest_span" ? "ContrastWidestSpanDetector" : "BundleEnvelopeDetector",
      detector_mode: normalized
    });
    onPreviewAffectingChange?.({ kind: "detector" });
  }

  return (
    <label className="field">
      <span>{t("Detection method")}</span>
      <select
        disabled={disabled}
        onChange={(event) => changeDetectorMode(event.target.value as MeasurementDefinition["detector_mode"])}
        value={measurement.detector_mode ?? "default"}
      >
        {C_DETECTOR_MODE_OPTIONS.filter((option) => option.value !== "c_envelope_legacy" || measurement.detector_mode === "c_envelope_legacy").map((option) => (
          <option key={option.value} value={option.value}>
            {uiDetectorMode(language, option.value)}
          </option>
        ))}
      </select>
    </label>
  );
}

function isContrastWidestSpanMode(measurement: MeasurementDefinition): boolean {
  return measurement.object_class === "C_BUNDLE_ENVELOPE" && measurement.detector_mode === "contrast_widest_span";
}

function ContrastThresholdControl({
  measurement,
  onMeasurement,
  onPreviewAffectingChange
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  onPreviewAffectingChange?: (change: RealCameraSetupChange) => void;
}) {
  function patchContrastThreshold(value: number) {
    const nextValue = Math.max(0, Math.min(255, Number.isFinite(value) ? value : DEFAULT_CONFIG.contrast_threshold));
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        contrast_threshold: nextValue
      }
    });
  }

  return (
    <NumberField
      label="Contrast threshold"
      min={0}
      max={255}
      step={1}
      value={measurement.detector_config.contrast_threshold ?? DEFAULT_CONFIG.contrast_threshold}
      onChange={patchContrastThreshold}
      onCommit={(value) => {
        patchContrastThreshold(value);
        onPreviewAffectingChange?.({ kind: "detector_config", key: "contrast_threshold" });
      }}
    />
  );
}

function DistanceOutlierFilterControl({
  measurement,
  onMeasurement
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
}) {
  const t = useUiText();
  function patchDetectorConfig(patch: Partial<DetectorConfig>) {
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        ...patch
      }
    });
  }

  function patchMaximumAllowedJump(value: number) {
    const fallback = DEFAULT_CONFIG.distance_outlier_max_jump_px;
    const nextValue = Math.max(1, Math.min(200, Number.isFinite(value) ? value : fallback));
    patchDetectorConfig({ distance_outlier_max_jump_px: nextValue });
  }

  return (
    <div className="twoColumnControls">
      <label className="field checkboxField">
        <span>{t("Distance outlier filter")}</span>
        <input
          checked={measurement.detector_config.distance_outlier_filter_enabled ?? DEFAULT_CONFIG.distance_outlier_filter_enabled}
          onChange={(event) => patchDetectorConfig({ distance_outlier_filter_enabled: event.target.checked })}
          type="checkbox"
        />
      </label>
      <NumberField
        label="Maximum allowed jump (px)"
        min={1}
        max={200}
        step={1}
        value={measurement.detector_config.distance_outlier_max_jump_px ?? DEFAULT_CONFIG.distance_outlier_max_jump_px}
        onChange={patchMaximumAllowedJump}
        onCommit={patchMaximumAllowedJump}
      />
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
  title,
  disabled = false
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  step?: number;
  title?: string;
  disabled?: boolean;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  return (
    <label className="field" title={title}>
      <span>{t(label)}</span>
      <input
        disabled={disabled}
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

type FrameCanvasRegionOverlay = {
  region: MeasurementRegion;
  detection: DetectionResult | null;
};

function FrameCanvas({
  title,
  imageUrl,
  sourceShape,
  roi,
  abPoints,
  measurementSegment,
  debugArtifacts,
  regions,
  activeRegionId,
  onRoiChange,
  onRoiCommit,
  onRegionRoiChange,
  onRegionRoiCommit,
  readOnly = false
}: {
  title: string;
  imageUrl: string;
  sourceShape: number[];
  roi: RotatedROI;
  abPoints: { a: ABPoint; b: ABPoint } | null;
  measurementSegment?: ABPoint[] | null;
  debugArtifacts?: Record<string, unknown> | null;
  regions?: FrameCanvasRegionOverlay[];
  activeRegionId?: string;
  onRoiChange?: (roi: RotatedROI) => void;
  onRoiCommit?: (roi: RotatedROI) => void;
  onRegionRoiChange?: (regionId: string, roi: RotatedROI) => void;
  onRegionRoiCommit?: (regionId: string, roi: RotatedROI) => void;
  readOnly?: boolean;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [rect, setRect] = useState({ width: 800, height: 520 });
  const [dragInteraction, setDragInteraction] = useState<RoiDragInteraction | null>(null);
  const source = { width: sourceShape[1] ?? 1, height: sourceShape[0] ?? 1 };
  const transform = fitSourceToDisplay(source, rect);
  const compatibilityRegion: MeasurementRegion = {
    region_id: "region_1",
    index: 1,
    label: "位置 1",
    enabled: true,
    roi,
    color: "#ef4444"
  };
  const regionOverlays = regions?.length
    ? regions
    : [{
        region: compatibilityRegion,
        detection: abPoints
          ? ({ ab_points: abPoints, measurement_segment: measurementSegment, debug_artifacts: debugArtifacts } as DetectionResult)
          : null
      }];
  const activeRegionOverlay = regionOverlays.find(
    ({ region }) => region.region_id === activeRegionId
  ) ?? regionOverlays[0];
  const activeRegion = activeRegionOverlay.region;
  const displayRoi = measurementRoiToDisplay(activeRegion.roi, transform);
  const corners = roiCorners(displayRoi);
  const handles = roiResizeHandles(corners);
  const rotateHandle = roiRotateHandle(corners, displayRoi);
  const editable = !readOnly && Boolean(onRegionRoiChange || onRoiChange);
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
    latestDragRoiRef.current = activeRegion.roi;
    setDragInteraction({
      ...interaction,
      startRoi: activeRegion.roi,
      startPoint: pointerToMeasurement(event)
    });
  }

  function updateInteraction(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragInteraction || (!onRegionRoiChange && !onRoiChange)) return;
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
    if (onRegionRoiChange) {
      onRegionRoiChange?.(activeRegion.region_id, nextRoi);
    } else {
      onRoiChange?.(nextRoi);
    }
  }

  function finishInteraction(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragInteraction) return;
    svgRef.current?.releasePointerCapture(event.pointerId);
    const committedRoi = latestDragRoiRef.current ?? dragInteraction.startRoi;
    latestDragRoiRef.current = null;
    setDragInteraction(null);
    if (onRegionRoiCommit) {
      onRegionRoiCommit?.(activeRegion.region_id, committedRoi);
    } else {
      onRoiCommit?.(committedRoi);
    }
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
              style={{ stroke: activeRegion.color }}
              x1={(corners[0].x + corners[1].x) / 2}
              y1={(corners[0].y + corners[1].y) / 2}
              x2={rotateHandle.x}
              y2={rotateHandle.y}
            />
          ) : null}
          {regionOverlays.map(({ region, detection }) => {
            const regionDisplayRoi = measurementRoiToDisplay(region.roi, transform);
            const regionCorners = roiCorners(regionDisplayRoi);
            const isActive = activeRegionId
              ? region.region_id === activeRegionId
              : region.region_id === activeRegion.region_id;
            return (
              <g className={isActive ? "frameRegionOverlay active" : "frameRegionOverlay"} key={region.region_id}>
                <polygon
                  className="roiPolygon"
                  fill={region.color}
                  fillOpacity={isActive ? 0.12 : 0.05}
                  onPointerDown={isActive ? (event) => beginInteraction(event, { kind: "move" }) : undefined}
                  points={regionCorners.map((point) => `${point.x},${point.y}`).join(" ")}
                  stroke={region.color}
                  strokeWidth={isActive ? 3 : 2}
                  style={{ fill: region.color, stroke: region.color }}
                />
                <text
                  className="frameRegionLabel"
                  fill={region.color}
                  x={regionCorners[0].x + 6}
                  y={regionCorners[0].y - 8}
                >
                  {measurementRegionDisplayLabel(region, language)}
                </text>
                {detection?.ab_points ? (
                  <ABOverlay
                    abPoints={detection.ab_points}
                    color={region.color}
                    measurementSegment={detection.measurement_segment}
                    transform={transform}
                  />
                ) : null}
              </g>
            );
          })}
          {editable ? (
            <>
              <circle
                className="roiHandle roiMoveHandle"
                cx={displayRoi.center_x}
                cy={displayRoi.center_y}
                data-testid="roi-move-handle"
                onPointerDown={(event) => beginInteraction(event, { kind: "move" })}
                r={6}
                style={{ fill: activeRegion.color, stroke: activeRegion.color }}
              />
              {handles.map((handle) => (
                <rect
                  className="roiHandle roiResizeHandle"
                  data-testid={`roi-resize-${handle.handle}`}
                  height={10}
                  key={handle.handle}
                  onPointerDown={(event) => beginInteraction(event, { kind: "resize", handle: handle.handle })}
                  style={{ fill: "#ffffff", stroke: activeRegion.color }}
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
                style={{ fill: activeRegion.color, stroke: activeRegion.color }}
              />
            </>
          ) : null}
          {activeRegionOverlay.detection?.debug_artifacts || debugArtifacts ? (
            <ContourProjectionOverlay
              debugArtifacts={activeRegionOverlay.detection?.debug_artifacts ?? debugArtifacts ?? {}}
              transform={transform}
            />
          ) : null}
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
  measurementSegment,
  transform,
  color
}: {
  abPoints: { a: ABPoint; b: ABPoint };
  measurementSegment?: ABPoint[] | null;
  transform: FrameDisplayTransform;
  color?: string;
}) {
  const segment = measurementSegment ?? [abPoints.a, abPoints.b];
  const segmentStart = segment[0] ?? abPoints.a;
  const segmentEnd = segment[1] ?? abPoints.b;
  const a = measurementPointToDisplay(abPoints.a, transform);
  const b = measurementPointToDisplay(abPoints.b, transform);
  const lineStart = measurementPointToDisplay(segmentStart, transform);
  const lineEnd = measurementPointToDisplay(segmentEnd, transform);
  return (
    <g className="abOverlay" style={{ color }}>
      <line stroke={color} style={{ stroke: color }} x1={lineStart.x} y1={lineStart.y} x2={lineEnd.x} y2={lineEnd.y} />
      <circle cx={a.x} cy={a.y} fill={color} r={5} style={{ fill: color, stroke: color }} />
      <circle cx={b.x} cy={b.y} fill={color} r={5} style={{ fill: color, stroke: color }} />
      <text fill={color} style={{ fill: color }} x={a.x + 8} y={a.y - 8}>
        A
      </text>
      <text fill={color} style={{ fill: color }} x={b.x + 8} y={b.y + 16}>
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
    ? displayedLiveRun.statusMessage
      ? `${t(displayedLiveRun.statusMessage)} · ${
          displayedLiveRun.totalFrames > 0
            ? `${displayedLiveRun.processedFrames.toLocaleString()} / ${displayedLiveRun.totalFrames.toLocaleString()}`
            : displayedLiveRun.processedFrames.toLocaleString()
        }`
      : displayedLiveRun.totalFrames > 0
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
              onClick={() => {
                runMode.kind === "real_camera_run" ? onStartRealCameraRun() : onStartRun();
              }}
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
            diagnostics={displayedLiveRun?.diagnostics ?? null}
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
              measurementSegment={latestDetection.measurement_segment ?? null}
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
  buttonLabel = "Recalculate",
  runId,
  onAnalysisUpdated
}: {
  analysis: AnalysisResult;
  buttonLabel?: string;
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
          {recalculating ? t("Recalculating") : t(buttonLabel)}
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

function MultiRegionTrendChart({
  sources,
  isRunning,
  targetTemperature,
  variant = "live"
}: {
  sources: RegionTrendSource[];
  isRunning: boolean;
  targetTemperature: number | null;
  variant?: "live" | "result";
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const width = 900;
  const height = 420;
  const sourceIds = sources.map((source) => source.region_id);
  const sourceIdKey = sourceIds.join("|");
  const previousSourceIdsRef = useRef(new Set(sourceIds));
  const [visibleRegionIds, setVisibleRegionIds] = useState<Set<string>>(
    () => new Set(sourceIds)
  );
  const [showFormalPoints, setShowFormalPoints] = useState(true);
  const [showDisplayTrend, setShowDisplayTrend] = useState(true);
  const [showAfasSmoothed, setShowAfasSmoothed] = useState(variant === "result");
  const [hoverTarget, setHoverTarget] = useState<{
    series: MultiRegionTrendModel["series"][number];
    point: MultiRegionTrendPoint;
  } | null>(null);

  useEffect(() => {
    const nextSourceIds = new Set(sourceIds);
    setVisibleRegionIds((current) => {
      const next = new Set([...current].filter((regionId) => nextSourceIds.has(regionId)));
      for (const regionId of nextSourceIds) {
        if (!previousSourceIdsRef.current.has(regionId)) next.add(regionId);
      }
      return next;
    });
    previousSourceIdsRef.current = nextSourceIds;
  }, [sourceIdKey]);

  const model = useMemo(
    () => buildMultiRegionTrendModel(sources, {
      width,
      height,
      visibleRegionIds,
      displaySmoothing: { enabled: true, windowSize: 5 },
      maxPointsPerRegion: 1200,
      layers: {
        formalPoints: showFormalPoints,
        displayTrend: showDisplayTrend,
        afasSmoothed: showAfasSmoothed
      }
    }),
    [sources, visibleRegionIds, showFormalPoints, showDisplayTrend, showAfasSmoothed]
  );
  const targetX = targetTemperature !== null &&
    Number.isFinite(targetTemperature) &&
    targetTemperature >= model.xRange.min &&
    targetTemperature <= model.xRange.max
      ? scaleValue(targetTemperature, model.xRange.min, model.xRange.max, model.plot.left, model.plot.right)
      : null;

  function toggleVisibleRegion(regionId: string) {
    setVisibleRegionIds((current) => {
      const next = new Set(current);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const candidates = model.series.flatMap((series) =>
      series.points.map((point) => ({ series, point }))
    );
    if (!candidates.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = {
      x: ((event.clientX - bounds.left) / bounds.width) * model.width,
      y: ((event.clientY - bounds.top) / bounds.height) * model.height
    };
    let nearest = candidates[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const dx = candidate.point.x - pointer.x;
      const dy = candidate.point.y - pointer.y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    setHoverTarget(nearestDistance <= 2500 ? nearest : null);
  }

  return (
    <figure className="multiRegionTrendFigure">
      <figcaption>
        <span>{t("Combined curves")}</span>
        <span>{isRunning ? t("Current run so far") : t("Full run")}</span>
      </figcaption>
      <div className="multiRegionLegend" aria-label={t("Measurement positions")}>
        {model.legend.map((region) => (
          <label key={region.regionId} style={{ "--region-color": region.color } as React.CSSProperties}>
            <input
              checked={region.visible}
              onChange={() => toggleVisibleRegion(region.regionId)}
              type="checkbox"
            />
            <span className="regionColorSwatch" style={{ backgroundColor: region.color }} />
            {measurementRegionDisplayLabel({
              region_id: region.regionId,
              index: 1,
              label: region.regionLabel,
              enabled: true,
              roi: { type: "rotated_rect", center_x: 0, center_y: 0, width: 1, height: 1, angle_deg: 0 },
              color: region.color
            }, language)}
            <small>{region.pointCount.toLocaleString()}</small>
          </label>
        ))}
      </div>
      {variant === "result" ? (
        <div className="multiRegionLayerToggles" aria-label={t("AFAS chart layers")}>
          <label>
            <input checked={showFormalPoints} onChange={(event) => setShowFormalPoints(event.target.checked)} type="checkbox" />
            {t("Formal points")}
          </label>
          <label>
            <input checked={showDisplayTrend} onChange={(event) => setShowDisplayTrend(event.target.checked)} type="checkbox" />
            {t("Live smoothed trend")}
          </label>
          <label>
            <input checked={showAfasSmoothed} onChange={(event) => setShowAfasSmoothed(event.target.checked)} type="checkbox" />
            {t("Smoothed curve")}
          </label>
        </div>
      ) : null}
      <svg
        aria-label={t("Run temperature-distance trend chart")}
        className="multiRegionTrendSvg"
        onMouseLeave={() => setHoverTarget(null)}
        onMouseMove={handleMouseMove}
        role="img"
        viewBox={`0 0 ${model.width} ${model.height}`}
      >
        <rect
          className="multiRegionPlotBackground"
          height={model.plot.bottom - model.plot.top}
          width={model.plot.right - model.plot.left}
          x={model.plot.left}
          y={model.plot.top}
        />
        {model.xTicks.map((tick) => (
          <g className="multiRegionGridTick" key={`x-${tick.value}`}>
            <line x1={tick.position} x2={tick.position} y1={model.plot.top} y2={model.plot.bottom} />
            <text textAnchor="middle" x={tick.position} y={model.plot.bottom + 24}>{tick.label}</text>
          </g>
        ))}
        {model.yTicks.map((tick) => (
          <g className="multiRegionGridTick" key={`y-${tick.value}`}>
            <line x1={model.plot.left} x2={model.plot.right} y1={tick.position} y2={tick.position} />
            <text textAnchor="end" x={model.plot.left - 10} y={tick.position + 4}>{tick.label}</text>
          </g>
        ))}
        <text className="multiRegionAxisLabel" textAnchor="middle" x={(model.plot.left + model.plot.right) / 2} y={model.height - 12}>
          {t(model.xAxisLabel)}
        </text>
        <text
          className="multiRegionAxisLabel"
          textAnchor="middle"
          transform={`rotate(-90 18 ${(model.plot.top + model.plot.bottom) / 2})`}
          x={18}
          y={(model.plot.top + model.plot.bottom) / 2}
        >
          {t(model.yAxisLabel)}
        </text>
        {targetX !== null ? (
          <g className="multiRegionTargetMarker">
            <line x1={targetX} x2={targetX} y1={model.plot.top} y2={model.plot.bottom} />
            <text x={targetX + 8} y={model.plot.top + 16}>{t("Target")} {targetTemperature?.toFixed(2)}°C</text>
          </g>
        ) : null}
        {model.series.map((series) => (
          <g className="multiRegionSeries" key={series.regionId} style={{ color: series.color }}>
            {showDisplayTrend && series.path && series.points.length > 1 ? (
              <polyline points={series.path} style={{ stroke: series.color }} />
            ) : null}
            {showFormalPoints ? series.rawPoints.map((point) => (
              <circle
                className="multiRegionFormalPoint"
                cx={point.x}
                cy={point.y}
                fill={series.color}
                key={`${series.regionId}-formal-${point.frameIndex}-${point.temperature}`}
                r={series.rawPoints.length === 1 ? 4 : 2.3}
                style={{ fill: series.color }}
              />
            )) : null}
            {showAfasSmoothed && series.afasPath && series.afasPoints.length > 1 ? (
              <polyline className="multiRegionAfasLine" points={series.afasPath} style={{ stroke: series.color }} />
            ) : null}
            {showDisplayTrend && series.latestPoint ? (
              <circle
                className="multiRegionLatestPoint"
                cx={series.latestPoint.x}
                cy={series.latestPoint.y}
                r={5.5}
                style={{ fill: series.color, stroke: series.color }}
              />
            ) : null}
          </g>
        ))}
        {!model.hasPoints ? (
          <text className="curveEmptyText" textAnchor="middle" x={(model.plot.left + model.plot.right) / 2} y={(model.plot.top + model.plot.bottom) / 2}>
            {t("No formal temperature-distance points")}
          </text>
        ) : null}
        {hoverTarget ? <MultiRegionTrendTooltip target={hoverTarget} model={model} /> : null}
      </svg>
    </figure>
  );
}

function MultiRegionTrendTooltip({
  target,
  model
}: {
  target: { series: MultiRegionTrendModel["series"][number]; point: MultiRegionTrendPoint };
  model: MultiRegionTrendModel;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const { point, series } = target;
  const lines = language === "zh"
    ? [
        `位置：${measurementRegionDisplayLabel({ region_id: series.regionId, index: series.regionIndex, label: series.regionLabel, enabled: true, roi: { type: "rotated_rect", center_x: 0, center_y: 0, width: 1, height: 1, angle_deg: 0 }, color: series.color }, language)}`,
        `温度：${point.temperature.toFixed(2)} °C`,
        `距离：${point.distance.toFixed(2)} 像素`,
        `帧号：${point.frameIndex ?? t("No data")}`,
        `检测：${point.detectionStatus ?? t("No data")} · 同步：${point.syncStatus ?? t("No data")}`
      ]
    : [
        `position: ${measurementRegionDisplayLabel({ region_id: series.regionId, index: series.regionIndex, label: series.regionLabel, enabled: true, roi: { type: "rotated_rect", center_x: 0, center_y: 0, width: 1, height: 1, angle_deg: 0 }, color: series.color }, language)}`,
        `temperature: ${point.temperature.toFixed(2)} °C`,
        `distance: ${point.distance.toFixed(2)} px`,
        `frame: ${point.frameIndex ?? "None"}`,
        `detection: ${point.detectionStatus ?? "None"} · sync: ${point.syncStatus ?? "None"}`
      ];
  const boxWidth = 280;
  const boxHeight = 92;
  const x = point.x > model.plot.right - boxWidth - 12 ? point.x - boxWidth - 12 : point.x + 12;
  const y = point.y > model.plot.bottom - boxHeight - 12 ? point.y - boxHeight - 12 : point.y + 12;
  return (
    <g className="multiRegionTooltip">
      <rect height={boxHeight} rx={6} width={boxWidth} x={x} y={y} />
      {lines.map((line, index) => (
        <text key={line} x={x + 10} y={y + 18 + index * 16}>{line}</text>
      ))}
    </g>
  );
}

function RunTrendChart({
  analysis,
  runId,
  isRunning,
  targetTemperature,
  diagnostics,
  displaySmoothing,
  compact = false
}: {
  analysis: AnalysisResult;
  runId: string | null;
  isRunning: boolean;
  targetTemperature: number | null;
  diagnostics?: LiveRunDiagnostics | null;
  displaySmoothing?: LiveDisplaySmoothingOptions;
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
      },
      displaySmoothing
    }),
    [analysis, stickyYAxisEnabled, stickyYRange, displaySmoothing?.enabled, displaySmoothing?.windowSize]
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
    const candidates = [...model.formalPoints, ...model.referencePoints, ...model.previewPoints];
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
      {diagnostics ? <RunLiveDiagnostics diagnostics={diagnostics} compact={compact} /> : null}
      <figure className="runTrendFigure">
        <figcaption>
          <span>{t(model.sourceLabel)}</span>
          {model.previewPoints.length ? (
            <span title={runTrendPreviewExplanation(language)}>
              {t(model.previewLabel)} · {runTrendPreviewStatusLabel(model.previewStatus, language)}
            </span>
          ) : null}
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
          {model.previewSegments.map((segment, index) => (
            segment.length > 1 ? (
              <polyline
                className="runTrendPreviewLine"
                key={`run-preview-segment-${index}`}
                points={segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")}
              />
            ) : null
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

function RunLiveDiagnostics({
  diagnostics,
  compact = false
}: {
  diagnostics: LiveRunDiagnostics;
  compact?: boolean;
}) {
  const language = useUiLanguage();
  const t = useUiText();
  const missingMessage = livePointStatusMessage({
    temperature_distance_present: diagnostics.latestCurvePointPresent,
    temperature_distance_point_count: diagnostics.formalTemperatureDistancePointCount,
    reason_if_missing: diagnostics.latestCurvePointMissingReason,
    detection_status: diagnostics.detectionStatus ?? "",
    curve_point_status: diagnostics.curvePointStatus ?? "",
    temperature_sync_status: diagnostics.temperatureSyncStatus ?? "",
    distance_outlier_filtered: diagnostics.distanceOutlierFiltered
  });
  const showMissingMessage =
    !diagnostics.latestCurvePointPresent &&
    missingMessage.length > 0 &&
    diagnostics.latestDetectionDistancePx !== null &&
    diagnostics.latestDetectionTemperatureC !== null;
  return (
    <div className="runLiveDiagnostics">
      <dl className="runValueStrip runValueStrip--diagnostics">
        <RunValue label="Formal temp-distance points" value={diagnostics.formalTemperatureDistancePointCount.toLocaleString()} />
        <RunValue label="Latest formal frame" value={diagnostics.lastFormalPointFrameIndex?.toLocaleString() ?? uiNone(language)} />
        {compact ? null : (
          <>
            <RunValue label="Latest formal temperature" value={formatNullableNumber(diagnostics.lastFormalPointTemperature, " °C", 2, language)} />
            <RunValue label="Latest formal distance" value={formatNullableNumber(diagnostics.lastFormalPointDistance, uiNumberSuffix(language, " px"), 1, language)} />
          </>
        )}
      </dl>
      {showMissingMessage ? <p className="runPointNotice">{t(missingMessage)}</p> : null}
    </div>
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
  if (source === "smoothed") return uiText(language, "AFAS preprocessing preview");
  if (source === "grouped") return uiText(language, "AFAS preprocessing preview");
  if (source === "live_smoothed") return uiText(language, "Live smoothed trend");
  return uiText(language, "Live temperature-distance points");
}

function runTrendPreviewStatusLabel(status: string | null, language: UiLanguage = "en"): string {
  if (status === "updated") return uiText(language, "updated");
  if (status === "unchanged") return uiText(language, "preview unchanged");
  if (status === "deferred_until_complete") return uiText(language, "deferred until complete");
  return uiText(language, "batch-updated trend reference");
}

function runTrendPreviewExplanation(language: UiLanguage = "en"): string {
  if (language === "zh") {
    return "平滑曲线来自 AFAS 预处理，会按温度分组并进行 Savitzky-Golay 平滑。它可能与逐帧原始点不完全一致。实时判断请以原始正式点为准。该曲线按批次更新，仅用于趋势参考，不代表逐帧实时数据。";
  }
  return "The smoothed curve is generated by AFAS preprocessing using temperature grouping and Savitzky-Golay smoothing. It may differ from frame-by-frame points. Use formal live points for real-time monitoring. This is a batch-updated trend reference, not frame-by-frame live data.";
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
  if (
    value === "BalloonEnvelopeDetector" ||
    value === "BundleEnvelopeDetector" ||
    value === "ContrastWidestSpanDetector" ||
    value === "LegacyBundleEnvelopeDetector" ||
    value === "ReservedObjectDetector"
  ) {
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
    detector_mode: "default",
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: createDefaultRoiForShape(shape),
    detector_config: DEFAULT_CONFIG
  };
}

function toOperatorActualUseMeasurement(measurement: MeasurementDefinition): MeasurementDefinition {
  return normalizeMeasurementRegions({
    ...measurement,
    source: "real_camera",
    object_class: "C_BUNDLE_ENVELOPE",
    detector: "BundleEnvelopeDetector",
    detector_mode: "contrast_widest_span",
    width_mode: "max_width",
    detector_config: {
      ...DEFAULT_CONFIG,
      ...measurement.detector_config,
      distance_outlier_filter_enabled: true
    }
  });
}

function currentSourceProvenance({
  operatorDataSource,
  selectedDataset,
  cameraPreview,
  probe,
  liveRun,
  runResult,
  sourceStatus
}: {
  operatorDataSource: OperatorDataSource;
  selectedDataset: OfflineDatasetListItem;
  cameraPreview: CameraPreviewResponse | null;
  probe: ProbeResponse | null;
  liveRun: LiveRunState | null;
  runResult: RunResponse | null;
  sourceStatus?: OperatorSourceStatus | null;
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
    sourceStatus?.provenance ??
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

function operatorStartButtonLabel(source: OperatorDataSource): string {
  if (source === "offline_dataset") {
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

function operatorSourceStatusRetryDelayMs(retryCount: number): number {
  const index = Math.min(
    Math.max(0, retryCount),
    OPERATOR_SOURCE_STATUS_RETRY_DELAYS_MS.length - 1
  );
  return OPERATOR_SOURCE_STATUS_RETRY_DELAYS_MS[index];
}

function sameOperatorSourceStatus(
  previous: OperatorSourceStatus | null,
  nextStatus: OperatorSourceStatus | null
): boolean {
  return JSON.stringify(previous) === JSON.stringify(nextStatus);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function formatOperatorLastCheckedAt(timestampMs: number | null, language: UiLanguage): string {
  if (timestampMs === null) return uiText(language, "Not checked");
  return new Date(timestampMs).toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function createInitialLiveRun(
  datasetId: string,
  startFrame: number,
  frameCount: number,
  measurement: MeasurementDefinition
): LiveRunState {
  const totalFrames = Math.max(1, frameCount - startFrame + 1);
  const runId = `pending-${datasetId}-${Date.now()}`;
  return {
    runId,
    datasetId,
    operatorDataSource: "offline_dataset",
    provenance: null,
    status: "running",
    statusMessage: "",
    frameIndex: startFrame,
    frameUrl: frameIndexImageUrl(datasetId, startFrame, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount,
    totalFrames,
    processedFrames: 0,
    frameShape: null,
    detectionResult: null,
    analysis: emptyAnalysis(runId),
    regionLiveStateById: emptyRegionLiveState(measurement),
    analysisProgress: null,
    diagnostics: emptyLiveRunDiagnostics()
  };
}

function createInitialRealCameraLiveRun(measurement: MeasurementDefinition): LiveRunState {
  const runId = `pending-real_camera-${Date.now()}`;
  return {
    runId,
    datasetId: "real_camera",
    operatorDataSource: "real_camera",
    provenance: null,
    status: "running",
    statusMessage: "",
    frameIndex: 0,
    frameUrl: "",
    frameCount: 0,
    totalFrames: 0,
    processedFrames: 0,
    frameShape: null,
    detectionResult: null,
    analysis: emptyAnalysis(runId),
    regionLiveStateById: emptyRegionLiveState(measurement),
    analysisProgress: null,
    diagnostics: emptyLiveRunDiagnostics()
  };
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
    statusMessage: "",
    frameIndex: event.frame_index,
    frameUrl: apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: 0,
    frameShape: event.frame_record.shape,
    detectionResult: null,
    analysis: emptyAnalysis(runId),
    regionLiveStateById: {},
    analysisProgress: null,
    diagnostics: emptyLiveRunDiagnostics()
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
  const diagnostics = buildLiveRunDiagnostics(previous.diagnostics, event, analysis, detection);
  const regionLiveStateById = appendRegionFrameEvent(previous.regionLiveStateById, event, {
    smoothingWindowSize: 5
  });
  return {
    ...previous,
    runId,
    datasetId: event.dataset_id,
    operatorDataSource: event.operator_data_source === "real_camera" ? "real_camera" : event.operator_data_source === "offline_dataset" ? "offline_dataset" : previous.operatorDataSource,
    provenance: event.provenance ?? previous.provenance,
    status: "running",
    statusMessage: "",
    frameIndex: event.frame_index,
    frameUrl: refreshPreview ? apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }) : previous.frameUrl,
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: event.processed_frames,
    frameShape: refreshPreview ? event.frame_record.shape : previous.frameShape,
    detectionResult: detection,
    analysis,
    regionLiveStateById,
    analysisProgress: null,
    diagnostics
  };
}

function updateLiveRunFromRegionAnalysis(
  current: LiveRunState | null,
  event: LiveOfflineAnalysisRegionEvent
): LiveRunState | null {
  if (!current) return current;
  let analysis = current.analysis;
  if (event.event === "analysis_region_complete" && event.region_analysis) {
    const regions = [...(analysis.regions ?? [])];
    const existingIndex = regions.findIndex((region) => region.region_id === event.region_id);
    if (existingIndex >= 0) regions[existingIndex] = event.region_analysis;
    else regions.push(event.region_analysis);
    analysis = {
      ...analysis,
      regions: regions.sort((left, right) => left.region_index - right.region_index)
    };
  }
  return {
    ...current,
    status: "running",
    statusMessage: "Building result analysis",
    analysis,
    analysisProgress: {
      current: event.current,
      total: event.total,
      regionId: event.region_id,
      regionLabel: event.region_label
    }
  };
}

function isLiveProgressEvent(event: { event: string }): event is LiveOfflineProgressEvent {
  return event.event === "stopping" || event.event === "saving_manifest" || event.event === "building_analysis";
}

function updateLiveRunFromProgress(
  current: LiveRunState | null,
  event: LiveOfflineProgressEvent
): LiveRunState | null {
  if (!current) return current;
  return {
    ...current,
    runId: event.run_id || current.runId,
    datasetId: event.dataset_id ?? current.datasetId,
    operatorDataSource: event.operator_data_source === "real_camera"
      ? "real_camera"
      : event.operator_data_source === "offline_dataset"
        ? "offline_dataset"
        : current.operatorDataSource,
    status: "running",
    statusMessage: liveRunProgressLabel(event.event),
    processedFrames: event.processed_frames,
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
  };
}

function liveRunProgressLabel(event: LiveOfflineProgressEvent["event"]): string {
  if (event === "stopping") return "Collecting stop request";
  if (event === "saving_manifest") return "Saving run data";
  return "Building result analysis";
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

function measurementRegionDisplayLabel(region: MeasurementRegion, language: UiLanguage): string {
  const match = /^(?:位置|Position)\s+(\d+)$/i.exec(region.label.trim());
  return match ? `${uiText(language, "Position")} ${match[1]}` : region.label;
}

function regionAnalysisMeasurementRegion(region: RegionAnalysisResult): MeasurementRegion {
  return {
    region_id: region.region_id,
    index: region.region_index,
    label: region.region_label,
    enabled: true,
    roi: { type: "rotated_rect", center_x: 0, center_y: 0, width: 1, height: 1, angle_deg: 0 },
    color: region.color
  };
}

function analysisRegionTrendSources(analysis: AnalysisResult | null): RegionTrendSource[] {
  return analysis?.regions?.map((region) => ({
    region_id: region.region_id,
    region_index: region.region_index,
    region_label: region.region_label,
    color: region.color,
    temperature_distance: region.temperature_distance,
    all_frames: region.all_frames,
    afas_preprocessing: region.afas_preprocessing
  })) ?? [];
}

function readAfasStatusForRegion(region: RegionAnalysisResult): string {
  const status = region.afas_analysis.result_status;
  return typeof status === "string" ? status : "unavailable";
}

function analysisProgressLabel(
  progress: NonNullable<LiveRunState["analysisProgress"]>,
  language: UiLanguage
): string {
  return uiText(language, "Analyzing position {current}/{total}")
    .replace("{current}", String(progress.current))
    .replace("{total}", String(progress.total));
}

function updatePrimaryMeasurementRoi(
  measurement: MeasurementDefinition,
  roi: RotatedROI
): MeasurementDefinition {
  if (!measurement.regions?.length) return { ...measurement, roi };
  const primary = [...measurement.regions]
    .filter((region) => region.enabled)
    .sort((left, right) => left.index - right.index)[0];
  return primary ? updateRegionRoi(measurement, primary.region_id, roi) : { ...measurement, roi };
}

function regionResultFromDetection(
  region: MeasurementRegion,
  detection: DetectionResult
): RegionResult {
  return {
    region_id: region.region_id,
    region_index: region.index,
    region_label: region.label,
    color: region.color,
    detection_result: detection,
    curve_points: {
      distance_time: null,
      temperature_time: null,
      temperature_distance: null
    }
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
