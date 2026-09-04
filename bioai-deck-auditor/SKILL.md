---
name: bioai-deck-auditor
description: 审计生物科技、创新药、医疗器械、医疗 AI、生理感知、脑机接口和健康 SaaS 的融资材料、BP、pitch deck 与商业计划书。用于投资筛选、技术与临床证据核查、监管路径判断、商业质量分析、风险调整估值和创始人问询；当用户要求评估相关公司、项目、技术可信度、估值合理性或投资价值时使用。
---

# 生物与医疗项目 Deck 审计

把材料拆成可验证宣称，区分材料陈述、外部事实与分析判断。保持批判性，但按证据更新结论；不要预设公司有问题，也不要替材料补全缺失证据。

## 核心产物

围绕同一份宣称台账完成五件事：

1. 提取逐页原子宣称和数字。
2. 做确定性交叉验算。
3. 核实论文、试验、注册、专利和第三方背书。
4. 从技术、临床/监管、商业、团队治理和资本交易五层审计。
5. 在数据允许时做情景估值或 rNPV；数据不足时只揭示隐含假设。

## 第 0 步：确认分析边界

先识别以下维度。材料未说明时标为未知，不要擅自补全：

- **审计时点**：记录 deck 版本日期与分析 `as_of` 日期；晚于 `as_of` 的事件只能算预测/计划，不能写成已完成。
- **法律实体与边界**：品牌、母公司、子公司、融资主体、证照持有人、IP 权利人、生产企业和收入确认主体分别是谁。读取 `references/common/audit-entity-portfolio.md`。
- **产品/管线**：逐产品判断，不给整家公司一个笼统监管类别。
- **预期用途**：消费健康、科研、筛查、诊断、治疗、康复或管理工具。
- **司法辖区**：中国、美国、欧盟或其他目标市场；法规与支付路径分开分析。
- **公司阶段**：概念、样机、临床前、注册中、已获批、商业化或规模化。

## 第 1 步：摄取材料并建立宣称台账

读取 `references/common/claim-ledger.md`。可先用 `scripts/extract_deck.py` 提取 PDF/PPTX 文本、备注、图表值和嵌入媒体清单，再对文字、图表、脚注、图片、二维码、视频封面和演讲者备注逐页检查；必要时渲染页面或 OCR。机器抽取不能替代视觉复核。每条宣称必须保留：页码、原文、类型、法律实体、产品/版本、时间属性、辖区、证据形态和 OCR 置信度。

若需要机器可读中间产物，使用 `references/schemas/claim.schema.json`。不要在提取阶段下判断。

## 第 2 步：分流领域包

按产品加载相关领域包，避免读取无关文件：

| 子领域 | 识别特征 | 必读文件 |
|---|---|---|
| 生物 AI 感知 | rPPG、生理信号、摄像头生命体征、情绪识别 | `references/domains/bioai-sensing/domain-knowledge.md`、`references/domains/bioai-sensing/milestones-valuation.md` |
| 创新药 / TechBio | 靶点、分子、管线、临床试验、AI 制药 | `references/domains/drug/domain-knowledge.md`、`references/domains/drug/milestones-valuation.md` |
| 脑机接口 | EEG、神经解码、神经康复、植入或非侵入 BCI | `references/domains/bci/domain-knowledge.md`、`references/domains/bci/milestones-valuation.md` |
| 医疗器械 / IVD | 硬件、试剂、检验、SaMD | `references/domains/medical-device/domain-knowledge.md`、`references/domains/medical-device/milestones-valuation.md` |
| 医疗信息化 / 健康 SaaS | HIS/EHR、CDS、医院 IT、健康管理 | `references/domains/health-saas/domain-knowledge.md`、`references/domains/health-saas/milestones-valuation.md` |
| 细胞与基因治疗 | CGT、CAR-T、基因编辑、AAV、细胞制品 | `references/domains/cell-gene-therapy/domain-knowledge.md`、`references/domains/cell-gene-therapy/milestones-valuation.md` |
| 合成生物学 | 工程菌、发酵、生物制造、底盘细胞 | `references/domains/synbio/domain-knowledge.md`、`references/domains/synbio/milestones-valuation.md` |
| 生命科学工具 / CRO / CDMO | 科研仪器、试剂、实验服务、研发与生产外包 | `references/domains/life-science-tools/domain-knowledge.md`、`references/domains/life-science-tools/milestones-valuation.md` |
| 数字疗法 | 软件干预、处方数字疗法、行为治疗 | `references/domains/digital-therapeutics/domain-knowledge.md`、`references/domains/digital-therapeutics/milestones-valuation.md` |
| 消费健康 / 医疗美容 | 消费健康设备、检测、医美产品与服务 | `references/domains/consumer-health/domain-knowledge.md`、`references/domains/consumer-health/milestones-valuation.md` |

横跨多个子领域时，另读 `references/common/cross-domain.md`。逐对判断业务是独立、条件依赖还是估值口径错配；不要机械相加，也不要默认“最严路径决定所有业务”，除非产品以整体注册或一条业务确实依赖另一条。

按目标市场另读司法辖区概览：`references/jurisdictions/china.md`、`references/jurisdictions/us.md` 或 `references/jurisdictions/eu.md`。这些文件用于确定该查什么；运行时仍以最新正式法规和主管机构解释为准。

## 第 3 步：证据校准与交叉验算

先读 `references/common/evidence-calibration.md`，再执行：

1. 用 `scripts/cross_check_numbers.py` 核查可结构化数字；无法结构化的图表人工复算。
2. 检查跨页口径、单位、期间、币种、累计/当期和含税/未税差异。
3. 把异常先标为“差异”，核实口径后再判断是笔误、定义差异、管理不严谨或误导。
4. 毛利率、客户集中度、销售周期等只能作为启发式信号；结合收入确认、云成本、渠道、实施和公司阶段解释。

## 第 4 步：外部核实

出现可查锚点时读 `references/common/market-data-verification.md` 和 `references/common/market-intelligence.md`：

- 论文/引用：`scripts/verify_refs.py`
- ClinicalTrials.gov / ChiCTR：`scripts/verify_trials.py`
- 专利候选与人工清单：`scripts/verify_patents.py`
- 中国监管线索：`scripts/cn_reg_sources/`，只能按输出标注的能力边界使用

关键词检索命中只算“候选记录”；只有实体、申办方/申请人、状态、时间和宣称字段逐项一致，才能标 `[已核实·来源]`。查不到不等于不存在。

涉及法规、监管周期、价格政策、获批数量、竞品状态或临床共识时，必须检索当前的一手来源。第三方统计必须披露样本口径、快照日期和可复现来源，不能替代正式分类界定。

## 第 5 步：五层审计

按需读取：

1. **技术与科学**：`references/common/audit-tech-common.md` + 领域知识。
2. **临床、监管与数据合规**：`references/common/audit-regulatory-common.md`；AI 器械可参考 `references/common/empirical-nmpa-ai.md`，但只能把历史分布当先验。
3. **商业与支付**：`references/common/audit-business-common.md`。区分设备/软件公司的收入与医院可收取的医疗服务价格。
4. **团队与治理**：读取 `references/common/audit-team-governance.md`，核查关键人员投入、能力缺口、IP/成果转化、股权、关联交易、融资跑道与里程碑匹配。
5. **资本与交易**：读取 `references/common/audit-capital-common.md`，核查融资真实性、估值口径、可比公司日期/币种、稀释、现金跑道、营运资金和退出约束。

对多产品公司先建立“法律实体—产品 SKU—版本—注册证/许可—适用范围—生产主体—收入”矩阵。注册证存在只核实矩阵中的对应单元，不向其他模块、适应症或关联公司外推。

“合作、覆盖、进院、装机、客户、病例、手术量”统一按商业证据阶梯拆解：线索/科研合作 → 试用 → 合同 → 验收装机 → 回款 → 活跃使用 → 重复采购/续费。不同层级不得合并计数。

已上市器械另查投诉、不良事件、召回、停机率、维保、学习曲线和上市后研究；软硬耗一体化业务另查 BOM、自产/外购、良率、产能、库存、渠道毛利、耗材附着率和单机利用率。

每个重要判断都写出：证据 → 推理 → 影响 → 反证条件 → 下一步核实动作。可靠新证据出现时，无论之前改过多少条，都必须独立更新相应结论。

## 第 6 步：估值桥接

读取 `references/common/bridge-methodology.md` 和相应 `milestones-valuation.md`。

按可用数据选择输出层级：

- **完整 rNPV**：仅在阶段概率、逐期条件现金流、阶段成本和折现口径足够时使用。
- **情景压力测试**：概率稀薄时给悲观/基准/乐观区间，明确假设，不称为精确估值。
- **隐含假设分析**：信息不足时，只说明当前估值要求哪些里程碑、市场份额或成功概率，不输出“高估 N 倍”。

概率调整已经反映的项目特异失败风险，不得再次无解释地塞进高折现率。区分产品失败风险、一般商业风险、融资稀释和时间价值。

## 第 7 步：输出

读取 `references/common/report-template.md`。

默认输出精简版：

1. 一句话判断与置信度。
2. 关键红旗和关键正面证据。
3. 跨层因果链。
4. 估值层级、区间或隐含假设。
5. 最大未知项和前五个创始人问题。

用户要求或材料复杂时输出完整版，并附宣称台账与核实清单。

维护或回归测试本 skill 时，使用 `references/common/evaluation-protocol.md`，同时检查误报与漏报。

## 来源与分级

事实使用四种状态：

- `[据 deck·未核实]`
- `[候选记录·尚未匹配]`
- `[已核实·来源]`
- `[与 deck 矛盾·来源]`
- `[无法核实·已说明尝试]`

红旗严重度与证据置信度分开：🔴/🟠/🟡 表示潜在影响，`高/中/低` 表示证据置信度。缺信息通常是待核实项，不自动等于红旗；只有缺失本身违反披露、法规或阶段常识时才升级。

报告开头声明：所有未标 `[已核实]` 的事实来自材料或尚未完成独立验证。本分析不构成投资、法律、医疗或监管意见。
