from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import numpy as np
from scipy.signal import savgol_filter
from scipy.stats import linregress

from yyt1771_g3.core.models import CurvePoint


AFAS_PREPROCESSING_SCHEMA_VERSION = "g3_afas_preprocessing.v0.2"
AFAS_ANALYSIS_SCHEMA_VERSION = "g3_afas_tangent_analysis.v0.2"
MAX_SAVGOL_WINDOW_DATA_FRACTION = 0.55
DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS = 0.01
DEFAULT_MIN_DERIVATIVE_TEMPERATURE_STEP_CELSIUS = 0.01

DEFAULT_AFAS_PREPROCESSING_PARAMETERS = {
    "group_by_temperature": True,
    "temperature_group_bin_celsius": DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
    "outlier_window": 11,
    "outlier_threshold": 5.0,
    "outlier_max_iterations": 3,
    "savgol_window_length": 51,
    "savgol_polyorder": 3,
}

DEFAULT_AFAS_ANALYSIS_PARAMETERS = {
    "low_range_celsius": None,
    "high_range_celsius": None,
    "tangent_offset": 0,
    "min_derivative_temperature_step_celsius": DEFAULT_MIN_DERIVATIVE_TEMPERATURE_STEP_CELSIUS,
}


@dataclass(slots=True)
class AfasPreprocessingParameters:
    group_by_temperature: bool = True
    temperature_group_bin_celsius: float = DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS
    outlier_window: int = 11
    outlier_threshold: float = 5.0
    outlier_max_iterations: int = 3
    savgol_window_length: int = 51
    savgol_polyorder: int = 3

    @classmethod
    def from_mapping(cls, overrides: Mapping[str, Any] | None = None) -> "AfasPreprocessingParameters":
        merged = dict(DEFAULT_AFAS_PREPROCESSING_PARAMETERS)
        if overrides:
            merged.update(dict(overrides))
        return cls(
            group_by_temperature=bool(merged.get("group_by_temperature", True)),
            temperature_group_bin_celsius=max(0.0, float(merged.get(
                "temperature_group_bin_celsius",
                DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
            ))),
            outlier_window=int(merged.get("outlier_window", 11)),
            outlier_threshold=float(merged.get("outlier_threshold", 5.0)),
            outlier_max_iterations=int(merged.get("outlier_max_iterations", 3)),
            savgol_window_length=int(merged.get("savgol_window_length", 51)),
            savgol_polyorder=int(merged.get("savgol_polyorder", 3)),
        )

    def to_payload(self) -> dict[str, Any]:
        return {
            "group_by_temperature": self.group_by_temperature,
            "temperature_group_bin_celsius": self.temperature_group_bin_celsius,
            "outlier_window": self.outlier_window,
            "outlier_threshold": self.outlier_threshold,
            "outlier_max_iterations": self.outlier_max_iterations,
            "savgol_window_length": self.savgol_window_length,
            "savgol_polyorder": self.savgol_polyorder,
        }


@dataclass(slots=True)
class AfasAnalysisParameters:
    low_range_celsius: tuple[float, float] | None = None
    high_range_celsius: tuple[float, float] | None = None
    tangent_offset: int = 0
    min_derivative_temperature_step_celsius: float = DEFAULT_MIN_DERIVATIVE_TEMPERATURE_STEP_CELSIUS

    @classmethod
    def from_mapping(cls, overrides: Mapping[str, Any] | None = None) -> "AfasAnalysisParameters":
        merged = dict(DEFAULT_AFAS_ANALYSIS_PARAMETERS)
        if overrides:
            merged.update(dict(overrides))
        return cls(
            low_range_celsius=_normalize_range(merged.get("low_range_celsius")),
            high_range_celsius=_normalize_range(merged.get("high_range_celsius")),
            tangent_offset=int(merged.get("tangent_offset", 0)),
            min_derivative_temperature_step_celsius=max(0.0, float(merged.get(
                "min_derivative_temperature_step_celsius",
                DEFAULT_MIN_DERIVATIVE_TEMPERATURE_STEP_CELSIUS,
            ))),
        )

    def to_payload(self) -> dict[str, Any]:
        return {
            "low_range_celsius": None if self.low_range_celsius is None else list(self.low_range_celsius),
            "high_range_celsius": None if self.high_range_celsius is None else list(self.high_range_celsius),
            "tangent_offset": self.tangent_offset,
            "min_derivative_temperature_step_celsius": self.min_derivative_temperature_step_celsius,
        }


def build_afas_postprocessing(
    temperature_distance: Sequence[CurvePoint],
    *,
    preprocessing_parameters: Mapping[str, Any] | None = None,
    analysis_parameters: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    preprocessing = preprocess_temperature_distance(
        temperature_distance,
        parameter_overrides=preprocessing_parameters,
    )
    return preprocessing, analyze_preprocessed_afas(
        preprocessing,
        parameter_overrides=analysis_parameters,
    )


def preprocess_temperature_distance(
    temperature_distance: Sequence[CurvePoint],
    *,
    parameter_overrides: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    parameters = AfasPreprocessingParameters.from_mapping(parameter_overrides)
    raw_temperatures = np.asarray([point.x for point in temperature_distance], dtype=float)
    raw_values = np.asarray([point.y for point in temperature_distance], dtype=float)
    raw_frame_indexes = [int(point.frame_index) for point in temperature_distance]

    grouped_points = [
        {
            "bin_key": index,
            "temperature_celsius": float(point.x),
            "distance_px": float(point.y),
            "sample_count": 1,
            "minimum_distance_px": float(point.y),
            "maximum_distance_px": float(point.y),
            "first_frame_index": int(point.frame_index),
            "last_frame_index": int(point.frame_index),
            "representative_frame_index": int(point.frame_index),
        }
        for index, point in enumerate(temperature_distance)
        if np.isfinite(point.x) and np.isfinite(point.y)
    ]
    if parameters.group_by_temperature:
        grouped_points = group_temperature_curve_points(
            temperature_distance,
            bin_celsius=parameters.temperature_group_bin_celsius,
        )
    grouped_temperatures = np.asarray([point["temperature_celsius"] for point in grouped_points], dtype=float)
    grouped_values = np.asarray([point["distance_px"] for point in grouped_points], dtype=float)

    repaired_temperatures, repaired_values, outlier_mask = remove_outliers(
        grouped_temperatures,
        grouped_values,
        window=parameters.outlier_window,
        threshold=parameters.outlier_threshold,
        max_iterations=parameters.outlier_max_iterations,
    )

    warnings: list[str] = []
    smoothing_applied = True
    effective_window: int | None = int(parameters.savgol_window_length)
    smoothing_warning = _full_length_savgol_window_warning(
        len(repaired_values),
        window_length=parameters.savgol_window_length,
    )
    if smoothing_warning is not None:
        smoothing_applied = False
        effective_window = None
        smoothed_temperatures = repaired_temperatures.copy()
        smoothed_values = repaired_values.copy()
    else:
        effective_window, edge_warning = _edge_safe_savgol_window_length(
            len(repaired_values),
            window_length=parameters.savgol_window_length,
            polyorder=parameters.savgol_polyorder,
        )
        if edge_warning is not None:
            warnings.append(edge_warning)
        if effective_window is None:
            smoothing_applied = False
            effective_window = None
            smoothed_temperatures = repaired_temperatures.copy()
            smoothed_values = repaired_values.copy()
        else:
            try:
                smoothed_temperatures, smoothed_values = smooth_data(
                    repaired_temperatures,
                    repaired_values,
                    window_length=effective_window,
                    polyorder=parameters.savgol_polyorder,
                )
            except ValueError as exc:
                smoothing_applied = False
                effective_window = None
                smoothing_warning = str(exc)
                smoothed_temperatures = repaired_temperatures.copy()
                smoothed_values = repaired_values.copy()

    if smoothing_warning is not None:
        warnings.append(smoothing_warning)

    repaired_points = [
        {**point, "distance_px": float(repaired_values[index]), "outlier": bool(outlier_mask[index])}
        for index, point in enumerate(grouped_points)
    ]
    smoothed_points = [
        {**point, "distance_px": float(smoothed_values[index])}
        for index, point in enumerate(grouped_points)
    ]
    return {
        "schema_version": AFAS_PREPROCESSING_SCHEMA_VERSION,
        "parameters": parameters.to_payload(),
        "raw_point_count": len(raw_temperatures),
        "grouped_point_count": len(grouped_points),
        "grouped_temperature_points": grouped_points,
        "repaired_temperature_points": repaired_points,
        "smoothed_temperature_points": smoothed_points,
        "analysis_defaults": dict(DEFAULT_AFAS_ANALYSIS_PARAMETERS),
        "raw": {
            "temperature_celsius": raw_temperatures.tolist(),
            "values": raw_values.tolist(),
            "frame_indexes": raw_frame_indexes,
        },
        "grouped": {
            "temperature_celsius": grouped_temperatures.tolist(),
            "values": grouped_values.tolist(),
            "applied": parameters.group_by_temperature,
        },
        "outlier_repair": {
            "temperature_celsius": repaired_temperatures.tolist(),
            "values": repaired_values.tolist(),
            "outlier_mask": outlier_mask.astype(bool).tolist(),
            "outlier_count": int(np.count_nonzero(outlier_mask)),
        },
        "smoothed": {
            "temperature_celsius": smoothed_temperatures.tolist(),
            "values": smoothed_values.tolist(),
            "applied": smoothing_applied,
            "effective_savgol_window_length": effective_window,
        },
        "warnings": warnings,
    }


def analyze_preprocessed_afas(
    preprocessing: Mapping[str, Any],
    *,
    parameter_overrides: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    smoothed = dict(preprocessing["smoothed"])
    temperatures = np.asarray(smoothed["temperature_celsius"], dtype=float)
    values = np.asarray(smoothed["values"], dtype=float)
    parameters = AfasAnalysisParameters.from_mapping(parameter_overrides)
    warnings = list(preprocessing.get("warnings", []))
    outlier_count = int(dict(preprocessing["outlier_repair"]).get("outlier_count", 0))

    if len(temperatures) < 10:
        return {
            "schema_version": AFAS_ANALYSIS_SCHEMA_VERSION,
            "preprocessing_schema_version": preprocessing.get("schema_version"),
            "parameters": parameters.to_payload(),
            "result_status": "unavailable",
            "reason": "insufficient_points",
            "detail": f"Need at least 10 points for AFAS tangent analysis, got {len(temperatures)}.",
            "warnings": warnings,
            "outlier_count": outlier_count,
            "series": {
                "temperature_celsius": temperatures.tolist(),
                "values": values.tolist(),
                "derivative": [],
            },
            "fit": {},
            "result": {"As": None, "Af_tan": None, "max_slope_temp": None},
        }

    low_range, high_range, range_warnings = _resolve_ranges(temperatures, parameters)
    warnings.extend(range_warnings)

    derivatives = compute_derivative(
        temperatures,
        values,
        min_temperature_step_celsius=parameters.min_derivative_temperature_step_celsius,
    )
    invalid_derivative_count = int(np.count_nonzero(~np.isfinite(derivatives)))
    if invalid_derivative_count:
        warnings.append(
            f"{invalid_derivative_count} derivative points ignored because adjacent temperature spacing was below "
            f"{parameters.min_derivative_temperature_step_celsius:g} °C."
        )
    max_slope_index = find_max_slope_index(derivatives, offset=parameters.tangent_offset)
    tangent_slope, tangent_intercept = compute_tangent_at_point(
        temperatures,
        values,
        derivatives,
        max_slope_index,
    )
    try:
        low_slope, low_intercept = fit_baseline(temperatures, values, *low_range)
        high_slope, high_intercept = fit_baseline(temperatures, values, *high_range)
    except ValueError as exc:
        return {
            "schema_version": AFAS_ANALYSIS_SCHEMA_VERSION,
            "preprocessing_schema_version": preprocessing.get("schema_version"),
            "parameters": {
                **parameters.to_payload(),
                "resolved_low_range_celsius": [float(low_range[0]), float(low_range[1])],
                "resolved_high_range_celsius": [float(high_range[0]), float(high_range[1])],
            },
            "result_status": "unavailable",
            "reason": "insufficient_baseline_points",
            "detail": str(exc),
            "warnings": warnings,
            "outlier_count": outlier_count,
            "series": {
                "temperature_celsius": temperatures.tolist(),
                "values": values.tolist(),
                "derivative": [_optional_float(value) for value in derivatives],
            },
            "fit": {
                "max_slope_index": int(max_slope_index),
                "max_slope_temperature_celsius": _optional_float(temperatures[max_slope_index]),
                "max_slope_value": _optional_float(values[max_slope_index]),
                "low_baseline": _line_payload(low_range, float("nan"), float("nan")),
                "high_baseline": _line_payload(high_range, float("nan"), float("nan")),
                "tangent": _line_payload(None, tangent_slope, tangent_intercept),
            },
            "result": {"As": None, "Af_tan": None, "max_slope_temp": _optional_float(temperatures[max_slope_index])},
        }
    as_value = find_intersection(tangent_slope, tangent_intercept, low_slope, low_intercept)
    af_tan = find_intersection(tangent_slope, tangent_intercept, high_slope, high_intercept)

    result_status = "ok"
    reason = None
    detail = "AFAS tangent analysis completed."
    has_nonfinite_fit = any(
        _optional_float(value) is None
        for value in [tangent_slope, tangent_intercept, low_slope, low_intercept, high_slope, high_intercept]
    )
    if has_nonfinite_fit:
        result_status = "unavailable"
        reason = "nonfinite_fit"
        detail = "Tangent or baseline fitting produced non-finite values; intersections are unavailable."
    elif as_value is None or af_tan is None:
        result_status = "unavailable"
        reason = "parallel_lines"
        detail = "Tangent and baseline fitting produced parallel lines; intersections are unavailable."
    elif af_tan <= as_value:
        result_status = "unavailable"
        reason = "invalid_result"
        detail = f"Non-increasing intersections were produced: As={as_value:.3f}, Af-tan={af_tan:.3f}."

    return {
        "schema_version": AFAS_ANALYSIS_SCHEMA_VERSION,
        "preprocessing_schema_version": preprocessing.get("schema_version"),
        "parameters": {
            **parameters.to_payload(),
            "resolved_low_range_celsius": [float(low_range[0]), float(low_range[1])],
            "resolved_high_range_celsius": [float(high_range[0]), float(high_range[1])],
        },
        "result_status": result_status,
        "reason": reason,
        "detail": detail,
        "warnings": warnings,
        "outlier_count": outlier_count,
        "series": {
            "temperature_celsius": temperatures.tolist(),
            "values": values.tolist(),
            "derivative": [_optional_float(value) for value in derivatives],
        },
        "fit": {
            "max_slope_index": int(max_slope_index),
            "max_slope_temperature_celsius": _optional_float(temperatures[max_slope_index]),
            "max_slope_value": _optional_float(values[max_slope_index]),
            "low_baseline": _line_payload(low_range, low_slope, low_intercept),
            "high_baseline": _line_payload(high_range, high_slope, high_intercept),
            "tangent": _line_payload(None, tangent_slope, tangent_intercept),
        },
        "result": {
            "As": _optional_float(as_value),
            "Af_tan": _optional_float(af_tan),
            "max_slope_temp": _optional_float(temperatures[max_slope_index]),
        },
    }


def group_by_temperature(
    temps: Sequence[float],
    values: Sequence[float],
    *,
    bin_celsius: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    if len(temperatures) != len(channel_values):
        raise ValueError(f"Length mismatch: temps ({len(temperatures)}) != values ({len(channel_values)})")
    if len(temperatures) == 0:
        return np.array([], dtype=float), np.array([], dtype=float)
    valid_mask = np.isfinite(temperatures) & np.isfinite(channel_values)
    temperatures = temperatures[valid_mask]
    channel_values = channel_values[valid_mask]
    if len(temperatures) == 0:
        return np.array([], dtype=float), np.array([], dtype=float)
    order = np.argsort(temperatures, kind="mergesort")
    sorted_temperatures = temperatures[order]
    sorted_values = channel_values[order]
    grouping_temperatures = sorted_temperatures
    if bin_celsius is not None and float(bin_celsius) > 0:
        bin_size = float(bin_celsius)
        decimals = max(0, int(np.ceil(-np.log10(bin_size))) + 2)
        grouping_temperatures = np.round(
            np.round(sorted_temperatures / bin_size) * bin_size,
            decimals=decimals,
        )
    unique_temperatures, inverse_indexes, counts = np.unique(
        grouping_temperatures,
        return_inverse=True,
        return_counts=True,
    )
    sums = np.zeros(len(unique_temperatures), dtype=float)
    np.add.at(sums, inverse_indexes, sorted_values)
    return unique_temperatures, sums / counts


def canonical_temperature_bin_key(temperature_celsius: float, bin_celsius: float) -> int:
    """Return the stable integer key used by backend, stream payloads, and persisted summaries."""
    bin_size = float(bin_celsius)
    if not np.isfinite(temperature_celsius) or not np.isfinite(bin_size) or bin_size <= 0:
        raise ValueError("temperature and bin_celsius must be finite, with bin_celsius > 0")
    return int(np.rint(float(temperature_celsius) / bin_size))


def group_temperature_curve_points(
    points: Sequence[CurvePoint],
    *,
    bin_celsius: float = DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
) -> list[dict[str, Any]]:
    """Aggregate formal frame points once per canonical temperature bucket."""
    bins: dict[int, list[CurvePoint]] = {}
    for point in points:
        if not np.isfinite(point.x) or not np.isfinite(point.y):
            continue
        key = canonical_temperature_bin_key(float(point.x), bin_celsius)
        bins.setdefault(key, []).append(point)
    grouped: list[dict[str, Any]] = []
    decimals = max(0, int(np.ceil(-np.log10(float(bin_celsius)))) + 2)
    for key in sorted(bins):
        samples = bins[key]
        values = [float(point.y) for point in samples]
        frames = [int(point.frame_index) for point in samples]
        grouped.append({
            "bin_key": key,
            "temperature_celsius": float(round(key * float(bin_celsius), decimals)),
            "distance_px": float(sum(values) / len(values)),
            "sample_count": len(values),
            "minimum_distance_px": min(values),
            "maximum_distance_px": max(values),
            "first_frame_index": min(frames),
            "last_frame_index": max(frames),
            "representative_frame_index": int(round(sum(frames) / len(frames))),
        })
    return grouped


def upsert_grouped_temperature_point(
    current: Mapping[str, Any] | None,
    point: CurvePoint,
    *,
    bin_celsius: float = DEFAULT_TEMPERATURE_GROUP_BIN_CELSIUS,
) -> dict[str, Any]:
    key = canonical_temperature_bin_key(float(point.x), bin_celsius)
    frame_index = int(point.frame_index)
    if current is None:
        return group_temperature_curve_points([point], bin_celsius=bin_celsius)[0]
    if int(current["bin_key"]) != key:
        raise ValueError("cannot update a grouped point with a different temperature bin")
    count = int(current["sample_count"])
    distance = float(point.y)
    next_count = count + 1
    return {
        **dict(current),
        "distance_px": (float(current["distance_px"]) * count + distance) / next_count,
        "sample_count": next_count,
        "minimum_distance_px": min(float(current["minimum_distance_px"]), distance),
        "maximum_distance_px": max(float(current["maximum_distance_px"]), distance),
        "first_frame_index": min(int(current["first_frame_index"]), frame_index),
        "last_frame_index": max(int(current["last_frame_index"]), frame_index),
        "representative_frame_index": int(round(
            (int(current["representative_frame_index"]) * count + frame_index) / next_count
        )),
    }


def remove_outliers(
    temps: Sequence[float],
    values: Sequence[float],
    window: int = 11,
    threshold: float = 5.0,
    max_iterations: int = 3,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    if len(temperatures) != len(channel_values):
        raise ValueError(f"Length mismatch: temps ({len(temperatures)}) != values ({len(channel_values)})")

    sample_count = len(channel_values)
    if sample_count < window + 2:
        return temperatures.copy(), channel_values.copy(), np.zeros(sample_count, dtype=bool)

    window = max(int(window), 11)
    if window % 2 == 0:
        window += 1

    combined_mask = np.zeros(sample_count, dtype=bool)
    working_values = channel_values.copy()
    min_periods = window // 2 + 1

    for _ in range(max_iterations):
        rolling_med = _rolling_median(working_values, window=window, min_periods=min_periods)
        deviations = np.abs(working_values - rolling_med)
        boundary = max(window // 2, 3)
        inner_mask = np.ones(sample_count, dtype=bool)
        inner_mask[:boundary] = False
        inner_mask[-boundary:] = False
        inner_mask[combined_mask] = False
        valid_devs = deviations[inner_mask & ~np.isnan(deviations)]
        if len(valid_devs) == 0:
            break

        mad = float(np.median(valid_devs))
        if np.isnan(mad):
            mad = 0.0
        data_range = float(np.nanmax(working_values) - np.nanmin(working_values))
        mad = max(mad, data_range * 0.01, 1.0)

        new_mask = deviations > float(threshold) * mad
        new_mask[:boundary] = False
        new_mask[-boundary:] = False
        new_mask[combined_mask] = False
        if not np.any(new_mask):
            break

        combined_mask |= new_mask
        normal_indexes = np.where(~combined_mask)[0]
        outlier_indexes = np.where(combined_mask)[0]
        if len(normal_indexes) >= 2:
            working_values[outlier_indexes] = np.interp(
                outlier_indexes,
                normal_indexes,
                channel_values[~combined_mask],
            )

    return temperatures, working_values, combined_mask


def smooth_data(
    temps: Sequence[float],
    values: Sequence[float],
    window_length: int = 51,
    polyorder: int = 3,
) -> tuple[np.ndarray, np.ndarray]:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    if len(temperatures) != len(channel_values):
        raise ValueError(f"Length mismatch: temps ({len(temperatures)}) != values ({len(channel_values)})")
    if len(temperatures) == 0:
        return np.array([], dtype=float), np.array([], dtype=float)
    corrected_window = int(window_length)
    if corrected_window % 2 == 0:
        corrected_window += 1
    if corrected_window <= int(polyorder):
        raise ValueError(f"window_length ({corrected_window}) must be greater than polyorder ({int(polyorder)})")
    if corrected_window > len(channel_values):
        raise ValueError(f"window_length ({corrected_window}) cannot be larger than data length ({len(channel_values)})")
    return temperatures, savgol_filter(channel_values, corrected_window, int(polyorder))


def compute_derivative(
    temps: Sequence[float],
    values: Sequence[float],
    *,
    min_temperature_step_celsius: float = 0.0,
) -> np.ndarray:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    if len(temperatures) != len(channel_values):
        raise ValueError(f"Length mismatch: temps ({len(temperatures)}) != values ({len(channel_values)})")
    if len(temperatures) < 2:
        raise ValueError(f"Need at least 2 points to compute derivative, got {len(temperatures)}")
    with np.errstate(divide="ignore", invalid="ignore"):
        derivatives = np.asarray(np.gradient(channel_values, temperatures), dtype=float)
    min_step = max(0.0, float(min_temperature_step_celsius))
    if min_step <= 0:
        return derivatives

    threshold = min_step * 0.999
    local_spacing_ok = np.ones(len(temperatures), dtype=bool)
    if len(temperatures) == 2:
        local_spacing_ok[:] = abs(float(temperatures[1] - temperatures[0])) >= threshold
    else:
        diffs = np.abs(np.diff(temperatures))
        local_spacing_ok[0] = bool(diffs[0] >= threshold)
        local_spacing_ok[-1] = bool(diffs[-1] >= threshold)
        if len(temperatures) > 2:
            local_spacing_ok[1:-1] = (diffs[:-1] >= threshold) & (diffs[1:] >= threshold)
    derivatives[~local_spacing_ok] = np.nan
    return derivatives


def find_max_slope_index(derivatives: Sequence[float], offset: int = 0) -> int:
    derivative_values = np.asarray(derivatives, dtype=float)
    if len(derivative_values) == 0:
        raise ValueError("derivatives array cannot be empty")
    finite_abs = np.where(np.isfinite(derivative_values), np.abs(derivative_values), -np.inf)
    if not np.any(np.isfinite(finite_abs)):
        return 0
    max_abs_index = int(np.argmax(finite_abs))
    adjusted_index = max_abs_index + int(offset)
    return max(0, min(adjusted_index, len(derivative_values) - 1))


def fit_baseline(
    temps: Sequence[float],
    values: Sequence[float],
    t_start: float,
    t_end: float,
) -> tuple[float, float]:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    mask = (temperatures >= float(t_start)) & (temperatures <= float(t_end))
    range_temperatures = temperatures[mask]
    range_values = channel_values[mask]
    if len(range_temperatures) == 0:
        raise ValueError(f"No data points in temperature range [{t_start}, {t_end}]")
    if len(range_temperatures) < 2:
        raise ValueError(f"Need at least 2 points for baseline fitting, got {len(range_temperatures)}")
    if float(np.max(range_temperatures)) == float(np.min(range_temperatures)):
        return float("nan"), float("nan")
    try:
        result = linregress(range_temperatures, range_values)
    except ValueError:
        return float("nan"), float("nan")
    return float(result.slope), float(result.intercept)


def compute_tangent_at_point(
    temps: Sequence[float],
    values: Sequence[float],
    derivatives: Sequence[float],
    index: int,
) -> tuple[float, float]:
    temperatures = np.asarray(temps, dtype=float)
    channel_values = np.asarray(values, dtype=float)
    derivative_values = np.asarray(derivatives, dtype=float)
    if len(temperatures) != len(channel_values) or len(temperatures) != len(derivative_values):
        raise ValueError("temps, values, and derivatives must have the same length")
    if not 0 <= int(index) < len(temperatures):
        raise ValueError(f"Index {index} out of bounds [0, {len(temperatures) - 1}]")
    slope = float(derivative_values[int(index)])
    x0 = float(temperatures[int(index)])
    y0 = float(channel_values[int(index)])
    return slope, float(y0 - slope * x0)


def find_intersection(
    slope1: float,
    intercept1: float,
    slope2: float,
    intercept2: float,
) -> float | None:
    if not all(np.isfinite(float(value)) for value in [slope1, intercept1, slope2, intercept2]):
        return None
    if np.isclose(float(slope1), float(slope2)):
        return None
    return float((float(intercept2) - float(intercept1)) / (float(slope1) - float(slope2)))


def _line_payload(
    range_celsius: tuple[float, float] | None,
    slope: float,
    intercept: float,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "slope": _optional_float(slope),
        "intercept": _optional_float(intercept),
    }
    if range_celsius is not None:
        payload["range_celsius"] = [float(range_celsius[0]), float(range_celsius[1])]
    return payload


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    numeric = float(value)
    return numeric if np.isfinite(numeric) else None


def _normalize_range(value: Any) -> tuple[float, float] | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return float(value[0]), float(value[1])
    raise ValueError("analysis range values must be [start, end] pairs")


def _resolve_ranges(
    temperatures: np.ndarray,
    parameters: AfasAnalysisParameters,
) -> tuple[tuple[float, float], tuple[float, float], list[str]]:
    warnings: list[str] = []
    if parameters.low_range_celsius is not None and parameters.high_range_celsius is not None:
        return parameters.low_range_celsius, parameters.high_range_celsius, warnings
    temp_min = float(np.min(temperatures))
    temp_max = float(np.max(temperatures))
    span = temp_max - temp_min
    if span <= 0:
        raise ValueError("temperature span must be positive for tangent analysis")
    auto_band = span * 0.2
    low_range = parameters.low_range_celsius or (temp_min, temp_min + auto_band)
    high_range = parameters.high_range_celsius or (temp_max - auto_band, temp_max)
    if parameters.low_range_celsius is None:
        warnings.append("low_range_celsius was not provided; using the first 20% of the temperature span.")
    if parameters.high_range_celsius is None:
        warnings.append("high_range_celsius was not provided; using the last 20% of the temperature span.")
    return low_range, high_range, warnings


def _full_length_savgol_window_warning(data_length: int, *, window_length: int) -> str | None:
    if int(data_length) <= 0:
        return None
    corrected_window = int(window_length)
    if corrected_window % 2 == 0:
        corrected_window += 1
    if corrected_window != int(data_length):
        return None
    return (
        f"window_length ({corrected_window}) covers the full data length ({int(data_length)}); "
        "smoothing skipped to avoid global Savitzky-Golay edge distortion"
    )


def _edge_safe_savgol_window_length(
    data_length: int,
    *,
    window_length: int,
    polyorder: int,
) -> tuple[int | None, str | None]:
    corrected_window = int(window_length)
    if corrected_window % 2 == 0:
        corrected_window += 1
    if int(data_length) <= 0:
        return None, None

    min_valid_window = int(polyorder) + 2
    if min_valid_window % 2 == 0:
        min_valid_window += 1
    max_fractional_window = _max_edge_safe_savgol_window(
        int(data_length),
        min_valid_window=min_valid_window,
    )
    if max_fractional_window is None:
        return (
            None,
            (
                f"window_length ({corrected_window}) cannot be reduced to a safe Savitzky-Golay "
                f"window for data length ({int(data_length)}) and polyorder ({int(polyorder)}); "
                "smoothing skipped"
            ),
        )
    if corrected_window <= max_fractional_window:
        return corrected_window, None
    return (
        max_fractional_window,
        f"window_length ({corrected_window}) reduced to {max_fractional_window} to avoid Savitzky-Golay edge distortion",
    )


def _max_edge_safe_savgol_window(data_length: int, *, min_valid_window: int) -> int | None:
    max_fractional_window = int(data_length * MAX_SAVGOL_WINDOW_DATA_FRACTION)
    if max_fractional_window % 2 == 0:
        max_fractional_window -= 1
    if max_fractional_window < min_valid_window:
        largest_odd_below_full_length = data_length - 1 if data_length % 2 == 0 else data_length - 2
        max_fractional_window = largest_odd_below_full_length
    max_fractional_window = min(max_fractional_window, data_length)
    if max_fractional_window == data_length:
        max_fractional_window -= 2
    if max_fractional_window % 2 == 0:
        max_fractional_window -= 1
    if max_fractional_window < min_valid_window:
        return None
    return max_fractional_window


def _rolling_median(values: np.ndarray, *, window: int, min_periods: int) -> np.ndarray:
    sample_count = len(values)
    half_window = window // 2
    medians = np.full(sample_count, np.nan, dtype=float)
    for index in range(sample_count):
        start = max(0, index - half_window)
        stop = min(sample_count, index + half_window + 1)
        window_values = values[start:stop]
        if len(window_values) >= min_periods:
            medians[index] = float(np.median(window_values))
    return medians
