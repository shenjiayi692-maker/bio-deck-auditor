# -*- coding: utf-8 -*-
"""ChiCTR — 中国临床试验注册中心 检索/详情。

复刻自 PancrePal-xiaoyibao/chictr-mcp-server 的请求与解析逻辑（MIT）。
用 Playwright 无头浏览器规避基础反爬；命中滑动验证码时请设 headless=False 手动过一次。

依赖: playwright, beautifulsoup4, lxml
  pip install playwright beautifulsoup4 lxml
  python -m playwright install chromium
"""
from __future__ import annotations

import re
import sys
import json
import time
from dataclasses import dataclass, asdict
from typing import Optional

SEARCH_URL = "https://www.chictr.org.cn/searchproj.html"
DETAIL_URL = "https://www.chictr.org.cn/showproj.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


@dataclass
class Trial:
    registration_number: str
    title: str
    institution: str
    study_type: str
    registration_date: str
    project_id: str


def _fetch_html(url: str, headless: bool = True, wait: str = "networkidle",
                timeout_ms: int = 45000) -> str:
    """用 Playwright 打开 url 返回渲染后 HTML。"""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            page = browser.new_page(user_agent=UA)
            page.goto(url, wait_until=wait, timeout=timeout_ms)
            # 给验证码/懒加载一点缓冲
            time.sleep(1.5)
            return page.content()
        finally:
            browser.close()


def _build_search_url(keyword: Optional[str] = None,
                      registration_number: Optional[str] = None,
                      year: Optional[int] = None) -> str:
    from urllib.parse import urlencode
    params = {}
    if keyword:
        params["title"] = keyword
    if registration_number:
        params["regno"] = registration_number
    if year:
        params["createyear"] = str(year)
    if not params:
        raise ValueError("keyword / registration_number / year 至少给一个")
    return f"{SEARCH_URL}?{urlencode(params)}"


def _parse_search(html: str) -> list[Trial]:
    """解析结果表 table.table1，选择器与上游一致。"""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    out: list[Trial] = []
    for tr in soup.select("table.table1 tr"):
        cells = tr.find_all("td")
        if len(cells) < 5:
            continue
        regno = cells[1].get_text(strip=True)
        link = cells[2].select_one("a.tit1")
        if link is None:
            continue
        title = (link.get("title") or link.get_text(strip=True))
        inst_p = cells[2].find("p")
        institution = inst_p.get_text(strip=True) if inst_p else ""
        study_type = cells[3].get_text(strip=True)
        reg_date = cells[4].get_text(strip=True)
        href = link.get("href") or ""
        m = re.search(r"proj=(\d+)", href)
        project_id = m.group(1) if m else ""
        out.append(Trial(regno, title, institution, study_type, reg_date, project_id))
    return out


def search(keyword: Optional[str] = None,
           registration_number: Optional[str] = None,
           year: Optional[int] = None,
           max_results: int = 20,
           headless: bool = True) -> list[dict]:
    """检索临床试验，返回结构化列表。"""
    url = _build_search_url(keyword, registration_number, year)
    html = _fetch_html(url, headless=headless)
    trials = _parse_search(html)
    return [asdict(t) for t in trials[:max_results]]


def detail(project_id: Optional[str] = None,
           registration_number: Optional[str] = None,
           headless: bool = True) -> dict:
    """详情查询。注册号必须先搜索取得真实 project_id，不能从编号推导。"""
    if not project_id:
        if not registration_number:
            raise ValueError("project_id 或 registration_number 至少给一个")
        matches = search(registration_number=registration_number,
                         max_results=20, headless=headless)
        exact = [m for m in matches
                 if m.get("registration_number", "").casefold()
                 == registration_number.casefold()]
        if not exact:
            raise LookupError(f"未找到注册号 {registration_number} 的精确匹配")
        project_id = exact[0].get("project_id")
        if not project_id:
            raise LookupError(f"注册号 {registration_number} 缺少详情 project_id")
    url = f"{DETAIL_URL}?proj={project_id}"
    html = _fetch_html(url, headless=headless)
    return _parse_detail(html, url)


def _parse_detail(html: str, url: str) -> dict:
    """按 .left_title p.cn（中文标签）取字段，值在同行 td:not(.left_title)。"""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    data: dict = {"source_url": url}
    for tr in soup.select("tr"):
        label_el = tr.select_one(".left_title p.cn")
        if not label_el:
            continue
        label = label_el.get_text(strip=True)
        val_td = None
        for td in tr.find_all("td"):
            cls = td.get("class") or []
            if "left_title" not in cls:
                val_td = td
                break
        if label and val_td is not None:
            data[label] = val_td.get_text(strip=True)
    return data


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="ChiCTR 检索/详情")
    ap.add_argument("--keyword")
    ap.add_argument("--regno")
    ap.add_argument("--year", type=int)
    ap.add_argument("--detail", help="按 project_id 或注册号查详情")
    ap.add_argument("--max", type=int, default=20)
    ap.add_argument("--headed", action="store_true", help="显示浏览器（过验证码用）")
    a = ap.parse_args(argv)
    hl = not a.headed
    if a.detail:
        pid = a.detail if a.detail.isdigit() else None
        rn = None if a.detail.isdigit() else a.detail
        print(json.dumps(detail(pid, rn, headless=hl), ensure_ascii=False, indent=2))
    else:
        res = search(a.keyword, a.regno, a.year, a.max, headless=hl)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
