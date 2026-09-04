import type { Metadata } from "next";
import { Workbench } from "./workbench";

export const metadata: Metadata = {
  title: "BioLens · Deck 证据工作台",
  description:
    "逐条拆解 Bio/MedTech Deck 宣称，关联一手证据并保留人工复核决定。",
};

export default function Home() {
  return <Workbench />;
}
