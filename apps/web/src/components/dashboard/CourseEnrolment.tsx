'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Clock, Loader2, Plus, Trash2, UserMinus, Users, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';

// Who's in the course (Stage 5 · B2, src/server/course-enrolment.ts), for its teaching team: the
// class-size limit, students asking to join, the waitlist (let in oldest first as places open), and
// sections. Changes are for the teacher and co-teachers; assistants see it.

interface Person { id: string; name: string; email: string; avatar: string | null }
/** Extra days on assignments and extra time on timed quizzes, used in every course (Stage 5 · B3.1). */
interface Accommodation { extraDays: number; extraTimePct: number; note: string | null }
const extraText = (a: Accommodation) => [a.extraDays ? `+${a.extraDays} day${a.extraDays === 1 ? '' : 's'}` : '', a.extraTimePct ? `+${a.extraTimePct}% time` : ''].filter(Boolean).join(' · ');
interface View {
  canManage: boolean;
  capacity: number | null;
  students: (Person & { sectionId: string | null; accommodation?: Accommodation | null })[];
  requests: { id: string; note: string | null; createdAt: string; student: Person }[];
  waitlist: { id: string; position: number; createdAt: string; student: Person }[];
  sections: { id: string; name: string; students: number }[];
}

export function CourseEnrolment({ courseId, onChanged }: { courseId: string; onChanged?: () => void }) {
  const key = `/api/courses/${courseId}/enrolment`;
  const { data, error, mutate } = useSWR<View>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [section, setSection] = useState('');
  const [extra, setExtra] = useState<{ id: string; name: string; a: Accommodation } | null>(null);

  const act = async (body: Record<string, unknown>, label: string, ok?: string) => {
    setBusy(label);
    try {
      const out = await authedJson<{ enrolled?: boolean; position?: number | null; letIn?: number }>(key, { method: 'POST', body: JSON.stringify(body) });
      await mutate();
      onChanged?.();
      if (out.enrolled === false) toast(`The class is full: they’re number ${out.position} on the waitlist`);
      else if (out.letIn) toast.success(`${out.letIn} from the waitlist let in`);
      else if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work. Try again.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'The class list couldn’t load.')}</p>;
  if (!data) return <div className="h-24 rounded-2xl skeleton" />;
  const { canManage } = data;
  const capValue = cap ?? (data.capacity === null ? '' : String(data.capacity));
  const full = data.capacity !== null && data.students.length >= data.capacity;

  return (
    <section aria-labelledby="class-list-h" className="panel p-4 space-y-4 mb-6">
      <h3 id="class-list-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" /> Class list</h3>
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm text-zinc-800 dark:text-zinc-200"><span className="font-semibold tabular-nums">{data.students.length}</span>{data.capacity !== null ? ` of ${data.capacity}` : ''} student{data.students.length === 1 ? '' : 's'}{full ? ' · full' : ''}</p>
        {canManage && (
          <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: 'capacity', capacity: capValue.trim() ? Number(capValue) : null }, 'cap', 'Class size saved')) setCap(null); }}>
            <label className="text-xs text-zinc-700 dark:text-zinc-300"><span className="block mb-1">Class size limit (empty: none)</span>
              <input type="number" inputMode="numeric" min={1} max={2000} value={capValue} onChange={(e) => setCap(e.target.value)} className="input w-28 py-1.5" />
            </label>
            <button type="submit" disabled={busy === 'cap' || cap === null} className="btn-secondary btn-sm">{busy === 'cap' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
          </form>
        )}
      </div>

      {data.requests.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Asking to join ({data.requests.length})</h4>
          <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {data.requests.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-3 flex-wrap">
                <Avatar name={r.student.name} src={r.student.avatar} size={32} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{r.student.name}</span>{r.note && <span className="block text-xs text-zinc-600 dark:text-zinc-400 truncate">“{r.note}”</span>}</span>
                {canManage && <>
                  <button type="button" disabled={!!busy} onClick={() => void act({ action: 'accept', requestId: r.id }, `a-${r.id}`, `${r.student.name} is in`)} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" /> {full ? 'Accept (waitlist)' : 'Accept'}</button>
                  <button type="button" disabled={!!busy} onClick={() => void act({ action: 'decline', requestId: r.id }, `d-${r.id}`, 'Declined')} className="btn-secondary btn-sm"><X className="w-3.5 h-3.5" /> Decline</button>
                </>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.waitlist.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Waitlist ({data.waitlist.length})</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">They’re let in, in this order, when a place opens.</p>
          <ol className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {data.waitlist.map((w) => (
              <li key={w.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className="w-6 text-xs font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">{w.position}</span>
                <Avatar name={w.student.name} src={w.student.avatar} size={32} />
                <span className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-white truncate">{w.student.name}</span>
                {canManage && <button type="button" disabled={!!busy} onClick={() => void act({ action: 'accept', requestId: w.id, force: true }, `f-${w.id}`, `${w.student.name} is in`)} className="btn-secondary btn-sm">Let in now</button>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Sections</h4>
        {data.sections.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.sections.map((s) => (
              <li key={s.id} className="text-xs ps-3 pe-1 py-1 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1">
                <span className="font-semibold">{s.name}</span> · {s.students}
                {canManage && <>
                  <button type="button" aria-label={`Rename ${s.name}`} onClick={async () => { const name = await promptDialog({ title: 'Rename section', defaultValue: s.name, maxLength: 60, confirmLabel: 'Rename' }); if (name?.trim()) void act({ action: 'section-rename', sectionId: s.id, name }, 'rn', 'Renamed'); }} className="px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10">Rename</button>
                  <button type="button" aria-label={`Delete ${s.name}`} onClick={async () => { if (await confirmDialog({ title: `Delete ${s.name}?`, message: 'Its students stay in the course, in no section.', confirmLabel: 'Delete', destructive: true })) void act({ action: 'section-delete', sectionId: s.id }, 'del', 'Section deleted'); }} className="p-1 rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                </>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">No sections. Use them for lab groups or tutorial times.</p>}
        {canManage && (
          <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: 'section-add', name: section }, 'add', 'Section added')) setSection(''); }}>
            <label htmlFor="new-section" className="sr-only">New section name</label>
            <input id="new-section" value={section} onChange={(e) => setSection(e.target.value)} maxLength={60} placeholder="e.g. Monday lab" className="input py-1.5 max-w-xs" />
            <button type="submit" disabled={busy === 'add' || !section.trim()} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Add</button>
          </form>
        )}
      </div>

      {data.students.length > 0 && (data.sections.length > 0 || canManage) && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Students ({data.students.length})</summary>
          <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {data.students.map((p) => (
              <li key={p.id} className="py-2 flex items-center gap-3 flex-wrap">
                <Avatar name={p.name} src={p.avatar} size={28} />
                <span className="min-w-0 flex-1 text-sm text-zinc-900 dark:text-white truncate">{p.name}{p.accommodation && extraText(p.accommodation) ? <span className="ms-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">{extraText(p.accommodation)}</span> : null}</span>
                {canManage && <button type="button" aria-label={`Extra time for ${p.name}`} title="Extra time" onClick={() => setExtra({ id: p.id, name: p.name, a: p.accommodation ?? { extraDays: 0, extraTimePct: 0, note: null } })} className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-500/10"><Clock className="w-4 h-4" /></button>}
                {data.sections.length > 0 && (
                  <>
                    <label htmlFor={`sec-${p.id}`} className="sr-only">Section for {p.name}</label>
                    <select id={`sec-${p.id}`} disabled={!canManage || !!busy} value={p.sectionId ?? ''} onChange={(e) => void act({ action: 'assign', studentId: p.id, sectionId: e.target.value || null }, `s-${p.id}`)} className="input w-auto py-1 text-xs">
                      <option value="">No section</option>
                      {data.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </>
                )}
                {canManage && <button type="button" aria-label={`Remove ${p.name} from the course`} disabled={!!busy} onClick={async () => { if (await confirmDialog({ title: `Remove ${p.name} from the course?`, message: 'Their work and grades stay. The next on the waitlist gets the place.', confirmLabel: 'Remove', destructive: true })) void act({ action: 'remove', studentId: p.id }, `r-${p.id}`, 'Removed from the course'); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><UserMinus className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {extra && <ExtraTime courseId={courseId} student={extra} onClose={() => setExtra(null)} onSaved={() => { setExtra(null); void mutate(); }} />}
    </section>
  );
}

/** A student's extra days and extra time: set once, used in every course. */
function ExtraTime({ courseId, student, onClose, onSaved }: { courseId: string; student: { id: string; name: string; a: Accommodation }; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState(String(student.a.extraDays));
  const [pct, setPct] = useState(String(student.a.extraTimePct));
  const [note, setNote] = useState(student.a.note ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await authedJson(`/api/courses/${courseId}/accommodations`, { method: 'POST', body: JSON.stringify({ studentId: student.id, extraDays: Number(days) || 0, extraTimePct: Number(pct) || 0, note }) });
      toast.success(Number(days) || Number(pct) ? `Extra time saved for ${student.name}` : `${student.name} has no extra time now`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t save. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Extra time for ${student.name}`} onClose={onClose}
      footer={<button type="button" onClick={() => void save()} disabled={busy} className="btn-primary w-full justify-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">For a student who needs it (for example a learning support plan). It’s used in every course they take, and their other teachers see it too. Students see their own due dates, not this note.</p>
        <label className="block text-sm"><span className="font-medium text-zinc-900 dark:text-white">Extra days on assignment due dates</span>
          <input type="number" min={0} max={30} value={days} onChange={(e) => setDays(e.target.value)} className="input mt-1 w-28" />
        </label>
        <label className="block text-sm"><span className="font-medium text-zinc-900 dark:text-white">Extra time on timed quizzes (%)</span>
          <input type="number" min={0} max={200} step={5} value={pct} onChange={(e) => setPct(e.target.value)} className="input mt-1 w-28" />
          <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-1">25 gives a 40-minute quiz 50 minutes.</span>
        </label>
        <label className="block text-sm"><span className="font-medium text-zinc-900 dark:text-white">Note for staff (optional)</span>
          <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1" placeholder="e.g. From the support plan, 2026" />
        </label>
      </div>
    </Sheet>
  );
}
