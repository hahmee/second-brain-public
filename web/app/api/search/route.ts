import { NextRequest } from "next/server";
import { search, type SearchMode } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const modeParam = url.searchParams.get("mode");
  const mode: SearchMode = modeParam === "keyword" ? "keyword" : "semantic";
  const topKRaw = parseInt(url.searchParams.get("topK") ?? "8", 10);
  const topK = Math.min(Math.max(Number.isFinite(topKRaw) ? topKRaw : 8, 1), 20);

  if (!q) return Response.json({ hits: [], mode });

  const hits = await search(q, { topK, mode });
  return Response.json({
    mode,
    hits: hits.map((h) => ({
      slug: h.thought.slug,
      claim_ko: h.thought.claim_ko,
      label_ko: h.thought.label_ko,
      topics: h.thought.topics,
      origin: h.thought.origin,
      memory_type: h.thought.memory_type,
      score: h.score,
    })),
  });
}
