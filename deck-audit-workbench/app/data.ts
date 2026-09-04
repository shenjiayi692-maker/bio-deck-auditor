export type ReviewStatus =
  | "未审"
  | "已确认"
  | "需澄清"
  | "已修改"
  | "已驳回";

export type EvidenceState =
  | "已核实"
  | "部分支持"
  | "冲突"
  | "候选记录"
  | "未找到";

export type Claim = {
  id: string;
  deckId: string;
  slide: number;
  category: "技术" | "监管" | "市场" | "资本";
  entity: string;
  product: string;
  temporality: "历史事实" | "当前状态" | "未来预测";
  text: string;
  normalized: string;
  severity: "高" | "中" | "低";
  status: ReviewStatus;
  evidenceState: EvidenceState;
  reviewPrompt: string;
  sourceNote: string;
};

export type Deck = {
  id: string;
  shortName: string;
  company: string;
  filename: string;
  domain: string;
  stage: string;
  slideCount: number;
  progress: number;
  riskCount: number;
  image: string;
  reportText: string;
  reportPptx: string;
};

export const decks: Deck[] = [
  {
    id: "liuyedao",
    shortName: "柳叶刀机器人",
    company: "深圳柳叶刀机器人",
    filename: "跨科室国产化手术机器人产业转化平台20260708.pptx",
    domain: "医疗器械 · 手术机器人",
    stage: "商业化",
    slideCount: 21,
    progress: 68,
    riskCount: 7,
    image: "/demo-liuyedao-16.png",
    reportText: "/reports/lancet-robotics-initial-screening.md",
    reportPptx: "/reports/lancet-robotics-initial-screening.pptx",
  },
  {
    id: "shimei",
    shortName: "安徽视美",
    company: "安徽视美智能科技有限公司",
    filename: "视知觉临床超声AI软硬耗一体化解决方案.pptx",
    domain: "医疗 AI · 超声",
    stage: "早期商业化",
    slideCount: 26,
    progress: 54,
    riskCount: 8,
    image: "/demo-shimei-19.png",
    reportText: "/reports/shimei-initial-screening.md",
    reportPptx: "/reports/shimei-initial-screening.pptx",
  },
  {
    id: "shuimu",
    shortName: "水木分子",
    company: "北京水木分子生物科技有限公司",
    filename: "多模态生命科学大模型及智能体驱动药物研发新范式.pptx",
    domain: "TechBio · AI 制药",
    stage: "平台验证",
    slideCount: 12,
    progress: 47,
    riskCount: 6,
    image: "/demo-shuimu-7.png",
    reportText: "/reports/shuimu-molecular-initial-screening.md",
    reportPptx: "/reports/shuimu-molecular-initial-screening.pptx",
  },
];

export const claims: Claim[] = [
  {
    id: "LYD-016-01",
    deckId: "liuyedao",
    slide: 16,
    category: "市场",
    entity: "未明确：深圳/杭州/浙江柳叶刀",
    product: "跨科室手术机器人平台",
    temporality: "当前状态",
    text: "超50家医院已完成试用/装机。",
    normalized: "截至 deck 日期，平台在超过 50 家医院完成试用或装机。",
    severity: "高",
    status: "需澄清",
    evidenceState: "部分支持",
    reviewPrompt:
      "请按试用、合同、出货、安装、验收、回款和活跃使用拆分医院数量，并提供逐台设备台账。",
    sourceNote:
      "同页混用了“试用/装机”，无法判断付费质量；其他页面又出现 30 台出货/装机口径。",
  },
  {
    id: "LYD-016-02",
    deckId: "liuyedao",
    slide: 16,
    category: "市场",
    entity: "未明确：深圳/杭州/浙江柳叶刀",
    product: "跨科室手术机器人平台",
    temporality: "当前状态",
    text: "累计手术量超3000台。",
    normalized: "截至 deck 日期，平台支持的累计手术数量超过 3,000 例。",
    severity: "高",
    status: "未审",
    evidenceState: "候选记录",
    reviewPrompt:
      "提供逐台设备、逐医院、逐术式的月度手术量，以及病例去重和统计截止日期。",
    sourceNote:
      "照片和医生背书只能形成使用线索，不能独立证明累计病例数量。",
  },
  {
    id: "LYD-016-03",
    deckId: "liuyedao",
    slide: 16,
    category: "市场",
    entity: "深圳柳叶刀机器人",
    product: "商业化网络",
    temporality: "当前状态",
    text: "已覆盖国内10余省份及印度等重点国家。",
    normalized: "项目已在中国 10 个以上省份及印度等海外市场开展商业活动。",
    severity: "中",
    status: "未审",
    evidenceState: "候选记录",
    reviewPrompt:
      "按地区提供经销、试用、注册、装机和收入状态；海外业务需同时核验当地准入。",
    sourceNote: "地域覆盖不等于取得注册、形成收入或具备持续服务能力。",
  },
  {
    id: "SM-019-01",
    deckId: "shimei",
    slide: 19,
    category: "市场",
    entity: "安徽视美/北京视知觉待穿透",
    product: "肌骨超声 AI",
    temporality: "当前状态",
    text: "传统超声诊断严重依赖医生个人经验，误诊和漏诊风险较高。",
    normalized: "肌骨超声存在操作者依赖性和一致性挑战。",
    severity: "中",
    status: "未审",
    evidenceState: "部分支持",
    reviewPrompt:
      "要求给出目标部位、临床场景、对照标准和误诊/漏诊基线，避免用泛化痛点替代量化需求。",
    sourceNote: "方向具有临床合理性，但页面未提供具体研究或基线数据。",
  },
  {
    id: "SM-019-02",
    deckId: "shimei",
    slide: 19,
    category: "技术",
    entity: "安徽视美/北京视知觉待穿透",
    product: "肌骨超声 AI",
    temporality: "当前状态",
    text: "AI需在复杂生理条件下实现精准识别、实时追踪与全流程辅助。",
    normalized: "产品目标包括精准识别、实时追踪及流程辅助。",
    severity: "高",
    status: "需澄清",
    evidenceState: "未找到",
    reviewPrompt:
      "提供每项功能的样本量、外部测试集、终点、置信区间、运行延迟和失败案例。",
    sourceNote: "这是能力目标而非已证明结果，不能从产品示意图推断性能。",
  },
  {
    id: "SM-019-03",
    deckId: "shimei",
    slide: 19,
    category: "市场",
    entity: "安徽视美智能科技有限公司",
    product: "肌骨超声 AI",
    temporality: "当前状态",
    text: "行业缺乏标准化扫查和诊断流程，导致结果一致性差。",
    normalized: "目标市场存在标准化和结果一致性不足。",
    severity: "中",
    status: "未审",
    evidenceState: "候选记录",
    reviewPrompt:
      "检索指南和多中心一致性研究，并明确产品究竟改善 acquisition、interpretation 还是两者。",
    sourceNote: "需用指南或多中心研究量化，而不是只依赖 deck 陈述。",
  },
  {
    id: "SMF-007-01",
    deckId: "shuimu",
    slide: 7,
    category: "技术",
    entity: "北京水木分子生物科技有限公司",
    product: "生命科学智能体",
    temporality: "当前状态",
    text: "任务智能体可用于立项决策、药物和蛋白质设计、临床试验及企业私有任务。",
    normalized: "同一智能体平台覆盖从立项到临床试验的多类研发任务。",
    severity: "高",
    status: "需澄清",
    evidenceState: "未找到",
    reviewPrompt:
      "逐任务提供端到端成功率、引用正确率、专家修改时间、失败模式和人工审批边界。",
    sourceNote: "架构覆盖范围不能证明各任务已经达到可用或自治水平。",
  },
  {
    id: "SMF-007-02",
    deckId: "shuimu",
    slide: 7,
    category: "技术",
    entity: "北京水木分子生物科技有限公司",
    product: "多模态生命科学模型",
    temporality: "当前状态",
    text: "模型统一处理文本、视觉、分子、蛋白质和单细胞测序等模态。",
    normalized: "平台具有跨五类生命科学数据模态的处理能力。",
    severity: "中",
    status: "未审",
    evidenceState: "部分支持",
    reviewPrompt:
      "按模态列出模型版本、公开 benchmark、私有评测、数据许可和线上调用量。",
    sourceNote: "部分论文与开源项目支持团队能力，但不自动证明当前商业产品全部能力。",
  },
  {
    id: "SMF-007-03",
    deckId: "shuimu",
    slide: 7,
    category: "市场",
    entity: "北京水木分子生物科技有限公司",
    product: "企业私有知识平台",
    temporality: "当前状态",
    text: "企业私有知识与行业知识共同支撑智能体应用落地。",
    normalized: "平台将行业数据和企业私有数据用于客户工作流。",
    severity: "高",
    status: "未审",
    evidenceState: "候选记录",
    reviewPrompt:
      "核验客户数据隔离、授权范围、模型训练使用权、删除机制、安全审计和切换成本。",
    sourceNote: "这是商业护城河候选，也是数据合规与信息安全风险点。",
  },
];

export const seededEvidence: Record<
  string,
  Array<{
    provider: string;
    title: string;
    identifier: string;
    summary: string;
    sourceUrl: string;
    state: EvidenceState;
    retrievedAt: string;
  }>
> = {
  "LYD-016-01": [
    {
      provider: "Deck 内部交叉检查",
      title: "商业化口径存在混用",
      identifier: "P16 ↔ P20",
      summary:
        "P16 称“超50家医院已完成试用/装机”，P20 称“30台出货/装机”。两者可能同时成立，但需要按商业漏斗拆分。",
      sourceUrl: "#source-slide",
      state: "冲突",
      retrievedAt: "2026-07-17",
    },
    {
      provider: "FDA",
      title: "RobPath Total Hip Application",
      identifier: "K220774",
      summary:
        "FDA 510(k) 记录申请人为 Hangzhou Lancet Robotics。该记录支持特定产品获批，不证明 50 家医院的商业化数量。",
      sourceUrl:
        "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K220774",
      state: "部分支持",
      retrievedAt: "2026-07-17",
    },
  ],
};

export const sourceCatalog = [
  {
    id: "fda",
    label: "FDA 510(k)",
    note: "官方 API · 月度更新",
    tone: "mint",
  },
  {
    id: "pubmed",
    label: "PubMed",
    note: "官方 E-utilities",
    tone: "blue",
  },
  {
    id: "clinicaltrials",
    label: "ClinicalTrials.gov",
    note: "官方 API v2 · 工作日更新",
    tone: "violet",
  },
  {
    id: "nmpa",
    label: "NMPA",
    note: "官方查询入口 · 人工确认",
    tone: "amber",
  },
] as const;
