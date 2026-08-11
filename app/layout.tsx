import type { Metadata } from "next";
import { AppearanceControl } from "@/components/appearance-control";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Chater",
  description: "本地 AI 聊天工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><div className="app-page-content">{children}</div><AppearanceControl /></body>
    </html>
  );
}
