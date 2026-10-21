'use client';

import { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import Link from '@/components/ui/Link';
import { courseColor } from '@/lib/course-color';
import { findConflicts, hhmm, planWeek, toMinutes, type WeekPlan } from '@/lib/schedule-solver';
import { cn } from '@/lib/utils';
import { DAY_NAMES, DAY_SHORT, PLAN_KEY, type PlanData } from './plan-data';

// Admin → Timetable → Plan a week (Stage 5 · Q12): pick the courses, how many classes a week and how
// long, the rooms and the school day; "Work out a week" places every class where its teacher, its
// students (anyone shared with another course) and a room big enough are free, in this browser.
// Look it over, try another, and "Use this timetable" saves it for those courses.

interface Row { include: boolean; sessions: number; length: number }
const NEW_ROW: Row = { include: false, sessions: 2, length: 60 };
const LENGTHS = [45, 50, 60, 90, 120];
const REASON: Record<string, string> = {
  teacher: 'its teacher is busy at every time left',
  students: 'its students have another class at every time left',
  time: 'no time in the day is long enough',
};

export function WeekPlanner({ data }: { data: PlanData }) {
  const { mutate } = useSWRConfig();
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [lunch, setLunch] = useState(true);
  const [breakAt, setBreakAt] = useState({ from: '12:00', to: '13:00' });
  const [dept, setDept] = useState('');
  // Each course's classes a week and their length, from today's timetable (2 × 60 minutes when it has none).
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(data.courses.map((c) => {
    const mine = data.slots.filter((s) => s.courseId === c.id);
    const length = mine.length ? toMinutes(mine[0].endTime) - toMinutes(mine[0].startTime) : 60;
    return [c.id, { include: mine.length > 0 || c.students > 0, sessions: mine.length || 2, length: LENGTHS.includes(length) ? length : 60 }];
  })));
  const [roomsOn, setRoomsOn] = useState<Record<string, boolean>>(() => Object.fromEntries(data.rooms.map((r) => [r.id, true])));
  const [seed, setSeed] = useState(1);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [busy, setBusy] = useState<'plan' | 'save' | null>(null);

  const departments = useMemo(() => [...new Set(data.courses.map((c) => c.department).filter((d): d is string => !!d))].sort(), [data.courses]);
  const shown = data.courses.filter((c) => !dept || c.department === dept);
  const chosen = shown.filter((c) => rows[c.id]?.include && rows[c.id].sessions > 0);
  const byId = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const roomById = useMemo(() => new Map(data.rooms.map((r) => [r.id, r])), [data.rooms]);
  const setRow = (id: string, patch: Partial<Row>) => { setRows((r) => ({ ...r, [id]: { ...NEW_ROW, ...r[id], ...patch } })); setPlan(null); };

  const work = (nextSeed: number) => {
    const s0 = toMinutes(start), s1 = toMinutes(end);
    if (!(s1 > s0) || !days.length) return void toast.error('Pick the days and a school day that ends after it starts.');
    setBusy('plan');
    setSeed(nextSeed);
    // A moment for the spinner to show; a big school takes about a second.
    setTimeout(() => {
      const ids = new Set(chosen.map((c) => c.id));
      const fixed = data.slots.filter((s) => !ids.has(s.courseId)).map((s) => ({ courseId: s.courseId, day: s.dayOfWeek, start: toMinutes(s.startTime), end: toMinutes(s.endTime), roomId: s.roomId, teacherId: byId.get(s.courseId)?.teacherId ?? null }));
      const p = planWeek(
        chosen.map((c) => ({ id: c.id, code: c.code, teacherId: c.teacherId, students: c.students, sessions: rows[c.id].sessions, length: rows[c.id].length })),
        data.rooms.filter((r) => roomsOn[r.id]),
        data.overlaps,
        { days, start: s0, end: s1, breakStart: lunch ? toMinutes(breakAt.from) : null, breakEnd: lunch ? toMinutes(breakAt.to) : null, step: 30 },
        { seed: nextSeed, fixed },
      );
      setPlan(p);
      setBusy(null);
    }, 30);
  };

  const conflicts = useMemo(() => {
    if (!plan) return [];
    const caps = new Map(data.rooms.map((r) => [r.id, { capacity: r.capacity }]));
    return findConflicts(plan.slots, new Map(data.courses.map((c) => [c.id, { teacherId: c.teacherId, students: c.students }])), caps, data.overlaps);
  }, [plan, data]);
  const flagged = new Set(conflicts.map((c) => c.a));

  const save = async () => {
    if (!plan) return;
    const ok = await confirmDialog({
      title: `Use this timetable for ${chosen.length} course${chosen.length === 1 ? '' : 's'}?`,
      message: 'Their classes are replaced by this week (a class already at the same time and room stays). Students and teachers see it on their timetable straight away. Other courses don’t change.',
      confirmLabel: 'Use this timetable',
    });
    if (!ok) return;
    setBusy('save');
    try {
      const out = await authedJson<{ added: number; removed: number; kept: number }>(PLAN_KEY, {
        method: 'POST',
        body: JSON.stringify({ courseIds: chosen.map((c) => c.id), slots: plan.slots.map((s) => ({ courseId: s.courseId, dayOfWeek: s.day, startTime: hhmm(s.start), endTime: hhmm(s.end), roomId: s.roomId, type: s.type })) }),
      });
      toast.success('Timetable saved', { description: `${out.added} classes added, ${out.kept} kept, ${out.removed} taken off.` });
      setPlan(null);
      void mutate(PLAN_KEY);
      void mutate('/api/admin/timetable');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const missing = plan?.unplaced.reduce((n, u) => n + u.missing, 0) ?? 0;
  const wanted = chosen.reduce((n, c) => n + rows[c.id].sessions, 0);

  return (
    <div className="space-y-5">
      <section aria-labelledby="wk-day" className="card space-y-3">
        <h2 id="wk-day" className="font-bold text-zinc-900 dark:text-white">The school week</h2>
        <div role="group" aria-label="School days" className="flex flex-wrap gap-1.5">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => { setDays((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i].sort())); setPlan(null); }}
              className={cn('px-3 py-1.5 rounded-full text-sm border', days.includes(i) ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-300 dark:border-white/15 text-zinc-800 dark:text-zinc-200')}>
              <span aria-hidden>{d}</span><span className="sr-only">{DAY_NAMES[i]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Day starts<input type="time" value={start} onChange={(e) => { setStart(e.target.value); setPlan(null); }} className="input mt-1 w-32" /></label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Day ends<input type="time" value={end} onChange={(e) => { setEnd(e.target.value); setPlan(null); }} className="input mt-1 w-32" /></label>
          <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200 pb-2"><input type="checkbox" checked={lunch} onChange={(e) => { setLunch(e.target.checked); setPlan(null); }} className="w-4 h-4 accent-indigo-600" />A break</label>
          {lunch && <>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Break from<input type="time" value={breakAt.from} onChange={(e) => { setBreakAt({ ...breakAt, from: e.target.value }); setPlan(null); }} className="input mt-1 w-32" /></label>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">to<input type="time" value={breakAt.to} onChange={(e) => { setBreakAt({ ...breakAt, to: e.target.value }); setPlan(null); }} className="input mt-1 w-32" /></label>
          </>}
        </div>
      </section>

      <section aria-labelledby="wk-courses" className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="wk-courses" className="font-bold text-zinc-900 dark:text-white flex-1">Courses <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">({chosen.length} chosen, {wanted} classes a week)</span></h2>
          {departments.length > 0 && (
            <select aria-label="Department" value={dept} onChange={(e) => { setDept(e.target.value); setPlan(null); }} className="input w-48 py-1.5 text-sm">
              <option value="">Every department</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
        {!shown.length ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No courses yet. Create them under Management → Courses.</p> : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06] max-h-[28rem] overflow-y-auto -mx-1 px-1">
            {shown.map((c) => {
              const r = rows[c.id] ?? NEW_ROW;
              return (
                <li key={c.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <label className="flex items-center gap-2 min-w-0 flex-1 basis-56">
                    <input type="checkbox" checked={r.include} onChange={(e) => setRow(c.id, { include: e.target.checked })} className="w-4 h-4 accent-indigo-600 shrink-0" />
                    <span aria-hidden className="w-1.5 h-8 rounded-full shrink-0" style={{ background: courseColor(c.color, c.code) }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.code} · {c.name}</span>
                      <span className="block text-xs text-zinc-600 dark:text-zinc-400 truncate">{c.teacher ?? 'No teacher'} · {c.students} student{c.students === 1 ? '' : 's'}</span>
                    </span>
                  </label>
                  <select aria-label={`Classes a week for ${c.code}`} value={r.sessions} disabled={!r.include} onChange={(e) => setRow(c.id, { sessions: Number(e.target.value) })} className="input w-auto py-1.5 text-sm">
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} a week</option>)}
                  </select>
                  <select aria-label={`Length of each class for ${c.code}`} value={r.length} disabled={!r.include} onChange={(e) => setRow(c.id, { length: Number(e.target.value) })} className="input w-auto py-1.5 text-sm">
                    {LENGTHS.map((n) => <option key={n} value={n}>{n} min</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="wk-rooms" className="card space-y-2">
        <h2 id="wk-rooms" className="font-bold text-zinc-900 dark:text-white">Rooms</h2>
        {!data.rooms.length ? <p className="text-sm text-zinc-600 dark:text-zinc-400">No rooms yet, so classes are placed without one. <Link href="/admin/monitoring/rooms" className="underline font-medium">Add rooms with their seats</Link> to have them chosen by size.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {data.rooms.map((r) => (
              <button key={r.id} type="button" aria-pressed={!!roomsOn[r.id]} onClick={() => { setRoomsOn((v) => ({ ...v, [r.id]: !v[r.id] })); setPlan(null); }}
                className={cn('px-3 py-1.5 rounded-full text-sm border', roomsOn[r.id] ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 line-through')}>
                {r.name} · {r.capacity} seats
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => work(seed)} disabled={!!busy || !chosen.length} className="btn-primary">{busy === 'plan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Work out a week</button>
        {plan && <button type="button" onClick={() => work(seed + 1)} disabled={!!busy} className="btn-secondary"><RefreshCw className="w-4 h-4" />Try another</button>}
      </div>

      {plan && (
        <section aria-labelledby="wk-result" aria-live="polite" className="space-y-3">
          <div className={cn('rounded-2xl p-4 flex gap-3 items-start', missing || plan.roomless ? 'bg-amber-500/10 text-amber-900 dark:text-amber-100' : 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-100')}>
            {missing || plan.roomless ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="text-sm space-y-1">
              <h2 id="wk-result" className="font-semibold">{plan.slots.length} of {wanted} classes placed{missing ? `, ${missing} couldn’t fit` : ''}{plan.roomless ? `, ${plan.roomless} without a room` : ''}</h2>
              <p>No teacher, room or student is in two places at once.{conflicts.some((c) => c.kind === 'noroom') ? ' Classes marked “No room” had no room big enough free at that time.' : ''}</p>
              {plan.unplaced.map((u) => <p key={u.courseId}><b>{byId.get(u.courseId)?.code}</b>: {u.missing} class{u.missing === 1 ? '' : 'es'} left out, {REASON[u.reason]}.</p>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {days.map((d) => {
              const list = plan.slots.map((s, i) => ({ s, i })).filter((x) => x.s.day === d).sort((a, b) => a.s.start - b.s.start);
              return (
                <section key={d} aria-label={DAY_NAMES[d]} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-3">
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-white mb-2">{DAY_NAMES[d]}</h3>
                  {!list.length ? <p className="text-xs text-zinc-600 dark:text-zinc-400">Nothing new</p> : (
                    <ul className="space-y-1.5">
                      {list.map(({ s, i }) => {
                        const c = byId.get(s.courseId);
                        return (
                          <li key={i} className={cn('rounded-lg px-2 py-1.5 text-xs border-s-4 bg-zinc-50 dark:bg-white/[0.03]', flagged.has(i) && 'bg-amber-500/10 ring-1 ring-amber-500/50')} style={{ borderLeftColor: courseColor(c?.color, c?.code ?? '') }}>
                            <p className="font-semibold text-zinc-900 dark:text-white tabular-nums">{hhmm(s.start)}–{hhmm(s.end)} · {c?.code}</p>
                            <p className="text-zinc-700 dark:text-zinc-300 truncate">{s.roomId ? roomById.get(s.roomId)?.name : <span className="font-semibold text-amber-800 dark:text-amber-200">No room</span>}{c?.teacher ? ` · ${c.teacher}` : ''}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          <button type="button" onClick={() => void save()} disabled={!!busy || !plan.slots.length} className="btn-primary">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}Use this timetable</button>
        </section>
      )}
    </div>
  );
}
