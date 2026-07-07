from __future__ import annotations

import base64
import csv
import io
import json
from pathlib import Path
from typing import Any
from zipfile import BadZipFile, ZipFile

from pydantic import BaseModel, Field


class RunExportImportError(ValueError):
    """Raised when an uploaded file is not a readable G3 export."""


class ImportedFrameSummary(BaseModel):
    total_frames: int = 0
    valid_frames: int = 0
    temperature_distance_points: int = 0
    invalid_reason_counts: dict[str, int] = Field(default_factory=dict)


class ImportedRunView(BaseModel):
    filename: str
    warnings: list[str] = Field(default_factory=list)
    run_manifest: dict[str, Any] | None = None
    analysis_result: dict[str, Any] | None = None
    measurement_definition: dict[str, Any] | None = None
    frame_summary: ImportedFrameSummary = Field(default_factory=ImportedFrameSummary)
    temperature_distance_image_data_url: str | None = None


def import_run_export_bytes(*, filename: str, content: bytes) -> ImportedRunView:
    clean_filename = Path(filename or "upload").name
    if not content:
        raise RunExportImportError("uploaded file is empty")
    suffix = Path(clean_filename).suffix.lower()
    if suffix == ".zip":
        return _import_zip(clean_filename, content)
    if suffix == ".json":
        payload = _read_json_bytes(content, clean_filename)
        return _view_from_payload(
            filename=clean_filename,
            payload=payload,
            frame_rows=None,
            temperature_distance_png=None,
            warnings=[
                "file does not include frame_results.csv",
                "file does not include temperature_distance.png",
            ],
        )
    raise RunExportImportError("not a YY/T 1771 G3 export: expected .zip or .json")


def _import_zip(filename: str, content: bytes) -> ImportedRunView:
    try:
        archive = ZipFile(io.BytesIO(content))
    except BadZipFile as exc:
        raise RunExportImportError("not a YY/T 1771 G3 export: invalid zip file") from exc
    with archive:
        names = set(archive.namelist())
        warnings: list[str] = []
        if "run_export.json" not in names:
            raise RunExportImportError("not a YY/T 1771 G3 export: run_export.json is missing")
        payload = _read_json_bytes(archive.read("run_export.json"), "run_export.json")
        frame_rows = None
        if "frame_results.csv" in names:
            frame_rows = _read_frame_results_csv(archive.read("frame_results.csv"))
        else:
            warnings.append("file does not include frame_results.csv")
        temperature_distance_png = None
        if "temperature_distance.png" in names:
            temperature_distance_png = archive.read("temperature_distance.png")
        else:
            warnings.append("file does not include temperature_distance.png")
        if "parameters.json" in names and not _measurement_from_payload(payload):
            payload = {
                **payload,
                "measurement_definition": _read_json_bytes(archive.read("parameters.json"), "parameters.json"),
            }
        elif "parameters.json" not in names:
            warnings.append("file does not include parameters.json")
        return _view_from_payload(
            filename=filename,
            payload=payload,
            frame_rows=frame_rows,
            temperature_distance_png=temperature_distance_png,
            warnings=warnings,
        )


def _view_from_payload(
    *,
    filename: str,
    payload: dict[str, Any],
    frame_rows: list[dict[str, str]] | None,
    temperature_distance_png: bytes | None,
    warnings: list[str],
) -> ImportedRunView:
    run_manifest = _dict_or_none(payload.get("run_manifest"))
    analysis_result = _dict_or_none(payload.get("analysis_result")) or _dict_or_none(payload.get("analysis"))
    measurement_definition = _measurement_from_payload(payload)
    if run_manifest is None and analysis_result is None and measurement_definition is None:
        raise RunExportImportError("not a YY/T 1771 G3 export: run_export.json is missing run data")
    frame_summary = _frame_summary(
        run_manifest=run_manifest,
        analysis_result=analysis_result,
        frame_rows=frame_rows,
    )
    return ImportedRunView(
        filename=filename,
        warnings=warnings,
        run_manifest=run_manifest,
        analysis_result=analysis_result,
        measurement_definition=measurement_definition,
        frame_summary=frame_summary,
        temperature_distance_image_data_url=_png_data_url(temperature_distance_png),
    )


def _measurement_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    direct = _dict_or_none(payload.get("measurement_definition"))
    if direct is not None:
        return direct
    run_manifest = _dict_or_none(payload.get("run_manifest"))
    if run_manifest is not None:
        return _dict_or_none(run_manifest.get("measurement_definition"))
    return None


def _frame_summary(
    *,
    run_manifest: dict[str, Any] | None,
    analysis_result: dict[str, Any] | None,
    frame_rows: list[dict[str, str]] | None,
) -> ImportedFrameSummary:
    temperature_distance_points = _list_count(_read_nested(analysis_result, "temperature_distance"))
    if frame_rows is not None:
        invalid_reason_counts: dict[str, int] = {}
        valid_frames = 0
        for row in frame_rows:
            if row.get("detection_status") == "VALID":
                valid_frames += 1
            else:
                reason = row.get("rejected_reason") or row.get("detection_status") or "INVALID"
                invalid_reason_counts[reason] = invalid_reason_counts.get(reason, 0) + 1
        return ImportedFrameSummary(
            total_frames=len(frame_rows),
            valid_frames=valid_frames,
            temperature_distance_points=temperature_distance_points,
            invalid_reason_counts=invalid_reason_counts,
        )
    detection_results = _read_nested(run_manifest, "detection_results")
    if isinstance(detection_results, list):
        invalid_reason_counts: dict[str, int] = {}
        valid_frames = 0
        for item in detection_results:
            row = _dict_or_none(item) or {}
            if row.get("detection_status") == "VALID":
                valid_frames += 1
            else:
                reason = str(row.get("rejected_reason") or row.get("detection_status") or "INVALID")
                invalid_reason_counts[reason] = invalid_reason_counts.get(reason, 0) + 1
        return ImportedFrameSummary(
            total_frames=len(detection_results),
            valid_frames=valid_frames,
            temperature_distance_points=temperature_distance_points,
            invalid_reason_counts=invalid_reason_counts,
        )
    return ImportedFrameSummary(
        total_frames=_list_count(_read_nested(run_manifest, "frame_records")),
        valid_frames=0,
        temperature_distance_points=temperature_distance_points,
        invalid_reason_counts={},
    )


def _read_json_bytes(content: bytes, filename: str) -> dict[str, Any]:
    try:
        payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RunExportImportError(f"not a YY/T 1771 G3 export: {filename} is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise RunExportImportError(f"not a YY/T 1771 G3 export: {filename} is not a JSON object")
    return payload


def _read_frame_results_csv(content: bytes) -> list[dict[str, str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise RunExportImportError("frame_results.csv is not UTF-8 text") from exc
    return list(csv.DictReader(io.StringIO(text)))


def _png_data_url(content: bytes | None) -> str | None:
    if not content:
        return None
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _dict_or_none(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _read_nested(container: dict[str, Any] | None, key: str) -> Any:
    if container is None:
        return None
    return container.get(key)


def _list_count(value: Any) -> int:
    return len(value) if isinstance(value, list) else 0
