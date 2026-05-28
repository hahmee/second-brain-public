"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import SearchDropdown from "./SearchDropdown";

type GraphSource = {
  platform?: string;
  url: string;
  date: string;
  original?: string;
};

export type GraphNode = {
  id: string;
  claim_ko: string;
  label_ko?: string;
  origin: "self" | "external" | "synthesized";
  memory_type:
    | "semantic"
    | "episodic"
    | "procedural"
    | "reflective"
    | "thesis"
    | "topic";
  topics: string[];
  weight: number;
  sources?: GraphSource[];
  body?: string;
  filename?: string;
  virtual?: boolean;
};

export type GraphLink = {
  source: string;
  target: string;
  type:
    | "supports"
    | "extends"
    | "near-miss"
    | "instantiates"
    | "requires"
    | "triggered-by"
    | "refines"
    | "mentions"
    | "topic-tag"
    | "thesis-tag"
    | "contradicts"
    | "derived-from";
  note?: string;
};

type SimNode = GraphNode & {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // d3-force가 드래그 고정에 사용. null/undefined면 자유 노드.
  fx?: number | null;
  fy?: number | null;
};

type SimLink = { source: string; target: string; type: GraphLink["type"] };

type GraphScope = "core" | "authored" | "all";

const ORIGINS = ["self", "external", "synthesized"] as const;
const NODE_TYPES = [
  "semantic",
  "reflective",
  "procedural",
  "episodic",
  "thesis",
  "topic",
] as const satisfies readonly GraphNode["memory_type"][];
const EDGE_TYPES = [
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

const ORIGIN_FILL: Record<GraphNode["origin"], string> = {
  self: "#e2e8f0",
  synthesized: "#9aa6b6",
  external: "#64748b",
};

// 노드 유형은 회색 명도로만 구분 (밝을수록 상위/추상 개념).
const MEMORY_TYPE_COLOR: Record<GraphNode["memory_type"], string> = {
  thesis: "#e2e8f0",
  semantic: "#cbd5e1",
  reflective: "#aab4c4",
  procedural: "#94a3b8",
  episodic: "#7b8595",
  topic: "#64748b",
};

// 엣지는 단일 회색. 유형 구분은 색이 아니라 선 모양(dash 패턴)으로.
const EDGE_STROKE = "#64748b";

const EDGE_DASH: Record<GraphLink["type"], string> = {
  // 직접적·강한 논리 관계 → 실선
  supports: "",
  extends: "",
  instantiates: "",
  requires: "",
  // 변형/파생 → 긴 dash
  refines: "7 4",
  "derived-from": "7 4",
  // 유사·태그·약한 연관 → 점선
  "near-miss": "2 3",
  "topic-tag": "2 3",
  "thesis-tag": "2 3",
  mentions: "2 3",
  // 긴장 관계(대립·촉발) → dash-dot
  contradicts: "6 3 1 3",
  "triggered-by": "6 3 1 3",
};

const MIN_GRAPH_W = 420;
const NODE_RADIUS = 5.8;
const NODE_WEIGHT_RADIUS_STEP = 1.2;
const DETAIL_EXIT_MS = 160;
const DEPTH_LIMIT = 160;
const GRAPH_LABEL_MAX_CHARS = 28;
const GRAPH_LABEL_MAX_TOKENS = 5;
const SPACING_MIN = 120;
const SPACING_MAX = 480;
const SPACING_STEP = 20;
// d3 forceManyBody 반발력(음수). 노드가 많을수록 약하게(과확산·성능).
const CHARGE_BY_NODE_COUNT = {
  compact: -1100,
  medium: -780,
  dense: -520,
};
const LINK_STRENGTH = 0.45; // 엣지 스프링 강도
const COLLIDE_PADDING = 26; // 노드 반경에 더하는 충돌 여유(라벨 공간 포함)
const ANCHOR_STRENGTH = 0.05; // 섬(컴포넌트)을 제 영역 앵커로 끌어당기는 힘
const VELOCITY_DECAY = 0.42; // 마찰(0~1, 클수록 빨리 안정)
const ALPHA_DECAY = 0.022; // 식는 속도(작을수록 오래 정렬)

const MEMORY_DEPTH: Record<GraphNode["memory_type"], number> = {
  semantic: 28,
  procedural: -36,
  reflective: 82,
  episodic: -76,
  thesis: 116,
  topic: -104,
};

const ORIGIN_DEPTH: Record<GraphNode["origin"], number> = {
  self: 16,
  external: -34,
  synthesized: 58,
};

const GRAPH_SCOPES: Array<{
  id: GraphScope;
  label: string;
  description: string;
}> = [
  {
    id: "core",
    label: "핵심",
    description: "연결 2+ · self/synthesized",
  },
  {
    id: "authored",
    label: "내 생각",
    description: "external 제외",
  },
  {
    id: "all",
    label: "전체",
    description: "모든 thought",
  },
];

const ORIGIN_LABEL: Record<GraphNode["origin"], string> = {
  self: "self",
  external: "external",
  synthesized: "synthesized",
};

const MEMORY_TYPE_LABEL: Record<GraphNode["memory_type"], string> = {
  semantic: "의미",
  reflective: "통찰",
  procedural: "절차",
  episodic: "사건",
  thesis: "주장",
  topic: "주제",
};

const EDGE_LABEL: Record<GraphLink["type"], string> = {
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

const LABEL_STOPWORDS = new Set([
  "것",
  "것은",
  "것이",
  "것을",
  "이는",
  "이것",
  "저것",
  "하나",
  "중",
  "때",
  "경우",
  "방식",
  "대한",
  "위한",
  "통해",
  "그리고",
  "하지만",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
]);

const LABEL_IMPORTANT_KO = [
  "컨텍스트",
  "하네스",
  "에이전트",
  "프록시",
  "쿠키",
  "캐시",
  "인증",
  "검증",
  "설계",
  "해결",
  "분리",
  "방지",
  "등록",
  "위임",
  "확장",
  "축소",
  "저장",
  "반영",
  "패턴",
  "구조",
  "원칙",
  "문제",
  "도구",
  "검색",
  "모델",
  "테스트",
];

const LABEL_IMPORTANT_TERMS = new Set([
  "ai",
  "api",
  "bff",
  "bm25",
  "cdn",
  "claude",
  "graphql",
  "jwt",
  "mcp",
  "msa",
  "msw",
  "nat",
  "next.js",
  "nextjs",
  "openai",
  "react",
  "samesite",
  "set-cookie",
  "solid",
  "spring",
  "ssr",
  "tanstack",
  "urql",
  "vpc",
]);

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function seed01(input: string): number {
  return (hashString(input) % 1000) / 1000;
}

function makeGraphLabel(node: GraphNode): string {
  const label = node.label_ko?.trim();
  if (label) return label;
  return summarizeLabel(node.claim_ko, GRAPH_LABEL_MAX_CHARS);
}

function summarizeLabel(input: string, maxChars: number): string {
  const cleaned = normalizeLabelText(input);
  if (cleaned.length <= maxChars) return cleaned;

  const bestClause = chooseLabelClause(cleaned);
  const clauseLabel = makeKeywordLabel(collectLabelTokens(bestClause), maxChars);
  if (clauseLabel) return clauseLabel;

  const fullLabel = makeKeywordLabel(collectLabelTokens(cleaned), maxChars);
  if (fullLabel) return fullLabel;

  return fitLabelChars(cleaned, maxChars);
}

function normalizeLabelText(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`"“”]/g, "")
    .replace(/\([^)]{8,}\)/g, " ")
    .replace(/\s*[·•]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function chooseLabelClause(text: string): string {
  const clauses = text
    .split(/[,;]|(?:\s+(?:그리고|하지만|그러나|또는|혹은)\s+)/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  if (clauses.length === 0) return text;

  return clauses.reduce((best, clause) =>
    scoreLabelClause(clause) > scoreLabelClause(best) ? clause : best
  );
}

function scoreLabelClause(clause: string): number {
  const tokens = collectLabelTokens(clause);
  const importantHits = LABEL_IMPORTANT_KO.filter((word) => clause.includes(word)).length;
  const techHits = tokens.filter((token) => LABEL_IMPORTANT_TERMS.has(token.text.toLowerCase())).length;
  return importantHits * 4 + techHits * 3 + Math.min(clause.length, 80) / 80;
}

type LabelToken = {
  text: string;
  index: number;
  score: number;
};

function collectLabelTokens(text: string): LabelToken[] {
  const rawTokens = Array.from(
    text.matchAll(/#?[A-Za-z0-9][A-Za-z0-9.+/#-]*|[가-힣]+/g),
    (match) => match[0]
  );
  const total = Math.max(rawTokens.length, 1);

  return rawTokens
    .map((raw, index) => {
      const token = cleanLabelToken(raw);
      return { text: token, index, score: scoreLabelToken(token, index, total) };
    })
    .filter((token) => token.text.length > 1 && Number.isFinite(token.score));
}

function cleanLabelToken(raw: string): string {
  const token = raw.replace(/^[^\w#가-힣]+|[^\w가-힣.+/#-]+$/g, "");
  if (!/^[가-힣]+$/u.test(token)) return token;

  return token
    .replace(/(으로써|으로|에서|에게|한테|부터|까지|보다|처럼|이나|나|은|는|이|가|을|를|의|도|만|로)$/u, "")
    .replace(/(한다는|이라는|하는|되는|한다|했다|된다|이다|하며|하고|된|한)$/u, "");
}

function scoreLabelToken(token: string, index: number, total: number): number {
  const lower = token.toLowerCase();
  if (LABEL_STOPWORDS.has(lower)) return Number.NEGATIVE_INFINITY;

  let score = 1;
  if (LABEL_IMPORTANT_TERMS.has(lower)) score += 6;
  if (LABEL_IMPORTANT_KO.some((word) => token.includes(word))) score += 5;
  if (/[A-Z0-9]/.test(token) || token.includes(".") || token.includes("-")) score += 3;
  if (/^[가-힣]+$/u.test(token)) score += Math.min(token.length, 6) * 0.25;
  if (index < 4) score += 1.2 - index * 0.2;
  if (index > total * 0.65) score += 0.8;
  return score;
}

function makeKeywordLabel(tokens: LabelToken[], maxChars: number): string {
  const selected: LabelToken[] = [];
  const seen = new Set<string>();

  for (const token of [...tokens].sort((a, b) => b.score - a.score || a.index - b.index)) {
    const key = token.text.toLowerCase();
    if (seen.has(key)) continue;
    if ([...seen].some((seenKey) => key.includes(seenKey) || seenKey.includes(key))) continue;
    selected.push(token);
    seen.add(key);
    if (selected.length >= GRAPH_LABEL_MAX_TOKENS) break;
  }

  while (selected.length > 0) {
    const label = [...selected]
      .sort((a, b) => a.index - b.index)
      .map((token) => token.text)
      .join(" ");
    if (label.length <= maxChars) return label;

    let worstIndex = 0;
    for (let i = 1; i < selected.length; i++) {
      if (selected[i].score < selected[worstIndex].score) worstIndex = i;
    }
    selected.splice(worstIndex, 1);
  }

  return "";
}

function fitLabelChars(text: string, maxChars: number): string {
  const fitted = text.slice(0, maxChars).trim();
  return fitted.replace(/[^\w가-힣)#]+$/g, "");
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// 연결 컴포넌트(섬) index → 캔버스 상의 앵커. golden-angle 나선으로 고르게 분산해
// 섬끼리 다른 영역에 놓이게 한다(별자리 배치의 핵심).
function componentAnchor(index: number, count: number, w: number, h: number) {
  const angle = index * GOLDEN_ANGLE;
  const r = Math.sqrt((index + 0.5) / Math.max(count, 1));
  return {
    x: w / 2 + Math.cos(angle) * r * w * 0.42,
    y: h / 2 + Math.sin(angle) * r * h * 0.4,
  };
}

function depthTarget(node: GraphNode): number {
  const topic = node.topics[0] ?? node.memory_type;
  const topicDrift = (seed01(`${topic}:depth`) - 0.5) * 58;
  const nodeDrift = (seed01(`${node.id}:depth`) - 0.5) * 44;
  return clamp(
    MEMORY_DEPTH[node.memory_type] + ORIGIN_DEPTH[node.origin] + topicDrift + nodeDrift,
    -DEPTH_LIMIT,
    DEPTH_LIMIT
  );
}

function initialPositions(rawNodes: GraphNode[], w: number, h: number): SimNode[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  // 어닐링은 초기 위치를 국소적으로만 완화하므로(노드 이동거리 제한),
  // 최종 분포는 사실상 이 초기 배치가 결정한다. 경계 타원(0.46/0.44)
  // 바로 안쪽까지 채우도록 캔버스 비율에 맞춘 타원으로 흩뿌린다.
  const radiusX = w * 0.44;
  const radiusY = h * 0.42;
  const count = Math.max(rawNodes.length, 1);

  return rawNodes.map((n, i) => {
    const jitter = seed01(n.id);
    const angle = i * goldenAngle + jitter * 0.42;
    const t = Math.sqrt((i + 0.5) / count);
    const target = depthTarget(n);
    return {
      ...n,
      x: w / 2 + t * radiusX * Math.cos(angle),
      y: h / 2 + t * radiusY * Math.sin(angle),
      z: target + (jitter - 0.5) * 34,
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });
}

export default function ForceGraph({
  nodes: rawNodes,
  links,
  semanticReady,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  semanticReady: boolean;
}) {
  // hydration 가드: force simulation 결과(부동소수점)는 SSR/CSR 마지막 자릿수
  // 차이로 mismatch 발생 → 클라이언트 마운트 후에만 SVG 렌더링.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 컨테이너 크기
  const graphAreaRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    function measure() {
      const box = graphAreaRef.current?.getBoundingClientRect();
      setSize({
        w: Math.max(Math.floor(box?.width ?? window.innerWidth), MIN_GRAPH_W),
        h: Math.max(Math.floor(box?.height ?? window.innerHeight), 420),
      });
    }

    measure();
    const observer =
      typeof ResizeObserver !== "undefined" && graphAreaRef.current
        ? new ResizeObserver(measure)
        : null;
    if (graphAreaRef.current) observer?.observe(graphAreaRef.current);

    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 시뮬레이션 노드
  const [nodes, setNodes] = useState<SimNode[]>(() =>
    initialPositions(rawNodes, 1200, 800)
  );
  const nodesRef = useRef<SimNode[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // hover 중에는 시뮬레이션을 멈춰 강조한 노드/이웃이 흔들리지 않게 한다.
  const hoverIdRef = useRef<string | null>(null);

  // 컨트롤 상태
  const [graphScope, setGraphScope] = useState<GraphScope>("core");
  const [showLabels, setShowLabels] = useState(true);
  const [activeOrigins, setActiveOrigins] = useState<Set<GraphNode["origin"]>>(
    () => new Set(ORIGINS)
  );
  const [activeMemoryTypes, setActiveMemoryTypes] = useState<
    Set<GraphNode["memory_type"]>
  >(() => new Set(NODE_TYPES));
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<GraphLink["type"]>>(
    () => new Set(EDGE_TYPES)
  );
  const [spacing, setSpacing] = useState(280); // link distance
  const [resetKey, setResetKey] = useState(0);

  // 인터랙션
  const [hoverId, setHoverId] = useState<string | null>(null);
  useEffect(() => {
    hoverIdRef.current = hoverId;
  }, [hoverId]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 뷰 변환 (줌/팬)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // 카운트
  const counts = useMemo(() => {
    const origin: Record<string, number> = {};
    const memory: Record<string, number> = {};
    for (const n of rawNodes) {
      origin[n.origin] = (origin[n.origin] ?? 0) + 1;
      memory[n.memory_type] = (memory[n.memory_type] ?? 0) + 1;
    }
    const edge: Record<string, number> = {};
    for (const l of links) edge[l.type] = (edge[l.type] ?? 0) + 1;
    return { origin, memory, edge };
  }, [rawNodes, links]);

  const nodeById = useMemo(
    () => new Map(rawNodes.map((node) => [node.id, node])),
    [rawNodes]
  );

  const labelById = useMemo(
    () => new Map(rawNodes.map((node) => [node.id, makeGraphLabel(node)])),
    [rawNodes]
  );

  const nodeDegree = useMemo(() => {
    const degree = new Map(rawNodes.map((node) => [node.id, 0]));
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }
    return degree;
  }, [rawNodes, links]);

  const scopeCounts = useMemo(() => {
    const counts: Record<GraphScope, number> = { core: 0, authored: 0, all: rawNodes.length };
    for (const node of rawNodes) {
      if (node.origin !== "external") counts.authored += 1;
      if (node.origin !== "external" && (nodeDegree.get(node.id) ?? 0) >= 2) {
        counts.core += 1;
      }
    }
    return counts;
  }, [rawNodes, nodeDegree]);

  // visible 노드 / 엣지
  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of rawNodes) {
      const degree = nodeDegree.get(n.id) ?? 0;
      const inScope =
        graphScope === "all" ||
        (graphScope === "authored" && n.origin !== "external") ||
        (graphScope === "core" && n.origin !== "external" && degree >= 2);

      if (!inScope) continue;
      if (!activeOrigins.has(n.origin) || !activeMemoryTypes.has(n.memory_type)) continue;
      ids.add(n.id);
    }
    return ids;
  }, [rawNodes, nodeDegree, graphScope, activeOrigins, activeMemoryTypes]);

  const visibleLinks = useMemo(
    () =>
      links.filter(
        (l) =>
          activeEdgeTypes.has(l.type) &&
          visibleNodeIds.has(l.source) &&
          visibleNodeIds.has(l.target)
      ),
    [links, activeEdgeTypes, visibleNodeIds]
  );

  // 보이는 그래프의 연결 컴포넌트(섬)를 union-find 로 계산. 섬마다 index 부여.
  const { componentOf, componentCount } = useMemo(() => {
    const parent = new Map<string, string>();
    const find = (start: string): string => {
      let root = start;
      while (parent.get(root) !== root) root = parent.get(root)!;
      let cur = start;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    for (const id of visibleNodeIds) parent.set(id, id);
    for (const l of visibleLinks) {
      const ra = find(l.source);
      const rb = find(l.target);
      if (ra !== rb) parent.set(ra, rb);
    }
    const rootIndex = new Map<string, number>();
    const componentOf = new Map<string, number>();
    for (const id of visibleNodeIds) {
      const root = find(id);
      if (!rootIndex.has(root)) rootIndex.set(root, rootIndex.size);
      componentOf.set(id, rootIndex.get(root)!);
    }
    return { componentOf, componentCount: Math.max(rootIndex.size, 1) };
  }, [visibleNodeIds, visibleLinks]);

  // 재정렬
  useEffect(() => {
    if (resetKey === 0) return;
    const fresh = initialPositions(rawNodes, size.w, size.h);
    nodesRef.current = fresh;
    setNodes(fresh);
    setView({ x: 0, y: 0, k: 1 });
  }, [resetKey, rawNodes, size.w, size.h]);

  // Force simulation (d3-force). 노드 객체를 직접 in-place 갱신하므로
  // nodesRef.current 의 같은 참조가 함께 갱신된다 → tick 마다 setNodes 로 리렌더.
  useEffect(() => {
    const W = size.w;
    const H = size.h;
    const simNodes = nodesRef.current.filter((n) => visibleNodeIds.has(n.id));
    if (simNodes.length === 0) {
      setNodes([...nodesRef.current]);
      return;
    }
    // forceLink 가 source/target 을 노드 참조로 치환(mutate)하므로 복사본을 넘긴다.
    const linkData: SimLink[] = visibleLinks.map((l) => ({
      source: l.source,
      target: l.target,
      type: l.type,
    }));

    const charge =
      simNodes.length > 150
        ? CHARGE_BY_NODE_COUNT.dense
        : simNodes.length > 90
          ? CHARGE_BY_NODE_COUNT.medium
          : CHARGE_BY_NODE_COUNT.compact;

    const anchorOf = (n: SimNode) =>
      componentAnchor(componentOf.get(n.id) ?? 0, componentCount, W, H);
    const collideRadius = (n: SimNode) =>
      NODE_RADIUS + Math.min(n.weight, 3) * NODE_WEIGHT_RADIUS_STEP + COLLIDE_PADDING;

    const sim = forceSimulation<SimNode, SimLink>(simNodes)
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength(charge)
          .distanceMax(Math.max(W, H) * 0.9)
      )
      .force(
        "link",
        forceLink<SimNode, SimLink>(linkData)
          .id((d) => d.id)
          .distance((l) => spacing * (l.type === "mentions" ? 1.15 : 1))
          .strength(LINK_STRENGTH)
      )
      .force(
        "collide",
        forceCollide<SimNode>().radius(collideRadius).iterations(2)
      )
      .force("x", forceX<SimNode>((n) => anchorOf(n).x).strength(ANCHOR_STRENGTH))
      .force("y", forceY<SimNode>((n) => anchorOf(n).y).strength(ANCHOR_STRENGTH))
      .velocityDecay(VELOCITY_DECAY)
      .alphaDecay(ALPHA_DECAY)
      .on("tick", () => {
        setNodes([...nodesRef.current]);
      });

    simRef.current = sim;
    // hover 상태로 마운트된 경우 즉시 정지(시각 고정).
    if (hoverIdRef.current) sim.stop();

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [visibleLinks, visibleNodeIds, resetKey, spacing, size.w, size.h, componentOf, componentCount]);

  // hover 중에는 시뮬레이션을 멈춰 강조 노드/이웃이 흔들리지 않게 한다.
  // 단, 드래그 중에는 멈추면 안 되므로(드래그는 tick 으로 화면 갱신) 예외.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (hoverId && !dragId) sim.stop();
    else sim.restart();
  }, [hoverId, dragId]);

  // 좌표 변환 (SVG)
  function svgPoint(e: React.PointerEvent | React.WheelEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const { x: px, y: py } = svgPoint(e);
    const scaleDelta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const newK = Math.max(0.3, Math.min(4, v.k * scaleDelta));
      const newX = px - ((px - v.x) * newK) / v.k;
      const newY = py - ((py - v.y) * newK) / v.k;
      return { x: newX, y: newY, k: newK };
    });
  }

  function onNodePointerDown(e: React.PointerEvent<SVGGElement>, id: string) {
    e.stopPropagation();
    setDragId(id);
    const node = nodesRef.current.find((n) => n.id === id);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    simRef.current?.alphaTarget(0.3).restart();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (dragId) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragId) {
      const pt = svgPoint(e);
      const worldX = (pt.x - view.x) / view.k;
      const worldY = (pt.y - view.y) / view.k;
      const node = nodesRef.current.find((n) => n.id === dragId);
      if (node) {
        node.fx = worldX;
        node.fy = worldY;
      }
      // 실제 위치 갱신·리렌더는 시뮬레이션 tick(alphaTarget>0)이 담당.
      return;
    }
    if (isPanning && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setView({ x: panStart.current.vx + dx, y: panStart.current.vy + dy, k: view.k });
    }
  }

  function onPointerUp() {
    if (dragId) {
      const node = nodesRef.current.find((n) => n.id === dragId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      simRef.current?.alphaTarget(0);
      setDragId(null);
    }
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
  }

  // 토글 헬퍼
  function toggleIn<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(val)) {
      if (next.size === 1) return;
      next.delete(val);
    } else {
      next.add(val);
    }
    setter(next);
  }

  function resetFilters() {
    setGraphScope("core");
    setActiveOrigins(new Set(ORIGINS));
    setActiveMemoryTypes(new Set(NODE_TYPES));
    setActiveEdgeTypes(new Set(EDGE_TYPES));
  }

  function selectDetail(id: string) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setIsDetailClosing(false);
    setSelectedId(id);
  }

  function closeDetail() {
    if (!selectedId || isDetailClosing) return;
    setIsDetailClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setSelectedId(null);
      setIsDetailClosing(false);
      closeTimerRef.current = null;
    }, DETAIL_EXIT_MS);
  }

  const hovered = hoverId ? nodeById.get(hoverId) ?? null : null;
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const selectedLinks = selectedId
    ? links.filter((link) => link.source === selectedId || link.target === selectedId)
    : [];
  const visibleCount = visibleNodeIds.size;
  const focusId = hoverId ?? selectedId;
  // hover = 약한 프리뷰(일시적), select = 강한 고정. hover 우선.
  const focusMode: "hover" | "select" | null = hoverId
    ? "hover"
    : selectedId
      ? "select"
      : null;
  const detailPanelActive = !!selected || isDetailClosing;

  // 포커스된 노드와 직접 연결된 이웃 집합(자기 자신 포함). 강조/디밍 판단에 사용.
  const focusNeighbors = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const link of links) {
      if (link.source === focusId) set.add(link.target);
      else if (link.target === focusId) set.add(link.source);
    }
    return set;
  }, [focusId, links]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_top,#15151a_0,#0a0a0b_38rem)] pt-24 text-slate-200 md:h-screen md:overflow-hidden md:pt-0">
      {/* 상단 고정 검색 command bar */}
      <div
        className={`pointer-events-none fixed inset-x-4 top-4 z-50 transition-[right] duration-200 ease-out md:left-80 md:px-6 ${
          detailPanelActive
            ? "md:right-[30rem] lg:right-[34rem] xl:right-[38rem]"
            : "md:right-0"
        }`}
      >
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <SearchDropdown semanticReady={semanticReady} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
      {/* 좌측 사이드바 */}
      <aside className="z-20 flex w-full shrink-0 flex-col border-b border-white/[0.07] bg-ink-900/[0.82] shadow-[18px_0_70px_rgba(0,0,0,0.24)] backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] md:w-80 md:border-b-0 md:border-r md:overflow-y-auto [&::-webkit-scrollbar]:hidden">
        <div className="border-b border-ink-800/80 px-5 py-5">
          <Link
            href="/"
            className="block whitespace-nowrap font-display text-2xl tracking-tight text-slate-100 underline-offset-4 transition-colors hover:underline hover:decoration-slate-500"
          >
            Second Brain
          </Link>

          <nav className="mt-3 flex items-center text-xs">
            <Link
              href="/"
              aria-label="돌아가기"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-400 transition-colors hover:border-white/20 hover:text-slate-100"
            >
              <span aria-hidden>←</span>
              <span>돌아가기</span>
            </Link>
          </nav>

          <div className="mt-4 flex items-center gap-2 font-display text-xs text-slate-500">
            <span className="text-slate-300">{rawNodes.length}</span>
            <span>노드</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">{links.length}</span>
            <span>엣지</span>
          </div>
        </div>

        <div className="flex-1 space-y-4 px-5 py-5 text-xs">
          <FilterGroup label="scope">
            <div className="grid grid-cols-3 gap-1">
              {GRAPH_SCOPES.map((scope) => (
                <ScopeButton
                  key={scope.id}
                  label={scope.label}
                  count={scopeCounts[scope.id]}
                  active={graphScope === scope.id}
                  onClick={() => setGraphScope(scope.id)}
                />
              ))}
            </div>
            <div className="pt-1 text-[11px] leading-relaxed text-slate-600">
              {GRAPH_SCOPES.find((scope) => scope.id === graphScope)?.description}
            </div>
          </FilterGroup>

          <FilterGroup label="노드유형">
            {NODE_TYPES.map((mt) => (
              <FilterRow
                key={mt}
                color={MEMORY_TYPE_COLOR[mt]}
                label={`${MEMORY_TYPE_LABEL[mt]} ${mt}`}
                count={counts.memory[mt] ?? 0}
                active={activeMemoryTypes.has(mt)}
                onClick={() => toggleIn(activeMemoryTypes, mt, setActiveMemoryTypes)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="origin">
            {ORIGINS.map((o) => (
              <FilterRow
                key={o}
                color={ORIGIN_FILL[o]}
                label={o}
                count={counts.origin[o] ?? 0}
                active={activeOrigins.has(o)}
                onClick={() => toggleIn(activeOrigins, o, setActiveOrigins)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="엣지유형">
            {EDGE_TYPES.map((et) => (
              <FilterRow
                key={et}
                color={EDGE_STROKE}
                dash={EDGE_DASH[et] ?? ""}
                label={`${EDGE_LABEL[et]} ${et}`}
                count={counts.edge[et] ?? 0}
                active={activeEdgeTypes.has(et)}
                onClick={() => toggleIn(activeEdgeTypes, et, setActiveEdgeTypes)}
              />
            ))}
          </FilterGroup>

          <SpacingControl value={spacing} onChange={setSpacing} />

          <div className="space-y-1.5 border-t border-white/[0.06] pt-4">
            <ControlActionButton
              icon="Aa"
              label={showLabels ? "라벨 숨기기" : "라벨 보이기"}
              onClick={() => setShowLabels((v) => !v)}
            />
            <ControlActionButton icon="0" label="기본 보기로" onClick={resetFilters} />
            <ControlActionButton
              icon="R"
              label="다시 정렬"
              onClick={() => setResetKey((k) => k + 1)}
            />
          </div>
        </div>

        <div className="border-t border-ink-800/80 px-5 py-4 text-xs">
          <div className="text-slate-500">
            {visibleCount} / {rawNodes.length} 노드 표시 중
          </div>
        </div>
      </aside>

      {/* 메인 그래프 영역 */}
      <main ref={graphAreaRef} className="relative min-h-[620px] flex-1 overflow-hidden bg-ink-950 md:h-screen md:min-h-0">
        {mounted && (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="block touch-none select-none"
          onWheel={onWheel}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ cursor: isPanning ? "grabbing" : dragId ? "grabbing" : "default" }}
        >
          <rect width={size.w} height={size.h} fill="#09090b" />

          <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
            {/* 엣지 */}
            <g>
              {visibleLinks.map((l, i) => {
                const a = nodes.find((n) => n.id === l.source);
                const b = nodes.find((n) => n.id === l.target);
                if (!a || !b) return null;
                const focused = !!focusId && (l.source === focusId || l.target === focusId);
                const dimmed = !!focusId && !focused;
                const strong = focused && focusMode === "select";
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={strong ? "#ffffff" : focused ? "#cbd5e1" : EDGE_STROKE}
                    strokeWidth={strong ? 2 : focused ? 1.4 : 0.9}
                    strokeDasharray={EDGE_DASH[l.type] || undefined}
                    opacity={
                      dimmed
                        ? focusMode === "select"
                          ? 0.12
                          : 0.35
                        : focused
                          ? strong
                            ? 0.95
                            : 0.8
                          : 0.5
                    }
                  />
                );
              })}
            </g>

            {/* 노드 */}
            <g>
              {nodes
                .filter((n) => visibleNodeIds.has(n.id))
                .map((n) => {
                  const r = NODE_RADIUS + Math.min(n.weight, 3) * NODE_WEIGHT_RADIUS_STEP;
                  const isHover = hoverId === n.id;
                  const isSelected = selectedId === n.id;
                  const highlighted = !!focusNeighbors && focusNeighbors.has(n.id);
                  const dimmed = !!focusNeighbors && !focusNeighbors.has(n.id);
                  const strongHighlight = highlighted && focusMode === "select";
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x}, ${n.y})`}
                      style={{ cursor: "pointer" }}
                      opacity={dimmed ? (focusMode === "select" ? 0.15 : 0.4) : 1}
                      onPointerDown={(e) => onNodePointerDown(e, n.id)}
                      onPointerEnter={() => setHoverId(n.id)}
                      onPointerLeave={() =>
                        setHoverId((cur) => (cur === n.id ? null : cur))
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!dragId && !isPanning) selectDetail(n.id);
                      }}
                    >
                      <circle
                        r={r}
                        fill={strongHighlight ? "#ffffff" : MEMORY_TYPE_COLOR[n.memory_type]}
                        fillOpacity={highlighted || isHover ? 1 : 0.9}
                        stroke={
                          isSelected
                            ? "#e8b339"
                            : isHover
                              ? "#fff"
                              : "#0a0a0b"
                        }
                        strokeWidth={isSelected ? 2.4 : isHover ? 1.7 : 1}
                      />
                      {showLabels && (
                        <text
                          x={r + 6}
                          y={3}
                          fill={strongHighlight ? "#ffffff" : "#cbd5e1"}
                          fontSize="10"
                          pointerEvents="none"
                          opacity={isHover || isSelected ? 1 : highlighted ? 0.9 : 0.7}
                        >
                          {labelById.get(n.id) ?? n.claim_ko}
                        </text>
                      )}
                    </g>
                  );
                })}
            </g>
          </g>
        </svg>
        )}

        {/* 호버 툴팁 */}
        {hovered && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-1.5 rounded-md border border-white/[0.07] bg-ink-900/90 p-3 text-sm shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl md:bottom-6">
            <div className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: ORIGIN_FILL[hovered.origin] }}
              />
              <span className="text-slate-300">{hovered.origin}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500">
                {MEMORY_TYPE_LABEL[hovered.memory_type]}
              </span>
            </div>
            <div className="text-slate-100 leading-snug">{hovered.claim_ko}</div>
            {hovered.topics.length > 0 && (
              <div className="text-xs text-slate-500">
                {hovered.topics.map((t) => `#${t}`).join(" ")}
              </div>
            )}
            <div className="text-xs text-slate-600 pt-1">클릭 → 오른쪽 패널</div>
          </div>
        )}

        <DetailSidebar
          node={selected}
          links={selectedLinks}
          nodeById={nodeById}
          isClosing={isDetailClosing}
          onClose={closeDetail}
          onSelect={selectDetail}
        />
      </main>
      </div>
    </div>
  );
}

function DetailSidebar({
  node,
  links,
  nodeById,
  isClosing,
  onClose,
  onSelect,
}: {
  node: GraphNode | null;
  links: GraphLink[];
  nodeById: Map<string, GraphNode>;
  isClosing: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  if (!node) return null;

  return (
    <aside
      className={`detail-sidebar absolute inset-x-0 bottom-0 z-40 max-h-[74vh] overflow-y-auto border-t border-white/[0.08] bg-ink-900/[0.92] shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[30rem] md:border-l md:border-t-0 lg:w-[34rem] xl:w-[38rem] [&::-webkit-scrollbar]:hidden ${
        isClosing ? "detail-sidebar--closing" : ""
      }`}
    >
      <article>
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-ink-900/[0.92] px-6 py-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-slate-300"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: ORIGIN_FILL[node.origin] }}
                />
                {ORIGIN_LABEL[node.origin]}
              </span>
              <span className="rounded-sm border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-slate-500">
                {MEMORY_TYPE_LABEL[node.memory_type]}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="상세 패널 닫기"
              className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.07] bg-white/[0.025] text-base leading-none text-slate-500 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <h2 className="mt-5 font-display text-2xl leading-snug text-slate-100">
            {node.claim_ko}
          </h2>

          {node.topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              {node.topics.map((topic) => (
                <span key={topic}>#{topic}</span>
              ))}
            </div>
          )}

          {(node.sources?.length ?? 0) > 0 && (
            <section className="mt-8 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-500">
                sources · {node.sources?.length}
              </h3>
              <ul className="space-y-3">
                {node.sources?.map((source, index) => (
                  <li key={`${source.url}-${index}`} className="border-l-2 border-accent-dim pl-3">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-xs text-slate-100 underline decoration-slate-600 underline-offset-2 hover:decoration-slate-400"
                    >
                      {source.url}
                    </a>
                    {source.date && (
                      <div className="mt-1 text-xs text-slate-600">{source.date}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {node.body && (
            <section className="mt-8">
              <h3 className="mb-3 text-xs uppercase tracking-widest text-slate-500">
                note
              </h3>
              <div className="prose-thought text-sm">
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
                  {node.body}
                </ReactMarkdown>
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section className="mt-8 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-500">
                연결 · {links.length}
              </h3>
              <ul className="space-y-2">
                {links.map((link, index) => {
                  const otherId = link.source === node.id ? link.target : link.source;
                  const other = nodeById.get(otherId);
                  return (
                    <li key={`${link.source}-${link.target}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(otherId)}
                        className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <span className="text-accent">{EDGE_LABEL[link.type]}</span>
                          <span className="text-slate-600">
                            {link.source === node.id ? "outgoing" : "incoming"}
                          </span>
                        </div>
                        <div className="text-sm leading-snug text-slate-200">
                          {other?.claim_ko ?? otherId}
                        </div>
                        {link.note && (
                          <div className="mt-2 text-xs leading-relaxed text-slate-500">
                            {link.note}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {node.filename && (
            <div className="mt-8 border-t border-ink-800 pt-4 text-xs text-slate-600">
              memory/thoughts/{node.filename}
            </div>
          )}

          {!node.virtual && (
            <Link
              href={`/thought/${node.id}`}
              className="mt-4 inline-flex text-xs text-slate-500 underline-offset-4 transition-colors hover:text-slate-200 hover:underline hover:decoration-slate-500"
            >
              상세 페이지 열기
            </Link>
          )}
        </div>
      </article>
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ScopeButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-14 rounded-md border px-2.5 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-accent-dim/70 ${
        active
          ? "border-accent-dim/60 bg-accent/[0.08] text-accent"
          : "border-white/[0.055] bg-white/[0.018] text-slate-500 hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-slate-200"
      }`}
    >
      <span
        className={`absolute inset-x-2 top-1 h-0.5 rounded-full transition-opacity ${
          active ? "bg-accent opacity-100" : "bg-transparent opacity-0"
        }`}
      />
      <span className="block text-[11px] font-medium leading-none">{label}</span>
      <span className="mt-0.5 block font-display text-lg leading-none">{count}</span>
    </button>
  );
}

function FilterRow({
  color,
  dash,
  label,
  count,
  active,
  onClick,
}: {
  color: string;
  dash?: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-accent-dim/70 ${
        active ? "text-slate-200" : "text-slate-600"
      }`}
    >
      {dash !== undefined ? (
        <svg
          width="20"
          height="6"
          viewBox="0 0 20 6"
          className="flex-shrink-0"
          aria-hidden
        >
          <line
            x1="1"
            y1="3"
            x2="19"
            y2="3"
            stroke={color}
            strokeWidth="1.6"
            strokeDasharray={dash || undefined}
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
      )}
      <span className="flex-1 text-left">{label}</span>
      <span
        className={`tabular-nums transition-colors ${
          active ? "text-slate-500" : "text-slate-700"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SpacingControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = ((value - SPACING_MIN) / (SPACING_MAX - SPACING_MIN)) * 100;

  return (
    <div className="space-y-3 border-t border-white/[0.06] pt-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">간격</div>
        <output className="rounded-sm border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 font-mono text-[11px] text-slate-300">
          {value}
        </output>
      </div>
      <input
        type="range"
        min={SPACING_MIN}
        max={SPACING_MAX}
        step={SPACING_STEP}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="graph-spacing-range"
        style={{
          background: `linear-gradient(to right, #e8b339 0%, #e8b339 ${percent}%, #2a2a32 ${percent}%, #2a2a32 100%)`,
        }}
        aria-label="그래프 노드 간격"
      />
      <div className="flex justify-between text-[11px] text-slate-600">
        <span>좁게</span>
        <span>넓게</span>
      </div>
    </div>
  );
}

function ControlActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-9 w-full items-center gap-2 rounded-md border border-white/[0.055] bg-white/[0.018] px-2.5 text-left text-slate-300 transition-colors hover:border-white/[0.1] hover:bg-white/[0.045] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-dim/70"
    >
      <span className="grid h-5 w-5 place-items-center rounded-sm bg-white/[0.04] font-mono text-[10px] text-slate-500 transition-colors group-hover:text-slate-200">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
