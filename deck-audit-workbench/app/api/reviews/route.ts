import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

type RuntimeEnv = {
  DB?: D1Database;
};

const validStatuses = new Set([
  "未审",
  "已确认",
  "需澄清",
  "已修改",
  "已驳回",
]);

async function ensureTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS review_decisions (
        claim_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        reviewer TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();
}

export async function GET(request: NextRequest) {
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) {
    return NextResponse.json({ items: [], persisted: false });
  }
  await ensureTable(db);
  const claimId = request.nextUrl.searchParams.get("claimId");
  const statement = claimId
    ? db
        .prepare(
          "SELECT claim_id as claimId, status, note, reviewer, updated_at as updatedAt FROM review_decisions WHERE claim_id = ?",
        )
        .bind(claimId)
    : db.prepare(
        "SELECT claim_id as claimId, status, note, reviewer, updated_at as updatedAt FROM review_decisions ORDER BY updated_at DESC LIMIT 200",
      );
  const result = await statement.all();
  return NextResponse.json({ items: result.results, persisted: true });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    claimId?: string;
    status?: string;
    note?: string;
    reviewer?: string;
  };
  if (!payload.claimId || !payload.status || !validStatuses.has(payload.status)) {
    return NextResponse.json(
      { error: "claimId 或复核状态无效" },
      { status: 400 },
    );
  }

  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) {
    return NextResponse.json({ persisted: false });
  }
  await ensureTable(db);
  await db
    .prepare(
      `INSERT INTO review_decisions (claim_id, status, note, reviewer, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(claim_id) DO UPDATE SET
         status = excluded.status,
         note = excluded.note,
         reviewer = excluded.reviewer,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      payload.claimId,
      payload.status,
      payload.note ?? "",
      payload.reviewer ?? "",
    )
    .run();

  return NextResponse.json({ persisted: true });
}
