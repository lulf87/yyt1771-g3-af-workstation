from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from yyt1771_g3.core import build_info as build_info_module
from yyt1771_g3.core.build_info import UNKNOWN, build_info


@pytest.fixture(autouse=True)
def _clear_build_info_cache() -> Iterator[None]:
    build_info.cache_clear()
    yield
    build_info.cache_clear()


def _use_stamp_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    stamp = tmp_path / "build_info.json"
    monkeypatch.setattr(build_info_module, "_candidate_paths", lambda: (stamp,))
    monkeypatch.setattr(build_info_module, "_git_short_sha", lambda: "")
    return stamp


def test_build_info_degrades_to_unknown_without_stamp(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _use_stamp_file(monkeypatch, tmp_path)

    assert build_info() == {"version": UNKNOWN, "git_sha": UNKNOWN, "build_time": UNKNOWN}


def test_build_info_reads_stamp_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    stamp = _use_stamp_file(monkeypatch, tmp_path)
    stamp.write_text(
        json.dumps({"version": "0.1.0", "git_sha": "0478ffa", "build_time": "2026-10-23T06:00:00Z"}),
        encoding="utf-8",
    )

    assert build_info() == {"version": "0.1.0", "git_sha": "0478ffa", "build_time": "2026-10-23T06:00:00Z"}


def test_build_info_environment_overrides_stamp_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    stamp = _use_stamp_file(monkeypatch, tmp_path)
    stamp.write_text(json.dumps({"version": "0.1.0", "git_sha": "0478ffa"}), encoding="utf-8")
    monkeypatch.setenv("YYT1771_G3_BUILD_SHA", "deadbee")

    assert build_info()["git_sha"] == "deadbee"


def test_build_info_survives_malformed_stamp_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    stamp = _use_stamp_file(monkeypatch, tmp_path)
    stamp.write_text("{not json", encoding="utf-8")

    assert build_info()["git_sha"] == UNKNOWN


def test_build_info_survives_non_mapping_stamp_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    stamp = _use_stamp_file(monkeypatch, tmp_path)
    stamp.write_text("[1, 2, 3]", encoding="utf-8")

    assert build_info()["version"] == UNKNOWN


def test_build_info_uses_git_sha_in_source_checkout(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _use_stamp_file(monkeypatch, tmp_path)
    monkeypatch.setattr(build_info_module, "_git_short_sha", lambda: "abc1234")

    assert build_info()["git_sha"] == "abc1234"
