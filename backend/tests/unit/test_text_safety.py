from __future__ import annotations

import os
from pathlib import Path


FORBIDDEN_CODEPOINTS = {
    "\u2028": "U+2028 LINE SEPARATOR",
    "\u2029": "U+2029 PARAGRAPH SEPARATOR",
    "\u202a": "U+202A LEFT-TO-RIGHT EMBEDDING",
    "\u202b": "U+202B RIGHT-TO-LEFT EMBEDDING",
    "\u202c": "U+202C POP DIRECTIONAL FORMATTING",
    "\u202d": "U+202D LEFT-TO-RIGHT OVERRIDE",
    "\u202e": "U+202E RIGHT-TO-LEFT OVERRIDE",
    "\u2066": "U+2066 LEFT-TO-RIGHT ISOLATE",
    "\u2067": "U+2067 RIGHT-TO-LEFT ISOLATE",
    "\u2068": "U+2068 FIRST STRONG ISOLATE",
    "\u2069": "U+2069 POP DIRECTIONAL ISOLATE",
    "\u200b": "U+200B ZERO WIDTH SPACE",
    "\ufeff": "U+FEFF BYTE ORDER MARK",
}

TEXT_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".mjs",
    ".md",
    ".yaml",
    ".yml",
    ".css",
}

SKIP_DIRS = {
    ".git",
    ".mypy_cache",
    ".playwright-cli",
    ".pytest_cache",
    ".venv",
    "dist",
    "node_modules",
    "output",
    "__pycache__",
}

TEXT_ROOTS = (
    ".github",
    "backend",
    "frontend/src",
    "frontend/tests",
    "configs",
    "docs",
)

ROOT_TEXT_FILES = (
    ".gitignore",
    "AGENTS.md",
    "problem.md",
)


def test_repository_text_files_do_not_contain_hidden_unicode() -> None:
    root = Path(__file__).resolve().parents[3]
    offenders: list[str] = []

    for relative in TEXT_ROOTS:
        scan_root = root / relative
        if scan_root.exists():
            _collect_tree_offenders(scan_root, root, offenders)
    for relative in ROOT_TEXT_FILES:
        path = root / relative
        if path.exists():
            _collect_forbidden_unicode(path, root, offenders)

    assert offenders == []


def _collect_tree_offenders(scan_root: Path, root: Path, offenders: list[str]) -> None:
    for directory, dirnames, filenames in os.walk(scan_root):
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in SKIP_DIRS and not dirname.startswith("node_modules.")
        ]
        for filename in sorted(filenames):
            path = Path(directory) / filename
            if path.suffix not in TEXT_SUFFIXES:
                continue
            _collect_forbidden_unicode(path, root, offenders)


def _collect_forbidden_unicode(path: Path, root: Path, offenders: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for index, char in enumerate(text):
        if char in FORBIDDEN_CODEPOINTS:
            line = text.count("\n", 0, index) + 1
            offenders.append(f"{path.relative_to(root)}:{line}: {FORBIDDEN_CODEPOINTS[char]}")
