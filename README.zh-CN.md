<p align="center">
  <img src="./assets/readme/hero.gif" width="100%" alt="Bio/MedTech Deck Auditor turns fundraising decks into traceable claims, source-backed evidence, and reviewable decisions">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="./bioai-deck-auditor/">审计技能</a> ·
  <a href="./deck-audit-workbench/">复核工作台</a> ·
  <a href="./outputs/">样例报告</a>
</p>

<p align="center"><a href="./README.md">English</a> · <strong>中文</strong></p>

一份生物科技 BP 的致命问题，很少是某句话说错了。而是跨页的数字对不上，以及那张注册证的持有人不是正在融资的那个主体。

```bash
git clone https://github.com/shenjiayi692-maker/bio-deck-auditor && open bio-deck-auditor/outputs/three-deck-blind-audit-2026-07-17.md
```

对三份真实 deck 的盲测复盘——最快看清这套方法实际产出什么的方式。跑脚本则需要你自己的 deck。

Bio/MedTech Deck Auditor 是一套以证据校准为核心的尽调工作流，面向生物科技、创新药、医疗器械、医疗 AI、脑机接口和健康 SaaS 的融资材料。它把一份 deck 拆成原子化、可检验的宣称，并从技术、临床/监管、商业、团队/治理、资本五个层面逐一评估。

> [!IMPORTANT]
> 核心规则很简单：让**材料声称什么**、**外部证据支持什么**、**分析师据此得出什么结论**三者在视觉上始终分开。本项目服务于投资初筛，不构成投资、法律、医疗或监管意见。

## 从叙事到审计轨迹

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Five-stage workflow: ingest a deck, atomize claims, verify primary-source anchors, complete human review, and export an auditable report">
</p>

流程从宣称台账开始——不是从观点开始。每一条实质性宣称都保留它的页码、原文、法律实体、产品或版本、时间属性、辖区、证据形态和复核状态。只有在这之后，系统才形成判断，而判断有固定形状：

```text
证据 → 推理 → 影响 → 反证条件 → 下一步核实动作
```

证据状态与风险严重度被刻意设为相互独立。一个高影响的红旗可以只有低置信度；缺失的信息保持为待核实项，除非这个缺失本身就违反了披露、监管或所处阶段应有的预期。

## 真实材料，可复核的产出

<p align="center">
  <img src="./deck-audit-workbench/public/demo-shuimu-7.png" width="32%" alt="Source slide from the Shuimu Molecular deck">
  <img src="./deck-audit-workbench/public/demo-shimei-19.png" width="32%" alt="Source slide from the Shimei medical ultrasound deck">
  <img src="./deck-audit-workbench/public/demo-liuyedao-16.png" width="32%" alt="Source slide from the Lancet Robotics deck">
</p>

仓库包含三个端到端的初筛示例，以及一次盲测复盘：

| 案例 | Markdown 报告 | PPTX 报告 |
| --- | --- | --- |
| 柳叶刀机器人 | [阅读报告](./outputs/reports/lancet-robotics-initial-screening.md) | [下载](./outputs/reports/lancet-robotics-initial-screening.pptx) |
| 安徽视美 | [阅读报告](./outputs/reports/shimei-initial-screening.md) | [下载](./outputs/reports/shimei-initial-screening.pptx) |
| 水木分子 | [阅读报告](./outputs/reports/shuimu-molecular-initial-screening.md) | [下载](./outputs/reports/shuimu-molecular-initial-screening.pptx) |

[阅读三份 deck 的盲测复盘 →](./outputs/three-deck-blind-audit-2026-07-17.md)

## 仓库里有什么

| 路径 | 用途 | 状态 |
| --- | --- | --- |
| [`bioai-deck-auditor/`](./bioai-deck-auditor/) | 七步 agent 技能，含 10 个领域包、3 份辖区指南、41 份参考文件和 7 个核查脚本 | 可用 |
| [`deck-audit-workbench/`](./deck-audit-workbench/) | 人工复核界面：上传 deck、逐条过审、检视证据、记录判断、导出 Markdown/PPTX | 可跑的原型，未部署 |
| [`outputs/`](./outputs/) | 三份初筛报告，外加一次盲测复盘 | 样例证据 |
| [`docs/decisions.zh-CN.md`](./docs/decisions.zh-CN.md) | 六条设计决策：替代方案、否掉的理由、各自的代价 | 说明 |

## 审计器查什么

- **技术与科学** —— 研究设计、基准、外部验证、失败模式、可复现性，以及从模型表现到真实世界价值的路径。
- **临床、监管与数据** —— 预期用途、产品/版本边界、试验与注册锚点、隐私、质量体系、投诉、召回和上市后证据。
- **商业质量** —— 把线索、科研合作、试点、合同、装机、验收、回款、活跃使用和续约分开，而不是合并成一个"客户数"。
- **团队与治理** —— 关键人投入度、能力缺口、IP 归属、技术转让、关联方、cap table、runway 和里程碑对齐。
- **资本与交易** —— 融资证据、估值口径、可比公司的日期与币种、稀释、营运资金、退出约束和回报假设。

对多产品公司，审计器会建立"法律实体 → SKU → 版本 → 注册证 → 预期用途 → 生产主体 → 收入"矩阵。一张证只核实与之对应的那一格，不自动覆盖相邻产品、其他适应症、其他模块或关联公司。

## 自动化边界

| 核查项 | 工具 | 边界 |
| --- | --- | --- |
| PDF/PPTX 文本、备注、图表缓存值、链接与嵌入媒体清单 | `extract_deck.py` | 机器抽取永远不能替代逐页视觉复核 |
| 跨页算术 | `cross_check_numbers.py` | 输入结构化时是确定性的 |
| 论文与引用 | `verify_refs.py` | 使用公开 API；标题匹配在身份字段对齐之前只算候选 |
| 临床试验 | `verify_trials.py` | ClinicalTrials.gov 有 API 支持；ChiCTR 可能需要退回人工 |
| 专利 | `verify_patents.py` | 产出候选清单供分析师确认 |
| 中国监管线索 | `cn_reg_sources/` | 仅在每个来源适配器自报的能力范围内使用 |

估值产出随数据量而定：阶段概率和条件现金流站得住时做完整 rNPV；概率稀薄时给情景区间；deck 支撑不起一个数字估值时，只做隐含里程碑分析。

## 快速开始

### 安装 agent 技能

```bash
npx skills add https://github.com/shenjiayi692-maker/bio-deck-auditor \
  --skill bioai-deck-auditor
```

然后附上一份 deck 调用它：

```text
Use $bioai-deck-auditor to audit this deck claim by claim and produce an evidence-calibrated investment screening report.
```

### 跑确定性的 deck 抽取

```bash
git clone https://github.com/shenjiayi692-maker/bio-deck-auditor.git
cd bio-deck-auditor/bioai-deck-auditor/scripts

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python extract_deck.py /path/to/deck.pptx -o extracted-deck.json
python validate_claims.py /path/to/claim-ledger.json
python cross_check_numbers.py /path/to/number-checks.json
```

### 跑复核工作台

工作台需要 Node.js `>=22.13.0`、项目声明的本地 D1/R2 绑定，以及一个 OpenAI API key。

```bash
cd deck-audit-workbench
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

生产环境请通过托管平台的环境变量提供 `OPENAI_API_KEY`，不要提交进仓库。

## 当前限制

这是一个 analyst-copilot 原型，不是一个能自主决策的投委会。目前最强的部分是宣称抽取、算术检查、来源校准和创始人追问生成。实体/资产边界、产品-版本-证书映射、图表取证、商业化漏斗、制造与上市后质量、实时市场数据、资本回报建模、多人复核、鉴权、配额、重试和持续回归评测，都还需要进一步产品化。

工作台目前没有鉴权、配额控制或协作冲突处理。任何拿到 URL 的人都能上传和复核文件，所以不要把一个未经配置的部署暴露给敏感材料。

## 开发

跑验证套件：

```bash
cd bioai-deck-auditor/scripts
python3 -m unittest discover -s tests -p 'test_*.py'

cd ../../deck-audit-workbench
npm test
npm run lint
```

工作台使用 Next.js 16 经 vinext 跑在 Cloudflare Workers 上，D1 + Drizzle 存结构化状态，R2 存源 deck 和生成的报告，OpenAI Responses API 做结构化分析，`pptxgenjs` 做紧凑的 PPTX 导出。

## 关于源材料的说明

`outputs/` 里的报告是本仓库作者的独立分析。上方展示的三张源幻灯片图片取自被分析公司的原始材料，仅用于演示复核流程，版权归各自权利人所有。

## 许可

[MIT](./LICENSE)。引用的法规、第三方来源和源 deck 材料的权利归各自权利人所有。
