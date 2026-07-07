from __future__ import annotations

from yyt1771_g3.api.main import build_temperature_controller
from yyt1771_g3.core.hardware_config import HardwareConfig
from yyt1771_g3.core.hardware_config import TempConfig
from yyt1771_g3.temperature.simulated import SimulatedTemperatureController


def test_simulated_temperature_controller_returns_deterministic_ramp() -> None:
    controller = SimulatedTemperatureController(
        TempConfig(
            backend="simulated",
            simulated_start_celsius=20.0,
            simulated_step_celsius=0.5,
        )
    )

    first = controller.read_temperature()
    second = controller.read_temperature()

    assert first.celsius == 20.0
    assert second.celsius == 20.5
    assert first.source == "simulated_temperature"


def test_simulated_temperature_controller_accepts_run_control_calls() -> None:
    controller = SimulatedTemperatureController(TempConfig(backend="simulated"))

    controller.set_target_temperature(42.0)
    controller.set_output_power_percent(55.0)
    controller.start_output()
    controller.stop_output()
    controller.close()

    assert controller.target_celsius == 42.0
    assert controller.output_power_percent == 0.0
    assert controller.output_started is False
    assert controller.closed is True


def test_build_temperature_controller_uses_simulated_backend() -> None:
    controller = build_temperature_controller(HardwareConfig(temp=TempConfig(backend="simulated")))

    assert isinstance(controller, SimulatedTemperatureController)
