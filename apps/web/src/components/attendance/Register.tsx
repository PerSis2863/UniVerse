'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { AlertTriangle, CheckCheck, CheckCircle2, Clock, FileCheck2, Loader2, ShieldCheck, Video, XCircle, type LucideIcon } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { MARKS, type Mark } from '@/lib/attendance-rules';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The teacher's register (Stage 5 · Q11): each student's mark for the day, their record and last
// days, everyone present at once, the selected ones marked together, keyboard marking (↑ ↓ to move,
// P L A E to mark), and a suggestion from the day's class call to check before saving.

export interface Student { id: string; name: string; email: string; mark: Mark | null; record: { attended: number; counted: number; rate: number | null }; recent: Mark[]; chronic: boolean }
export interface RegisterData { course: { id: string; code: string; name: string }; day: string; students: Student[]; pendingExcuses: number; seating: { rows: number; cols: number; seats: Record<string, string> } }

export const MARK_UI: Record<Mark, { label: string; key: string; icon: LucideIcon; on: string; dot: string }> = {
  PRESENT: { label: 'Present', key: 'P', icon: CheckCircle2, on: 'bg-emerald-600 text-white border-transparent', dot: 'bg-emerald-500' },
  LATE: { label: 'Late', key: 'L', icon: Clock, on: 'bg-amber-500 text-zinc-950 border-transparent', dot: 'bg-amber-500' },
  ABSENT: { label: 'Absent', key: 'A', icon: XCircle, on: 'bg-rose-600 text-white border-transparent', dot: 'bg-rose-500' },
  EXCUSED: { label: 'Excused', key: 'E', icon: ShieldCheck, on: 'bg-sky-600 text-white border-transparent', dot: 'bg-sky-500' },
};

export function useRegister(courseId: string, day: string) {
  return useSWR<RegisterData>(courseId ? `/api/attendance/register/${courseId}?day=${day}` : null, authedJson, { revalidateOnFocus: true });
}

export function Register({ courseId, day, data, mutate }: { courseId: string; day: string; data: RegisterData | undefined; mutate: () => Promise<unknown> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState('0.75');
  const [suggest, setSuggest] = useState<Map<string, { seconds: number; mark: Mark }> | null>(null);
  const [callLength, setCallLength] = useState(0);
  const rows = useRef<HTMLDivElement>(null);
  const students = useMemo(() => data?.students ?? [], [data]);

  // A new class or day starts with nothing selected and no suggestion.
  const [shownFor, setShownFor] = useState(`${courseId}:${day}`);
  if (shownFor !== `${courseId}:${day}`) { setShownFor(`${courseId}:${day}`); setSelected(new Set()); setSuggest(null); setFocus(0); }

  const save = async (marks: { studentId: string; status: Mark }[], told?: string) => {
    if (!marks.length) return;
    setBusy(true);
    try {
      const r = await authedJson<{ marked: number }>(`/api/attendance/register/${courseId}`, { method: 'POST', body: JSON.stringify({ day, marks }) });
      await mutate();
      toast.success(told ?? `Marked ${r.marked}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const markOne = (id: string, status: Mark) => void save([{ studentId: id, status }], `${students.find((s) => s.id === id)?.name.split(' ')[0] ?? 'Student'}: ${MARK_UI[status].label}`);

  const fromCall = async () => {
    setBusy(true);
    try {
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* the server's guess */ }
      const r = await authedJson<{ length: number; suggestions: { studentId: string; seconds: number; suggest: Mark }[] }>(`/api/attendance/register/${courseId}/call?day=${day}&tz=${encodeURIComponent(tz)}&threshold=${threshold}`);
      if (!r.length) { toast('No class call that day', { description: 'When the class meets in a call on UniVerse, this fills in who was there.' }); setSuggest(null); return; }
      setCallLength(r.length);
      setSuggest(new Map(r.suggestions.map((s) => [s.studentId, { seconds: s.seconds, mark: s.suggest }])));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  // Keyboard marking on the list: ↑ ↓ move, P L A E mark (and move on), space selects.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!students.length || (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') return;
    const k = e.key.toUpperCase();
    const at = Math.min(focus, students.length - 1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(0, Math.min(students.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
    const m = MARKS.find((x) => MARK_UI[x].key === k);
    if (m && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); markOne(students[at].id, m); setFocus(Math.min(students.length - 1, at + 1)); return; }
    if (e.key === ' ' && (e.target as HTMLElement).dataset.row) { e.preventDefault(); toggle(students[at].id); }
  };
  useEffect(() => { rows.current?.querySelector<HTMLElement>(`[data-row="${focus}"]`)?.focus({ preventScroll: false }); }, [focus]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = students.length > 0 && selected.size === students.length;

  if (!data) return <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 rounded-2xl skeleton" />)}</div>;
  if (!students.length) return <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">No students in this course yet.</p>;

  const counts = MARKS.map((m) => [m, students.filter((s) => s.mark === m).length] as const);
  const unmarked = students.filter((s) => !s.mark).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {counts.map(([m, n]) => <span key={m} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-200"><span className={cn('w-2 h-2 rounded-full', MARK_UI[m].dot)} />{MARK_UI[m].label} {n}</span>)}
        {unmarked > 0 && <span className="text-zinc-600 dark:text-zinc-400">{unmarked} not marked</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void save(students.filter((s) => !s.mark).map((s) => ({ studentId: s.id, status: 'PRESENT' as Mark })), 'Everyone else marked present')} className="btn-primary btn-sm"><CheckCheck className="w-4 h-4" />Everyone else present</button>
        <div className="inline-flex items-center gap-1">
          <button type="button" disabled={busy} onClick={() => void fromCall()} className="btn-secondary btn-sm"><Video className="w-4 h-4" />From the class call</button>
          <label className="sr-only" htmlFor="call-threshold">Present from</label>
          <select id="call-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="input py-1 w-auto text-xs" title="Present when in the call for at least">
            <option value="0.5">50 %</option><option value="0.75">75 %</option><option value="0.9">90 %</option>
          </select>
        </div>
        {selected.size > 0 && (
          <div className="inline-flex items-center gap-1 ml-auto" role="group" aria-label={`Mark the ${selected.size} selected`}>
            <span className="text-xs text-zinc-700 dark:text-zinc-300 mr-1">{selected.size} selected:</span>
            {MARKS.map((m) => <button key={m} type="button" disabled={busy} onClick={() => { void save([...selected].map((id) => ({ studentId: id, status: m }))); setSelected(new Set()); }} className="btn-secondary btn-sm">{MARK_UI[m].label}</button>)}
          </div>
        )}
      </div>

      {suggest && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.06] p-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-800 dark:text-zinc-200 flex-1 min-w-[12rem]">From the {Math.round(callLength / 60)}-minute class call: {MARKS.slice(0, 3).map((m) => `${[...suggest.values()].filter((s) => s.mark === m).length} ${MARK_UI[m].label.toLowerCase()}`).join(', ')}. Check the list, then save.</p>
          <button type="button" disabled={busy} onClick={() => { void save([...suggest].map(([studentId, s]) => ({ studentId, status: s.mark })), 'Saved from the class call'); setSuggest(null); }} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save these</button>
          <button type="button" onClick={() => setSuggest(null)} className="btn-secondary btn-sm">Dismiss</button>
        </motion.div>
      )}

      <p className="text-xs text-zinc-600 dark:text-zinc-400 hidden sm:block">Keyboard: ↑ ↓ to move, <kbd>P</kbd> present, <kbd>L</kbd> late, <kbd>A</kbd> absent, <kbd>E</kbd> excused, space to select.</p>

      <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-50 dark:bg-white/[0.03] text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" aria-label="Select everyone" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))} className="w-4 h-4 accent-indigo-600" />
          <span className="flex-1">Student</span>
          <span className="hidden md:block w-40">Record</span>
          <span className="w-[13.5rem] text-right">Today</span>
        </div>
        <div ref={rows} role="list" aria-label={`${data.course.code} register for ${day}`}>
          {students.map((s, i) => {
            const sug = suggest?.get(s.id);
            const rate = s.record.rate;
            return (
              <div key={s.id} role="listitem" data-row={i} tabIndex={i === focus ? 0 : -1} onFocus={() => setFocus(i)}
                className={cn('flex items-center gap-3 px-3 py-2.5 border-t border-zinc-200/70 dark:border-white/[0.06] outline-none focus-visible:bg-indigo-500/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500', selected.has(s.id) && 'bg-indigo-500/[0.05]')}>
                <input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4 accent-indigo-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                    {s.name}
                    {s.chronic && <span title="Absent often lately" className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="w-3.5 h-3.5" />Often absent</span>}
                  </p>
                  {sug && <p className="text-xs text-indigo-700 dark:text-indigo-300">Call: {Math.round(sug.seconds / 60)} min → {MARK_UI[sug.mark].label}</p>}
                  <p className="md:hidden text-xs text-zinc-600 dark:text-zinc-400">{rate == null ? 'No record yet' : `${Math.round(rate * 100)} % attended`}</p>
                </div>
                <div className="hidden md:flex w-40 items-center gap-2">
                  <span className="text-xs tabular-nums text-zinc-700 dark:text-zinc-300 w-10">{rate == null ? '—' : `${Math.round(rate * 100)}%`}</span>
                  <span className="flex gap-0.5" aria-label={`Last days: ${s.recent.map((m) => MARK_UI[m].label).join(', ') || 'none'}`} role="img">
                    {[...s.recent].reverse().map((m, k) => <span key={k} className={cn('w-2 h-4 rounded-sm', MARK_UI[m].dot)} />)}
                  </span>
                </div>
                <div className="flex gap-1" role="group" aria-label={`${s.name}: ${s.mark ? MARK_UI[s.mark].label : 'not marked'}`}>
                  {MARKS.map((m) => {
                    const Icon = MARK_UI[m].icon;
                    const on = s.mark === m;
                    return (
                      <button key={m} type="button" tabIndex={-1} aria-pressed={on} aria-label={`${MARK_UI[m].label}: ${s.name}`} title={`${MARK_UI[m].label} (${MARK_UI[m].key})`} disabled={busy} onClick={() => markOne(s.id, m)}
                        className={cn('w-12 h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-colors', on ? MARK_UI[m].on : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]', sug?.mark === m && !on && 'ring-2 ring-indigo-400')}>
                        <Icon className="w-4 h-4" /><span className="hidden lg:inline">{MARK_UI[m].key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {data.pendingExcuses > 0 && <p className="text-sm text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5"><FileCheck2 className="w-4 h-4 text-sky-600" />{data.pendingExcuses} excuse request{data.pendingExcuses === 1 ? '' : 's'} waiting: see Excuses.</p>}
    </div>
  );
}
