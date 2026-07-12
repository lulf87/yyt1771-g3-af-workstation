from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import Field

from yyt1771_g3.core.models import G3Model


RUN_SCHEMA_VERSION = 2


class RunStateValue(StrEnum):
    RUNNING = "RUNNING"
    STOP_REQUESTED = "STOP_REQUESTED"
    FINALIZING = "FINALIZING"
    READY = "READY"
    ERROR = "ERROR"


class RunStage(StrEnum):
    ACQUIRING = "acquiring"
    STOP_REQUESTED = "stop_requested"
    FLUSHING_RESULTS = "flushing_results"
    BUILDING_ANALYSIS = "building_analysis"
    WRITING_SUMMARY = "writing_summary"
    READY = "ready"
    ERROR = "error"


class RunStateV2(G3Model):
    schema_version: int = RUN_SCHEMA_VERSION
    run_id: str
    state: RunStateValue = RunStateValue.RUNNING
    stage: RunStage = RunStage.ACQUIRING
    processed_frames: int = 0
    region_count: int = 1
    stop_reason: str = ""
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    stopped_at: str | None = None
    finalized_at: str | None = None
    error: str | None = None


class RunMetaV2(G3Model):
    schema_version: int = RUN_SCHEMA_VERSION
    run_id: str
    dataset_id: str
    runtime_source: str = ""
    product_mode: str = ""
    operator_data_source: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)
    measurement_definition: dict[str, Any]
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
    software: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RunAnalysisSummaryV2(G3Model):
    schema_version: int = RUN_SCHEMA_VERSION
    analysis_id: str
    run_id: str
    runtime_source: str = ""
    product_mode: str = ""
    operator_data_source: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)
    regions: list[dict[str, Any]] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
