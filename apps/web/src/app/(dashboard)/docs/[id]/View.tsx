'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { ArrowLeft, Download, FileText, FileUp, ListChecks, History, Loader2, MessageSquare, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { PresenceStack, type Present } from '@/components/ui/PresenceStack';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Sheet } from '@/components/ui/Sheet';
import { DocEditor, WORD_EXTENSIONS, type DocStatus } from '@/components/docs/DocEditor';
import { WordToolbar } from '@/components/docs/WordToolbar';
import { FindBar, PageSetupSheet, WordCount, usePageSetup } from '@/components/docs/WordPanels';
import { fillContents, headingsOf } from '@/components/docs/word-ext';
import { pageCss, type PageSetup } from '@/lib/page-setup';
import type * as Y from 'yjs';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { templateById } from '@/lib/doc-templates';
import { downloadDocx, downloadMarkdown, importFile } from '@/components/docs/doc-files';
import { DocBreadcrumb, DocPagesPanel, PageLinkButton, type PageRef } from '@/components/docs/DocPages';
import { DocEmbed, EmbedMenu } from '@/components/docs/DocEmbed';
import { DocAiButton } from '@/components/docs/DocAi';
import { Comments, ShareSheet } from '@/components/docs/DocSide';
import { SuggestToggle, SuggestionsPanel, useSuggestionCount } from '@/components/docs/Suggestions';
import { SuggestionDelete, SuggestionInsert } from '@/components/docs/suggestions-ext';

// One document (Stage 4 · 3.2): title, who's here, the toolbar and the page; comments on what you
// select, version history (preview and restore), sharing, and PDF / Word / Markdown copies; import
// a Word, Markdown or text file at the cursor (Stage 5 · B9.6).

interface DocInfo { id: string; kind?: string; title: string; parentId: string | null; space: string | null; path: PageRef[]; children: PageRef[]; backlinks: PageRef[]; course: { code: string; name: string } | null; chat?: { id: string; name: string } | null; canEdit: boolean; canManage: boolean; me: { id: string; name: string }; members: { userId: string; role: string; name: string }[] }

const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const PRINT_CSS = 'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#18181b;max-width:46rem;margin:2rem auto;padding:0 1.5rem}h1{font-size:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d4d4d8;padding:.4em .6em;text-align:left}pre{background:#f4f4f5;padding:1em;border-radius:.5em;white-space:pre-wrap}img{max-width:100%}blockquote{border-left:3px solid #818cf8;margin-left:0;padding-left:1em;color:#52525b}';

function exportPdf(title: string, html: string, page?: PageSetup) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  // Page setup (paper, margins, header, footer, page numbers) and page breaks (Office suite · O3).
  const extra = `${page ? pageCss(page) : ''}.doc-page-break{break-after:page;border:0;height:0;margin:0}.doc-page-break span{display:none}.doc-toc{border:1px solid #e4e4e7;border-radius:.6em;padding:.6em 1em}.doc-toc ol{list-style:none;padding-left:0}.doc-toc-title{font-weight:700}`;
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>${PRINT_CSS}${extra}</style></head><body><h1>${title.replace(/</g, '&lt;')}</h1>${html}</body></html>`);
  d.close();
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

const noop = () => {};

function DocPage({ id }: { id: string }) {
  const router = useRouter();
  const role = useAuthStore((st) => st.user?.role);
  const inboxPath = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';
  const { data, error, mutate } = useSWR<DocInfo>(`/api/docs/${id}`, authedJson);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [present, setPresent] = useState<Present[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [panel, setPanel] = useState<'comments' | 'suggestions' | null>(null);
  const suggestions = useSuggestionCount(editor);
  const [sheet, setSheet] = useState<'history' | 'share' | 'page' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [page, setPage] = usePageSetup(ydoc);
  // Ctrl / ⌘ + F in the document opens find and replace.
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h') && editor?.view.dom.contains(document.activeElement)) { e.preventDefault(); setFinding(true); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [editor]);
  const importRef = useRef<HTMLInputElement>(null);
  // Offline (Stage 5 · B9.7), people who may edit keep writing on this device's copy.
  const editable = (status.s === 'live' || status.s === 'offline') && status.canEdit;
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  // A new doc started from a template (Stage 5 · B9.1; ?template=): once it's live and still empty,
  // the template goes in (as an edit, so everyone sees it and it's saved), then the address is tidied.
  useEffect(() => {
    if (!editor || !editable) return;
    // A file converted into a doc (Stage 5 · B9.14) waits in this tab's storage.
    let imported: string | null = null;
    try { imported = sessionStorage.getItem(`doc-import:${id}`); sessionStorage.removeItem(`doc-import:${id}`); } catch { /* no storage */ }
    if (imported && editor.isEmpty) { editor.commands.setContent(imported); return; }
    const sp = new URLSearchParams(window.location.search);
    const t = templateById(sp.get('template'));
    if (!sp.has('template')) return;
    if (t && editor.isEmpty) editor.commands.setContent(t.html);
    sp.delete('template');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${sp.size ? `?${sp}` : ''}`);
  }, [editor, editable, id]);

  // A spreadsheet or presentation opened here (an old link, a search result) goes to its own page.
  const otherKind = data?.kind === 'sheet' || data?.kind === 'slides' ? data.kind : null;
  useEffect(() => { if (otherKind) router.replace(`/${otherKind === 'sheet' ? 'sheets' : 'slides'}/${id}`); }, [otherKind, router, id]);
  if (otherKind) return null;
  if (error) return <div className="p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (!data) return <div className="flex-1 p-6"><div className="h-96 rounded-2xl skeleton" /></div>;
  const shownTitle = title ?? data.title;
  const saveTitle = async () => {
    const t = (title ?? '').trim();
    if (!t || t === data.title) { setTitle(null); return; }
    try { await call(`/api/docs/${id}`, 'PATCH', { title: t }); await mutate(); } catch (e) { toast.error((e as Error).message); }
    setTitle(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="px-3 sm:px-6 pt-3 pb-2 flex items-center gap-2 border-b border-zinc-200/70 dark:border-white/[0.06]">
        <Link href={data.chat ? `${inboxPath}?c=${data.chat.id}` : '/docs'} aria-label={data.chat ? `Back to ${data.chat.name}` : 'Docs'} className="p-2 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="flex-1 min-w-0">
          <DocBreadcrumb path={data.path} />
          <input data-shared={`doc:${id}`} value={shownTitle} readOnly={!data.canEdit} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title" className="w-full bg-transparent text-lg font-bold text-zinc-900 dark:text-white outline-none truncate" />
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', status.s === 'live' ? 'bg-emerald-500' : status.s === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-400')} />
            {status.s === 'live' ? (status.canEdit ? 'Saved as you type' : 'You can read this document') : status.s === 'connecting' ? 'Connecting…' : status.s === 'unavailable' ? 'Not available right now' : status.canEdit ? 'Offline: changes are kept on this device and sync when you’re back' : 'Offline: reconnecting'}
            {data.course && <span>· {data.course.code}</span>}
            {data.chat && <span>· Canvas of {data.chat.name}</span>}
            {editor && <WordCount editor={editor} docId={id} />}

          </p>
        </div>
        <PresenceStack people={present} />
        <div className="relative">
          <input ref={importRef} type="file" accept=".docx,.md,.markdown,.txt,.html,.htm" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f && editor) void importFile(f, editor).then(() => toast.success(`${f.name} added`), (err: Error) => toast.error(err.message));
          }} />
          <button type="button" onClick={() => setExportOpen((o) => !o)} title="Download or import" aria-label="Download or import" aria-expanded={exportOpen} className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Download className="w-4 h-4" /></button>
          <AnimatePresence>
            {exportOpen && editor && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.snappy} onMouseLeave={() => setExportOpen(false)}
                className="absolute end-0 top-10 z-30 w-56 py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm">
                <button type="button" onClick={() => { setExportOpen(false); exportPdf(shownTitle, fillContents(editor.getHTML(), headingsOf(editor.state)), page); }} className="w-full text-start px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">PDF (print)</button>
                <button type="button" onClick={() => { setExportOpen(false); void downloadDocx(shownTitle, editor, page).catch(() => toast.error('Couldn’t make the Word file.')); }} className="w-full text-start px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">Word (.docx)</button>
                <button type="button" onClick={() => { setExportOpen(false); downloadMarkdown(shownTitle, editor); }} className="w-full text-start px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">Markdown (.md)</button>
                <div className="my-1 h-px bg-zinc-200 dark:bg-white/10" />
                <button type="button" onClick={() => { setExportOpen(false); setSheet('page'); }} className="w-full text-start px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">Page setup (paper, margins, page numbers)</button>
                <button type="button" disabled={!editable} onClick={() => { setExportOpen(false); importRef.current?.click(); }} className="w-full text-start px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 inline-flex items-center gap-2"><FileUp className="w-4 h-4" />Import Word, Markdown or text</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button type="button" onClick={() => setSheet('history')} title="Version history" aria-label="Version history" className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><History className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPanel(panel === 'suggestions' ? null : 'suggestions')} aria-pressed={panel === 'suggestions'} title="Suggestions" aria-label={`Suggestions${suggestions ? `, ${suggestions} waiting` : ''}`} className={cn('relative p-2 rounded-full', panel === 'suggestions' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}><ListChecks className="w-4 h-4" />{suggestions > 0 && <span className="absolute -top-0.5 -end-0.5 min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-bold grid place-items-center tabular-nums" style={{ background: '#047857' }} aria-hidden>{suggestions}</span>}</button>
        <button type="button" onClick={() => setPanel(panel === 'comments' ? null : 'comments')} aria-pressed={panel === 'comments'} title="Comments" aria-label="Comments" className={cn('p-2 rounded-full', panel === 'comments' ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}><MessageSquare className="w-4 h-4" /></button>
        {data.canManage && !data.course && !data.chat && <button type="button" onClick={() => setSheet('share')} className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>}
        {data.canManage && <button type="button" aria-label="Delete document" onClick={async () => { if (await confirmDialog({ title: 'Delete this document?', message: data.children.length ? 'Its text, versions and comments go for everyone. The pages inside it move to the top.' : 'Its text, versions and comments go for everyone.', destructive: true })) { await call(`/api/docs/${id}`, 'DELETE').catch((e) => toast.error((e as Error).message)); router.push('/docs'); } }} className="p-2 rounded-full text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
      </header>
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0e1a]/80 backdrop-blur border-b border-zinc-200/70 dark:border-white/[0.06] flex items-center pe-2"><div className="flex-1 min-w-0"><WordToolbar editor={editor} disabled={!editable} onFind={() => setFinding((f) => !f)} /></div><SuggestToggle editor={editor} disabled={!editable} /><DocAiButton editor={editor} canEdit={editable} docId={id} /><EmbedMenu editor={editor} disabled={!editable} />{!data.chat && <PageLinkButton editor={editor} disabled={!editable} currentId={id} />}</div>
      {finding && editor && <FindBar editor={editor} canEdit={editable} onClose={() => { setFinding(false); editor.commands.focus(); }} />}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-y-auto">
          <div className={cn('mx-auto my-4 sm:my-8 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/[0.06] shadow-sm', page.orientation === 'landscape' ? 'max-w-5xl' : 'max-w-3xl')}>
            <DocEditor docId={id} me={data.me} canEdit={data.canEdit} onStatus={(s, canEdit) => setStatus({ s, canEdit })} onPeers={noop} onPresence={setPresent} onEditor={setEditor} onYdoc={setYdoc} />
          </div>
          {!data.chat && <DocPagesPanel doc={data} canEdit={data.canEdit} canMove={data.canManage} onChanged={() => void mutate()} />}
        </div>
        <AnimatePresence>
          {panel === 'comments' && (
            <motion.aside key="comments" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring.smooth}
              className="fixed inset-x-0 bottom-0 top-1/3 z-40 rounded-t-3xl md:static md:rounded-none md:w-80 md:shrink-0 bg-white dark:bg-[#0f1322] border-s border-zinc-200/70 dark:border-white/[0.06] shadow-2xl md:shadow-none flex flex-col">
              <Comments docId={id} me={data.me.id} canEdit={data.canEdit} onClose={() => setPanel(null)} pick={() => pickText(editor)} go={(q) => goToQuote(editor, q)} />
            </motion.aside>
          )}
          {panel === 'suggestions' && (
            <motion.aside key="suggestions" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring.smooth}
              className="fixed inset-x-0 bottom-0 top-1/3 z-40 rounded-t-3xl md:static md:rounded-none md:w-80 md:shrink-0 bg-white dark:bg-[#0f1322] border-s border-zinc-200/70 dark:border-white/[0.06] shadow-2xl md:shadow-none flex flex-col">
              <SuggestionsPanel editor={editor} canEdit={editable} onClose={() => setPanel(null)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {sheet === 'history' && <HistorySheet docId={id} editor={editor} canEdit={editable} onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ShareSheet doc={data} onClose={() => setSheet(null)} onChanged={() => void mutate()} />}
      {sheet === 'page' && <PageSetupSheet page={page} canEdit={editable} onChange={setPage} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** The selected text, for a comment about it. */
function pickText(editor: Editor | null): string | null {
  if (!editor) return null;
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ').trim();
  if (!text) { toast('Select some text in the document first.'); return null; }
  return text;
}

/** Finds the first place a quoted bit of text is and selects it. */
function goToQuote(editor: Editor | null, quote: string) {
  if (!editor) return;
  const needle = quote.slice(0, 60);
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null || !node.isText || !node.text) return found === null;
    const i = node.text.indexOf(needle);
    if (i >= 0) found = pos + i;
    return found === null;
  });
  if (found === null) { toast('That text has changed since the comment.'); return; }
  editor.chain().focus().setTextSelection({ from: found, to: found + needle.length }).scrollIntoView().run();
}

function HistorySheet({ docId, editor, canEdit, onClose }: { docId: string; editor: Editor | null; canEdit: boolean; onClose: () => void }) {
  const { data, mutate } = useSWR<{ id: string; name: string | null; author: string; createdAt: string }[]>(`/api/docs/${docId}/versions`, authedJson);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { data: version } = useSWR<{ html: string }>(picked ? `/api/docs/${docId}/versions/${picked}` : null, authedJson);
  // A read-only view of the version: parsed by the editor's own rules, so nothing unsafe shows.
  const preview = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit, TableKit, TaskList, TaskItem, Image, DocEmbed, SuggestionInsert, SuggestionDelete, ...WORD_EXTENSIONS], content: '', editorProps: { attributes: { class: 'doc-prose px-4 py-4 text-sm' } } });
  useEffect(() => { if (preview && version) preview.commands.setContent(version.html); }, [preview, version]);
  const saveNamed = async () => {
    if (!editor || !name.trim()) return;
    try { await call(`/api/docs/${docId}/versions`, 'POST', { html: editor.getHTML(), text: editor.getText().slice(0, 300), name: name.trim() }); setName(''); toast.success('Version saved'); void mutate(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Sheet title="Version history" onClose={onClose} footer={picked && version && canEdit ? (
      <button type="button" onClick={async () => { if (!editor || !(await confirmDialog({ title: 'Go back to this version?', message: 'The document becomes this version for everyone. The current text stays in the history.' }))) return; await call(`/api/docs/${docId}/versions`, 'POST', { html: editor.getHTML(), text: editor.getText().slice(0, 300), name: 'Before going back' }).catch(() => {}); editor.commands.setContent(version.html); toast.success('Restored'); onClose(); }}
        className="w-full btn-primary py-2.5 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" />Restore this version</button>
    ) : undefined}>
      {canEdit && (
        <form onSubmit={(e) => { e.preventDefault(); void saveNamed(); }} className="flex gap-2 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name this version, e.g. First draft" className="input" />
          <button type="submit" disabled={!name.trim()} className="btn-primary shrink-0 disabled:opacity-50">Save</button>
        </form>
      )}
      {picked ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />All versions</button>
          <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 max-h-[50vh] overflow-y-auto">{version ? <EditorContent editor={preview} /> : <Loader2 className="w-5 h-5 animate-spin text-indigo-400 m-6" />}</div>
        </div>
      ) : (
        <div className="space-y-1">
          {!data ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> : !data.length && <p className="text-sm text-zinc-500">No versions yet. They’re saved as people write.</p>}
          {data?.map((v) => (
            <button key={v.id} type="button" onClick={() => setPicked(v.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-start hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
              <FileText className={cn('w-4 h-4 shrink-0', v.name ? 'text-fuchsia-500' : 'text-zinc-400')} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{v.name ?? new Date(v.createdAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="block text-xs text-zinc-500">{v.author}{v.name ? ` · ${new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function DocPageRoute() {
  const p = usePathParams('/docs/[id]');
  return p ? <DocPage key={p.id} id={p.id} /> : <AddressLoading portal />;
}
