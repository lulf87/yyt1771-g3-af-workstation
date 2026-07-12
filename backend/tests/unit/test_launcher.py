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
