'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BarChart3, ChevronDown, Loader2, Search, Sparkles, Table2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { AWAY, SUGGESTIONS, WINDOWS, formatValue, metricMeta, rangeText, type MetricHelp, type MetricId, type MetricResult, type Order } from '@/lib/school-metrics';
import { TabPill, TabPanel } from '@/components/ui/Glide';

// School insights → "Ask about your school" and the trend cards. Suggested questions, trend cards
// and the settings under an answer open measures directly (no AI); a typed question costs one
// small AI request that only picks the measure (src/server/school-analytics.ts).

const MetricChart = dynamic(() => import('./MetricChart'), { ssr: false, loading: () => <div className="h-32 rounded-xl skeleton" /> });

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const th = 'text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2';
const select = 'h-8 rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40';
const API = '/api/admin/school-analytics';
const TRENDS: MetricId[] = ['attendance_trend', 'active_students_trend', 'impact_hours_by_month'];

type Answer = MetricResult | MetricHelp;
type Settings = { days?: number | null; order?: Order | null; department?: string | null };
const isHelp = (a: Answer): a is MetricHelp => 'help' in a;

function measureUrl(metric: MetricId, s: Settings = {}) {
  const p = new URLSearchParams({ metric });
  if (s.days) p.set('days', String(s.days));
  if (s.order) p.set('order', s.order);
  if (s.department) p.set('department', s.department);
  return `${API}?${p}`;
}

const VIA: Record<NonNullable<MetricResult['via']>, string> = { ai: ' · matched to your question with AI', saved: ' · matched to your question', keywords: ' · matched by keywords', suggestion: '' };

export function SchoolAnalytics() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [moreIdeas, setMoreIdeas] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const { data: trends, error: trendError } = useSWR<{ results: MetricResult[] }>(`${API}?metrics=${TRENDS.join(',')}`, authedJson, { revalidateOnFocus: false });

  const run = async (load: () => Promise<Answer>, scroll = true) => {
    setBusy(true);
    try {
      setAnswer(await load());
      if (scroll) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = (metric: MetricId, s?: Settings, scroll = true) => run(() => authedJson<MetricResult>(measureUrl(metric, s)), scroll);
  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy) return;
    void run(() => authedJson<Answer>(API, { method: 'POST', body: JSON.stringify({ question: q }) }));
  };

  return (
    <>
      <section className="space-y-3" aria-labelledby="ask-school">
        <h2 id="ask-school" className="text-lg font-bold text-zinc-900 dark:text-white">Ask about your school</h2>
        <div className={`${card} p-4 md:p-5 space-y-4`}>
          <form onSubmit={ask} className="flex gap-2">
            <label htmlFor="school-question" className="sr-only">Your question</label>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" aria-hidden />
              <input
                id="school-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} autoComplete="off"
                placeholder="e.g. Which courses have the lowest attendance this month?"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <button type="submit" disabled={busy || question.trim().length < 3} className="btn-primary shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />} Ask
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {(moreIdeas ? SUGGESTIONS : SUGGESTIONS.slice(0, 4)).map((s) => (
              <motion.button
                key={s.q} type="button" whileTap={{ scale: 0.96 }} disabled={busy}
                onClick={() => { setQuestion(s.q); void open(s.metric, { days: s.days, order: s.order }); }}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 transition-colors text-left"
              >
                {s.q}
              </motion.button>
            ))}
            {!moreIdeas && (
              <button type="button" onClick={() => setMoreIdeas(true)} className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-1">
                More questions <ChevronDown className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {answer && (
              <motion.div
                key={isHelp(answer) ? 'help' : answer.metric} ref={resultRef}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={spring.smooth}
                className={cn('pt-4 border-t border-zinc-200 dark:border-white/[0.06] transition-opacity', busy && 'opacity-60')}
                aria-live="polite"
              >
                {isHelp(answer) ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{answer.message} Pick one of the questions above, or ask in your own words.</p>
                ) : (
                  <Result a={answer} view={view} setView={setView} busy={busy} change={(s) => open(answer.metric, { days: answer.days, order: answer.order, department: answer.department, ...s }, false)} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="school-trends">
        <h2 id="school-trends" className="text-lg font-bold text-zinc-900 dark:text-white">Trends</h2>
        {trendError ? (
          <p className="text-sm text-rose-500">{(trendError as Error).message}</p>
        ) : !trends ? (
          <div className="grid gap-3 md:grid-cols-3">{TRENDS.map((t) => <div key={t} className="h-56 rounded-2xl skeleton" />)}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3 stagger">
            {trends.results.map((r) => <TrendCard key={r.metric} r={r} onOpen={() => open(r.metric, { days: r.days })} />)}
          </div>
        )}
      </section>
    </>
  );
}

function Result({ a, view, setView, busy, change }: { a: MetricResult; view: 'chart' | 'table'; setView: (v: 'chart' | 'table') => void; busy: boolean; change: (s: Settings) => void }) {
  const meta = metricMeta(a.metric);
  const choices = meta.range === 'away' ? AWAY : meta.range === 'window' ? WINDOWS : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-zinc-900 dark:text-white">{a.title}</h3>
          <p className="text-xs text-zinc-500">{a.range}{a.via ? VIA[a.via] : ''}</p>
        </div>
        {a.rows.length > 0 && (
          <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-0.5" role="group" aria-label="Show as">
            {(['chart', 'table'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                className={cn('relative isolate h-7 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-colors', view === v ? 'text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>{view === v && <TabPill id="nts-insights-schoolanalytics-0" />}
                {v === 'chart' ? <BarChart3 className="w-3.5 h-3.5" aria-hidden /> : <Table2 className="w-3.5 h-3.5" aria-hidden />}{v === 'chart' ? 'Chart' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>

      {(choices.length > 0 || a.order || (a.departments?.length ?? 0) > 1) && (
        <div className="flex flex-wrap gap-2">
          {choices.length > 0 && (
            <select id="metric-range" aria-label="Period" className={select} disabled={busy} value={a.days ?? ''} onChange={(e) => change({ days: Number(e.target.value) })}>
              {choices.map((d) => <option key={d} value={d}>{rangeText(meta, d)}</option>)}
            </select>
          )}
          {a.order && (
            <select id="metric-order" aria-label="Order" className={select} disabled={busy} value={a.order} onChange={(e) => change({ order: e.target.value as Order })}>
              <option value="lowest">Lowest first</option>
              <option value="highest">Highest first</option>
            </select>
          )}
          {(a.departments?.length ?? 0) > 1 && (
            <select id="metric-department" aria-label="Department" className={select} disabled={busy} value={a.department ?? ''} onChange={(e) => change({ department: e.target.value || null })}>
              <option value="">All departments</option>
              {a.departments!.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
      )}

      <p className="text-sm text-zinc-700 dark:text-zinc-200">{a.headline}</p>
      {a.note && <p className="text-xs text-amber-700 dark:text-amber-400">{a.note}</p>}
      {a.rows.length > 0 && <TabPanel k={view}>{view === 'chart' ? <MetricChart result={a} /> : <DataTable a={a} />}</TabPanel>}
      {view === 'chart' && a.kind === 'bar' && a.rows.length > 15 && <p className="text-xs text-zinc-500">The chart shows the first 15. The table has all {a.rows.length}.</p>}
    </div>
  );
}

function DataTable({ a }: { a: MetricResult }) {
  return (
    <div className="overflow-x-auto max-h-[28rem]">
      <table className="w-full text-sm min-w-[24rem]">
        <thead><tr>{a.columns.map((c) => <th key={c.key} scope="col" className={cn(th, c.unit && 'text-right')}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
          {a.rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              {a.columns.map((c, j) => (
                <td key={c.key} className={cn('py-2 pr-3', c.unit ? 'text-right tabular-nums text-zinc-700 dark:text-zinc-200' : j === 0 ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-500')}>
                  {c.unit ? formatValue(Number(r[c.key]), c.unit, false) : String(r[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCard({ r, onOpen }: { r: MetricResult; onOpen: () => void }) {
  const big = !r.rows.length ? '–' : r.kind === 'column' ? formatValue(r.rows.reduce((s, x) => s + x.value, 0), r.unit) : formatValue(r.rows[r.rows.length - 1].value, r.unit);
  return (
    <div className={`${card} p-4 flex flex-col gap-2`}>
      <p className="text-xs text-zinc-500">{r.title} · {r.range}</p>
      <p className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{big}</p>
      {r.rows.length > 1 ? <MetricChart result={r} compact /> : <div className="h-[110px] rounded-xl bg-zinc-100/60 dark:bg-white/[0.03]" aria-hidden />}
      <p className="text-xs text-zinc-500 flex-1">{r.headline}</p>
      <button type="button" onClick={onOpen} className="self-start text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-500">See details →</button>
    </div>
  );
}
