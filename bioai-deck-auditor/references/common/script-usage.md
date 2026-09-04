# 核查脚本使用说明

## 安装

`verify_refs.py` 和 ClinicalTrials.gov 查询仅使用标准库。ChiCTR/CNIPA/NMPA 辅助模块需要：

```bash
pip install -r scripts/requirements.txt
python -m playwright install chromium
```

## 宣称台账与数字

```bash
python scripts/validate_claims.py claims.json
python scripts/cross_check_numbers.py number_checks.json --output number_results.json
python scripts/validate_links.py .
```

`cross_check_numbers.py` 支持 `sum`、`product`、`ratio`、`consistent` 和 `growth_required`。结果只表示算术差异，不判断欺诈。

## 论文

```bash
python scripts/verify_refs.py --claims claims.json --company "某某科技" --founded 2021 --md refs.md
python scripts/verify_refs.py --doi 10.1038/example --claimed-citations 100
python scripts/verify_refs.py --title "论文标题" --claimed-citations 100
```

DOI 精确匹配优先。引用数必须注明数据库和查询日期；批量总引用只有覆盖全部论文时才允许比较。

## 临床试验

```bash
python scripts/verify_trials.py --nct NCT01234567
python scripts/verify_trials.py --ctgov "stroke rehabilitation BCI"
python scripts/verify_trials.py --chictr-regno ChiCTR2500108082 --headed
```

关键词搜索输出候选记录。登记号存在也只证明记录存在，必须继续比较申办方、阶段、样本量、主要终点和状态。

## 专利与中国监管线索

```bash
python scripts/verify_patents.py --pubno CN123456789A
python scripts/verify_patents.py 运动想象 脑机接口 --company "某某科技"
python -m cn_reg_sources.cli nmpa --udi
python -m cn_reg_sources.cli nmpa --scxk --product 产品名
```

专利脚本只生成候选和人工清单。`scxk` 是生产许可线索，不是产品注册证；UDI 只辅助核对已实施 UDI 的上市产品，不能核实申请或受理状态。

## 中国数据源实现边界

- ChiCTR：Playwright + HTML 解析，验证码和页面变化可能造成漏检。
- CNIPA 公布站：选择器易变，结果始终需要人工核对法律状态与申请人。
- NMPA：非公开页面接口可能变化；当前模块没有完整实现注册证/受理号核实。
- 所有自动查询都应限速、遵守站点条款，并保留查询日期和失败原因。
