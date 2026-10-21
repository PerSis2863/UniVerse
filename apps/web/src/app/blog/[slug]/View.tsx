'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, FileX2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from '@/components/ui/Link';
import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { LegalShell } from '@/components/legal/LegalShell';
import { LegalMarkdown } from '@/components/legal/LegalMarkdown';
import { Photo } from '@/components/ui/Photo';
import { postDate } from '../BlogList';

// One post of the public blog (Stage 5 · Phase E, src/server/blog.ts).

type Post = { slug: string; title: string; summary: string | null; coverUrl: string | null; authorName: string | null; publishedAt: string; body: string; minutes: number; more: { slug: string; title: string; summary: string | null; publishedAt: string }[] };

function BlogPost({ slug }: { slug: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/core/blog/${encodeURIComponent(slug)}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((p: Post) => {
        if (cancelled) return;
        setPost(p);
        document.title = `${p.title} · UniVerse blog`;
        document.querySelector('meta[name="description"]')?.setAttribute('content', p.summary ?? p.title);
      })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [slug]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: post?.title, url });
      else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    } catch { /* closed the share sheet */ }
  };

  if (missing) {
    return (
      <LegalShell eyebrow="Blog" title="This post isn’t on the blog">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <FileX2 className="w-9 h-9 mx-auto text-zinc-500" aria-hidden />
          <p className="mt-3 text-zinc-300">The link may be wrong, or the post was taken down.</p>
          <Link href="/blog" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300 underline underline-offset-2"><ArrowLeft className="w-4 h-4" aria-hidden />All posts</Link>
        </div>
      </LegalShell>
    );
  }
  if (!post) {
    return (
      <LegalShell eyebrow="Blog" title="Loading…">
        <div role="status" aria-label="Loading" className="space-y-3">
          {[90, 100, 95, 70, 100, 85].map((w, i) => <div key={i} className="h-4 rounded bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />)}
        </div>
      </LegalShell>
    );
  }
  return (
    <LegalShell eyebrow="Blog" title={post.title} intro={post.summary ?? undefined}>
      <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-400">
        <span>{postDate(post.publishedAt)} · {post.minutes} min read{post.authorName ? ` · ${post.authorName}` : ''}</span>
        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-indigo-300 hover:bg-white/[0.06]"><Link2 className="w-4 h-4" aria-hidden />Share</button>
      </div>
      {post.coverUrl && <Photo src={post.coverUrl} shown="(min-width: 768px) 768px, 100vw" className="w-full rounded-2xl border border-white/10 object-cover max-h-[28rem]" />}
      <article><LegalMarkdown source={post.body} /></article>
      <div className="border-t border-white/10 pt-6 space-y-4">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 hover:text-white"><ArrowLeft className="w-4 h-4" aria-hidden />All posts</Link>
        {post.more.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {post.more.map((m) => (
              <li key={m.slug}>
                <Link href={`/blog/${m.slug}`} className="block h-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-indigo-400">
                  <p className="text-xs text-zinc-400">{postDate(m.publishedAt)}</p>
                  <p className="mt-1 font-semibold text-white line-clamp-2">{m.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </LegalShell>
  );
}

// Served for every address from the page built once with "open" (page.tsx): the post's address is
// read in the browser.
export default function BlogPostRoute() {
  const p = usePathParams('/blog/[slug]');
  return p ? <BlogPost key={p.slug} slug={p.slug} /> : <AddressLoading />;
}
