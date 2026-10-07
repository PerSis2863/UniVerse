'use client';

import { use, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { ArrowLeft, Check, Download, FileText, History, Loader2, MessageSquare, MessageSquarePlus, RotateCcw, Send, Share2, Trash2, UserMinus, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Sheet } from '@/components/chat/ChatDialogs';
import { Avatar } from '@/components/chat/MessageBubble';
import { DocEditor, DocToolbar, type DocStatus } from '@/components/docs/DocEditor';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// One document (Stage 4 · 3.2): title, who's here, the toolbar and the page; comments on what you
// select, version history (preview and restore), sharing, and PDF / Word copies.

interface DocInfo { id: string; title: string; course: { code: string; name: string } | null; chat?: { id: string; name: string } | null; canEdit: boolean; canManage: boolean; me: { id: string; name: string }; members: { userId: string; role: string; name: string }[] }
interface Comment { id: string; userId: string; quote: string | null; body: string; resolvedAt: string | null; createdAt: string; user: { id: string; name: string; avatar: string | null } }

const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';
const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const PRINT_CSS = 'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#18181b;max-width:46rem;margin:2rem auto;padding:0 1.5rem}h1{font-size:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d4d4d8;padding:.4em .6em;text-align:left}pre{background:#f4f4f5;padding:1em;border-radius:.5em;white-space:pre-wrap}img{max-width:100%}blockquote{border-left:3px solid #818cf8;margin-left:0;padding-left:1em;color:#52525b}';

function exportWord(title: string, html: string) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>${PRINT_CSS}</style></head><body><h1>${title.replace(/</g, '&lt;')}</h1>${html}</body></html>`;
  const url = URL.createObjectURL(new Blob(['﻿', doc], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'Document'}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportPdf(title: string, html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>${PRINT_CSS}</style></head><body><h1>${title.replace(/</g, '&lt;')}</h1>${html}</body></html>`);
  d.close();
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const role = useAuthStore((st) => st.user?.role);
  const inboxPath = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';
  const { data, error, mutate } = useSWR<DocInfo>(`/api/docs/${id}`, authedJson);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [peers, setPeers] = useState<string[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [panel, setPanel] = useState<'comments' | null>(null);
  const [sheet, setSheet] = useState<'history' | 'share' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const editable = status.s === 'live' && status.canEdit;
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

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
          <input value={shownTitle} readOnly={!data.canEdit} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title" className="w-full bg-transparent text-lg font-bold text-zinc-900 dark:text-white outline-none truncate" />
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', status.s === 'live' ? 'bg-emerald-500' : status.s === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-400')} />
            {status.s === 'live' ? (status.canEdit ? 'Saved as you type' : 'You can read this document') : status.s === 'connecting' ? 'Connecting…' : status.s === 'unavailable' ? 'Not available right now' : 'Offline: reconnecting'}
            {data.course && <span>· {data.course.code}</span>}
            {data.chat && <span>· Canvas of {data.chat.name}</span>}
            {peers.length > 0 && <span>· {peers.slice(0, 3).join(', ')}{peers.length > 3 ? ` +${peers.length - 3}` : ''} here</span>}
          </p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setExportOpen((o) => !o)} title="Download" aria-label="Download" className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Download className="w-4 h-4" /></button>
          <AnimatePresence>
            {exportOpen && editor && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.snappy} onMouseLeave={() => setExportOpen(false)}
                className="absolute right-0 top-10 z-30 w-44 py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm">
                <button type="button" onClick={() => { setExportOpen(false); exportPdf(shownTitle, editor.getHTML()); }} className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">PDF (print)</button>
                <button type="button" onClick={() => { setExportOpen(false); exportWord(shownTitle, editor.getHTML()); }} className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">Word (.doc)</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button type="button" onClick={() => setSheet('history')} title="Version history" aria-label="Version history" className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><History className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPanel(panel ? null : 'comments')} aria-pressed={panel === 'comments'} title="Comments" aria-label="Comments" className={cn('p-2 rounded-full', panel ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}><MessageSquare className="w-4 h-4" /></button>
        {data.canManage && !data.course && !data.chat && <button type="button" onClick={() => setSheet('share')} className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>}
        {data.canManage && <button type="button" aria-label="Delete document" onClick={async () => { if (await confirmDialog({ title: 'Delete this document?', message: 'Its text, versions and comments go for everyone.', destructive: true })) { await call(`/api/docs/${id}`, 'DELETE').catch((e) => toast.error((e as Error).message)); router.push('/docs'); } }} className="p-2 rounded-full text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
      </header>
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0b0e1a]/80 backdrop-blur border-b border-zinc-200/70 dark:border-white/[0.06]"><DocToolbar editor={editor} disabled={!editable} /></div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto my-4 sm:my-8 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/[0.06] shadow-sm">
            <DocEditor docId={id} me={data.me} onStatus={(s, canEdit) => setStatus({ s, canEdit })} onPeers={setPeers} onEditor={setEditor} />
          </div>
        </div>
        <AnimatePresence>
          {panel === 'comments' && (
            <motion.aside key="comments" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring.smooth}
              className="fixed inset-x-0 bottom-0 top-1/3 z-40 rounded-t-3xl md:static md:rounded-none md:w-80 md:shrink-0 bg-white dark:bg-[#0f1322] border-l border-zinc-200/70 dark:border-white/[0.06] shadow-2xl md:shadow-none flex flex-col">
              <Comments docId={id} editor={editor} me={data.me.id} canEdit={data.canEdit} onClose={() => setPanel(null)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {sheet === 'history' && <HistorySheet docId={id} editor={editor} canEdit={editable} onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ShareSheet doc={data} onClose={() => setSheet(null)} onChanged={() => void mutate()} />}
    </div>
  );
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

function Comments({ docId, editor, me, canEdit, onClose }: { docId: string; editor: Editor | null; me: string; canEdit: boolean; onClose: () => void }) {
  const key = `/api/docs/${docId}/comments`;
  const { data, mutate } = useSWR<Comment[]>(key, authedJson);
  const [body, setBody] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const pickSelection = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!text) { toast('Select some text in the document first.'); return; }
    setQuote(text.slice(0, 500));
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = body.trim();
    if (!t) return;
    setBody('');
    try { await call(key, 'POST', { body: t, quote }); setQuote(null); void mutate(); } catch (err) { setBody(t); toast.error((err as Error).message); }
  };
  const open = (data ?? []).filter((c) => !c.resolvedAt), done = (data ?? []).filter((c) => c.resolvedAt);
  const item = (c: Comment) => (
    <div key={c.id} className={cn('rounded-2xl p-3 border', c.resolvedAt ? 'border-zinc-200/60 dark:border-white/[0.05] opacity-70' : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03]')}>
      <div className="flex items-center gap-2">
        <Avatar name={c.user.name} src={c.user.avatar} size={24} />
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex-1 truncate">{c.user.name}</span>
        <span className="text-[10px] text-zinc-400">{new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
      {c.quote && <button type="button" onClick={() => goToQuote(editor, c.quote!)} className="mt-2 block w-full text-left text-xs italic text-zinc-500 border-l-2 border-amber-400 pl-2 line-clamp-2 hover:text-indigo-500">“{c.quote}”</button>}
      <p className="mt-1.5 text-sm text-zinc-900 dark:text-white whitespace-pre-wrap break-words">{c.body}</p>
      <div className="mt-2 flex gap-3 text-[11px] font-semibold">
        {(canEdit || c.userId === me) && <button type="button" onClick={async () => { await call(`${key}/${c.id}`, 'PATCH', { resolved: !c.resolvedAt }).catch((e) => toast.error((e as Error).message)); void mutate(); }} className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">{c.resolvedAt ? <><RotateCcw className="w-3 h-3" />Reopen</> : <><Check className="w-3 h-3" />Resolve</>}</button>}
        {c.userId === me && <button type="button" onClick={async () => { await call(`${key}/${c.id}`, 'PATCH', { delete: true }).catch((e) => toast.error((e as Error).message)); void mutate(); }} className="text-zinc-400 hover:text-rose-500">Delete</button>}
      </div>
    </div>
  );
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="font-semibold text-zinc-900 dark:text-white">Comments {open.length > 0 && <span className="text-zinc-400 font-normal">· {open.length}</span>}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-3">
        {!data ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mx-auto mt-6" /> : open.length === 0 && <p className="text-sm text-zinc-500 px-1">No open comments. Select some text and comment on it, or comment on the whole document.</p>}
        {open.map(item)}
        {done.length > 0 && <button type="button" onClick={() => setShowResolved((s) => !s)} className="text-xs text-zinc-500 px-1">{showResolved ? 'Hide' : 'Show'} {done.length} resolved</button>}
        {showResolved && done.map(item)}
      </div>
      <form onSubmit={send} className="p-3 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-2">
        {quote ? (
          <p className="text-xs italic text-zinc-500 border-l-2 border-amber-400 pl-2 flex gap-2"><span className="flex-1 line-clamp-2">“{quote}”</span><button type="button" onClick={() => setQuote(null)} aria-label="Not about this text"><X className="w-3 h-3" /></button></p>
        ) : (
          <button type="button" onClick={pickSelection} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><MessageSquarePlus className="w-3.5 h-3.5" />About the text I selected</button>
        )}
        <div className="flex gap-2">
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Write a comment (@name to notify someone)" className={field} />
          <button type="submit" aria-label="Send" className="w-10 shrink-0 rounded-xl btn-primary flex items-center justify-center"><Send className="w-4 h-4" /></button>
        </div>
      </form>
    </>
  );
}

function HistorySheet({ docId, editor, canEdit, onClose }: { docId: string; editor: Editor | null; canEdit: boolean; onClose: () => void }) {
  const { data, mutate } = useSWR<{ id: string; name: string | null; author: string; createdAt: string }[]>(`/api/docs/${docId}/versions`, authedJson);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { data: version } = useSWR<{ html: string }>(picked ? `/api/docs/${docId}/versions/${picked}` : null, authedJson);
  // A read-only view of the version: parsed by the editor's own rules, so nothing unsafe shows.
  const preview = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit, TableKit, TaskList, TaskItem, Image], content: '', editorProps: { attributes: { class: 'doc-prose px-4 py-4 text-sm' } } });
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
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name this version, e.g. First draft" className={field} />
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
            <button key={v.id} type="button" onClick={() => setPicked(v.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
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

function ShareSheet({ doc, onClose, onChanged }: { doc: DocInfo; onClose: () => void; onChanged: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Share document" onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await call(`/api/docs/${doc.id}/members`, 'POST', { email, role }); setEmail(''); toast.success('Shared'); onChanged(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } }} className="flex gap-2 mb-4">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" className={field} />
        <select value={role} onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')} className={cn(field, 'w-28')}><option value="EDITOR">Can edit</option><option value="VIEWER">Can read</option></select>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}</button>
      </form>
      <div className="space-y-1">
        {doc.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 p-2">
            <span className="flex-1 text-sm text-zinc-900 dark:text-white">{m.name} <span className="text-xs text-zinc-500">· {m.role === 'VIEWER' ? 'can read' : 'can edit'}</span></span>
            <button type="button" onClick={async () => { await call(`/api/docs/${doc.id}/members`, 'POST', { userId: m.userId, remove: true }).catch((e) => toast.error((e as Error).message)); onChanged(); }} aria-label="Stop sharing" className="p-1.5 text-zinc-400 hover:text-rose-500"><UserMinus className="w-4 h-4" /></button>
          </div>
        ))}
        {!doc.members.length && <p className="text-sm text-zinc-500">Only you so far.</p>}
      </div>
    </Sheet>
  );
}
