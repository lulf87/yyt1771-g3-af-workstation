from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from yyt1771_g3.core.enums import DetectionStatus
from yyt1771_g3.core.models import DetectionResult, FrameRecord, TemperatureRecord


SCHEMA_VERSION = 2


class RunResultsDatabase:
    """Compact, single-copy storage for high-frequency run results."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=NORMAL")
        self._create_schema()

    def __enter__(self) -> "RunResultsDatabase":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def close(self) -> None:
        self.connection.close()

    def commit(self) -> None:
        self.connection.commit()

    def append_batch(
        self,
        frames: Sequence[FrameRecord],
        temperatures: Sequence[TemperatureRecord],
        region_results: Sequence[DetectionResult],
    ) -> None:
        temperatures_by_index = {
            frame.frame_index: temperatures[index]
            for index, frame in enumerate(frames)
            if index < len(temperatures)
        }
        detection_by_frame: dict[int, DetectionResult] = {}
        for result in region_results:
            detection_by_frame.setdefault(result.frame_index, result)
        with self.connection:
            self.connection.executemany(
                """
                INSERT OR REPLACE INTO frames (
                    frame_index, frame_timestamp_ms, temperature_timestamp_ms,
                    temperature_celsius, temperature_sync_status, temperature_delta_ms,
                    temperature_source, sampled_this_frame, frame_source, frame_path,
                    raw_frame_saved, preview_path, shape_json, dtype
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    self._frame_row(
                        frame,
                        temperatures_by_index.get(frame.frame_index),
                        detection_by_frame.get(frame.frame_index),
                    )
                    for frame in frames
                ],
            )
            self.connection.executemany(
                """
                INSERT OR REPLACE INTO region_results (
                    frame_index, region_id, detection_status, formal_distance_px,
                    raw_distance_px, stabilized_distance_px, result_display_source,
                    formal_a_x, formal_a_y, formal_b_x, formal_b_y,
                    raw_a_x, raw_a_y, raw_b_x, raw_b_y,
                    stabilized_a_x, stabilized_a_y, stabilized_b_x, stabilized_b_y,
                    confidence, curve_point_status, curve_exclusion_reason, rejected_reason,
                    distance_outlier_filtered, distance_outlier_baseline_px,
                    distance_outlier_deviation_px, distance_outlier_max_jump_px,
                    distance_outlier_reference_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [self._result_row(result) for result in region_results],
            )
            diagnostics = [row for result in region_results if (row := self._diagnostic_row(result)) is not None]
            if diagnostics:
                self.connection.executemany(
                    """
                    INSERT OR REPLACE INTO diagnostic_events
                    (frame_index, region_id, diagnostic_type, payload_json)
                    VALUES (?, ?, ?, ?)
                    """,
                    diagnostics,
                )

    def result_count(self, *, region_id: str | None = None) -> int:
        if region_id is None:
            row = self.connection.execute("SELECT COUNT(*) AS count FROM region_results").fetchone()
        else:
            row = self.connection.execute(
                "SELECT COUNT(*) AS count FROM region_results WHERE region_id = ?", (region_id,)
            ).fetchone()
        return int(row["count"])

    def frame_count(self) -> int:
        row = self.connection.execute("SELECT COUNT(*) AS count FROM frames").fetchone()
        return int(row["count"])

    def query_results(
        self,
        *,
        region_id: str | None = None,
        offset: int = 0,
        limit: int = 200,
        status: str | None = None,
        frame_start: int | None = None,
        frame_end: int | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses: list[str] = []
        parameters: list[Any] = []
        for clause, value in (
            ("region_id = ?", region_id),
            ("detection_status = ?", status),
            ("frame_index >= ?", frame_start),
            ("frame_index <= ?", frame_end),
        ):
            if value is not None:
                clauses.append(clause)
                parameters.append(value)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        total = int(self.connection.execute(f"SELECT COUNT(*) FROM region_results{where}", parameters).fetchone()[0])
        rows = self.connection.execute(
            f"SELECT * FROM region_results{where} ORDER BY frame_index, region_id LIMIT ? OFFSET ?",
            [*parameters, limit, offset],
        ).fetchall()
        return [dict(row) for row in rows], total

    def frame_results(self, frame_index: int) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM region_results WHERE frame_index = ? ORDER BY region_id", (frame_index,)
        ).fetchall()
        return [dict(row) for row in rows]

    def all_frames(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute("SELECT * FROM frames ORDER BY frame_index")]

    def diagnostic_events(self, region_id: str) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT frame_index, region_id, diagnostic_type, payload_json FROM diagnostic_events WHERE region_id = ? ORDER BY frame_index",
            (region_id,),
        ).fetchall()
        return [
            {
                "frame_index": row["frame_index"],
                "region_id": row["region_id"],
                "diagnostic_type": row["diagnostic_type"],
                "payload": json.loads(row["payload_json"]),
            }
            for row in rows
        ]

    def iter_region_results(self, region_id: str) -> Iterable[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT r.*, f.frame_timestamp_ms, f.temperature_timestamp_ms,
                   f.temperature_celsius, f.temperature_sync_status,
                   f.temperature_delta_ms, f.temperature_source, f.sampled_this_frame
            FROM region_results r JOIN frames f USING (frame_index)
            WHERE r.region_id = ? ORDER BY r.frame_index
            """,
            (region_id,),
        )
        for row in rows:
            yield dict(row)

    def _create_schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '2');
            CREATE TABLE IF NOT EXISTS frames (
                frame_index INTEGER PRIMARY KEY,
                frame_timestamp_ms INTEGER, temperature_timestamp_ms INTEGER,
                temperature_celsius REAL, temperature_sync_status TEXT,
                temperature_delta_ms REAL, temperature_source TEXT NOT NULL DEFAULT '',
                sampled_this_frame INTEGER NOT NULL DEFAULT 0,
                frame_source TEXT NOT NULL DEFAULT '', frame_path TEXT NOT NULL DEFAULT '',
                raw_frame_saved INTEGER NOT NULL DEFAULT 0, preview_path TEXT NOT NULL DEFAULT '',
                shape_json TEXT NOT NULL DEFAULT '[]', dtype TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS region_results (
                frame_index INTEGER NOT NULL, region_id TEXT NOT NULL,
                detection_status TEXT NOT NULL, formal_distance_px REAL,
                raw_distance_px REAL, stabilized_distance_px REAL,
                result_display_source TEXT NOT NULL,
                formal_a_x REAL, formal_a_y REAL, formal_b_x REAL, formal_b_y REAL,
                raw_a_x REAL, raw_a_y REAL, raw_b_x REAL, raw_b_y REAL,
                stabilized_a_x REAL, stabilized_a_y REAL, stabilized_b_x REAL, stabilized_b_y REAL,
                confidence REAL, curve_point_status TEXT NOT NULL,
                curve_exclusion_reason TEXT NOT NULL DEFAULT '', rejected_reason TEXT NOT NULL DEFAULT '',
                distance_outlier_filtered INTEGER NOT NULL DEFAULT 0,
                distance_outlier_baseline_px REAL, distance_outlier_deviation_px REAL,
                distance_outlier_max_jump_px REAL, distance_outlier_reference_count INTEGER,
                PRIMARY KEY(frame_index, region_id),
                FOREIGN KEY(frame_index) REFERENCES frames(frame_index)
            );
            CREATE INDEX IF NOT EXISTS idx_region_results_region ON region_results(region_id, frame_index);
            CREATE INDEX IF NOT EXISTS idx_region_results_status ON region_results(curve_point_status);
            CREATE TABLE IF NOT EXISTS diagnostic_events (
                frame_index INTEGER NOT NULL, region_id TEXT NOT NULL,
                diagnostic_type TEXT NOT NULL, payload_json TEXT NOT NULL,
                PRIMARY KEY(frame_index, region_id, diagnostic_type)
            );
            """
        )
        self.connection.commit()

    @staticmethod
    def _frame_row(
        frame: FrameRecord,
        temperature: TemperatureRecord | None,
        detection: DetectionResult | None,
    ) -> tuple[Any, ...]:
        return (
            frame.frame_index, frame.timestamp_ms,
            temperature.timestamp_ms if temperature else None,
            temperature.celsius if temperature else None,
            detection.temperature_sync_status.value if detection else None,
            detection.temperature_delta_ms if detection else None,
            temperature.source if temperature else "",
            int(temperature.sampled_this_frame) if temperature else 0,
            frame.source, frame.frame_path, int(frame.raw_frame_saved), frame.preview_path,
            json.dumps(frame.shape, separators=(",", ":")), frame.dtype,
        )

    @staticmethod
    def _result_row(result: DetectionResult) -> tuple[Any, ...]:
        def points(value: Any) -> tuple[float | None, float | None, float | None, float | None]:
            if value is None:
                return None, None, None, None
            return value.a.x, value.a.y, value.b.x, value.b.y

        return (
            result.frame_index, result.region_id, result.detection_status.value,
            result.distance_px, result.raw_distance_px, result.stabilized_distance_px,
            result.result_display_source, *points(result.ab_points), *points(result.raw_ab_points),
            *points(result.stabilized_ab_points), result.quality.confidence,
            result.curve_point_status.value, result.curve_exclusion_reason, result.rejected_reason,
            int(result.distance_outlier_filtered), result.distance_outlier_baseline_px,
            result.distance_outlier_deviation_px, result.distance_outlier_max_jump_px,
            result.distance_outlier_reference_count,
        )

    @staticmethod
    def _diagnostic_row(result: DetectionResult) -> tuple[int, str, str, str] | None:
        suspicious = bool(result.debug_artifacts.get("suspicious"))
        enhanced = bool(result.debug_artifacts.get("enhanced_rerun_used"))
        if result.detection_status == DetectionStatus.VALID and not result.distance_outlier_filtered and not suspicious and not enhanced:
            return None
        payload = {
            "rejected_reason": result.rejected_reason,
            "curve_exclusion_reason": result.curve_exclusion_reason,
            "suspicious_reasons": result.debug_artifacts.get("suspicious_reasons", []),
            "enhanced_rerun_reason": result.debug_artifacts.get("enhanced_rerun_reason", ""),
        }
        kind = "invalid" if result.detection_status != DetectionStatus.VALID else "filtered_or_suspicious"
        return result.frame_index, result.region_id, kind, json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
