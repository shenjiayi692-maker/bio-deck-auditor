#!/usr/bin/env python3
"""Check local file references in Markdown code spans and links."""
from __future__ import annotations

import argparse
import re
from pathlib import Path

CODE_PATH = re.compile(r"`((?:references|scripts|agents|assets)/[^`\s)]+)`")
MD_LINK = re.compile(r"\[[^]]+\]\((?!https?://|#)([^)]+)\)")


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    for document in root.rglob("*.md"):
        text = document.read_text(encoding="utf-8")
        for match in CODE_PATH.finditer(text):
            raw = match.group(1).split("#", 1)[0]
            if any(ch in raw for ch in ("<", ">", "*")) or raw.endswith("/"):
                continue
            target = root / raw
            if not target.exists():
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{document.relative_to(root)}:{line}: missing {raw}")
        for match in MD_LINK.finditer(text):
            raw = match.group(1).split("#", 1)[0]
            target = (document.parent / raw).resolve()
            if not target.exists():
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{document.relative_to(root)}:{line}: missing {raw}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate local Markdown references")
    parser.add_argument("root", type=Path, nargs="?", default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    errors = validate(args.root.resolve())
    if errors:
        print("\n".join(errors))
        return 1
    print("All local Markdown references resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
