from __future__ import annotations

from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:
        return self.value


class ObjectClass(StrEnum):
    A_BALLOON_ENVELOPE = "A_BALLOON_ENVELOPE"
    C_BUNDLE_ENVELOPE = "C_BUNDLE_ENVELOPE"
    D_RESERVED_OBJECT = "D_RESERVED_OBJECT"


class DetectorType(StrEnum):
    BALLOON_ENVELOPE = "BalloonEnvelopeDetector"
    BUNDLE_ENVELOPE = "BundleEnvelopeDetector"
    CONTRAST_WIDEST_SPAN = "ContrastWidestSpanDetector"
    LEGACY_BUNDLE_ENVELOPE = "LegacyBundleEnvelopeDetector"
    RESERVED_OBJECT = "ReservedObjectDetector"


class DetectorMode(StrEnum):
    DEFAULT = "default"
    C_ENVELOPE_LEGACY = "c_envelope_legacy"
    CONTRAST_WIDEST_SPAN = "contrast_widest_span"


class WidthMode(StrEnum):
    MAX_WIDTH = "max_width"
    MIN_WIDTH = "min_width"


class MeasurementCoordinateKind(StrEnum):
    SOURCE_PIXEL = "source_pixel"


class MeasurementSource(StrEnum):
    OFFLINE_DATASET = "offline_dataset"
    REAL_CAMERA = "real_camera"


class DetectionStatus(StrEnum):
    VALID = "VALID"
    INVALID = "INVALID"
    INVALID_NO_TARGET = "INVALID_NO_TARGET"
    INVALID_LOW_CONFIDENCE = "INVALID_LOW_CONFIDENCE"
    INVALID_BAD_ENVELOPE = "INVALID_BAD_ENVELOPE"
    INVALID_JUMP_EXCEEDS_LIMIT = "INVALID_JUMP_EXCEEDS_LIMIT"
    INVALID_EXTERNAL_SPECK = "INVALID_EXTERNAL_SPECK"
    INVALID_INTERNAL_EDGE_SELECTED = "INVALID_INTERNAL_EDGE_SELECTED"
    INVALID_OUT_OF_ROI = "INVALID_OUT_OF_ROI"


class CurvePointStatus(StrEnum):
    VALID = "valid"
    INVALID_DETECTION = "invalid_detection"
    DISTANCE_JUMP_OUTLIER = "distance_jump_outlier"


class TemperatureSyncStatus(StrEnum):
    TEMP_SYNC_OK = "TEMP_SYNC_OK"
    TEMP_SYNC_INTERPOLATED = "TEMP_SYNC_INTERPOLATED"
    TEMP_SYNC_STALE = "TEMP_SYNC_STALE"
    TEMP_SYNC_MISSING = "TEMP_SYNC_MISSING"
