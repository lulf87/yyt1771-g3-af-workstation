from yyt1771_g3.core.models import CurvePoint
from yyt1771_g3.services.afas_analysis import (
    group_temperature_curve_points,
    preprocess_temperature_distance,
)


def test_repeated_temperature_collapses_to_one_group_with_metadata() -> None:
    points = [CurvePoint(x=1.2, y=float(index), frame_index=index) for index in range(1, 21)]

    grouped = group_temperature_curve_points(points, bin_celsius=0.01)

    assert len(grouped) == 1
    assert grouped[0] == {
        "bin_key": 120,
        "temperature_celsius": 1.2,
        "distance_px": 10.5,
        "sample_count": 20,
        "minimum_distance_px": 1.0,
        "maximum_distance_px": 20.0,
        "first_frame_index": 1,
        "last_frame_index": 20,
        "representative_frame_index": 10,
    }


def test_out_of_order_and_float_noise_use_canonical_sorted_bins() -> None:
    points = [
        CurvePoint(x=1.2, y=10, frame_index=1),
        CurvePoint(x=1.3, y=20, frame_index=2),
        CurvePoint(x=1.2000000001, y=30, frame_index=3),
        CurvePoint(x=1.1999999999, y=50, frame_index=4),
        CurvePoint(x=1.4, y=40, frame_index=5),
    ]

    grouped = group_temperature_curve_points(points, bin_celsius=0.01)

    assert [point["bin_key"] for point in grouped] == [120, 130, 140]
    assert [point["temperature_celsius"] for point in grouped] == [1.2, 1.3, 1.4]
    assert grouped[0]["distance_px"] == 30.0
    assert all(
        right["temperature_celsius"] > left["temperature_celsius"]
        for left, right in zip(grouped, grouped[1:])
    )


def test_preprocessing_persists_group_series_and_repair_uses_grouped_count() -> None:
    points = [
        CurvePoint(x=1.2, y=10, frame_index=1),
        CurvePoint(x=1.3, y=20, frame_index=2),
        CurvePoint(x=1.2, y=30, frame_index=3),
        CurvePoint(x=1.4, y=40, frame_index=4),
    ]

    preprocessing = preprocess_temperature_distance(points)

    assert preprocessing["parameters"]["temperature_group_bin_celsius"] == 0.01
    assert preprocessing["raw_point_count"] == 4
    assert preprocessing["grouped_point_count"] == 3
    assert len(preprocessing["grouped_temperature_points"]) == 3
    assert len(preprocessing["outlier_repair"]["values"]) == 3
    assert len(preprocessing["smoothed_temperature_points"]) == 3
