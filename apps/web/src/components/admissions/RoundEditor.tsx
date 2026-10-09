'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { addMonths, format } from 'date-fns';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { DEFAULT_OFFER, FIELD_LABEL, FIELD_TYPES, MAX_FIELDS, type FieldType, type FormField } from '@/lib/admission-form';

// Making or changing an admission round (Stage 5 · B15.1): name, dates, the classes admitted
// students join, an introduction, the questions (the form builder) and the offer letter template.

export interface RoundInput { id?: string; title: string; intro: string | null; opensAt: string; closesAt: string; courseIds: string[]; fields: FormField[]; offerTemplate: string | null }
type Course = { id: string; code: string; name: string };

const STARTER: FormField[] = [
  { id: 'school', type: 'text', label: 'Current or last school', required: false },
  { id: 'why', type: 'long', label: 'Why would you like to join us?', required: false },
  { id: 'birthcert', type: 'file', label: 'Birth certificate or ID', required: true },
];
const newField = (n: number): FormField => ({ id: `q${Date.now().toString(36)}${n}`, type: 'text', label: '', required: false });

export function RoundEditor({ round, courses, onClose, onSaved }: { round: RoundInput | null; courses: Course[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState(round?.title ?? '');
  const [intro, setIntro] = useState(round?.intro ?? '');
  const [opensAt, setOpensAt] = useState(round?.opensAt.slice(0, 10) ?? format(new Date(), 'yyyy-MM-dd'));
  const [closesAt, setClosesAt] = useState(round?.closesAt.slice(0, 10) ?? format(addMonths(new Date(), 2), 'yyyy-MM-dd'));
  const [courseIds, setCourseIds] = useState<string[]>(round?.courseIds ?? []);
  const [fields, setFields] = useState<FormField[]>(round?.fields ?? STARTER);
  const [offer, setOffer] = useState(round?.offerTemplate ?? DEFAULT_OFFER);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const edit = (i: number, patch: Partial<FormField>) => setFields((cur) => cur.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) => setFields((cur) => { const n = [...cur]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      const body = { title, intro, opensAt, closesAt, courseIds, fields, offerTemplate: offer };
      const r = round?.id
        ? await authedJson<{ saved: boolean }>(`/api/admissions/${round.id}`, { method: 'POST', body: JSON.stringify({ action: 'save', ...body }) }).then(() => ({ id: round.id! }))
        : await authedJson<{ id: string }>('/api/admissions', { method: 'POST', body: JSON.stringify(body) });
      haptic('success');
      toast.success(round?.id ? 'Round saved' : 'Round created', { description: round?.id ? undefined : 'Share its link with families when it opens.' });
      onSaved(r.id);
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t save the round.'));
      setBusy(false);
    }
  };

  return (
    <Sheet title={round?.id ? 'Edit admission round' : 'New admission round'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">{(p) => <input {...p} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Admissions 2027–28 · Grade 6" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens">{(p) => <input {...p} type="date" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="input" />}</Field>
          <Field label="Closes">{(p) => <input {...p} type="date" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="input" />}</Field>
        </div>
        <Field label="Introduction for families (optional)" count={intro.length} max={3000}>
          {(p) => <textarea {...p} rows={3} maxLength={3000} value={intro} onChange={(e) => setIntro(e.target.value)} className="input" placeholder="Who can apply, fees, open days, what happens next…" />}
        </Field>
        <fieldset>
          <legend className="label">Admitted students join</legend>
          <div className="mt-1 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {courses.length === 0 ? <p className="text-sm text-zinc-500">No classes yet. Admitted students can be put in classes later.</p> : courses.map((c) => {
              const on = courseIds.includes(c.id);
              return (
                <label key={c.id} className={`min-h-10 px-3 rounded-xl border text-sm flex items-center gap-2 cursor-pointer ${on ? 'border-indigo-600 bg-indigo-500/10' : 'border-zinc-200 dark:border-white/10'}`}>
                  <input type="checkbox" checked={on} onChange={() => setCourseIds((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id].slice(0, 10)))} className="accent-indigo-600" />
                  {c.code}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="label">Questions</legend>
          <p className="text-xs text-zinc-500">The student’s name and date of birth and your contact’s name, email, phone and relation are always asked.</p>
          {fields.map((f, i) => (
            <div key={f.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input aria-label={`Question ${i + 1}`} value={f.label} maxLength={200} onChange={(e) => edit(i, { label: e.target.value })} className="input flex-1 min-w-0" placeholder="Question" />
                <button type="button" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label={`Move question ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setFields((cur) => cur.filter((_, j) => j !== i))} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select aria-label={`Question ${i + 1} type`} value={f.type} onChange={(e) => { const type = e.target.value as FieldType; edit(i, { type, options: type === 'choice' || type === 'multi' ? (f.options?.length ? f.options : ['', '']) : undefined }); }} className="input w-auto">
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_LABEL[t]}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><Switch checked={f.required} onChange={(v) => edit(i, { required: v })} label={`Question ${i + 1} required`} /> Required</label>
              </div>
              {(f.type === 'choice' || f.type === 'multi') && (
                <div className="space-y-1.5">
                  {(f.options ?? []).map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input aria-label={`Question ${i + 1} choice ${k + 1}`} value={o} maxLength={100} onChange={(e) => edit(i, { options: (f.options ?? []).map((x, m) => (m === k ? e.target.value : x)) })} className="input flex-1 min-w-0" placeholder={`Choice ${k + 1}`} />
                      {(f.options?.length ?? 0) > 2 && <button type="button" aria-label={`Remove choice ${k + 1}`} onClick={() => edit(i, { options: (f.options ?? []).filter((_, m) => m !== k) })} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => edit(i, { options: [...(f.options ?? []), ''] })} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a choice</button>
                </div>
              )}
              <input aria-label={`Question ${i + 1} help text`} value={f.help ?? ''} maxLength={300} onChange={(e) => edit(i, { help: e.target.value })} className="input text-sm" placeholder="Help text (optional)" />
            </div>
          ))}
          {fields.length < MAX_FIELDS && <button type="button" onClick={() => setFields((cur) => [...cur, newField(cur.length)])} className="btn-secondary btn-sm"><Plus className="w-4 h-4" /> Add a question</button>}
        </fieldset>

        <Field label="Offer letter" hint="{student}, {contact}, {round}, {school} and {date} are filled in. You can change each letter before sending it.">
          {(p) => <textarea {...p} rows={8} maxLength={5000} value={offer} onChange={(e) => setOffer(e.target.value)} className="input text-sm" />}
        </Field>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy || !title.trim()} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {round?.id ? 'Save' : 'Create round'}</button>
      </form>
    </Sheet>
  );
}
