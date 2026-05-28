import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { memoryRoot } from "./memory-root";

export type Origin = "self" | "external" | "synthesized";
export type MemoryType =
  | "semantic"
  | "episodic"
  | "procedural"
  | "reflective"
  | "thesis"
  | "topic";

export type Source = {
  platform?: string;
  url: string;
  date: string;
  content_hash?: string;
  original?: string;
};

export type Thought = {
  slug: string;
  claim_ko: string;
  label_ko?: string;
  claim_fingerprint?: string;
  memory_type: MemoryType;
  origin: Origin;
  meaning_version: number;
  topics: string[];
  theses: string[];
  sources: Source[];
  body: string;
  filename: string;
};

const THOUGHTS_DIR = path.join(memoryRoot(), "thoughts");

function isThoughtFile(name: string): boolean {
  if (!name.endsWith(".md")) return false;
  if (name.startsWith("_")) return false;
  if (name.startsWith("example-")) return false;
  return true;
}

export function getAllThoughts(): Thought[] {
  if (!fs.existsSync(THOUGHTS_DIR)) {
    console.warn(`[thoughts] dir not found: ${THOUGHTS_DIR}`);
    return [];
  }
  const files = fs.readdirSync(THOUGHTS_DIR).filter(isThoughtFile);
  const thoughts = files.map((file) => {
    const full = path.join(THOUGHTS_DIR, file);
    const raw = fs.readFileSync(full, "utf-8");
    const { data, content } = matter(raw);
    const slug: string = data.slug ?? file.replace(/\.md$/, "");
    return {
      slug,
      claim_ko: data.claim_ko ?? "(no claim)",
      label_ko: typeof data.label_ko === "string" ? data.label_ko : undefined,
      claim_fingerprint: data.claim_fingerprint,
      memory_type: data.memory_type ?? "semantic",
      origin: data.origin ?? "self",
      meaning_version: Number(data.meaning_version ?? 1),
      topics: Array.isArray(data.topics) ? data.topics : [],
      theses: Array.isArray(data.theses)
        ? data.theses
        : Array.isArray(data.thesis)
          ? data.thesis
          : typeof data.thesis === "string"
            ? [data.thesis]
            : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      body: content.trim(),
      filename: file,
    } as Thought;
  });
  thoughts.sort((a, b) => {
    const da = a.sources[0]?.date ?? "";
    const db = b.sources[0]?.date ?? "";
    return db.localeCompare(da);
  });
  return thoughts;
}

export function getThoughtBySlug(slug: string): Thought | null {
  const all = getAllThoughts();
  return all.find((t) => t.slug === slug) ?? null;
}

// 통계
import type { Edge, EdgeType } from "./edges";
import { EDGE_TYPES } from "./edges";

export type Stats = {
  total: number;
  byOrigin: Record<Origin, number>;
  byMemoryType: Record<MemoryType, number>;
  topicCounts: Array<{ topic: string; count: number }>;
  sourceCount: number;
  edgeCount: number;
  edgeByType: Record<EdgeType, number>;
};

export function computeStats(thoughts: Thought[], edges: Edge[]): Stats {
  const byOrigin: Record<Origin, number> = { self: 0, external: 0, synthesized: 0 };
  const byMemoryType: Record<MemoryType, number> = {
    semantic: 0,
    episodic: 0,
    procedural: 0,
    reflective: 0,
    thesis: 0,
    topic: 0,
  };
  const topicMap = new Map<string, number>();
  let sourceCount = 0;
  for (const t of thoughts) {
    byOrigin[t.origin] = (byOrigin[t.origin] ?? 0) + 1;
    byMemoryType[t.memory_type] = (byMemoryType[t.memory_type] ?? 0) + 1;
    for (const tag of t.topics) {
      topicMap.set(tag, (topicMap.get(tag) ?? 0) + 1);
    }
    sourceCount += t.sources.length;
  }
  const topicCounts = Array.from(topicMap.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  const edgeByType = Object.fromEntries(
    EDGE_TYPES.map((t) => [t, edges.filter((e) => e.type === t).length]),
  ) as Record<EdgeType, number>;

  return {
    total: thoughts.length,
    byOrigin,
    byMemoryType,
    topicCounts,
    sourceCount,
    edgeCount: edges.length,
    edgeByType,
  };
}
