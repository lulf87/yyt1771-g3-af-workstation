from __future__ import annotations

from pathlib import Path

from yyt1771_g3.core.enums import ObjectClass
from yyt1771_g3.core.models import CurvePoint, MeasurementDefinition, RegionAnalysisResult, RotatedROI
from yyt1771_g3.core.run_models_v2 import RunStage, RunStateValue
from yyt1771_g3.services.run_v2_service import initialize_v2_run, update_v2_run_state
from yyt1771_g3.storage.run_store import RunStore


def _measurement() -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id="m1",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector="BalloonEnvelopeDetector",
        roi=RotatedROI(center_x=10, center_y=10, width=10, height=5, angle_deg=0),
    )


def test_v2_state_and_meta_are_atomic_and_survive_store_restart(tmp_path: Path) -> None:
    store = RunStore(tmp_path)
    initialize_v2_run(
        store,
        run_id="run-v2",
        dataset_id="dataset",
        measurement=_measurement(),
        runtime_source="simulated_material",
        product_mode="development",
        operator_data_source="simulated_material",
        provenance={"overall_kind": "simulated"},
        config_snapshot={},
    )
    update_v2_run_state(
        store,
        "run-v2",
        state=RunStateValue.READY,
        stage=RunStage.READY,
        processed_frames=20,
        stop_reason="manual_stop_requested",
    )

    restarted = RunStore(tmp_path)
    assert restarted.schema_version("run-v2") == 2
    assert restarted.read_run_state("run-v2").state == RunStateValue.READY
    assert restarted.read_run_meta("run-v2").runtime_source == "simulated_material"
    assert restarted.list_saved_runs()[0]["processed_frames"] == 20
    assert not list((tmp_path / "run-v2").glob("*.tmp"))


def test_4816_by_six_analysis_snapshot_stays_below_fifty_megabytes(tmp_path: Path) -> None:
    from yyt1771_g3.core.models import MeasurementRegion
    from yyt1771_g3.services.run_v2_service import build_v2_analysis_summary
    from yyt1771_g3.storage.run_results_db import RunResultsDatabase

    measurement = _measurement().model_copy(update={
        "regions": [
            MeasurementRegion(
                region_id=f"region_{index}", index=index, label=f"位置 {index}",
                roi=RotatedROI(center_x=10, center_y=10 + index, width=10, height=5, angle_deg=0),
                color="#000000",
            )
            for index in range(1, 7)
        ]
    })
    store = RunStore(tmp_path / "runs")
    initialize_v2_run(
        store, run_id="run-large-v2", dataset_id="dataset", measurement=measurement,
        runtime_source="simulated_material", product_mode="development",
        operator_data_source="simulated_material", provenance={}, config_snapshot={},
    )
    points = [CurvePoint(x=20 + index / 100, y=100 + index / 1000, frame_index=index) for index in range(1, 4817)]
    analyses = [
        RegionAnalysisResult(
            region_id=f"region_{index}", region_index=index, region_label=f"位置 {index}", color="#000000",
            distance_time=points, raw_distance_time=points, stabilized_distance_time=points,
            temperature_time=points, temperature_distance=points,
            raw_temperature_distance=points, stabilized_temperature_distance=points,
            afas_preprocessing={"smoothed": {"values": [point.y for point in points]}},
            afas_analysis={"result_status": "ok", "result": {"As": 30.0, "Af": 40.0}},
        )
        for index in range(1, 7)
    ]
    summary = build_v2_analysis_summary(store, run_id="run-large-v2", region_analyses=analyses, latest_results={})
    store.write_analysis_summary(summary)

    total_size = sum(path.stat().st_size for path in store.run_dir("run-large-v2").iterdir() if path.is_file())
    assert total_size < 50 * 1024 * 1024
    assert "all_frames" not in store.analysis_summary_path("run-large-v2").read_text(encoding="utf-8")
