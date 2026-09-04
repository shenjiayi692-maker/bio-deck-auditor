import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  deleteOpenAIFile,
  getReportAnalysis,
  parseCompletedReport,
  startReportAnalysis,
  uploadDeckToOpenAI,
} from "../../../../lib/reports/openai";
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
  OPENAI_API_KEY?: string;
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
  const { DB: db, DECKS: bucket, OPENAI_API_KEY: apiKey } = resolved.runtime;
  if (!apiKey) {
    return NextResponse.json(
      { error: "分析服务尚未配置，请设置 OPENAI_API_KEY" },
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
    const openaiFileId =
      record.openaiFileId ??
      (await uploadDeckToOpenAI(
        apiKey,
        await object.arrayBuffer(),
        record.analysisFilename,
        record.contentType,
      ));
    const response = await startReportAnalysis(
      apiKey,
      openaiFileId,
      record.filename,
      record.contentType,
    );
    await db
      .prepare(
        `UPDATE deck_reports
         SET state = 'queued', stage = '等待模型分析', progress = 25,
             openai_file_id = ?, response_id = ?, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE deck_id = ?`,
      )
      .bind(openaiFileId, response.id, id)
      .run();
    await db
      .prepare(
        "UPDATE deck_files SET processing_state = 'queued' WHERE id = ?",
      )
      .bind(id)
      .run();
  } catch (error) {
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
  const { DB: db, DECKS: bucket, OPENAI_API_KEY: apiKey } = resolved.runtime;
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
  if (!apiKey || !record.responseId) {
    return NextResponse.json(recordToView(record));
  }

  try {
    const response = await getReportAnalysis(apiKey, record.responseId);
    if (response.status === "queued") {
      await setJobState(db, id, {
        state: "queued",
        stage: "等待模型分析",
        progress: 30,
      });
    } else if (response.status === "in_progress") {
      await setJobState(db, id, {
        state: "analyzing",
        stage: "正在拆解宣称并核查证据",
        progress: 62,
      });
    } else if (response.status === "completed") {
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
        const report = parseCompletedReport(response);
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
        if (record.openaiFileId) {
          await deleteOpenAIFile(apiKey, record.openaiFileId);
        }
      }
    } else {
      const message =
        response.error?.message ??
        response.incomplete_details?.reason ??
        `模型任务状态：${response.status}`;
      await setJobState(db, id, {
        state: "failed",
        stage: "报告生成失败",
        progress: 0,
        error: message,
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
