from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from yyt1771_g3.core.enums import TemperatureSyncStatus


@dataclass(frozen=True)
class SyncedTemperature:
    timestamp_ms: int | None
    celsius: float | None
    source: str
    sampled_this_frame: bool
    delta_ms: float | None
    status: TemperatureSyncStatus


def sync_temperature_for_frame(
    frame_index: int,
    frame_timestamp_ms: int | None,
    temperature_rows: list[dict[str, Any]],
    *,
    ok_delta_ms: float = 10.0,
) -> SyncedTemperature:
    if not temperature_rows or frame_timestamp_ms is None:
        return SyncedTemperature(None, None, "", False, None, TemperatureSyncStatus.TEMP_SYNC_MISSING)

    direct = _row_for_frame(frame_index, temperature_rows)
    interpolated = _interpolate(frame_timestamp_ms, temperature_rows)
    if direct is None:
        if interpolated is not None:
            celsius, source = interpolated
            return SyncedTemperature(
                frame_timestamp_ms,
                celsius,
                source,
                False,
                0.0,
                TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED,
            )
        return SyncedTemperature(None, None, "", False, None, TemperatureSyncStatus.TEMP_SYNC_MISSING)

    temp_timestamp = _int_or_none(direct.get("temp_timestamp_ms") or direct.get("timestamp_ms"))
    celsius = _float_or_none(direct.get("celsius"))
    sampled = str(direct.get("sampled_this_frame", "")).lower() in {"1", "true", "yes"}
    source = str(direct.get("source", ""))
    if temp_timestamp is None or celsius is None:
        return SyncedTemperature(None, None, source, sampled, None, TemperatureSyncStatus.TEMP_SYNC_MISSING)

    delta = abs(float(frame_timestamp_ms - temp_timestamp))
    status = (
        TemperatureSyncStatus.TEMP_SYNC_OK
        if delta <= ok_delta_ms
        else TemperatureSyncStatus.TEMP_SYNC_STALE
    )
    if status == TemperatureSyncStatus.TEMP_SYNC_STALE and interpolated is not None:
        interpolated_celsius, interpolated_source = interpolated
        return SyncedTemperature(
            frame_timestamp_ms,
            interpolated_celsius,
            interpolated_source,
            False,
            0.0,
            TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED,
        )
    return SyncedTemperature(temp_timestamp, celsius, source, sampled, delta, status)


def _row_for_frame(frame_index: int, rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    for row in rows:
        try:
            if int(str(row.get("frame_index", ""))) == frame_index:
                return row
        except ValueError:
            continue
    return None


def _int_or_none(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def _float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value))
    except ValueError:
        return None


def _interpolate(
    frame_timestamp_ms: int,
    rows: list[dict[str, Any]],
) -> tuple[float, str] | None:
    samples: list[tuple[int, float, str]] = []
    for row in rows:
        timestamp = _int_or_none(row.get("temp_timestamp_ms") or row.get("timestamp_ms"))
        celsius = _float_or_none(row.get("celsius"))
        if timestamp is None or celsius is None:
            continue
        samples.append((timestamp, celsius, str(row.get("source", ""))))
    samples = sorted(set(samples), key=lambda item: item[0])
    before = None
    after = None
    for sample in samples:
        if sample[0] <= frame_timestamp_ms:
            before = sample
        if sample[0] >= frame_timestamp_ms:
            after = sample
            break
    if before is None or after is None or before[0] == after[0]:
        return None
    ratio = (frame_timestamp_ms - before[0]) / (after[0] - before[0])
    celsius = before[1] + (after[1] - before[1]) * ratio
    return (celsius, before[2] or after[2])
