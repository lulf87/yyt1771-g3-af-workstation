from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_pyinstaller_collects_dynamic_fastapi_entrypoint() -> None:
    spec = (PROJECT_ROOT / "packaging" / "windows" / "g3_workstation.spec").read_text(encoding="utf-8")

    assert 'hiddenimports = ["yyt1771_g3.api.main"]' in spec


def test_windows_build_starts_packaged_executable_before_upload() -> None:
    script = (PROJECT_ROOT / "packaging" / "windows" / "build_release.ps1").read_text(encoding="utf-8")

    assert 'Join-Path $PortableDir "G3Workstation.exe"' in script
    assert "Invoke-RestMethod" in script
    assert "/api/health" in script
    assert "failed the /api/health startup smoke test" in script
