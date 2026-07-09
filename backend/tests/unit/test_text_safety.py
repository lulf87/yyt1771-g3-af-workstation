from __future__ import annotations

import subprocess
import unicodedata
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

    for path in _tracked_text_files(root):
        _collect_forbidden_unicode(path, root, offenders)

    assert offenders == []


def _tracked_text_files(root: Path) -> list[Path]:
    output = subprocess.check_output(["git", "-C", str(root), "ls-files"], text=True)
    paths: list[Path] = []
    for relative in output.splitlines():
        if relative in ROOT_TEXT_FILES or any(relative == prefix or relative.startswith(f"{prefix}/") for prefix in TEXT_ROOTS):
            path = root / relative
            if path.suffix in TEXT_SUFFIXES:
                paths.append(path)
    return paths


def _collect_forbidden_unicode(path: Path, root: Path, offenders: list[str]) -> None:
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        offenders.append(f"{path.relative_to(root)}:1: UTF-8 BOM")
    text = data.decode("utf-8")
    for line_number, line_text in enumerate(text.splitlines(keepends=True), start=1):
        for char in line_text:
            if char in FORBIDDEN_CODEPOINTS:
                offenders.append(f"{path.relative_to(root)}:{line_number}: {FORBIDDEN_CODEPOINTS[char]}")
                continue
            if _is_hidden_control_or_format(char):
                codepoint = f"U+{ord(char):04X}"
                offenders.append(f"{path.relative_to(root)}:{line_number}: {codepoint} {unicodedata.name(char, 'UNKNOWN')}")


def _is_hidden_control_or_format(char: str) -> bool:
    if char in {"\n", "\r", "\t"}:
        return False
    category = unicodedata.category(char)
    bidi = unicodedata.bidirectional(char)
    return category in {"Cc", "Cf"} or bidi in {"RLO", "LRO", "RLE", "LRE", "PDF", "LRI", "RLI", "FSI", "PDI"}
