"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ConditionalHeader() {
  const pathname = usePathname();
  // 메인(/)은 버튼 랜딩, memory graph(/memory)는 자체 사이드바를 가지므로 헤더 숨김
  if (pathname === "/" || pathname === "/memory") return null;

  const links = [
    { href: "/memory", label: "Second Brain" },
    { href: "/blog", label: "blog" },
  ];

  return (
    <header className="border-b border-ink-700 bg-ink-900/60 backdrop-blur sticky top-0 z-10">
      <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-6 text-sm">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`font-display underline underline-offset-4 transition-colors ${
                active
                  ? "text-slate-100 decoration-slate-400"
                  : "text-slate-400 decoration-slate-700 hover:text-slate-100 hover:decoration-slate-400"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
