'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Check, FileText, Loader2, Minus, Plus, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { MARKS, type Mark } from '@/lib/attendance-rules';
import { cn } from '@/lib/utils';
import { MARK_UI, type RegisterData } from './Register';

// The seating chart (Stage 5 · Q11): the room as a grid; tap a seat to put the chosen student in
// it, and while taking the register tap a student's seat to move their mark on (Present → Late →
// Absent → Excused). And the excuse requests waiting for the teacher.

const next = (m: Mark | null): Mark => (m ? MARKS[(MARKS.indexOf(m) + 1) % MARKS.length] : 'PRESENT');

export function SeatingChart({ courseId, day, data, mutate }: { courseId: string; day: string; data: RegisterData; mutate: () => Promise<unknown> }) {
  const [arranging, setArranging] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { rows, cols, seats } = data.seating;
  const byId = new Map(data.students.map((s) => [s.id, s]));
  const seated = new Set(Object.values(seats));
  const unseated = data.students.filter((s) => !seated.has(s.id));

  const saveLayout = async (layout: { rows: number; cols: number; seats: Record<string, string> }) => {
    setBusy(true);
    try { await authedJson(`/api/attendance/register/${courseId}/seating`, { method: 'PUT', body: JSON.stringify(layout) }); await mutate(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const mark = async (studentId: string, status: Mark) => {
    setBusy(true);
    try { await authedJson(`/api/attendance/register/${courseId}`, { method: 'POST', body: JSON.stringify({ day, marks: [{ studentId, status }] }) }); await mutate(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const tapSeat = (key: string) => {
    const who = seats[key];
    if (!arranging) { if (who) void mark(who, next(byId.get(who)?.mark ?? null)); return; }
    const s = { ...seats };
    if (pick) { for (const [k, v] of Object.entries(s)) if (v === pick) delete s[k]; s[key] = pick; setPick(null); }
    else if (who) delete s[key];
    else return;
    void saveLayout({ rows, cols, seats: s });
  };
  const resize = (dr: number, dc: number) => void saveLayout({ rows: Math.min(12, Math.max(1, rows + dr)), cols: Math.min(12, Math.max(1, cols + dc)), seats });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={arranging} onClick={() => { setArranging((v) => !v); setPick(null); }} className={arranging ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>{arranging ? 'Done arranging' : 'Arrange seats'}</button>
        {arranging && (
          <>
            <span className="text-xs text-zinc-700 dark:text-zinc-300">Rows</span>
            <button type="button" aria-label="One row fewer" onClick={() => resize(-1, 0)} className="btn-secondary btn-sm px-2"><Minus className="w-3.5 h-3.5" /></button>
            <span className="text-sm tabular-nums">{rows}</span>
            <button type="button" aria-label="One row more" onClick={() => resize(1, 0)} className="btn-secondary btn-sm px-2"><Plus className="w-3.5 h-3.5" /></button>
            <span className="text-xs text-zinc-700 dark:text-zinc-300 ms-2">Seats a row</span>
            <button type="button" aria-label="One seat fewer a row" onClick={() => resize(0, -1)} className="btn-secondary btn-sm px-2"><Minus className="w-3.5 h-3.5" /></button>
            <span className="text-sm tabular-nums">{cols}</span>
            <button type="button" aria-label="One seat more a row" onClick={() => resize(0, 1)} className="btn-secondary btn-sm px-2"><Plus className="w-3.5 h-3.5" /></button>
          </>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{arranging ? 'Pick a student below, then tap their seat. Tap a taken seat (with nobody picked) to empty it.' : 'Tap a student’s seat to mark them: Present, then Late, Absent, Excused.'}</p>
      <div className="overflow-x-auto">
        <div className="text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Front of the room</div>
        <div className="grid gap-1.5 mx-auto w-max" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 6rem))` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const key = `${Math.floor(i / cols)}-${i % cols}`;
            const s = seats[key] ? byId.get(seats[key]) : undefined;
            return (
              <button key={key} type="button" disabled={busy || (!arranging && !s)} onClick={() => tapSeat(key)}
                aria-label={s ? undefined : `Empty seat, row ${Math.floor(i / cols) + 1}`}
                className={cn('h-14 rounded-xl border text-xs px-1 flex flex-col items-center justify-center leading-tight transition-colors',
                  s ? (s.mark ? MARK_UI[s.mark].on : 'border-zinc-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-white') : 'border-dashed border-zinc-300 dark:border-white/10 text-zinc-500',
                  arranging && pick && !s && 'ring-2 ring-indigo-400')}>
                {s ? <><span className="font-semibold truncate max-w-full"><span aria-hidden>{s.name.split(' ')[0]}</span><span className="sr-only">{s.name}</span></span><span className="truncate max-w-full opacity-90">{s.mark ? MARK_UI[s.mark].label : <><span aria-hidden>—</span><span className="sr-only">not marked</span></>}</span></> : arranging ? 'Empty' : ''}
              </button>
            );
          })}
        </div>
      </div>
      {arranging && unseated.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Without a seat</p>
          <div className="flex flex-wrap gap-1.5">
            {unseated.map((s) => <button key={s.id} type="button" aria-pressed={pick === s.id} onClick={() => setPick(pick === s.id ? null : s.id)} className={cn('px-2.5 py-1 rounded-full text-sm border', pick === s.id ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200')}>{s.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

interface Excuse { id: string; date: string; reason: string; fileUrl: string | null; fileName: string | null; status: string; note: string | null; student: { id: string; name: string } }

export function ExcuseRequests({ courseId, onChanged }: { courseId: string; onChanged: () => void }) {
  const { data, mutate } = useSWR<Excuse[]>(`/api/attendance/register/${courseId}/excuses`, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await authedJson(`/api/attendance/excuses/${id}`, { method: 'POST', body: JSON.stringify({ approve, note: notes[id] || undefined }) });
      toast.success(approve ? 'Excused' : 'Declined');
      await mutate();
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  if (!data) return <div className="h-24 rounded-2xl skeleton" />;
  if (!data.length) return <p className="py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">No excuse requests.</p>;
  return (
    <ul className="space-y-2">
      {data.map((x) => (
        <li key={x.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-3 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{x.student.name}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{format(new Date(x.date), 'EEE d MMM yyyy')}</p>
            <span className={cn('ms-auto text-xs font-semibold px-2 py-0.5 rounded-full', x.status === 'PENDING' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : x.status === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300')}>{x.status === 'PENDING' ? 'Waiting' : x.status === 'APPROVED' ? 'Excused' : 'Declined'}</span>
          </div>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{x.reason}</p>
          {x.fileUrl && <a href={x.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-indigo-700 dark:text-indigo-300 underline"><FileText className="w-4 h-4" />{x.fileName ?? 'The document'}</a>}
          {x.status === 'PENDING' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={notes[x.id] ?? ''} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} maxLength={300} placeholder="A note for the student (optional)" aria-label={`Note for ${x.student.name}`} className="input py-1.5 text-sm flex-1 min-w-[12rem]" />
              <button type="button" disabled={busy === x.id} onClick={() => void decide(x.id, true)} className="btn-primary btn-sm"><Check className="w-4 h-4" />Excuse</button>
              <button type="button" disabled={busy === x.id} onClick={() => void decide(x.id, false)} className="btn-secondary btn-sm"><X className="w-4 h-4" />Decline</button>
            </div>
          ) : x.note && <p className="text-xs text-zinc-600 dark:text-zinc-400">Your note: {x.note}</p>}
        </li>
      ))}
    </ul>
  );
}
