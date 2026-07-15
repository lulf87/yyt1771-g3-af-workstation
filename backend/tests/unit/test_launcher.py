from __future__ import annotations

import argparse

from yyt1771_g3 import launcher


def test_source_sim_uses_source_tree_simulated_profile(monkeypatch) -> None:
    for name in (
        "YYT1771_G3_RUNTIME_SOURCE",
        "YYT1771_G3_PRODUCT_MODE",
        "YYT1771_G3_HARDWARE_CONFIG",
        "YYT1771_G3_SIMULATED_DATASET_ID",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(launcher, "is_frozen", lambda: False)
    args = argparse.Namespace(
        source="sim",
        product_mode="development",
        dataset_id="golden_a_20260522_dev_lab",
        hardware_config="",
    )

    launcher._configure_environment(args)

    assert launcher.os.environ["YYT1771_G3_RUNTIME_SOURCE"] == "simulated_material"
    assert launcher.os.environ["YYT1771_G3_HARDWARE_CONFIG"].endswith("simcamera_simtemp.local.yaml")


def test_packaged_real_cli_overrides_inherited_development_environment(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    expected_config = tmp_path / "ProgramData" / "YYT1771-G3" / "config" / "hardware.yaml"
    monkeypatch.setenv("YYT1771_G3_RUNTIME_SOURCE", "simulated_material")
    monkeypatch.setenv("YYT1771_G3_PRODUCT_MODE", "development")
    monkeypatch.setenv("YYT1771_G3_HARDWARE_CONFIG", str(tmp_path / "stale.yaml"))
    monkeypatch.setenv("YYT1771_G3_SIMULATED_DATASET_ID", "stale-dataset")
    monkeypatch.setattr(launcher, "is_frozen", lambda: True)
    monkeypatch.setattr(launcher, "hardware_config_path", lambda: expected_config)
    args = argparse.Namespace(
        source="real",
        product_mode="production",
        dataset_id="",
        hardware_config="",
    )

    launcher._configure_environment(args)

    assert launcher.os.environ["YYT1771_G3_RUNTIME_SOURCE"] == "real_hardware"
    assert launcher.os.environ["YYT1771_G3_PRODUCT_MODE"] == "production"
    assert launcher.os.environ["YYT1771_G3_HARDWARE_CONFIG"] == str(expected_config)
    assert "YYT1771_G3_SIMULATED_DATASET_ID" not in launcher.os.environ


def test_windowed_launcher_logging_does_not_require_stderr(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    captured: dict[str, object] = {}
    monkeypatch.setattr(launcher.sys, "stderr", None)
    monkeypatch.setattr(launcher.logging, "basicConfig", lambda **kwargs: captured.update(kwargs))

    launcher._configure_logging(tmp_path / "logs" / "g3-workstation.log")

    handlers = captured["handlers"]
    assert isinstance(handlers, list)
    assert len(handlers) == 1
    assert isinstance(handlers[0], launcher.logging.FileHandler)
    handlers[0].close()
