'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { chatJson } from './chat-client';
import { Sheet } from '@/components/ui/Sheet';
import { spring } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';

// Saved replies and message templates (Stage 4 · 1.9, src/app/api/chat/snippets): up to 50 per
// person. {name} becomes the other person's first name (or "everyone" in a group) and {date}
// today's date. Insert from Attach → Saved replies, or type "/" and the shortcut.

export interface Snippet { id: string; title: string; body: string; shortcut: string | null }
const KEY = '/api/chat/snippets';

export function useSnippets(enabled = true) {
  return useSWR<{ snippets: Snippet[]; max: number }>(enabled ? KEY : null, chatJson, { revalidateOnFocus: false });
}

export function fillSnippet(body: string, name: string | undefined) {
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return body.replace(/\{name\}/gi, name ? name.split(/\s+/)[0] : 'everyone').replace(/\{date\}/gi, date);
}

/** Starter templates offered to teachers with nothing saved yet. */
const TEACHER_STARTERS: Omit<Snippet, 'id'>[] = [
  { title: 'Deadline reminder', shortcut: 'due', body: 'Hi {name}, a quick reminder: the lab report is due soon. Hand it in on UniVerse, and message me if you need more time.' },
  { title: 'Missed class', shortcut: 'missed', body: 'Hi {name}, I noticed you weren’t in class on {date}. The slides and notes are in the course materials. Let me know if anything is unclear.' },
  { title: 'Office hours', shortcut: 'office', body: 'Happy to go through it together: come to my office hours, or start a call from here when they’re open.' },
  { title: 'Well done', shortcut: 'great', body: 'Great work, {name}! Keep it up.' },
];


export function SnippetsSheet({ onClose, onInsert, recipientName }: { onClose: () => void; onInsert: (text: string) => void; recipientName?: string }) {
  const { data, mutate } = useSnippets();
  const role = useAuthStore((s) => s.user?.role);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Snippet | null>(null);
  const [busy, setBusy] = useState(false);
  const list = data?.snippets ?? [];
  const save = async (next: Snippet[], ok?: string) => {
    setBusy(true);
    try {
      const r = await chatJson<{ snippets: Snippet[]; max: number }>(KEY, { method: 'PUT', body: JSON.stringify({ snippets: next }) });
      await mutate(r, { revalidate: false });
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  };
  const shown = q ? list.filter((s) => `${s.title} ${s.body} ${s.shortcut ?? ''}`.toLowerCase().includes(q.toLowerCase())) : list;

  return (
    <Sheet title={edit ? (list.some((s) => s.id === edit.id) ? 'Edit saved reply' : 'New saved reply') : 'Saved replies'} onClose={onClose}>
      <AnimatePresence mode="wait" initial={false}>
        {edit ? (
          <motion.div key="edit" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={spring.smooth} className="space-y-3">
            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={60} placeholder="Title, e.g. Deadline reminder" aria-label="Title" className="input" autoFocus />
            <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} maxLength={2000} rows={5} placeholder="The message" aria-label="Message" className={`input resize-none`} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">/</span>
              <input value={edit.shortcut ?? ''} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) })} placeholder="shortcut (optional)" aria-label="Shortcut" className="input" />
            </div>
            <p className="text-xs text-zinc-500">Write <code>{'{name}'}</code> for the person’s first name (or “everyone” in a group) and <code>{'{date}'}</code> for today’s date.</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy || !edit.title.trim() || !edit.body.trim()} onClick={() => void (async () => {
                const exists = list.some((s) => s.id === edit.id);
                if (edit.shortcut && list.some((s) => s.id !== edit.id && s.shortcut === edit.shortcut)) return toast.error(`/${edit.shortcut} is already used.`);
                if (await save(exists ? list.map((s) => (s.id === edit.id ? edit : s)) : [edit, ...list], 'Saved')) setEdit(null);
              })()} className="btn-primary flex-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
              <button type="button" onClick={() => setEdit(null)} className="btn-secondary">Cancel</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={spring.smooth} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search saved replies" className={`input pl-9`} />
              </div>
              <button type="button" disabled={list.length >= (data?.max ?? 50)} onClick={() => setEdit({ id: crypto.randomUUID().slice(0, 8), title: '', body: '', shortcut: null })} className="btn-primary"><Plus className="w-4 h-4" />New</button>
            </div>
            {!data ? <div className="h-24 rounded-xl skeleton" /> : list.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-500">Save messages you send often, and insert them in any chat.</p>
                {role === 'TEACHER' && (
                  <button type="button" disabled={busy} onClick={() => void save(TEACHER_STARTERS.map((s) => ({ ...s, id: crypto.randomUUID().slice(0, 8) })), 'Added 4 templates')} className="btn-secondary mt-3">Add starter templates for teachers</button>
                )}
              </div>
            ) : shown.length === 0 ? <p className="text-sm text-zinc-500 text-center py-4">Nothing matches.</p> : (
              <ul className="space-y-2">
                {shown.map((s) => (
                  <li key={s.id} className="group rounded-xl border border-zinc-200 dark:border-white/10 hover:border-indigo-400/60 transition-colors">
                    <div className="flex items-start gap-1">
                      <button type="button" onClick={() => { onInsert(fillSnippet(s.body, recipientName)); onClose(); }} className="flex-1 min-w-0 text-left p-3">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{s.title}</span>
                          {s.shortcut && <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-300 shrink-0">/{s.shortcut}</span>}
                        </span>
                        <span className="block mt-0.5 text-xs text-zinc-500 line-clamp-2">{s.body}</span>
                      </button>
                      <button type="button" aria-label={`Edit ${s.title}`} onClick={() => setEdit(s)} className="p-2 mt-1.5 text-zinc-400 hover:text-indigo-500"><Pencil className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Delete ${s.title}`} disabled={busy} onClick={() => void save(list.filter((x) => x.id !== s.id), 'Deleted')} className="p-2 mt-1.5 mr-1 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {list.length > 0 && <p className="text-[11px] text-zinc-500 text-center">{list.length} of {data?.max ?? 50} · tap one to put it in your message</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
