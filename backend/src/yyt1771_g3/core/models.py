from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from yyt1771_g3.core.enums import (
    CurvePointStatus,
    DetectorMode,
    DetectionStatus,
    DetectorType,
    MeasurementCoordinateKind,
    MeasurementSource,
    ObjectClass,
    TemperatureSyncStatus,
    WidthMode,
)


REGION_COLORS = (
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#06b6d4",
)
MIN_MEASUREMENT_REGIONS = 1
MAX_MEASUREMENT_REGIONS = len(REGION_COLORS)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class G3Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        use_enum_values=False,
        validate_assignment=True,
        populate_by_name=True,
    )


class RotatedROI(G3Model):
    type: Literal["rotated_rect"] = "rotated_rect"
    center_x: float
    center_y: float
    width: float
    height: float
    angle_deg: float = 0.0

    @field_validator("width", "height")
    @classmethod
    def _positive_size(cls, value: float, info) -> float:  # noqa: ANN001
        if value <= 0:
            raise ValueError(f"{info.field_name} must be > 0")
        return value


class MeasurementRegion(G3Model):
    region_id: str
    index: int
    label: str
    enabled: bool = True
    roi: RotatedROI
    color: str

    @field_validator("region_id", "label")
    @classmethod
    def _non_empty_text(cls, value: str, info) -> str:  # noqa: ANN001
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError(f"{info.field_name} must not be empty")
        return normalized

    @field_validator("index")
    @classmethod
    def _positive_index(cls, value: int) -> int:
        normalized = int(value)
        if normalized <= 0:
            raise ValueError("index must be > 0")
        return normalized

    @field_validator("color")
    @classmethod
    def _hex_color(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if len(normalized) != 7 or not normalized.startswith("#"):
            raise ValueError("color must use #RRGGBB format")
        try:
            int(normalized[1:], 16)
        except ValueError as exc:
            raise ValueError("color must use #RRGGBB format") from exc
        return normalized


class DetectorConfig(G3Model):
    tie_width_epsilon_px: float = 2.0
    switch_after_n_frames: int = 3
    jump_limit_px: float = 35.0
    min_confidence: float = 0.15
    contrast_threshold: float = 55.0
    dark_enhance_bg_kernel_px: int = 41
    hysteresis_low_ratio: float = 0.45
    mask_open_kernel_px: int = 3
    mask_close_kernel_px: int = 11
    mask_dilate_kernel_px: int = 1
    min_component_area_px: int = 80
    envelope_quantile: float = 0.02
    envelope_window_px: int = 9
    envelope_step_px: int = 2
    min_window_pixels: int = 8
    window_width_keep_ratio: float = 0.2
    window_count_keep_ratio: float = 0.15
    contour_projection_quantile: float = 0.002
    contour_close_kernel: int = 21
    contour_close_kernel_px: int = 21
    contour_smooth_window: int = 7
    mesh_min_width_ratio: float = 0.25
    mesh_min_height_ratio: float = 0.15
    mesh_region_margin_px: int = 30
    mesh_row_width_keep_ratio: float = 0.45
    mesh_row_count_keep_ratio: float = 0.35
    envelope_width_percentile: float = 95.0
    envelope_width_outlier_epsilon_px: float = 8.0
    envelope_min_consensus_rows: int = 3
    boundary_support_window_px: int = 9
    boundary_support_min_pixels: int = 6
    boundary_support_min_ratio: float = 0.05
    boundary_support_enabled: bool = True
    distance_jump_limit_px: float = 18.0
    distance_jump_hold_frames: int = 2
    distance_jump_policy: Literal["hold_previous", "mark_invalid"] = "hold_previous"
    temporal_stabilization_enabled: bool = False
    temporal_stabilization_strength: Literal["weak", "medium", "strong"] = "medium"
    save_temporal_masks: bool = False
    contour_box_mode: Literal["component_bbox", "robust_component_bbox", "measurement_band"] = "component_bbox"
    contour_box_padding_px: float = 8.0
    contour_box_quantile: float = 0.0
    contour_box_min_coverage_ratio: float = 0.995
    show_measurement_band_box: bool = True
    roi_edge_guard_px: float = 5.0
    detection_roi_padding_px: float = 0.0
    bubble_suppress_enabled: bool = True
    bubble_local_radius_px: int = 31
    bubble_bright_z_threshold: float = 1.2
    bubble_min_area_px: int = 20
    bubble_max_area_px: int = 800
    bubble_max_bbox_px: int = 60
    bubble_max_aspect_ratio: float = 2.5
    bubble_min_compactness: float = 0.12
    bubble_suppress_radius_px: int = 10
    bubble_suppress_measurement_only: bool = False
    dark_line_filter_enabled: bool = True
    dark_line_filter_length_px: int = 17
    dark_line_filter_width_px: int = 3
    dark_line_min_response: float = 0.0
    endpoint_min_dark_line_response: float = 0.0
    spur_prune_enabled: bool = True
    spur_prune_max_length_px: int = 35
    spur_prune_dilate_px: int = 3
    spur_prune_min_ridge_response: float = 0.0
    spur_prune_require_bubble_overlap_or_low_ridge: bool = True
    wire_threshold_scale: float = 0.9
    wire_min_response: float = 8.0
    wire_bridge_kernel_px: int = 3
    wire_min_component_area_px: int = 12
    wire_min_length_px: float = 28.0
    wire_min_elongation: float = 2.2
    wire_box_padding_px: float = 12.0
    wire_support_merge_gap_ratio: float = 0.06
    processing_scale_enabled: bool = True
    processing_scale: float = 0.5
    processing_scale_mode: Literal["area_downsample", "gaussian_pyramid"] = "area_downsample"
    refine_endpoint_on_full_res: bool = True
    full_res_refine_band_px: int = 12
    detector_execution_mode: Literal["fast", "enhanced", "diagnostics"] = "diagnostics"
    show_advanced_diagnostics: bool = False
    run_detector_mode: Literal["fast", "enhanced", "diagnostics"] = "fast"
    run_diagnostics_mode: Literal["off", "suspicious_only", "every_frame"] = "suspicious_only"
    run_preview_fps: int = 5
    run_result_batch_size: int = 10
    run_enhanced_detector_on_suspicious: bool = True
    run_enhanced_detector_policy: Literal["never", "rerun_worthy_only", "all_suspicious"] = "rerun_worthy_only"
    endpoint_jump_limit_px: float = 12.0
    endpoint_jump_warmup_frames: int = 3
    endpoint_jump_confirm_frames: int = 2
    suspicious_boundary_reject_ratio: float = 0.35
    suspicious_outlier_reject_count: int = 1
    max_frames_per_run: int = 160
    live_offline_fps: float = 8.0
    setup_preview_fps: float = 0.0
    target_temperature_celsius: float | None = None
    temperature_power_percent: float = 100.0
    temperature_serial_port: str = ""
    distance_outlier_filter_enabled: bool = True
    distance_outlier_reference_count: int = 5
    distance_outlier_max_jump_px: float = 100.0
    distance_outlier_baseline: Literal["last", "mean", "median"] = "median"

    @field_validator(
        "switch_after_n_frames",
        "min_component_area_px",
        "mesh_region_margin_px",
        "envelope_min_consensus_rows",
        "boundary_support_window_px",
        "boundary_support_min_pixels",
        "distance_jump_hold_frames",
        "bubble_local_radius_px",
        "bubble_min_area_px",
        "bubble_max_area_px",
        "bubble_max_bbox_px",
        "bubble_suppress_radius_px",
        "dark_line_filter_length_px",
        "dark_line_filter_width_px",
        "spur_prune_max_length_px",
        "spur_prune_dilate_px",
        "wire_min_component_area_px",
        "full_res_refine_band_px",
        "run_preview_fps",
        "run_result_batch_size",
        "endpoint_jump_confirm_frames",
        "suspicious_outlier_reject_count",
        "max_frames_per_run",
        "contour_smooth_window",
    )
    @classmethod
    def _positive_int(cls, value: int, info) -> int:  # noqa: ANN001
        if value <= 0:
            raise ValueError(f"{info.field_name} must be > 0")
        return value

    @field_validator("contour_close_kernel")
    @classmethod
    def _positive_optional_int(cls, value: int | None, info) -> int | None:  # noqa: ANN001
        if value is not None and value <= 0:
            raise ValueError(f"{info.field_name} must be > 0")
        return value

    @field_validator("endpoint_jump_warmup_frames")
    @classmethod
    def _non_negative_int(cls, value: int, info) -> int:  # noqa: ANN001
        if value < 0:
            raise ValueError(f"{info.field_name} must be >= 0")
        return value

    @field_validator("processing_scale")
    @classmethod
    def _clamp_processing_scale(cls, value: float) -> float:
        return max(0.25, min(1.0, float(value)))

    @field_validator("setup_preview_fps")
    @classmethod
    def _clamp_setup_preview_fps(cls, value: float) -> float:
        return max(0.0, float(value))

    @field_validator("contrast_threshold")
    @classmethod
    def _clamp_contrast_threshold(cls, value: float) -> float:
        return max(0.0, min(255.0, float(value)))

    @field_validator("distance_outlier_reference_count")
    @classmethod
    def _clamp_distance_outlier_reference_count(cls, value: int) -> int:
        return max(1, min(20, int(value)))

    @field_validator("distance_outlier_max_jump_px")
    @classmethod
    def _clamp_distance_outlier_max_jump_px(cls, value: float) -> float:
        return max(1.0, min(200.0, float(value)))

    @field_validator("temperature_serial_port")
    @classmethod
    def _strip_temperature_serial_port(cls, value: str) -> str:
        return str(value or "").strip()


class MeasurementDefinition(G3Model):
    measurement_id: str = "default"
    source: MeasurementSource = MeasurementSource.OFFLINE_DATASET
    object_class: ObjectClass
    detector: DetectorType
    detector_mode: DetectorMode = DetectorMode.DEFAULT
    width_mode: WidthMode = WidthMode.MAX_WIDTH
    measurement_coordinates: MeasurementCoordinateKind = MeasurementCoordinateKind.SOURCE_PIXEL
    roi: RotatedROI | None = None
    regions: list[MeasurementRegion] = Field(default_factory=list)
    detector_config: DetectorConfig = Field(default_factory=DetectorConfig)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_roi(cls, value: Any) -> Any:
        if isinstance(value, cls):
            return value
        if not isinstance(value, dict):
            return value
        payload = dict(value)
        regions = payload.get("regions")
        roi = payload.get("roi")
        if not regions and roi is not None:
            payload["regions"] = [
                {
                    "region_id": "region_1",
                    "index": 1,
                    "label": "位置 1",
                    "enabled": True,
                    "roi": roi,
                    "color": REGION_COLORS[0],
                }
            ]
        return payload

    @model_validator(mode="after")
    def _validate_width_mode(self) -> "MeasurementDefinition":
        if self.object_class in {
            ObjectClass.A_BALLOON_ENVELOPE,
            ObjectClass.C_BUNDLE_ENVELOPE,
        } and self.width_mode != WidthMode.MAX_WIDTH:
            raise ValueError("A/C object classes only support max_width in G3 phase 1")

        region_count = len(self.regions)
        if not MIN_MEASUREMENT_REGIONS <= region_count <= MAX_MEASUREMENT_REGIONS:
            raise ValueError(
                f"regions count must be between {MIN_MEASUREMENT_REGIONS} and {MAX_MEASUREMENT_REGIONS}"
            )
        region_ids = [region.region_id for region in self.regions]
        if len(set(region_ids)) != len(region_ids):
            raise ValueError("region_id values must be unique")
        region_indices = [region.index for region in self.regions]
        if len(set(region_indices)) != len(region_indices):
            raise ValueError("region index values must be unique")
        enabled = self.enabled_regions
        if not enabled:
            raise ValueError("at least one enabled region is required")
        object.__setattr__(self, "roi", enabled[0].roi)
        return self

    @property
    def enabled_regions(self) -> list[MeasurementRegion]:
        return sorted((region for region in self.regions if region.enabled), key=lambda region: region.index)


class FrameRecord(G3Model):
    frame_index: int
    shape: list[int]
    dtype: str
    source: str
    frame_path: str = ""
    raw_frame_saved: bool = False
    preview_path: str = ""
    timestamp_ms: int | None = None
    camera_meta: dict[str, Any] = Field(default_factory=dict)


class TemperatureRecord(G3Model):
    timestamp_ms: int | None = None
    celsius: float | None = None
    source: str = ""
    sampled_this_frame: bool = False
    error: str = ""


class ABPoint(G3Model):
    x: float
    y: float


class ABPoints(G3Model):
    a: ABPoint
    b: ABPoint


class DetectionCandidate(G3Model):
    candidate_id: str
    axis_position_px: float
    width_px: float
    a: ABPoint
    b: ABPoint
    confidence: float = 0.0
    rejected_reason: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class DetectionQuality(G3Model):
    confidence: float = 0.0
    edge_strength: float | None = None
    contour_area: float | None = None
    roi_coverage: float | None = None
    jump_from_previous_px: float | None = None


class DetectionResult(G3Model):
    frame_index: int
    detection_status: DetectionStatus
    region_id: str = "region_1"
    region_index: int = 1
    region_label: str = "位置 1"
    region_color: str = REGION_COLORS[0]
    ab_points: ABPoints | None = None
    measurement_segment: list[ABPoint] | None = None
    distance_px: float | None = None
    raw_ab_points: ABPoints | None = None
    raw_distance_px: float | None = None
    stabilized_ab_points: ABPoints | None = None
    stabilized_distance_px: float | None = None
    result_display_source: Literal["raw", "stabilized"] = "raw"
    raw_best_candidate: DetectionCandidate | None = None
    selected_candidate: DetectionCandidate | None = None
    stabilized_candidate: DetectionCandidate | None = None
    rejected_candidates: list[DetectionCandidate] = Field(default_factory=list)
    quality: DetectionQuality = Field(default_factory=DetectionQuality)
    rejected_reason: str = ""
    curve_point_status: CurvePointStatus = CurvePointStatus.VALID
    curve_exclusion_reason: str = ""
    raw_detected_distance_px: float | None = None
    distance_outlier_filtered: bool = False
    distance_outlier_baseline_px: float | None = None
    distance_outlier_deviation_px: float | None = None
    distance_outlier_max_jump_px: float | None = None
    distance_outlier_reference_count: int | None = None
    distance_outlier_reference_values: list[float] = Field(default_factory=list)
    debug_artifacts: dict[str, Any] = Field(default_factory=dict)
    temperature_sync_status: TemperatureSyncStatus = TemperatureSyncStatus.TEMP_SYNC_MISSING
    frame_timestamp_ms: int | None = None
    temperature_timestamp_ms: int | None = None
    temperature_celsius: float | None = None
    temperature_delta_ms: float | None = None
    temperature_source: str = ""
    temperature_sampled_this_frame: bool = False

    @model_validator(mode="after")
    def _validate_validity_contract(self) -> "DetectionResult":
        if self.detection_status == DetectionStatus.VALID:
            if self.ab_points is None or self.distance_px is None or self.selected_candidate is None:
                raise ValueError("VALID detection requires ab_points, distance_px, and selected_candidate")
            if self.measurement_segment is None:
                self.measurement_segment = [self.ab_points.a, self.ab_points.b]
            if self.raw_ab_points is None:
                self.raw_ab_points = self.ab_points
            if self.raw_distance_px is None:
                self.raw_distance_px = self.distance_px
            if self.raw_detected_distance_px is None:
                self.raw_detected_distance_px = self.distance_px
            if self.curve_point_status == CurvePointStatus.INVALID_DETECTION:
                self.curve_point_status = CurvePointStatus.VALID
        elif self.ab_points is not None or self.measurement_segment is not None or self.distance_px is not None:
            raise ValueError("INVALID detection must not carry formal ab_points or distance_px")
        elif self.curve_point_status == CurvePointStatus.VALID:
            self.curve_point_status = CurvePointStatus.INVALID_DETECTION
            if not self.curve_exclusion_reason:
                self.curve_exclusion_reason = self.rejected_reason or self.detection_status.value
        return self


class ExportArtifact(G3Model):
    artifact_id: str
    artifact_type: str
    path: str
    source_run_id: str | None = None
    source_analysis_id: str | None = None
    created_at: str = Field(default_factory=utc_now_iso)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunManifest(G3Model):
    run_id: str
    dataset_id: str
    measurement_definition: MeasurementDefinition
    runtime_source: str = ""
    product_mode: str = ""
    operator_data_source: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)
    frame_records: list[FrameRecord] = Field(default_factory=list)
    temperature_records: list[TemperatureRecord] = Field(default_factory=list)
    detection_results: list[DetectionResult] = Field(default_factory=list)
    region_detection_results: list[DetectionResult] = Field(default_factory=list)
    export_artifacts: list[ExportArtifact] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    software: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _normalize_region_detection_results(self) -> "RunManifest":
        if not self.region_detection_results and self.detection_results:
            object.__setattr__(self, "region_detection_results", list(self.detection_results))
        return self


class CurvePoint(G3Model):
    x: float
    y: float
    frame_index: int
    sync_status: TemperatureSyncStatus | None = None


class RegionAnalysisResult(G3Model):
    region_id: str
    region_index: int
    region_label: str
    color: str
    all_frames: list[DetectionResult] = Field(default_factory=list)
    distance_time: list[CurvePoint] = Field(default_factory=list)
    raw_distance_time: list[CurvePoint] = Field(default_factory=list)
    stabilized_distance_time: list[CurvePoint] = Field(default_factory=list)
    temperature_time: list[CurvePoint] = Field(default_factory=list)
    temperature_distance: list[CurvePoint] = Field(default_factory=list)
    raw_temperature_distance: list[CurvePoint] = Field(default_factory=list)
    stabilized_temperature_distance: list[CurvePoint] = Field(default_factory=list)
    afas_preprocessing: dict[str, Any] = Field(default_factory=dict)
    afas_analysis: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)


class AnalysisResult(G3Model):
    analysis_id: str
    run_id: str
    runtime_source: str = ""
    product_mode: str = ""
    operator_data_source: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)
    all_frames: list[DetectionResult] = Field(default_factory=list)
    distance_time: list[CurvePoint] = Field(default_factory=list)
    raw_distance_time: list[CurvePoint] = Field(default_factory=list)
    stabilized_distance_time: list[CurvePoint] = Field(default_factory=list)
    temperature_time: list[CurvePoint] = Field(default_factory=list)
    temperature_distance: list[CurvePoint] = Field(default_factory=list)
    raw_temperature_distance: list[CurvePoint] = Field(default_factory=list)
    stabilized_temperature_distance: list[CurvePoint] = Field(default_factory=list)
    afas_preprocessing: dict[str, Any] = Field(default_factory=dict)
    afas_analysis: dict[str, Any] = Field(default_factory=dict)
    regions: list[RegionAnalysisResult] = Field(default_factory=list)
    export_artifacts: list[ExportArtifact] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)

    @model_validator(mode="after")
    def _normalize_regions_and_legacy_fields(self) -> "AnalysisResult":
        if not self.regions:
            object.__setattr__(
                self,
                "regions",
                [
                    RegionAnalysisResult(
                        region_id="region_1",
                        region_index=1,
                        region_label="位置 1",
                        color=REGION_COLORS[0],
                        all_frames=list(self.all_frames),
                        distance_time=list(self.distance_time),
                        raw_distance_time=list(self.raw_distance_time),
                        stabilized_distance_time=list(self.stabilized_distance_time),
                        temperature_time=list(self.temperature_time),
                        temperature_distance=list(self.temperature_distance),
                        raw_temperature_distance=list(self.raw_temperature_distance),
                        stabilized_temperature_distance=list(self.stabilized_temperature_distance),
                        afas_preprocessing=dict(self.afas_preprocessing),
                        afas_analysis=dict(self.afas_analysis),
                    )
                ],
            )
        first = sorted(self.regions, key=lambda region: region.region_index)[0]
        for field_name in (
            "all_frames",
            "distance_time",
            "raw_distance_time",
            "stabilized_distance_time",
            "temperature_time",
            "temperature_distance",
            "raw_temperature_distance",
            "stabilized_temperature_distance",
            "afas_preprocessing",
            "afas_analysis",
        ):
            value = getattr(first, field_name)
            object.__setattr__(self, field_name, value.copy() if hasattr(value, "copy") else value)
        return self
