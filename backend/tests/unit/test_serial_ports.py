from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from yyt1771_g3.temperature.serial_ports import list_serial_ports


def test_list_serial_ports_sorts_windows_com_numbers(monkeypatch) -> None:  # noqa: ANN001
    serial_module = ModuleType("serial")
    tools_module = ModuleType("serial.tools")
    list_ports_module = ModuleType("serial.tools.list_ports")
    list_ports_module.comports = lambda: [
        SimpleNamespace(device="COM10", name="COM10", description="USB Serial", hwid="VID_10"),
        SimpleNamespace(device="COM3", name="COM3", description="USB Serial", hwid="VID_03"),
    ]
    tools_module.list_ports = list_ports_module
    serial_module.tools = tools_module
    monkeypatch.setitem(sys.modules, "serial", serial_module)
    monkeypatch.setitem(sys.modules, "serial.tools", tools_module)
    monkeypatch.setitem(sys.modules, "serial.tools.list_ports", list_ports_module)

    ports = list_serial_ports()

    assert [port.device for port in ports] == ["COM3", "COM10"]
