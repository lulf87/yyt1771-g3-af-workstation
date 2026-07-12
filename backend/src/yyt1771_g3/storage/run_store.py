from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any

from yyt1771_g3.core.models import AnalysisResult, RunManifest
from yyt1771_g3.core.run_models_v2 import RunAnalysisSummaryV2, RunMetaV2, RunStateV2
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

    def run_meta_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run_meta.json"

    def run_state_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run_state.json"

    def results_database_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "results.sqlite"

    def analysis_summary_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "analysis_summary.json"

    def schema_version(self, run_id: str) -> int | None:
        if self.run_meta_path(run_id).exists() and self.results_database_path(run_id).exists():
            return 2
        if self.run_manifest_path(run_id).exists():
            return 1
        return None

    def run_availability(self, run_id: str) -> dict[str, bool]:
        if self.schema_version(run_id) == 2:
            state = self.read_run_state(run_id)
            ready = state.state.value == "READY" and self.analysis_summary_path(run_id).exists()
            return {
                "manifest_exists": self.run_meta_path(run_id).exists(),
                "analysis_exists": self.analysis_summary_path(run_id).exists(),
                "exists": ready,
            }
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

    def write_run_meta(self, meta: RunMetaV2) -> Path:
        return self._write_atomic_json(self.run_meta_path(meta.run_id), meta.model_dump(mode="json"))

    def read_run_meta(self, run_id: str) -> RunMetaV2:
        return RunMetaV2.model_validate_json(self.run_meta_path(run_id).read_text(encoding="utf-8"))

    def write_run_state(self, state: RunStateV2) -> Path:
        return self._write_atomic_json(self.run_state_path(state.run_id), state.model_dump(mode="json"))

    def read_run_state(self, run_id: str) -> RunStateV2:
        return RunStateV2.model_validate_json(self.run_state_path(run_id).read_text(encoding="utf-8"))

    def write_analysis_summary(self, summary: RunAnalysisSummaryV2) -> Path:
        return self._write_atomic_json(self.analysis_summary_path(summary.run_id), summary.model_dump(mode="json"))

    def read_analysis_summary(self, run_id: str) -> RunAnalysisSummaryV2:
        return RunAnalysisSummaryV2.model_validate_json(
            self.analysis_summary_path(run_id).read_text(encoding="utf-8")
        )

    def list_saved_runs(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for directory in self.root_dir.iterdir():
            if not directory.is_dir():
                continue
            version = self.schema_version(directory.name)
            if version == 2:
                try:
                    state = self.read_run_state(directory.name)
                    meta = self.read_run_meta(directory.name)
                except (OSError, ValueError):
                    continue
                items.append({
                    "schema_version": 2,
                    "run_id": directory.name,
                    "created_at": meta.created_at,
                    "state": state.state.value,
                    "stage": state.stage.value,
                    "processed_frames": state.processed_frames,
                    "region_count": state.region_count,
                    "stop_reason": state.stop_reason,
                    "runtime_source": meta.runtime_source,
                    "operator_data_source": meta.operator_data_source,
                })
        return sorted(items, key=lambda item: str(item["created_at"]), reverse=True)

    @staticmethod
    def _write_atomic_json(path: Path, payload: dict[str, Any]) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(temporary, path)
        return path
