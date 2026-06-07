from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_milestone1_required_directories_exist() -> None:
    required_directories = [
        "backend/src/yyt1771_g3",
        "frontend/src",
        "docs",
        "configs",
        "datasets",
        "scripts",
        "tests",
        "backend/tests",
        "frontend/tests",
    ]

    missing = [path for path in required_directories if not (ROOT / path).is_dir()]

    assert missing == []
    assert (ROOT / "tests" / "README.md").is_file()


def test_milestone1_required_docs_are_present() -> None:
    required_files = [
        "AGENTS.md",
        "problem.md",
        "docs/requirements/G3_需求规格说明书_v0.1.md",
        "docs/milestones/G3_开发任务拆分_v0.1.md",
        "docs/algorithms/G3_AB检测与外包络算法需求_v0.1.md",
        "docs/architecture/G3_技术架构草案_v0.1.md",
        "docs/data/G3_数据结构与manifest草案_v0.1.md",
        "docs/data/G3_离线素材注册表_v0.1.md",
        "docs/testing/G3_验收与真实浏览器复测清单_v0.1.md",
    ]

    missing = [path for path in required_files if not (ROOT / path).is_file()]

    assert missing == []


def test_milestone1_backend_package_can_import() -> None:
    sys.path.insert(0, str(ROOT / "backend" / "src"))
    import yyt1771_g3  # noqa: PLC0415

    assert yyt1771_g3.__doc__


def test_milestone1_frontend_package_skeleton_can_build() -> None:
    package_json = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))

    assert package_json["private"] is True
    assert package_json["scripts"]["build"] == "tsc && vite build"
    assert "vite" in package_json["dependencies"]
    assert "typescript" in package_json["devDependencies"]
