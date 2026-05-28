# Second Brain — Knowledge Graph (code)

개인 지식 베이스의 atomic thought 들을 노드/엣지로 시각화하는 인터랙티브 그래프 앱 (코드 공개용).

### ▶ 라이브 데모: **https://hahmee.vercel.app/memory**

- **그래프 UI**: d3-force 기반 force-directed graph, 드래그/줌/필터/상세 패널
- **검색 엔진**: BM25 + 임베딩 시맨틱 검색을 RRF(Reciprocal Rank Fusion)로 융합
- **AI 질문**: 근거 thought 를 컨텍스트로 OpenAI 스트리밍 답변
- **스택**: Next.js 15 (App Router), React 19, TypeScript, Tailwind

> 이 저장소에는 **코드만** 포함되어 있고, 실제 thought 데이터(`memory/`)는 들어있지 않습니다. 그래서 그대로 실행하면 그래프는 빈 화면으로 뜹니다.

## 로컬 실행

```bash
cd web
npm install
npm run dev
```

검색(semantic·AI 질문)은 `OPENAI_API_KEY` 가 있을 때 동작하고, 없으면 keyword 검색으로 폴백됩니다. (`.env.example` 참고)
