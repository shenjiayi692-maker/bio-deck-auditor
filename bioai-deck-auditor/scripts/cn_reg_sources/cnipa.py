# -*- coding: utf-8 -*-
"""CNIPA — 国家知识产权局 专利检索。

思路（分层降级，参考 handsomestWei/patent-disclosure-skill）：
  首选：爬「中国专利公布公告」公布站 epub.cnipa.gov.cn（公开信息，比 cpquery 好爬）
  降级：epub 异常/0 命中 → Google Patents（支持 CN 号/化学式，最稳免费兜底）

epub 站有 WAF，需 Playwright 无头浏览器 + 足够等待；命中滑块时改 headed 手动过。

依赖: playwright, beautifulsoup4, lxml
  pip install playwright beautifulsoup4 lxml
  python -m playwright install chromium
"""
from __future__ import annotations

import os
import sys
import json
import time
from dataclasses import dataclass, asdict
from typing import Optional

EPUB_URL = "http://epub.cnipa.gov.cn/"
GOOGLE_PATENTS = "https://patents.google.com/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
WAF_MAX_WAIT_SEC = int(os.environ.get("EPUB_WAF_MAX_WAIT_SEC", "180"))


@dataclass
class PatentHit:
    pub_number: str
    title: str
    abstract: str
    link: str


def _epub_search_one(keyword: str, headless: bool = True) -> list[PatentHit]:
    """在 epub 公布站检索单个词，返回命中列表。

    注意：epub 站的检索输入框/结果结构会随改版变化，下面选择器为通用兜底，
    首次接入务必抓包核对表单字段与结果节点，再调整选择器。
    """
    from playwright.sync_api import sync_playwright

    hits: list[PatentHit] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            page = browser.new_page(user_agent=UA)
            page.goto(EPUB_URL, wait_until="domcontentloaded",
                      timeout=WAF_MAX_WAIT_SEC * 1000)
            # 等 WAF 放行 / 页面就绪
            _wait_ready(page)
            # 输入检索词并提交（选择器按实际页面调整）
            _try_fill_and_search(page, keyword)
            page.wait_for_timeout(2500)
            html = page.content()
            hits = _parse_epub(html)
        finally:
            browser.close()
    return hits


def _wait_ready(page, max_sec: int = WAF_MAX_WAIT_SEC) -> None:
    """轮询等待 WAF 挑战结束（标题/关键节点出现）。"""
    deadline = time.time() + max_sec
    while time.time() < deadline:
        try:
            if page.query_selector("input[type='text'], input[type='search']"):
                return
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(1500)


def _try_fill_and_search(page, keyword: str) -> None:
    box = page.query_selector("input[type='search']") or \
        page.query_selector("input[type='text']")
    if box:
        box.fill(keyword)
        box.press("Enter")


def _parse_epub(html: str) -> list[PatentHit]:
    """解析结果。选择器为兜底示例，接入时按真实 DOM 调整。"""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    out: list[PatentHit] = []
    for item in soup.select(".cp_result, .result-item, li.item, tr"):
        text = item.get_text(" ", strip=True)
        a = item.find("a", href=True)
        if not a and not text:
            continue
        import re
        m = re.search(r"CN\s?\d{6,}[A-Z0-9]*", text)
        pub = m.group(0).replace(" ", "") if m else ""
        title = a.get_text(strip=True) if a else text[:80]
        link = a["href"] if a else ""
        if pub or (a and link):
            out.append(PatentHit(pub, title, text[:300], link))
    # 去重（按公开号 / 链接）
    seen, uniq = set(), []
    for h in out:
        key = h.pub_number or h.link or h.title[:120]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(h)
    return uniq


def search(keywords: list[str], headless: bool = True) -> dict:
    """多词检索，一词一查，按公开号去重合并。返回 {hits, source, degraded}。"""
    if not keywords:
        raise ValueError("至少给一个检索词")
    all_hits: list[PatentHit] = []
    try:
        for kw in keywords:
            all_hits.extend(_epub_search_one(kw, headless=headless))
    except Exception as e:  # noqa: BLE001
        return {"hits": [], "source": "epub", "degraded": True,
                "error": str(e), "fallback": google_patents_url(keywords)}

    seen, uniq = set(), []
    for h in all_hits:
        key = h.pub_number or h.link or h.title[:120]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(asdict(h))

    if not uniq:
        return {"hits": [], "source": "epub", "degraded": True,
                "note": "0 命中，建议换更宽检索词或走 Google Patents",
                "fallback": google_patents_url(keywords)}
    return {"hits": uniq, "source": "epub", "degraded": False}


def google_patents_url(keywords: list[str]) -> str:
    """降级兜底：拼 Google Patents 检索 URL（免费、支持 CN 号）。"""
    from urllib.parse import quote_plus
    q = quote_plus(" ".join(keywords))
    return f"{GOOGLE_PATENTS}?q={q}&country=CN"


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="CNIPA 专利检索（epub 优先，Google Patents 兜底）")
    ap.add_argument("keywords", nargs="+", help="检索词，可多个")
    ap.add_argument("--headed", action="store_true", help="显示浏览器（过 WAF/滑块）")
    a = ap.parse_args(argv)
    print(json.dumps(search(a.keywords, headless=not a.headed),
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
