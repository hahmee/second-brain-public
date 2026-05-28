import "./globals.css";
import type { Metadata } from "next";
import ConditionalHeader from "@/components/ConditionalHeader";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "개인 지식 베이스 — 기술 기록과 마케팅 메모에서 추출한 atomic thought 들",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <ConditionalHeader />
        {children}
      </body>
    </html>
  );
}
