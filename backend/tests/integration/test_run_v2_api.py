from __future__ import annotations

from fastapi.testclient import TestClient

from yyt1771_g3.core.enums import ObjectClass
from yyt1771_g3.core.models import MeasurementDefinition, RotatedROI
from yyt1771_g3.services.run_v2_service import initialize_v2_run
from yyt1771_g3.storage.run_store import RunStore


def _measurement() -> MeasurementDefinition:
    return MeasurementDefinition(
        measurement_id="api-v2",
        object_class=ObjectClass.A_BALLOON_ENVELOPE,
        detector="BalloonEnvelopeDetector",
        roi=RotatedROI(center_x=10, center_y=10, width=10, height=5, angle_deg=0),
    )


def test_v2_status_and_stop_are_lightweight_and_idempotent(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    store = RunStore()
    initialize_v2_run(
        store,
        run_id="run-active-v2",
        dataset_id="dataset",
        measurement=_measurement(),
        runtime_source="simulated_material",
        product_mode="development",
        operator_data_source="simulated_material",
        provenance={},
        config_snapshot={},
    )
    from yyt1771_g3.api.main import app

    client = TestClient(app)
    first = client.post("/api/runs/run-active-v2/stop")
    second = client.post("/api/runs/run-active-v2/stop")
    status = client.get("/api/runs/run-active-v2/status")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["state"] == "STOP_REQUESTED"
    assert second.json()["state"] == "STOP_REQUESTED"
    assert status.json()["stage"] == "stop_requested"
    assert len(first.content) < 4096
