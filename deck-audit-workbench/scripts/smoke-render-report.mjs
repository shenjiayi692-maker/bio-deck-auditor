import { writeFile } from "node:fs/promises";
import { renderPptx } from "../lib/reports/render.ts";

const output = process.argv[2];
if (!output) throw new Error("Pass an output .pptx path");

const dimension = (score, judgment) => ({
  score,
  judgment,
  evidence: [
    "Deck 披露了内部回顾性验证，但没有独立外部验证",
    "公开检索未找到与该产品完全匹配的注册或前瞻性临床记录",
  ],
  gaps: ["缺少锁库数据、统计分析计划和逐中心表现"],
});

const report = {
  company: "NovaCell Therapeutics（合成测试公司）",
  deckTitle: "Synthetic Bio/MedTech Investment Deck",
  sector: "诊断 AI",
  stage: "临床验证前",
  analysisDate: "2026-07-24",
  verdict: "暂缓",
  confidence: "中",
  oneLineConclusion:
    "内部结果形成技术线索，但外部验证、监管路径和商业付费证据均不足以支持进入投资条款讨论。",
  technical: dimension(48, "模型性能尚未被独立、前瞻性数据验证"),
  market: dimension(42, "试点不能证明付费需求和规模化部署能力"),
  capital: dimension(35, "融资用途明确，但价值里程碑与退出路径不清晰"),
  keyClaims: [
    {
      category: "技术",
      claim: "内部回顾性样本中预测准确率达到 92%",
      slideRef: "P2",
      evidenceStatus: "部分支持",
      evidence: ["Deck 披露样本量 180，但未提供混淆矩阵与置信区间"],
      implication: "若外部队列性能显著回落，产品差异化和注册策略均需重估",
      risk: "高",
    },
    {
      category: "监管",
      claim: "计划在下一轮融资后启动注册准备",
      slideRef: "P3",
      evidenceStatus: "未找到",
      evidence: [],
      implication: "尚未形成可审计的产品分类、临床评价和注册时间表",
      risk: "高",
    },
    {
      category: "市场",
      claim: "已经与三家机构开展试点",
      slideRef: "P3",
      evidenceStatus: "未找到",
      evidence: [],
      implication: "试点口径无法证明合同、回款、使用频率或续约意愿",
      risk: "中",
    },
    {
      category: "资本",
      claim: "拟融资人民币三千万元完成前瞻性研究",
      slideRef: "P3",
      evidenceStatus: "部分支持",
      evidence: ["Deck 披露融资额和大致用途"],
      implication: "必须把资金消耗与可验证的技术、监管和商业里程碑绑定",
      risk: "中",
    },
  ],
  marketReality: [
    "宏观市场规模不能替代明确的科室预算、采购路径和单院经济模型",
    "三家试点需拆分为免费测试、付费合同、部署和活跃使用",
    "缺少竞品性能、价格、注册状态与渠道能力的同口径比较",
  ],
  capitalReturn: [
    "融资前估值、稀释比例和后续轮次资金需求未披露",
    "下一价值拐点应是外部验证与注册路径确认，而不是继续扩大内部数据",
    "退出依赖商业规模或战略收购，但目前没有可量化的触发条件",
  ],
  diligenceAsks: [
    "锁库测试集、统计分析计划、混淆矩阵与分层表现",
    "逐中心外部验证计划及主要终点",
    "产品分类、预期用途和监管沟通纪要",
    "三家试点的合同、回款和月度活跃使用数据",
    "竞品同口径性能、定价与注册状态",
    "融资后 24 个月预算和里程碑付款计划",
    "现有股权结构及下一轮稀释情景",
    "核心数据、模型与软件代码的知识产权归属",
  ],
  decisionGates: [
    "完成至少一个独立外部队列验证，主要指标达到预设阈值",
    "监管顾问或主管部门确认产品分类和临床评价路径",
    "至少一家机构形成可核验的付费与持续使用记录",
    "本轮资金可覆盖到下一可融资里程碑并保留六个月缓冲",
  ],
  sources: [],
  limitations: [
    "这是合成测试数据，不代表真实公司",
    "PPTX 文件输入只抽取文字，未核查嵌入图表与图片",
  ],
};

await writeFile(output, new Uint8Array(await renderPptx(report)));
