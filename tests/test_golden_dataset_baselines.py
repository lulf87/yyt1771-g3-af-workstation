from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_golden_datasets_have_measurement_definitions_and_expected_outputs() -> None:
    for dataset_id, detector in [
        ("golden_a_20260522_dev_lab", "BalloonEnvelopeDetector"),
        ("golden_c_20260529_dev_lab", "BundleEnvelopeDetector"),
    ]:
        dataset_dir = ROOT / "datasets" / "golden" / dataset_id
        measurement_path = dataset_dir / "measurement_definition.json"
        expected_readme = dataset_dir / "expected_outputs" / "README.md"

        assert measurement_path.is_file()
        assert expected_readme.is_file()

        measurement = json.loads(measurement_path.read_text(encoding="utf-8"))
        assert measurement["detector"] == detector
        assert measurement["width_mode"] == "max_width"
        assert measurement["measurement_coordinates"] == "source_pixel"
        assert measurement["roi"]["type"] == "rotated_rect"
