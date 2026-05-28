import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  formatBlogDate,
  getAllBlogPosts,
  getBlogPost,
  uniqueBlogHeadingId,
  type BlogCategorySlug,
  type BlogHeading,
} from "@/lib/blog";

const CATEGORY_COLOR: Record<BlogCategorySlug, string> = {
  tech: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  marketing: "bg-accent/10 text-accent border-accent-dim/40",
};

type BlogPageParams = Promise<{ category: string; slug: string }>;

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({
    category: post.category.slug,
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: BlogPageParams }) {
  const { category, slug } = await params;
  const post = getBlogPost(category, slug);
  if (!post) return {};

  return {
    title: `${post.title} | Blog`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: { params: BlogPageParams }) {
  const { category, slug } = await params;
  const post = getBlogPost(category, slug);
  if (!post) notFound();
  if (category !== post.category.slug) redirect(post.href);

  const date = formatBlogDate(post.releasedAt ?? post.updatedAt);
  const headingIds = new Map<string, number>();

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,760px)_240px] lg:justify-center">
      <article className="min-w-0">
        <div>
          <Link
            href="/blog"
            className="text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            ← all posts
          </Link>
        </div>

        <header className="mt-8 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-sm border px-2 py-0.5 ${CATEGORY_COLOR[post.category.slug]}`}>
              {post.category.label}
            </span>
            {date && (
              <>
                <span className="text-slate-500">·</span>
                <time className="text-slate-500" dateTime={post.releasedAt ?? post.updatedAt}>
                  {date}
                </time>
              </>
            )}
          </div>

          <h1 className="font-display text-3xl leading-snug text-slate-100 md:text-4xl">
            {post.title}
          </h1>

          {post.description && (
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              {post.description}
            </p>
          )}
        </header>

        <section className="prose-thought mt-10">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <MarkdownHeading level={1} seen={headingIds}>
                  {children}
                </MarkdownHeading>
              ),
              h2: ({ children }) => (
                <MarkdownHeading level={2} seen={headingIds}>
                  {children}
                </MarkdownHeading>
              ),
              h3: ({ children }) => (
                <MarkdownHeading level={3} seen={headingIds}>
                  {children}
                </MarkdownHeading>
              ),
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
              img: ({ src, alt }) => {
                if (!src || src.startsWith("blob:") || src.startsWith("file:")) {
                  return (
                    <span className="my-4 block rounded-md border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-sm text-slate-500">
                      이미지를 불러올 수 없습니다.
                    </span>
                  );
                }

                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={alt ?? ""}
                    loading="lazy"
                  />
                );
              },
            }}
          >
            {post.body}
          </ReactMarkdown>
        </section>
      </article>

      <BlogOutline headings={post.headings} />
    </main>
  );
}

function MarkdownHeading({
  level,
  seen,
  children,
}: {
  level: BlogHeading["depth"];
  seen: Map<string, number>;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  const id = uniqueBlogHeadingId(reactNodeText(children), seen);

  return (
    <Tag id={id} className="scroll-mt-24">
      {children}
    </Tag>
  );
}

function BlogOutline({ headings }: { headings: BlogHeading[] }) {
  if (headings.length === 0) return null;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto border-l border-ink-800 pl-4">
        <div className="mb-3 text-xs uppercase tracking-widest text-slate-500">
          본문 미리보기
        </div>
        <nav aria-label="본문 목차" className="space-y-1.5">
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className={`block text-xs leading-relaxed text-slate-500 transition-colors hover:text-slate-200 ${
                heading.depth === 1 ? "" : heading.depth === 2 ? "pl-3" : "pl-6"
              }`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function reactNodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return reactNodeText(child.props.children);
      }
      return "";
    })
    .join("")
    .trim();
}
