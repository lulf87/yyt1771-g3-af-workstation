from __future__ import annotations

import pytest

from yyt1771_g3.core.hardware_config import (
    SerialPortConfig,
    TempConfig,
    TempControlConfig,
    TempRegisterConfig,
    TempRegisterMapConfig,
)
from yyt1771_g3.temperature.lu92xx_modbus import LU92XXModbusRtuController


class FakeSerialTransport:
    def __init__(self, responses: list[bytes] | None = None) -> None:
        self.responses = list(responses or [])
        self.writes: list[bytes] = []
        self.close_count = 0

    def read(self, size: int) -> bytes:
        if not self.responses:
            return b""
        return self.responses.pop(0)

    def write(self, data: bytes) -> int:
        self.writes.append(data)
        return len(data)

    def close(self) -> None:
        self.close_count += 1


def _crc_bytes(payload: bytes) -> bytes:
    crc = 0xFFFF
    for value in payload:
        crc ^= value
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return bytes((crc & 0xFF, (crc >> 8) & 0xFF))


def _read_response(slave: int, function_code: int, values: list[int]) -> bytes:
    payload = bytearray([slave, function_code, len(values) * 2])
    for value in values:
        payload.extend(((value >> 8) & 0xFF, value & 0xFF))
    return bytes(payload) + _crc_bytes(bytes(payload))


def _write_response(slave: int, function_code: int, start_address: int, value: int) -> bytes:
    payload = bytes(
        [
            slave,
            function_code,
            (start_address >> 8) & 0xFF,
            start_address & 0xFF,
            (value >> 8) & 0xFF,
            value & 0xFF,
        ]
    )
    return payload + _crc_bytes(payload)


def _config() -> TempConfig:
    return TempConfig(
        backend="lu92xx_modbus_rtu",
        protocol="modbus_rtu",
        slave_address=1,
        serial=SerialPortConfig(port="COM5", baudrate=19200, bytesize=8, parity="N", stopbits=1, timeout_ms=500),
        register_map=TempRegisterMapConfig(
            process_value=TempRegisterConfig(function_code=3, start_address=264, register_count=1, signed=True, decode_scale=0.1),
            target_or_stop_value=TempRegisterConfig(function_code=6, start_address=0, register_count=1, signed=True, encode_scale=10.0),
            output_power=TempRegisterConfig(function_code=6, start_address=4, register_count=1, signed=False, encode_scale=256.0),
        ),
        control=TempControlConfig(startup_power_percent=100.0),
    )


def test_read_temperature_decodes_lu92xx_process_value_register() -> None:
    transport = FakeSerialTransport(responses=[_read_response(1, 3, [253])])
    controller = LU92XXModbusRtuController(_config(), transport_factory=lambda serial: transport)

    reading = controller.read_temperature()

    assert reading.celsius == 25.3
    assert reading.source == "lu92xx_modbus_rtu"
    assert transport.writes[0][:6] == bytes([1, 3, 0x01, 0x08, 0x00, 0x01])


def test_set_target_temperature_and_power_use_verified_registers() -> None:
    transport = FakeSerialTransport(
        responses=[
            _write_response(1, 6, 0, 755),
            _write_response(1, 6, 4, 17408),
        ]
    )
    controller = LU92XXModbusRtuController(_config(), transport_factory=lambda serial: transport)

    controller.set_target_temperature(75.5)
    controller.set_output_power_percent(68.0)

    assert transport.writes[0][:6] == bytes([1, 6, 0x00, 0x00, 0x02, 0xF3])
    assert transport.writes[1][:6] == bytes([1, 6, 0x00, 0x04, 0x44, 0x00])


def test_invalid_crc_and_missing_response_are_clear_errors() -> None:
    bad_response = bytearray(_read_response(1, 3, [253]))
    bad_response[-1] ^= 0xFF
    controller = LU92XXModbusRtuController(
        _config(),
        transport_factory=lambda serial: FakeSerialTransport(responses=[bytes(bad_response)]),
    )

    with pytest.raises(RuntimeError, match="Invalid CRC"):
        controller.read_temperature()

    no_response = LU92XXModbusRtuController(_config(), transport_factory=lambda serial: FakeSerialTransport())
    with pytest.raises(RuntimeError, match="No response"):
        no_response.read_temperature()
