'use client';

import { use, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, ChevronRight, Download, Eye, FileText, Folder, FolderPlus, History, ImageIcon, Loader2, MessageSquare, MoreHorizontal, Pencil, RotateCcw, Trash2, Upload, KanbanSquare } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { Sheet } from '@/components/ui/Sheet';
import { PdfViewer, TextViewer } from '@/components/chat/FilePreview';
import { ImageViewer } from '@/components/chat/ImageViewer';
import { formatBytes, uploadChatFile } from '@/components/chat/chat-client';
import { previewKind } from '@/lib/pdf';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

// A space's files hub (Stage 4 · 3.7, src/server/space-files.ts): folders, files with every version,
// previews (PDF, text, photos), and where a file is used.

interface Item { id: string; name: string; url: string; mime: string; size: number; updatedAt: string; versions: number; by: string; canChange: boolean }
interface Listing { path: { id: string; name: string }[]; canManage: boolean; usage: number; quota: number; folders: { id: string; name: string; items: number }[]; files: Item[] }
interface Detail {
  id: string; name: string; canChange: boolean;
  versions: { id: string; url: string; size: number; note: string | null; by: string; at: string; current: boolean }[];
  usedIn: ({ kind: 'chat'; label: string; chatId: string; messageId: string; at: string } | { kind: 'task'; label: string; href: string })[];
}

const ago = (d: string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export default function SpaceFilesPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  const role = useAuthStore((s) => s.user?.role);
  const [folder, setFolder] = useState<string | null>(null);
  const base = `/api/spaces/${kind}/${id}/files`;
  const { data, error, mutate } = useSWR<Listing>(`${base}${folder ? `?folder=${folder}` : ''}`, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [view, setView] = useState<Item | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const versionPicker = useRef<HTMLInputElement>(null);
  const inbox = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';

  const call = async (what: string, path: string, method: string, body?: unknown, ok?: string) => {
    setBusy(what);
    try { await authedJson(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); await mutate(); if (ok) toast.success(ok); return true; }
    catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  };
  const uploadFiles = async (files: File[]) => {
    for (const f of files.slice(0, 10)) {
      setProgress(0);
      try {
        const url = await uploadChatFile(f, setProgress);
        await call('upload', base, 'POST', { action: 'file', name: f.name, url, mime: f.type || 'application/octet-stream', size: f.size, folderId: folder });
      } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
    }
    setProgress(null);
  };
  const newFolder = async () => {
    const name = (await promptDialog({ title: 'New folder', placeholder: 'e.g. Week 1', confirmLabel: 'Make it', maxLength: 60 }))?.trim();
    if (name) await call('folder', base, 'POST', { action: 'folder', name, parentId: folder }, 'Folder made');
  };

  if (error) return <><Topbar title="Files" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;
  const pct = data ? Math.min(100, Math.round((data.usage / data.quota) * 100)) : 0;
  const images = data?.files.filter((f) => f.mime.startsWith('image/')) ?? [];

  return (
    <>
      <Topbar title="Files" subtitle="Everyone in this space can add files and new versions" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/spaces/${kind}/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-indigo-500"><ArrowLeft className="w-4 h-4" />Space</Link>
            <nav aria-label="Folders" className="flex items-center gap-1 text-sm min-w-0">
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              <button type="button" onClick={() => setFolder(null)} className={cn('font-semibold', folder ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-900 dark:text-white')}>Files</button>
              {data?.path.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-1 min-w-0">
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <button type="button" onClick={() => setFolder(p.id)} className={cn('truncate font-semibold', i === data.path.length - 1 ? 'text-zinc-900 dark:text-white' : 'text-indigo-600 dark:text-indigo-300')}>{p.name}</button>
                </span>
              ))}
            </nav>
            <span className="flex-1" />
            <button type="button" onClick={() => void newFolder()} disabled={!!busy} className="btn-secondary"><FolderPlus className="w-4 h-4" />Folder</button>
            <button type="button" onClick={() => picker.current?.click()} disabled={progress !== null} className="btn-primary">{progress !== null ? <><Loader2 className="w-4 h-4 animate-spin" />{progress}%</> : <><Upload className="w-4 h-4" />Upload</>}</button>
            <input ref={picker} type="file" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; void uploadFiles(fs); }} />
          </div>

          {data && (
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <div className="flex-1 max-w-xs h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.08] overflow-hidden"><motion.div className={cn('h-full rounded-full', pct > 90 ? 'bg-rose-500' : 'bg-indigo-500')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring.gentle} /></div>
              {formatBytes(data.usage)} of {formatBytes(data.quota)} used
            </div>
          )}

          {!data ? <div className="h-64 rounded-2xl skeleton" /> : data.folders.length === 0 && data.files.length === 0 ? (
            <div className={`panel p-10 text-center`}>
              <Folder className="w-8 h-8 mx-auto text-indigo-500" />
              <p className="mt-3 font-semibold text-zinc-900 dark:text-white">Nothing here yet</p>
              <p className="text-sm text-zinc-500 mt-1">Upload slides, notes and handouts for everyone in this space.</p>
            </div>
          ) : (
            <motion.ul variants={list} initial="hidden" animate="show" className={`panel divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
              {data.folders.map((f) => (
                <motion.li key={f.id} variants={fadeUp} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setFolder(f.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                    <Folder className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-white">{f.name}</span>
                    <span className="text-xs text-zinc-500">{f.items} {f.items === 1 ? 'item' : 'items'}</span>
                  </button>
                  {data.canManage && (
                    <>
                      <button type="button" aria-label={`Rename ${f.name}`} onClick={() => void (async () => { const n = (await promptDialog({ title: 'Rename folder', defaultValue: f.name, confirmLabel: 'Rename', maxLength: 60 }))?.trim(); if (n) await call('r', `/api/space-folders/${f.id}`, 'PATCH', { name: n }); })()} className="p-1.5 text-zinc-400 hover:text-indigo-500"><Pencil className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Delete ${f.name}`} onClick={() => void call('d', `/api/space-folders/${f.id}`, 'DELETE', undefined, 'Folder deleted')} className="p-1.5 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </motion.li>
              ))}
              {data.files.map((f) => {
                const kindOf = f.mime.startsWith('image/') ? 'image' : previewKind(f.name, f.mime);
                return (
                  <motion.li key={f.id} variants={fadeUp} className="relative flex items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => (kindOf ? setView(f) : window.open(f.url, '_blank', 'noopener'))} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                      {f.mime.startsWith('image/') ? <ImageIcon className="w-5 h-5 text-emerald-500 shrink-0" /> : <FileText className="w-5 h-5 text-indigo-500 shrink-0" />}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{f.name}</span>
                        <span className="block text-xs text-zinc-500">{formatBytes(f.size)} · {f.by} · {ago(f.updatedAt)}{f.versions > 1 ? ` · ${f.versions} versions` : ''}</span>
                      </span>
                    </button>
                    {kindOf && <button type="button" aria-label={`Preview ${f.name}`} onClick={() => setView(f)} className="p-1.5 text-zinc-400 hover:text-indigo-500 hidden sm:block"><Eye className="w-4 h-4" /></button>}
                    <a href={f.url} download={f.name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.name}`} className="p-1.5 text-zinc-400 hover:text-indigo-500"><Download className="w-4 h-4" /></a>
                    <button type="button" aria-label={`More for ${f.name}`} aria-expanded={menu === f.id} onClick={() => setMenu(menu === f.id ? null : f.id)} className="p-1.5 text-zinc-400 hover:text-indigo-500"><MoreHorizontal className="w-4 h-4" /></button>
                    <AnimatePresence>
                      {menu === f.id && (
                        <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={spring.snappy} className="absolute right-3 top-12 z-30 w-56 rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl p-1.5 text-sm">
                          <button type="button" onClick={() => { setMenu(null); setDetail(f.id); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><History className="w-4 h-4" />Versions and where it’s used</button>
                          <button type="button" onClick={() => { setMenu(null); setDetail(f.id); setTimeout(() => versionPicker.current?.click(), 50); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><Upload className="w-4 h-4" />Upload a new version</button>
                          {f.canChange && <button type="button" onClick={() => void (async () => { setMenu(null); const n = (await promptDialog({ title: 'Rename file', defaultValue: f.name, confirmLabel: 'Rename', maxLength: 120 }))?.trim(); if (n) await call('r', `/api/space-files/${f.id}`, 'PATCH', { name: n }); })()} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><Pencil className="w-4 h-4" />Rename</button>}
                          {f.canChange && (folder || data.folders.length > 0) && (
                            <select aria-label="Move to folder" defaultValue="" onChange={(e) => { setMenu(null); void call('m', `/api/space-files/${f.id}`, 'PATCH', { folderId: e.target.value === 'top' ? null : e.target.value }, 'Moved'); }} className="w-full mt-1 px-2 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-xs">
                              <option value="" disabled>Move to…</option>
                              {folder && <option value="top">Files (the top)</option>}
                              {data.folders.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          )}
                          {f.canChange && <button type="button" onClick={() => void (async () => { setMenu(null); if (await confirmDialog({ title: `Delete ${f.name}?`, message: 'Every version is deleted. Copies already shared in chats stay.', destructive: true, confirmLabel: 'Delete' })) await call('del', `/api/space-files/${f.id}`, 'DELETE', undefined, 'Deleted'); })()} className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete</button>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </div>
      </div>

      <input ref={versionPicker} type="file" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f || !detail) return;
        void (async () => {
          setProgress(0);
          try { const url = await uploadChatFile(f, setProgress); await call('v', `/api/space-files/${detail}`, 'POST', { url, mime: f.type || 'application/octet-stream', size: f.size }, 'New version uploaded'); }
          catch (err) { toast.error((err as Error).message); } finally { setProgress(null); }
        })();
      }} />
      {detail && <DetailSheet fileId={detail} inbox={inbox} onClose={() => setDetail(null)} onChanged={() => void mutate()} />}
      {view && previewKind(view.name, view.mime) === 'pdf' && <PdfViewer url={view.url} name={view.name} onClose={() => setView(null)} />}
      {view && previewKind(view.name, view.mime) === 'text' && <TextViewer url={view.url} name={view.name} size={view.size} onClose={() => setView(null)} />}
      {view && view.mime.startsWith('image/') && <ImageViewer images={images.map((x) => ({ url: x.url, name: x.name }))} start={Math.max(0, images.findIndex((x) => x.id === view.id))} onClose={() => setView(null)} />}
    </>
  );
}

function DetailSheet({ fileId, inbox, onClose, onChanged }: { fileId: string; inbox: string; onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<Detail>(`/api/space-files/${fileId}`, authedJson);
  const restore = async (versionId: string) => {
    try { await authedJson(`/api/space-files/${fileId}`, { method: 'PATCH', body: JSON.stringify({ restore: versionId }) }); await mutate(); onChanged(); toast.success('Restored as the current version'); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Sheet title={data?.name ?? 'File'} onClose={onClose}>
      {!data ? <div className="h-32 rounded-xl skeleton" /> : (
        <div className="space-y-5">
          <section>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Versions</p>
            <ul className="space-y-2">
              {data.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="block text-zinc-800 dark:text-zinc-100">{v.current ? 'Current · ' : ''}{ago(v.at)} · {v.by}</span>
                    <span className="block text-xs text-zinc-500 truncate">{formatBytes(v.size)}{v.note ? ` · ${v.note}` : ''}</span>
                  </span>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label="Download this version" className="p-1.5 text-zinc-400 hover:text-indigo-500"><Download className="w-4 h-4" /></a>
                  {!v.current && data.canChange && <button type="button" onClick={() => void restore(v.id)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />Restore</button>}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Used in</p>
            {data.usedIn.length === 0 ? <p className="text-sm text-zinc-500">Not shared in a chat or linked from a task yet.</p> : (
              <ul className="space-y-1.5">
                {data.usedIn.map((u, i) => (
                  <li key={i}>
                    {u.kind === 'chat'
                      ? <Link href={`${inbox}?c=${u.chatId}`} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />{u.label}</Link>
                      : <Link href={u.href} className="text-sm text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1.5"><KanbanSquare className="w-4 h-4" />{u.label}</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
