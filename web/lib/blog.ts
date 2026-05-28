import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { memoryRoot } from "./memory-root";

const BLOG_SOURCES = ["velog", "notion"] as const;

export const BLOG_CATEGORIES = ["tech", "marketing"] as const;

export type TechTopic = { id: string; label: string };

type TechTopicRule = TechTopic & { tags: string[]; keywords: string[] };

// major 태그(3편 이상)에 안 잡히는 tech 글을 주제별로 묶는다.
// velog 재동기화가 frontmatter 태그를 덮어쓰므로, 태그 대신 제목+태그를 런타임에 분류한다.
const TECH_TOPIC_RULES: TechTopicRule[] = [
  {
    id: "ai",
    label: "AI · Claude Code",
    tags: ["ai", "agi", "claude", "mcp", "pe"],
    keywords: ["claude", "agi", "mcp", "프롬프트", "에이전틱", "하네스", "ai 코딩"],
  },
  {
    id: "network-api",
    label: "네트워크 · API",
    tags: ["cors", "bff", "msa", "api", "graphql", "urql", "urlql"],
    keywords: ["cors", "bff", "backend for frontend", "set-cookie", "graphql", "urql", "restful"],
  },
  {
    id: "browser-css",
    label: "브라우저 · CSS",
    tags: ["browser", "rendering", "css", "html"],
    keywords: ["브라우저", "localstorage", "sessionstorage", "렌더링", "display", "시멘틱", "flex"],
  },
  {
    id: "architecture",
    label: "아키텍처",
    tags: ["atomic", "fsd", "storybook"],
    keywords: ["fsd", "아키텍처", "storybook", "상태 관리"],
  },
  {
    id: "database",
    label: "데이터베이스",
    tags: ["nosql", "rdb", "sql"],
    keywords: ["데이터베이스", "관계형 db", "비관계형"],
  },
  {
    id: "typescript",
    label: "TypeScript",
    tags: ["typescript"],
    keywords: ["typescript"],
  },
  {
    id: "dev-productivity",
    label: "개발 생산성",
    tags: ["googling", "documentation", "git"],
    keywords: ["googling", "문서화", "커밋 컨벤션", "깃 커밋"],
  },
];

const TECH_TOPIC_FALLBACK: TechTopic = { id: "etc", label: "기타" };

export const TECH_TOPICS: TechTopic[] = [
  ...TECH_TOPIC_RULES.map(({ id, label }) => ({ id, label })),
  TECH_TOPIC_FALLBACK,
];

export function classifyTechTopic(title: string, tags: string[]): TechTopic {
  const lowerTitle = title.toLowerCase();
  const lowerTags = tags.map((tag) => tag.toLowerCase());
  for (const rule of TECH_TOPIC_RULES) {
    const tagHit = rule.tags.some((tag) => lowerTags.includes(tag));
    const keywordHit = rule.keywords.some((keyword) => lowerTitle.includes(keyword));
    if (tagHit || keywordHit) return { id: rule.id, label: rule.label };
  }
  return TECH_TOPIC_FALLBACK;
}

type BlogSource = (typeof BLOG_SOURCES)[number];

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number];

export type BlogCategory = {
  slug: BlogCategorySlug;
  label: string;
  description: string;
};

export type BlogHeading = {
  id: string;
  text: string;
  depth: 1 | 2 | 3;
};

export type BlogPost = {
  source: BlogSource;
  category: BlogCategory;
  slug: string;
  title: string;
  description?: string;
  url?: string;
  releasedAt?: string;
  updatedAt?: string;
  tags: string[];
  body: string;
  filename: string;
  href: string;
  headings: BlogHeading[];
};

const RAW_ROOT = path.join(memoryRoot(), "raw");

// notion source(S3 URL) → R2 public URL. scripts/notion-images.ts 가 생성.
const NOTION_IMAGE_MAP: Record<string, string> = loadNotionImageMap();

function loadNotionImageMap(): Record<string, string> {
  const mapPath = path.join(RAW_ROOT, "notion", "_images", "_url_map.json");
  try {
    if (!fs.existsSync(mapPath)) return {};
    return JSON.parse(fs.readFileSync(mapPath, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

const CATEGORY_BY_SOURCE: Record<BlogSource, BlogCategory> = {
  velog: {
    slug: "tech",
    label: "기술 블로그",
    description: "프론트엔드, 백엔드, 인프라, 테스트, 개발 방법론 기록",
  },
  notion: {
    slug: "marketing",
    label: "마케팅 글",
    description: "브랜딩, 성장, 소비자 경험, 책에서 뽑은 마케팅 메모",
  },
};

const SOURCE_BY_CATEGORY: Record<BlogCategorySlug, BlogSource> = {
  tech: "velog",
  marketing: "notion",
};

function isBlogSource(value: string): value is BlogSource {
  return BLOG_SOURCES.includes(value as BlogSource);
}

function isBlogCategorySlug(value: string): value is BlogCategorySlug {
  return BLOG_CATEGORIES.includes(value as BlogCategorySlug);
}

function blogDir(source: BlogSource): string {
  return path.join(RAW_ROOT, source);
}

function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith("_");
}

function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((tag) => tag.trim()).filter(Boolean);
}

function decodeNotionFileUrl(value: string): string {
  if (!value.startsWith("file://")) return value;

  try {
    const decoded = decodeURIComponent(value.replace(/^file:\/\//, ""));
    const parsed = JSON.parse(decoded) as { source?: unknown };
    const source = typeof parsed.source === "string" ? parsed.source : "";
    // 비공개/만료되는 notion source URL 은 직접 못 쓰므로 R2 URL 로만 치환.
    // 매핑이 없으면 원본 file:// 를 유지해 렌더에서 fallback 이 뜨게 한다.
    return source && NOTION_IMAGE_MAP[source] ? NOTION_IMAGE_MAP[source] : value;
  } catch {
    return value;
  }
}

function normalizeImageUrls(content: string): string {
  return content.replace(/file:\/\/%7B[^)\s"']+%7D/gu, decodeNotionFileUrl);
}

function cleanNotionExportNoise(content: string): string {
  return content
    // Notion export 의 깊은 들여쓰기(2~3 탭) 때문에 단독 이미지 줄이 코드블록으로
    // 파싱되는 것을 막는다 — 들여쓰기를 제거해 이미지로 렌더되게 한다.
    .replace(/^[ \t]+(!\[[^\]]*\]\([^)]*\))[ \t]*$/gmu, "$1")
    .replace(/<callout\b[^>]*>\s*\*\*Notion 팁:\s*\*\*[\s\S]*?<\/callout>/giu, "")
    .replace(/^[ \t]*<empty-block\/>[ \t]*$/gmu, "")
    .replace(/^[ \t]*<table_of_contents\b[^>]*\/>[ \t]*$/gmu, "")
    .replace(/^[ \t]*<unknown\b[^>]*\/>[ \t]*$/gmu, "")
    .replace(/^[ \t]*<database\b[^>]*><\/database>[ \t]*$/gmu, "")
    .replace(/^[ \t]*<mention-page\b[^>]*\/>[ \t]*$/gmu, "")
    .replace(/^[ \t]*<\/?(columns|column)>[ \t]*$/gmu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanBlogBody(content: string, source: BlogSource): string {
  const withImages = normalizeImageUrls(content);
  if (source === "notion") return cleanNotionExportNoise(withImages);
  return withImages.trim();
}

function plainExcerpt(content: string): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?&#x3A;\/\/\S+/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|quot|#x27|#x3A);/gi, " ")
    .replace(/\b(?:Velog|Notion)\s*(?:팁)?\b/gi, " ")
    .replace(/[#>*_`[\]()|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= 150) return text;
  return `${text.slice(0, 150).trim()}...`;
}

function usableDescription(value: string): boolean {
  return value.length >= 40 && !value.includes("://") && !/^(?:https?|www)\b/i.test(value);
}

export function slugifyBlogHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "section";
}

export function uniqueBlogHeadingId(text: string, seen: Map<string, number>): string {
  const base = slugifyBlogHeading(text);
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function headingText(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/#+$/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

function extractHeadings(content: string): BlogHeading[] {
  const seen = new Map<string, number>();

  return content
    .split("\n")
    .map((line) => line.match(/^(#{1,3})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const text = headingText(match[2]);
      if (!text) return null;

      return {
        id: uniqueBlogHeadingId(text, seen),
        text,
        depth: match[1].length as BlogHeading["depth"],
      };
    })
    .filter((heading): heading is BlogHeading => Boolean(heading));
}

function readBlogPost(source: BlogSource, file: string): BlogPost {
  const fullPath = path.join(blogDir(source), file);
  const raw = fs.readFileSync(fullPath, "utf-8");
  const { data, content } = matter(raw);
  const slug = file.replace(/\.md$/, "");
  const title = String(data.title ?? slug);
  const releasedAt = normalizeDate(data.released_at);
  const updatedAt = normalizeDate(data.last_edited_time);
  const body = cleanBlogBody(content, source);
  const frontmatterDescription =
    typeof data.short_description === "string" && data.short_description.trim()
      ? plainExcerpt(data.short_description)
      : "";
  const bodyDescription = plainExcerpt(body);
  const description = usableDescription(frontmatterDescription)
    ? frontmatterDescription
    : bodyDescription;
  const category = CATEGORY_BY_SOURCE[source];

  return {
    source,
    category,
    slug,
    title,
    description,
    url: typeof data.url === "string" && data.url.trim() ? data.url.trim() : undefined,
    releasedAt,
    updatedAt,
    tags: normalizeTags(data.tags),
    body,
    filename: file,
    href: `/blog/${category.slug}/${encodeURIComponent(slug)}`,
    headings: extractHeadings(body),
  };
}

function sortDate(post: BlogPost): string {
  return post.releasedAt ?? post.updatedAt ?? "";
}

export function getAllBlogPosts(): BlogPost[] {
  const posts = BLOG_SOURCES.flatMap((source) => {
    const dir = blogDir(source);
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
      .filter(isMarkdownFile)
      .map((file) => readBlogPost(source, file));
  });

  posts.sort((a, b) => {
    const dateCompare = sortDate(b).localeCompare(sortDate(a));
    if (dateCompare !== 0) return dateCompare;
    return a.title.localeCompare(b.title, "ko");
  });

  return posts;
}

export function getBlogPost(categoryOrSource: string, slug: string): BlogPost | null {
  const source = sourceFromRouteSegment(categoryOrSource);
  if (!source) return null;

  const decodedSlug = decodeSlugParam(slug);
  const filename = `${decodedSlug}.md`;
  if (!isMarkdownFile(filename)) return null;

  const fullPath = path.join(blogDir(source), filename);
  if (!fs.existsSync(fullPath)) return null;
  return readBlogPost(source, filename);
}

function decodeSlugParam(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function sourceFromRouteSegment(value: string): BlogSource | null {
  if (isBlogCategorySlug(value)) return SOURCE_BY_CATEGORY[value];
  if (isBlogSource(value)) return value;
  return null;
}

export function getBlogCategories(): BlogCategory[] {
  return BLOG_CATEGORIES.map((slug) => CATEGORY_BY_SOURCE[SOURCE_BY_CATEGORY[slug]]);
}

export function formatBlogDate(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}
