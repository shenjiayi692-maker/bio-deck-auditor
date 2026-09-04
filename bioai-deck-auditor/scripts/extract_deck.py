#!/usr/bin/env python3
"""Extract a page/slide text skeleton from PDF or PPTX for claim ingestion.

The result deliberately marks every page for visual review: charts, images, layout,
footnotes and OCR-only content are not reliably represented by text extraction.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"


def _slide_number(name: str) -> int:
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 10**9


def _relationships(archive: zipfile.ZipFile, part_name: str) -> list[dict]:
    rel_name = posixpath.join(
        posixpath.dirname(part_name),
        "_rels",
        posixpath.basename(part_name) + ".rels",
    )
    if rel_name not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(rel_name))
    relationships = []
    for rel in root.findall(f"{{{REL_NS}}}Relationship"):
        target = rel.attrib.get("Target", "")
        external = rel.attrib.get("TargetMode") == "External"
        resolved = target if external else posixpath.normpath(
            posixpath.join(posixpath.dirname(part_name), target)
        )
        relationships.append({
            "id": rel.attrib.get("Id"),
            "type": rel.attrib.get("Type", "").rsplit("/", 1)[-1],
            "target": resolved,
            "external": external,
        })
    return relationships


def _text_from_part(archive: zipfile.ZipFile, name: str) -> str:
    if name not in archive.namelist():
        return ""
    root = ET.fromstring(archive.read(name))
    return "\n".join(
        node.text.strip()
        for node in root.iter(f"{{{DRAWING_NS}}}t")
        if node.text and node.text.strip()
    )


def _chart_summary(archive: zipfile.ZipFile, name: str) -> dict:
    root = ET.fromstring(archive.read(name))
    values = [
        node.text.strip()
        for node in root.iter(f"{{{CHART_NS}}}v")
        if node.text and node.text.strip()
    ]
    labels = [
        node.text.strip()
        for node in root.iter(f"{{{DRAWING_NS}}}t")
        if node.text and node.text.strip()
    ]
    return {"part": name, "labels": labels, "cached_values": values}


def extract_pptx(path: Path) -> list[dict]:
    pages: list[dict] = []
    with zipfile.ZipFile(path) as archive:
        names = sorted(
            (n for n in archive.namelist() if re.search(r"ppt/slides/slide\d+\.xml$", n)),
            key=_slide_number,
        )
        for index, name in enumerate(names, start=1):
            text = _text_from_part(archive, name)
            relationships = _relationships(archive, name)
            note_parts = [rel["target"] for rel in relationships if rel["type"] == "notesSlide" and not rel["external"]]
            chart_parts = [rel["target"] for rel in relationships if rel["type"] == "chart" and not rel["external"]]
            media = [
                {"type": rel["type"], "target": rel["target"]}
                for rel in relationships
                if rel["type"] in {"audio", "video", "media"}
            ]
            hyperlinks = [rel["target"] for rel in relationships if rel["type"] == "hyperlink"]
            notes = "\n".join(filter(None, (_text_from_part(archive, part) for part in note_parts)))
            charts = [
                _chart_summary(archive, part)
                for part in chart_parts
                if part in archive.namelist()
            ]
            page = _page(index, text, "pptx_xml")
            page.update({
                "speaker_notes": notes,
                "charts": charts,
                "embedded_media": media,
                "hyperlinks": hyperlinks,
            })
            pages.append(page)
    return pages


def extract_pdf(path: Path) -> list[dict]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF extraction requires the optional 'pypdf' package") from exc

    reader = PdfReader(str(path))
    return [_page(index, page.extract_text() or "", "pypdf") for index, page in enumerate(reader.pages, start=1)]


def _page(number: int, text: str, method: str) -> dict:
    cleaned = text.strip()
    return {
        "page": number,
        "text": cleaned,
        "extraction_method": method,
        "extraction_status": "text_extracted" if cleaned else "empty_or_image_only",
        "visual_review_required": True,
        "ocr_required": not bool(cleaned),
    }


def extract(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix == ".pptx":
        pages = extract_pptx(path)
    elif suffix == ".pdf":
        pages = extract_pdf(path)
    else:
        raise ValueError("supported formats: .pdf, .pptx")
    return {
        "source_file": path.name,
        "page_count": len(pages),
        "pages": pages,
        "limitations": [
            "Text order may differ from visual reading order.",
            "Cached chart values may omit formatting, units or values stored only in embedded workbooks.",
            "Images, QR codes, media content and layout require separate visual review.",
            "Empty text requires rendering and OCR.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deck", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args(argv)
    try:
        result = extract(args.deck)
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
