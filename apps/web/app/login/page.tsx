import type { Metadata } from "next";
import { Inter, Noto_Serif } from "next/font/google";

import { LoginScreen } from "./login-screen";

const inter = Inter({
  subsets: ["latin"],
  variable: "--login-font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--login-font-serif",
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Login | The Living Archive",
  description: "Sign in to The Living Archive curator workspace.",
};

export default function LoginPage() {
  return (
    <div className={`${inter.variable} ${notoSerif.variable}`}>
      <LoginScreen />
    </div>
  );
}
