'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, CheckCircle2, ChevronRight, ClipboardList, EyeOff, FileText, Layers, Link2, Loader2, Lock, Paperclip, Pencil, PlayCircle, Plus, Trash2, Video, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Switch } from '@/components/ui/Switch';
import { Field } from '@/components/ui/Field';
import { LoadError } from '@/components/ui/LoadError';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { safeHref } from '@/lib/safe-href';
import { cn } from '@/lib/utils';
import { ITEM_KINDS, REF_KINDS, type ItemKind } from '@/lib/course-modules';

// The course board's Modules tab (Stage 5 · B2; server: src/server/course-modules.ts).
// Students: what to do next, a ✓ per item, progress per module, and why a module is locked.
// Teachers: build modules from the course's materials, quizzes, assignments and live classes plus
// pages, links and videos; reorder; see how many students finished each item.

interface ItemV { id: string; kind: ItemKind; refId: string | null; title: string; body: string | null; url: string | null; href: string | null; meta: string | null; missing: boolean; done: boolean; doneCount?: number }
interface ModuleV {
  id: string; title: string; summary: string | null; published: boolean; releaseAt: string | null;
  requireQuizId: string | null; requireScore: number | null; requireQuizTitle: string | null;
  locked: boolean; lockReason: string | null; items: ItemV[]; doneItems: number;
}
type Choice = { id: string; title: string; type?: string; status?: string; startAt?: string };
interface View { canManage: boolean; students: number; modules: ModuleV[]; next: { moduleId: string; itemId: string } | null; choices: Record<'FILE' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE', Choice[]> | null }

const KIND: Record<ItemKind, { label: string; icon: LucideIcon }> = {
  PAGE: { label: 'Page', icon: FileText },
  FILE: { label: 'File', icon: Paperclip },
  LINK: { label: 'Link', icon: Link2 },
  VIDEO: { label: 'Video', icon: PlayCircle },
  QUIZ: { label: 'Quiz', icon: CheckCircle2 },
  ASSIGNMENT: { label: 'Assignment', icon: ClipboardList },
  LIVE: { label: 'Live class', icon: Video },
};
/** Opening these counts as done; quizzes and assignments are done once handed in. */
const DONE_ON_OPEN: ItemKind[] = ['PAGE', 'FILE', 'LINK', 'VIDEO', 'LIVE'];
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function CourseModules({ courseId }: { courseId: string }) {
  const key = `/api/courses/${courseId}/modules`;
  const { data, error, isLoading, mutate } = useSWR<View>(key, authedJson);
  const [editing, setEditing] = useState<ModuleV | 'new' | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [page, setPage] = useState<ItemV | null>(null);

  const send = async (body: object, done?: string) => {
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify(body) });
      await mutate();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t save that. Please try again.'));
      return false;
    }
  };

  // Students tick items themselves (or by opening them); shown at once, saved after.
  const setDone = (item: ItemV, done: boolean) => {
    void mutate(async (cur) => {
      await authedJson(key, { method: 'POST', body: JSON.stringify({ action: 'done', itemId: item.id, done }) });
      return cur;
    }, {
      optimisticData: (cur) => cur && { ...cur, modules: cur.modules.map((m) => ({ ...m, items: m.items.map((i) => (i.id === item.id ? { ...i, done } : i)), doneItems: m.doneItems + (m.items.some((i) => i.id === item.id && i.done !== done) ? (done ? 1 : -1) : 0) })) },
      rollbackOnError: true,
      revalidate: true,
    }).catch((e) => toast.error(errorMessage(e, 'Couldn’t save that.')));
  };
  const opened = (item: ItemV) => {
    if (item.kind === 'PAGE') setPage(item);
    if (data && !data.canManage && !item.done && DONE_ON_OPEN.includes(item.kind)) setDone(item, true);
  };

  if (error) return <LoadError onRetry={() => mutate()} message="Couldn’t load the modules." />;
  if (isLoading || !data) return <ContentSkeleton variant="list" />;
  const { canManage, modules } = data;
  const nextUp = data.next ? modules.find((m) => m.id === data.next!.moduleId)?.items.find((i) => i.id === data.next!.itemId) ?? null : null;
  const nextModule = data.next ? modules.find((m) => m.id === data.next!.moduleId) : null;

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500 max-w-xl">Put the course in order: units of pages, files, links, videos, quizzes, assignments and live classes. Students see a ✓ per item and what to do next.</p>
          <button type="button" onClick={() => setEditing('new')} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> New module</button>
        </div>
      ) : modules.length > 0 && (
        nextUp && nextModule ? (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="panel p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0"><ChevronRight className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Next up · {nextModule.title}</p>
              <p className="font-semibold text-zinc-900 dark:text-white truncate">{nextUp.title}</p>
            </div>
            <ItemOpen item={nextUp} onOpen={opened} className="btn-primary btn-sm shrink-0">Open</ItemOpen>
          </motion.div>
        ) : (
          <div className="panel p-4 flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" /> You’ve finished everything that’s open so far.
          </div>
        )
      )}

      {modules.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={canManage ? 'No modules yet' : 'No modules yet'}
          hint={canManage ? 'Make a module for each week or topic, then add what students should read, watch and do.' : 'When your teacher sets up modules, you’ll see each week’s work here in order.'}
          action={canManage ? { label: 'New module', onClick: () => setEditing('new'), icon: Plus } : undefined}
        />
      ) : (
        <motion.ol variants={list} initial="hidden" animate="show" className="space-y-4">
          {modules.map((m, mi) => (
            <motion.li key={m.id} variants={fadeUp} layout className={cn('panel overflow-hidden', m.locked && 'opacity-80')}>
              <div className="p-4 flex items-start gap-3">
                <ProgressRing value={m.items.length ? (canManage ? (data.students ? m.items.reduce((s, i) => s + (i.doneCount ?? 0), 0) / (m.items.length * data.students) : 0) : m.doneItems / m.items.length) : 0} size={44} stroke={5}
                  label={<span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">{canManage ? mi + 1 : `${m.doneItems}/${m.items.length}`}</span>} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-zinc-900 dark:text-white">{m.title}</h3>
                  {m.summary && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">{m.summary}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {m.locked && m.lockReason && <span className="badge badge-amber inline-flex items-center gap-1"><Lock className="w-3 h-3" aria-hidden />{m.lockReason}</span>}
                    {canManage && !m.published && <span className="badge inline-flex items-center gap-1"><EyeOff className="w-3 h-3" aria-hidden />Hidden from students</span>}
                    {canManage && m.releaseAt && <span className="badge badge-blue">Opens {day(m.releaseAt)}</span>}
                    {canManage && m.requireQuizId && <span className="badge badge-blue">Needs {m.requireScore}% on {m.requireQuizTitle ?? 'a quiz'}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center shrink-0">
                    <button type="button" aria-label="Move module up" disabled={mi === 0} onClick={() => void send({ action: 'move-module', moduleId: m.id, dir: -1 })} className="btn-ghost btn-icon disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" aria-label="Move module down" disabled={mi === modules.length - 1} onClick={() => void send({ action: 'move-module', moduleId: m.id, dir: 1 })} className="btn-ghost btn-icon disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" aria-label="Edit module" onClick={() => setEditing(m)} className="btn-ghost btn-icon"><Pencil className="w-4 h-4" /></button>
                    <button type="button" aria-label="Delete module" onClick={() => void (async () => {
                      if (await confirmDialog({ title: `Delete “${m.title}”?`, message: 'Its items go too (the files, quizzes and assignments themselves stay in the course).', confirmLabel: 'Delete', destructive: true })) void send({ action: 'delete-module', moduleId: m.id }, 'Module deleted');
                    })()} className="btn-ghost btn-icon text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              {m.items.length > 0 && (
                <ul className="border-t border-zinc-200/70 dark:border-white/[0.06] divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                  {m.items.map((it, ii) => (
                    <ItemRow key={it.id} item={it} locked={m.locked} canManage={canManage} students={data.students} first={ii === 0} last={ii === m.items.length - 1}
                      onOpen={opened} onToggle={(d) => setDone(it, d)}
                      onMove={(dir) => void send({ action: 'move-item', itemId: it.id, dir })}
                      onDelete={() => void send({ action: 'delete-item', itemId: it.id }, 'Removed from the module')} />
                  ))}
                </ul>
              )}
              {canManage && (
                <div className="px-4 py-3 border-t border-zinc-200/70 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setAdding(m.id)} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add item</button>
                </div>
              )}
            </motion.li>
          ))}
        </motion.ol>
      )}

      {editing && data.choices && <ModuleForm module={editing === 'new' ? null : editing} quizzes={data.choices.QUIZ} onClose={() => setEditing(null)}
        onSave={async (f) => { if (await send(editing === 'new' ? { action: 'create-module', ...f } : { action: 'update-module', moduleId: editing.id, ...f }, editing === 'new' ? 'Module added' : 'Saved')) setEditing(null); }} />}
      {adding && data.choices && <ItemForm choices={data.choices} onClose={() => setAdding(null)}
        onSave={async (f) => { if (await send({ action: 'add-item', moduleId: adding, ...f }, 'Added')) setAdding(null); }} />}
      {page && (
        <Sheet title={page.title} onClose={() => setPage(null)}>
          <div className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{page.body}</div>
        </Sheet>
      )}
    </div>
  );
}

/** Opens an item the right way: pages in a sheet, files and links in a new tab, the rest in the app. */
function ItemOpen({ item, onOpen, className, children }: { item: ItemV; onOpen: (i: ItemV) => void; className?: string; children: React.ReactNode }) {
  if (item.kind === 'PAGE') return <button type="button" onClick={() => onOpen(item)} className={className}>{children}</button>;
  const href = safeHref(item.href);
  if (!href) return <span className={cn(className, 'opacity-60')}>{children}</span>;
  if (item.kind === 'FILE' || item.kind === 'LINK' || item.kind === 'VIDEO') {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(item)} className={className}>{children}</a>;
  }
  return <Link href={href} onClick={() => onOpen(item)} className={className}>{children}</Link>;
}

function ItemRow({ item, locked, canManage, students, first, last, onOpen, onToggle, onMove, onDelete }: {
  item: ItemV; locked: boolean; canManage: boolean; students: number; first: boolean; last: boolean;
  onOpen: (i: ItemV) => void; onToggle: (done: boolean) => void; onMove: (dir: -1 | 1) => void; onDelete: () => void;
}) {
  const K = KIND[item.kind];
  const auto = item.kind === 'QUIZ' || item.kind === 'ASSIGNMENT';
  const label = (
    <span className="flex items-center gap-3 min-w-0">
      <K.icon className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium truncate', item.done && !canManage ? 'text-zinc-500' : 'text-zinc-900 dark:text-white')}>{item.title}</span>
        <span className="block text-xs text-zinc-500 truncate">{K.label}{item.meta ? ` · ${item.meta}` : ''}{item.missing ? ' · no longer in the course' : ''}</span>
      </span>
    </span>
  );
  return (
    <li className="flex items-center gap-2 px-4 py-2.5 min-h-[52px]">
      {!canManage && (
        auto || locked ? (
          <span aria-label={item.done ? 'Done' : 'Not done yet'} role="img" className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 border', item.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 dark:border-white/20')}>{item.done && <Check className="w-3.5 h-3.5" />}</span>
        ) : (
          <button type="button" role="checkbox" aria-checked={item.done} aria-label={`Mark “${item.title}” as ${item.done ? 'not done' : 'done'}`} onClick={() => onToggle(!item.done)}
            className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 border pressable', item.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 dark:border-white/20 hover:border-emerald-500')}>
            {item.done && <Check className="w-3.5 h-3.5" />}
          </button>
        )
      )}
      {locked ? <span className="flex-1 min-w-0 opacity-70">{label}</span> : <ItemOpen item={item} onOpen={onOpen} className="flex-1 min-w-0 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-zinc-100/70 dark:hover:bg-white/[0.04]">{label}</ItemOpen>}
      {canManage && (
        <>
          <span className="text-xs tabular-nums text-zinc-500 shrink-0" title="Students who finished it">{item.doneCount ?? 0}/{students} done</span>
          <button type="button" aria-label="Move item up" disabled={first} onClick={() => onMove(-1)} className="btn-ghost btn-icon disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
          <button type="button" aria-label="Move item down" disabled={last} onClick={() => onMove(1)} className="btn-ghost btn-icon disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
          <button type="button" aria-label={`Remove “${item.title}”`} onClick={onDelete} className="btn-ghost btn-icon text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /></button>
        </>
      )}
    </li>
  );
}

type ModuleFields = { title: string; summary: string; published: boolean; releaseAt: string | null; requireQuizId: string | null; requireScore: number | null };

function ModuleForm({ module, quizzes, onClose, onSave }: { module: ModuleV | null; quizzes: Choice[]; onClose: () => void; onSave: (f: ModuleFields) => Promise<void> }) {
  const [title, setTitle] = useState(module?.title ?? '');
  const [summary, setSummary] = useState(module?.summary ?? '');
  const [published, setPublished] = useState(module?.published ?? true);
  const [release, setRelease] = useState(module?.releaseAt ? module.releaseAt.slice(0, 10) : '');
  const [quizId, setQuizId] = useState(module?.requireQuizId ?? '');
  const [score, setScore] = useState(String(module?.requireScore ?? 60));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await onSave({ title: title.trim(), summary: summary.trim(), published, releaseAt: release ? new Date(`${release}T00:00:00`).toISOString() : null, requireQuizId: quizId || null, requireScore: quizId ? Number(score) || 60 : null });
    setBusy(false);
  };
  return (
    <Sheet title={module ? 'Edit module' : 'New module'} onClose={onClose}
      footer={<button type="button" onClick={() => void save()} disabled={busy || !title.trim()} className="btn-primary w-full inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{module ? 'Save' : 'Add module'}</button>}>
      <div className="space-y-4">
        <Field label="Title" count={title.length} max={140}>{(p) => <input {...p} className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3: Process scheduling" />}</Field>
        <Field label="What it covers (optional)" count={summary.length} max={600}>{(p) => <textarea {...p} className="input min-h-[80px]" value={summary} maxLength={600} onChange={(e) => setSummary(e.target.value)} />}</Field>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium text-zinc-900 dark:text-white">Show to students</p><p className="text-xs text-zinc-500">Off: only you see it while you prepare it.</p></div>
          <Switch checked={published} onChange={setPublished} label="Show to students" />
        </div>
        <Field label="Opens on (optional)" hint="Students see it from this day.">{(p) => <input {...p} type="date" className="input" value={release} onChange={(e) => setRelease(e.target.value)} />}</Field>
        <Field label="Unlock after a quiz (optional)" hint={quizzes.length ? 'Students open it once they score enough on this quiz.' : 'No quizzes in this course yet.'}>
          {(p) => (
            <select {...p} className="input" value={quizId} onChange={(e) => setQuizId(e.target.value)} disabled={!quizzes.length}>
              <option value="">No quiz needed</option>
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}{q.status === 'DRAFT' ? ' (draft)' : ''}</option>)}
            </select>
          )}
        </Field>
        {quizId && <Field label="Score needed (%)">{(p) => <input {...p} type="number" min={1} max={100} className="input" value={score} onChange={(e) => setScore(e.target.value)} />}</Field>}
      </div>
    </Sheet>
  );
}

type ItemFields = { kind: ItemKind; refId?: string; title?: string; url?: string; body?: string };

function ItemForm({ choices, onClose, onSave }: { choices: NonNullable<View['choices']>; onClose: () => void; onSave: (f: ItemFields) => Promise<void> }) {
  const [kind, setKind] = useState<ItemKind>('FILE');
  const [refId, setRefId] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const isRef = REF_KINDS.includes(kind);
  const options = isRef ? choices[kind as 'FILE' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE'] : [];
  const ready = isRef ? !!refId : kind === 'PAGE' ? !!title.trim() && !!body.trim() : /^https?:\/\/\S+/i.test(url.trim());
  const save = async () => {
    setBusy(true);
    await onSave(isRef ? { kind, refId } : kind === 'PAGE' ? { kind, title: title.trim(), body: body.trim() } : { kind, url: url.trim(), title: title.trim() || undefined });
    setBusy(false);
  };
  const empty: Record<string, string> = { FILE: 'No files yet: add them in Materials first.', QUIZ: 'No quizzes yet: make one on the Quizzes page.', ASSIGNMENT: 'No assignments yet: set one on the Assignments page.', LIVE: 'No upcoming classes or events: add one in Calendar.' };
  return (
    <Sheet title="Add to module" onClose={onClose}
      footer={<button type="button" onClick={() => void save()} disabled={busy || !ready} className="btn-primary w-full inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Add</button>}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="What to add" className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {ITEM_KINDS.map((k) => {
            const K = KIND[k];
            return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setRefId(''); }}
                className={cn('rounded-2xl border p-2.5 flex flex-col items-center gap-1 text-xs font-medium pressable min-h-[64px]', kind === k ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
                <K.icon className="w-5 h-5" aria-hidden />{K.label}
              </button>
            );
          })}
        </div>
        {isRef ? (
          options.length ? (
            <Field label={`Pick a ${KIND[kind].label.toLowerCase()}`}>
              {(p) => (
                <select {...p} className="input" value={refId} onChange={(e) => setRefId(e.target.value)}>
                  <option value="">Choose…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.title}{o.startAt ? ` · ${day(o.startAt)}` : ''}{o.status === 'DRAFT' ? ' (draft)' : ''}</option>)}
                </select>
              )}
            </Field>
          ) : <p className="text-sm text-zinc-500">{empty[kind]}</p>
        ) : kind === 'PAGE' ? (
          <>
            <Field label="Title">{(p) => <input {...p} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Before you start" />}</Field>
            <Field label="Text" count={body.length} max={10_000}>{(p) => <textarea {...p} className="input min-h-[160px]" value={body} maxLength={10_000} onChange={(e) => setBody(e.target.value)} />}</Field>
          </>
        ) : (
          <>
            <Field label="Link">{(p) => <input {...p} className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}</Field>
            <Field label="Title (optional)">{(p) => <input {...p} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}</Field>
          </>
        )}
      </div>
    </Sheet>
  );
}
