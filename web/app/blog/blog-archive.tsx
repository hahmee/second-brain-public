"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { BlogCategorySlug } from "@/lib/blog";

const MARKETING_BADGE = "bg-accent/10 text-accent border-accent-dim/40";

export type BlogListItem = {
  key: string;
  title: string;
  description?: string;
  href: string;
  categorySlug: BlogCategorySlug;
  categoryLabel: string;
  tags: string[];
  topicId?: string;
};

export type BlogTabKind = "all" | "tech" | "tag" | "topic" | "marketing";

export type BlogTab = {
  id: string;
  label: string;
  count: number;
  kind: BlogTabKind;
  tag?: string;
  topicId?: string;
  group?: "category" | "filter";
};

function matchesTab(item: BlogListItem, tab: BlogTab): boolean {
  switch (tab.kind) {
    case "all":
      return true;
    case "tech":
      return item.categorySlug === "tech";
    case "marketing":
      return item.categorySlug === "marketing";
    case "tag":
      return item.categorySlug === "tech" && !!tab.tag && item.tags.includes(tab.tag);
    case "topic":
      return item.categorySlug === "tech" && !!tab.topicId && item.topicId === tab.topicId;
  }
}

function matchesQuery(item: BlogListItem, query: string): boolean {
  return (
    item.title.toLowerCase().includes(query) ||
    (item.description?.toLowerCase().includes(query) ?? false) ||
    item.tags.some((tag) => tag.toLowerCase().includes(query))
  );
}

export function BlogArchive({ items, tabs }: { items: BlogListItem[]; tabs: BlogTab[] }) {
  const [activeId, setActiveId] = useState("all");
  const [query, setQuery] = useState("");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = items.filter(
    (item) =>
      matchesTab(item, active) &&
      (!normalizedQuery || matchesQuery(item, normalizedQuery)),
  );

  return (
    <div className="mt-10">
      <div className="relative max-w-md">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="제목, 설명, 태그로 검색"
          aria-label="블로그 글 검색"
          className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-accent-dim/60 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-accent-dim/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute inset-y-0 right-3 my-auto grid h-5 w-5 place-items-center rounded-sm text-slate-500 transition-colors hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-8 md:flex-row md:gap-10">
        <nav role="tablist" aria-label="블로그 카테고리" className="md:w-52 md:flex-shrink-0">
          <ul className="flex flex-wrap gap-2 md:flex-col md:gap-0.5">
            {tabs.map((tab, i) => {
              const selected = tab.id === active.id;
              const startsFilterGroup =
                tab.group === "filter" && tabs[i - 1]?.group !== "filter";
              return (
                <Fragment key={tab.id}>
                  {startsFilterGroup && (
                    <li
                      aria-hidden
                      className="basis-full border-t border-ink-800 pt-2 md:my-2 md:pt-0"
                    />
                  )}
                  <li>
                    <button
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveId(tab.id)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-dim/70 md:w-full md:justify-between md:rounded-md md:px-3 ${
                        selected
                          ? "border-white/[0.18] bg-white/[0.06] text-slate-100"
                          : "border-transparent text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"
                      }`}
                    >
                      <span className="truncate">{tab.label}</span>
                      <span className={selected ? "text-slate-300" : "text-slate-600"}>
                        {tab.count}
                      </span>
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {normalizedQuery ? "검색 결과가 없습니다." : "아직 글이 없습니다."}
            </p>
          ) : (
            <ul className="divide-y divide-ink-800 border-y border-ink-800">
              {filtered.map((item) => (
                <BlogRow key={item.key} item={item} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function BlogRow({ item }: { item: BlogListItem }) {
  const isMarketing = item.categorySlug === "marketing";
  const showBadges = isMarketing || item.tags.length > 0;

  return (
    <li className="py-5">
      <Link href={item.href} className="group block space-y-2">
        {showBadges && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {isMarketing ? (
              <span className={`rounded-sm border px-2 py-0.5 ${MARKETING_BADGE}`}>
                {item.categoryLabel}
              </span>
            ) : (
              item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm border border-white/[0.08] px-2 py-0.5 text-slate-400"
                >
                  {tag}
                </span>
              ))
            )}
          </div>
        )}
        <h3 className="text-lg leading-snug text-slate-100 underline-offset-4 transition-colors group-hover:underline group-hover:decoration-slate-500">
          {item.title}
        </h3>
        {item.description && (
          <p className="line-clamp-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            {item.description}
          </p>
        )}
      </Link>
    </li>
  );
}
