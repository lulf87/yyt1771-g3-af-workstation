from __future__ import annotations

from collections.abc import Callable
import threading
from typing import Protocol

from yyt1771_g3.core.hardware_config import SerialPortConfig, TempConfig, TempRegisterConfig
from yyt1771_g3.core.timebase import now_ms
from yyt1771_g3.temperature.base import TemperatureReading


class SerialTransport(Protocol):
    def read(self, size: int) -> bytes:
        ...

    def write(self, data: bytes) -> int | None:
        ...

    def close(self) -> None:
        ...


class LU92XXModbusRtuController:
    def __init__(
        self,
        config: TempConfig,
        *,
        transport_factory: Callable[[SerialPortConfig], SerialTransport] | None = None,
    ) -> None:
        self.config = config
        self.transport_factory = transport_factory
        self._transport: SerialTransport | None = None
        self._io_lock = threading.RLock()
        self._validate_config()

    def open(self) -> None:
        with self._io_lock:
            if self._transport is not None:
                return
            if not self.config.serial.port.strip():
                raise ValueError("temp.serial.port is required for LU92XX Modbus RTU")
            factory = self.transport_factory or self._default_transport_factory()
            try:
                self._transport = factory(self.config.serial)
            except Exception as exc:
                raise RuntimeError(f"Failed to open LU92XX serial transport: {exc}") from exc

    def close(self) -> None:
        with self._io_lock:
            if self._transport is None:
                return
            self._transport.close()
            self._transport = None

    def read_temperature(self) -> TemperatureReading:
        register = self.config.register_map.process_value
        response = self._transceive(
            request=self._build_read_request(register),
            expected_size=5 + register.register_count * 2,
            function_code=register.function_code,
        )
        raw_value = self._decode_register_value(
            response[3:-2],
            register_count=register.register_count,
            signed=register.signed,
        )
        return TemperatureReading(
            timestamp_ms=now_ms(),
            celsius=float(raw_value) * register.decode_scale,
            source="lu92xx_modbus_rtu",
        )

    def set_target_temperature(self, celsius: float) -> None:
        register = self.config.register_map.target_or_stop_value
        self._write_register_values(
            register,
            self._encode_register_values(
                celsius,
                register_count=register.register_count,
                encode_scale=register.encode_scale,
                signed=register.signed,
            ),
        )

    def read_target_temperature(self) -> float:
        register = self.config.register_map.target_or_stop_value
        read_register = TempRegisterConfig(
            function_code=3,
            start_address=register.start_address,
            register_count=register.register_count,
            signed=register.signed,
            decode_scale=1.0 / register.encode_scale if register.encode_scale else 1.0,
        )
        response = self._transceive(
            request=self._build_read_request(read_register),
            expected_size=5 + read_register.register_count * 2,
            function_code=3,
        )
        raw_value = self._decode_register_value(
            response[3:-2],
            register_count=read_register.register_count,
            signed=read_register.signed,
        )
        return float(raw_value) / register.encode_scale

    def set_output_power_percent(self, percent: float) -> None:
        if percent < 0.0 or percent > 100.0:
            raise ValueError("output power percent must be within 0..100")
        register = self.config.register_map.output_power
        self._write_register_values(
            register,
            self._encode_register_values(
                percent,
                register_count=register.register_count,
                encode_scale=register.encode_scale,
                signed=register.signed,
            ),
        )

    def read_output_power_percent(self) -> float:
        register = self.config.register_map.output_power
        read_register = TempRegisterConfig(
            function_code=3,
            start_address=register.start_address,
            register_count=register.register_count,
            signed=register.signed,
            decode_scale=1.0 / register.encode_scale if register.encode_scale else 1.0,
        )
        response = self._transceive(
            request=self._build_read_request(read_register),
            expected_size=5 + read_register.register_count * 2,
            function_code=3,
        )
        raw_value = self._decode_register_value(
            response[3:-2],
            register_count=read_register.register_count,
            signed=read_register.signed,
        )
        return float(raw_value) / register.encode_scale

    def start_output(self) -> None:
        self.set_output_power_percent(self.config.control.startup_power_percent)

    def stop_output(self) -> None:
        self.set_output_power_percent(0.0)

    def _write_register_values(self, register: TempRegisterConfig, values: list[int]) -> None:
        self._transceive(
            request=self._build_write_request(register, values),
            expected_size=8,
            function_code=register.function_code,
        )

    def _transceive(self, *, request: bytes, expected_size: int, function_code: int) -> bytes:
        with self._io_lock:
            self.open()
            assert self._transport is not None
            self._transport.write(request)
            response = self._transport.read(expected_size)
        if not response:
            raise RuntimeError("No response from LU92XX controller")
        if len(response) < 5:
            raise RuntimeError("Short response from LU92XX controller")
        self._validate_crc(response)
        if response[1] == (function_code | 0x80):
            raise RuntimeError(f"LU92XX Modbus exception: {self._exception_detail(response[2])}")
        if len(response) != expected_size:
            raise RuntimeError("Short response from LU92XX controller")
        return response

    def _build_read_request(self, register: TempRegisterConfig) -> bytes:
        payload = bytes(
            [
                self.config.slave_address,
                register.function_code,
                (register.start_address >> 8) & 0xFF,
                register.start_address & 0xFF,
                (register.register_count >> 8) & 0xFF,
                register.register_count & 0xFF,
            ]
        )
        return payload + _crc_bytes(payload)

    def _build_write_request(self, register: TempRegisterConfig, values: list[int]) -> bytes:
        if register.function_code == 6:
            if len(values) != 1:
                raise ValueError("function_code 6 requires exactly one register value")
            payload = bytes(
                [
                    self.config.slave_address,
                    register.function_code,
                    (register.start_address >> 8) & 0xFF,
                    register.start_address & 0xFF,
                    (values[0] >> 8) & 0xFF,
                    values[0] & 0xFF,
                ]
            )
            return payload + _crc_bytes(payload)
        if register.function_code == 16:
            byte_values = bytearray()
            for value in values:
                byte_values.extend(((value >> 8) & 0xFF, value & 0xFF))
            payload = bytes(
                [
                    self.config.slave_address,
                    register.function_code,
                    (register.start_address >> 8) & 0xFF,
                    register.start_address & 0xFF,
                    (len(values) >> 8) & 0xFF,
                    len(values) & 0xFF,
                    len(values) * 2,
                ]
            ) + bytes(byte_values)
            return payload + _crc_bytes(payload)
        raise ValueError(f"unsupported write function_code: {register.function_code}")

    def _encode_register_values(
        self,
        value: float,
        *,
        register_count: int,
        encode_scale: float,
        signed: bool,
    ) -> list[int]:
        raw_value = int(round(float(value) * encode_scale))
        total_bits = register_count * 16
        if signed and raw_value < 0:
            raw_value = (1 << total_bits) + raw_value
        max_value = (1 << total_bits) - 1
        if raw_value < 0 or raw_value > max_value:
            raise ValueError("encoded register value is out of range")
        return [(raw_value >> (index * 16)) & 0xFFFF for index in reversed(range(register_count))]

    def _decode_register_value(self, payload: bytes, *, register_count: int, signed: bool) -> int:
        if len(payload) != register_count * 2:
            raise RuntimeError("Short LU92XX register payload")
        raw_value = 0
        for index in range(register_count):
            word = (payload[index * 2] << 8) | payload[index * 2 + 1]
            raw_value = (raw_value << 16) | word
        if signed:
            sign_bit = 1 << (register_count * 16 - 1)
            if raw_value & sign_bit:
                raw_value -= 1 << (register_count * 16)
        return raw_value

    def _validate_config(self) -> None:
        if self.config.protocol and self.config.protocol != "modbus_rtu":
            raise ValueError(f"unsupported temp protocol: {self.config.protocol}")
        if self.config.slave_address < 1 or self.config.slave_address > 255:
            raise ValueError("slave_address must be within 1..255")
        self._validate_register(self.config.register_map.process_value, "process_value", {3})
        self._validate_register(self.config.register_map.target_or_stop_value, "target_or_stop_value", {6, 16})
        self._validate_register(self.config.register_map.output_power, "output_power", {6, 16})
        if self.config.control.start_output_mode != "power_nonzero":
            raise ValueError(f"unsupported start_output_mode: {self.config.control.start_output_mode}")

    def _validate_register(self, register: TempRegisterConfig, name: str, allowed_functions: set[int]) -> None:
        if register.function_code not in allowed_functions:
            raise ValueError(f"{name}.function_code must be one of {sorted(allowed_functions)}")
        if register.start_address < 0:
            raise ValueError(f"{name}.start_address must be >= 0")
        if register.register_count < 1:
            raise ValueError(f"{name}.register_count must be >= 1")
        if register.decode_scale == 0 or register.encode_scale == 0:
            raise ValueError(f"{name} scales must not be zero")

    def _validate_crc(self, payload: bytes) -> None:
        if payload[-2:] != _crc_bytes(payload[:-2]):
            raise RuntimeError("Invalid CRC from LU92XX controller")

    def _default_transport_factory(self) -> Callable[[SerialPortConfig], SerialTransport]:
        try:
            import serial  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("pyserial is required for LU92XX Modbus RTU access") from exc

        def _factory(serial_config: SerialPortConfig) -> SerialTransport:
            return serial.Serial(
                port=serial_config.port,
                baudrate=serial_config.baudrate,
                bytesize=serial_config.bytesize,
                parity=serial_config.parity,
                stopbits=serial_config.stopbits,
                timeout=serial_config.timeout_ms / 1000.0,
            )

        return _factory

    @staticmethod
    def _exception_detail(code: int) -> str:
        return {
            1: "illegal function",
            2: "illegal data address",
            3: "illegal data value",
        }.get(code, f"code {code}")


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


__all__ = ["LU92XXModbusRtuController", "SerialTransport"]
