'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowLeft, FileUp, History, Loader2, MessageSquare, Presentation, Printer, RotateCcw, Share2, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { PresenceStack, type Present } from '@/components/ui/PresenceStack';
import { Menu } from '@/components/ui/Menu';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import type { DocStatus } from '@/lib/use-live-doc';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { cleanDeck, deckText, themeOf, widthOf, type DeckJSON } from '@/lib/slides/deck';
import { deckReadable } from '@/lib/slides/render';
import { deckTemplateById } from '@/lib/slides/templates';
import { DocBreadcrumb, type PageRef } from '@/components/docs/DocPages';
import { Comments, ShareSheet, type DocComment } from '@/components/docs/DocSide';
import { SlidesEditor, type SlidesApi } from '@/components/slides/SlidesEditor';
import { SlideView } from '@/components/slides/SlideView';
import { Audience, Presenter } from '@/components/slides/Presenter';
import { downloadPptx, printDeck, readDeckFile } from '@/components/slides/slide-files';

// One presentation (Office suite): its title, who's here, the editor, and around it comments on
// slides, the version history (look at one and go back to it), sharing, presenting, and the File
// menu: PowerPoint and PDF copies, and opening PowerPoint files. With ?audience=1 it's the
// audience window of a presentation given from another window on this device.

interface Info { id: string; kind: string; title: string; path: PageRef[]; course: { code: string; name: string } | null; chat?: { id: string; name: string } | null; canEdit: boolean; canManage: boolean; me: { id: string; name: string }; members: { userId: string; role: string; name: string }[] }
const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

function SlidesPage({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<Info>(`/api/docs/${id}`, authedJson);
  const { data: comments } = useSWR<DocComment[]>(`/api/docs/${id}/comments`, authedJson);
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [present, setPresent] = useState<Present[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState<'history' | 'share' | null>(null);
  const [api, setApi] = useState<SlidesApi | null>(null);
  const [show, setShow] = useState<{ deck: DeckJSON; from: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = (status.s === 'live' || status.s === 'offline') && status.canEdit;
  const quotes = useMemo(() => (comments ?? []).filter((c) => !c.resolvedAt && c.quote).map((c) => c.quote!), [comments]);
  const wrongKind = !!data && data.kind !== 'slides';
  useEffect(() => { if (data && data.kind !== 'slides') router.replace(data.kind === 'sheet' ? `/sheets/${id}` : `/docs/${id}`); }, [data, router, id]);
  const start = (): DeckJSON | null => {
    try { const raw = sessionStorage.getItem(`deck-import:${id}`); if (raw) { sessionStorage.removeItem(`deck-import:${id}`); return cleanDeck(JSON.parse(raw)); } } catch { /* no storage */ }
    const sp = new URLSearchParams(window.location.search);
    const t = deckTemplateById(sp.get('template'));
    if (sp.has('template')) { sp.delete('template'); window.history.replaceState(window.history.state, '', `${window.location.pathname}${sp.size ? `?${sp}` : ''}`); }
    return t ? t.deck() : null;
  };
  if (wrongKind) return null;
  if (error) return <div className="p-8 text-sm text-rose-600">{(error as Error).message}</div>;
  if (!data) return <div className="flex-1 p-6"><div className="h-96 rounded-2xl skeleton" /></div>;
  const shownTitle = title ?? data.title;
  const saveTitle = async () => {
    const t = (title ?? '').trim();
    if (!t || t === data.title) { setTitle(null); return; }
    try { await call(`/api/docs/${id}`, 'PATCH', { title: t }); await mutate(); } catch (e) { toast.error((e as Error).message); }
    setTitle(null);
  };
  const importFile = async (f: File) => {
    setBusy('Opening…');
    try {
      const { deck, skipped } = await readDeckFile(f, (d, n) => setBusy(`Uploading pictures ${d} of ${n}…`));
      api?.addSlides(deck);
      toast.success(`${f.name} opened${skipped.length ? `. Not brought in: ${skipped.join('; ')}` : ''}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="px-3 sm:px-6 pt-3 pb-2 flex items-center gap-1.5 border-b border-zinc-200/70 dark:border-white/[0.06]">
        <Link href="/docs" aria-label="Docs" className="p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></Link>
        <span aria-hidden className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 text-white hidden sm:flex items-center justify-center shrink-0"><Presentation className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <DocBreadcrumb path={data.path} />
          <input data-shared={`doc:${id}`} value={shownTitle} readOnly={!data.canEdit} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title" className="w-full bg-transparent text-lg font-bold text-zinc-900 dark:text-white outline-none truncate" />
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', status.s === 'live' ? 'bg-emerald-500' : status.s === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-400')} />
            {busy ?? (status.s === 'live' ? (status.canEdit ? 'Saved as you type' : 'You can read this presentation') : status.s === 'connecting' ? 'Connecting…' : status.s === 'unavailable' ? 'Not available right now' : status.canEdit ? 'Offline: changes are kept on this device and sync when you’re back' : 'Offline: reconnecting')}
            {data.course && <span>· {data.course.code}</span>}
          </p>
        </div>
        <PresenceStack people={present} />
        <input ref={fileRef} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" aria-label="PowerPoint file to open" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        <Menu label="File" title="Download, print or open a file" button={<span className="text-xs font-semibold px-1">File</span>} items={[
          { label: 'PowerPoint (.pptx)', icon: <Presentation className="w-4 h-4" />, onSelect: () => { if (!api) return; setBusy('Making the PowerPoint file…'); void downloadPptx(shownTitle, api.deck()).then((missing) => { if (missing) toast(`${missing} picture${missing === 1 ? '' : 's'} couldn’t be added.`); }, () => toast.error('Couldn’t make the PowerPoint file.')).finally(() => setBusy(null)); } },
          { label: 'Print or PDF: slides', icon: <Printer className="w-4 h-4" />, onSelect: () => api && printDeck(shownTitle, api.deck(), false) },
          { label: 'Print or PDF: slides with notes', onSelect: () => api && printDeck(shownTitle, api.deck(), true) },
          'sep',
          { label: 'Open a PowerPoint file', icon: <FileUp className="w-4 h-4" />, onSelect: () => fileRef.current?.click(), disabled: !editable || !!busy },
        ]} />
        <button type="button" onClick={() => setSheet('history')} title="Version history" aria-label="Version history" className="p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><History className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPanel((p) => !p)} aria-pressed={panel} title="Comments" aria-label="Comments" className={cn('p-2 rounded-full', panel ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10')}><MessageSquare className="w-4 h-4" /></button>
        {data.canManage && !data.course && !data.chat && <button type="button" onClick={() => setSheet('share')} className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>}
        {data.canManage && <button type="button" aria-label="Delete presentation" onClick={async () => { if (await confirmDialog({ title: 'Delete this presentation?', message: 'Its slides, versions and comments go for everyone.', destructive: true })) { await call(`/api/docs/${id}`, 'DELETE').catch((e) => toast.error((e as Error).message)); router.push('/docs'); } }} className="p-2 rounded-full text-zinc-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
      </header>
      <div className="flex-1 min-h-0 flex">
        <SlidesEditor docId={id} me={data.me} canEdit={data.canEdit} onStatus={(s, c) => setStatus({ s, canEdit: c })} onPresence={setPresent} onApi={setApi} start={start}
          onPresent={(deck, from) => setShow({ deck, from })} commentQuotes={quotes} />
        <AnimatePresence>
          {panel && (
            <motion.aside key="comments" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring.smooth}
              className="fixed inset-x-0 bottom-0 top-1/3 z-40 rounded-t-3xl md:static md:rounded-none md:w-80 md:shrink-0 bg-white dark:bg-[#0f1322] border-l border-zinc-200/70 dark:border-white/[0.06] shadow-2xl md:shadow-none flex flex-col">
              <Comments docId={id} me={data.me.id} canEdit={data.canEdit} onClose={() => setPanel(false)}
                pick={() => api?.pickRef() ?? null} go={(q) => { if (!api?.goTo(q)) toast('That slide has gone since the comment.'); }}
                aboutLabel="About this slide" empty="No open comments. Comment on a slide, or on the whole presentation." />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {show && <Presenter deck={show.deck} docId={id} start={show.from} onClose={() => setShow(null)} />}
      {sheet === 'history' && <DeckHistory docId={id} canEdit={editable} api={api} onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ShareSheet doc={data} what="presentation" onClose={() => setSheet(null)} onChanged={() => void mutate()} />}
    </div>
  );
}

function DeckHistory({ docId, canEdit, api, onClose }: { docId: string; canEdit: boolean; api: SlidesApi | null; onClose: () => void }) {
  const { data, mutate } = useSWR<{ id: string; name: string | null; author: string; createdAt: string }[]>(`/api/docs/${docId}/versions`, authedJson);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { data: version } = useSWR<{ data: string | null }>(picked ? `/api/docs/${docId}/versions/${picked}` : null, authedJson);
  const deck = useMemo(() => { if (!version?.data) return null; try { return cleanDeck(JSON.parse(version.data)); } catch { return null; } }, [version]);
  const snapshot = (n: string) => {
    if (!api) return Promise.resolve();
    const d = api.deck();
    return call(`/api/docs/${docId}/versions`, 'POST', { html: deckReadable(d), text: deckText(d).replace(/\s+/g, ' ').slice(0, 300), data: JSON.stringify(d), name: n });
  };
  return (
    <Sheet title="Version history" wide onClose={onClose} footer={picked && deck && canEdit ? (
      <button type="button" onClick={async () => { if (!api || !(await confirmDialog({ title: 'Go back to this version?', message: 'The presentation becomes this version for everyone. What’s there now stays in the history.' }))) return; await snapshot('Before going back').catch(() => {}); api.load(deck); toast.success('Restored'); onClose(); }}
        className="w-full btn-primary py-2.5 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" />Restore this version</button>
    ) : undefined}>
      {canEdit && (
        <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; try { await snapshot(name.trim()); setName(''); toast.success('Version saved'); void mutate(); } catch (err) { toast.error((err as Error).message); } }} className="flex gap-2 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name this version, e.g. Before the rehearsal" aria-label="Version name" className="input" />
          <button type="submit" disabled={!name.trim()} className="btn-primary shrink-0 disabled:opacity-50">Save</button>
        </form>
      )}
      {picked ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />All versions</button>
          <div className="max-h-[55vh] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
            {!version ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500 m-6" /> : deck ? deck.slides.map((s, i) => (
              <figure key={s.id} className="space-y-1"><SlideView slide={s} theme={themeOf(deck.theme)} W={widthOf(deck.ratio)} scale={180 / widthOf(deck.ratio)} mode="thumb" className="rounded-md ring-1 ring-zinc-200 dark:ring-white/10" /><figcaption className="text-xs text-zinc-600 dark:text-zinc-400">Slide {i + 1}</figcaption></figure>
            )) : <p className="text-sm text-zinc-600 dark:text-zinc-400">This version can’t be shown.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {!data ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : !data.length && <p className="text-sm text-zinc-600 dark:text-zinc-400">No versions yet. They’re saved as people work.</p>}
          {data?.map((v) => (
            <button key={v.id} type="button" onClick={() => setPicked(v.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
              <Presentation className={cn('w-4 h-4 shrink-0', v.name ? 'text-orange-600' : 'text-zinc-500')} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{v.name ?? new Date(v.createdAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">{v.author}{v.name ? ` · ${new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** The audience window reads the deck once (the presenter's window sends where it is). */
function AudiencePage({ id }: { id: string }) {
  const { data } = useSWR<{ id: string; name: string | null }[]>(`/api/docs/${id}/versions`, authedJson);
  const latest = data?.[0]?.id;
  const { data: v } = useSWR<{ data: string | null }>(latest ? `/api/docs/${id}/versions/${latest}` : null, authedJson);
  const deck = useMemo(() => { try { return v?.data ? cleanDeck(JSON.parse(v.data)) : null; } catch { return null; } }, [v]);
  if (!deck) return <div className="fixed inset-0 bg-black text-zinc-400 flex items-center justify-center">{data && !latest ? 'Save the presentation once (make a change), then open this window again.' : 'Getting the slides…'}</div>;
  return <Audience deck={deck} docId={id} />;
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts).
export default function SlidesPageRoute() {
  const p = usePathParams('/slides/[id]');
  const [audience] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('audience') === '1');
  if (!p) return <AddressLoading portal />;
  return audience ? <AudiencePage key={p.id} id={p.id} /> : <SlidesPage key={p.id} id={p.id} />;
}
