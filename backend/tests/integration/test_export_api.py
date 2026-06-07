from __future__ import annotations

from fastapi.testclient import TestClient

from yyt1771_g3.core.enums import DetectionStatus, DetectorType, ObjectClass, WidthMode
from yyt1771_g3.core.models import DetectionResult, MeasurementDefinition, RotatedROI, RunManifest
from yyt1771_g3.storage.run_store import RunStore


def test_export_api_creates_artifacts_and_downloads_csv(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("YYT1771_G3_RUN_STORE_DIR", str(tmp_path / "runs"))
    run_store = RunStore()
    manifest = RunManifest(
        run_id="run-api-export",
        dataset_id="golden_a_20260522_dev_lab",
        measurement_definition=MeasurementDefinition(
            measurement_id="m",
            object_class=ObjectClass.A_BALLOON_ENVELOPE,
            detector=DetectorType.BALLOON_ENVELOPE,
            width_mode=WidthMode.MAX_WIDTH,
            roi=RotatedROI(center_x=10.0, center_y=10.0, width=12.0, height=8.0),
        ),
        detection_results=[
            DetectionResult(
                frame_index=1,
                detection_status=DetectionStatus.INVALID_NO_TARGET,
                rejected_reason="NO_TARGET",
            )
        ],
    )
    run_store.write_run_manifest(manifest)

    from yyt1771_g3.api.main import app

    client = TestClient(app)
    response = client.post(f"/api/runs/{manifest.run_id}/exports")

    assert response.status_code == 200
    artifacts = response.json()["artifacts"]
    csv_artifact = next(item for item in artifacts if item["artifact_type"] == "csv")

    download = client.get(csv_artifact["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("text/csv")
    assert "frame_index,detection_status,distance_px" in download.text
