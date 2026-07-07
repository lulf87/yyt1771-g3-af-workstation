from __future__ import annotations

import os
import sys
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

from yyt1771_g3.camera.base import CameraFrame
from yyt1771_g3.camera import hik_mvs_source as mvs
from yyt1771_g3.camera.hik_mvs_source import CameraUnavailableError, HikMvsCameraSource


def test_hik_source_import_does_not_import_sdk_modules() -> None:
    assert "MvCameraControl_class" not in sys.modules
    assert "MvImport" not in sys.modules


def test_hik_preview_reports_clear_error_when_sdk_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_import(name: str):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise ModuleNotFoundError(name)
        raise AssertionError(f"unexpected import: {name}")

    monkeypatch.setattr("importlib.import_module", fake_import)
    source = HikMvsCameraSource()

    with pytest.raises(CameraUnavailableError, match="Hik MVS SDK is not available"):
        source.preview_frame()


def test_hik_preview_uses_lazy_sdk_frame_source(monkeypatch: pytest.MonkeyPatch) -> None:
    frame = np.full((4, 5), 7, dtype=np.uint8)
    fake_sdk = SimpleNamespace(
        create_camera=lambda profile=None: SimpleNamespace(
            preview_frame=lambda: CameraFrame(
                array=frame,
                timestamp_ms=1234,
                camera_meta={"backend": "hik_gige_mvs", "pixel_format": "mono8"},
            ),
            close=lambda: None,
        )
    )

    def fake_import(name: str):  # noqa: ANN202
        if name == "MvCameraControl_class":
            return fake_sdk
        raise AssertionError(f"unexpected import: {name}")

    monkeypatch.setattr("importlib.import_module", fake_import)

    captured = HikMvsCameraSource(profile={"pixel_format": "mono8"}).preview_frame()

    np.testing.assert_array_equal(captured.array, frame)
    assert captured.timestamp_ms == 1234
    assert captured.camera_meta["pixel_format"] == "mono8"


def test_hik_frame_acquisition_error_uses_source_semantics(monkeypatch: pytest.MonkeyPatch) -> None:
    class FailingCamera:
        def preview_frame(self) -> CameraFrame:
            raise RuntimeError("device busy")

    fake_sdk = SimpleNamespace(create_camera=lambda profile=None: FailingCamera())

    def fake_import(name: str):  # noqa: ANN202
        if name == "MvCameraControl_class":
            return fake_sdk
        raise AssertionError(f"unexpected import: {name}")

    monkeypatch.setattr("importlib.import_module", fake_import)
    source = HikMvsCameraSource(profile={"pixel_format": "mono8"})

    with pytest.raises(CameraUnavailableError) as exc_info:
        source.preview_frame()

    assert "frame acquisition failed" in str(exc_info.value)
    assert "preview failed" not in str(exc_info.value).lower()


def test_hik_sdk_loader_uses_profile_library_path_override_for_official_binding(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    sdk_dir = tmp_path / "MvImport"
    sdk_dir.mkdir()
    library_path = tmp_path / "libMvCameraControl.dylib"
    library_path.write_bytes(b"fake dylib")
    (sdk_dir / "MvCameraControl_class.py").write_text(
        "\n".join(
            [
                "import ctypes",
                'MvCamCtrldll = ctypes.cdll.LoadLibrary("/usr/local/lib/libMvCameraControl.dylib")',
                "class MvCamera:",
                "    pass",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.delitem(sys.modules, "MvCameraControl_class", raising=False)
    monkeypatch.setattr(sys, "path", [item for item in sys.path if str(sdk_dir) != item])
    loaded_paths: list[str] = []

    def fake_load_library(path: str):  # noqa: ANN202
        loaded_paths.append(path)
        if path == str(library_path):
            return SimpleNamespace(path=path)
        raise OSError(f"wrong dylib path: {path}")

    monkeypatch.setattr("ctypes.cdll.LoadLibrary", fake_load_library)

    sdk = HikMvsCameraSource._load_sdk(
        {
            "sdk_python_paths": [str(sdk_dir)],
            "sdk_library_path": str(library_path),
        }
    )

    assert hasattr(sdk, "MvCamera")
    assert str(library_path) in loaded_paths


def test_hik_sdk_loader_uses_windows_library_dir_env_and_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    sdk_dir = tmp_path / "MvImport"
    sdk_dir.mkdir()
    library_dir = tmp_path / "MVS" / "Development" / "Libraries" / "win64"
    library_dir.mkdir(parents=True)
    (library_dir / "MvCameraControl.dll").write_bytes(b"fake dll")
    (sdk_dir / "MvCameraControl_class.py").write_text(
        "\n".join(
            [
                "class MvCamera:",
                "    pass",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.delitem(sys.modules, "MvCameraControl_class", raising=False)
    monkeypatch.setattr(sys, "path", [item for item in sys.path if str(sdk_dir) != item])
    monkeypatch.setattr("platform.system", lambda: "Windows")
    monkeypatch.setenv(mvs.HIK_MVS_LIBRARY_DIR_ENV, str(library_dir))
    monkeypatch.setenv(mvs.HIK_MVS_PYTHON_PATH_ENV, str(sdk_dir))
    monkeypatch.setenv("PATH", "C:/Windows/System32")
    dll_dirs: list[str] = []

    class FakeDllDirectory:
        def __init__(self, path: str) -> None:
            self.path = path

        def close(self) -> None:
            pass

    def fake_add_dll_directory(path: str) -> FakeDllDirectory:
        dll_dirs.append(path)
        return FakeDllDirectory(path)

    monkeypatch.setattr(mvs.os, "add_dll_directory", fake_add_dll_directory, raising=False)

    sdk = HikMvsCameraSource._load_sdk({})

    assert hasattr(sdk, "MvCamera")
    assert str(sdk_dir) in sys.path
    assert dll_dirs == [str(library_dir)]
    assert os_path_entries()[0] == str(library_dir)


def test_hik_sdk_loader_reports_windows_details_when_sdk_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    sdk_dir = tmp_path / "missing-mvimport"
    library_dir = tmp_path / "missing-win64"
    library_path = library_dir / "MvCameraControl.dll"
    monkeypatch.delitem(sys.modules, "MvCameraControl_class", raising=False)
    monkeypatch.setattr("platform.system", lambda: "Windows")
    monkeypatch.setenv(mvs.HIK_MVS_PYTHON_PATH_ENV, str(sdk_dir))
    monkeypatch.setenv(mvs.HIK_MVS_LIBRARY_PATH_ENV, str(library_path))
    monkeypatch.setenv(mvs.HIK_MVS_LIBRARY_DIR_ENV, str(library_dir))
    monkeypatch.setenv("PATH", "C:/Windows/System32")

    def fake_import(name: str):  # noqa: ANN202
        if name == "MvCameraControl_class":
            raise ImportError("fixture import failed")
        raise AssertionError(f"unexpected import: {name}")

    monkeypatch.setattr("importlib.import_module", fake_import)

    with pytest.raises(CameraUnavailableError) as exc_info:
        HikMvsCameraSource._load_sdk(
            {
                "sdk_python_paths": [str(sdk_dir)],
                "sdk_library_path": str(library_path),
                "sdk_library_dir": str(library_dir),
            }
        )

    details = exc_info.value.details
    assert details["platform"] == "Windows"
    assert details["HIK_MVS_PYTHON_PATH"] == str(sdk_dir)
    assert details["HIK_MVS_LIBRARY_PATH"] == str(library_path)
    assert details["HIK_MVS_LIBRARY_DIR"] == str(library_dir)
    assert details["configured_sdk_python_paths"] == [str(sdk_dir)]
    assert details["configured_sdk_library_path"] == str(library_path)
    assert details["configured_sdk_library_dir"] == str(library_dir)
    assert details["path_contains_sdk_library_dir"] is False
    assert "fixture import failed" in details["direct_import_error"]
    assert "Install MVS" in str(exc_info.value)


def test_patch_sdk_load_library_source_supports_dylib_so_and_dll() -> None:
    library_path = "C:/Program Files (x86)/MVS/Development/Libraries/win64/MvCameraControl.dll"
    source_text = "\n".join(
        [
            "import ctypes",
            'ctypes.cdll.LoadLibrary("/usr/local/lib/libMvCameraControl.dylib")',
            'ctypes.cdll.LoadLibrary("libMvCameraControl.so")',
            'ctypes.windll.LoadLibrary("MvCameraControl.dll")',
        ]
    )

    patched = mvs._patch_sdk_load_library_source(source_text, library_path)

    assert patched.count(library_path) == 3
    assert "/usr/local/lib/libMvCameraControl.dylib" not in patched
    assert "libMvCameraControl.so" not in patched
    assert "MvCameraControl.dll" in patched


def os_path_entries() -> list[str]:
    return [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry]


class _FakeDeviceList:
    def __init__(self) -> None:
        self.nDeviceNum = 0
        self.pDeviceInfo = [None] * 8


class _FakeIntValue:
    def __init__(self) -> None:
        self.nCurValue = 0
        self.nMin = 0
        self.nMax = 0
        self.nInc = 1


class _FakeFloatValue:
    def __init__(self) -> None:
        self.fCurValue = 0.0


class _FakeFrameInfo:
    def __init__(self) -> None:
        self.nWidth = 0
        self.nHeight = 0
        self.enPixelType = 0
        self.nFrameLen = 0
        self.nFrameNum = 0
        self.nFrameCounter = 0
        self.nLostPacket = 0


class _FakePointer:
    def __init__(self, contents: Any) -> None:
        self.contents = contents


class _FakeGigEInfo:
    def __init__(self) -> None:
        self.chModelName = list(b"MV-CU060-10GM\0")
        self.chSerialNumber = list(b"DEV-001\0")
        self.nCurrentIp = (192 << 24) | (168 << 16) | (1 << 8) | 10


class _FakeSpecialInfo:
    def __init__(self) -> None:
        self.stGigEInfo = _FakeGigEInfo()


class _FakeDeviceInfo:
    def __init__(self, transport_code: int) -> None:
        self.nTLayerType = transport_code
        self.SpecialInfo = _FakeSpecialInfo()


class _FakeOfficialCamera:
    _sdk: "_FakeOfficialSdk" | None = None

    def __init__(self) -> None:
        assert self._sdk is not None
        self.sdk = self._sdk
        self.configured: dict[str, Any] = {}
        self.closed = False
        self.destroyed = False
        self.sdk.created.append(self)

    @classmethod
    def MV_CC_EnumDevices(cls, layer_type: int, device_list: _FakeDeviceList) -> int:
        assert cls._sdk is not None
        device_list.nDeviceNum = 1
        device_list.pDeviceInfo[0] = _FakePointer(_FakeDeviceInfo(cls._sdk.MV_GIGE_DEVICE))
        return 0

    def MV_CC_CreateHandle(self, raw_info: Any) -> int:
        self.configured["handle"] = raw_info
        return 0

    def MV_CC_OpenDevice(self, access_mode: int = 1, switchover_key: int = 0) -> int:
        self.configured["access_mode"] = access_mode
        return 0

    def MV_CC_CloseDevice(self) -> int:
        self.closed = True
        return 0

    def MV_CC_DestroyHandle(self) -> int:
        self.destroyed = True
        return 0

    def MV_CC_GetOptimalPacketSize(self) -> int:
        return 1500

    def MV_CC_SetIntValue(self, key: str, value: int) -> int:
        self.configured[key] = value
        return 0

    def MV_CC_SetBoolValue(self, key: str, value: bool) -> int:
        self.configured[key] = value
        return 0

    def MV_CC_SetEnumValue(self, key: str, value: int) -> int:
        self.configured[key] = value
        return 0

    def MV_CC_SetEnumValueByString(self, key: str, value: str) -> int:
        self.configured[key] = value
        return 0

    def MV_CC_SetFloatValue(self, key: str, value: float) -> int:
        self.configured[key] = value
        if key == "AcquisitionFrameRate":
            self.sdk.resulting_fps = value
        return 0

    def MV_CC_GetFloatValue(self, key: str, value: _FakeFloatValue) -> int:
        value.fCurValue = self.sdk.resulting_fps if key == "ResultingFrameRate" else 0.0
        return 0

    def MV_CC_GetIntValue(self, key: str, value: _FakeIntValue) -> int:
        values = {
            "PayloadSize": 12,
            "Width": 4,
            "Height": 3,
            "OffsetX": int(self.configured.get("OffsetX", 0)),
            "OffsetY": int(self.configured.get("OffsetY", 0)),
            "WidthMax": 4,
            "HeightMax": 3,
        }
        value.nCurValue = values.get(key, 0)
        value.nMin = 0
        value.nMax = values.get(key, 4096)
        value.nInc = 1
        return 0

    def MV_CC_StartGrabbing(self) -> int:
        self.configured["grabbing"] = True
        return 0

    def MV_CC_StopGrabbing(self) -> int:
        self.configured["grabbing"] = False
        return 0

    def MV_CC_GetOneFrameTimeout(self, buffer: Any, size: int, frame_info: _FakeFrameInfo, timeout_ms: int) -> int:
        pixels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
        for index, pixel in enumerate(pixels):
            buffer[index] = pixel
        frame_info.nWidth = 4
        frame_info.nHeight = 3
        frame_info.enPixelType = self.sdk.PixelType_Gvsp_Mono8
        frame_info.nFrameLen = len(pixels)
        frame_info.nFrameNum = 7
        frame_info.nFrameCounter = 7
        return 0


class _FakeOfficialSdk:
    MV_GIGE_DEVICE = 1
    MV_USB_DEVICE = 4
    MV_ACCESS_Exclusive = 1
    MV_TRIGGER_MODE_OFF = 0
    PixelType_Gvsp_Mono8 = 17301505
    MV_CC_DEVICE_INFO_LIST = _FakeDeviceList
    MVCC_INTVALUE = _FakeIntValue
    MVCC_FLOATVALUE = _FakeFloatValue
    MV_FRAME_OUT_INFO_EX = _FakeFrameInfo

    def __init__(self) -> None:
        self.created: list[_FakeOfficialCamera] = []
        self.resulting_fps = 0.0
        camera_class = type("FakeOfficialCameraBound", (_FakeOfficialCamera,), {})
        camera_class._sdk = self
        self.MvCamera = camera_class


def test_hik_preview_uses_official_mvs_sdk_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_sdk = _FakeOfficialSdk()

    def fake_import(name: str):  # noqa: ANN202
        if name == "MvCameraControl_class":
            return fake_sdk
        raise AssertionError(f"unexpected import: {name}")

    monkeypatch.setattr("importlib.import_module", fake_import)

    source = HikMvsCameraSource(
        profile={
            "model": "MV-CU060-10GM",
            "serial_number": "DEV-001",
            "pixel_format": "mono8",
            "exposure_us": 50000,
            "gain_db": 12.0,
            "target_frame_rate_hz": 10.0,
            "device_roi": {"x": 0, "y": 0, "width": 4, "height": 3},
        }
    )

    captured = source.preview_frame()
    source.close()

    np.testing.assert_array_equal(
        captured.array,
        np.array([[10, 20, 30, 40], [50, 60, 70, 80], [90, 100, 110, 120]], dtype=np.uint8),
    )
    assert captured.timestamp_ms is not None
    assert captured.camera_meta["backend"] == "hik_gige_mvs"
    assert captured.camera_meta["model"] == "MV-CU060-10GM"
    assert captured.camera_meta["serial_number"] == "DEV-001"
    assert captured.camera_meta["camera_frame_counter"] == 7
    configured = fake_sdk.created[0].configured
    assert configured["ExposureTime"] == 50000.0
    assert configured["Gain"] == 12.0
    assert configured["AcquisitionFrameRate"] == 10.0
    assert configured["Width"] == 4
    assert configured["Height"] == 3
