#!/usr/bin/env python3
"""Validate the required invariants of a claim ledger using the standard library."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

CLAIM_TYPES = {"technical", "clinical", "regulatory", "commercial", "financial", "market", "ip", "team", "roadmap", "endorsement", "valuation", "other"}
STATUSES = {"deck_unverified", "candidate", "verified", "contradicted", "unverifiable"}
GRADES = set("ABCDE")
IMPACTS = {"critical", "high", "medium", "low", "unknown"}
CONFIDENCES = {"high", "medium", "low"}
OCR = {"high", "medium", "low", "not_applicable"}
TEMPORALITY = {"historical", "current", "forecast", "unknown"}
ID_RE = re.compile(r"^C-[0-9]{3,}$")


def validate(payload: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["root must be an object"]
    document = payload.get("document")
    if not isinstance(document, dict):
        errors.append("document must be an object")
    else:
        if not isinstance(document.get("name"), str) or not document["name"].strip():
            errors.append("document.name must be a non-empty string")
        if not isinstance(document.get("pages"), int) or isinstance(document.get("pages"), bool) or document["pages"] < 1:
            errors.append("document.pages must be a positive integer")
    page_count = document.get("pages") if isinstance(document, dict) and isinstance(document.get("pages"), int) and not isinstance(document.get("pages"), bool) else None

    claims = payload.get("claims")
    if not isinstance(claims, list):
        return errors + ["claims must be an array"]
    seen: set[str] = set()
    required = {"claim_id", "slide", "verbatim", "normalized_claim", "claim_type", "verification_status", "evidence_grade", "impact", "confidence", "next_action"}
    for index, claim in enumerate(claims):
        prefix = f"claims[{index}]"
        if not isinstance(claim, dict):
            errors.append(f"{prefix} must be an object")
            continue
        missing = sorted(required - claim.keys())
        if missing:
            errors.append(f"{prefix} missing: {', '.join(missing)}")
        cid = claim.get("claim_id")
        if not isinstance(cid, str) or not ID_RE.match(cid):
            errors.append(f"{prefix}.claim_id is invalid")
        elif cid in seen:
            errors.append(f"{prefix}.claim_id is duplicated: {cid}")
        else:
            seen.add(cid)
        slide = claim.get("slide")
        valid_slide = isinstance(slide, int) and not isinstance(slide, bool) and slide >= 1
        if isinstance(slide, list):
            valid_slide = bool(slide) and all(isinstance(v, int) and not isinstance(v, bool) and v >= 1 for v in slide) and len(set(slide)) == len(slide)
        if not valid_slide:
            errors.append(f"{prefix}.slide must be a positive integer or unique array of positive integers")
        elif page_count is not None:
            slide_values = slide if isinstance(slide, list) else [slide]
            if any(value > page_count for value in slide_values):
                errors.append(f"{prefix}.slide exceeds document.pages")
        for field in ("verbatim", "normalized_claim", "next_action"):
            if not isinstance(claim.get(field), str) or not claim[field].strip():
                errors.append(f"{prefix}.{field} must be a non-empty string")
        if claim.get("claim_type") not in CLAIM_TYPES:
            errors.append(f"{prefix}.claim_type is invalid")
        if claim.get("verification_status") not in STATUSES:
            errors.append(f"{prefix}.verification_status is invalid")
        if claim.get("evidence_grade") not in GRADES:
            errors.append(f"{prefix}.evidence_grade is invalid")
        if claim.get("impact") not in IMPACTS:
            errors.append(f"{prefix}.impact is invalid")
        if claim.get("confidence") not in CONFIDENCES:
            errors.append(f"{prefix}.confidence is invalid")
        if "ocr_confidence" in claim and claim["ocr_confidence"] not in OCR:
            errors.append(f"{prefix}.ocr_confidence is invalid")
        for field in ("entity", "product", "product_version", "jurisdiction", "period", "unit", "deck_evidence"):
            if field in claim and claim[field] is not None and not isinstance(claim[field], str):
                errors.append(f"{prefix}.{field} must be a string or null")
        if "temporality" in claim and claim["temporality"] not in TEMPORALITY:
            errors.append(f"{prefix}.temporality is invalid")
        if "counterevidence" in claim:
            values = claim["counterevidence"]
            if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
                errors.append(f"{prefix}.counterevidence must be an array of strings")
        if "external_sources" in claim:
            sources = claim["external_sources"]
            if not isinstance(sources, list):
                errors.append(f"{prefix}.external_sources must be an array")
            else:
                for source_index, source in enumerate(sources):
                    source_prefix = f"{prefix}.external_sources[{source_index}]"
                    if not isinstance(source, dict):
                        errors.append(f"{source_prefix} must be an object")
                        continue
                    required_source = {"source", "accessed", "matched_fields"}
                    missing_source = sorted(required_source - source.keys())
                    if missing_source:
                        errors.append(f"{source_prefix} missing: {', '.join(missing_source)}")
                    if "source" in source and (not isinstance(source["source"], str) or not source["source"].strip()):
                        errors.append(f"{source_prefix}.source must be a non-empty string")
                    if "accessed" in source and (not isinstance(source["accessed"], str) or not source["accessed"].strip()):
                        errors.append(f"{source_prefix}.accessed must be a non-empty string")
                    if "url" in source and source["url"] is not None and not isinstance(source["url"], str):
                        errors.append(f"{source_prefix}.url must be a string or null")
                    if "matched_fields" in source:
                        fields = source["matched_fields"]
                        if not isinstance(fields, list) or not all(isinstance(value, str) for value in fields):
                            errors.append(f"{source_prefix}.matched_fields must be an array of strings")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a BioAI deck claim ledger")
    parser.add_argument("input", type=Path)
    args = parser.parse_args(argv)
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    errors = validate(payload)
    if errors:
        print(json.dumps({"valid": False, "errors": errors}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"valid": True, "claims": len(payload["claims"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
