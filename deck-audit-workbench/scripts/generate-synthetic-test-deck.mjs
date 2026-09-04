import PptxGenJS from "pptxgenjs";

const output = process.argv[2];
if (!output) throw new Error("Pass an output .pptx path");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "BioLens test fixture";

const cover = pptx.addSlide();
cover.addText("NovaCell Therapeutics", {
  x: 0.8,
  y: 1.4,
  w: 10,
  h: 0.7,
  fontSize: 32,
  bold: true,
});
cover.addText("Synthetic investment deck · not a real company", {
  x: 0.8,
  y: 2.4,
  w: 8,
  h: 0.4,
  fontSize: 18,
});

const technology = pptx.addSlide();
technology.addText("Technology claims", {
  x: 0.8,
  y: 0.6,
  w: 8,
  h: 0.5,
  fontSize: 26,
  bold: true,
});
technology.addText(
  "Claims 92% response prediction accuracy in an internal retrospective dataset of 180 samples. No external validation has been completed.",
  { x: 0.8, y: 1.5, w: 10.8, h: 1.2, fontSize: 20 },
);

const commercial = pptx.addSlide();
commercial.addText("Commercial and financing claims", {
  x: 0.8,
  y: 0.6,
  w: 10,
  h: 0.5,
  fontSize: 26,
  bold: true,
});
commercial.addText(
  "The company states it has three pilot sites, no recognized revenue, and seeks RMB 30 million to fund a prospective study and regulatory preparation.",
  { x: 0.8, y: 1.5, w: 10.8, h: 1.2, fontSize: 20 },
);

await pptx.writeFile({ fileName: output });
