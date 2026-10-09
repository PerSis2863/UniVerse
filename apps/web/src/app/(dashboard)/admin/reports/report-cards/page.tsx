'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate as revalidate } from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ClipboardList, Loader2, Plus, Printer, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';
import { Sheet } from '@/components/ui/Sheet';
import { Field, SearchField } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list, spring } from '@/lib/motion';
import { reportCardsPage, type ReportCardData } from '@/lib/report-card';
import { openPrintable } from '@/lib/open-printable';
import { cn } from '@/lib/utils';

// Admin → Insights → Report cards (Stage 5 · B15.3): start a round for a term, make the cards in
// batches (with a progress bar), add comments, print, then publish to students (in-app only).

type Run = { id: string; title: string; fromDate: string; toDate: string; school: string; total: number; publishedAt: string | null; createdAt: string; cards: number };
type Card = { id: string; data: ReportCardData; comment: string | null; average: number | null; student: { id: string; name: string; email: string } };
type Progress = { runId: string; done: number; total: number };

const KEY = '/api/admin/report-cards';
const post = <T,>(body: object) => authedJson<T>(KEY, { method: 'POST', body: JSON.stringify(body) });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);
const tone = (n: number | null) => n == null ? 'text-zinc-500' : n >= 80 ? 'text-emerald-700 dark:text-emerald-300' : n >= 60 ? 'text-zinc-900 dark:text-white' : 'text-rose-700 dark:text-rose-300';

function print(title: string, cards: Card[]) {
  if (!cards.length) return;
  if (!openPrintable(reportCardsPage(title, cards.map((c) => ({ data: c.data, comment: c.comment }))))) toast.error('Allow pop-ups to print the cards.');
}

export default function ReportCardsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ runs: Run[]; school: string }>(KEY, authedJson);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  // Makes the cards one batch per request until the server says there are no more students.
  const make = async (run: Pick<Run, 'id' | 'total'>) => {
    setProgress({ runId: run.id, done: 0, total: run.total });
    let cursor: string | null = null, done = 0;
    try {
      do {
        const r: { made: number; next: string | null } = await post({ action: 'compile', runId: run.id, cursor });
        done += r.made; cursor = r.next;
        setProgress({ runId: run.id, done, total: Math.max(run.total, done) });
      } while (cursor);
      toast.success(done ? `Made ${done} report card${done === 1 ? '' : 's'}` : 'No students with courses yet');
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t finish the cards. Make them again to carry on.'));
    } finally {
      setProgress(null);
      void revalidate((k) => typeof k === 'string' && k.startsWith(KEY));
    }
  };

  const act = async (run: Run, action: 'publish' | 'unpublish' | 'delete') => {
    const ask = action === 'publish'
      ? { title: `Publish “${run.title}”?`, message: `${run.cards} student${run.cards === 1 ? '' : 's'} will see their card in Grades and get a notification. No email is sent.`, confirmLabel: 'Publish' }
      : action === 'unpublish'
        ? { title: `Take back “${run.title}”?`, message: 'Students won’t see these cards until you publish again.', confirmLabel: 'Take back' }
        : { title: `Delete “${run.title}”?`, message: 'Every card in this round and its comments are deleted. Students won’t see them any more.', confirmLabel: 'Delete', destructive: true };
    if (!(await confirmDialog(ask))) return;
    try {
      await post({ action, runId: run.id });
      toast.success(action === 'publish' ? 'Published: students can see their cards' : action === 'unpublish' ? 'Taken back' : 'Round deleted');
      if (action === 'delete') setOpenId(null);
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
  };

  const remake = async (run: Run) => {
    if (run.publishedAt && !(await confirmDialog({ title: 'Update published cards?', message: 'Grades and attendance are read again for this term. Students see the updated cards; comments stay.', confirmLabel: 'Update' }))) return;
    void make(run);
  };

  const open = data?.runs.find((r) => r.id === openId);
  const actions = { progress, onRemake: remake, onAct: act };

  return (
    <>
      <Topbar
        title="Report cards"
        subtitle="Term report cards for every student"
        rightNode={!open && <button type="button" onClick={() => setCreating(true)} className="btn-primary h-9 px-4 text-sm"><Plus className="w-4 h-4" /> New round</button>}
      />
      <SectionTabs tabs={ADMIN_INSIGHT_TABS} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div key={open.id} variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
              <RunDetail run={open} onBack={() => setOpenId(null)} {...actions} />
            </motion.div>
          ) : (
            <motion.div key="rounds" variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }} className="max-w-3xl">
              {error && !data ? <LoadError onRetry={() => mutate()} />
                : isLoading && !data ? <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-28 rounded-3xl skeleton" />)}</div>
                : !data?.runs.length ? (
                  <EmptyState icon={ClipboardList} title="No report cards yet" hint="Start a round for a term: each student gets a card with their course grades, GPA and attendance." action={{ label: 'New round', icon: Plus, onClick: () => setCreating(true) }} />
                ) : (
                  <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
                    {data.runs.map((r) => (
                      <motion.li key={r.id} variants={fadeUp} layout transition={spring.smooth} className="card p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <button type="button" onClick={() => setOpenId(r.id)} className="text-left min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50">
                            <h2 className="font-bold text-zinc-900 dark:text-white truncate">{r.title}</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{day(r.fromDate)} – {day(r.toDate)} · {r.cards} of {r.total} card{r.total === 1 ? '' : 's'}</p>
                          </button>
                          <Status run={r} />
                        </div>
                        <RunActions run={r} onOpen={() => setOpenId(r.id)} {...actions} />
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {creating && (
        <NewRound onClose={() => setCreating(false)} onCreated={(run) => {
          setCreating(false);
          void mutate((d) => d && { ...d, runs: [{ ...run, cards: 0 }, ...d.runs] }, { revalidate: false });
          setOpenId(run.id);
          void make(run);
        }} />
      )}
    </>
  );
}

function Status({ run }: { run: Run }) {
  return run.publishedAt
    ? <span className="shrink-0 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold">Published {day(run.publishedAt)}</span>
    : <span className="shrink-0 rounded-full bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 px-2.5 py-1 text-xs font-semibold">Draft</span>;
}

function Bar({ p }: { p: Progress }) {
  const value = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  return (
    <div className="mt-3">
      <div role="progressbar" aria-label="Making report cards" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
        <motion.div className="h-full rounded-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={spring.smooth} />
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums" aria-live="polite">Making cards… {p.done} of {p.total}</p>
    </div>
  );
}

type ActionProps = { progress: Progress | null; onRemake: (r: Run) => void; onAct: (r: Run, a: 'publish' | 'unpublish' | 'delete') => void };

function RunActions({ run, progress, onRemake, onAct, onOpen, cards }: ActionProps & { run: Run; onOpen?: () => void; cards?: Card[] }) {
  const busy = progress?.runId === run.id;
  return (
    <>
      {progress && busy && <Bar p={progress} />}
      <div className="mt-3 flex flex-wrap gap-2">
        {onOpen && <button type="button" onClick={onOpen} className="btn-secondary btn-sm">Open</button>}
        {cards && <button type="button" onClick={() => print(run.title, cards)} disabled={!cards.length} className="btn-secondary btn-sm"><Printer className="w-4 h-4" /> Print all</button>}
        <button type="button" onClick={() => onRemake(run)} disabled={!!progress} className="btn-secondary btn-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {run.cards ? 'Update cards' : 'Make cards'}
        </button>
        {run.publishedAt
          ? <button type="button" onClick={() => onAct(run, 'unpublish')} disabled={busy} className="btn-secondary btn-sm"><Undo2 className="w-4 h-4" /> Take back</button>
          : <button type="button" onClick={() => onAct(run, 'publish')} disabled={busy || !run.cards} className="btn-primary btn-sm"><Send className="w-4 h-4" /> Publish</button>}
        <button type="button" onClick={() => onAct(run, 'delete')} disabled={busy} aria-label={`Delete ${run.title}`} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete</button>
      </div>
    </>
  );
}

function RunDetail({ run, onBack, ...actions }: ActionProps & { run: Run; onBack: () => void }) {
  const key = `${KEY}/${run.id}`;
  const { data, error, isLoading, mutate } = useSWR<{ cards: Card[] }>(key, authedJson);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'low'>('name');
  const [limit, setLimit] = useState(60);
  const [expanded, setExpanded] = useState<string | null>(null);

  const all = useMemo(() => data?.cards ?? [], [data]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const xs = term ? all.filter((c) => c.student.name.toLowerCase().includes(term) || c.student.email.toLowerCase().includes(term)) : all;
    return sort === 'low' ? [...xs].sort((a, b) => (a.average ?? 101) - (b.average ?? 101)) : xs;
  }, [all, q, sort]);
  const graded = all.filter((c) => c.average != null);
  const stats = [
    { label: 'Cards', value: String(all.length) },
    { label: 'Average', value: pct(graded.length ? Math.round(graded.reduce((s, c) => s + c.average!, 0) / graded.length) : null) },
    { label: 'Below 60%', value: String(graded.filter((c) => c.average! < 60).length) },
    { label: 'With a comment', value: String(all.filter((c) => c.comment).length) },
  ];

  const saveComment = async (card: Card, value: string) => {
    const comment = value.trim();
    if (comment === (card.comment ?? '')) return;
    try {
      await post({ action: 'comment', cardId: card.id, comment });
      void mutate((d) => d && { ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, comment: comment || null } : c)) }, { revalidate: false });
      toast.success('Comment saved');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save the comment.')); }
  };

  return (
    <div className="max-w-4xl">
      <button type="button" onClick={onBack} className="btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="w-4 h-4" /> All rounds</button>
      <div className="card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{run.title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{run.school} · {day(run.fromDate)} – {day(run.toDate)}</p>
          </div>
          <Status run={run} />
        </div>
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] px-3 py-2">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</dt>
              <dd className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <RunActions run={run} cards={all} {...actions} />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchField value={q} onChange={(v) => { setQ(v); setLimit(60); }} placeholder="Search students" className="flex-1" />
        <Segmented<'name' | 'low'> label="Sort by" value={sort} onChange={setSort} segments={[{ value: 'name', label: 'Name' }, { value: 'low', label: 'Lowest first' }]} />
      </div>

      {error && !data ? <LoadError className="mt-4" onRetry={() => mutate()} />
        : isLoading && !data ? <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}</div>
        : !all.length ? <EmptyState className="mt-4" compact icon={ClipboardList} title="No cards yet" hint={actions.progress ? 'They appear here as they’re made.' : 'Make the cards to read this term’s grades and attendance.'} />
        : !shown.length ? <p className="mt-4 text-sm text-zinc-500">No students match “{q}”.</p>
        : (
          <ul className="mt-4 rounded-3xl border border-zinc-200/70 dark:border-white/[0.07] divide-y divide-zinc-100 dark:divide-white/[0.05] bg-white dark:bg-zinc-900/50 overflow-hidden">
            {shown.slice(0, limit).map((c) => (
              <CardRow key={c.id} card={c} title={run.title} open={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} onComment={(v) => void saveComment(c, v)} />
            ))}
          </ul>
        )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 60)} className="btn-secondary btn-sm mt-3">Show more ({shown.length - limit} left)</button>
      )}
    </div>
  );
}

function CardRow({ card, title, open, onToggle, onComment }: { card: Card; title: string; open: boolean; onToggle: () => void; onComment: (v: string) => void }) {
  const d = card.data;
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-zinc-50 dark:focus-visible:bg-white/[0.04]">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900 dark:text-white truncate">{card.student.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{card.student.email} · {d.courses.length} course{d.courses.length === 1 ? '' : 's'}{card.comment ? ' · commented' : ''}</p>
        </div>
        <div className="hidden sm:block text-right w-16"><p className="text-[11px] text-zinc-500 dark:text-zinc-400">GPA</p><p className="font-semibold tabular-nums text-zinc-900 dark:text-white">{d.overall.gpa == null ? '—' : d.overall.gpa.toFixed(2)}</p></div>
        <div className="hidden sm:block text-right w-20"><p className="text-[11px] text-zinc-500 dark:text-zinc-400">Attendance</p><p className="font-semibold tabular-nums text-zinc-900 dark:text-white">{pct(d.overall.attendanceRate)}</p></div>
        <div className="text-right w-16"><p className="text-[11px] text-zinc-500 dark:text-zinc-400">Average</p><p className={cn('font-bold tabular-nums', tone(d.overall.average))}>{pct(d.overall.average)}</p></div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy} className="text-zinc-400"><ChevronDown className="w-4 h-4" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4">
              <p className="sm:hidden text-sm text-zinc-600 dark:text-zinc-300">GPA {d.overall.gpa == null ? '—' : d.overall.gpa.toFixed(2)} · Attendance {pct(d.overall.attendanceRate)}</p>
              {d.courses.length ? (
                <div className="overflow-x-auto rounded-2xl border border-zinc-200/70 dark:border-white/[0.07]" role="region" aria-label={`${card.student.name}’s courses`} tabIndex={0}>
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-white/[0.03] text-xs text-zinc-500 dark:text-zinc-400">
                      <tr><th className="text-left font-medium px-3 py-2">Course</th><th className="text-right font-medium px-3 py-2">Final</th><th className="text-right font-medium px-3 py-2">Grade</th><th className="text-right font-medium px-3 py-2">Attendance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                      {d.courses.map((c) => (
                        <tr key={c.code}>
                          <td className="px-3 py-2"><span className="font-semibold text-zinc-900 dark:text-white">{c.code}</span> <span className="text-zinc-600 dark:text-zinc-300">{c.name}</span>{c.graded === 0 && <span className="block text-xs text-zinc-500 dark:text-zinc-400">No grades this term</span>}</td>
                          <td className={cn('px-3 py-2 text-right tabular-nums', tone(c.final))}>{pct(c.final)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-zinc-900 dark:text-white">{c.letter ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{pct(c.attendanceRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-zinc-500">No courses this term.</p>}
              <Field label="Comment on the card" hint="Saved when you leave the box. Shown on the printed card.">
                {(p) => <textarea {...p} className="input min-h-[5rem]" maxLength={2000} defaultValue={card.comment ?? ''} placeholder="e.g. A strong term in maths; keep reading every day." onBlur={(e) => onComment(e.target.value)} />}
              </Field>
              <button type="button" onClick={() => print(`${title} · ${card.student.name}`, [card])} className="btn-secondary btn-sm"><Printer className="w-4 h-4" /> Print this card</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function NewRound({ onClose, onCreated }: { onClose: () => void; onCreated: (run: Run) => void }) {
  const [f, setF] = useState({ title: '', from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { onCreated(await post<Run>({ action: 'create', ...f })); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t start the round.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet
      title="New report card round"
      onClose={onClose}
      footer={<button type="submit" form="new-round" disabled={busy || !f.title.trim() || !f.from || !f.to} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />} Make the cards</button>}
    >
      <form id="new-round" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Each student with courses gets a card: every course’s weighted final from grades given between these dates, its letter grade, GPA and attendance. Nothing is shared until you publish.</p>
        <Field label="Name">{(p) => <input {...p} className="input" maxLength={120} placeholder="e.g. Term 1 2026–27" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">{(p) => <input {...p} type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
          <Field label="Last day">{(p) => <input {...p} type="date" className="input" min={f.from || undefined} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
        </div>
      </form>
    </Sheet>
  );
}
