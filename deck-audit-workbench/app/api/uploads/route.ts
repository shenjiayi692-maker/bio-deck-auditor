import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureReportJob,
  ensureReportTables,
  listReportJobs,
} from "../../../lib/reports/store";

type RuntimeEnv = {
  DB?: D1Database;
  DECKS?: R2Bucket;
};

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function GET() {
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) {
    return NextResponse.json({ items: [], persisted: false });
  }
  await ensureReportTables(db);
  return NextResponse.json({ items: await listReportJobs(db), persisted: true });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const originalFilename =
    typeof form.get("originalFilename") === "string"
      ? String(form.get("originalFilename"))
      : "";
  const clientExtracted = form.get("clientExtracted") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择 PPTX 或 PDF" }, { status: 400 });
  }
  const isExtractedPptx =
    clientExtracted &&
    file.type === "text/plain" &&
    /\.pptx$/i.test(originalFilename);
  if (
    !isExtractedPptx &&
    !allowedTypes.has(file.type) &&
    !/\.(pptx|pdf)$/i.test(file.name)
  ) {
    return NextResponse.json(
      { error: "当前仅支持 PPTX 和 PDF" },
      { status: 415 },
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: "MVP 单文件上限为 50 MB" },
      { status: 413 },
    );
  }

  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DECKS || !runtime.DB) {
    return NextResponse.json(
      { error: "文件存储尚未绑定" },
      { status: 503 },
    );
  }

  const id = crypto.randomUUID();
  const displayName = isExtractedPptx ? originalFilename : file.name;
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "-");
  const objectKey = `decks/${id}/${safeName}`;
  await runtime.DECKS.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalName: file.name },
  });

  await ensureReportTables(runtime.DB);
  await runtime.DB
    .prepare(
      `INSERT INTO deck_files
       (id, filename, analysis_filename, object_key, content_type, size, processing_state)
       VALUES (?, ?, ?, ?, ?, ?, 'uploaded')`,
    )
    .bind(
      id,
      displayName,
      file.name,
      objectKey,
      file.type || "application/octet-stream",
      file.size,
    )
    .run();
  await ensureReportJob(runtime.DB, id);

  return NextResponse.json({
    id,
    filename: displayName,
    contentType: file.type || "application/octet-stream",
    state: "uploaded",
    stage: "文件已接收",
    progress: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
