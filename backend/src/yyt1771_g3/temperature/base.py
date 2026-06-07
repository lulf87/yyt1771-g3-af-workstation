from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class TemperatureReading:
    timestamp_ms: int | None
    celsius: float | None
    source: str
    error: str = ""


class TemperatureController(Protocol):
    def read_temperature(self) -> TemperatureReading:
        ...

    def close(self) -> None:
        ...
