#!/usr/bin/env python3
"""Check that local offline dataset paths exist.

Usage:
  python scripts/check_offline_datasets.py

This script is intentionally lightweight and only validates local paths.
It does not load all frames.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONFIG = Path(__file__).resolve().parents[1] / "configs" / "local" / "offline_datasets.local.json"


def dataset_root(ds: dict[str, Any]) -> Path:
    for key in ("root_path", "path", "absolute_path"):
        value = ds.get(key)
        if value:
            return Path(value)
    raise KeyError(f"Dataset {ds.get('id', '<unknown>')} has no root_path/path/absolute_path")


def main() -> int:
    if not CONFIG.exists():
        print(f"MISSING CONFIG: {CONFIG}")
        return 2

    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    ok = True

    for ds in data.get("datasets", []):
        root = dataset_root(ds)
        manifest = root / ds.get("manifest", ds.get("manifest_json", "manifest.json"))
        temp = root / ds.get("temperature_csv", "temperature.csv")
        frames = root / ds.get("frames_dir", "frames")
        checks = [
            ("root", root),
            ("manifest", manifest),
            ("temperature_csv", temp),
            ("frames_dir", frames),
        ]

        print(
            f"\n[{ds.get('id')}] "
            f"type={ds.get('g3_type')} "
            f"class={ds.get('object_class')} "
            f"detector={ds.get('default_detector')} "
            f"width_mode={ds.get('default_width_mode')}"
        )
        for label, path in checks:
            exists = path.exists()
            print(f"  {label}: {'OK' if exists else 'MISSING'} {path}")
            ok = ok and exists

        if frames.exists():
            pattern = ds.get("frame_glob", ds.get("frame_pattern", "frame_*.npy"))
            sample_count = sum(1 for _ in frames.glob(pattern))
            print(f"  frame_count_by_glob({pattern}): {sample_count}")
            ok = ok and sample_count > 0

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
