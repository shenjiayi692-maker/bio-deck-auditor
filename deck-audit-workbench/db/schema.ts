import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviewDecisions = sqliteTable("review_decisions", {
  claimId: text("claim_id").primaryKey(),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  reviewer: text("reviewer").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deckFiles = sqliteTable("deck_files", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  analysisFilename: text("analysis_filename").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  processingState: text("processing_state").notNull().default("uploaded"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deckReports = sqliteTable("deck_reports", {
  deckId: text("deck_id").primaryKey(),
  state: text("state").notNull().default("uploaded"),
  stage: text("stage").notNull().default("文件已接收"),
  progress: integer("progress").notNull().default(5),
  model: text("model").notNull().default("gpt-5.6-terra"),
  openaiFileId: text("openai_file_id"),
  responseId: text("response_id"),
  reportJsonKey: text("report_json_key"),
  markdownKey: text("markdown_key"),
  pptxKey: text("pptx_key"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const evidenceSnapshots = sqliteTable("evidence_snapshots", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  provider: text("provider").notNull(),
  identifier: text("identifier").notNull(),
  sourceUrl: text("source_url").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  state: text("state").notNull().default("候选记录"),
  rawJson: text("raw_json").notNull().default("{}"),
  retrievedAt: text("retrieved_at").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
