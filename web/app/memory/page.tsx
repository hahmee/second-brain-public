import { getAllThoughts } from "@/lib/thoughts";
import { loadEdges } from "@/lib/edges";
import { hasEmbeddings } from "@/lib/search";
import ForceGraph, { type GraphNode, type GraphLink } from "@/components/ForceGraph";

const TOPIC_NODE_MIN_COUNT = 3;

function taxonomyNodeId(kind: "topic" | "thesis", value: string): string {
  return `${kind}:${encodeURIComponent(value.trim().toLowerCase())}`;
}

export default function Home() {
  const thoughts = getAllThoughts();
  const edges = loadEdges();
  const semanticReady = hasEmbeddings() && Boolean(process.env.OPENAI_API_KEY);

  const nodes: GraphNode[] = thoughts.map((t) => ({
    id: t.slug,
    claim_ko: t.claim_ko,
    label_ko: t.label_ko,
    origin: t.origin,
    memory_type: t.memory_type,
    topics: t.topics,
    weight: t.sources.length,
    sources: t.sources,
    body: t.body,
    filename: t.filename,
  }));

  const links: GraphLink[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    type: e.type,
    note: e.note,
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const topicCounts = new Map<string, { label: string; count: number }>();
  const thesisCounts = new Map<string, { label: string; count: number }>();

  for (const thought of thoughts) {
    for (const topic of thought.topics) {
      const label = topic.trim();
      if (!label) continue;
      const id = taxonomyNodeId("topic", label);
      const existing = topicCounts.get(id);
      topicCounts.set(id, { label: existing?.label ?? label, count: (existing?.count ?? 0) + 1 });
    }

    for (const thesis of thought.theses) {
      const label = thesis.trim();
      if (!label) continue;
      const id = taxonomyNodeId("thesis", label);
      const existing = thesisCounts.get(id);
      thesisCounts.set(id, { label: existing?.label ?? label, count: (existing?.count ?? 0) + 1 });
    }
  }

  const activeTopicIds = new Set(
    Array.from(topicCounts.entries())
      .filter(([, topic]) => topic.count >= TOPIC_NODE_MIN_COUNT)
      .map(([id]) => id)
  );
  const activeThesisIds = new Set(thesisCounts.keys());

  for (const [id, topic] of topicCounts) {
    if (!activeTopicIds.has(id)) continue;
    if (nodeIds.has(id)) continue;
    nodes.push({
      id,
      claim_ko: `#${topic.label}`,
      label_ko: `#${topic.label}`,
      origin: "synthesized",
      memory_type: "topic",
      topics: [topic.label],
      weight: topic.count,
      virtual: true,
    });
    nodeIds.add(id);
  }

  for (const [id, thesis] of thesisCounts) {
    if (!activeThesisIds.has(id)) continue;
    if (nodeIds.has(id)) continue;
    nodes.push({
      id,
      claim_ko: thesis.label,
      label_ko: thesis.label,
      origin: "synthesized",
      memory_type: "thesis",
      topics: [],
      weight: thesis.count,
      virtual: true,
    });
    nodeIds.add(id);
  }

  for (const thought of thoughts) {
    for (const topic of thought.topics) {
      const label = topic.trim();
      if (!label) continue;
      const id = taxonomyNodeId("topic", label);
      if (!activeTopicIds.has(id)) continue;
      links.push({
        source: thought.slug,
        target: id,
        type: "topic-tag",
        note: `topic: ${label}`,
      });
    }

    for (const thesis of thought.theses) {
      const label = thesis.trim();
      if (!label) continue;
      const id = taxonomyNodeId("thesis", label);
      if (!activeThesisIds.has(id)) continue;
      links.push({
        source: thought.slug,
        target: id,
        type: "thesis-tag",
        note: `thesis: ${label}`,
      });
    }
  }

  return <ForceGraph nodes={nodes} links={links} semanticReady={semanticReady} />;
}
