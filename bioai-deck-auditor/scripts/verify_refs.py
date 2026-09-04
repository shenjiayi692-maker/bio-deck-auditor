#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_refs.py — 核实 deck 声称的论文 / 引用数 / 影响因子 / 作者归属（P1）。

为 bioai-deck-auditor 的"⚪待核实"栏做事实核查：几乎每份生物 deck 都吹论文和引用，
而这里水分极大。用三个**有稳定公开 API、无需 key、无验证码**的学术源交叉核实：
  - CrossRef       https://api.crossref.org
  - OpenAlex       https://api.openalex.org      （引用数以它为准，最全）
  - PubMed E-utils https://eutils.ncbi.nlm.nih.gov

专门抓四类水分（见交接说明·优先级1）：
  1. 把创始人整个高校实验室的历史论文算成公司资产（论文早于公司成立 / 署名是高校非公司）
  2. 总引用数灌水（声称总数 vs 各文实际相加）
  3. IF 用期刊最高值而非该文实际（IF 是期刊级、非文章级；报告文章实际引用才有意义）
  4. 论文根本不存在 / 作者排序不符

数据连接层（本轮加固，参考 K-Dense-AI/scientific-agent-skills 与
FreedomIntelligence/OpenClaw-Medical-Skills 的 API 封装思路，只借数据连接、不借科研分析）：
  · DOI 优先：deck 给了 DOI 就走 OpenAlex/CrossRef 的**精确实体查询**（/works/doi:…），
    比模糊标题匹配可靠得多；DOI 查不到再退回标题搜索。
  · 礼貌池 + 限速：每个 host 独立限速（OpenAlex/CrossRef 10 r/s；PubMed 无 key 3 r/s、
    有 key 10 r/s，符合 NCBI 规则），指数退避区分 403/429/5xx/超时。
  · PubMed EFetch 取作者单位：esummary 不返回 affiliation，efetch XML 有——给
    "实验室历史充公司资产"这条检查补上第二个数据源。
  · 环境变量：VERIFY_REFS_MAILTO 覆盖 mailto；NCBI_API_KEY 提升 PubMed 限速到 10 r/s。

只用标准库（urllib + xml.etree），**无需 pip 安装**。礼貌起见所有请求带 mailto/UA。

输出标注沿用 skill 的四档：
  [已核实·来源X] / [与deck矛盾·实为Y] / [无法核实] / （[据deck·未核实] 是输入态）

用法：
  # 单篇（给 DOI 最准）
  python scripts/verify_refs.py --title "论文标题" --doi 10.1109/TBME.2019.123 \
      --claimed-citations 1406 --claimed-if 15.5
  # 批量（JSON）+ 公司背景（用于判定"实验室历史充公司资产"）
  python scripts/verify_refs.py --claims claims.json --company "某某科技" --founded 2021 --md report.md

claims.json 结构：
  {
    "company": "某某科技", "founded_year": 2021,
    "claimed_total_citations": 1406,
    "papers": [
      {"title": "...", "doi": "10.xxxx/xxxx", "authors": ["Zhang X", "..."],
       "journal": "...", "year": 2019, "claimed_citations": 320, "claimed_if": 15.5}
    ]
  }
  （doi 可选；给了就走精确查询。）
"""
from __future__ import annotations

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from dataclasses import dataclass, field, asdict
from typing import Optional

MAILTO = os.environ.get("VERIFY_REFS_MAILTO", "shenjiayi692@gmail.com")
NCBI_API_KEY = os.environ.get("NCBI_API_KEY", "").strip()
UA = f"bioai-deck-auditor/1.1 (mailto:{MAILTO})"
TIMEOUT = 30
MATCH_THRESHOLD = 0.72  # 标题相似度低于此判为"未找到匹配"
MAX_RETRIES = 4


# ----------------------------- HTTP（限速 + 退避）-----------------------------
# 参考 OpenClaw openalex_client.py 的礼貌池 + 指数退避；改为纯 urllib、无 requests 依赖。

class _RateLimiter:
    """按 host 的最小请求间隔限速。"""

    def __init__(self, rps: float):
        self.min_delay = 1.0 / rps if rps > 0 else 0.0
        self._last = 0.0

    def wait(self) -> None:
        now = time.time()
        gap = now - self._last
        if gap < self.min_delay:
            time.sleep(self.min_delay - gap)
        self._last = time.time()


# NCBI 官方限速：无 API key 3 r/s，有 key 10 r/s（见 OpenClaw pubmed api_reference.md）。
_LIMITERS = {
    "api.openalex.org": _RateLimiter(10),
    "api.crossref.org": _RateLimiter(10),
    "eutils.ncbi.nlm.nih.gov": _RateLimiter(10 if NCBI_API_KEY else 3),
}


def _host(url: str) -> str:
    return urllib.parse.urlparse(url).netloc


def _fetch(url: str, accept: str) -> Optional[str]:
    """带 host 限速 + 指数退避的 GET。返回响应体文本，失败返回 None。

    退避策略（参考 openalex_client._make_request）：
      · 403/429（限速）与 5xx（服务端）→ 退避重试
      · 其他 4xx（含 404 未找到）→ 不重试，直接 None
      · 超时/网络错误 → 退避重试
    """
    lim = _LIMITERS.get(_host(url))
    for attempt in range(MAX_RETRIES):
        if lim:
            lim.wait()
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) or e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return None  # 404 等：确定性未找到，不重试
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
                continue
            return None
    return None


def _get_json(url: str) -> Optional[dict]:
    body = _fetch(url, accept="application/json")
    if body is None:
        return None
    try:
        return json.loads(body)
    except (ValueError, TypeError):
        return None


def _get_xml(url: str) -> Optional[ET.Element]:
    body = _fetch(url, accept="application/xml")
    if not body:
        return None
    try:
        return ET.fromstring(body)
    except ET.ParseError:
        return None


def _norm(s: str) -> str:
    return "".join(ch.lower() for ch in (s or "") if ch.isalnum() or ch.isspace()).strip()


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _clean_doi(doi: str) -> str:
    d = (doi or "").strip()
    for pre in ("https://doi.org/", "http://doi.org/", "doi:", "DOI:"):
        if d.lower().startswith(pre.lower()):
            d = d[len(pre):]
    return d.strip().lower()


def _eutils(fcgi: str, params: dict) -> str:
    p = dict(params)
    if NCBI_API_KEY:
        p["api_key"] = NCBI_API_KEY
    return (f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{fcgi}?"
            + urllib.parse.urlencode(p))


# ----------------------------- 数据模型 -----------------------------

@dataclass
class Resolved:
    found: bool = False
    source: str = ""
    matched_by: str = ""                     # "doi" | "title" | ""
    matched_title: str = ""
    similarity: float = 0.0
    doi: str = ""
    year: Optional[int] = None
    venue: str = ""
    citations: Optional[int] = None          # 该文实际引用（文章级）
    authors: list[str] = field(default_factory=list)
    affiliations: list[str] = field(default_factory=list)
    url: str = ""


# ----------------------------- 三源解析 -----------------------------

def _parse_openalex_work(best: dict, matched_by: str, similarity: float) -> Resolved:
    r = Resolved(source="OpenAlex", found=True, matched_by=matched_by,
                 similarity=round(similarity, 3))
    r.matched_title = best.get("display_name") or ""
    r.doi = _clean_doi(best.get("doi") or "")
    r.year = best.get("publication_year")
    src = (best.get("primary_location") or {}).get("source") or {}
    r.venue = src.get("display_name") or ""
    r.citations = best.get("cited_by_count")
    r.url = best.get("id") or ""
    for a in best.get("authorships", []):
        nm = (a.get("author") or {}).get("display_name")
        if nm:
            r.authors.append(nm)
        for inst in a.get("institutions", []):
            if inst.get("display_name"):
                r.affiliations.append(inst["display_name"])
    r.affiliations = sorted(set(r.affiliations))
    return r


def resolve_openalex(title: str, doi: str = "") -> Resolved:
    # DOI 优先：精确实体查询 /works/doi:…（参考 openalex_client.get_entity）
    if doi:
        path = urllib.parse.quote(f"doi:{doi}", safe=":/")
        d = _get_json(f"https://api.openalex.org/works/{path}?"
                      + urllib.parse.urlencode({"mailto": MAILTO}))
        if d and d.get("id"):
            return _parse_openalex_work(d, matched_by="doi", similarity=1.0)
    # 退回标题搜索
    if not title:
        return Resolved(source="OpenAlex")
    d = _get_json("https://api.openalex.org/works?" + urllib.parse.urlencode(
        {"search": title, "per-page": 3, "mailto": MAILTO}))
    if not d or not d.get("results"):
        return Resolved(source="OpenAlex")
    best, bestsim = None, 0.0
    for it in d["results"]:
        sim = _sim(title, it.get("display_name") or "")
        if sim > bestsim:
            best, bestsim = it, sim
    if not best:
        return Resolved(source="OpenAlex")
    r = _parse_openalex_work(best, matched_by="title", similarity=bestsim)
    r.found = bestsim >= MATCH_THRESHOLD
    return r


def _parse_crossref_item(best: dict, matched_by: str, similarity: float) -> Resolved:
    r = Resolved(source="CrossRef", found=True, matched_by=matched_by,
                 similarity=round(similarity, 3))
    r.matched_title = (best.get("title") or [""])[0]
    r.doi = _clean_doi(best.get("DOI") or "")
    dp = best.get("published") or best.get("issued") or {}
    parts = (dp.get("date-parts") or [[None]])[0]
    r.year = parts[0] if parts else None
    r.venue = (best.get("container-title") or [""])[0]
    r.citations = best.get("is-referenced-by-count")
    for a in best.get("author", []) or []:
        nm = " ".join(x for x in [a.get("given"), a.get("family")] if x)
        if nm:
            r.authors.append(nm)
        for aff in a.get("affiliation", []) or []:
            if aff.get("name"):
                r.affiliations.append(aff["name"])
    r.affiliations = sorted(set(r.affiliations))
    r.url = best.get("URL") or (f"https://doi.org/{r.doi}" if r.doi else "")
    return r


def resolve_crossref(title: str, doi: str = "") -> Resolved:
    # DOI 优先：/works/{doi} 直取单条
    if doi:
        d = _get_json("https://api.crossref.org/works/"
                      + urllib.parse.quote(doi, safe="/")
                      + "?" + urllib.parse.urlencode({"mailto": MAILTO}))
        msg = (d or {}).get("message")
        if isinstance(msg, dict) and msg.get("DOI"):
            return _parse_crossref_item(msg, matched_by="doi", similarity=1.0)
    if not title:
        return Resolved(source="CrossRef")
    d = _get_json("https://api.crossref.org/works?" + urllib.parse.urlencode(
        {"query.bibliographic": title, "rows": 3, "mailto": MAILTO}))
    items = ((d or {}).get("message") or {}).get("items") or []
    if not items:
        return Resolved(source="CrossRef")
    best, bestsim = None, 0.0
    for it in items:
        t = (it.get("title") or [""])[0]
        sim = _sim(title, t)
        if sim > bestsim:
            best, bestsim = it, sim
    if not best:
        return Resolved(source="CrossRef")
    r = _parse_crossref_item(best, matched_by="title", similarity=bestsim)
    r.found = bestsim >= MATCH_THRESHOLD
    return r


def _pubmed_affiliations(pmid: str) -> list[str]:
    """EFetch XML 取作者单位（esummary 不返回 affiliation）。"""
    root = _get_xml(_eutils("efetch.fcgi",
                            {"db": "pubmed", "id": pmid, "retmode": "xml"}))
    if root is None:
        return []
    affs = [e.text.strip() for e in root.iter("Affiliation")
            if e.text and e.text.strip()]
    return sorted(set(affs))


def resolve_pubmed(title: str, doi: str = "") -> Resolved:
    r = Resolved(source="PubMed")
    # DOI 优先：用 [AID] 字段检索
    ids: list[str] = []
    if doi:
        es = _get_json(_eutils("esearch.fcgi",
                               {"db": "pubmed", "term": f"{doi}[AID]",
                                "retmode": "json", "retmax": 1}))
        ids = (((es or {}).get("esearchresult") or {}).get("idlist")) or []
        if ids:
            r.matched_by = "doi"
    if not ids and title:
        es = _get_json(_eutils("esearch.fcgi",
                               {"db": "pubmed", "term": title,
                                "retmode": "json", "retmax": 1}))
        ids = (((es or {}).get("esearchresult") or {}).get("idlist")) or []
        r.matched_by = "title"
    if not ids:
        return Resolved(source="PubMed")
    pmid = ids[0]
    su = _get_json(_eutils("esummary.fcgi",
                           {"db": "pubmed", "id": pmid, "retmode": "json"}))
    doc = (((su or {}).get("result") or {}).get(pmid)) or {}
    if not doc:
        return Resolved(source="PubMed")
    r.matched_title = doc.get("title") or ""
    if r.matched_by == "doi":
        r.similarity = 1.0
        r.found = True
    else:
        r.similarity = round(_sim(title, r.matched_title), 3)
        r.found = r.similarity >= MATCH_THRESHOLD
    r.venue = doc.get("fulljournalname") or doc.get("source") or ""
    pd = doc.get("pubdate") or ""
    r.year = int(pd[:4]) if pd[:4].isdigit() else None
    r.authors = [a.get("name") for a in doc.get("authors", []) if a.get("name")]
    for aid in doc.get("articleids", []):
        if aid.get("idtype") == "doi":
            r.doi = _clean_doi(aid.get("value") or "")
    r.url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    if r.found:
        r.affiliations = _pubmed_affiliations(pmid)  # 第二个单位来源
    # PubMed 不给引用数，留空由 OpenAlex 补
    return r


def resolve(title: str, doi: str = "") -> dict:
    """三源都查，返回 {openalex, crossref, pubmed} 与一个 consensus。"""
    doi = _clean_doi(doi)
    oa = resolve_openalex(title, doi)
    cr = resolve_crossref(title, doi)
    pm = resolve_pubmed(title, doi)
    found_any = any(x.found for x in (oa, cr, pm))
    # 引用数以 OpenAlex 为准，CrossRef 兜底
    citations = oa.citations if oa.found and oa.citations is not None else \
        (cr.citations if cr.found else None)
    # 合并来源，避免一个来源的稀疏单位字段遮蔽其他来源。
    affiliations = sorted(set(oa.affiliations + cr.affiliations + pm.affiliations))
    return {"openalex": asdict(oa), "crossref": asdict(cr), "pubmed": asdict(pm),
            "found_any": found_any, "consensus_citations": citations,
            "consensus_affiliations": affiliations}


# ----------------------------- 核实逻辑 -----------------------------

def verify_one(claim: dict, company: str = "", founded: Optional[int] = None) -> dict:
    title = claim.get("title", "")
    res = resolve(title, claim.get("doi", ""))
    oa, cr = res["openalex"], res["crossref"]
    actual_cites = res["consensus_citations"]
    year = oa.get("year") or cr.get("year") or res["pubmed"].get("year")
    affs = res["consensus_affiliations"] or []
    authors = oa.get("authors") or cr.get("authors") or res["pubmed"].get("authors") or []

    flags: list[str] = []
    tag = "[无法核实]"

    if not res["found_any"]:
        tag = "[无法核实]"
        flags.append("三源均未找到高相似度匹配——论文可能不存在、标题有误，或署名/年份不符，需向公司索取 DOI")
    else:
        matched_sources = [x["source"] for x in (oa, cr, res["pubmed"]) if x.get("found")]
        tag = "[已核实·{}]".format("/".join(matched_sources))
        # 水分3: 引用数
        cc = claim.get("claimed_citations")
        if cc is not None and actual_cites is not None:
            if actual_cites == 0:
                ratio = float("inf")
            else:
                ratio = cc / actual_cites
            if ratio >= 1.5:
                tag = "[与deck不一致·当前记录{}次引用]".format(actual_cites)
                flags.append(
                    f"引用数不一致：deck 称 {cc}，OpenAlex/CrossRef 当前记录 {actual_cites}"
                    f"（约 {ratio:.1f}×）；先核对 deck 截止日期、数据库口径和是否合并了其他论文"
                )
            elif ratio <= 0.67:
                flags.append(f"deck 称 {cc} 引用，实际更高 {actual_cites}（deck 保守/或指向别的对象）")
            else:
                flags.append(f"引用数基本吻合：deck {cc} vs 实际 {actual_cites}")
        # 水分4: IF（期刊级，免费API无 JCR，报告文章级引用替代）
        if claim.get("claimed_if") is not None:
            flags.append(
                f"IF={claim['claimed_if']} 为**期刊级**指标（免费API无 JCR 无法核实，标 [无法核实·需查JCR]）；"
                f"该文**文章级**实际引用为 {actual_cites}——投资判断应看文章级，而非期刊 IF")
        # 公司成立前论文可证明团队积累，但公司是否拥有资产权利必须查成果转化文件。
        if founded and year and year < founded:
            flags.append(
                f"论文发表于 {year}，早于公司成立 {founded}——可作为团队历史能力证据，"
                f"但不能仅凭论文推定为公司资产；需核对许可、转让或职务成果协议")
        if affs and company:
            uni_like = [a for a in affs if any(k in a for k in
                        ("University", "大学", "Institute", "研究所", "Hospital", "医院", "College", "学院"))]
            if uni_like and not any(_sim(company, a) > 0.5 for a in affs):
                flags.append(
                    f"署名单位含 {', '.join(uni_like[:3])} 等高校/院所，未匹配公司名称——"
                    f"需核对公司是否取得许可、成果转让或独占实施权")
        # 水分4b: 作者排序
        ca = claim.get("authors") or []
        if ca and authors:
            if _sim(ca[0], authors[0]) < 0.5:
                flags.append(f"首作者不符：deck 称 {ca[0]}，实际首作者 {authors[0]}")

    return {
        "title": title,
        "tag": tag,
        "matched_by": oa.get("matched_by") or cr.get("matched_by") or res["pubmed"].get("matched_by") or "",
        "claimed": {k: claim.get(k) for k in
                    ("claimed_citations", "claimed_if", "authors", "journal", "year")},
        "actual": {"year": year, "venue": oa.get("venue") or cr.get("venue"),
                   "citations": actual_cites, "doi": oa.get("doi") or cr.get("doi"),
                   "first_author": authors[0] if authors else None,
                   "affiliations": affs, "url": oa.get("url") or cr.get("url")},
        "similarity": max(oa.get("similarity", 0), cr.get("similarity", 0),
                          res["pubmed"].get("similarity", 0)),
        "flags": flags,
    }


def verify_batch(payload: dict) -> dict:
    company = payload.get("company", "")
    founded = payload.get("founded_year")
    papers = payload.get("papers", [])
    results = [verify_one(p, company, founded) for p in papers]
    # 水分2: 总引用灌水
    total_check = None
    claimed_total = payload.get("claimed_total_citations")
    if claimed_total is not None:
        known = [r["actual"]["citations"] for r in results
                 if r["actual"]["citations"] is not None]
        actual_sum = sum(known)
        complete = len(known) == len(results) and bool(results)
        if not complete:
            note = (f"覆盖不完整：仅 {len(known)}/{len(results)} 篇取得引用数；"
                    "不得据此判断总引用吻合或矛盾")
        elif actual_sum == 0:
            note = "已覆盖全部论文，但当前记录总引用为 0；核对数据库收录与截止日期"
        elif claimed_total / actual_sum >= 1.5:
            note = (f"总引用不一致：deck 称 {claimed_total}，当前数据库相加 {actual_sum}；"
                    "核对截止日期、数据库口径和论文清单")
        else:
            note = "在当前论文清单、数据库和查询日期口径下基本一致"
        total_check = {
            "claimed_total": claimed_total,
            "verified_sum": actual_sum if known else None,
            "papers_with_citation_data": len(known),
            "papers_total": len(results),
            "coverage_complete": complete,
            "note": note,
        }
    return {"company": company, "founded_year": founded,
            "queried_at": datetime.now(timezone.utc).isoformat(),
            "total_citation_check": total_check, "papers": results}


# ----------------------------- 报告 -----------------------------

def to_markdown(out: dict) -> str:
    L = ["# 论文/引用核实报告", ""]
    if out.get("company"):
        L.append(f"公司：{out['company']}　成立：{out.get('founded_year','?')}")
        L.append("")
    tc = out.get("total_citation_check")
    if tc:
        L.append(f"**总引用核对**：声称 {tc['claimed_total']} vs 已核实相加 {tc['verified_sum']} — {tc['note']}")
        L.append("")
    L.append("| 标题 | 判定 | 命中 | 声称引用 | 实际引用 | 年份 | 期刊 | 相似度 |")
    L.append("|---|---|---|---|---|---|---|---|")
    for r in out["papers"]:
        a = r["actual"]
        L.append("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
            (r["title"] or "")[:40], r["tag"], r.get("matched_by") or "—",
            r["claimed"].get("claimed_citations", "—"),
            a.get("citations", "—"), a.get("year", "—"),
            (a.get("venue") or "—")[:24], r["similarity"]))
    L.append("")
    for r in out["papers"]:
        if r["flags"]:
            L.append(f"### {(r['title'] or '')[:60]}")
            for f in r["flags"]:
                L.append(f"- {f}")
            if r["actual"].get("url"):
                L.append(f"- 链接：{r['actual']['url']}")
            L.append("")
    return "\n".join(L)


# ----------------------------- CLI -----------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="核实 deck 声称的论文/引用/IF/作者归属")
    ap.add_argument("--claims", help="批量 JSON 文件")
    ap.add_argument("--title", help="单篇标题")
    ap.add_argument("--doi", help="单篇 DOI（给了走精确查询，最准）")
    ap.add_argument("--claimed-citations", type=int)
    ap.add_argument("--claimed-if", type=float)
    ap.add_argument("--authors", help="逗号分隔的声称作者")
    ap.add_argument("--company", default="")
    ap.add_argument("--founded", type=int)
    ap.add_argument("--md", help="把 markdown 报告写到此文件")
    ap.add_argument("--json", action="store_true", help="stdout 输出原始 JSON")
    a = ap.parse_args(argv)

    if a.claims:
        payload = json.load(open(a.claims, encoding="utf-8"))
        if a.company:
            payload["company"] = a.company
        if a.founded:
            payload["founded_year"] = a.founded
        out = verify_batch(payload)
    elif a.title or a.doi:
        claim = {"title": a.title or "", "doi": a.doi or "",
                 "claimed_citations": a.claimed_citations,
                 "claimed_if": a.claimed_if,
                 "authors": [s.strip() for s in (a.authors or "").split(",") if s.strip()]}
        out = verify_batch({"company": a.company, "founded_year": a.founded,
                            "papers": [claim]})
    else:
        ap.print_help()
        return 2

    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(to_markdown(out))
    if a.md:
        open(a.md, "w", encoding="utf-8").write(to_markdown(out))
        print(f"\n[written] {a.md}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
