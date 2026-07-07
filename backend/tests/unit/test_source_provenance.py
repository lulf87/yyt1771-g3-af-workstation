from __future__ import annotations

from yyt1771_g3.services.source_provenance import (
    camera_runtime_provenance,
    imported_file_provenance,
    infer_provenance_from_export_payload,
    offline_dataset_provenance,
)


def test_camera_runtime_provenance_marks_real_hardware_when_backends_are_real() -> None:
    provenance = camera_runtime_provenance(
        camera_profile={"backend": "hik_gige_mvs", "model": "MV-CA060-11GM"},
        camera_meta={"serial_number": "00J67378626"},
        temperature_backend="lu92xx_modbus_rtu",
    )

    assert provenance["overall_kind"] == "real_hardware"
    assert provenance["camera_is_simulated"] is False
    assert provenance["temperature_is_simulated"] is False
    assert provenance["display_label_zh"] == "真实相机 + 真实温控"


def test_camera_runtime_provenance_detects_simulated_dataset_camera_markers() -> None:
    provenance = camera_runtime_provenance(
        camera_profile={"backend": "hik_gige_mvs"},
        camera_meta={
            "model": "G3 simulated dataset camera",
            "serial_number": "SIM-DATASET-golden_a_20260522_dev_lab",
            "dataset_id": "golden_a_20260522_dev_lab",
        },
        temperature_backend="lu92xx_modbus_rtu",
    )

    assert provenance["overall_kind"] == "mixed"
    assert provenance["camera_backend_kind"] == "simulated_dataset"
    assert provenance["camera_is_simulated"] is True
    assert provenance["simulated_dataset_id"] == "golden_a_20260522_dev_lab"


def test_camera_runtime_provenance_detects_simulated_temperature_backend() -> None:
    provenance = camera_runtime_provenance(
        camera_profile={"backend": "hik_gige_mvs"},
        camera_meta={"model": "MV-CA060-11GM", "serial_number": "DEV-001"},
        temperature_backend="simulated_temperature",
    )

    assert provenance["overall_kind"] == "mixed"
    assert provenance["temperature_backend_kind"] == "simulated"
    assert provenance["temperature_is_simulated"] is True


def test_offline_and_imported_provenance_keep_operator_source_clear() -> None:
    offline = offline_dataset_provenance("golden_c_20260529_dev_lab")
    imported = imported_file_provenance(offline)

    assert offline["acquisition_source"] == "offline_dataset"
    assert offline["overall_kind"] == "offline"
    assert offline["camera_is_simulated"] is True
    assert imported["acquisition_source"] == "imported_file"
    assert imported["overall_kind"] == "imported"
    assert imported["imported_from_provenance"]["overall_kind"] == "offline"


def test_import_payload_infers_old_real_camera_simulated_dataset_run() -> None:
    provenance = infer_provenance_from_export_payload(
        {
            "run_manifest": {
                "dataset_id": "real_camera",
                "measurement_definition": {"source": "real_camera"},
                "frame_records": [
                    {
                        "camera_meta": {
                            "backend": "simulated",
                            "model": "G3 simulated dataset camera",
                            "serial_number": "SIM-DATASET-golden_a_20260522_dev_lab",
                            "dataset_id": "golden_a_20260522_dev_lab",
                        }
                    }
                ],
                "temperature_records": [{"source": "simulated_temperature"}],
                "config_snapshot": {"mode": "real_camera_run", "camera_profile": {"backend": "simulated"}},
            }
        }
    )

    assert provenance["acquisition_source"] == "camera_runtime"
    assert provenance["overall_kind"] == "simulated"
    assert provenance["camera_is_simulated"] is True
    assert provenance["temperature_is_simulated"] is True
