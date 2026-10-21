'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Editor } from '@tiptap/react';
import { ChevronRight, CornerDownRight, FilePlus2, FileSymlink, FileText, Link2, Loader2, Search } from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { childrenOf } from '@/lib/doc-pages';
import { cn } from '@/lib/utils';

// A wiki of pages (Stage 5 · B9.2; src/server/docs.ts): the pages above this one, the pages under
// it, the pages that link here, moving it, and linking to another page from the text.

export interface PageRef { id: string; title: string }
interface ListedDoc { id: string; title: string; space: string | null; parentId: string | null }

/** Docs › the pages above › (this page's title is the heading itself). */
export function DocBreadcrumb({ path }: { path: PageRef[] }) {
  if (!path.length) return null;
  return (
    <nav aria-label="Pages above this one" className="flex items-center gap-1 text-[11px] text-zinc-500 min-w-0">
      <Link href="/docs" className="hover:text-indigo-500 shrink-0">Docs</Link>
      {path.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 min-w-0">
          <ChevronRight className="w-3 h-3 shrink-0" aria-hidden />
          <Link href={`/docs/${p.id}`} className="truncate hover:text-indigo-500 max-w-[10rem]">{p.title}</Link>
        </span>
      ))}
    </nav>
  );
}

/** Sub-pages, "Linked from", and moving the page, under the document. */
export function DocPagesPanel({ doc, canEdit, canMove, onChanged }: { doc: { id: string; parentId: string | null; space: string | null; children: PageRef[]; backlinks: PageRef[] }; canEdit: boolean; canMove: boolean; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: listing } = useSWR<{ docs: ListedDoc[] }>(canMove ? '/api/docs' : null, authedJson);
  // Pages it could go under: the same place, not itself or anything under it.
  const options = useMemo(() => {
    if (!listing) return [];
    const kids = childrenOf(listing.docs), below = new Set<string>([doc.id]);
    const walk = (id: string) => { for (const c of kids.get(id) ?? []) if (!below.has(c.id)) { below.add(c.id); walk(c.id); } };
    walk(doc.id);
    return listing.docs.filter((d) => d.space === doc.space && !below.has(d.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [listing, doc.id, doc.space]);

  const addPage = async () => {
    setBusy('add');
    try { const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: 'Untitled page', parentId: doc.id }) }); router.push(`/docs/${d.id}`); }
    catch (e) { toast.error((e as Error).message); setBusy(null); }
  };
  const move = async (to: string) => {
    setBusy('move');
    try { await authedJson(`/api/docs/${doc.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: to || null }) }); onChanged(); toast.success(to ? 'Moved' : 'Moved to the top'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  if (!doc.children.length && !doc.backlinks.length && !canEdit && !canMove) return null;
  return (
    <section aria-label="Pages" className="max-w-3xl mx-auto mb-10 px-1 grid sm:grid-cols-2 gap-3">
      <div className="panel p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pages inside</h2>
          {canEdit && <button type="button" onClick={() => void addPage()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}New page</button>}
        </div>
        {doc.children.length ? (
          <ul className="space-y-1">
            {doc.children.map((c) => <li key={c.id}><Link href={`/docs/${c.id}`} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-300"><CornerDownRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden /><span className="truncate">{c.title}</span></Link></li>)}
          </ul>
        ) : <p className="text-sm text-zinc-500">No pages inside this one yet. Pages inside are shared with the same people.</p>}
        {canMove && (
          <label className="block pt-2 text-xs text-zinc-500">This page sits under
            <select value={doc.parentId ?? ''} disabled={!!busy || !listing} onChange={(e) => void move(e.target.value)} className="input mt-1 py-1.5 text-sm">
              <option value="">Nothing (a top page)</option>
              {doc.parentId && !options.some((o) => o.id === doc.parentId) && <option value={doc.parentId}>The page above</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="panel p-4 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Linked from</h2>
        {doc.backlinks.length ? (
          <ul className="space-y-1">
            {doc.backlinks.map((b) => <li key={b.id}><Link href={`/docs/${b.id}`} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-300"><Link2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden /><span className="truncate">{b.title}</span></Link></li>)}
          </ul>
        ) : <p className="text-sm text-zinc-500">No other page links here yet. Use “Link a page” in the toolbar to link pages together.</p>}
      </div>
    </section>
  );
}

/** A toolbar button that links the selected text (or the page's title) to another page. */
export function PageLinkButton({ editor, disabled, currentId }: { editor: Editor | null; disabled: boolean; currentId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useSWR<{ docs: ListedDoc[] }>(open ? '/api/docs' : null, authedJson);
  const shown = (data?.docs ?? []).filter((d) => d.id !== currentId && d.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  const pick = (d: ListedDoc) => {
    if (!editor) return;
    const href = `/docs/${d.id}`;
    const { empty } = editor.state.selection;
    if (empty) editor.chain().focus().insertContent({ type: 'text', text: d.title, marks: [{ type: 'link', attrs: { href } }] }).insertContent(' ').run();
    else editor.chain().focus().setLink({ href }).run();
    setOpen(false); setQ('');
  };
  return (
    <div className="relative shrink-0">
      <button type="button" disabled={disabled || !editor} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Link a page" aria-label="Link a page"
        className={cn('h-8 px-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40', open ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
        <FileSymlink className="w-4 h-4" /><span className="max-sm:sr-only">Link a page</span>
      </button>
      {open && (
        <div className="absolute end-0 top-10 z-40 w-72 rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl p-2 space-y-1.5" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <label className="relative block">
            <span className="sr-only">Find a page</span>
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" className="input py-1.5 ps-8 text-sm" />
          </label>
          {!data ? <div className="h-16 rounded-xl skeleton" /> : !shown.length ? <p className="text-xs text-zinc-500 px-1 py-2">No pages found.</p> : (
            <ul className="max-h-64 overflow-y-auto">
              {shown.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => pick(d)} className="w-full text-start px-2 py-1.5 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden /><span className="truncate">{d.title}</span></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
