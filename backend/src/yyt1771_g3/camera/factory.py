from __future__ import annotations

from typing import Any

from yyt1771_g3.camera.base import CameraSource, CameraUnavailableError
from yyt1771_g3.camera.hik_mvs_source import HikMvsCameraSource
from yyt1771_g3.camera.simulated_source import SimulatedCameraSource


SIMULATED_CAMERA_BACKENDS = {"simulated", "simulated_camera", "mock", "fake"}
HIK_CAMERA_BACKENDS = {"", "hik_gige_mvs", "hik_mvs"}


def build_camera_source(profile: dict[str, Any] | None = None) -> CameraSource:
    profile = profile or {}
    backend = str(profile.get("backend", "hik_gige_mvs") or "hik_gige_mvs").strip().lower()
    if backend in SIMULATED_CAMERA_BACKENDS:
        return SimulatedCameraSource(profile=profile)
    if backend in HIK_CAMERA_BACKENDS:
        return HikMvsCameraSource(profile=profile)
    raise CameraUnavailableError(
        f"Unsupported camera backend: {backend}",
        details={
            "backend": backend,
            "supported_backends": sorted(SIMULATED_CAMERA_BACKENDS | HIK_CAMERA_BACKENDS),
        },
    )


__all__ = ["build_camera_source"]
