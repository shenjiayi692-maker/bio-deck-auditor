export type ReportVerdict = "建议推进" | "有条件推进" | "暂缓" | "不建议推进";
export type Confidence = "高" | "中" | "低";
export type EvidenceStatus = "已核实" | "部分支持" | "冲突" | "未找到";
export type RiskLevel = "高" | "中" | "低";

export type ReportDimension = {
  score: number;
  judgment: string;
  evidence: string[];
  gaps: string[];
};

export type ReportClaim = {
  category: "技术" | "监管" | "市场" | "资本";
  claim: string;
  slideRef: string;
  evidenceStatus: EvidenceStatus;
  evidence: string[];
  implication: string;
  risk: RiskLevel;
};

export type ReportSource = {
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
};

export type ScreeningReport = {
  company: string;
  deckTitle: string;
  sector: string;
  stage: string;
  analysisDate: string;
  verdict: ReportVerdict;
  confidence: Confidence;
  oneLineConclusion: string;
  technical: ReportDimension;
  market: ReportDimension;
  capital: ReportDimension;
  keyClaims: ReportClaim[];
  marketReality: string[];
  capitalReturn: string[];
  diligenceAsks: string[];
  decisionGates: string[];
  sources: ReportSource[];
  limitations: string[];
};

export type ReportJobState =
  | "uploaded"
  | "submitting"
  | "queued"
  | "analyzing"
  | "rendering"
  | "completed"
  | "failed";

export type ReportJobView = {
  id: string;
  filename: string;
  contentType: string;
  state: ReportJobState;
  stage: string;
  progress: number;
  error?: string;
  reportTextUrl?: string;
  reportPptxUrl?: string;
  createdAt: string;
  updatedAt: string;
};
