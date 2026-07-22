from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any


class AfasAdjustmentValidationError(ValueError):
    pass


_MANUAL_OVERRIDE_KEYS = {
    "low_range_celsius",
    "high_range_celsius",
    "tangent_slope_override",
    "tangent_intercept_override",
}

_POINT_SERIES_KEYS = (
    "smoothed_temperature_points",
    "repaired_temperature_points",
    "grouped_temperature_points",
)

_PARALLEL_SERIES_KEYS = ("smoothed", "outlier_repair", "grouped")


def validate_manual_afas_preflight(
    preprocessing: Mapping[str, Any],
    overrides: Mapping[str, Any] | None,
    analysis: Mapping[str, Any] | None = None,
) -> None:
    if not _has_manual_overrides(overrides):
        return

    temperatures, _ = _formal_series(preprocessing)
    if len(temperatures) < 2:
        raise AfasAdjustmentValidationError("Manual AFAS adjustment requires at least two formal points.")

    smoothed = preprocessing.get("smoothed")
    if not isinstance(smoothed, Mapping):
        raise AfasAdjustmentValidationError(
            "Manual AFAS adjustment requires available smoothed preprocessing."
        )
    smoothed_temperatures = smoothed.get("temperature_celsius")
    smoothed_values = smoothed.get("values")
    if (
        not _is_array(smoothed_temperatures)
        or not _is_array(smoothed_values)
        or len(smoothed_temperatures) != len(smoothed_values)
        or len(smoothed_temperatures) < 2
    ):
        raise AfasAdjustmentValidationError(
            "Manual AFAS adjustment requires available smoothed preprocessing."
        )
    if not isinstance(preprocessing.get("outlier_repair"), Mapping):
        raise AfasAdjustmentValidationError(
            "Manual AFAS adjustment requires available outlier-repair preprocessing."
        )

    if analysis is not None:
        _validate_available_result(analysis)


def validate_manual_afas_adjustment(
    preprocessing: Mapping[str, Any],
    overrides: Mapping[str, Any] | None,
    analysis: Mapping[str, Any],
) -> None:
    if not _has_manual_overrides(overrides):
        return

    temperatures, values = _formal_series(preprocessing)
    if len(temperatures) < 2:
        raise AfasAdjustmentValidationError("Manual AFAS adjustment requires at least two formal points.")

    temperature_min = temperatures[0]
    temperature_max = temperatures[-1]
    distance_min = min(values)
    distance_max = max(values)
    parameters = _mapping(analysis.get("parameters"))
    override_values = overrides or {}

    low_override = override_values.get("low_range_celsius")
    high_override = override_values.get("high_range_celsius")
    low_range = (
        low_override
        if low_override is not None
        else parameters.get("resolved_low_range_celsius")
    )
    high_range = (
        high_override
        if high_override is not None
        else parameters.get("resolved_high_range_celsius")
    )
    _validate_range("low-temperature", low_range, temperatures)
    _validate_range("high-temperature", high_range, temperatures)

    tangent = _mapping(_mapping(analysis.get("fit")).get("tangent"))
    slope_override = override_values.get("tangent_slope_override")
    intercept_override = override_values.get("tangent_intercept_override")
    slope = finite_json_number(
        slope_override if slope_override is not None else tangent.get("slope"),
        "Tangent slope must be finite.",
    )
    intercept = finite_json_number(
        intercept_override if intercept_override is not None else tangent.get("intercept"),
        "Tangent intercept must be finite.",
    )
    endpoint_distances = (
        slope * temperature_min + intercept,
        slope * temperature_max + intercept,
    )
    if not all(math.isfinite(value) for value in endpoint_distances):
        raise AfasAdjustmentValidationError("Tangent values over the formal temperature domain must be finite.")
    line_min = min(endpoint_distances)
    line_max = max(endpoint_distances)
    if line_max < distance_min or line_min > distance_max:
        raise AfasAdjustmentValidationError("Tangent must intersect the formal data rectangle.")

    as_value, af_value = _validate_available_result(analysis)
    if not temperature_min <= as_value <= temperature_max:
        raise AfasAdjustmentValidationError("AS must remain inside the formal temperature domain.")
    if not temperature_min <= af_value <= temperature_max:
        raise AfasAdjustmentValidationError("AF must remain inside the formal temperature domain.")
    if as_value >= af_value:
        raise AfasAdjustmentValidationError("Manual AFAS adjustment must satisfy AS < AF.")


def _has_manual_overrides(overrides: Mapping[str, Any] | None) -> bool:
    return bool(overrides) and any(overrides.get(key) is not None for key in _MANUAL_OVERRIDE_KEYS)


def _formal_series(preprocessing: Mapping[str, Any]) -> tuple[list[float], list[float]]:
    for key in _POINT_SERIES_KEYS:
        if key not in preprocessing or preprocessing.get(key) is None:
            continue
        records = preprocessing.get(key)
        if not _is_array(records):
            if isinstance(records, Mapping) and not records:
                continue
            raise AfasAdjustmentValidationError(
                f"Formal AFAS {key} points must be an array of mappings with finite values."
            )
        if len(records) < 2:
            continue
        pairs: list[tuple[float, float]] = []
        for record in records:
            if not isinstance(record, Mapping):
                raise AfasAdjustmentValidationError(
                    f"Formal AFAS {key} points must be mappings with finite values."
                )
            temperature = finite_json_number(
                record.get("temperature_celsius"),
                f"Formal AFAS {key} temperatures and distances must be finite.",
            )
            value = finite_json_number(
                record.get("distance_px"),
                f"Formal AFAS {key} temperatures and distances must be finite.",
            )
            pairs.append((temperature, value))
        return _strict_formal_pairs(pairs)

    for key in _PARALLEL_SERIES_KEYS:
        if key not in preprocessing or preprocessing.get(key) is None:
            continue
        stage_value = preprocessing.get(key)
        if not isinstance(stage_value, Mapping):
            if _is_array(stage_value) and not stage_value:
                continue
            raise AfasAdjustmentValidationError(f"Formal AFAS {key} stage must be a mapping.")
        stage = stage_value
        has_temperatures = "temperature_celsius" in stage
        has_values = "values" in stage
        if not has_temperatures and not has_values:
            continue
        if has_temperatures != has_values:
            raise AfasAdjustmentValidationError(
                f"Formal AFAS {key} temperature and value arrays must both be present."
            )
        temperatures = stage.get("temperature_celsius")
        values = stage.get("values")
        if not _is_array(temperatures) or not _is_array(values) or len(temperatures) != len(values):
            raise AfasAdjustmentValidationError(
                f"Formal AFAS {key} temperature and value arrays must have the same length."
            )
        if len(temperatures) < 2:
            continue
        pairs = [
            (
                finite_json_number(
                    temperature,
                    f"Formal AFAS {key} temperatures and distances must be finite.",
                ),
                finite_json_number(
                    value,
                    f"Formal AFAS {key} temperatures and distances must be finite.",
                ),
            )
            for temperature, value in zip(temperatures, values, strict=True)
        ]
        return _strict_formal_pairs(pairs)

    return [], []


def _strict_formal_pairs(pairs: list[tuple[float, float]]) -> tuple[list[float], list[float]]:
    temperatures = [pair[0] for pair in pairs]
    if any(current <= previous for previous, current in zip(temperatures, temperatures[1:])):
        raise AfasAdjustmentValidationError("Formal AFAS temperatures must be strictly increasing.")
    return temperatures, [pair[1] for pair in pairs]


def _validate_range(label: str, value: Any, temperatures: list[float]) -> None:
    if not _is_array(value) or len(value) != 2:
        raise AfasAdjustmentValidationError(f"The {label} range requires two finite endpoints.")
    start = finite_json_number(value[0], f"The {label} range requires finite endpoints.")
    end = finite_json_number(value[1], f"The {label} range requires finite endpoints.")
    if start >= end:
        raise AfasAdjustmentValidationError(f"The {label} range endpoints must be increasing.")
    if start < temperatures[0] or end > temperatures[-1]:
        raise AfasAdjustmentValidationError(
            f"The {label} range must remain inside the formal temperature domain."
        )
    if sum(start <= temperature <= end for temperature in temperatures) < 2:
        raise AfasAdjustmentValidationError(
            f"The {label} range must contain at least two formal points."
        )


def finite_json_number(value: Any, message: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AfasAdjustmentValidationError(message)
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise AfasAdjustmentValidationError(message) from exc
    if not math.isfinite(parsed):
        raise AfasAdjustmentValidationError(message)
    return parsed


def _validate_available_result(analysis: Mapping[str, Any]) -> tuple[float, float]:
    result = _mapping(analysis.get("result"))
    return (
        finite_json_number(result.get("As"), "AS must be finite."),
        finite_json_number(result.get("Af_tan"), "AF must be finite."),
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _is_array(value: Any) -> bool:
    return isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray))
