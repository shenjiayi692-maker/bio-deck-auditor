# -*- coding: utf-8 -*-
"""统一 CLI 入口。

用法：
  python -m cn_reg_sources.cli chictr --keyword KRAS --year 2024
  python -m cn_reg_sources.cli chictr --detail ChiCTR2500108082
  python -m cn_reg_sources.cli nmpa --scxk --product 阿司匹林 --pages 2
  python -m cn_reg_sources.cli nmpa --udi
  python -m cn_reg_sources.cli cnipa 批量 调度 异构

skill 中也可直接 import：
  from cn_reg_sources import chictr, nmpa, cnipa
  chictr.search(keyword="KRAS", year=2024)
"""
from __future__ import annotations

import sys


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__)
        return 0
    source, rest = argv[0], argv[1:]

    if source == "chictr":
        from . import chictr
        return chictr.main(rest)
    elif source == "nmpa":
        from . import nmpa
        return nmpa.main(rest)
    elif source == "cnipa":
        from . import cnipa
        return cnipa.main(rest)
    else:
        print(f"未知数据源: {source}（可选 chictr / nmpa / cnipa）", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
