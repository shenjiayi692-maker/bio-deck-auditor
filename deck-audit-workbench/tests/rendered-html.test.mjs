import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the BioLens evidence workbench surface", async () => {
  const [page, workbench, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /BioLens · Deck 证据工作台/);
  assert.match(workbench, /投资初筛队列/);
  assert.match(workbench, /宣称台账/);
  assert.match(workbench, /查询一手来源/);
  assert.match(workbench, /分析师决定/);
  assert.match(workbench, /文字报告/);
  assert.match(workbench, /简版 PPT/);
  assert.match(workbench, /重新生成/);
  assert.match(workbench, /PDF 可同时核查文字、图表和页面视觉/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(page, /codex-preview/);
  assert.doesNotMatch(workbench, /react-loading-skeleton/);
});

test("removes the starter preview and declares durable storage", async () => {
  const [page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /export const metadata:\s*Metadata/);
  assert.match(page, /<Workbench \/>/);
  assert.match(layout, /BioLens/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "DECKS"/);

  await assert.rejects(
    access(previewRoot),
  );
  await access(new URL("../public/demo-liuyedao-16.png", import.meta.url));
  await access(
    new URL(
      "../public/reports/lancet-robotics-initial-screening.pptx",
      import.meta.url,
    ),
  );
  await access(
    new URL(
      "../public/reports/shimei-initial-screening.md",
      import.meta.url,
    ),
  );
  await access(templateRoot);
});

test("implements a durable Anthropic dual-report generation pipeline", async () => {
  const [
    reportRoute,
    downloadRoute,
    anthropic,
    prompt,
    schema,
    migration,
    packageJson,
  ] =
    await Promise.all([
      readFile(new URL("../app/api/reports/[id]/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/reports/[id]/download/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/reports/anthropic.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/reports/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0003_magenta_joystick.sql", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  assert.match(reportRoute, /startReportAnalysis/);
  assert.match(reportRoute, /renderMarkdown/);
  assert.match(reportRoute, /renderPptx/);
  assert.match(reportRoute, /state = 'completed'/);
  assert.match(reportRoute, /ANTHROPIC_API_KEY/);
  assert.match(anthropic, /claude-sonnet-5/);
  assert.match(anthropic, /web_search_20250305/);
  assert.match(anthropic, /output_config/);
  assert.match(anthropic, /messages\/batches/);
  assert.match(downloadRoute, /cache-control": "private, no-store"/);
  assert.match(prompt, /不得当作已证实事实/);
  assert.match(prompt, /PPTX：文件输入只抽取文字/);
  assert.match(schema, /deckReports/);
  assert.match(migration, /provider_file_id/);
  assert.match(packageJson, /pptxgenjs/);
});
