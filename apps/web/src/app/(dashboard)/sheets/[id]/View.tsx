'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowLeft, FileSpreadsheet, FileUp, History, Loader2, MessageSquare, Printer, RotateCcw, Share2, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { PresenceStack, type Present } from '@/components/ui/PresenceStack';
import { Menu } from '@/components/ui/Menu';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import type { DocStatus } from '@/lib/use-live-doc';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { cleanBook, type BookJSON } from '@/lib/sheet/book';
import { Calc, mapSource } from '@/lib/sheet/calc';
import { parseAddr } from '@/lib/sheet/refs';
import { sheetHtml } from '@/lib/sheet/render';
import { sheetTemplateById } from '@/lib/sheet/templates';
import { DocBreadcrumb, type PageRef } from '@/components/docs/DocPages';
import { Comments, ShareSheet, type DocComment } from '@/components/docs/DocSide';
import { SheetEditor, type SheetApi } from '@/components/sheets/SheetEditor';
import { downloadCsv, downloadXlsx, printBook, readSheetFile } from '@/components/sheets/sheet-files';

// One spreadsheet (Office suite): its title, who's here, the editor, and around it comments on
// cells, the version history (look at one and go back to it), sharing, and the File menu: Excel,
// CSV and PDF copies, and opening Excel or CSV files.

interface Info { id: string; kind: string; title: string; parentId: string | null; path: PageRef[]; course: { code: string; name: string } | null; chat?: { id: string; name: string } | null; canEdit: boolean; canManage: boolean; me: { id: string; name: string }; members: { userId: string; role: string; name: string }[] }

const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const valuesOf = (book: BookJSON) => {
  const calc = new Calc(mapSource(book.sheets.map((s) => ({ id: s.id, name: s.name, cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v])) }))));
  return (sheet: string, key: string) => { const x = parseAddr(key); return x ? calc.value(sheet, x.r, x.c) : null; };
};

function SheetPage({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<Info>(`/api/docs/${id}`, authedJson);
  const { data: comments } = useSWR<DocComment[]>(`/api/docs/${id}/comments`, authedJson);
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [present, setPresent] = useState<Present[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState<'history' | 'share' | null>(null);
  const [api, setApi] = useState<SheetApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = (status.s === 'live' || status.s === 'offline') && status.canEdit;
  // Cells with open comments get a small corner mark.
  const quotes = useMemo(() => (comments ?? []).filter((c) => !c.resolvedAt && c.quote).map((c) => c.quote!), [comments]);
  // What a new spreadsheet starts as: a file opened from the Docs page, or a template.
  const start = (): BookJSON | null => {
    try {
      const raw = sessionStorage.getItem(`sheet-import:${id}`);
      if (raw) { sessionStorage.removeItem(`sheet-import:${id}`); return cleanBook(JSON.parse(raw)); }
    } catch { /* no storage */ }
    const sp = new URLSearchParams(window.location.search);
    const t = sheetTemplateById(sp.get('template'));
    if (sp.has('template')) { sp.delete('template'); window.history.replaceState(window.history.state, '', `${window.location.pathname}${sp.size ? `?${sp}` : ''}`); }
    return t ? t.book() : null;
  };

  // A document or presentation opened here goes to its own page.
  const wrongKind = !!data && data.kind !== 'sheet';
  useEffect(() => { if (data && data.kind !== 'sheet') router.replace(data.kind === 'slides' ? `/slides/${id}` : `/docs/${id}`); }, [data, router, id]);
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
  const book = () => api?.book() ?? { sheets: [] };
  const importFile = async (f: File) => {
    try {
      const { book: b, skipped } = await readSheetFile(f);
      api?.addSheets(b);
      toast.success(`${f.name} opened${skipped.length ? `. Not brought in: ${skipped.join('; ')}` : ''}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="px-3 sm:px-6 pt-3 pb-2 flex items-center gap-1.5 border-b border-zinc-200/70 dark:border-white/[0.06]">
        <Link href="/docs" aria-label="Docs" className="p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></Link>
        <span aria-hidden className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 text-white hidden sm:flex items-center justify-center shrink-0"><FileSpreadsheet className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <DocBreadcrumb path={data.path} />
          <input data-shared={`doc:${id}`} value={shownTitle} readOnly={!data.canEdit} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title" className="w-full bg-transparent text-lg font-bold text-zinc-900 dark:text-white outline-none truncate" />
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', status.s === 'live' ? 'bg-emerald-500' : status.s === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-400')} />
            {status.s === 'live' ? (status.canEdit ? 'Saved as you type' : 'You can read this spreadsheet') : status.s === 'connecting' ? 'Connecting…' : status.s === 'unavailable' ? 'Not available right now' : status.canEdit ? 'Offline: changes are kept on this device and sync when you’re back' : 'Offline: reconnecting'}
            {data.course && <span>· {data.course.code}</span>}
          </p>
        </div>
        <PresenceStack people={present} />
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" aria-label="Excel or CSV file to open" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        <Menu label="File" title="Download, print or open a file" button={<span className="text-xs font-semibold px-1">File</span>} items={[
          { label: 'Excel workbook (.xlsx)', icon: <FileSpreadsheet className="w-4 h-4" />, onSelect: () => { const b = book(); void downloadXlsx(shownTitle, b, valuesOf(b)).catch(() => toast.error('Couldn’t make the Excel file.')); } },
          { label: 'CSV of this sheet (.csv)', onSelect: () => { const b = book(); downloadCsv(shownTitle, b, api?.activeSheet() ?? '', valuesOf(b)); } },
          { label: 'Print or PDF: this sheet', icon: <Printer className="w-4 h-4" />, onSelect: () => { const b = book(); printBook(shownTitle, b, api?.activeSheet() ?? null, valuesOf(b)); } },
          { label: 'Print or PDF: every sheet', onSelect: () => { const b = book(); printBook(shownTitle, b, null, valuesOf(b)); } },
          'sep',
          { label: 'Open an Excel or CSV file', icon: <FileUp className="w-4 h-4" />, onSelect: () => fileRef.current?.click(), disabled: !editable },
        ]} />
        <button type="button" onClick={() => setSheet('history')} title="Version history" aria-label="Version history" className="p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><History className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPanel((p) => !p)} aria-pressed={panel} title="Comments" aria-label="Comments" className={cn('p-2 rounded-full', panel ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10')}><MessageSquare className="w-4 h-4" /></button>
        {data.canManage && !data.course && !data.chat && <button type="button" onClick={() => setSheet('share')} className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>}
        {data.canManage && <button type="button" aria-label="Delete spreadsheet" onClick={async () => { if (await confirmDialog({ title: 'Delete this spreadsheet?', message: 'Its sheets, versions and comments go for everyone.', destructive: true })) { await call(`/api/docs/${id}`, 'DELETE').catch((e) => toast.error((e as Error).message)); router.push('/docs'); } }} className="p-2 rounded-full text-zinc-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
      </header>
      <div className="flex-1 min-h-0 flex">
        <SheetEditor docId={id} me={data.me} canEdit={data.canEdit} title={shownTitle} onStatus={(s, canEdit) => setStatus({ s, canEdit })} onPresence={setPresent} onApi={setApi}
          commentQuotes={quotes} start={start} onComment={() => setPanel(true)} />
        <AnimatePresence>
          {panel && (
            <motion.aside key="comments" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring.smooth}
              className="fixed inset-x-0 bottom-0 top-1/3 z-40 rounded-t-3xl md:static md:rounded-none md:w-80 md:shrink-0 bg-white dark:bg-[#1b1b1e] border-s border-zinc-200/70 dark:border-white/[0.06] shadow-2xl md:shadow-none flex flex-col">
              <Comments docId={id} me={data.me.id} canEdit={data.canEdit} onClose={() => setPanel(false)}
                pick={() => api?.pickRef() ?? null} go={(q) => { if (!api?.goTo(q)) toast('Those cells have moved or gone since the comment.'); }}
                aboutLabel="About the selected cells" empty="No open comments. Select some cells and comment on them, or on the whole spreadsheet." />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {sheet === 'history' && <SheetHistory docId={id} canEdit={editable} api={api} onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ShareSheet doc={data} what="spreadsheet" onClose={() => setSheet(null)} onChanged={() => void mutate()} />}
    </div>
  );
}

function SheetHistory({ docId, canEdit, api, onClose }: { docId: string; canEdit: boolean; api: SheetApi | null; onClose: () => void }) {
  const { data, mutate } = useSWR<{ id: string; name: string | null; author: string; createdAt: string }[]>(`/api/docs/${docId}/versions`, authedJson);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { data: version } = useSWR<{ data: string | null }>(picked ? `/api/docs/${docId}/versions/${picked}` : null, authedJson);
  // The version's own data, drawn by this app (never the HTML it was saved with).
  const preview = useMemo(() => {
    if (!version?.data) return null;
    try {
      const b = cleanBook(JSON.parse(version.data));
      const v = valuesOf(b);
      return { book: b, html: b.sheets.map((s) => `<h3>${s.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h3>${sheetHtml(s, (k) => v(s.id, k), { maxCells: 3000, headers: true })}`).join('') };
    } catch { return null; }
  }, [version]);
  const snapshot = (n: string) => {
    if (!api) return Promise.resolve();
    const b = api.book();
    const data = JSON.stringify(b);
    const v = valuesOf(b);
    return call(`/api/docs/${docId}/versions`, 'POST', { html: b.sheets.map((s) => sheetHtml(s, (k) => v(s.id, k), { maxCells: 20_000 })).join('').slice(0, 380_000) || '<p></p>', text: n, data, name: n });
  };
  return (
    <Sheet title="Version history" wide onClose={onClose} footer={picked && preview && canEdit ? (
      <button type="button" onClick={async () => { if (!api || !(await confirmDialog({ title: 'Go back to this version?', message: 'The spreadsheet becomes this version for everyone. What’s there now stays in the history.' }))) return; await snapshot('Before going back').catch(() => {}); api.load(preview.book); toast.success('Restored'); onClose(); }}
        className="w-full btn-primary py-2.5 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" />Restore this version</button>
    ) : undefined}>
      {canEdit && (
        <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; try { await snapshot(name.trim()); setName(''); toast.success('Version saved'); void mutate(); } catch (err) { toast.error((err as Error).message); } }} className="flex gap-2 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name this version, e.g. Before marking" aria-label="Version name" className="input" />
          <button type="submit" disabled={!name.trim()} className="btn-primary shrink-0 disabled:opacity-50">Save</button>
        </form>
      )}
      {picked ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />All versions</button>
          <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 max-h-[55vh] overflow-auto p-3 text-xs text-zinc-800 dark:text-zinc-200 [&_h3]:font-semibold [&_h3]:my-2 [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 dark:[&_td]:border-white/10 [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:whitespace-nowrap [&_th]:border [&_th]:border-zinc-200 dark:[&_th]:border-white/10 [&_th]:px-1.5 [&_th]:bg-zinc-50 dark:[&_th]:bg-white/[0.04] [&_th]:font-medium [&_th]:text-zinc-600 dark:[&_th]:text-zinc-400">
            {!version ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500 m-6" /> : preview ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : <p className="text-sm text-zinc-600 dark:text-zinc-400">This version can’t be shown.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {!data ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : !data.length && <p className="text-sm text-zinc-600 dark:text-zinc-400">No versions yet. They’re saved as people work.</p>}
          {data?.map((v) => (
            <button key={v.id} type="button" onClick={() => setPicked(v.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-start hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
              <FileSpreadsheet className={cn('w-4 h-4 shrink-0', v.name ? 'text-emerald-600' : 'text-zinc-500')} />
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

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts).
export default function SheetPageRoute() {
  const p = usePathParams('/sheets/[id]');
  return p ? <SheetPage key={p.id} id={p.id} /> : <AddressLoading portal />;
}
