import fs from "node:fs";
import path from "node:path";
import { memoryRoot } from "./memory-root";

export const EDGE_TYPES = [
  "supports",
  "extends",
  "instantiates",
  "refines",
  "near-miss",
  "topic-tag",
  "thesis-tag",
  "contradicts",
  "triggered-by",
  "requires",
  "mentions",
  "derived-from",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

export type Edge = {
  from: string;
  to: string;
  type: EdgeType;
  from_meaning_version?: number;
  to_meaning_version?: number;
  confidence?: number;
  note?: string;
  created?: string;
};

const EDGES_PATH = path.join(memoryRoot(), "edges.jsonl");

export function loadEdges(): Edge[] {
  if (!fs.existsSync(EDGES_PATH)) return [];
  const text = fs.readFileSync(EDGES_PATH, "utf-8");
  const out: Edge[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as Edge);
  }
  return out;
}

// 특정 thought 에 연결된 엣지를 incoming/outgoing 으로 분리
export function getEdgesForSlug(
  edges: Edge[],
  slug: string,
): { incoming: Edge[]; outgoing: Edge[] } {
  const incoming: Edge[] = [];
  const outgoing: Edge[] = [];
  for (const e of edges) {
    if (e.from === slug) outgoing.push(e);
    if (e.to === slug) incoming.push(e);
  }
  return { incoming, outgoing };
}
