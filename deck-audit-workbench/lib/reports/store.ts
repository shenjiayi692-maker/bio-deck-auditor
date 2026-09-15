import type { ReportJobState, ReportJobView } from "./types";

export type DeckFileRow = {
  id: string;
  filename: string;
  analysisFilename: string;
  objectKey: string;
  contentType: string;
  size: number;
  processingState: string;
  createdAt: string;
};

type ReportRow = {
  id: string;
  filename: string;
  contentType: string;
  state: ReportJobState | null;
  stage: string | null;
  progress: number | null;
  errorMessage: string | null;
  markdownKey: string | null;
  pptxKey: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export async function ensureReportTables(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS deck_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        analysis_filename TEXT NOT NULL,
        object_key TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        processing_state TEXT NOT NULL DEFAULT 'uploaded',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS deck_reports (
        deck_id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'uploaded',
        stage TEXT NOT NULL DEFAULT '文件已接收',
        progress INTEGER NOT NULL DEFAULT 5,
        model TEXT NOT NULL DEFAULT 'claude-sonnet-5',
        provider TEXT NOT NULL DEFAULT 'anthropic',
        provider_file_id TEXT,
        provider_job_id TEXT,
        openai_file_id TEXT,
        response_id TEXT,
        report_json_key TEXT,
        markdown_key TEXT,
        pptx_key TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )`,
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS deck_reports_state_idx ON deck_reports (state, updated_at)",
    ),
  ]);
  const columns = await db
    .prepare("PRAGMA table_info(deck_files)")
    .all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "analysis_filename")) {
    await db
      .prepare(
        "ALTER TABLE deck_files ADD COLUMN analysis_filename TEXT NOT NULL DEFAULT ''",
      )
      .run();
    await db
      .prepare(
        "UPDATE deck_files SET analysis_filename = filename WHERE analysis_filename = ''",
      )
      .run();
  }
  const reportColumns = await db
    .prepare("PRAGMA table_info(deck_reports)")
    .all<{ name: string }>();
  if (!reportColumns.results.some((column) => column.name === "provider")) {
    await db
      .prepare(
        "ALTER TABLE deck_reports ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic'",
      )
      .run();
  }
  if (!reportColumns.results.some((column) => column.name === "provider_file_id")) {
    await db
      .prepare("ALTER TABLE deck_reports ADD COLUMN provider_file_id TEXT")
      .run();
  }
  if (!reportColumns.results.some((column) => column.name === "provider_job_id")) {
    await db
      .prepare("ALTER TABLE deck_reports ADD COLUMN provider_job_id TEXT")
      .run();
  }
}

export async function ensureReportJob(db: D1Database, deckId: string) {
  await db
    .prepare(
      `INSERT INTO deck_reports (deck_id)
       VALUES (?)
       ON CONFLICT(deck_id) DO NOTHING`,
    )
    .bind(deckId)
    .run();
}

export async function getDeckFile(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT id, filename, analysis_filename as analysisFilename,
              object_key as objectKey,
              content_type as contentType, size,
              processing_state as processingState,
              created_at as createdAt
       FROM deck_files
       WHERE id = ?`,
    )
    .bind(id)
    .first<DeckFileRow>();
  return row ?? null;
}

export async function getReportRecord(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT f.id, f.filename,
              f.analysis_filename as analysisFilename,
              f.object_key as objectKey,
              f.content_type as contentType, f.size,
              f.created_at as createdAt,
              r.state, r.stage, r.progress, r.model,
              r.provider,
              r.provider_file_id as providerFileId,
              r.provider_job_id as providerJobId,
              r.report_json_key as reportJsonKey,
              r.markdown_key as markdownKey,
              r.pptx_key as pptxKey,
              r.error_message as errorMessage,
              r.updated_at as updatedAt
       FROM deck_files f
       LEFT JOIN deck_reports r ON r.deck_id = f.id
       WHERE f.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      filename: string;
      analysisFilename: string;
      objectKey: string;
      contentType: string;
      size: number;
      createdAt: string;
      state: ReportJobState | null;
      stage: string | null;
      progress: number | null;
      model: string | null;
      provider: string | null;
      providerFileId: string | null;
      providerJobId: string | null;
      reportJsonKey: string | null;
      markdownKey: string | null;
      pptxKey: string | null;
      errorMessage: string | null;
      updatedAt: string | null;
    }>();
  return row ?? null;
}

export async function listReportJobs(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT f.id, f.filename, f.content_type as contentType,
              COALESCE(r.state, 'uploaded') as state,
              COALESCE(r.stage, '文件已接收') as stage,
              COALESCE(r.progress, 5) as progress,
              r.error_message as errorMessage,
              r.markdown_key as markdownKey,
              r.pptx_key as pptxKey,
              f.created_at as createdAt,
              COALESCE(r.updated_at, f.created_at) as updatedAt
       FROM deck_files f
       LEFT JOIN deck_reports r ON r.deck_id = f.id
       ORDER BY f.created_at DESC
       LIMIT 100`,
    )
    .all<ReportRow>();
  return result.results.map(reportRowToView);
}

export function reportRowToView(row: ReportRow): ReportJobView {
  const completed = row.state === "completed";
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    state: row.state ?? "uploaded",
    stage: row.stage ?? "文件已接收",
    progress: row.progress ?? 5,
    error: row.errorMessage ?? undefined,
    reportTextUrl:
      completed && row.markdownKey
        ? `/api/reports/${encodeURIComponent(row.id)}/download?format=md`
        : undefined,
    reportPptxUrl:
      completed && row.pptxKey
        ? `/api/reports/${encodeURIComponent(row.id)}/download?format=pptx`
        : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

export function recordToView(
  row: NonNullable<Awaited<ReturnType<typeof getReportRecord>>>,
): ReportJobView {
  return reportRowToView({
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    state: row.state,
    stage: row.stage,
    progress: row.progress,
    errorMessage: row.errorMessage,
    markdownKey: row.markdownKey,
    pptxKey: row.pptxKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function setJobState(
  db: D1Database,
  id: string,
  values: {
    state: ReportJobState;
    stage: string;
    progress: number;
    error?: string | null;
  },
) {
  await db
    .prepare(
      `UPDATE deck_reports
       SET state = ?, stage = ?, progress = ?, error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE deck_id = ?`,
    )
    .bind(
      values.state,
      values.stage,
      values.progress,
      values.error ?? null,
      id,
    )
    .run();
  await db
    .prepare("UPDATE deck_files SET processing_state = ? WHERE id = ?")
    .bind(values.state, id)
    .run();
}
