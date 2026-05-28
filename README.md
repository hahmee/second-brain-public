# Second Brain — Knowledge Graph

개인 지식 베이스를 `thought` 단위로 구조화하고, 그래프 시각화·검색·AI 질문 응답으로 재사용하는 인터랙티브 웹 앱입니다. 이 공개 저장소는 앱 코드 공개용이며, 실제 개인 지식 데이터인 `memory/`는 포함하지 않습니다.

### 라이브 데모

https://hahmee.vercel.app/memory

## 왜 만들었나

범용 LLM은 개인의 프로젝트 기록, 학습 노트, 회고, 기술 선택 맥락을 기본적으로 알지 못합니다. 그 상태에서 글쓰기나 질의응답에 활용하면 실제 경험이 아니라 일반론에 가까운 답변이 생성되기 쉽습니다.

Second Brain은 흩어진 글과 프로젝트 기록을 `thought`라는 원자적 생각 단위로 정리하고, 각 thought에 출처, 주제, 타입, 관계, 임베딩을 부여해 LLM이 검색 가능한 지식 기반으로 활용할 수 있게 만든 시스템입니다.

새로운 LLM을 학습시키는 프로젝트가 아니라, 기존 LLM이 개인 기록을 정확히 검색하고, 인용하고, 재사용하도록 만드는 RAG 기반 지식 시스템입니다.

일반적인 LLM Wiki가 문서를 chunk 단위로 인덱싱한다면, Second Brain은 문서가 아니라 생각과 주장 단위인 `thought`를 인덱싱합니다. 그래서 "어떤 문서에 무엇이 적혀 있는가"보다 "어떤 문제를 어떻게 이해했고, 어떤 판단을 했는가"를 답하는 데 초점을 둡니다.

## 핵심 기능

- **Knowledge Graph UI**: `memory/thoughts/*.md`와 `memory/edges.jsonl`을 읽어 thought 간 관계를 force-directed graph로 시각화합니다.
- **Thought 상세 페이지**: 각 thought의 주장, 출처, 본문, incoming/outgoing edge를 개별 페이지로 보여줍니다.
- **검색 엔진**: semantic search와 keyword search를 지원합니다. semantic search는 OpenAI embedding과 cosine similarity를 사용하고, keyword search는 BM25와 한국어 바이그램 토큰화를 사용합니다.
- **AI 질문 응답**: `/api/ask`가 관련 thought를 검색한 뒤, 검색 결과만 LLM 컨텍스트로 전달해 스트리밍 답변을 생성합니다.
- **폴백 동작**: `OPENAI_API_KEY`나 embedding 파일이 없으면 AI 질문 대신 keyword 검색 모드로 동작합니다.

## /ask 동작 흐름

`/memory` 페이지의 질문창에 질문을 입력하면 다음 순서로 동작합니다.

```text
사용자 질문
  ↓
/api/search 또는 /api/ask
  ↓
web/lib/search.ts
  - semantic: 질문을 embedding으로 변환하고 thought embedding과 cosine similarity 비교
  - keyword: BM25 + 한국어 바이그램으로 텍스트 매칭
  ↓
관련 thought top-k 선택
  ↓
/api/ask가 thought claim/body/topics를 LLM 컨텍스트로 구성
  ↓
OpenAI gpt-4o-mini 스트리밍 답변
  ↓
화면에 답변과 근거 thought 표시
```

중요한 점은 전체 저장소를 LLM에게 보내지 않는다는 것입니다. 먼저 검색으로 관련 thought만 고른 뒤, 그 일부만 컨텍스트로 전달합니다.

## LLM Wiki와의 차이

| 구분 | 일반 LLM Wiki | Second Brain |
|---|---|---|
| 인덱싱 단위 | 문서 chunk | thought, 즉 하나의 주장/생각 |
| 주 목적 | 내부 문서 검색과 질의응답 | 개인의 생각, 판단, 프로젝트 맥락 재사용 |
| 답하는 질문 | "어느 문서에 무엇이 있나" | "나는 이 문제를 어떻게 이해했고 판단했나" |
| 근거 구조 | 문서 조각 | claim, source, topic, edge, body |
| 활용 표면 | 문서 Q&A | 검색, 포트폴리오 봇, 면접 답변, 글쓰기, 강의 자료 |

## 데이터 모델

이 앱은 저장소 루트의 `memory/` 디렉터리를 기대합니다.

```text
memory/
  thoughts/
    <slug>.md          # thought 원문. frontmatter + markdown body
  edges.jsonl          # thought 사이의 관계
  embeddings.json      # semantic search용 embedding cache
```

thought 파일은 대략 다음 필드를 사용합니다.

```yaml
slug: mcp-turns-llm-from-talker-to-doer
claim_ko: MCP는 LLM에게 외부 환경에서 실제로 행동할 수 있는 통로를 표준화한다.
claim_fingerprint: sha256:...
memory_type: semantic
origin: self
meaning_version: 1
topics:
  - MCP
  - AI Agent
sources:
  - platform: blog
    url: /blog/tech/mcp-model-context-protocol
    date: '2025-10-02'
    content_hash: sha256:...
    original: 원문 발췌
```

edge는 `from`, `to`, `type`, `confidence`, `note`를 가진 JSONL 한 줄로 저장됩니다. 앱은 edge를 그래프 링크와 thought 상세 페이지의 연결 정보로 사용합니다.

## 주요 코드 위치

| 영역 | 파일 |
|---|---|
| 그래프 페이지 | `web/app/memory/page.tsx` |
| 그래프 UI | `web/components/ForceGraph.tsx` |
| 검색창과 AI 답변 UI | `web/components/SearchDropdown.tsx` |
| thought 로딩 | `web/lib/thoughts.ts` |
| edge 로딩 | `web/lib/edges.ts` |
| 검색 엔진 | `web/lib/search.ts` |
| 검색 API | `web/app/api/search/route.ts` |
| AI 질문 API | `web/app/api/ask/route.ts` |
| memory 경로 탐색 | `web/lib/memory-root.ts` |
| Vercel 파일 트레이싱 | `web/next.config.mjs` |

## 기술 스택

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- d3-force
- OpenAI API
- gray-matter

## 로컬 실행

```bash
cd web
npm install
npm run dev
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:3000/memory
```

semantic 검색과 AI 질문은 `OPENAI_API_KEY`가 있을 때 동작합니다.

```bash
cp ../.env.example .env.local
# .env.local에 OPENAI_API_KEY 설정
npm run dev
```

## 공개 저장소의 범위

이 저장소에는 앱 코드만 포함되어 있습니다. 실제 개인 지식 데이터인 `memory/`는 공개하지 않습니다.

따라서 이 저장소를 그대로 실행하면 graph는 비어 있을 수 있습니다. 실제 데이터로 실행하려면 저장소 루트에 `memory/thoughts`, `memory/edges.jsonl`, `memory/embeddings.json`을 준비해야 합니다.

## 현재 한계

- public repo에는 ingestion과 embedding 생성 파이프라인이 포함되어 있지 않습니다.
- 현재 공개 앱 코드는 semantic search 또는 keyword search 중 하나를 사용합니다. 문서화된 장기 구조인 graph/temporal 축까지 포함한 완전한 TEMPR 라우팅은 별도 단계입니다.
- `/api/ask`는 검색된 thought를 기반으로 답변하도록 프롬프트를 제한하지만, 생성 결과의 citation을 코드 레벨에서 강제 검증하는 단계는 아직 포함되어 있지 않습니다.
- 데이터가 없는 상태에서는 UI와 API 구조만 확인할 수 있습니다.
