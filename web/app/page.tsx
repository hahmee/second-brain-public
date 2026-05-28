import Link from "next/link";

const links = [
  { href: "/blog", label: "Blog", external: false },
  { href: "/memory", label: "Second Brain", external: false },
];

const linkClass =
  "font-display text-slate-400 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-100 hover:decoration-slate-400";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6">
      <h1 className="font-display text-3xl tracking-tight text-slate-100">Second Brain</h1>
      <nav className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        {links.map((link) =>
          link.external ? (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              {link.label}
            </a>
          ) : (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          )
        )}
      </nav>
    </main>
  );
}
