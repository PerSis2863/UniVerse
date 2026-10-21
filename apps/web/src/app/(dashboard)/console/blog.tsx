'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, FileText, ImagePlus, Loader2, Newspaper, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Photo } from '@/components/ui/Photo';
import { uploadChatFile } from '@/components/chat/chat-client';
import { confirmDialog } from '@/components/ui/Dialogs';
import { FileDrop } from '@/components/ui/FileDrop';
import { Segmented } from '@/components/ui/Segmented';
import { LoadError } from '@/components/ui/LoadError';
import { LegalMarkdown } from '@/components/legal/LegalMarkdown';
import { card, errorMessage, fetcher, field } from './shared';

// Owner console → Blog (Stage 5 · Phase E, src/server/blog.ts): posts for the public blog at /blog,
// written in Markdown (## headings, - lists, **bold**, *italic*, [links](https://…), | tables |).
// A post is a draft until it's published; taking it back hides it again.

type Post = { id: string; slug: string; title: string; summary: string | null; coverUrl: string | null; authorName: string | null; status: 'DRAFT' | 'PUBLISHED'; publishedAt: string | null; updatedAt: string };
type Draft = { title: string; slug: string; summary: string; authorName: string; coverUrl: string; body: string };
const EMPTY: Draft = { title: '', slug: '', summary: '', authorName: '', coverUrl: '', body: '' };
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function BlogPanel() {
  const { data, error, mutate } = useSWR<{ posts: Post[] }>('/owner/blog', fetcher, { revalidateOnFocus: false });
  // `key` stays the same when a new post is first saved, so the editor keeps what's typed.
  const [editing, setEditing] = useState<{ key: string; id: string | null; draft: Draft; post: Post | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const open = async (p: Post) => {
    setOpening(p.id);
    try {
      const { data: full } = await api.get<Post & { body: string }>(`/owner/blog/${p.id}`);
      setEditing({ key: p.id, id: p.id, post: p, draft: { title: full.title, slug: full.slug, summary: full.summary ?? '', authorName: full.authorName ?? '', coverUrl: full.coverUrl ?? '', body: full.body } });
    } catch (e) { toast.error(errorMessage(e)); } finally { setOpening(null); }
  };

  if (editing) return <Editor key={editing.key} id={editing.id} post={editing.post} draft={editing.draft} onClose={() => { setEditing(null); void mutate(); }} onSaved={(post) => setEditing((e) => e && { ...e, id: post.id, post })} />;
  if (error && !data) return <LoadError onRetry={() => void mutate()} />;
  if (!data) return <div className="h-40 rounded-2xl skeleton" />;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Newspaper className="w-5 h-5 text-indigo-500" aria-hidden />Blog</h2>
          <p className="text-sm text-zinc-500">News and stories on the public site, at universe…/blog. Drafts are only seen here.</p>
        </div>
        <div className="flex gap-2">
          <a href="/blog" target="_blank" rel="noopener" className="btn-secondary btn-sm"><ExternalLink className="w-3.5 h-3.5" aria-hidden />Open the blog</a>
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ key: 'new', id: null, post: null, draft: EMPTY })}><Plus className="w-3.5 h-3.5" aria-hidden />New post</button>
        </div>
      </div>
      {data.posts.length === 0 ? (
        <div className={cn(card, 'p-10 text-center text-sm text-zinc-500')}>
          <FileText className="w-8 h-8 mx-auto text-zinc-400 mb-2" aria-hidden />No posts yet. Write the first one: it stays a draft until you publish it.
        </div>
      ) : (
        <ul className={cn(card, 'divide-y divide-zinc-200 dark:divide-white/[0.06] stagger')}>
          {data.posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-zinc-900 dark:text-white truncate">{p.title}</span>
                <span className="block text-xs text-zinc-500 truncate">/blog/{p.slug} · edited {day(p.updatedAt)}</span>
              </span>
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', p.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400')}>
                {p.status === 'PUBLISHED' ? `Published ${p.publishedAt ? day(p.publishedAt) : ''}` : 'Draft'}
              </span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => void open(p)} disabled={opening !== null}>
                {opening === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}Edit<span className="sr-only"> {p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Editor({ id, post, draft: initial, onClose, onSaved }: { id: string | null; post: Post | null; draft: Draft; onClose: () => void; onSaved: (p: Post) => void }) {
  const [d, setD] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState<string | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setD((x) => ({ ...x, [k]: v, ...(k === 'title' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };
  const words = d.body.split(/\s+/).filter(Boolean).length;
  const published = post?.status === 'PUBLISHED';

  const save = async (status?: 'DRAFT' | 'PUBLISHED') => {
    setBusy(status ?? 'save');
    try {
      const body = { ...d, ...(status ? { status } : {}) };
      // A new post is saved as a draft first, then published.
      let saved = id ? (await api.put<Post>(`/owner/blog/${id}`, body)).data : (await api.post<Post>('/owner/blog', d)).data;
      if (!id && status === 'PUBLISHED') saved = (await api.put<Post>(`/owner/blog/${saved.id}`, body)).data;
      onSaved(saved);
      setD((x) => ({ ...x, slug: saved.slug }));
      setSlugTouched(true);
      toast.success(status === 'PUBLISHED' ? (published ? 'Saved' : 'Published on the blog') : status === 'DRAFT' ? 'Taken back: only you see it now' : 'Draft saved');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!id || !(await confirmDialog({ title: `Delete “${d.title || 'this post'}”?`, message: published ? 'It disappears from the blog at once.' : undefined, confirmLabel: 'Delete', destructive: true }))) return;
    setBusy('delete');
    try { await api.delete(`/owner/blog/${id}`); toast.success('Deleted'); onClose(); } catch (e) { toast.error(errorMessage(e)); setBusy(null); }
  };
  const addCover = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return void toast.error('Choose a picture (JPEG, PNG or WebP).');
    setUpload(0);
    try { const url = await uploadChatFile(f, setUpload); setD((x) => ({ ...x, coverUrl: url })); } catch (e) { toast.error((e as Error).message); } finally { setUpload(null); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm -ms-2"><ArrowLeft className="w-4 h-4" aria-hidden />All posts</button>
        <span className="flex-1" />
        {published && <a href={`/blog/${d.slug}`} target="_blank" rel="noopener" className="btn-secondary btn-sm"><ExternalLink className="w-3.5 h-3.5" aria-hidden />View</a>}
        {id && <button type="button" onClick={() => void remove()} disabled={busy !== null} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete</button>}
        {published
          ? <button type="button" onClick={() => void save('DRAFT')} disabled={busy !== null} className="btn-secondary btn-sm">{busy === 'DRAFT' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Undo2 className="w-3.5 h-3.5" aria-hidden />}Take back</button>
          : <button type="button" onClick={() => void save()} disabled={busy !== null} className="btn-secondary btn-sm">{busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}Save draft</button>}
        <button type="button" onClick={() => void save('PUBLISHED')} disabled={busy !== null} className="btn-primary btn-sm">
          {busy === 'PUBLISHED' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Send className="w-3.5 h-3.5" aria-hidden />}{published ? 'Save' : 'Publish'}
        </button>
      </div>

      <div className={cn(card, 'p-4 sm:p-5 grid gap-4 md:grid-cols-2')}>
        <label className="block md:col-span-2"><span className="text-xs font-medium text-zinc-500">Title</span><input value={d.title} onChange={set('title')} maxLength={140} className={cn(field, 'mt-1 text-base font-semibold')} placeholder="What's new at UniVerse" /></label>
        <label className="block"><span className="text-xs font-medium text-zinc-500">Address</span>
          <span className="mt-1 flex items-center rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 focus-within:ring-2 focus-within:ring-indigo-500/40">
            <span className="ps-3 text-sm text-zinc-500 shrink-0">/blog/</span>
            <input value={d.slug} onChange={(e) => { setSlugTouched(true); setD((x) => ({ ...x, slug: e.target.value })); }} onBlur={() => setD((x) => ({ ...x, slug: slugify(x.slug || x.title) }))} maxLength={80} className="flex-1 min-w-0 bg-transparent px-1 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none" />
          </span>
        </label>
        <label className="block"><span className="text-xs font-medium text-zinc-500">Written by (optional)</span><input value={d.authorName} onChange={set('authorName')} maxLength={80} className={cn(field, 'mt-1')} placeholder="The UniVerse team" /></label>
        <label className="block md:col-span-2"><span className="text-xs font-medium text-zinc-500">Summary (shown in the list and when the link is shared)</span><textarea value={d.summary} onChange={set('summary')} maxLength={300} rows={2} className={cn(field, 'mt-1 resize-y')} /></label>
        <div className="md:col-span-2">
          <span className="text-xs font-medium text-zinc-500">Cover picture (optional)</span>
          {d.coverUrl ? (
            <div className="mt-1 relative w-fit">
              <Photo src={d.coverUrl} shown={320} className="h-32 w-auto max-w-full rounded-xl object-cover border border-zinc-200 dark:border-white/10" />
              <button type="button" aria-label="Remove the cover picture" onClick={() => setD((x) => ({ ...x, coverUrl: '' }))} className="absolute top-1.5 end-1.5 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"><X className="w-3.5 h-3.5" aria-hidden /></button>
            </div>
          ) : (
            <FileDrop onFiles={(f) => void addCover(f)} accept="image/*" disabled={upload !== null} className="mt-1">
              <label className={cn('btn-secondary btn-sm cursor-pointer w-fit', upload !== null && 'opacity-60 pointer-events-none')}>
                {upload !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ImagePlus className="w-3.5 h-3.5" aria-hidden />}
                {upload !== null ? `Uploading ${Math.round(upload)}%` : 'Choose a picture'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void addCover([...(e.target.files ?? [])]); e.target.value = ''; }} />
              </label>
            </FileDrop>
          )}
        </div>
      </div>

      <div className={cn(card, 'p-4 sm:p-5 space-y-3')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<'write' | 'preview'> label="Show" value={view} onChange={setView} segments={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
          <span className="text-xs text-zinc-500 tabular-nums">{words.toLocaleString()} words · {Math.max(1, Math.round(words / 220))} min read</span>
        </div>
        {view === 'write' ? (
          <>
            <textarea aria-label="Post" value={d.body} onChange={set('body')} rows={18} maxLength={60_000} className={cn(field, 'font-mono text-[13px] leading-relaxed resize-y')} placeholder={'## A heading\n\nA paragraph with **bold**, *italic* and a [link](https://example.com).\n\n- A list\n- Of things'} />
            <p className="text-xs text-zinc-500">## heading · ### smaller heading · - list · 1. numbered list · **bold** · *italic* · [text](https://address) · | table | rows | · --- line</p>
          </>
        ) : (
          // As it shows on the blog (the public site is always dark).
          <div className="dark rounded-2xl p-5 sm:p-8" style={{ backgroundColor: '#0a0d13' }}>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white break-words">{d.title || 'Untitled'}</h1>
            {d.summary && <p className="mt-3 text-zinc-400">{d.summary}</p>}
            <div className="mt-6">{d.body.trim() ? <LegalMarkdown source={d.body} /> : <p className="text-sm text-zinc-500">Nothing written yet.</p>}</div>
          </div>
        )}
      </div>
    </section>
  );
}
