'use client';

import { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Send, Trash2, Wand2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { examSessions, hhmm, planExams, toMinutes, type ExamPlan } from '@/lib/schedule-solver';
import { cn } from '@/lib/utils';
import { PLAN_KEY, type PlanData } from './plan-data';

// Admin → Timetable → Exams (Stage 5 · Q12): the exam days and sittings, the courses with an exam
// and how long each is, the rooms; "Work out exams" gives each exam a sitting so no student has two
// at once (and, when it can, not two on one day), seated in rooms big enough (a big exam across
// several). Publish puts each exam on its students' and teachers' calendars, with the rooms.

const LENGTHS = [60, 90, 120, 150, 180];
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; };
const REASON: Record<string, string> = {
  clash: 'its students have another exam in every sitting left',
  rooms: 'not enough seats free in any sitting',
  length: 'it’s longer than every sitting',
};

export function ExamPlanner({ data }: { data: PlanData }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState('End of term exams');
  const [from, setFrom] = useState(() => isoDay(nextMonday()));
  const [to, setTo] = useState(() => { const d = nextMonday(); d.setDate(d.getDate() + 11); return isoDay(d); });
  const [weekends, setWeekends] = useState(false);
  const [onePerDay, setOnePerDay] = useState(true);
  const [sittings, setSittings] = useState([{ on: true, start: '09:00', end: '12:00', label: 'Morning' }, { on: true, start: '14:00', end: '17:00', label: 'Afternoon' }]);
  const [pick, setPick] = useState<Record<string, { on: boolean; length: number }>>(() => Object.fromEntries(data.courses.map((c) => [c.id, { on: c.students > 0, length: 120 }])));
  const [roomsOn, setRoomsOn] = useState<Record<string, boolean>>(() => Object.fromEntries(data.rooms.map((r) => [r.id, true])));
  const [seed, setSeed] = useState(1);
  const [plan, setPlan] = useState<ExamPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const roomById = useMemo(() => new Map(data.rooms.map((r) => [r.id, r])), [data.rooms]);
  const chosen = data.courses.filter((c) => pick[c.id]?.on);
  const sessions = useMemo(() => examSessions(from, to, sittings.filter((x) => x.on).map((x) => ({ start: toMinutes(x.start), end: toMinutes(x.end) })), weekends), [from, to, sittings, weekends]);
  const reset = () => setPlan(null);

  const work = (nextSeed: number) => {
    if (!sessions.length) return void toast.error('Pick exam days and at least one sitting.');
    setBusy('plan');
    setSeed(nextSeed);
    setTimeout(() => {
      setPlan(planExams(chosen.map((c) => ({ id: c.id, code: c.code, students: c.students, length: pick[c.id].length })), data.rooms.filter((r) => roomsOn[r.id]), data.overlaps, sessions, { onePerDay, seed: nextSeed }));
      setBusy(null);
    }, 30);
  };

  const roomsText = (rooms: { roomId: string; seats: number }[]) => rooms.map((r) => `${roomById.get(r.roomId)?.name ?? 'Room'} (${r.seats})`).join(', ');
  const publish = async () => {
    if (!plan) return;
    const again = data.exams.some((x) => x.name === name.trim());
    if (!(await confirmDialog({ title: again ? `Replace “${name.trim()}”?` : `Publish “${name.trim()}”?`, message: `${plan.placed.length} exams go on the calendars of their students and teachers, with the rooms, and students are told in the app.${again ? ' The exam timetable published before under this name is taken off.' : ''}`, confirmLabel: 'Publish' }))) return;
    setBusy('publish');
    try {
      const exams = plan.placed.map((p) => {
        const s = sessions[p.session];
        const [y, m, d] = s.day.split('-').map(Number);
        const start = new Date(y, m - 1, d, 0, s.start);
        return { courseId: p.courseId, startAt: start.toISOString(), endAt: new Date(start.getTime() + pick[p.courseId].length * 60_000).toISOString(), rooms: roomsText(p.rooms) };
      });
      const out = await authedJson<{ published: number; replaced: number }>('/api/admin/timetable/exams', { method: 'POST', body: JSON.stringify({ name: name.trim(), exams }) });
      toast.success(`${out.published} exams published`, { description: out.replaced ? `Replacing ${out.replaced} published before.` : 'Students see them on their calendar.' });
      setPlan(null);
      void mutate(PLAN_KEY);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const remove = async (batch: string, label: string) => {
    if (!(await confirmDialog({ title: `Take “${label}” off the calendars?`, message: 'Its exams disappear from every student’s and teacher’s calendar.', confirmLabel: 'Take off', destructive: true }))) return;
    setBusy(batch);
    try {
      await authedJson(`/api/admin/timetable/exams?batch=${encodeURIComponent(batch)}`, { method: 'DELETE' });
      toast.success('Exam timetable taken off');
      void mutate(PLAN_KEY);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  // The plan by day, then sitting.
  const byDay = useMemo(() => {
    const out = new Map<string, { s: number; exams: ExamPlan['placed'] }[]>();
    if (!plan) return out;
    sessions.forEach((s, i) => {
      const list = plan.placed.filter((p) => p.session === i);
      if (!list.length) return;
      out.set(s.day, [...(out.get(s.day) ?? []), { s: i, exams: list }]);
    });
    return out;
  }, [plan, sessions]);

  return (
    <div className="space-y-5">
      {data.exams.length > 0 && (
        <section aria-labelledby="ex-published" className="card space-y-2">
          <h2 id="ex-published" className="font-bold text-zinc-900 dark:text-white">Published exam timetables</h2>
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.exams.map((x) => (
              <li key={x.batch} className="py-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 min-w-0 truncate">{x.name}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{x.exams} exams{x.from ? ` · ${format(new Date(x.from), 'd MMM')}` : ''}{x.to ? ` – ${format(new Date(x.to), 'd MMM yyyy')}` : ''}</span>
                <button type="button" onClick={() => void remove(x.batch, x.name)} disabled={!!busy} className="btn-ghost btn-sm text-rose-700 dark:text-rose-300"><Trash2 className="w-4 h-4" />Take off</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ex-when" className="card space-y-3">
        <h2 id="ex-when" className="font-bold text-zinc-900 dark:text-white">When</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 min-w-[12rem]">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="input mt-1" /></label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">First day<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="input mt-1 w-40" /></label>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Last day<input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); reset(); }} className="input mt-1 w-40" /></label>
        </div>
        <div className="flex flex-wrap gap-4">
          {sittings.map((x, i) => (
            <fieldset key={x.label} className="flex flex-wrap items-end gap-2">
              <legend className="sr-only">{x.label} sitting</legend>
              <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200 pb-2"><input type="checkbox" checked={x.on} onChange={(e) => { setSittings(sittings.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y))); reset(); }} className="w-4 h-4 accent-indigo-600" />{x.label}</label>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">From<input type="time" value={x.start} disabled={!x.on} onChange={(e) => { setSittings(sittings.map((y, j) => (j === i ? { ...y, start: e.target.value } : y))); reset(); }} className="input mt-1 w-28" /></label>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">To<input type="time" value={x.end} disabled={!x.on} onChange={(e) => { setSittings(sittings.map((y, j) => (j === i ? { ...y, end: e.target.value } : y))); reset(); }} className="input mt-1 w-28" /></label>
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-800 dark:text-zinc-200">
          <label className="flex items-center gap-2"><input type="checkbox" checked={onePerDay} onChange={(e) => { setOnePerDay(e.target.checked); reset(); }} className="w-4 h-4 accent-indigo-600" />At most one exam a day for each student, when possible</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={weekends} onChange={(e) => { setWeekends(e.target.checked); reset(); }} className="w-4 h-4 accent-indigo-600" />Saturdays and Sundays too</label>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{sessions.length} sitting{sessions.length === 1 ? '' : 's'} on {new Set(sessions.map((s) => s.day)).size} days.</p>
      </section>

      <section aria-labelledby="ex-courses" className="card space-y-3">
        <h2 id="ex-courses" className="font-bold text-zinc-900 dark:text-white">Exams <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">({chosen.length} courses, {chosen.reduce((n, c) => n + c.students, 0)} seats needed)</span></h2>
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06] max-h-[24rem] overflow-y-auto">
          {data.courses.map((c) => {
            const p = pick[c.id] ?? { on: false, length: 120 };
            return (
              <li key={c.id} className="py-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 flex-1 min-w-[12rem]">
                  <input type="checkbox" checked={p.on} onChange={(e) => { setPick({ ...pick, [c.id]: { ...p, on: e.target.checked } }); reset(); }} className="w-4 h-4 accent-indigo-600" />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.code} · {c.name}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400">{c.students} student{c.students === 1 ? '' : 's'}</span></span>
                </label>
                <select aria-label={`Length of the ${c.code} exam`} value={p.length} disabled={!p.on} onChange={(e) => { setPick({ ...pick, [c.id]: { ...p, length: Number(e.target.value) } }); reset(); }} className="input w-auto py-1.5 text-sm">
                  {LENGTHS.map((n) => <option key={n} value={n}>{n >= 60 && n % 60 === 0 ? `${n / 60} h` : `${Math.floor(n / 60)} h ${n % 60} min`}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
        {data.rooms.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Rooms ({data.rooms.filter((r) => roomsOn[r.id]).reduce((n, r) => n + r.capacity, 0)} seats a sitting)</p>
            <div className="flex flex-wrap gap-1.5">
              {data.rooms.map((r) => (
                <button key={r.id} type="button" aria-pressed={!!roomsOn[r.id]} onClick={() => { setRoomsOn((v) => ({ ...v, [r.id]: !v[r.id] })); reset(); }}
                  className={cn('px-3 py-1.5 rounded-full text-sm border', roomsOn[r.id] ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 line-through')}>
                  {r.name} · {r.capacity}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => work(seed)} disabled={!!busy || !chosen.length} className="btn-primary">{busy === 'plan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Work out exams</button>
        {plan && <button type="button" onClick={() => work(seed + 1)} disabled={!!busy} className="btn-secondary"><RefreshCw className="w-4 h-4" />Try another</button>}
      </div>

      {plan && (
        <section aria-labelledby="ex-result" aria-live="polite" className="space-y-3">
          <div className={cn('rounded-2xl p-4 flex gap-3 items-start', plan.unplaced.length || plan.sameDay ? 'bg-amber-500/10 text-amber-900 dark:text-amber-100' : 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-100')}>
            {plan.unplaced.length || plan.sameDay ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="text-sm space-y-1">
              <h2 id="ex-result" className="font-semibold">{plan.placed.length} of {chosen.length} exams placed</h2>
              <p>No student has two exams at once{plan.sameDay ? `; ${plan.sameDay} time${plan.sameDay === 1 ? '' : 's'} a student has two on one day (add days or sittings to avoid it)` : onePerDay ? ', and nobody has two on one day' : ''}.</p>
              {plan.unplaced.map((u) => <p key={u.courseId}><b>{byId.get(u.courseId)?.code}</b> left out: {REASON[u.reason]}.</p>)}
            </div>
          </div>
          <ol className="space-y-3">
            {[...byDay.entries()].map(([day, list]) => (
              <li key={day} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-3">
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white mb-2">{format(new Date(`${day}T12:00:00`), 'EEEE d MMMM')}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map(({ s, exams }) => (
                    <div key={s}>
                      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1 tabular-nums">{hhmm(sessions[s].start)}–{hhmm(sessions[s].end)}</p>
                      <ul className="space-y-1">
                        {exams.map((p) => (
                          <li key={p.courseId} className="rounded-lg px-2 py-1.5 text-xs bg-zinc-50 dark:bg-white/[0.03]">
                            <p className="font-semibold text-zinc-900 dark:text-white">{byId.get(p.courseId)?.code} · {byId.get(p.courseId)?.students} students · {pick[p.courseId].length} min</p>
                            <p className="text-zinc-700 dark:text-zinc-300">{p.rooms.length ? roomsText(p.rooms) : 'No room'}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void publish()} disabled={!!busy || !plan.placed.length || !name.trim()} className="btn-primary">{busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Publish</button>
        </section>
      )}
    </div>
  );
}
