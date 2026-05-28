import { NextRequest } from "next/server";
import OpenAI from "openai";
import { search, type SearchMode } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini";
const TOP_K = 6;
const MAX_BODY_CHARS = 1200;

export async function POST(req: NextRequest) {
  let body: { query?: string; mode?: SearchMode };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const query = (body.query ?? "").trim();
  if (!query) return new Response("query required", { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY 미설정", { status: 500 });
  }

  const mode: SearchMode = body.mode === "keyword" ? "keyword" : "semantic";
  const hits = await search(query, { topK: TOP_K, mode });
  if (hits.length === 0) {
    return new Response("관련 thought 가 없어요. 다른 키워드로 시도해보세요.", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const context = hits
    .map((h, i) => {
      const body = (h.thought.body ?? "").slice(0, MAX_BODY_CHARS);
      const topics = h.thought.topics.length ? `\ntopics: ${h.thought.topics.join(", ")}` : "";
      return `[${i + 1}] slug: ${h.thought.slug}\nclaim: ${h.thought.claim_ko}${topics}\n\n${body}`;
    })
    .join("\n\n---\n\n");

  const system = `당신은 한 개인의 second brain 어시스턴트입니다.
아래 <컨텍스트>의 thought 들은 사용자가 직접 정리한 글입니다.
규칙:
- 컨텍스트에 있는 내용만 근거로 답하세요. 추측하거나 일반 지식으로 보충하지 마세요.
- 컨텍스트가 질문에 답하기에 부족하면 "관련 thought 에 답이 없어요" 라고 솔직히 말하세요.
- 답할 때 근거가 된 thought 를 (slug) 형식으로 인용하세요. 예: (harness-context-curation)
- 한국어, 간결하게, 1~3 단락. 불필요한 서론 금지.

<컨텍스트>
${context}
</컨텍스트>`;

  const client = new OpenAI();

  let upstream;
  try {
    upstream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`OpenAI 호출 실패: ${msg}`, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n\n[stream error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
