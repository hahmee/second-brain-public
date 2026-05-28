// TEMPR 단순화 검색 엔진 (Phase 2)
//
// 2축:
//   - semantic: text-embedding-3-large 벡터 코사인
//   - keyword:  BM25 + KO 바이그램 + 영문/숫자 단어
//
// 융합: Reciprocal Rank Fusion (RRF, k=60)
//
// graph / temporal 축은 다음 단계 (Phase 2.5).
//
// OpenAI key 없으면 keyword 만으로도 작동.

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getAllThoughts, type Thought } from "./thoughts";
import { memoryRoot } from "./memory-root";

const EMBEDDINGS_PATH = path.join(memoryRoot(), "embeddings.json");

type EmbeddingItem = { slug: string; content_hash: string; text: string; vector: number[] };
type EmbeddingsFile = { model: string; dim: number; items: EmbeddingItem[] };

// ─────────────────────────────────────────────────
// 토큰화 (BM25 용)
// ─────────────────────────────────────────────────
// 한국어: 글자 바이그램. 영문/숫자: 소문자 단어.
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 한국어 시퀀스 추출 → 바이그램
  const ko = text.match(/[가-힣]+/g) ?? [];
  for (const word of ko) {
    if (word.length === 1) {
      tokens.push(word);
    } else {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.push(word.slice(i, i + 2));
      }
    }
  }
  // 영문/숫자 단어
  const en = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const w of en) {
    if (w.length >= 2) tokens.push(w);
  }
  return tokens;
}

// ─────────────────────────────────────────────────
// BM25
// ─────────────────────────────────────────────────
type BM25Doc = { slug: string; tokens: string[]; tf: Map<string, number>; len: number };

function buildBM25Corpus(thoughts: Thought[]): {
  docs: BM25Doc[];
  idf: Map<string, number>;
  avgdl: number;
} {
  const docs: BM25Doc[] = thoughts.map((t) => {
    const text = `${t.label_ko ?? ""}\n${t.claim_ko}\n${t.topics.join(" ")}\n${t.body}`;
    const tokens = tokenize(text);
    const tf = new Map<string, number>();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    return { slug: t.slug, tokens, tf, len: tokens.length };
  });
  const N = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const tok of new Set(d.tokens)) df.set(tok, (df.get(tok) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [tok, n] of df) {
    // BM25 IDF: ln((N - n + 0.5) / (n + 0.5) + 1)
    idf.set(tok, Math.log((N - n + 0.5) / (n + 0.5) + 1));
  }
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / Math.max(N, 1);
  return { docs, idf, avgdl };
}

function bm25Score(
  queryTokens: string[],
  doc: BM25Doc,
  idf: Map<string, number>,
  avgdl: number,
  k1 = 1.5,
  b = 0.75,
): number {
  let score = 0;
  for (const tok of queryTokens) {
    const tf = doc.tf.get(tok) ?? 0;
    if (tf === 0) continue;
    const idfVal = idf.get(tok) ?? 0;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + (b * doc.len) / avgdl);
    score += idfVal * (numerator / denominator);
  }
  return score;
}

// ─────────────────────────────────────────────────
// Semantic (벡터 코사인)
// ─────────────────────────────────────────────────
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

let _embeddingsCache: EmbeddingsFile | null | undefined;
function loadEmbeddings(): EmbeddingsFile | null {
  if (_embeddingsCache !== undefined) return _embeddingsCache;
  if (!fs.existsSync(EMBEDDINGS_PATH)) {
    _embeddingsCache = null;
    return null;
  }
  _embeddingsCache = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf8")) as EmbeddingsFile;
  return _embeddingsCache;
}

async function embedQuery(query: string): Promise<{ model: string; dim: number; vector: number[] } | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const embeddings = loadEmbeddings();
  if (!embeddings) return null;
  const client = new OpenAI();
  const res = await client.embeddings.create({
    model: embeddings.model,
    input: query,
    dimensions: embeddings.dim,
  });
  return { model: embeddings.model, dim: embeddings.dim, vector: res.data[0].embedding };
}

// ─────────────────────────────────────────────────
// 단일축 검색
// ─────────────────────────────────────────────────
export type SearchMode = "semantic" | "keyword";

export type SearchHit = {
  thought: Thought;
  score: number; // 선택된 축의 raw score
  mode: SearchMode;
};

export async function search(
  query: string,
  opts: { topK?: number; mode?: SearchMode } = {},
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 8;
  const mode: SearchMode = opts.mode ?? "semantic";

  const thoughts = getAllThoughts();
  if (thoughts.length === 0 || !query.trim()) return [];
  const slugToThought = new Map(thoughts.map((t) => [t.slug, t]));

  if (mode === "keyword") {
    const { docs, idf, avgdl } = buildBM25Corpus(thoughts);
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    return docs
      .map((d) => ({ slug: d.slug, score: bm25Score(qTokens, d, idf, avgdl) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => ({
        thought: slugToThought.get(x.slug)!,
        score: x.score,
        mode,
      }));
  }

  // semantic
  const embeddings = loadEmbeddings();
  if (!embeddings || !process.env.OPENAI_API_KEY) return [];
  let q: Awaited<ReturnType<typeof embedQuery>>;
  try {
    q = await embedQuery(query);
  } catch (err) {
    console.warn("[search] semantic 축 실패:", err);
    return [];
  }
  if (!q) return [];

  return embeddings.items
    .filter((it) => slugToThought.has(it.slug))
    .map((it) => ({ slug: it.slug, score: cosine(q!.vector, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => ({
      thought: slugToThought.get(x.slug)!,
      score: x.score,
      mode,
    }));
}

export function hasEmbeddings(): boolean {
  return loadEmbeddings() !== null;
}
