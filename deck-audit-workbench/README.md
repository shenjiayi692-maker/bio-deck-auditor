# Deck Audit Workbench

上层 [Bio/MedTech Deck Auditor](../README.md) 的人工复核界面。审计方法论说"每条宣称都要独立定级、不许合并计数"——这个应用是把那件事变成可点的工作台，而不是靠人在 Markdown 里手工维护台账。

一次完整的流程：**上传 deck → 后台生成结构化宣称与证据 → 人工逐条过审（通过 / 存疑 / 驳回 + 批注）→ 导出 Markdown 和 PPTX 报告**。

> 状态：**可跑，未上线**。功能通了，但没做鉴权、配额和多人协作。

## 技术形状

| | |
|---|---|
| 运行时 | Next.js 16 on Cloudflare Workers（通过 [vinext](https://github.com/cloudflare/vinext)） |
| 数据 | Cloudflare D1 + Drizzle ORM，3 个迁移 |
| 对象存储 | R2，存原始 deck、report JSON、导出的 md/pptx |
| 模型 | OpenAI Responses API，文件直传后异步出报告 |
| 导出 | `pptxgenjs` 生成 PPTX，`lib/reports/render.ts` 生成 Markdown |

数据模型的四张表对应流程的四个阶段：`deck_files`（上传与处理状态）、`deck_reports`（生成任务的状态机 + 各产物的 R2 key）、`evidence_snapshots`（外部核实结果的快照，带取回时间）、`review_decisions`（人工对每条 claim 的裁决与批注）。

证据快照带 `retrievedAt` 是刻意的：外部来源会变，报告必须能说清"我是什么时候查的"，否则复核结论无法追溯。

## API

| 路由 | 作用 |
|---|---|
| `POST /api/uploads` | 接收 deck，写 R2，建 `deck_files` 与 `deck_reports` 记录，触发生成 |
| `GET /api/reports/[id]` | 轮询生成状态（state / stage / progress） |
| `GET /api/reports/[id]/download` | 取 Markdown 或 PPTX 产物 |
| `GET /api/evidence/search` | 按宣称检索外部证据并落快照 |
| `POST /api/reviews` | 写入人工裁决 |

## 跑起来

需要 Node.js `>= 22.13.0`。

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 ANTHROPIC_API_KEY
npm run dev
```

生产环境的 `ANTHROPIC_API_KEY` 走托管平台的环境变量，不要提交进仓库。

```bash
npm run build        # 验证 vinext 构建产物
npm test             # 构建后校验渲染结果
npm run lint
npm run db:generate  # 改完 db/schema.ts 后生成迁移
```

本项目不使用 `wrangler.jsonc`；D1 与 R2 绑定声明在 `.openai/hosting.json`，`vite.config.ts` 在本地开发时模拟这些绑定。

## 目录

```text
app/            页面与 API 路由；workbench.tsx 是复核界面主体
lib/reports/    报告生成：prompt 组装、OpenAI 调用、schema、渲染、R2 读写
worker/         Cloudflare Worker 入口
db/             Drizzle schema
drizzle/        迁移
examples/d1/    D1 用法示例（脚手架自带，保留备参考）
public/         示例截图与导出的报告样本
```

## 已知不足

无鉴权（任何人拿到 URL 都能上传和复核）、无配额、无多人协作与冲突处理、生成失败只记录 `errorMessage` 不重试。这些是"未上线"三个字的具体内容。
