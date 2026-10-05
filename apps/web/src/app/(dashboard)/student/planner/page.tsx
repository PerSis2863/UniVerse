'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AlertCircle, BookOpen, CalendarDays, Clock, Loader2, RefreshCw, Sparkles, Target } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { DeadlineList, type DeadlineItem } from '@/components/progress/DeadlineList';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { courseColor } from '@/lib/course-color';
import { cn } from '@/lib/utils';
import { SupportPlans } from '@/components/planner/SupportPlans';

interface PlanBlock { course: string; task: string; minutes: number; why: string }
interface Plan { summary: string; days: { date: string; focus: string; blocks: PlanBlock[] }[]; madeAt: string }
interface Course { id: string; code: string; name: string; color: string | null; emoji: string | null; grade: number | null; attendance: number | null }
interface PlannerData {
  today: string;
  courses: Course[];
  deadlines: DeadlineItem[];
  plan: Plan | null;
  ai: { on: boolean; message: string | null };
}
type PlanError = { message: string; code?: string };

const panel = 'rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-4 sm:p-6';

function PanelTitle({ icon: Icon, children }: { icon: typeof Target; children: React.ReactNode }) {
  return (
    <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
      <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center">
        <Icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
      </span>
      {children}
    </h2>
  );
}

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE'));
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

export default function StudyPlannerPage() {
  // The student's own day and timezone: the plan's days and the daily saved copy follow them.
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const key = `/api/student/planner?today=${today}&tz=${encodeURIComponent(tz)}`;
  const { data, error, isLoading, mutate } = useSWR<PlannerData>(key, authedJson, { revalidateOnFocus: false });

  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const autoTried = useRef(false);

  const makePlan = async (fresh: boolean) => {
    setBusy(true);
    setPlanError(null);
    try {
      const r = await authedJson<{ plan: Plan }>('/api/student/planner', { method: 'POST', body: JSON.stringify({ today, tz, fresh }) });
      await mutate((d) => (d ? { ...d, plan: r.plan } : d), { revalidate: false });
      if (fresh) toast.success('Your new plan is ready');
    } catch (e) {
      const err = e as Error & { body?: { code?: string } };
      setPlanError({ message: err.message || 'Couldn’t make a plan right now.', code: err.body?.code });
    } finally {
      setBusy(false);
    }
  };

  // First visit of the day: make the plan straight away (later visits get the saved one for free).
  useEffect(() => {
    if (!data || data.plan || !data.ai.on || !data.courses.length || autoTried.current) return;
    autoTried.current = true;
    void makePlan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the data first arrives
  }, [data]);

  const byCode = useMemo(() => new Map((data?.courses ?? []).map((c) => [c.code.toLowerCase(), c])), [data?.courses]);
  // Deadlines on each plan day, in the student's own timezone.
  const dueOn = useMemo(() => {
    const m = new Map<string, DeadlineItem[]>();
    for (const d of data?.deadlines ?? []) {
      const day = format(new Date(d.due), 'yyyy-MM-dd');
      m.set(day, [...(m.get(day) ?? []), d]);
    }
    return m;
  }, [data?.deadlines]);

  const plan = data?.plan ?? null;
  const notice = !data ? null : !data.ai.on ? data.ai.message : planError?.message ?? null;
  const canPlan = !!data?.ai.on && !!data.courses.length;
  const weakest = useMemo(
    () => [...(data?.courses ?? [])].sort((a, b) => (a.grade ?? 101) - (b.grade ?? 101)),
    [data?.courses],
  );

  return (
    <>
      <Topbar title="Study planner" subtitle="A week of study built around what’s due" />
      <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">

        {/* Plans a teacher made for me (early help) */}
        <SupportPlans />

        {/* Header: what this is, and the button to make a new plan */}
        <section className="relative overflow-hidden rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20 shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white leading-tight">Your next 7 days</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
                  {plan?.summary || 'More time for the courses you find hardest, and for whatever is due soonest.'}
                </p>
                {plan && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Made {format(new Date(plan.madeAt), 'HH:mm')} today. It’s saved, so coming back is free.
                  </p>
                )}
              </div>
            </div>
            {canPlan && (
              <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                <button onClick={() => makePlan(!!plan)} disabled={busy} aria-busy={busy || undefined} className="btn-primary min-h-11 px-5">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {plan ? 'Make a new plan' : 'Make my plan'}
                </button>
                <span className="text-[11px] text-zinc-500 text-center sm:text-right">Uses 1 of today’s AI requests</span>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">
            Couldn’t load your planner right now. Please refresh in a moment.
          </div>
        )}

        {notice && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p>{notice}</p>
              {planError?.code === 'ai-limit' && <p className="mt-1 text-xs opacity-80">Your deadlines are still listed below.</p>}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-3xl skeleton" />)}</div>
            <div className="lg:col-span-4"><div className="h-72 rounded-3xl skeleton" /></div>
          </div>
        ) : data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* The plan, day by day */}
            <div className="lg:col-span-8 space-y-4 min-w-0">
              {!data.courses.length ? (
                <div className={cn(panel, 'text-center py-10')}>
                  <BookOpen className="w-10 h-10 mx-auto text-indigo-400" />
                  <p className="mt-3 font-bold text-zinc-900 dark:text-white">No courses yet</p>
                  <p className="text-sm text-zinc-500 mt-1">Once you’re in a course, your plan is made from its grades and deadlines.</p>
                  <Link href="/student/courses" className="btn-secondary min-h-11 mt-4 inline-flex">See courses</Link>
                </div>
              ) : busy && !plan ? (
                <>
                  <p className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> Making your plan…</p>
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 rounded-3xl skeleton" />)}
                </>
              ) : plan ? (
                <ol className={cn('space-y-4 transition-opacity', busy && 'opacity-50')}>
                  {plan.days.map((day) => {
                    const date = parseISO(day.date);
                    const total = day.blocks.reduce((t, b) => t + b.minutes, 0);
                    const due = dueOn.get(day.date) ?? [];
                    return (
                      <li key={day.date} className={cn(panel, isToday(date) && 'ring-2 ring-indigo-500/30')}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">{format(date, 'd MMM')}</p>
                            <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">{dayLabel(date)}</h3>
                            {day.focus && <p className="text-sm text-zinc-500 truncate">{day.focus}</p>}
                          </div>
                          {total > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/15 whitespace-nowrap">
                              <Clock className="w-3 h-3" /> {hours(total)}
                            </span>
                          )}
                        </div>

                        {due.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {due.map((d) => (
                              <span key={d.id} className="inline-flex items-center gap-1 max-w-full text-[11px] font-semibold px-2 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                <Target className="w-3 h-3 shrink-0" /><span className="truncate">Due: {d.title}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {day.blocks.length === 0 ? (
                          <p className="text-sm text-zinc-500">A free day. Rest, or catch up on anything you missed.</p>
                        ) : (
                          <ul className="space-y-2">
                            {day.blocks.map((b, i) => {
                              const c = byCode.get(b.course.toLowerCase());
                              const color = c ? courseColor(c.color, c.code) : '#a855f7';
                              return (
                                <li key={i} className="flex gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                                  <span className="w-1 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${color}1f`, color }}>{c?.code ?? b.course}</span>
                                      <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><Clock className="w-3 h-3" />{b.minutes} min</span>
                                    </div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-1 break-words">{b.task}</p>
                                    {b.why && <p className="text-xs text-zinc-500 mt-0.5 break-words">{b.why}</p>}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className={cn(panel, 'text-center py-10')}>
                  <CalendarDays className="w-10 h-10 mx-auto text-indigo-400" />
                  <p className="mt-3 font-bold text-zinc-900 dark:text-white">No plan for today yet</p>
                  <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
                    {data.ai.on ? 'Tap “Make my plan” and you’ll get a week of study blocks.' : 'Plans need AI, which is off right now. Use the list of what’s due to plan your week.'}
                  </p>
                </div>
              )}
            </div>

            {/* What's due and where to focus */}
            <div className="lg:col-span-4 space-y-6 min-w-0">
              <section className={panel}>
                <PanelTitle icon={Target}>Coming up</PanelTitle>
                <DeadlineList items={data.deadlines} />
              </section>

              {weakest.length > 0 && (
                <section className={panel}>
                  <PanelTitle icon={BookOpen}>Your courses</PanelTitle>
                  <p className="text-xs text-zinc-500 -mt-2 mb-3">Lowest grade first: these get more time in your plan.</p>
                  <ul className="space-y-3">
                    {weakest.map((c) => (
                      <li key={c.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-white">{c.emoji ? `${c.emoji} ` : ''}{c.name}</span>
                          <span className="font-bold tabular-nums text-zinc-700 dark:text-zinc-200">{c.grade === null ? '—' : `${c.grade}%`}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${c.grade ?? 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
