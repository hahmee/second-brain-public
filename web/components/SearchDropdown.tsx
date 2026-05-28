"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "semantic" | "keyword";

type Hit = {
  slug: string;
  claim_ko: string;
  label_ko?: string;
  topics: string[];
  origin: "self" | "external" | "synthesized";
  memory_type:
    | "semantic"
    | "episodic"
    | "procedural"
    | "reflective"
    | "thesis"
    | "topic";
  score: number;
};

type AskStatus = "idle" | "loading" | "done" | "error";

const TYPE_LABEL: Record<Hit["memory_type"], string> = {
  semantic: "의미",
  reflective: "통찰",
  procedural: "절차",
  episodic: "사건",
  thesis: "주장",
  topic: "주제",
};

export default function SearchDropdown({
  semanticReady,
}: {
  semanticReady: boolean;
}) {
  const router = useRouter();
  const mode: Mode = semanticReady ? "semantic" : "keyword";

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // keyword 폴백 상태 (semantic 불가일 때만 사용)
  const [kwQuery, setKwQuery] = useState("");
  const [kwHits, setKwHits] = useState<Hit[]>([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwError, setKwError] = useState<string | null>(null);
  const [kwActiveIdx, setKwActiveIdx] = useState(-1);

  // semantic(질문→AI) 상태
  const [askedQuery, setAskedQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Hit[]>([]);
  const [askStatus, setAskStatus] = useState<AskStatus>("idle");
  const [askError, setAskError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 바깥 클릭 → 닫기
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function runKeyword(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setKwQuery(trimmed);
    setKwLoading(true);
    setKwError(null);
    setOpen(true);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&mode=keyword&topK=8`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        setKwError(`HTTP ${res.status}`);
        setKwHits([]);
      } else {
        const data: { hits: Hit[] } = await res.json();
        setKwHits(data.hits);
        setKwActiveIdx(data.hits.length > 0 ? 0 : -1);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setKwError(err instanceof Error ? err.message : String(err));
    } finally {
      setKwLoading(false);
    }
  }

  async function runAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAskedQuery(trimmed);
    setOpen(true);
    setAnswer("");
    setSources([]);
    setAskError(null);
    setAskStatus("loading");

    try {
      const sres = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&mode=semantic&topK=6`,
        { signal: controller.signal },
      );
      if (sres.ok) {
        const data: { hits: Hit[] } = await sres.json();
        setSources(data.hits ?? []);
        if ((data.hits ?? []).length === 0) {
          setAskError("관련 thought 가 없어요. 다른 표현으로 질문해보세요.");
          setAskStatus("error");
          return;
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, mode: "semantic" }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setAskError(text || `HTTP ${res.status}`);
        setAskStatus("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setAnswer((prev) => prev + chunk);
      }
      setAskStatus("done");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAskError(err instanceof Error ? err.message : String(err));
      setAskStatus("error");
    }
  }

  function submit() {
    if (!query.trim()) return;
    if (mode === "semantic") runAsk(query);
    else runKeyword(query);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (mode === "semantic") {
      if (e.key === "Enter") {
        e.preventDefault();
        runAsk(query);
      }
      return;
    }
    // keyword 폴백 모드
    if (e.key === "ArrowDown" && open && kwHits.length > 0) {
      e.preventDefault();
      setKwActiveIdx((i) => (i + 1) % kwHits.length);
    } else if (e.key === "ArrowUp" && open && kwHits.length > 0) {
      e.preventDefault();
      setKwActiveIdx((i) => (i - 1 + kwHits.length) % kwHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && kwActiveIdx >= 0 && kwHits[kwActiveIdx] && kwQuery === query.trim()) {
        goTo(kwHits[kwActiveIdx].slug);
      } else {
        runKeyword(query);
      }
    }
  }

  function goTo(slug: string) {
    setOpen(false);
    router.push(`/thought/${slug}`);
  }

  const submitDisabled = !query.trim();

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-ink-900/[0.88] p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (mode === "semantic" && askedQuery) setOpen(true);
            if (mode === "keyword" && kwHits.length > 0) setOpen(true);
          }}
          placeholder={
            mode === "semantic"
              ? "이 second brain 에 질문해 보세요…"
              : "thought 검색… (semantic 불가)"
          }
          className="min-w-0 flex-1 rounded-md border border-transparent bg-white/[0.035] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-accent-dim/60 focus:bg-ink-950/80 focus:outline-none focus:ring-2 focus:ring-accent-dim/20"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitDisabled}
          aria-label={mode === "semantic" ? "AI 에게 질문" : "검색 실행"}
          className={`shrink-0 whitespace-nowrap rounded-md border px-3.5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-dim/70 ${
            submitDisabled
              ? "cursor-not-allowed border-white/[0.04] bg-white/[0.015] text-slate-700"
              : mode === "semantic"
                ? "border-emerald-400/35 bg-emerald-400/[0.11] text-emerald-300 hover:bg-emerald-400/[0.18]"
                : "border-amber-400/35 bg-amber-400/[0.11] text-amber-300 hover:bg-amber-400/[0.18]"
          }`}
        >
          {mode === "semantic" ? "질문" : "검색"}
        </button>
      </div>

      {mode === "keyword" && (
        <div className="px-2 pt-2 text-[10px] text-slate-500">
          OPENAI_API_KEY 미설정 — keyword 검색으로 폴백됨.
        </div>
      )}

      {/* keyword 폴백 드롭다운 */}
      {mode === "keyword" && open && kwQuery && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-white/[0.08] bg-ink-900/95 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          {kwLoading && kwHits.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500">검색 중…</div>
          )}
          {kwError && (
            <div className="px-4 py-3 text-xs text-red-400">오류: {kwError}</div>
          )}
          {!kwLoading && !kwError && kwHits.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500">
              매칭된 thought 없음.
            </div>
          )}
          {kwHits.length > 0 && (
            <ul>
              {kwHits.map((h, i) => (
                <li key={h.slug}>
                  <button
                    type="button"
                    onMouseEnter={() => setKwActiveIdx(i)}
                    onClick={() => goTo(h.slug)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-dim/70 ${
                      kwActiveIdx === i
                        ? "bg-white/[0.055]"
                        : "hover:bg-white/[0.035]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                      <span className="text-slate-500">{h.origin}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-500">{TYPE_LABEL[h.memory_type]}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-amber-500/80">
                        bm25 {h.score.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm leading-snug text-slate-100">
                      {h.claim_ko}
                    </div>
                    {h.topics.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                        {h.topics.slice(0, 4).map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* semantic AI 답변 드롭다운 */}
      {mode === "semantic" && open && askedQuery && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-white/[0.08] bg-ink-900/95 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="space-y-2 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">
                AI 답변
              </div>
              <div className="flex items-center gap-3 text-xs">
                {askStatus === "loading" && (
                  <span className="text-slate-500">생성 중…</span>
                )}
                {askStatus === "done" && (
                  <span className="text-emerald-500/70">완료</span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-sm px-2 py-1 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-500">Q. {askedQuery}</div>

            {askError && (
              <div className="text-sm text-red-400 leading-relaxed">
                {askError}
              </div>
            )}

            {!askError && askStatus === "loading" && answer === "" && (
              <div className="text-sm text-slate-500">
                근거 thought 를 읽고 답을 합성 중…
              </div>
            )}

            {answer && (
              <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                {answer}
                {askStatus === "loading" && (
                  <span className="ml-1 inline-block animate-pulse text-accent">
                    ▍
                  </span>
                )}
              </div>
            )}
          </div>

          {sources.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">
                근거 thought · {sources.length}
              </div>
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.slug}>
                    <button
                      type="button"
                      onClick={() => goTo(s.slug)}
                      className="block w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                        <span className="text-accent">{s.slug}</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-emerald-500/80">
                          cos {s.score.toFixed(3)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs leading-snug text-slate-300">
                        {s.claim_ko}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
