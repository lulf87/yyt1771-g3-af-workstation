from __future__ import annotations

import os
from pathlib import Path

from yyt1771_g3.core.models import AnalysisResult, RunManifest
from yyt1771_g3.services.offline_dataset import _project_root
from yyt1771_g3.storage.manifest_io import read_json_model, write_json_model


class RunStore:
    def __init__(self, root_dir: str | Path | None = None) -> None:
        if root_dir is None:
            root_dir = os.environ.get("YYT1771_G3_RUN_STORE_DIR")
        self.root_dir = Path(root_dir) if root_dir is not None else _project_root() / "output" / "runs"
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        return self.root_dir / run_id

    def run_manifest_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run_manifest.json"

    def analysis_result_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "analysis_result.json"

    def run_availability(self, run_id: str) -> dict[str, bool]:
        manifest_exists = self.run_manifest_path(run_id).exists()
        analysis_exists = self.analysis_result_path(run_id).exists()
        return {
            "manifest_exists": manifest_exists,
            "analysis_exists": analysis_exists,
            "exists": manifest_exists and analysis_exists,
        }

    def write_run_manifest(self, manifest: RunManifest) -> Path:
        path = self.run_manifest_path(manifest.run_id)
        write_json_model(path, manifest)
        return path

    def read_run_manifest(self, run_id: str) -> RunManifest:
        return read_json_model(self.run_dir(run_id) / "run_manifest.json", RunManifest)

    def write_analysis_result(self, analysis: AnalysisResult) -> Path:
        path = self.analysis_result_path(analysis.run_id)
        write_json_model(path, analysis)
        return path

    def read_analysis_result(self, run_id: str) -> AnalysisResult:
        return read_json_model(self.run_dir(run_id) / "analysis_result.json", AnalysisResult)
