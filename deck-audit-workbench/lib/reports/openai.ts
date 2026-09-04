import { buildScreeningPrompt } from "./prompt";
import { screeningReportSchema } from "./schema";
import type { ScreeningReport } from "./types";

type OpenAIResponse = {
  id: string;
  status: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

async function openaiFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(init?.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型服务返回 ${response.status}：${text.slice(0, 500)}`);
  }
  return response;
}

export async function uploadDeckToOpenAI(
  apiKey: string,
  file: ArrayBuffer,
  filename: string,
  contentType: string,
) {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", new File([file], filename, { type: contentType }));
  const response = await openaiFetch(apiKey, "/files", {
    method: "POST",
    body: form,
  });
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error("模型文件上传未返回 file id");
  return payload.id;
}

export async function startReportAnalysis(
  apiKey: string,
  fileId: string,
  filename: string,
  contentType: string,
) {
  const response = await openaiFetch(apiKey, "/responses", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      background: true,
      store: false,
      reasoning: { effort: "medium" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "bio_deck_screening_report",
          strict: true,
          schema: screeningReportSchema,
        },
      },
      tools: [{ type: "web_search" }],
      safety_identifier: "biolens-screening-workbench",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: fileId },
            {
              type: "input_text",
              text: buildScreeningPrompt(filename, contentType),
            },
          ],
        },
      ],
    }),
  });
  const payload = (await response.json()) as OpenAIResponse;
  if (!payload.id) throw new Error("后台分析任务未返回 response id");
  return payload;
}

export async function getReportAnalysis(apiKey: string, responseId: string) {
  const response = await openaiFetch(
    apiKey,
    `/responses/${encodeURIComponent(responseId)}`,
  );
  return (await response.json()) as OpenAIResponse;
}

export async function deleteOpenAIFile(apiKey: string, fileId: string) {
  try {
    await openaiFetch(apiKey, `/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
  } catch {
    // Report delivery must not fail because cleanup is temporarily unavailable.
  }
}

export function parseCompletedReport(response: OpenAIResponse) {
  if (response.status !== "completed") {
    const reason =
      response.error?.message ??
      response.incomplete_details?.reason ??
      `任务状态为 ${response.status}`;
    throw new Error(reason);
  }
  const content = response.output
    ?.find((item) => item.type === "message")
    ?.content?.find((item) => item.type === "output_text");
  if (!content?.text) {
    const refusal = response.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "refusal")?.refusal;
    throw new Error(refusal || "模型未返回结构化报告");
  }
  return JSON.parse(content.text) as ScreeningReport;
}
