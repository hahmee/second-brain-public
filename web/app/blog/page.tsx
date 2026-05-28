import { classifyTechTopic, getAllBlogPosts, TECH_TOPICS } from "@/lib/blog";
import { BlogArchive, type BlogListItem, type BlogTab } from "./blog-archive";

export const metadata = {
  title: "Blog | Second Brain",
  description: "기술 블로그와 마케팅 글을 한곳에 모은 블로그 아카이브",
};

const MAJOR_TAG_MIN = 3;

export default function BlogIndex() {
  const posts = getAllBlogPosts();

  const techPosts = posts.filter((post) => post.category.slug === "tech");
  const tagCount = new Map<string, number>();
  for (const post of techPosts) {
    for (const tag of post.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  }
  const majorTags = [...tagCount.entries()]
    .filter(([, count]) => count >= MAJOR_TAG_MIN)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const majorSet = new Set(majorTags.map(([tag]) => tag));

  // major 태그에 안 잡히는 tech 글은 주제별 토픽으로 분류한다.
  const topicCount = new Map<string, number>();
  const topicByKey = new Map<string, string>();
  for (const post of techPosts) {
    if (post.tags.some((tag) => majorSet.has(tag))) continue;
    const topic = classifyTechTopic(post.title, post.tags);
    topicCount.set(topic.id, (topicCount.get(topic.id) ?? 0) + 1);
    topicByKey.set(`${post.category.slug}:${post.slug}`, topic.id);
  }

  const items: BlogListItem[] = posts.map((post) => {
    const key = `${post.category.slug}:${post.slug}`;
    return {
      key,
      title: post.title,
      description: post.description,
      href: post.href,
      categorySlug: post.category.slug,
      categoryLabel: post.category.label,
      tags: post.tags,
      topicId: topicByKey.get(key),
    };
  });

  const marketingCount = posts.length - techPosts.length;

  const tabs: BlogTab[] = [
    { id: "all", label: "전체", count: items.length, kind: "all" },
    { id: "tech", label: "개발", count: techPosts.length, kind: "tech" },
    ...(marketingCount > 0
      ? [{ id: "marketing", label: "마케팅", count: marketingCount, kind: "marketing" as const }]
      : []),
    ...majorTags.map(([tag, count]) => ({
      id: `tag:${tag}`,
      label: tag,
      count,
      kind: "tag" as const,
      tag,
      group: "filter" as const,
    })),
    ...TECH_TOPICS.filter((topic) => topicCount.has(topic.id)).map((topic) => ({
      id: `topic:${topic.id}`,
      label: topic.label,
      count: topicCount.get(topic.id) ?? 0,
      kind: "topic" as const,
      topicId: topic.id,
      group: "filter" as const,
    })),
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <section className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-slate-500">blog archive</div>
        <h1 className="font-display text-4xl tracking-tight text-slate-100">
          기술과 마케팅, 나눠서 모았다.
        </h1>
        <p className="max-w-2xl text-slate-400">
          구현하며 남긴 기록은 기술 글로, 브랜드와 성장에 대한 메모는 마케팅 글로 묶었다.
        </p>
      </section>

      <BlogArchive items={items} tabs={tabs} />
    </main>
  );
}
