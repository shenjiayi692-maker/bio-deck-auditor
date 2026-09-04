# -*- coding: utf-8 -*-
"""NMPA — 中国监管公开线索辅助工具。

无统一官方 API，分三条路：
  1) scxk 生产许可——仅核实生产许可线索，不是医疗器械注册证
  2) datasearchcnda（药品注册证等）—— JSP + Ajax，靠 tableId 区分数据表
  3) 医疗器械 UDI —— 仅用于已上市产品标识线索，不能核实受理/申请状态

依赖: requests
  pip install requests

注意：接口非官方公开、随时可能变更；请控制频率、设置合理 UA 与间隔。
"""
from __future__ import annotations

import sys
import json
import time
from typing import Optional

SCXK_URL = "http://scxk.nmpa.gov.cn:81/xk/itownet/portalAction.do"
DATASEARCH_URL = "http://app1.nmpa.gov.cn/datasearchcnda/face3/search.jsp"
UDI_DOC = "https://udi.nmpa.gov.cn/showListInterr.html"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Referer": "http://scxk.nmpa.gov.cn/xk/",
    "X-Requested-With": "XMLHttpRequest",
}


# ---------- 路 1：scxk 生产许可（两步式） ----------

def scxk_list(page: int = 1, page_size: int = 15, product_name: str = "",
              apply_name: str = "", apply_sn: str = "",
              condition_type: str = "1", timeout: int = 20) -> dict:
    """获取企业/许可证列表。返回原始 JSON（含 list 与总数）。"""
    import requests
    data = {
        "on": "true",
        "page": str(page),
        "pageSize": str(page_size),
        "productName": product_name,
        "conditionType": condition_type,
        "applyname": apply_name,
        "applysn": apply_sn,
    }
    r = requests.post(f"{SCXK_URL}?method=getXkzsList", data=data,
                      headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def scxk_detail(record_id: str, timeout: int = 20) -> dict:
    """按列表返回的 ID 拉取企业/许可证详情。"""
    import requests
    r = requests.post(f"{SCXK_URL}?method=getXkzsById", data={"id": record_id},
                      headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def scxk_search_all(max_pages: int = 5, page_size: int = 15,
                    product_name: str = "", delay: float = 1.0) -> list[dict]:
    """翻页拉列表 + 逐条拉详情。ID 字段名随接口版本变化，做多键兜底。"""
    results: list[dict] = []
    for pg in range(1, max_pages + 1):
        payload = scxk_list(page=pg, page_size=page_size, product_name=product_name)
        rows = payload.get("list") or payload.get("rows") or []
        if not rows:
            break
        for row in rows:
            rid = row.get("ID") or row.get("id") or row.get("Id")
            if not rid:
                results.append(row)
                continue
            try:
                results.append(scxk_detail(rid))
            except Exception as e:  # noqa: BLE001
                results.append({"id": rid, "error": str(e), "list_row": row})
            time.sleep(delay)
        time.sleep(delay)
    return results


# ---------- 路 2：datasearchcnda（药品注册证等，靠 tableId） ----------
# 常见 tableId（需按目标页抓包核对，站点会调整）：
#   25  国产药品   36  进口药品   32  国产器械   34  进口器械  等
# 该接口分页返回 HTML 片段，需再解析；详情多为二次 POST 带记录 ID。

def datasearch_url(table_id: int, bc_id: str, curstart: int = 1,
                   state: int = 1) -> str:
    """构造 datasearchcnda 列表页 URL（返回的是 HTML，需自行解析）。"""
    from urllib.parse import urlencode
    q = {
        "tableId": table_id,
        "State": state,
        "bcId": bc_id,
        "curstart": curstart,
        "tableName": f"TABLE{table_id}",
        "viewtitleName": "COLUMN1615",
    }
    return f"{DATASEARCH_URL}?{urlencode(q)}"


# ---------- 路 3：UDI 官方对接（推荐器械走这里） ----------

def udi_hint() -> str:
    return ("官方 UDI 数据可辅助核对已实施 UDI 的上市产品标识，但不是完整注册证库，"
            "也不能核实受理号或申请中状态。文档：" + UDI_DOC)


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="NMPA 公开线索辅助工具（非注册证核查器）")
    ap.add_argument("--scxk", action="store_true", help="拉生产许可列表+详情；不等于产品注册证")
    ap.add_argument("--product", default="", help="scxk 产品名过滤")
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--udi", action="store_true", help="打印 UDI 能力边界与对接指引")
    a = ap.parse_args(argv)
    if a.udi:
        print(udi_hint())
    elif a.scxk:
        res = scxk_search_all(max_pages=a.pages, product_name=a.product)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        ap.print_help()
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
