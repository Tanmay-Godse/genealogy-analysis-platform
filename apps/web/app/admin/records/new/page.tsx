import type { Metadata } from "next";
import { Inter, Noto_Serif } from "next/font/google";

import { RecordEditor } from "./record-editor";

const inter = Inter({
  subsets: ["latin"],
  variable: "--record-font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--record-font-serif",
  display: "swap",
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: "The Living Archive | Record Editor",
  description: "Create and link family records without editing the graph manually.",
};

export default function NewRecordPage() {
  return (
    <div className={`${inter.variable} ${notoSerif.variable}`}>
      <RecordEditor />
    </div>
  );
}
