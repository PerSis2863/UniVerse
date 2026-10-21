'use client';

import useSWRInfinite from 'swr/infinite';
import { ArrowRight, Loader2, Newspaper } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LegalShell } from '@/components/legal/LegalShell';
import { Photo } from '@/components/ui/Photo';

// The public blog (Stage 5 · Phase E, src/server/blog.ts): published posts, newest first. Posts are
// written in the owner console → Blog.

export type PostCard = { slug: string; title: string; summary: string | null; coverUrl: string | null; authorName: string | null; publishedAt: string; minutes: number };
type Page = { posts: PostCard[]; more: string | null };

export const postDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const load = async (url: string): Promise<Page> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('The blog couldn’t load. Try again in a moment.');
  return res.json();
};

export function BlogList() {
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(
    (i, prev: Page | null) => (i === 0 ? '/api/core/blog' : prev?.more ? `/api/core/blog?before=${encodeURIComponent(prev.more)}` : null),
    load,
    { revalidateFirstPage: false },
  );
  const posts = data?.flatMap((p) => p.posts) ?? [];
  const more = data?.[data.length - 1]?.more;

  return (
    <LegalShell eyebrow="Blog" title="News from UniVerse" intro="What we're building for schools, universities and the people they help.">
      {error && !data ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-300">
          {(error as Error).message} <button type="button" onClick={() => void mutate()} className="ms-2 font-semibold text-indigo-300 underline underline-offset-2">Try again</button>
        </div>
      ) : !data ? (
        <div role="status" aria-label="Loading" className="space-y-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <Newspaper className="w-8 h-8 mx-auto text-zinc-500" aria-hidden />
          <p className="mt-3 text-zinc-300">No posts yet. Check back soon.</p>
        </div>
      ) : (
        <ul className="space-y-4 stagger">
          {posts.map((p, i) => (
            <li key={p.slug}>
              <Link href={`/blog/${p.slug}`} className="group block rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-indigo-400/40 transition-colors overflow-hidden focus-visible:outline-2 focus-visible:outline-indigo-400">
                {p.coverUrl && i === 0 && <Photo src={p.coverUrl} shown="(min-width: 768px) 768px, 100vw" className="w-full aspect-[2/1] object-cover" />}
                <div className="flex gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400">{postDate(p.publishedAt)} · {p.minutes} min read{p.authorName ? ` · ${p.authorName}` : ''}</p>
                    <h2 className="mt-1.5 text-lg sm:text-xl font-bold text-white break-words">{p.title}</h2>
                    {p.summary && <p className="mt-1.5 text-sm text-zinc-300 line-clamp-3">{p.summary}</p>}
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-300 group-hover:gap-2 transition-all">Read<span className="sr-only">: {p.title}</span><ArrowRight className="w-4 h-4" aria-hidden /></span>
                  </div>
                  {p.coverUrl && i !== 0 && <Photo src={p.coverUrl} shown={112} loading="lazy" className="hidden sm:block w-28 h-28 rounded-xl object-cover shrink-0" />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <div className="text-center">
          <button type="button" onClick={() => void setSize(size + 1)} disabled={isValidating} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]">
            {isValidating && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Older posts
          </button>
        </div>
      )}
    </LegalShell>
  );
}
