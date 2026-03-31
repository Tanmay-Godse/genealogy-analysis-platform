import type { Metadata } from "next";
import { Inter, Noto_Serif } from "next/font/google";

import { AdminDashboard } from "./admin-dashboard";

const inter = Inter({
  subsets: ["latin"],
  variable: "--admin-font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--admin-font-serif",
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "The Living Archive | Curator Admin",
  description: "Curator dashboard for the Living Archive workspace.",
};

export default function AdminPage() {
  return (
    <div className={`${inter.variable} ${notoSerif.variable}`}>
      <AdminDashboard />
    </div>
  );
}
