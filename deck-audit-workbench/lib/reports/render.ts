import PptxGenJS from "pptxgenjs";
import type {
  ReportClaim,
  ReportDimension,
  ScreeningReport,
} from "./types";

const GREEN = "0B6651";
const INK = "16221D";
const MUTED = "5F6E66";
const PAPER = "F7F6F0";
const WHITE = "FFFFFF";
const LINE = "D8DDD7";
const AMBER = "B97818";
const RED = "A43B35";

function list(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

export function renderMarkdown(report: ScreeningReport) {
  const dimension = (title: string, value: ReportDimension) => `## ${title}｜${value.score}/100

**判断：** ${value.judgment}

**支持证据**
${list(value.evidence)}

**关键缺口**
${list(value.gaps)}`;

  const claims = report.keyClaims
    .map(
      (claim, index) => `### ${index + 1}. [${claim.category}｜${claim.risk}风险] ${claim.claim}

- 来源页：${claim.slideRef}
- 证据状态：${claim.evidenceStatus}
- 证据：${claim.evidence.join("；") || "未找到足够外部证据"}
- 对投资判断的影响：${claim.implication}`,
    )
    .join("\n\n");

  const sources = report.sources
    .map(
      (source) =>
        `- [${source.title}](${source.url})｜${source.publisher}｜访问 ${source.accessedAt}`,
    )
    .join("\n");

  return `# ${report.company}｜Bio/MedTech 初筛报告

> 分析日期：${report.analysisDate}｜领域：${report.sector}｜阶段：${report.stage}

## 结论

**${report.verdict}｜置信度：${report.confidence}**

${report.oneLineConclusion}

${dimension("技术可靠性", report.technical)}

${dimension("市场现实", report.market)}

${dimension("资本回报", report.capital)}

## 决定结论的关键宣称

${claims}

## 市场与商业化要点
${list(report.marketReality)}

## 资本回报要点
${list(report.capitalReturn)}

## 必须补充的尽调材料
${list(report.diligenceAsks)}

## 推进门槛
${list(report.decisionGates)}

## 外部来源
${sources || "- 本次未检索到可引用的一手来源"}

## 局限
${list(report.limitations)}

---
本报告用于投资初筛，不构成医疗建议、审计意见或投资承诺。Deck 宣称只有在完成实体、产品、时间和原始证据核对后才能视为已核实。
`;
}

function addTitle(
  slide: PptxGenJS.Slide,
  eyebrow: string,
  title: string,
  page: number,
) {
  slide.background = { color: PAPER };
  slide.addText(eyebrow, {
    x: 0.65,
    y: 0.38,
    w: 4.2,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 9,
    bold: true,
    color: GREEN,
    charSpacing: 1.4,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.65,
    y: 0.68,
    w: 11.6,
    h: 0.5,
    fontFace: "Aptos Display",
    fontSize: 35,
    bold: true,
    color: INK,
    margin: 0,
  });
  slide.addText(String(page).padStart(2, "0"), {
    x: 12.15,
    y: 0.44,
    w: 0.5,
    h: 0.2,
    align: "right",
    fontFace: "Aptos",
    fontSize: 9,
    color: MUTED,
    margin: 0,
  });
}

function addBullets(
  slide: PptxGenJS.Slide,
  items: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 14,
) {
  const rows = (items.length ? items : ["暂无"]).slice(0, 6).map((item) => ({
    text: item,
    options: {
      bullet: { indent: fontSize },
      hanging: 3,
      breakLine: true,
    },
  }));
  slide.addText(rows, {
    x,
    y,
    w,
    h,
    fontFace: "Aptos",
    fontSize,
    color: INK,
    breakLine: false,
    margin: 0.04,
    paraSpaceAfter: 9,
    valign: "top",
  });
}

function dimensionCard(
  slide: PptxGenJS.Slide,
  label: string,
  value: ReportDimension,
  x: number,
) {
  slide.addShape("roundRect", {
    x,
    y: 1.48,
    w: 3.85,
    h: 4.9,
    rectRadius: 0.08,
    fill: { color: WHITE },
    line: { color: LINE, width: 1 },
  });
  slide.addText(label, {
    x: x + 0.25,
    y: 1.78,
    w: 2.5,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: GREEN,
    margin: 0,
  });
  slide.addText(String(value.score), {
    x: x + 2.75,
    y: 1.63,
    w: 0.72,
    h: 0.5,
    align: "right",
    fontSize: 27,
    bold: true,
    color: value.score >= 70 ? GREEN : value.score >= 50 ? AMBER : RED,
    margin: 0,
  });
  slide.addText(value.judgment, {
    x: x + 0.25,
    y: 2.3,
    w: 3.35,
    h: 1.05,
    fontSize: 16,
    bold: true,
    color: INK,
    valign: "middle",
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addText("关键依据", {
    x: x + 0.25,
    y: 3.62,
    w: 1.4,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: MUTED,
    charSpacing: 1,
    margin: 0,
  });
  addBullets(slide, value.evidence.slice(0, 2), x + 0.25, 3.98, 3.25, 1.65, 16);
  slide.addText(`最大缺口：${value.gaps[0] ?? "暂无"}`, {
    x: x + 0.25,
    y: 5.82,
    w: 3.25,
    h: 0.33,
    fontSize: 9.5,
    color: RED,
    margin: 0,
    fit: "shrink",
  });
}

function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function claimRows(claims: ReportClaim[]) {
  return claims.slice(0, 4).map((claim) => [
    { text: claim.category, options: { bold: true, color: GREEN } },
    { text: shorten(claim.claim, 52) },
    { text: claim.evidenceStatus },
    { text: shorten(claim.implication, 58) },
  ]);
}

export async function renderPptx(report: ScreeningReport) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "BioLens";
  pptx.subject = "Bio/MedTech 投资初筛报告";
  pptx.title = `${report.company} 初筛报告`;
  pptx.company = "BioLens";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  pptx.defineSlideMaster({
    title: "BIOLENS",
    background: { color: PAPER },
    objects: [
      {
        line: {
          x: 0.65,
          y: 7.1,
          w: 12.05,
          h: 0,
          line: { color: LINE, width: 0.7 },
        },
      },
      {
        text: {
          text: "BioLens · Evidence-led screening",
          options: {
            x: 0.65,
            y: 7.2,
            w: 4,
            h: 0.18,
            fontSize: 8,
            color: MUTED,
            margin: 0,
          },
        },
      },
    ],
    slideNumber: {
      x: 12.1,
      y: 7.2,
      w: 0.6,
      h: 0.18,
      align: "right",
      fontSize: 8,
      color: MUTED,
      margin: 0,
    },
  });

  const cover = pptx.addSlide("BIOLENS");
  cover.background = { color: PAPER };
  cover.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.22,
    h: 7.5,
    fill: { color: GREEN },
    line: { color: GREEN },
  });
  cover.addText("BIO/MEDTECH INVESTMENT SCREENING", {
    x: 0.85,
    y: 0.75,
    w: 6.8,
    h: 0.24,
    fontSize: 10,
    bold: true,
    color: GREEN,
    charSpacing: 1.7,
    margin: 0,
  });
  cover.addText(report.company, {
    x: 0.85,
    y: 1.45,
    w: 10.9,
    h: 0.8,
    fontSize: 50,
    bold: true,
    color: INK,
    margin: 0,
    fit: "shrink",
  });
  cover.addText(report.deckTitle, {
    x: 0.85,
    y: 2.42,
    w: 9.8,
    h: 0.65,
    fontSize: 18,
    color: MUTED,
    margin: 0,
    fit: "shrink",
  });
  const verdictColor =
    report.verdict === "建议推进"
      ? GREEN
      : report.verdict === "有条件推进"
        ? AMBER
        : RED;
  cover.addText(report.verdict, {
    x: 0.85,
    y: 3.65,
    w: 2.35,
    h: 0.58,
    fontSize: 20,
    bold: true,
    color: WHITE,
    align: "center",
    valign: "middle",
    fill: { color: verdictColor },
    margin: 0,
  });
  cover.addText(report.oneLineConclusion, {
    x: 3.5,
    y: 3.48,
    w: 8.35,
    h: 0.95,
    fontSize: 19,
    bold: true,
    color: INK,
    margin: 0,
    fit: "shrink",
    valign: "middle",
  });
  cover.addText(
    `${report.sector}  ·  ${report.stage}  ·  ${report.analysisDate}  ·  置信度 ${report.confidence}`,
    {
      x: 0.85,
      y: 5.75,
      w: 10.5,
      h: 0.28,
      fontSize: 11,
      color: MUTED,
      margin: 0,
    },
  );

  const dimensions = pptx.addSlide("BIOLENS");
  addTitle(dimensions, "01 · 投资判断", "三个维度决定是否继续尽调", 2);
  dimensionCard(dimensions, "技术可靠性", report.technical, 0.65);
  dimensionCard(dimensions, "市场现实", report.market, 4.75);
  dimensionCard(dimensions, "资本回报", report.capital, 8.85);

  const claims = pptx.addSlide("BIOLENS");
  addTitle(claims, "02 · 宣称核查", "关键宣称、证据状态与投资影响", 3);
  claims.addTable(
    [
      [
        {
          text: "维度",
          options: { bold: true, color: WHITE, fill: { color: GREEN } },
        },
        {
          text: "Deck 宣称",
          options: { bold: true, color: WHITE, fill: { color: GREEN } },
        },
        {
          text: "证据状态",
          options: { bold: true, color: WHITE, fill: { color: GREEN } },
        },
        {
          text: "对判断的影响",
          options: { bold: true, color: WHITE, fill: { color: GREEN } },
        },
      ],
      ...claimRows(report.keyClaims),
    ],
    {
      x: 0.65,
      y: 1.45,
      w: 12.05,
      h: 4.95,
      border: { color: LINE, pt: 0.7 },
      fill: { color: WHITE },
      color: INK,
      fontFace: "Aptos",
      fontSize: 16,
      margin: 0.1,
      valign: "middle",
      breakLine: false,
      rowH: 1.0,
      colW: [0.8, 4.0, 1.35, 5.9],
      bold: false,
    },
  );
  claims.addText("Deck 宣称不是事实；“未找到”只代表本次检索未形成足够支持。", {
    x: 0.65,
    y: 6.58,
    w: 8,
    h: 0.24,
    fontSize: 9,
    color: MUTED,
    margin: 0,
  });

  const reality = pptx.addSlide("BIOLENS");
  addTitle(reality, "03 · 市场与资本", "现实约束比宏观故事更重要", 4);
  reality.addText("市场现实", {
    x: 0.75,
    y: 1.55,
    w: 4,
    h: 0.35,
    fontSize: 24,
    bold: true,
    color: GREEN,
    margin: 0,
  });
  addBullets(reality, report.marketReality.slice(0, 4), 0.75, 2.05, 5.55, 3.8, 16);
  reality.addShape("line", {
    x: 6.65,
    y: 1.5,
    w: 0,
    h: 4.9,
    line: { color: LINE, width: 1 },
  });
  reality.addText("资本回报", {
    x: 7.05,
    y: 1.55,
    w: 4,
    h: 0.35,
    fontSize: 24,
    bold: true,
    color: GREEN,
    margin: 0,
  });
  addBullets(reality, report.capitalReturn.slice(0, 4), 7.05, 2.05, 5.3, 3.8, 16);

  const asks = pptx.addSlide("BIOLENS");
  addTitle(asks, "04 · 尽调材料", "只索要会改变结论的证据", 5);
  report.diligenceAsks.slice(0, 8).forEach((ask, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column ? 6.85 : 0.75;
    const y = 1.45 + row * 1.22;
    asks.addText(String(index + 1).padStart(2, "0"), {
      x,
      y,
      w: 0.45,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: GREEN,
      margin: 0,
    });
    asks.addText(ask, {
      x: x + 0.62,
      y: y - 0.04,
      w: 5.1,
      h: 0.82,
      fontSize: 16,
      bold: true,
      color: INK,
      margin: 0,
      fit: "shrink",
      valign: "top",
    });
    asks.addShape("line", {
      x: x + 0.62,
      y: y + 0.94,
      w: 5.1,
      h: 0,
      line: { color: LINE, width: 0.7 },
    });
  });

  const gate = pptx.addSlide("BIOLENS");
  addTitle(gate, "05 · 决策门槛", "满足门槛再进入下一轮", 6);
  gate.addText(report.verdict, {
    x: 0.75,
    y: 1.45,
    w: 2.35,
    h: 0.56,
    fontSize: 19,
    bold: true,
    color: WHITE,
    align: "center",
    valign: "middle",
    fill: { color: verdictColor },
    margin: 0,
  });
  gate.addText(report.oneLineConclusion, {
    x: 3.55,
    y: 1.34,
    w: 8.25,
    h: 0.83,
    fontSize: 18,
    bold: true,
    color: INK,
    margin: 0,
    fit: "shrink",
    valign: "middle",
  });
  report.decisionGates.slice(0, 5).forEach((item, index) => {
    const y = 2.65 + index * 0.72;
    gate.addShape("ellipse", {
      x: 0.82,
      y: y + 0.02,
      w: 0.25,
      h: 0.25,
      fill: { color: GREEN, transparency: 85 },
      line: { color: GREEN, width: 1.2 },
    });
    gate.addText(item, {
      x: 1.35,
      y: y - 0.04,
      w: 10.65,
      h: 0.42,
      fontSize: 16,
      color: INK,
      margin: 0,
      fit: "shrink",
    });
  });
  gate.addText(`局限：${report.limitations.slice(0, 2).join("；") || "无特别说明"}`, {
    x: 0.75,
    y: 6.38,
    w: 11.6,
    h: 0.33,
    fontSize: 9,
    color: MUTED,
    margin: 0,
    fit: "shrink",
  });

  const output = await pptx.write({ outputType: "arraybuffer" });
  if (output instanceof ArrayBuffer) return output;
  if (output instanceof Uint8Array) {
    return output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    ) as ArrayBuffer;
  }
  if (output instanceof Blob) return output.arrayBuffer();
  throw new Error("PPTX 生成器返回了未知格式");
}
