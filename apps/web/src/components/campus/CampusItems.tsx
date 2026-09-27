'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarDays, Clock, ExternalLink, Loader2, MapPin, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';

export type CampusKind = 'SERVICE' | 'LINK' | 'EVENT';
export interface CampusItem {
  id: string;
  kind: CampusKind;
  category: string | null;
  title: string;
  description: string | null;
  url: string | null;
  location: string | null;
  hours: string | null;
  startAt: string | null;
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';

function eventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Read-only campus info for students/teachers, with a guide when nothing has been added yet. */
export function CampusItemList({ kind, guide }: {
  kind: CampusKind;
  guide: { icon: LucideIcon; title: string; description: string; steps: string[]; example: { title: string; meta: string; right?: string }[] };
}) {
  const { data, error, isLoading } = useSWR<CampusItem[]>(`/api/campus-items?kind=${kind}`, authedJson);

  if (isLoading) return <div className="grid sm:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />)}</div>;
  if (error) return <p className="text-sm text-rose-500">{(error as Error).message}</p>;
  if (!data || data.length === 0) {
    return (
      <FeatureGuide
        icon={guide.icon}
        title={guide.title}
        description={guide.description}
        steps={guide.steps}
        example={<div>{guide.example.map((e) => <ExampleRow key={e.title} {...e} />)}</div>}
      />
    );
  }

  const groups = data.reduce<Record<string, CampusItem[]>>((acc, it) => {
    const k = kind === 'EVENT' ? 'Upcoming' : it.category || 'General';
    (acc[k] ??= []).push(it);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([group, items]) => (
        <section key={group}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">{group}</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((it, i) => (
              <motion.div key={it.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className={`${card} p-5 hover:border-indigo-500/30 transition-colors`}>
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-zinc-900 dark:text-white">{it.title}</h4>
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-400">
                      Open <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {it.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 whitespace-pre-line">{it.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-zinc-500">
                  {it.startAt && <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{eventDate(it.startAt)}</span>}
                  {it.hours && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{it.hours}</span>}
                  {it.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{it.location}</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const empty = { title: '', category: '', description: '', url: '', location: '', hours: '', startAt: '' };

/** Admin editor for one kind of campus info. */
export function CampusItemManager({ kind, label, categories }: { kind: CampusKind; label: string; categories?: string[] }) {
  const key = `/api/campus-items?kind=${kind}`;
  const { data, isLoading, mutate } = useSWR<CampusItem[]>(key, authedJson);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setEditingId(null); setForm({ ...empty, category: categories?.[0] ?? '' }); };
  const openEdit = (it: CampusItem) => {
    setEditingId(it.id);
    setForm({
      title: it.title, category: it.category ?? '', description: it.description ?? '', url: it.url ?? '',
      location: it.location ?? '', hours: it.hours ?? '',
      startAt: it.startAt ? new Date(new Date(it.startAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
    });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ ...form, kind, startAt: form.startAt ? new Date(form.startAt).toISOString() : null });
      await authedJson(editingId ? `/api/campus-items/${editingId}` : '/api/campus-items', { method: editingId ? 'PATCH' : 'POST', body });
      toast.success(editingId ? 'Saved' : `${label} added`);
      setForm(null);
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: CampusItem) => {
    if (!confirm(`Delete "${it.title}"?`)) return;
    try {
      await authedJson(`/api/campus-items/${it.id}`, { method: 'DELETE' });
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-zinc-900 dark:text-white">{label}s</h3>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>

      {form && (
        <div className="mb-4 p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/[0.06] border border-indigo-200/60 dark:border-indigo-400/20 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{editingId ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`}</p>
            <button onClick={() => setForm(null)} aria-label="Cancel" className="p-1 text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
          <input className={input} placeholder="Title" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          {categories ? (
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          ) : (
            <input className={input} placeholder="Category (optional)" value={form.category} maxLength={60} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          )}
          <textarea className={`${input} min-h-[70px]`} placeholder="Description (optional)" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-3">
            {kind === 'EVENT' && <input className={input} type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />}
            {kind === 'SERVICE' && <input className={input} placeholder="Opening hours, e.g. Mon–Fri 8am–8pm" value={form.hours} maxLength={120} onChange={(e) => setForm({ ...form, hours: e.target.value })} />}
            {kind !== 'LINK' && <input className={input} placeholder="Location (optional)" value={form.location} maxLength={120} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
            <input className={input} placeholder={kind === 'LINK' ? 'https://…' : 'Link (optional)'} value={form.url} maxLength={500} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <button onClick={save} disabled={busy || !form.title.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
      ) : !data?.length ? (
        <p className="text-sm text-zinc-500">Nothing added yet. Students will see these once you add them.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
          {data.map((it) => (
            <li key={it.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{it.title}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {[it.category, it.startAt && eventDate(it.startAt), it.hours, it.location].filter(Boolean).join(' · ') || it.url}
                </p>
              </div>
              <button onClick={() => openEdit(it)} aria-label="Edit" className="p-2 rounded-lg text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(it)} aria-label="Delete" className="p-2 rounded-lg text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
