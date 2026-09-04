"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReportJobView } from "../lib/reports/types";
import {
  Claim,
  EvidenceState,
  ReviewStatus,
  claims as initialClaims,
  decks as initialDecks,
  seededEvidence,
  sourceCatalog,
} from "./data";

type ApiEvidence = {
  provider: string;
  title: string;
  identifier: string;
  summary: string;
  sourceUrl: string;
  state: EvidenceState;
  retrievedAt: string;
};

const statusOptions: ReviewStatus[] = [
  "未审",
  "已确认",
  "需澄清",
  "已修改",
  "已驳回",
];

const MODEL_FILE_LIMIT = 48 * 1024 * 1024;
const CLIENT_PPTX_LIMIT = 500 * 1024 * 1024;

async function prepareDeckUpload(file: File) {
  if (file.size <= MODEL_FILE_LIMIT) {
    return { analysisFile: file, clientExtracted: false };
  }
  if (!/\.pptx$/i.test(file.name)) {
    throw new Error("PDF 超过 48MB，请压缩后再上传");
  }
  if (file.size > CLIENT_PPTX_LIMIT) {
    throw new Error("PPTX 超过 500MB，请先压缩媒体文件");
  }

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftPage = Number(left.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const rightPage = Number(right.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return leftPage - rightPage;
    });
  if (!slideEntries.length) throw new Error("无法读取 PPTX 页面结构");

  const pages: string[] = [];
  for (const entry of slideEntries) {
    const xml = await zip.file(entry)?.async("text");
    if (!xml) continue;
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const text = Array.from(document.getElementsByTagName("a:t"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const page = Number(entry.match(/slide(\d+)\.xml/i)?.[1] ?? pages.length + 1);
    pages.push(`[Slide ${page}]\n${text || "（本页无可提取文字）"}`);
  }
  const stem = file.name.replace(/\.pptx$/i, "");
  return {
    analysisFile: new File([pages.join("\n\n")], `${stem}-slides.txt`, {
      type: "text/plain",
    }),
    clientExtracted: true,
  };
}

const statusCounts = initialClaims.reduce<Record<string, number>>(
  (counts, claim) => {
    counts[claim.status] = (counts[claim.status] ?? 0) + 1;
    return counts;
  },
  {},
);

export function Workbench() {
  const [deckId, setDeckId] = useState(initialDecks[0].id);
  const [claimId, setClaimId] = useState(initialClaims[0].id);
  const [claimRows, setClaimRows] = useState(initialClaims);
  const [filter, setFilter] = useState<"全部" | ReviewStatus>("全部");
  const [note, setNote] = useState(initialClaims[0].reviewPrompt);
  const [saveState, setSaveState] = useState("");
  const [provider, setProvider] =
    useState<(typeof sourceCatalog)[number]["id"]>("fda");
  const [query, setQuery] = useState("K220774");
  const [searchState, setSearchState] = useState("");
  const [dynamicEvidence, setDynamicEvidence] = useState<
    Record<string, ApiEvidence[]>
  >({});
  const [uploads, setUploads] = useState<ReportJobView[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);

  const deck = initialDecks.find((row) => row.id === deckId)!;
  const deckClaims = useMemo(
    () =>
      claimRows.filter(
        (claim) =>
          claim.deckId === deckId &&
          (filter === "全部" || claim.status === filter),
      ),
    [claimRows, deckId, filter],
  );
  const selectedClaim =
    claimRows.find((claim) => claim.id === claimId) ??
    claimRows.find((claim) => claim.deckId === deckId)!;
  const currentEvidence = [
    ...(seededEvidence[selectedClaim.id] ?? []),
    ...(dynamicEvidence[selectedClaim.id] ?? []),
  ];
  const activeUploadKey = useMemo(
    () =>
      uploads
        .filter((item) =>
          ["submitting", "queued", "analyzing", "rendering"].includes(
            item.state,
          ),
        )
        .map((item) => item.id)
        .sort()
        .join(","),
    [uploads],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/uploads")
      .then(
        async (response) =>
          (await response.json()) as { items?: ReportJobView[] },
      )
      .then((payload) => {
        if (!cancelled) setUploads(payload.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeUploadKey) return;
    const activeUploadIds = activeUploadKey.split(",");
    const poll = async () => {
      const results = await Promise.all(
        activeUploadIds.map(async (id) => {
          try {
            const response = await fetch(`/api/reports/${id}`, {
              cache: "no-store",
            });
            if (!response.ok) return null;
            return (await response.json()) as ReportJobView;
          } catch {
            return null;
          }
        }),
      );
      setUploads((items) =>
        items.map(
          (item) =>
            results.find((result) => result?.id === item.id) ?? item,
        ),
      );
    };
    void poll();
    const interval = window.setInterval(poll, 5_000);
    return () => window.clearInterval(interval);
  }, [activeUploadKey]);

  function chooseDeck(nextDeckId: string) {
    setDeckId(nextDeckId);
    const nextClaim = claimRows.find((claim) => claim.deckId === nextDeckId);
    if (nextClaim) {
      setClaimId(nextClaim.id);
      setNote(nextClaim.reviewPrompt);
    }
  }

  function chooseClaim(claim: Claim) {
    setClaimId(claim.id);
    setNote(claim.reviewPrompt);
    setSaveState("");
  }

  async function saveReview(status: ReviewStatus) {
    setClaimRows((rows) =>
      rows.map((row) => (row.id === selectedClaim.id ? { ...row, status } : row)),
    );
    setSaveState("正在保存…");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimId: selectedClaim.id,
          status,
          note,
          reviewer: "当前分析师",
        }),
      });
      const result = (await response.json()) as { persisted?: boolean };
      setSaveState(result.persisted ? "已保存并留痕" : "本地预览已更新");
    } catch {
      setSaveState("本地预览已更新");
    }
  }

  async function searchEvidence(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearchState("正在查询一手来源…");
    try {
      const params = new URLSearchParams({ provider, query: query.trim() });
      const response = await fetch(`/api/evidence/search?${params}`);
      const payload = (await response.json()) as {
        results?: ApiEvidence[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      const results = payload.results ?? [];
      setDynamicEvidence((current) => ({
        ...current,
        [selectedClaim.id]: [
          ...(current[selectedClaim.id] ?? []),
          ...results,
        ],
      }));
      setSearchState(
        results.length ? `找到 ${results.length} 条候选记录` : "未找到候选记录",
      );
    } catch {
      setSearchState("数据源暂时不可用，请稍后重试或进入官方查询");
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const tempId = crypto.randomUUID();
    setUploads((items) => [
      ...items,
      {
        id: tempId,
        filename: file.name,
        contentType: file.type,
        state: "submitting",
        stage:
          file.size > MODEL_FILE_LIMIT && /\.pptx$/i.test(file.name)
            ? "正在本地提取逐页文字"
            : "正在上传文件",
        progress: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    try {
      const prepared = await prepareDeckUpload(file);
      const body = new FormData();
      body.set("file", prepared.analysisFile);
      body.set("originalFilename", file.name);
      body.set("clientExtracted", String(prepared.clientExtracted));
      const response = await fetch("/api/uploads", { method: "POST", body });
      const result = (await response.json()) as ReportJobView & {
        error?: string;
      };
      if (!response.ok || !result.id) throw new Error(result.error);
      setUploads((items) =>
        items.map((item) => (item.id === tempId ? result : item)),
      );
      await startReport(result.id);
    } catch (error) {
      setUploads((items) =>
        items.map((item) =>
          item.id === tempId
            ? {
                ...item,
                state: "failed",
                stage: "上传失败",
                progress: 0,
                error:
                  error instanceof Error ? error.message : "无法处理上传文件",
              }
            : item,
        ),
      );
    } finally {
      event.target.value = "";
    }
  }

  async function startReport(id: string) {
    setUploads((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              state: "submitting",
              stage: "正在提交分析任务",
              progress: 12,
              error: undefined,
            }
          : item,
      ),
    );
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "POST" });
      const result = (await response.json()) as ReportJobView & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error);
      setUploads((items) =>
        items.map((item) => (item.id === id ? result : item)),
      );
    } catch (error) {
      setUploads((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                state: "failed",
                stage: "任务启动失败",
                progress: 0,
                error:
                  error instanceof Error
                    ? error.message
                    : "无法启动分析任务",
              }
            : item,
        ),
      );
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <div>
            <strong>BioLens</strong>
            <span>Deck 证据工作台</span>
          </div>
        </div>
        <div className="topbar-center">
          <span className="system-dot" />
          证据源在线 · 审计时点 2026-07-23
        </div>
        <div className="topbar-actions">
          <a
            className="ghost-button report-download"
            href={deck.reportText}
            download
          >
            文字报告
          </a>
          <a
            className="ghost-button report-download"
            href={deck.reportPptx}
            download
          >
            简版 PPT
          </a>
          <button
            className="primary-button"
            type="button"
            onClick={() => uploadRef.current?.click()}
          >
            ＋ 上传 Deck
          </button>
          <input
            ref={uploadRef}
            className="visually-hidden"
            type="file"
            accept=".pptx,.pdf"
            onChange={handleUpload}
            aria-label="上传 PPTX 或 PDF"
          />
          <span className="avatar">JS</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="deck-sidebar">
          <div className="sidebar-title">
            <div>
              <span className="eyebrow">当前项目</span>
              <h1>投资初筛队列</h1>
            </div>
            <span className="count-badge">{initialDecks.length + uploads.length}</span>
          </div>

          <div className="deck-list">
            {initialDecks.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`deck-card ${deckId === item.id ? "active" : ""}`}
                onClick={() => chooseDeck(item.id)}
              >
                <span className="deck-card-top">
                  <span className="deck-icon">{item.shortName.slice(0, 1)}</span>
                  <span>
                    <strong>{item.shortName}</strong>
                    <small>{item.domain}</small>
                  </span>
                </span>
                <span className="deck-meta">
                  <span>{item.slideCount} 页</span>
                  <span>{item.stage}</span>
                  <span className="risk-copy">{item.riskCount} 项风险</span>
                </span>
                <span className="progress-track">
                  <span style={{ width: `${item.progress}%` }} />
                </span>
              </button>
            ))}
            {uploads.map((item) => (
              <div className="deck-card upload-card" key={item.id}>
                <span className="deck-card-top">
                  <span className="deck-icon">新</span>
                  <span>
                    <strong>{item.filename}</strong>
                    <small>{item.stage}</small>
                  </span>
                </span>
                <span className="progress-track upload-progress">
                  <span style={{ width: `${item.progress}%` }} />
                </span>
                {item.error ? (
                  <span className="upload-error">{item.error}</span>
                ) : null}
                {item.state === "completed" ? (
                  <span className="upload-actions">
                    <a href={item.reportTextUrl} download>
                      文字报告
                    </a>
                    <a href={item.reportPptxUrl} download>
                      简版 PPT
                    </a>
                  </span>
                ) : null}
                {item.state === "failed" ? (
                  <button
                    className="retry-button"
                    type="button"
                    onClick={() => startReport(item.id)}
                  >
                    重新生成
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <p className="upload-note">
            PDF 可同时核查文字、图表和页面视觉；大 PPTX 会在本地抽取逐页文字后上传，
            原文件不离开浏览器。
          </p>

          <div className="source-health">
            <span className="eyebrow">数据源状态</span>
            {sourceCatalog.map((source) => (
              <div className="source-health-row" key={source.id}>
                <span className={`source-pip ${source.tone}`} />
                <span>
                  <strong>{source.label}</strong>
                  <small>{source.note}</small>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="main-stage">
          <div className="deck-header">
            <div>
              <div className="breadcrumb">
                初筛队列 <span>/</span> {deck.shortName}
              </div>
              <h2>{deck.company}</h2>
              <p>{deck.filename}</p>
            </div>
            <div className="deck-score">
              <span>审阅进度</span>
              <strong>{deck.progress}%</strong>
              <div className="progress-track large">
                <span style={{ width: `${deck.progress}%` }} />
              </div>
            </div>
          </div>

          <div className="review-grid">
            <section className="slide-pane" id="source-slide">
              <div className="pane-heading">
                <div>
                  <span className="eyebrow">原始材料</span>
                  <h3>来源页 · P{selectedClaim.slide}</h3>
                </div>
                <span className="zoom-chip">适配窗口</span>
              </div>
              <div className="slide-frame">
                <Image
                  src={deck.image}
                  alt={`${deck.shortName} 原始 Deck 来源页`}
                  width={1600}
                  height={900}
                  priority
                />
                <span className="source-anchor">
                  已定位宣称 · {selectedClaim.id}
                </span>
              </div>
              <div className="slide-footer">
                <span>文字、图片与版式均来自原始材料</span>
                <span>P{selectedClaim.slide} / {deck.slideCount}</span>
              </div>
            </section>

            <section className="claims-pane">
              <div className="pane-heading stacked">
                <div>
                  <span className="eyebrow">宣称台账</span>
                  <h3>{claimRows.filter((row) => row.deckId === deckId).length} 条原子宣称</h3>
                </div>
                <div className="filter-row">
                  {(["全部", ...statusOptions] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={filter === item ? "filter-chip active" : "filter-chip"}
                      onClick={() => setFilter(item)}
                    >
                      {item}
                      {item !== "全部" && statusCounts[item] ? (
                        <span>{statusCounts[item]}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="claim-list">
                {deckClaims.map((claim) => (
                  <button
                    type="button"
                    className={`claim-card ${selectedClaim.id === claim.id ? "active" : ""}`}
                    key={claim.id}
                    onClick={() => chooseClaim(claim)}
                  >
                    <span className="claim-topline">
                      <span className={`category category-${claim.category}`}>
                        {claim.category}
                      </span>
                      <span className={`evidence-state state-${claim.evidenceState}`}>
                        {claim.evidenceState}
                      </span>
                    </span>
                    <strong>{claim.text}</strong>
                    <span className="claim-footer">
                      <span>P{claim.slide} · {claim.temporality}</span>
                      <span className={`severity severity-${claim.severity}`}>
                        {claim.severity}风险
                      </span>
                    </span>
                  </button>
                ))}
                {!deckClaims.length ? (
                  <div className="empty-state">当前筛选下没有宣称。</div>
                ) : null}
              </div>
            </section>

            <section className="evidence-pane">
              <div className="pane-heading">
                <div>
                  <span className="eyebrow">证据与复核</span>
                  <h3>{selectedClaim.id}</h3>
                </div>
                <span className={`severity severity-${selectedClaim.severity}`}>
                  {selectedClaim.severity}风险
                </span>
              </div>

              <div className="claim-detail">
                <span className="detail-label">归一化宣称</span>
                <p>{selectedClaim.normalized}</p>
                <dl>
                  <div>
                    <dt>法律实体</dt>
                    <dd>{selectedClaim.entity}</dd>
                  </div>
                  <div>
                    <dt>产品/范围</dt>
                    <dd>{selectedClaim.product}</dd>
                  </div>
                  <div>
                    <dt>时间属性</dt>
                    <dd>{selectedClaim.temporality}</dd>
                  </div>
                </dl>
              </div>

              <div className="evidence-section">
                <div className="section-title">
                  <span>已关联证据</span>
                  <small>{currentEvidence.length} 条</small>
                </div>
                <div className="evidence-list">
                  {currentEvidence.map((item, index) => (
                    <article
                      className="evidence-card"
                      key={`${item.identifier}-${index}`}
                    >
                      <div className="evidence-card-top">
                        <span className="provider">{item.provider}</span>
                        <span className={`evidence-state state-${item.state}`}>
                          {item.state}
                        </span>
                      </div>
                      <a
                        href={item.sourceUrl}
                        target={item.sourceUrl.startsWith("http") ? "_blank" : undefined}
                        rel="noreferrer"
                      >
                        {item.title}
                      </a>
                      <small>{item.identifier} · 抓取于 {item.retrievedAt}</small>
                      <p>{item.summary}</p>
                    </article>
                  ))}
                  {!currentEvidence.length ? (
                    <div className="empty-state compact">
                      尚未关联证据。可从下方一手来源检索候选记录。
                    </div>
                  ) : null}
                </div>
              </div>

              <form className="source-search" onSubmit={searchEvidence}>
                <div className="section-title">
                  <span>查询一手来源</span>
                  <small>结果默认仅为候选</small>
                </div>
                <div className="search-controls">
                  <select
                    value={provider}
                    onChange={(event) =>
                      setProvider(
                        event.target.value as (typeof sourceCatalog)[number]["id"],
                      )
                    }
                    aria-label="证据来源"
                  >
                    {sourceCatalog.map((source) => (
                      <option value={source.id} key={source.id}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="证号、NCT、PMID、产品或公司"
                    aria-label="证据搜索词"
                  />
                  <button type="submit">检索</button>
                </div>
                {searchState ? <p className="search-state">{searchState}</p> : null}
              </form>

              <div className="review-box">
                <div className="section-title">
                  <span>分析师决定</span>
                  <small>{selectedClaim.status}</small>
                </div>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  aria-label="复核意见"
                  rows={3}
                />
                <div className="review-actions">
                  <button
                    type="button"
                    className="confirm-button"
                    onClick={() => saveReview("已确认")}
                  >
                    ✓ 确认证据
                  </button>
                  <button
                    type="button"
                    className="clarify-button"
                    onClick={() => saveReview("需澄清")}
                  >
                    ? 索取材料
                  </button>
                  <button
                    type="button"
                    className="reject-button"
                    onClick={() => saveReview("已驳回")}
                  >
                    × 驳回宣称
                  </button>
                </div>
                <p className="save-state">{saveState || selectedClaim.sourceNote}</p>
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
