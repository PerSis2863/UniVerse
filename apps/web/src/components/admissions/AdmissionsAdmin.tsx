'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as revalidate } from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ChevronRight, Copy, Download, ExternalLink, Lock, Pencil, Plus, School, Star, Unlock } from 'lucide-react';
import { SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { toCsv } from '@/lib/csv';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { STAGES, STAGE_LABEL, type FormField, type Stage } from '@/lib/admission-form';
import { ApplicationSheet } from './ApplicationSheet';
import { RoundEditor, type RoundInput } from './RoundEditor';
import { StageChip } from './StageChip';

// Admissions for admins (Stage 5 · B15.1; src/server/admissions.ts): rounds (open, closed, how many
// applications at each stage, the public link), a round's applications (filter by stage, search,
// scores, CSV), and one application in a sheet.

type Phase = 'open' | 'upcoming' | 'ended' | 'closed';
const PHASE: Record<Phase, string> = { open: 'Open', upcoming: 'Not open yet', ended: 'Ended', closed: 'Closed' };
interface RoundRow { id: string; slug: string; title: string; opensAt: string; closesAt: string; closedAt: string | null; open: boolean; phase: Phase; byStage: Record<string, number>; total: number; courseIds: string[] }
interface Rounds { courses: { id: string; code: string; name: string }[]; school: string; rounds: RoundRow[] }
interface AppRow { id: string; ref: string; studentName: string; contactName: string; contactEmail: string; stage: Stage; createdAt: string; documents: number; score: number | null; reviews: number; mine: number | null }
interface RoundDetail { round: RoundInput & { id: string; slug: string; open: boolean; phase: Phase; closedAt: string | null; fields: FormField[] }; byStage: Record<string, number>; applications: AppRow[] }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const publicLink = (slug: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/apply/${slug}`;

export function AdmissionsAdmin() {
  const { data, error, mutate } = useSWR<Rounds>('/api/admissions', authedJson);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoundInput | 'new' | null>(null);
  useEffect(() => { const t = setTimeout(() => setRoundId(new URLSearchParams(window.location.search).get('round')), 0); return () => clearTimeout(t); }, []);
  const openRound = (id: string | null) => {
    setRoundId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('round', id); else url.searchParams.delete('round');
    window.history.replaceState(window.history.state, '', url);
  };

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  return (
    <>
      {roundId ? <RoundView key={roundId} id={roundId} school={data.school} onBack={() => { openRound(null); void mutate(); }} onEdit={(r) => setEditing(r)} />
        : (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xl">Families apply on a public page, without an account, and follow their application with a private link. You review, offer places and enrol.</p>
              <button type="button" onClick={() => setEditing('new')} className="btn-primary btn-sm shrink-0"><Plus className="w-4 h-4" /> New round</button>
            </div>
            {data.rounds.length === 0 ? (
              <section className={`${card} p-8 text-center`}>
                <School className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden />
                <p className="font-semibold text-zinc-900 dark:text-white">No admission rounds yet</p>
                <p className="text-sm text-zinc-500 mt-1">A round has its own application form, dates and the classes admitted students join.</p>
              </section>
            ) : (
              <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
                {data.rounds.map((r) => (
                  <motion.li key={r.id} variants={fadeUp} className={`${card} p-4`}>
                    <button type="button" onClick={() => { haptic('tap'); openRound(r.id); }} className="w-full flex items-start gap-3 text-left">
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2"><span className="font-semibold text-zinc-900 dark:text-white truncate">{r.title}</span>
                          <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', r.open ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>{PHASE[r.phase]}</span></span>
                        <span className="block text-xs text-zinc-500">{format(new Date(r.opensAt), 'd MMM')} – {format(new Date(r.closesAt), 'd MMM yyyy')} · {r.total} application{r.total === 1 ? '' : 's'}</span>
                        {r.total > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{STAGES.filter((s) => r.byStage[s]).map((s) => <span key={s} className="text-[11px] text-zinc-600 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-white/10 px-2 py-0.5">{STAGE_LABEL[s]} {r.byStage[s]}</span>)}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mt-1" aria-hidden />
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.div>
        )}
      {editing && <RoundEditor round={editing === 'new' ? null : editing} courses={data.courses} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); void mutate(); void revalidate((k) => typeof k === 'string' && k.startsWith(`/api/admissions/${id}`)); openRound(id); }} />}
    </>
  );
}

function RoundView({ id, school, onBack, onEdit }: { id: string; school: string; onBack: () => void; onEdit: (r: RoundInput) => void }) {
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const key = `/api/admissions/${id}?${new URLSearchParams({ ...(stage ? { stage } : {}), ...(dq ? { q: dq } : {}) })}`;
  const { data, error, mutate, isLoading } = useSWR<RoundDetail>(key, authedJson, { keepPreviousData: true });
  const [app, setApp] = useState<string | null>(null);
  const total = useMemo(() => Object.values(data?.byStage ?? {}).reduce((a, b) => a + b, 0), [data]);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const r = data.round;

  const toggle = async () => {
    try {
      await authedJson(`/api/admissions/${id}`, { method: 'POST', body: JSON.stringify({ action: r.closedAt ? 'reopen' : 'close' }) });
      toast.success(r.closedAt ? 'Round reopened' : 'Round closed: no new applications');
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
  };
  const copy = () => void navigator.clipboard?.writeText(publicLink(r.slug)).then(() => toast.success('Link copied'));
  const csv = () => {
    const text = toCsv(['Reference', 'Student', 'Contact', 'Email', 'Stage', 'Applied', 'Average score', 'Scores', 'Documents'],
      data.applications.map((a) => [a.ref, a.studentName, a.contactName, a.contactEmail, STAGE_LABEL[a.stage], a.createdAt.slice(0, 10), a.score ?? '', a.reviews, a.documents]));
    const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `${r.slug}-applications.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
      <button type="button" onClick={onBack} className="btn-ghost btn-sm -ml-2"><ArrowLeft className="w-4 h-4" /> All rounds</button>
      <section className={`${card} p-4 sm:p-5 space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{r.title}</h2>
            <p className="text-xs text-zinc-500">{PHASE[r.phase]} · {format(new Date(r.opensAt), 'd MMM')} – {format(new Date(r.closesAt), 'd MMM yyyy')} · {r.fields.length} question{r.fields.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button" onClick={() => onEdit({ id, title: r.title, intro: r.intro, opensAt: r.opensAt, closesAt: r.closesAt, courseIds: r.courseIds, fields: r.fields, offerTemplate: r.offerTemplate })} aria-label="Edit the round" className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><Pencil className="w-4 h-4" /></button>
            <button type="button" onClick={() => void toggle()} aria-label={r.closedAt ? 'Reopen the round' : 'Close the round'} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10">{r.closedAt ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}</button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly aria-label="Public application link" value={publicLink(r.slug)} onFocus={(e) => e.currentTarget.select()} className="input flex-1 font-mono text-xs" />
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={copy} className="btn-secondary btn-sm"><Copy className="w-4 h-4" /> Copy</button>
            <a href={`/apply/${r.slug}`} target="_blank" rel="noopener" className="btn-ghost btn-sm"><ExternalLink className="w-4 h-4" /> Open</a>
          </div>
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Student, contact, email or reference" className="flex-1" />
        <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="input sm:w-56">
          <option value="">Every stage ({total})</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]} ({data.byStage[s] ?? 0})</option>)}
        </select>
      </div>

      {data.applications.length === 0 ? (
        <p className={`${card} p-8 text-center text-sm text-zinc-500`}>{total ? 'No applications match.' : 'No applications yet. Share the link with families.'}</p>
      ) : (
        <section className={cn(card, 'p-2 sm:p-3 transition-opacity', isLoading && 'opacity-60')} aria-label="Applications">
          <div className="flex items-center justify-between px-3 pt-1 pb-2 text-xs text-zinc-500">
            <span>{data.applications.length} shown</span>
            <button type="button" onClick={csv} className="btn-ghost btn-sm"><Download className="w-4 h-4" /> CSV</button>
          </div>
          <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.applications.map((a) => (
              <motion.li key={a.id} variants={fadeUp}>
                <button type="button" onClick={() => { haptic('tap'); setApp(a.id); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{a.studentName}</span>
                    <span className="block text-xs text-zinc-500 truncate">{a.contactName} · <span className="font-mono">{a.ref}</span> · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}{a.documents ? ` · ${a.documents} document${a.documents === 1 ? '' : 's'}` : ''}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <StageChip stage={a.stage} />
                    {a.score != null && <span className="text-[11px] text-zinc-500 inline-flex items-center gap-0.5 tabular-nums"><Star className="w-3 h-3 fill-amber-400 text-amber-500" aria-hidden />{a.score} ({a.reviews}){a.mine == null ? ' · not scored by you' : ''}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}
      {app && <ApplicationSheet key={app} id={app} school={school} onClose={() => setApp(null)} onChanged={() => void mutate()} />}
    </motion.div>
  );
}
