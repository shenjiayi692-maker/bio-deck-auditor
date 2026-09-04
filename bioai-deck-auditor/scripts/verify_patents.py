#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_patents.py — 辅助核实 deck 声称的专利（P2，半自动）。

⚠️ 现实(交接说明):国知局专利、NMPA 注册证都**没有公开 API、有验证码/动态页,
大概率自动化不了**。所以本脚本定位是"**半自动辅助 + 人工兜底**",不是可靠核查器:
  - 尝试爬国知局公布站 epub.cnipa.gov.cn（best-effort,常需有头浏览器过 WAF）
  - 无论成败,都输出 **Google Patents 检索 URL** + **人工核查清单**

真正的核查动作(必须人工做):区分
  ① 发明专利 vs 实用新型/外观（含金量差一个量级）
  ② 已授权 vs 仅已申请（"申请中"不构成壁垒）
  ③ 申请人是**公司主体**,还是创始人个人/关联高校（"公司专利资产"口径）
  ④ 数量是否重复计数(同一技术的分案/同族)

依赖: cn_reg_sources（playwright+bs4）可选;不装也能出人工清单与 URL。

用法:
  python scripts/verify_patents.py 关键词1 关键词2 --company "某某科技"
  python scripts/verify_patents.py --pubno CN123456789A
"""
from __future__ import annotations

import os
import sys
import json
import argparse
import urllib.parse


def google_patents_url(terms: list[str]) -> str:
    q = urllib.parse.quote_plus(" ".join(terms))
    return f"https://patents.google.com/?q={q}&country=CN"


def google_patent_by_no(pubno: str) -> str:
    return f"https://patents.google.com/patent/{urllib.parse.quote(pubno)}"


def try_cnipa(terms: list[str], headed: bool) -> dict:
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from cn_reg_sources import cnipa
    except Exception as e:  # noqa: BLE001
        return {"epub": "unavailable", "why": str(e)}
    try:
        return {"epub": cnipa.search(terms, headless=not headed)}
    except Exception as e:  # noqa: BLE001
        return {"epub": "failed", "why": str(e)}


MANUAL_CHECKLIST = [
    "专利类型:区分发明、实用新型和外观；价值取决于权利要求、产品相关性、地域和可执行性,不能只按类型或数量判断",
    "已授权 vs 申请中:每项的法律状态?（'申请中'≠壁垒,可能永远下不来）",
    "申请人主体:是公司,还是创始人个人/关联高校?（区分'公司资产'vs'个人/实验室积累'）",
    "同族/分案去重:是否把一个技术的多件申请重复计数?",
    "FTO 反向:核心技术是否落在**他人**在先专利范围内?（这才是真风险,deck 从不主动说）",
]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="辅助核实专利(半自动+人工兜底)")
    ap.add_argument("terms", nargs="*", help="检索关键词")
    ap.add_argument("--pubno", help="按公开号定位")
    ap.add_argument("--company", default="", help="公司主体名(用于人工核对申请人)")
    ap.add_argument("--headed", action="store_true", help="显示浏览器过 WAF")
    ap.add_argument("--try-epub", action="store_true", help="尝试爬 epub(否则只给URL+清单)")
    a = ap.parse_args(argv)

    out: dict = {"tag": "[无法核实·需人工]",
                 "note": "国知局无公开API,以下为辅助线索;最终判定须人工按清单核对"}
    if a.pubno:
        out["google_patents"] = google_patent_by_no(a.pubno)
    if a.terms:
        out["google_patents_search"] = google_patents_url(a.terms)
        if a.try_epub:
            out["cnipa_epub"] = try_cnipa(a.terms, a.headed)
    if a.company:
        out["applicant_to_verify"] = a.company
    out["manual_checklist"] = MANUAL_CHECKLIST
    if not (a.pubno or a.terms):
        ap.print_help()
        return 2
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
