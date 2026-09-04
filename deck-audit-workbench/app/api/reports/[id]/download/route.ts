import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureReportTables,
  getReportRecord,
} from "../../../../../lib/reports/store";

type RuntimeEnv = {
  DB?: D1Database;
  DECKS?: R2Bucket;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB || !runtime.DECKS) {
    return NextResponse.json({ error: "报告存储尚未绑定" }, { status: 503 });
  }
  const { id } = await context.params;
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "md" && format !== "pptx") {
    return NextResponse.json({ error: "下载格式无效" }, { status: 400 });
  }
  await ensureReportTables(runtime.DB);
  const record = await getReportRecord(runtime.DB, id);
  if (!record || record.state !== "completed") {
    return NextResponse.json({ error: "报告尚未生成" }, { status: 404 });
  }
  const key = format === "md" ? record.markdownKey : record.pptxKey;
  if (!key) {
    return NextResponse.json({ error: "报告文件不存在" }, { status: 404 });
  }
  const object = await runtime.DECKS.get(key);
  if (!object) {
    return NextResponse.json({ error: "报告文件不存在" }, { status: 404 });
  }
  const stem = record.filename.replace(/\.(pptx|pdf)$/i, "").slice(0, 80);
  const filename = `${stem}-BioLens初筛报告.${format}`;
  return new Response(object.body, {
    headers: {
      "content-type":
        format === "md"
          ? "text/markdown; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
