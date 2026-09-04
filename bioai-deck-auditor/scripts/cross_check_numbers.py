#!/usr/bin/env python3
"""Deterministic arithmetic checks for values extracted from a deck.

Input is a JSON object with a ``checks`` array. Supported check types:
``sum``, ``product``, ``ratio``, ``consistent`` and ``growth_required``.
The script never decides whether a mismatch is fraud; it only reports the
calculation, tolerance and source slides.
"""
from __future__ import annotations

import argparse
import json
import math
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


def _decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{field} must be numeric")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field} must be numeric: {value!r}") from exc
    if not number.is_finite():
        raise ValueError(f"{field} must be finite")
    return number


def _tolerance(check: dict[str, Any], expected: Decimal) -> Decimal:
    absolute = _decimal(check.get("absolute_tolerance", 0), "absolute_tolerance")
    relative = _decimal(check.get("relative_tolerance", 0.01), "relative_tolerance")
    return max(absolute, abs(expected) * relative)


def _result(check: dict[str, Any], calculated: Decimal, stated: Decimal) -> dict[str, Any]:
    difference = calculated - stated
    tolerance = _tolerance(check, stated)
    return {
        "check_id": check.get("check_id"),
        "type": check.get("type"),
        "status": "match" if abs(difference) <= tolerance else "mismatch",
        "calculated": float(calculated),
        "stated": float(stated),
        "difference": float(difference),
        "tolerance": float(tolerance),
        "unit": check.get("unit"),
        "slides": check.get("slides", []),
        "note": "Arithmetic result only; verify definitions, period, currency and tax treatment before interpreting.",
    }


def evaluate(check: dict[str, Any]) -> dict[str, Any]:
    kind = check.get("type")
    stated = _decimal(check.get("stated"), "stated")

    if kind == "sum":
        values = check.get("values")
        if not isinstance(values, list) or not values:
            raise ValueError("sum requires a non-empty values array")
        calculated = sum((_decimal(v, "values") for v in values), Decimal(0))
    elif kind == "product":
        values = check.get("values")
        if not isinstance(values, list) or not values:
            raise ValueError("product requires a non-empty values array")
        calculated = math.prod(_decimal(v, "values") for v in values)
    elif kind == "ratio":
        numerator = _decimal(check.get("numerator"), "numerator")
        denominator = _decimal(check.get("denominator"), "denominator")
        if denominator == 0:
            raise ValueError("ratio denominator cannot be zero")
        calculated = numerator / denominator
    elif kind == "consistent":
        values = check.get("values")
        if not isinstance(values, list) or not values:
            raise ValueError("consistent requires a non-empty values array")
        numbers = [_decimal(v, "values") for v in values]
        calculated = max(numbers) - min(numbers)
        stated = Decimal(0)
    elif kind == "growth_required":
        current = _decimal(check.get("current"), "current")
        target = _decimal(check.get("target"), "target")
        periods_remaining = _decimal(check.get("periods_remaining", 1), "periods_remaining")
        if periods_remaining <= 0:
            raise ValueError("periods_remaining must be positive")
        calculated = (target - current) / periods_remaining
    else:
        raise ValueError(f"unsupported check type: {kind!r}")
    return _result(check, calculated, stated)


def run(payload: dict[str, Any]) -> dict[str, Any]:
    checks = payload.get("checks")
    if not isinstance(checks, list):
        raise ValueError("input must contain a checks array")
    results = []
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            results.append({"index": index, "status": "error", "error": "check must be an object"})
            continue
        try:
            results.append(evaluate(check))
        except ValueError as exc:
            results.append({
                "check_id": check.get("check_id"),
                "type": check.get("type"),
                "status": "error",
                "error": str(exc),
                "slides": check.get("slides", []),
            })
    return {
        "summary": {
            "total": len(results),
            "matches": sum(r.get("status") == "match" for r in results),
            "mismatches": sum(r.get("status") == "mismatch" for r in results),
            "errors": sum(r.get("status") == "error" for r in results),
        },
        "results": results,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cross-check arithmetic extracted from a deck")
    parser.add_argument("input", type=Path, help="JSON file containing a checks array")
    parser.add_argument("--output", type=Path, help="Optional output JSON path")
    args = parser.parse_args(argv)

    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        output = run(payload)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        parser.error(str(exc))
    rendered = json.dumps(output, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 1 if output["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
