from __future__ import annotations

from yyt1771_g3.core.hardware_config import TempConfig
from yyt1771_g3.core.timebase import now_ms
from yyt1771_g3.temperature.base import TemperatureReading


class SimulatedTemperatureController:
    """Small deterministic temperature source for local startup and browser flows."""

    def __init__(self, config: TempConfig) -> None:
        self.config = config
        self._read_count = 0
        self.target_celsius: float | None = None
        self.output_power_percent = 0.0
        self.output_started = False
        self.closed = False

    def read_temperature(self) -> TemperatureReading:
        celsius = self.config.simulated_start_celsius + self._read_count * self.config.simulated_step_celsius
        self._read_count += 1
        return TemperatureReading(
            timestamp_ms=now_ms(),
            celsius=float(celsius),
            source="simulated_temperature",
        )

    def set_target_temperature(self, celsius: float) -> None:
        self.target_celsius = float(celsius)

    def set_output_power_percent(self, percent: float) -> None:
        if percent < 0.0 or percent > 100.0:
            raise ValueError("output power percent must be within 0..100")
        self.output_power_percent = float(percent)

    def start_output(self) -> None:
        self.output_started = True

    def stop_output(self) -> None:
        self.output_started = False
        self.output_power_percent = 0.0

    def close(self) -> None:
        self.closed = True


__all__ = ["SimulatedTemperatureController"]
