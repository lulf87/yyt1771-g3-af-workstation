from __future__ import annotations

import importlib

import numpy as np
import pytest

from yyt1771_g3.core.models import MeasurementDefinition


def _three_region_measurement() -> MeasurementDefinition:
    centers_and_widths = [(60.0, 20), (180.0, 35), (300.0, 50)]
    colors = ["#ef4444", "#3b82f6", "#22c55e"]
    regions = [
        {
            "region_id": f"region_{index}",
            "index": index,
            "label": f"位置 {index}",
            "enabled": True,
            "color": colors[index - 1],
            "roi": {
                "type": "rotated_rect",
                "center_x": center_x,
                "center_y": 60.0,
                "width": 90.0,
                "height": 50.0,
                "angle_deg": 0.0,
            },
        }
        for index, (center_x, _width) in enumerate(centers_and_widths, start=1)
    ]
    return MeasurementDefinition.model_validate(
        {
            "measurement_id": "three-region-synthetic",
            "source": "real_camera",
            "object_class": "C_BUNDLE_ENVELOPE",
            "detector": "BundleEnvelopeDetector",
            "detector_mode": "contrast_widest_span",
            "width_mode": "max_width",
            "measurement_coordinates": "source_pixel",
            "roi": regions[0]["roi"],
            "regions": regions,
            "detector_config": {
                "contrast_threshold": 30,
                "min_component_area_px": 5,
                "processing_scale_enabled": False,
            },
        }
    )


def _three_region_frame() -> np.ndarray:
    frame = np.full((120, 360), 240, dtype=np.uint8)
    for center_x, width in [(60, 20), (180, 35), (300, 50)]:
        frame[45:75, int(center_x - width / 2) : int(center_x + width / 2)] = 20
    return frame


def test_detect_regions_for_frame_returns_independent_distances_and_region_ids() -> None:
    service = importlib.import_module("yyt1771_g3.services.region_detection_service")

    results, state = service.detect_regions_for_frame(
        _three_region_frame(),
        _three_region_measurement(),
        frame_index=9,
        generate_diagnostics=False,
    )

    assert [item.region.region_id for item in results] == ["region_1", "region_2", "region_3"]
    assert [item.detection.region_id for item in results] == ["region_1", "region_2", "region_3"]
    assert [item.detection.region_index for item in results] == [1, 2, 3]
    assert [item.detection.distance_px for item in results] == [19.0, 34.0, 49.0]
    assert set(state.candidate_states) == {"region_1", "region_2", "region_3"}


def test_detect_regions_for_frame_skips_disabled_regions() -> None:
    service = importlib.import_module("yyt1771_g3.services.region_detection_service")
    measurement = _three_region_measurement()
    disabled_middle = measurement.model_dump(mode="json")
    disabled_middle["regions"][1]["enabled"] = False

    results, _ = service.detect_regions_for_frame(
        _three_region_frame(),
        MeasurementDefinition.model_validate(disabled_middle),
        frame_index=10,
        generate_diagnostics=False,
    )

    assert [item.detection.region_id for item in results] == ["region_1", "region_3"]


def test_region_local_detector_exception_does_not_stop_other_regions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = importlib.import_module("yyt1771_g3.services.region_detection_service")
    original = service.detect_frame_with_state

    def fail_middle_region(frame, measurement, **kwargs):  # noqa: ANN001
        if measurement.regions[0].region_id == "region_2":
            raise RuntimeError("middle region failed")
        return original(frame, measurement, **kwargs)

    monkeypatch.setattr(service, "detect_frame_with_state", fail_middle_region)
    results, _ = service.detect_regions_for_frame(
        _three_region_frame(),
        _three_region_measurement(),
        frame_index=11,
        generate_diagnostics=False,
    )

    assert results[0].detection.detection_status == "VALID"
    assert results[1].detection.detection_status == "INVALID"
    assert results[1].detection.rejected_reason == "region_detection_error:RuntimeError"
    assert results[2].detection.detection_status == "VALID"
