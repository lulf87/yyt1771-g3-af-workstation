import type { MeasurementDefinition } from "./api/client";
import type { UiLanguage } from "./i18n";

export type OperatorConfirmedSettings = {
  targetTemperatureC: number | null;
  temperaturePowerPercent: number;
  serialPort: string | null;
  confirmedAt: string | null;
  dirty: boolean;
};

export type OperatorStartValidationInput = {
  cameraOk: boolean;
  measurement: MeasurementDefinition | null;
  settings: OperatorConfirmedSettings;
  serialPortRequired: boolean;
};

export type OperatorStartValidation = {
  ok: boolean;
  message: string;
};

export function createOperatorSettingsDraft(
  measurement: MeasurementDefinition
): OperatorConfirmedSettings {
  return {
    targetTemperatureC: normalizeNullableTemperature(measurement.detector_config.target_temperature_celsius ?? null),
    temperaturePowerPercent: normalizePower(measurement.detector_config.temperature_power_percent ?? 100),
    serialPort: normalizeSerialPort(measurement.detector_config.temperature_serial_port ?? null),
    confirmedAt: null,
    dirty: true
  };
}

export function patchOperatorSettingsDraft(
  current: OperatorConfirmedSettings,
  patch: Partial<Pick<OperatorConfirmedSettings, "targetTemperatureC" | "temperaturePowerPercent" | "serialPort">>
): OperatorConfirmedSettings {
  return {
    ...current,
    ...("targetTemperatureC" in patch
      ? { targetTemperatureC: normalizeNullableTemperature(patch.targetTemperatureC ?? null) }
      : {}),
    ...("temperaturePowerPercent" in patch
      ? { temperaturePowerPercent: normalizePower(patch.temperaturePowerPercent ?? 100) }
      : {}),
    ...("serialPort" in patch
      ? { serialPort: normalizeSerialPort(patch.serialPort ?? null) }
      : {}),
    dirty: true
  };
}

export function confirmOperatorSettings(
  current: OperatorConfirmedSettings,
  confirmedAt = new Date().toISOString()
): OperatorConfirmedSettings {
  return {
    ...current,
    targetTemperatureC: normalizeNullableTemperature(current.targetTemperatureC),
    temperaturePowerPercent: normalizePower(current.temperaturePowerPercent),
    serialPort: normalizeSerialPort(current.serialPort),
    confirmedAt,
    dirty: false
  };
}

export function applyConfirmedSettingsToMeasurement(
  measurement: MeasurementDefinition,
  settings: OperatorConfirmedSettings
): MeasurementDefinition {
  return {
    ...measurement,
    detector_config: {
      ...measurement.detector_config,
      target_temperature_celsius: settings.targetTemperatureC,
      temperature_power_percent: settings.temperaturePowerPercent,
      temperature_serial_port: settings.serialPort ?? ""
    }
  };
}

export function validateOperatorStart(input: OperatorStartValidationInput): OperatorStartValidation {
  if (!input.measurement) {
    return { ok: false, message: "Measurement ROI is not set." };
  }
  if (!input.cameraOk) {
    return { ok: false, message: "Camera is not connected." };
  }
  if (!input.settings.confirmedAt) {
    return { ok: false, message: "Test settings are not confirmed. Confirm this test setup first." };
  }
  if (input.settings.dirty) {
    return { ok: false, message: "Test settings changed after confirmation. Confirm this test setup first." };
  }
  if (input.serialPortRequired && !input.settings.serialPort) {
    return { ok: false, message: "Temperature serial port is unavailable." };
  }
  return { ok: true, message: "" };
}

export function operatorSettingsSummary(
  settings: OperatorConfirmedSettings,
  language: UiLanguage = "en"
): string {
  const power = `${settings.temperaturePowerPercent.toFixed(0)}%`;
  if (!settings.confirmedAt) {
    return language === "zh" ? "测试设置尚未确认" : "Test settings are not confirmed";
  }
  if (settings.targetTemperatureC == null) {
    return language === "zh"
      ? `已确认：不设置目标温度，功率 ${power}`
      : `Confirmed: no target temperature, power ${power}`;
  }
  const target = `${settings.targetTemperatureC.toFixed(2)} °C`;
  return language === "zh"
    ? `已确认：目标温度 ${target}，功率 ${power}`
    : `Confirmed: target temperature ${target}, power ${power}`;
}

export function localizeOperatorStartMessage(message: string, language: UiLanguage): string {
  if (language === "en") return message;
  const zh: Record<string, string> = {
    "Measurement ROI is not set.": "测量区域尚未设置。",
    "Camera is not connected.": "相机未连接。",
    "Test settings are not confirmed. Confirm this test setup first.": "测试设置尚未确认，请先确认本次测试设置。",
    "Test settings changed after confirmation. Confirm this test setup first.": "测试设置已修改，请重新确认本次测试设置。",
    "Temperature serial port is unavailable.": "温控串口不可用。"
  };
  return zh[message] ?? message;
}

function normalizeNullableTemperature(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePower(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, value));
}

function normalizeSerialPort(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
