import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  deleteAnthropicBatch,
  deleteAnthropicFile,
  getReportAnalysis,
  getReportResult,
  parseCompletedReport,
  REPORT_MODEL,
  startReportAnalysis,
  uploadDeckToAnthropic,
} from "../../../../lib/reports/anthropic";
import {
  ensureReportJob,
  ensureReportTables,
  getReportRecord,
  recordToView,
  setJobState,
} from "../../../../lib/reports/store";
import { renderMarkdown, renderPptx } from "../../../../lib/reports/render";

type RuntimeEnv = {
  DB?: D1Database;
  DECKS?: R2Bucket;
  ANTHROPIC_API_KEY?: string;
};

type RouteContext = { params: Promise<{ id: string }> };

function runtimeOrResponse() {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB || !runtime.DECKS) {
    return {
      error: NextResponse.json(
        { error: "报告存储尚未绑定" },
        { status: 503 },
      ),
    };
  }
  return { runtime: runtime as Required<Pick<RuntimeEnv, "DB" | "DECKS">> & RuntimeEnv };
}

export async function POST(_request: Request, context: RouteContext) {
  const resolved = runtimeOrResponse();
  if ("error" in resolved) return resolved.error;
  const { DB: db, DECKS: bucket, ANTHROPIC_API_KEY: apiKey } = resolved.runtime;
  if (!apiKey) {
    return NextResponse.json(
      { error: "分析服务尚未配置，请设置 ANTHROPIC_API_KEY" },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  await ensureReportTables(db);
  await ensureReportJob(db, id);
  let record = await getReportRecord(db, id);
  if (!record) {
    return NextResponse.json({ error: "未找到上传文件" }, { status: 404 });
  }
  if (
    record.state === "queued" ||
    record.state === "analyzing" ||
    record.state === "rendering" ||
    record.state === "completed"
  ) {
    return NextResponse.json(recordToView(record));
  }

  await setJobState(db, id, {
    state: "submitting",
    stage: "正在提交分析任务",
    progress: 12,
  });

  try {
    const object = await bucket.get(record.objectKey);
    if (!object) throw new Error("原始 Deck 文件不存在");
    let providerFileId = record.providerFileId;
    if (!providerFileId) {
      providerFileId = await uploadDeckToAnthropic(
        apiKey,
        await object.arrayBuffer(),
        record.analysisFilename,
        record.contentType,
      );
      await db
        .prepare(
          `UPDATE deck_reports
           SET provider = 'anthropic', model = ?, provider_file_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE deck_id = ?`,
        )
        .bind(REPORT_MODEL, providerFileId, id)
        .run();
    }
    const batch = await startReportAnalysis(
      apiKey,
      providerFileId,
      id,
      record.filename,
      record.contentType,
    );
    await db
      .prepare(
        `UPDATE deck_reports
         SET state = 'queued', stage = '等待模型分析', progress = 25,
             provider = 'anthropic', model = ?, provider_file_id = ?,
             provider_job_id = ?, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE deck_id = ?`,
      )
      .bind(REPORT_MODEL, providerFileId, batch.id, id)
      .run();
    await db
      .prepare(
        "UPDATE deck_files SET processing_state = 'queued' WHERE id = ?",
      )
      .bind(id)
      .run();
  } catch (error) {
    const latest = await getReportRecord(db, id);
    if (latest?.providerFileId && !latest.providerJobId) {
      await deleteAnthropicFile(apiKey, latest.providerFileId);
      await db
        .prepare(
          `UPDATE deck_reports
           SET provider_file_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE deck_id = ?`,
        )
        .bind(id)
        .run();
    }
    const message = error instanceof Error ? error.message : "提交分析任务失败";
    await setJobState(db, id, {
      state: "failed",
      stage: "分析任务启动失败",
      progress: 0,
      error: message,
    });
  }

  record = await getReportRecord(db, id);
  return NextResponse.json(record ? recordToView(record) : { id });
}

export async function GET(_request: Request, context: RouteContext) {
  const resolved = runtimeOrResponse();
  if ("error" in resolved) return resolved.error;
  const { DB: db, DECKS: bucket, ANTHROPIC_API_KEY: apiKey } = resolved.runtime;
  const { id } = await context.params;
  await ensureReportTables(db);
  await ensureReportJob(db, id);
  let record = await getReportRecord(db, id);
  if (!record) {
    return NextResponse.json({ error: "未找到报告任务" }, { status: 404 });
  }
  if (
    record.state === "uploaded" ||
    record.state === "submitting" ||
    record.state === "completed" ||
    record.state === "failed" ||
    record.state === "rendering"
  ) {
    return NextResponse.json(recordToView(record));
  }
  if (!apiKey || !record.providerJobId) {
    return NextResponse.json(recordToView(record));
  }

  try {
    const batch = await getReportAnalysis(apiKey, record.providerJobId);
    if (batch.processing_status === "in_progress") {
      const processing = batch.request_counts?.processing ?? 0;
      await setJobState(db, id, {
        state: processing > 0 ? "analyzing" : "queued",
        stage:
          processing > 0 ? "正在拆解宣称并核查证据" : "等待模型分析",
        progress: processing > 0 ? 62 : 30,
      });
    } else if (batch.processing_status === "ended") {
      if ((batch.request_counts?.succeeded ?? 0) < 1) {
        const failedState = batch.request_counts?.errored
          ? "模型分析发生错误"
          : batch.request_counts?.expired
            ? "模型分析任务已过期"
            : "模型分析任务未成功完成";
        throw new Error(failedState);
      }
      const claim = await db
        .prepare(
          `UPDATE deck_reports
           SET state = 'rendering', stage = '正在生成双报告', progress = 86,
               updated_at = CURRENT_TIMESTAMP
           WHERE deck_id = ? AND state IN ('queued', 'analyzing')`,
        )
        .bind(id)
        .run();
      if ((claim.meta.changes ?? 0) > 0) {
        const result = await getReportResult(apiKey, record.providerJobId, id);
        const report = parseCompletedReport(result);
        const markdown = renderMarkdown(report);
        const pptx = await renderPptx(report);
        const baseKey = `reports/${id}`;
        const jsonKey = `${baseKey}/report.json`;
        const markdownKey = `${baseKey}/screening-report.md`;
        const pptxKey = `${baseKey}/screening-report.pptx`;
        await Promise.all([
          bucket.put(jsonKey, JSON.stringify(report, null, 2), {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
          }),
          bucket.put(markdownKey, markdown, {
            httpMetadata: { contentType: "text/markdown; charset=utf-8" },
          }),
          bucket.put(pptxKey, pptx, {
            httpMetadata: {
              contentType:
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            },
          }),
        ]);
        await db
          .prepare(
            `UPDATE deck_reports
             SET state = 'completed', stage = '报告已生成', progress = 100,
                 report_json_key = ?, markdown_key = ?, pptx_key = ?,
                 error_message = NULL, completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE deck_id = ?`,
          )
          .bind(jsonKey, markdownKey, pptxKey, id)
          .run();
        await db
          .prepare(
            "UPDATE deck_files SET processing_state = 'completed' WHERE id = ?",
          )
          .bind(id)
          .run();
        await Promise.all([
          record.providerFileId
            ? deleteAnthropicFile(apiKey, record.providerFileId)
            : Promise.resolve(),
          deleteAnthropicBatch(apiKey, record.providerJobId),
        ]);
        await db
          .prepare(
            `UPDATE deck_reports
             SET provider_file_id = NULL, provider_job_id = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE deck_id = ?`,
          )
          .bind(id)
          .run();
      }
    } else if (batch.processing_status === "canceling") {
      await setJobState(db, id, {
        state: "failed",
        stage: "分析任务已取消",
        progress: 0,
        error: "Anthropic 正在取消该任务，请稍后重试",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "报告生成失败";
    await setJobState(db, id, {
      state: "failed",
      stage: "报告生成失败",
      progress: 0,
      error: message,
    });
  }

  record = await getReportRecord(db, id);
  return NextResponse.json(recordToView(record!));
}
