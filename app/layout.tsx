import type { Metadata } from "next";
import Script from "next/script";
import { AppearanceControl } from "@/components/appearance-control";
import { ChatEntryTransition } from "@/components/chat-entry-transition";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Chater",
  description: "本地 AI 聊天工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script id="appearance-color-mode" strategy="beforeInteractive">{`(() => {
          try {
            const saved = JSON.parse(localStorage.getItem("ai-chater-appearance-v1") || "{}");
            const preference = saved.colorMode;
            const colorMode = preference === "light" || preference === "dark"
              ? preference
              : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            document.documentElement.dataset.colorMode = colorMode;
            document.documentElement.style.colorScheme = colorMode;
          } catch {
            const colorMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
            document.documentElement.dataset.colorMode = colorMode;
            document.documentElement.style.colorScheme = colorMode;
          }
        })()`}</Script>
      </head>
      <body><div className="app-page-content">{children}</div><AppearanceControl /><ChatEntryTransition /></body>
    </html>
  );
}
