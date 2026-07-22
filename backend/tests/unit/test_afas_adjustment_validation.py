from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from yyt1771_g3.services.afas_adjustment_validation import (
    AfasAdjustmentValidationError,
    validate_manual_afas_adjustment,
    validate_manual_afas_preflight,
)
from yyt1771_g3.services.afas_analysis import AfasAnalysisParameters


FORMAL_POINTS = [
    {"temperature_celsius": 20.0, "distance_px": 100.0},
    {"temperature_celsius": 22.0, "distance_px": 104.0},
    {"temperature_celsius": 24.0, "distance_px": 108.0},
    {"temperature_celsius": 40.0, "distance_px": 140.0},
    {"temperature_celsius": 45.0, "distance_px": 150.0},
    {"temperature_celsius": 50.0, "distance_px": 160.0},
]


def valid_adjustment_fixture() -> tuple[dict[str, Any], dict[str, Any]]:
    preprocessing = {"smoothed_temperature_points": deepcopy(FORMAL_POINTS)}
    analysis = {
        "parameters": {
            "resolved_low_range_celsius": [20.0, 24.0],
            "resolved_high_range_celsius": [45.0, 50.0],
        },
        "fit": {"tangent": {"slope": 2.0, "intercept": 40.0}},
        "result": {"As": 25.0, "Af_tan": 47.0},
    }
    return preprocessing, analysis


def _valid_overrides() -> dict[str, Any]:
    return {
        "low_range_celsius": [20.0, 24.0],
        "high_range_celsius": [45.0, 50.0],
        "tangent_slope_override": 2.0,
        "tangent_intercept_override": 40.0,
    }


def test_validate_manual_afas_adjustment_accepts_valid_candidate() -> None:
    preprocessing, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


@pytest.mark.parametrize(
    ("overrides", "result_patch", "message"),
    [
        ({"low_range_celsius": [19.0, 24.0]}, {}, "low"),
        ({"high_range_celsius": [48.0, 51.0]}, {}, "high"),
        ({"low_range_celsius": [20.0, 20.1]}, {}, "at least two formal points"),
        (
            {"tangent_slope_override": float("nan"), "tangent_intercept_override": 1.0},
            {},
            "finite",
        ),
        (
            {"tangent_slope_override": 1.0, "tangent_intercept_override": 1000.0},
            {},
            "data rectangle",
        ),
        (
            {"tangent_slope_override": 2.0, "tangent_intercept_override": 40.0},
            {"As": 19.0},
            "AS",
        ),
        (
            {"tangent_slope_override": 2.0, "tangent_intercept_override": 40.0},
            {"As": 42.0, "Af_tan": 40.0},
            "AS < AF",
        ),
    ],
)
def test_validate_manual_afas_adjustment_rejects_invalid_candidates(
    overrides: dict[str, Any],
    result_patch: dict[str, Any],
    message: str,
) -> None:
    preprocessing, analysis = valid_adjustment_fixture()
    analysis["result"].update(result_patch)

    with pytest.raises(AfasAdjustmentValidationError, match=message):
        validate_manual_afas_adjustment(preprocessing, overrides, analysis)


def test_validate_manual_afas_adjustment_ignores_tangent_offset_only() -> None:
    validate_manual_afas_adjustment(
        {"smoothed_temperature_points": [{"temperature_celsius": float("nan")}]},
        {"tangent_offset": 3},
        {},
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"low_range_celsius": ["20.0", 24.0]},
        {"low_range_celsius": [True, 24.0]},
        {"high_range_celsius": [45.0, float("nan")]},
        {"high_range_celsius": [45.0, float("inf")]},
        {"low_range_celsius": [20.0, 10**309]},
        {"tangent_slope_override": "2.0"},
        {"tangent_slope_override": False},
        {"tangent_slope_override": float("nan")},
        {"tangent_slope_override": float("inf")},
        {"tangent_slope_override": 10**309},
        {"tangent_intercept_override": "40.0"},
        {"tangent_intercept_override": True},
        {"tangent_intercept_override": float("nan")},
        {"tangent_intercept_override": float("inf")},
        {"tangent_intercept_override": 10**309},
    ],
)
def test_manual_fields_require_real_finite_json_numbers(overrides: dict[str, Any]) -> None:
    preprocessing, analysis = valid_adjustment_fixture()

    with pytest.raises(AfasAdjustmentValidationError, match="finite"):
        validate_manual_afas_adjustment(preprocessing, overrides, analysis)


@pytest.mark.parametrize(
    "overrides",
    [
        {"low_range_celsius": ["20.0", 24.0]},
        {"low_range_celsius": [True, 24.0]},
        {"low_range_celsius": [20.0, 10**309]},
        {"tangent_slope_override": "2.0"},
        {"tangent_slope_override": False},
        {"tangent_slope_override": float("nan")},
        {"tangent_slope_override": float("inf")},
        {"tangent_slope_override": 10**309},
        {"tangent_intercept_override": "40.0"},
        {"tangent_intercept_override": True},
        {"tangent_intercept_override": 10**309},
    ],
)
def test_analysis_parameter_parsing_rejects_non_json_numbers(overrides: dict[str, Any]) -> None:
    with pytest.raises(AfasAdjustmentValidationError, match="finite"):
        AfasAnalysisParameters.from_mapping(overrides)


@pytest.mark.parametrize(
    "preprocessing",
    [
        {},
        {"result_status": "unavailable", "reason": "analysis_exception"},
        {"smoothed": None},
        {"smoothed": {"temperature_celsius": [], "values": []}},
        {"raw": {"temperature_celsius": [20.0, 22.0], "values": [100.0, 104.0]}},
    ],
)
def test_manual_preflight_rejects_preprocessing_without_a_formal_series(
    preprocessing: dict[str, Any],
) -> None:
    with pytest.raises(AfasAdjustmentValidationError, match="at least two formal points"):
        validate_manual_afas_preflight(preprocessing, _valid_overrides())


def test_manual_preflight_keeps_automatic_tangent_offset_behavior_unchanged() -> None:
    validate_manual_afas_preflight({"smoothed": None}, {"tangent_offset": 2})


@pytest.mark.parametrize(
    "result",
    [
        None,
        {},
        {"As": None, "Af_tan": 47.0},
        {"As": 25.0, "Af_tan": None},
    ],
)
def test_manual_adjustment_rejects_missing_or_unavailable_results(result: Any) -> None:
    preprocessing, analysis = valid_adjustment_fixture()
    if result is None:
        analysis.pop("result")
    else:
        analysis["result"] = result

    with pytest.raises(AfasAdjustmentValidationError, match="AS|AF"):
        validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


@pytest.mark.parametrize(
    "selected_key",
    [
        "smoothed_temperature_points",
        "repaired_temperature_points",
        "grouped_temperature_points",
    ],
)
def test_point_object_formal_series_falls_back_in_stage_order(selected_key: str) -> None:
    preprocessing: dict[str, Any] = {}
    for key in (
        "smoothed_temperature_points",
        "repaired_temperature_points",
        "grouped_temperature_points",
    ):
        preprocessing[key] = deepcopy(FORMAL_POINTS) if key == selected_key else []
        if key == selected_key:
            break
    _, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


def test_point_object_formal_series_is_preferred_over_parallel_series() -> None:
    preprocessing = {
        "grouped_temperature_points": deepcopy(FORMAL_POINTS),
        "smoothed": {
            "temperature_celsius": [0.0, 1.0],
            "values": [0.0, 1.0],
        },
    }
    _, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


@pytest.mark.parametrize("selected_key", ["smoothed", "outlier_repair", "grouped"])
def test_parallel_formal_series_falls_back_in_stage_order(selected_key: str) -> None:
    preprocessing: dict[str, Any] = {}
    for key in ("smoothed", "outlier_repair", "grouped"):
        preprocessing[key] = (
            {
                "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
                "values": [point["distance_px"] for point in FORMAL_POINTS],
            }
            if key == selected_key
            else {"temperature_celsius": [], "values": []}
        )
        if key == selected_key:
            break
    _, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


def test_insufficient_formal_stage_falls_back_without_selecting_it() -> None:
    preprocessing = {
        "smoothed_temperature_points": [deepcopy(FORMAL_POINTS[0])],
        "repaired_temperature_points": deepcopy(FORMAL_POINTS),
    }
    _, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


@pytest.mark.parametrize(
    "invalid_stage",
    [
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                "not-a-point",
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                {"temperature_celsius": 50.0, "distance_px": float("nan")},
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                {"temperature_celsius": 45.0, "distance_px": 160.0},
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed": {
                "temperature_celsius": [20.0, 22.0, 24.0],
                "values": [100.0, 104.0],
            },
            "outlier_repair": {
                "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
                "values": [point["distance_px"] for point in FORMAL_POINTS],
            },
        },
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                {"temperature_celsius": 50.0, "distance_px": "160.0"},
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                {"temperature_celsius": 50.0, "distance_px": True},
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed_temperature_points": [
                *deepcopy(FORMAL_POINTS[:-1]),
                {"temperature_celsius": 50.0, "distance_px": 10**309},
            ],
            "repaired_temperature_points": deepcopy(FORMAL_POINTS),
        },
        {
            "smoothed": {
                "temperature_celsius": [20.0, 22.0],
            },
            "outlier_repair": {
                "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
                "values": [point["distance_px"] for point in FORMAL_POINTS],
            },
        },
        {
            "smoothed": {
                "temperature_celsius": [20.0, 22.0],
                "values": [100.0, "104.0"],
            },
            "outlier_repair": {
                "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
                "values": [point["distance_px"] for point in FORMAL_POINTS],
            },
        },
    ],
)
def test_malformed_authoritative_stage_is_not_masked_by_fallback(
    invalid_stage: dict[str, Any],
) -> None:
    _, analysis = valid_adjustment_fixture()

    with pytest.raises(AfasAdjustmentValidationError):
        validate_manual_afas_adjustment(invalid_stage, _valid_overrides(), analysis)


@pytest.mark.parametrize(
    "unavailable_stage",
    [
        {},
        {"smoothed": {}},
        {"smoothed": {"temperature_celsius": [], "values": []}},
        {"smoothed": {"temperature_celsius": [20.0], "values": [100.0]}},
    ],
)
def test_unavailable_parallel_stage_falls_back_to_repaired(
    unavailable_stage: dict[str, Any],
) -> None:
    preprocessing = {
        **unavailable_stage,
        "outlier_repair": {
            "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
            "values": [point["distance_px"] for point in FORMAL_POINTS],
        },
    }
    _, analysis = valid_adjustment_fixture()

    validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


def test_formal_series_never_falls_back_to_raw_data() -> None:
    preprocessing = {
        "raw": {
            "temperature_celsius": [point["temperature_celsius"] for point in FORMAL_POINTS],
            "values": [point["distance_px"] for point in FORMAL_POINTS],
        }
    }
    _, analysis = valid_adjustment_fixture()

    with pytest.raises(AfasAdjustmentValidationError, match="at least two formal points"):
        validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)


@pytest.mark.parametrize(
    ("preprocessing", "message"),
    [
        (
            {
                "smoothed_temperature_points": [
                    *deepcopy(FORMAL_POINTS[:-1]),
                    {"temperature_celsius": 50.0, "distance_px": float("nan")},
                ]
            },
            "finite",
        ),
        (
            {
                "smoothed_temperature_points": [
                    *deepcopy(FORMAL_POINTS[:-1]),
                    {"temperature_celsius": 45.0, "distance_px": 160.0},
                ]
            },
            "strictly increasing",
        ),
        (
            {
                "smoothed": {
                    "temperature_celsius": [20.0, 22.0, 24.0],
                    "values": [100.0, 104.0],
                }
            },
            "same length",
        ),
    ],
)
def test_formal_series_rejects_malformed_data_without_silently_dropping_points(
    preprocessing: dict[str, Any],
    message: str,
) -> None:
    _, analysis = valid_adjustment_fixture()

    with pytest.raises(AfasAdjustmentValidationError, match=message):
        validate_manual_afas_adjustment(preprocessing, _valid_overrides(), analysis)
