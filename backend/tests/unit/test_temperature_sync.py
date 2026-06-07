from __future__ import annotations

from yyt1771_g3.core.enums import TemperatureSyncStatus
from yyt1771_g3.temperature.sync import sync_temperature_for_frame


def test_temperature_delta_at_10ms_is_ok() -> None:
    synced = sync_temperature_for_frame(
        1,
        1010,
        [{"frame_index": "1", "temp_timestamp_ms": "1000", "celsius": "10.0", "source": "fixture"}],
    )

    assert synced.status == TemperatureSyncStatus.TEMP_SYNC_OK
    assert synced.delta_ms == 10.0


def test_stale_direct_temperature_when_delta_exceeds_10ms() -> None:
    synced = sync_temperature_for_frame(
        1,
        1025,
        [{"frame_index": "1", "temp_timestamp_ms": "1000", "celsius": "10.0", "source": "fixture"}],
    )

    assert synced.status == TemperatureSyncStatus.TEMP_SYNC_STALE
    assert synced.celsius == 10.0
    assert synced.delta_ms == 25.0


def test_interpolates_between_neighbor_temperature_samples() -> None:
    rows = [
        {"frame_index": "1", "temp_timestamp_ms": "1000", "celsius": "10.0", "source": "fixture"},
        {"frame_index": "3", "temp_timestamp_ms": "1200", "celsius": "14.0", "source": "fixture"},
    ]

    synced = sync_temperature_for_frame(2, 1100, rows)

    assert synced.status == TemperatureSyncStatus.TEMP_SYNC_INTERPOLATED
    assert synced.timestamp_ms == 1100
    assert synced.celsius == 12.0
    assert synced.delta_ms == 0.0


def test_missing_temperature_when_no_direct_or_bracketing_samples() -> None:
    synced = sync_temperature_for_frame(2, 900, [])

    assert synced.status == TemperatureSyncStatus.TEMP_SYNC_MISSING
    assert synced.celsius is None
