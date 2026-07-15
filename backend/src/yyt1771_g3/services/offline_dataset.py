from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


def _project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "AGENTS.md").is_file() and (parent / "configs").is_dir():
            return parent
    return current.parents[4]


def default_registry_config_path() -> Path:
    return _project_root() / "configs" / "local" / "offline_datasets.local.json"


class OfflineDatasetError(RuntimeError):
    """Base exception for offline dataset registry failures."""


class DatasetNotFoundError(OfflineDatasetError):
    def __init__(self, dataset_id: str) -> None:
        super().__init__(f"Offline dataset not found: {dataset_id}")
        self.dataset_id = dataset_id


class DatasetAccessError(OfflineDatasetError):
    def __init__(self, dataset_id: str, issues: list[dict[str, str]]) -> None:
        self.dataset_id = dataset_id
        self.issues = issues
        details = "; ".join(issue["message"] for issue in issues)
        super().__init__(f"Offline dataset {dataset_id} is not accessible: {details}")


@dataclass(frozen=True)
class ResolvedOfflineDataset:
    dataset_id: str
    root_path: Path
    manifest_path: Path
    temperature_csv_path: Path
    frames_dir: Path
    frame_glob: str
    object_class: str
    default_detector: str
    default_width_mode: str
    legacy_profile: dict[str, Any] | None
    frame_paths: tuple[Path, ...]

    @property
    def frame_count(self) -> int:
        return len(self.frame_paths)


@dataclass(frozen=True)
class LoadedOfflineFrame:
    dataset_id: str
    frame_index: int
    frame_path: Path
    array: np.ndarray


class OfflineDatasetRegistry:
    def __init__(self, config_path: Path, raw_config: dict[str, Any]) -> None:
        self.config_path = config_path
        self.raw_config = raw_config
        self._datasets = self._index_datasets(raw_config)

    @staticmethod
    def _index_datasets(raw_config: dict[str, Any]) -> dict[str, dict[str, Any]]:
        datasets = raw_config.get("datasets")
        if not isinstance(datasets, list):
            raise OfflineDatasetError("offline dataset registry must contain a datasets list")

        indexed: dict[str, dict[str, Any]] = {}
        for entry in datasets:
            if not isinstance(entry, dict):
                raise OfflineDatasetError("offline dataset entries must be JSON objects")
            dataset_id = entry.get("id")
            if not isinstance(dataset_id, str) or not dataset_id:
                raise OfflineDatasetError("offline dataset entry is missing id")
            if dataset_id in indexed:
                raise OfflineDatasetError(f"duplicate offline dataset id: {dataset_id}")
            indexed[dataset_id] = entry
        return indexed

    def list_offline_datasets(self) -> list[dict[str, Any]]:
        datasets: list[dict[str, Any]] = []
        for dataset_id, entry in self._datasets.items():
            item: dict[str, Any] = {
                "id": dataset_id,
                "label": entry.get("label", dataset_id),
                "object_class": entry.get("object_class", ""),
                "g3_type": entry.get("g3_type", ""),
                "default_detector": entry.get("default_detector", ""),
                "default_width_mode": entry.get("default_width_mode", ""),
            }
            if isinstance(entry.get("legacy_profile"), dict):
                item["legacy_profile"] = dict(entry["legacy_profile"])
            try:
                item["frame_count"] = self.resolve_dataset(dataset_id).frame_count
            except DatasetAccessError as exc:
                item["frame_count"] = 0
                item["validation_issues"] = exc.issues
            datasets.append(item)
        return datasets

    def resolve_dataset(self, dataset_id: str) -> ResolvedOfflineDataset:
        entry = self._entry(dataset_id)
        root_path = self._path_from_entry(entry, "root_path", fallback_keys=("path", "absolute_path"))
        manifest_path = root_path / str(entry.get("manifest", entry.get("manifest_json", "manifest.json")))
        temperature_csv_path = root_path / str(entry.get("temperature_csv", "temperature.csv"))
        frames_dir = root_path / str(entry.get("frames_dir", "frames"))
        frame_glob = str(entry.get("frame_glob", entry.get("frame_pattern", "frame_*.npy")))

        issues: list[dict[str, str]] = []
        self._require_dir(issues, "root_path", root_path)
        self._require_file(issues, "manifest", manifest_path)
        self._require_file(issues, "temperature_csv", temperature_csv_path)
        self._require_dir(issues, "frames_dir", frames_dir)

        frame_paths: tuple[Path, ...] = ()
        if frames_dir.is_dir():
            frame_paths = tuple(sorted(frames_dir.glob(frame_glob)))
            if not frame_paths:
                issues.append(
                    {
                        "field": "frame_glob",
                        "path": str(frames_dir / frame_glob),
                        "message": f"frame_glob matched no frames: {frames_dir / frame_glob}",
                    }
                )

        if issues:
            raise DatasetAccessError(dataset_id, issues)

        return ResolvedOfflineDataset(
            dataset_id=dataset_id,
            root_path=root_path,
            manifest_path=manifest_path,
            temperature_csv_path=temperature_csv_path,
            frames_dir=frames_dir,
            frame_glob=frame_glob,
            object_class=str(entry.get("object_class", "")),
            default_detector=str(entry.get("default_detector", "")),
            default_width_mode=str(entry.get("default_width_mode", "")),
            legacy_profile=dict(entry["legacy_profile"]) if isinstance(entry.get("legacy_profile"), dict) else None,
            frame_paths=frame_paths,
        )

    def load_manifest(self, dataset_id: str) -> dict[str, Any]:
        resolved = self.resolve_dataset(dataset_id)
        return json.loads(resolved.manifest_path.read_text(encoding="utf-8"))

    def load_temperature_csv(self, dataset_id: str) -> list[dict[str, str]]:
        resolved = self.resolve_dataset(dataset_id)
        with resolved.temperature_csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))

    def load_frame(self, dataset_id: str, frame_index: int) -> LoadedOfflineFrame:
        resolved = self.resolve_dataset(dataset_id)
        frame_path = self._frame_path_for_index(resolved, frame_index)
        return LoadedOfflineFrame(
            dataset_id=dataset_id,
            frame_index=frame_index,
            frame_path=frame_path,
            array=np.load(frame_path, allow_pickle=False),
        )

    def load_first_frame(self, dataset_id: str) -> LoadedOfflineFrame:
        resolved = self.resolve_dataset(dataset_id)
        return self._load_edge_frame(resolved, 0)

    def load_last_frame(self, dataset_id: str) -> LoadedOfflineFrame:
        resolved = self.resolve_dataset(dataset_id)
        return self._load_edge_frame(resolved, -1)

    def _entry(self, dataset_id: str) -> dict[str, Any]:
        try:
            return self._datasets[dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(dataset_id) from exc

    def _path_from_entry(
        self,
        entry: dict[str, Any],
        key: str,
        *,
        fallback_keys: tuple[str, ...] = (),
    ) -> Path:
        value = entry.get(key)
        if value is None:
            for fallback_key in fallback_keys:
                value = entry.get(fallback_key)
                if value is not None:
                    break
        if not isinstance(value, str) or not value:
            dataset_id = str(entry.get("id", "<unknown>"))
            raise DatasetAccessError(
                dataset_id,
                [
                    {
                        "field": key,
                        "path": "",
                        "message": f"{key} is missing from offline dataset registry",
                    }
                ],
            )

        path = Path(value).expanduser()
        if not path.is_absolute():
            path = (self.config_path.parent / path).resolve()
        return path

    @staticmethod
    def _require_file(issues: list[dict[str, str]], field: str, path: Path) -> None:
        if not path.is_file():
            issues.append(
                {
                    "field": field,
                    "path": str(path),
                    "message": f"{field} is not accessible: {path}",
                }
            )

    @staticmethod
    def _require_dir(issues: list[dict[str, str]], field: str, path: Path) -> None:
        if not path.is_dir():
            issues.append(
                {
                    "field": field,
                    "path": str(path),
                    "message": f"{field} is not accessible: {path}",
                }
            )

    @staticmethod
    def _frame_path_for_index(resolved: ResolvedOfflineDataset, frame_index: int) -> Path:
        if frame_index < 1 or frame_index > len(resolved.frame_paths):
            raise OfflineDatasetError(
                f"frame_index {frame_index} is out of range for {resolved.dataset_id}"
            )
        return resolved.frame_paths[frame_index - 1]

    @staticmethod
    def _load_edge_frame(
        resolved: ResolvedOfflineDataset,
        position: int,
    ) -> LoadedOfflineFrame:
        frame_path = resolved.frame_paths[position]
        frame_index = position + 1 if position >= 0 else len(resolved.frame_paths)
        return LoadedOfflineFrame(
            dataset_id=resolved.dataset_id,
            frame_index=frame_index,
            frame_path=frame_path,
            array=np.load(frame_path, allow_pickle=False),
        )


def load_dataset_registry(config_path: str | Path | None = None) -> OfflineDatasetRegistry:
    path = Path(config_path) if config_path is not None else default_registry_config_path()
    path = path.expanduser()
    if not path.is_absolute():
        path = (_project_root() / path).resolve()
    if not path.is_file():
        raise OfflineDatasetError(f"offline dataset registry config is not accessible: {path}")
    raw_config = json.loads(path.read_text(encoding="utf-8"))
    return OfflineDatasetRegistry(path, raw_config)


def list_offline_datasets(config_path: str | Path | None = None) -> list[dict[str, Any]]:
    return load_dataset_registry(config_path).list_offline_datasets()


def resolve_dataset(
    dataset_id: str,
    config_path: str | Path | None = None,
) -> ResolvedOfflineDataset:
    return load_dataset_registry(config_path).resolve_dataset(dataset_id)
