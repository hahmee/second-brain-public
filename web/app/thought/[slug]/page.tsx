import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAllThoughts, getThoughtBySlug } from "@/lib/thoughts";
import { loadEdges, getEdgesForSlug, type Edge } from "@/lib/edges";

export async function generateStaticParams() {
  return getAllThoughts().map((t) => ({ slug: t.slug }));
}

const ORIGIN_COLOR: Record<string, string> = {
  self: "bg-accent/15 text-accent border-accent-dim/40",
  external: "bg-slate-700/30 text-slate-300 border-slate-600/40",
  synthesized: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

const TYPE_LABEL: Record<string, string> = {
  semantic: "의미",
  reflective: "통찰",
  procedural: "절차",
  episodic: "사건",
  thesis: "주장",
  topic: "주제",
};

const EDGE_LABEL: Record<string, string> = {
  supports: "지지",
  extends: "확장",
  instantiates: "구체화",
  refines: "정련",
  requires: "전제",
  mentions: "언급",
  "topic-tag": "주제",
  "thesis-tag": "주장",
  "near-miss": "유사",
  contradicts: "반박",
  "triggered-by": "촉발",
  "derived-from": "파생",
};

export default async function ThoughtPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getThoughtBySlug(slug);
  if (!t) notFound();

  const allEdges = loadEdges();
  const { incoming, outgoing } = getEdgesForSlug(allEdges, t.slug);
  const allThoughts = getAllThoughts();
  const slugToClaim = new Map(allThoughts.map((x) => [x.slug, x.claim_ko]));

  return (
    <article className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <div>
        <Link
          href="/thoughts"
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          ← all thoughts
        </Link>
      </div>

      {/* Meta strip */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`rounded-sm border px-2 py-0.5 ${ORIGIN_COLOR[t.origin] ?? ""}`}>
          {t.origin}
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-500">{TYPE_LABEL[t.memory_type] ?? t.memory_type}</span>
        {t.topics.map((topic) => (
          <span key={topic} className="text-slate-500">
            · #{topic}
          </span>
        ))}
      </div>

      {/* Claim */}
      <h1 className="font-display text-3xl md:text-4xl leading-snug text-slate-100">
        {t.claim_ko}
      </h1>

      {/* Sources */}
      {t.sources.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">
            sources · {t.sources.length}
          </h2>
          <ul className="space-y-4">
            {t.sources.map((s, i) => (
              <li key={i} className="border-l-2 border-accent-dim pl-4 space-y-1">
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-100 underline decoration-slate-600 underline-offset-2 hover:decoration-slate-400 break-all"
                  >
                    {s.url}
                  </a>
                )}
                {s.date && <div className="text-xs text-slate-500">{s.date}</div>}
                {s.original && (
                  <blockquote className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">
                    {s.original}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Body */}
      {t.body && (
        <section className="prose-thought">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith("http")) {
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                }
                return <a href={href}>{children}</a>;
              },
            }}
          >
            {t.body}
          </ReactMarkdown>
        </section>
      )}

      {/* Edges */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">
            연결 · {outgoing.length + incoming.length}
          </h2>
          {outgoing.length > 0 && (
            <EdgeList
              title="이 thought 가 가리키는 곳 (outgoing)"
              edges={outgoing}
              direction="to"
              slugToClaim={slugToClaim}
              currentMV={t.meaning_version}
            />
          )}
          {incoming.length > 0 && (
            <EdgeList
              title="이 thought 를 가리키는 곳 (incoming)"
              edges={incoming}
              direction="from"
              slugToClaim={slugToClaim}
              currentMV={t.meaning_version}
            />
          )}
        </section>
      )}

      <div className="pt-8 text-xs text-slate-500">
        파일: <code className="text-accent-dim">memory/thoughts/{t.filename}</code>
      </div>
    </article>
  );
}

function EdgeList({
  title,
  edges,
  direction,
  slugToClaim,
  currentMV,
}: {
  title: string;
  edges: Edge[];
  direction: "from" | "to";
  slugToClaim: Map<string, string>;
  currentMV: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">{title}</div>
      <ul className="space-y-2">
        {edges.map((e, i) => {
          const otherSlug = direction === "to" ? e.to : e.from;
          const claim = slugToClaim.get(otherSlug) ?? "(missing thought)";
          const myVersion = direction === "to" ? e.from_meaning_version : e.to_meaning_version;
          const stale = myVersion != null && myVersion !== currentMV;
          return (
            <li key={i} className="rounded-md border border-white/[0.06] bg-white/[0.018] p-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.035]">
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className="text-accent">{EDGE_LABEL[e.type] ?? e.type}</span>
                {stale && (
                  <span className="rounded-sm border border-red-500/40 px-1 text-[10px] text-red-400">
                    stale
                  </span>
                )}
                {e.confidence != null && (
                  <span className="text-slate-500">· {e.confidence.toFixed(2)}</span>
                )}
              </div>
              <Link
                href={`/thought/${otherSlug}`}
                className="text-slate-200 underline-offset-4 transition-colors block hover:underline hover:decoration-slate-500"
              >
                {claim}
              </Link>
              {e.note && <div className="text-xs text-slate-500 mt-1">{e.note}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
