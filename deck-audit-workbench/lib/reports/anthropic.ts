import { buildScreeningPrompt } from "./prompt";
import { screeningReportSchema } from "./schema";
import type { ScreeningReport } from "./types";

export const REPORT_MODEL = "claude-sonnet-5";

export type AnthropicBatch = {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  results_url?: string | null;
  request_counts?: {
    processing?: number;
    succeeded?: number;
    errored?: number;
    canceled?: number;
    expired?: number;
  };
};

type AnthropicMessage = {
  stop_reason?: string | null;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type AnthropicBatchResult = {
  custom_id: string;
  result:
    | { type: "succeeded"; message: AnthropicMessage }
    | { type: "errored"; error?: { error?: { message?: string } } }
    | { type: "canceled" | "expired" };
};

async function anthropicFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`https://api.anthropic.com${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(init?.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 500);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      detail = parsed.error?.message ?? detail;
    } catch {
      // Preserve the bounded response body when it is not JSON.
    }
    throw new Error(`Anthropic 返回 ${response.status}：${detail}`);
  }
  return response;
}

export async function uploadDeckToAnthropic(
  apiKey: string,
  file: ArrayBuffer,
  filename: string,
  contentType: string,
) {
  const form = new FormData();
  const safeFilename =
    filename
      .replace(/[<>:"|?*\\/\u0000-\u001f]/g, "-")
      .slice(0, 255) || "deck.txt";
  form.set("file", new File([file], safeFilename, { type: contentType }));
  // The report route also deletes the file after completion. Expiry is a
  // backstop for abandoned jobs and keeps provider storage bounded.
  form.set("expires_in_seconds", String(7 * 24 * 60 * 60));
  const response = await anthropicFetch(apiKey, "/v1/files", {
    method: "POST",
    body: form,
  });
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error("Anthropic 文件上传未返回 file id");
  return payload.id;
}

export async function startReportAnalysis(
  apiKey: string,
  fileId: string,
  deckId: string,
  filename: string,
  contentType: string,
) {
  const response = await anthropicFetch(apiKey, "/v1/messages/batches", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          custom_id: deckId,
          params: {
            model: REPORT_MODEL,
            max_tokens: 20_000,
            output_config: {
              effort: "high",
              format: {
                type: "json_schema",
                schema: screeningReportSchema,
              },
            },
            tools: [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: 10,
              },
            ],
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "document",
                    source: { type: "file", file_id: fileId },
                    title: filename,
                  },
                  {
                    type: "text",
                    text: buildScreeningPrompt(filename, contentType),
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
  });
  const payload = (await response.json()) as AnthropicBatch;
  if (!payload.id) throw new Error("Anthropic 未返回 batch id");
  return payload;
}

export async function getReportAnalysis(apiKey: string, batchId: string) {
  const response = await anthropicFetch(
    apiKey,
    `/v1/messages/batches/${encodeURIComponent(batchId)}`,
  );
  return (await response.json()) as AnthropicBatch;
}

export async function getReportResult(
  apiKey: string,
  batchId: string,
  deckId: string,
) {
  const response = await anthropicFetch(
    apiKey,
    `/v1/messages/batches/${encodeURIComponent(batchId)}/results`,
  );
  const jsonl = await response.text();
  const rows = jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AnthropicBatchResult);
  const result = rows.find((row) => row.custom_id === deckId) ?? rows[0];
  if (!result) throw new Error("Anthropic 批处理没有返回结果");
  return result;
}

export async function deleteAnthropicFile(apiKey: string, fileId: string) {
  try {
    await anthropicFetch(apiKey, `/v1/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
  } catch {
    // Cleanup must not prevent delivery of an already generated report.
  }
}

export async function deleteAnthropicBatch(apiKey: string, batchId: string) {
  try {
    await anthropicFetch(
      apiKey,
      `/v1/messages/batches/${encodeURIComponent(batchId)}`,
      { method: "DELETE" },
    );
  } catch {
    // Cleanup must not prevent delivery of an already generated report.
  }
}

export function parseCompletedReport(result: AnthropicBatchResult) {
  if (result.result.type !== "succeeded") {
    const detail =
      result.result.type === "errored"
        ? result.result.error?.error?.message
        : undefined;
    throw new Error(detail ?? `Anthropic 批处理状态：${result.result.type}`);
  }
  const message = result.result.message;
  if (message.stop_reason === "max_tokens") {
    throw new Error("模型输出达到长度上限，请缩短 Deck 后重试");
  }
  if (message.stop_reason === "refusal") {
    throw new Error("模型拒绝生成该报告");
  }
  const texts = (message.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!);
  for (const text of texts.reverse()) {
    try {
      return JSON.parse(text) as ScreeningReport;
    } catch {
      // Tool-assisted responses can contain non-final text blocks. The final
      // structured block is normally last, but inspect every text block.
    }
  }
  throw new Error("Anthropic 未返回可解析的结构化报告");
}
