import Link from "next/link";
import { getAllThoughts, computeStats, type Thought } from "@/lib/thoughts";
import { loadEdges } from "@/lib/edges";

const ORIGIN_LABEL: Record<string, string> = {
  self: "self",
  external: "external",
  synthesized: "synthesized",
};
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

export default function ThoughtsIndex() {
  const thoughts = getAllThoughts();
  const edges = loadEdges();
  const stats = computeStats(thoughts, edges);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
      {/* Header */}
      <section className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-slate-500">
          all thoughts
        </div>
        <h1 className="font-display text-4xl tracking-tight text-slate-100">
          {stats.total} 개의 한 줄 주장.
        </h1>
        <p className="text-slate-400 max-w-2xl">
          기술 기록과 마케팅 메모에서 추출한 atomic claim.
          <code className="text-accent-dim ml-1">memory/thoughts/*.md</code> 를
          정적으로 읽어 렌더한 것.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="thoughts" value={stats.total} />
        <StatBox label="sources cited" value={stats.sourceCount} />
        <StatBox
          label="origin · self / ext / syn"
          value={`${stats.byOrigin.self} / ${stats.byOrigin.external} / ${stats.byOrigin.synthesized}`}
        />
        <StatBox label="edges" value={stats.edgeCount} />
      </section>

      {/* Top topics */}
      {stats.topicCounts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">topics</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topicCounts.map(({ topic, count }) => (
              <span
                key={topic}
                className="rounded-sm border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-xs text-slate-300"
              >
                {topic}
                <span className="text-slate-500 ml-1">· {count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Thought list */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-slate-500">
          all thoughts · {thoughts.length}
        </h2>
        <ul className="divide-y divide-ink-800 border-y border-ink-800">
          {thoughts.map((t) => (
            <ThoughtRow key={t.slug} t={t} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-display text-slate-100">{value}</div>
    </div>
  );
}

function ThoughtRow({ t }: { t: Thought }) {
  const date = t.sources[0]?.date ?? "";
  return (
    <li className="py-5">
      <Link href={`/thought/${t.slug}`} className="group block space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`rounded-sm border px-2 py-0.5 ${ORIGIN_COLOR[t.origin] ?? ""}`}>
            {ORIGIN_LABEL[t.origin] ?? t.origin}
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">{TYPE_LABEL[t.memory_type] ?? t.memory_type}</span>
          {date && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500">{date}</span>
            </>
          )}
        </div>
        <p className="text-slate-100 text-lg leading-snug underline-offset-4 transition-colors group-hover:underline group-hover:decoration-slate-500">
          {t.claim_ko}
        </p>
        {t.topics.length > 0 && (
          <div className="flex gap-2 flex-wrap text-xs text-slate-500">
            {t.topics.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}
