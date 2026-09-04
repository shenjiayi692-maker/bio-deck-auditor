#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_trials.py — 核实 deck 声称的临床试验（P2）。

分两条,可靠度不同:
  - ClinicalTrials.gov v2 API —— **有稳定公开 API、无 key、无验证码 ✅**（国际试验以它为准）
  - 中国临床试验注册中心 ChiCTR —— **无公开 API,靠 Playwright 爬,可能卡验证码 ⚠️**
    （best-effort;失败时退回人工,给出检索 URL）

呼应交接说明:能自动化的主要是国际学术/登记类;ChiCTR 属半自动+人工兜底。

依赖:
  ClinicalTrials.gov 只需标准库。ChiCTR 需 cn_reg_sources（playwright + bs4）。

输出标注沿用四档:[已核实·来源X] / [与deck矛盾·实为Y] / [无法核实]

用法:
  python scripts/verify_trials.py --nct NCT01234567
  python scripts/verify_trials.py --ctgov "stroke rehabilitation BCI"
  python scripts/verify_trials.py --chictr-regno ChiCTR2500108082
  python scripts/verify_trials.py --chictr-keyword "运动想象 卒中" --year 2024
"""
from __future__ import annotations

import os
import sys
import json
import argparse
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional

UA = "bioai-deck-auditor/1.0 (mailto:shenjiayi692@gmail.com)"
TIMEOUT = 20
CTGOV = "https://clinicaltrials.gov/api/v2/studies"


def _get_json(url: str) -> Optional[dict]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                   "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return {"__error__": str(e)}


# ----------------------- ClinicalTrials.gov（可靠 ✅）-----------------------

def ctgov_by_nct(nct: str) -> dict:
    d = _get_json(f"{CTGOV}/{urllib.parse.quote(nct)}")
    if not d or "__error__" in (d or {}):
        return {"tag": "[无法核实]", "nct": nct,
                "note": f"ClinicalTrials.gov 查询失败:{(d or {}).get('__error__','无响应')}"}
    return {"tag": "[已核实存在·ClinicalTrials.gov]", "study": _shape_ctgov(d),
            "note": "仅核实登记记录存在；阶段、申办方、样本量、终点和状态仍须与 deck 逐项比较"}


def ctgov_search(term: str, page_size: int = 5) -> dict:
    url = f"{CTGOV}?" + urllib.parse.urlencode({"query.term": term,
                                                "pageSize": page_size})
    d = _get_json(url)
    if not d or "__error__" in (d or {}):
        return {"tag": "[无法核实]", "note": f"查询失败:{(d or {}).get('__error__','')}",
                "fallback": f"https://clinicaltrials.gov/search?term={urllib.parse.quote(term)}"}
    studies = [_shape_ctgov(s) for s in d.get("studies", [])]
    return {"tag": "[候选记录·尚未匹配]" if studies else "[无法核实]",
            "count": len(studies), "studies": studies,
            "note": "关键词命中不等于核实 deck 宣称；须比较 NCT 号、申办方、阶段、样本量、终点和状态"}


def _shape_ctgov(s: dict) -> dict:
    p = s.get("protocolSection", s) or {}
    idm = p.get("identificationModule", {})
    stat = p.get("statusModule", {})
    des = p.get("designModule", {})
    spon = p.get("sponsorCollaboratorsModule", {})
    en = des.get("enrollmentInfo", {})
    return {
        "nct": idm.get("nctId"),
        "title": idm.get("briefTitle"),
        "status": stat.get("overallStatus"),
        "phase": ",".join(des.get("phases", []) or []) or "N/A",
        "study_type": des.get("studyType"),
        "enrollment": en.get("count"),
        "enrollment_type": en.get("type"),
        "sponsor": (spon.get("leadSponsor") or {}).get("name"),
        "start": (stat.get("startDateStruct") or {}).get("date"),
        "url": f"https://clinicaltrials.gov/study/{idm.get('nctId')}" if idm.get("nctId") else "",
    }


# ----------------------- ChiCTR（半自动 ⚠️）-----------------------

def chictr_lookup(regno: str = "", keyword: str = "", year: Optional[int] = None,
                  headed: bool = False) -> dict:
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from cn_reg_sources import chictr
    except Exception as e:  # noqa: BLE001
        return _chictr_manual(regno, keyword, f"未装依赖({e})")
    try:
        if regno:
            res = chictr.search(registration_number=regno, headless=not headed)
        else:
            res = chictr.search(keyword=keyword, year=year, headless=not headed)
    except Exception as e:  # noqa: BLE001
        return _chictr_manual(regno, keyword, f"爬取失败/可能验证码({e})")
    if not res:
        return {"tag": "[无法核实]", "source": "ChiCTR",
                "note": "ChiCTR 未检索到匹配记录——注册号/关键词可能有误,或该'临床注册'不存在,须索取原文",
                "query": {"regno": regno, "keyword": keyword, "year": year}}
    exact = bool(regno) and any(r.get("registration_number", "").casefold() == regno.casefold()
                                for r in res)
    return {"tag": "[已核实存在·ChiCTR]" if exact else "[候选记录·尚未匹配]",
            "source": "ChiCTR", "count": len(res), "results": res,
            "note": "存在性之外的宣称字段仍须逐项比较"}


def _chictr_manual(regno: str, keyword: str, why: str) -> dict:
    q = regno or keyword
    return {"tag": "[无法核实]", "source": "ChiCTR",
            "note": f"ChiCTR 自动核实不可用({why})。请人工核实。",
            "manual_url": f"https://www.chictr.org.cn/searchproj.html?"
                          + urllib.parse.urlencode({"regno": regno} if regno
                                                    else {"title": keyword})}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="核实临床试验(ClinicalTrials.gov ✅ / ChiCTR ⚠️)")
    ap.add_argument("--nct", help="按 NCT 号核实(ClinicalTrials.gov)")
    ap.add_argument("--ctgov", help="ClinicalTrials.gov 关键词检索")
    ap.add_argument("--chictr-regno", help="按 ChiCTR 注册号核实")
    ap.add_argument("--chictr-keyword", help="ChiCTR 关键词检索")
    ap.add_argument("--year", type=int)
    ap.add_argument("--headed", action="store_true", help="ChiCTR 显示浏览器过验证码")
    a = ap.parse_args(argv)

    if a.nct:
        out = ctgov_by_nct(a.nct)
    elif a.ctgov:
        out = ctgov_search(a.ctgov)
    elif a.chictr_regno or a.chictr_keyword:
        out = chictr_lookup(a.chictr_regno or "", a.chictr_keyword or "",
                            a.year, a.headed)
    else:
        ap.print_help()
        return 2
    out["queried_at"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
