import { NextRequest, NextResponse } from "next/server";

type Evidence = {
  provider: string;
  title: string;
  identifier: string;
  summary: string;
  sourceUrl: string;
  state: "已核实" | "部分支持" | "冲突" | "候选记录" | "未找到";
  retrievedAt: string;
};

const allowedProviders = new Set([
  "fda",
  "pubmed",
  "clinicaltrials",
  "nmpa",
]);

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") ?? "";
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (!allowedProviders.has(provider) || !query) {
    return NextResponse.json(
      { error: "请选择来源并输入检索词" },
      { status: 400 },
    );
  }

  try {
    const results =
      provider === "fda"
        ? await searchFda(query)
        : provider === "pubmed"
          ? await searchPubMed(query)
          : provider === "clinicaltrials"
            ? await searchClinicalTrials(query)
            : searchNmpa(query);
    return NextResponse.json({
      provider,
      query,
      retrievedAt: new Date().toISOString(),
      results,
      disclaimer:
        "检索命中默认仅为候选记录；需核对实体、产品、状态、时间和宣称字段后才能标记为已核实。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "数据源查询失败",
      },
      { status: 502 },
    );
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`官方数据源返回 ${response.status}`);
  }
  return (await response.json()) as T;
}

async function searchFda(query: string): Promise<Evidence[]> {
  const exactK = query.toUpperCase().match(/\bK\d{6}\b/)?.[0];
  const search = exactK
    ? `k_number:"${exactK}"`
    : `(device_name:"${escapeOpenFda(query)}"+OR+applicant:"${escapeOpenFda(query)}")`;
  const params = new URLSearchParams({ search, limit: "8" });
  const payload = await fetchJson<{
    results?: Array<{
      k_number?: string;
      device_name?: string;
      applicant?: string;
      decision_date?: string;
      decision_code?: string;
      product_code?: string;
    }>;
  }>(`https://api.fda.gov/device/510k.json?${params}`);

  return (payload.results ?? []).map((row) => ({
    provider: "FDA openFDA",
    title: row.device_name || "未命名 510(k) 记录",
    identifier: row.k_number || "无 K 号",
    summary: [
      row.applicant ? `申请人：${row.applicant}` : "",
      row.decision_date ? `决定日期：${row.decision_date}` : "",
      row.decision_code ? `决定代码：${row.decision_code}` : "",
      row.product_code ? `产品代码：${row.product_code}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    sourceUrl: row.k_number
      ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${row.k_number}`
      : "https://open.fda.gov/apis/device/510k/",
    state: exactK && row.k_number === exactK ? "候选记录" : "候选记录",
    retrievedAt: today(),
  }));
}

function escapeOpenFda(value: string) {
  return value.replace(/["\\]/g, " ").trim();
}

async function searchPubMed(query: string): Promise<Evidence[]> {
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: "8",
    tool: "biolens_deck_auditor",
  });
  const search = await fetchJson<{
    esearchresult?: { idlist?: string[] };
  }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`,
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (!ids.length) return [];

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    tool: "biolens_deck_auditor",
  });
  const summary = await fetchJson<{
    result?: Record<
      string,
      {
        uid?: string;
        title?: string;
        fulljournalname?: string;
        pubdate?: string;
        authors?: Array<{ name?: string }>;
      }
    >;
  }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`,
  );

  return ids
    .map((id) => summary.result?.[id])
    .filter(Boolean)
    .map((row) => ({
      provider: "PubMed",
      title: row?.title || "未命名论文",
      identifier: `PMID ${row?.uid ?? ""}`,
      summary: [
        row?.fulljournalname,
        row?.pubdate,
        row?.authors?.slice(0, 3).map((author) => author.name).join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${row?.uid}/`,
      state: "候选记录" as const,
      retrievedAt: today(),
    }));
}

async function searchClinicalTrials(query: string): Promise<Evidence[]> {
  const params = new URLSearchParams({
    "query.term": query,
    pageSize: "8",
    format: "json",
    fields:
      "NCTId,BriefTitle,OverallStatus,LeadSponsorName,Phase,StudyType,StartDate",
  });
  const payload = await fetchJson<{
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string };
        statusModule?: {
          overallStatus?: string;
          startDateStruct?: { date?: string };
        };
        sponsorCollaboratorsModule?: {
          leadSponsor?: { name?: string };
        };
        designModule?: { phases?: string[]; studyType?: string };
      };
    }>;
  }>(`https://clinicaltrials.gov/api/v2/studies?${params}`);

  return (payload.studies ?? []).map((study) => {
    const protocol = study.protocolSection;
    const identification = protocol?.identificationModule;
    const status = protocol?.statusModule;
    const design = protocol?.designModule;
    const nctId = identification?.nctId ?? "无 NCT 号";
    return {
      provider: "ClinicalTrials.gov",
      title: identification?.briefTitle ?? "未命名临床试验",
      identifier: nctId,
      summary: [
        status?.overallStatus
          ? `状态：${status.overallStatus}`
          : "",
        protocol?.sponsorCollaboratorsModule?.leadSponsor?.name
          ? `申办方：${protocol.sponsorCollaboratorsModule.leadSponsor.name}`
          : "",
        design?.phases?.length ? `阶段：${design.phases.join("/")}` : "",
        status?.startDateStruct?.date
          ? `开始：${status.startDateStruct.date}`
          : "",
      ]
        .filter(Boolean)
        .join("；"),
      sourceUrl: nctId.startsWith("NCT")
        ? `https://clinicaltrials.gov/study/${nctId}`
        : "https://clinicaltrials.gov/",
      state: "候选记录" as const,
      retrievedAt: today(),
    };
  });
}

function searchNmpa(query: string): Evidence[] {
  return [
    {
      provider: "NMPA 政务服务",
      title: "境内医疗器械（注册）官方查询入口",
      identifier: query,
      summary:
        "NMPA 暂无稳定、公开且适合在线逐条调用的注册证 API。本工作台保留检索词、审计时间和官方入口，结果必须由分析师在官方页面核对注册人、产品、型号、预期用途和状态后确认。",
      sourceUrl: "https://www.nmpa.gov.cn/zwfwqjd/index.html?type=pc",
      state: "候选记录",
      retrievedAt: today(),
    },
    {
      provider: "NMPA UDI",
      title: "医疗器械唯一标识数据库发布文件",
      identifier: "UDI 数据快照",
      summary:
        "可用于补充产品标识和发布快照，但 UDI 命中不能替代医疗器械注册证核验。",
      sourceUrl: "https://udi.nmpa.gov.cn/download.html",
      state: "部分支持",
      retrievedAt: today(),
    },
  ];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
