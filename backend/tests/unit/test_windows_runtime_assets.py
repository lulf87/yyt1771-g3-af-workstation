from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_windows_setup_doc_includes_native_hardware_validation_checklist() -> None:
    doc = (ROOT / "docs" / "windows_setup.md").read_text(encoding="utf-8")

    assert "Windows 10/11 64-bit" in doc
    assert "Python 3.11 x64" in doc
    assert "MVS Viewer" in doc
    assert "not recommended to run real hardware through WSL" in doc
    assert "Final hardware validation checklist" in doc
    assert "real_hardware_available" in doc
    assert "TODO(windows-hardware-validation)" in doc


def test_windows_hardware_examples_use_windows_paths_and_no_mac_paths() -> None:
    real_config = (ROOT / "configs" / "hardware" / "realcamera_temp.windows.example.yaml").read_text(
        encoding="utf-8"
    )
    simulated_config = (ROOT / "configs" / "hardware" / "simulated.windows.example.yaml").read_text(
        encoding="utf-8"
    )

    assert "COM3" in real_config
    assert "C:/Program Files (x86)/MVS/Development/Samples/Python/MvImport" in real_config
    assert "sdk_library_dir" in real_config
    assert "MvCameraControl.dll" in real_config
    assert "simulated_dataset_id: \"\"" in real_config
    assert "simulated" in simulated_config
    assert "golden_a_20260522_dev_lab" in simulated_config
    assert "/Users/lulingfeng" not in real_config
    assert "/Users/lulingfeng" not in simulated_config


def test_windows_powershell_scripts_have_parameters_and_strict_errors() -> None:
    script_dir = ROOT / "scripts" / "windows"
    expected = {
        "bootstrap.ps1": ["Python", "Node", "npm install"],
        "start_backend.ps1": ["param", "YYT1771_G3_HARDWARE_CONFIG", "PYTHONPATH"],
        "start_frontend.ps1": ["param", "VITE_G3_API_BASE", "npm run dev"],
        "start_operator.ps1": ["Start-Process", "?mode=operator", "start_backend.ps1"],
        "check_environment.ps1": ["Python architecture", "MvCameraControl_class.py", "source-status"],
    }

    for filename, required_fragments in expected.items():
        text = (script_dir / filename).read_text(encoding="utf-8-sig")
        assert "Set-StrictMode -Version Latest" in text
        assert "$ErrorActionPreference = \"Stop\"" in text
        for fragment in required_fragments:
            assert fragment in text


def test_github_actions_has_windows_latest_smoke_job() -> None:
    workflow_dir = ROOT / ".github" / "workflows"
    workflow_text = "\n".join(path.read_text(encoding="utf-8") for path in workflow_dir.glob("*.yml"))

    assert "windows-latest" in workflow_text
    assert "python-version: \"3.11\"" in workflow_text
    assert "npm run build" in workflow_text
    assert "npm test" in workflow_text
    assert "pytest" in workflow_text
