'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { format } from 'date-fns';
import { CheckCircle2, Copy, Loader2, Paperclip, Send } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import Link from '@/components/ui/Link';
import { FILE_TYPES, MAX_FILE_BYTES, checkAnswers, type Answers, type FormField } from '@/lib/admission-form';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The public application form of an admission round (Stage 5 · B15.1; src/server/admissions.ts).
// No account needed. Documents go with the form in one request. Afterwards the family gets a
// reference and a private link to follow the application (no email is sent).

interface Round { title: string; intro: string | null; fields: FormField[]; opensAt: string; closesAt: string; open: boolean; notYet: boolean; school: string }
const getJson = async (url: string) => { const r = await fetch(url); const body = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(body.error ?? 'Couldn’t load this.'), { body }); return body; };
const RELATIONS = ['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'The student (applying myself)', 'Other'];

export default function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, error } = useSWR<Round>(`/api/admissions/public/${encodeURIComponent(slug)}`, getJson);
  const [done, setDone] = useState<{ ref: string; token: string } | null>(null);
  return (
    <main id="main" className="min-h-dvh px-4 py-8 sm:py-12" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto">
        <p className="mb-6 flex items-center gap-2 font-black text-zinc-900 dark:text-white"><LogoMark className="w-7 h-7" /> {data?.school ?? 'UniVerse'}</p>
        {error && !data ? (
          <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6 text-center">
            <h1 className="font-bold text-zinc-900 dark:text-white">Form not found</h1>
            <p className="mt-1 text-sm text-zinc-500">{(error as Error).message} Check the link the school gave you.</p>
          </section>
        ) : !data ? <ContentSkeleton variant="list" />
          : done ? <Sent ref_={done.ref} token={done.token} round={data.title} />
          : <ApplyForm slug={slug} round={data} onSent={setDone} />}
      </div>
    </main>
  );
}

function Sent({ ref_, token, round }: { ref_: string; token: string; round: string }) {
  const link = typeof window !== 'undefined' ? `${window.location.origin}/apply/status/${token}` : '';
  const [copied, setCopied] = useState(false);
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6 sm:p-8 text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" aria-hidden />
      <h1 className="mt-3 text-2xl font-black text-zinc-900 dark:text-white">Application sent</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{round} · reference <span className="font-mono font-bold">{ref_}</span></p>
      {token && (
        <div className="mt-6 text-left rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Keep this link: it’s how you follow your application</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">We don’t send emails. Bookmark it or copy it somewhere safe; anyone with it can see the application.</p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input readOnly aria-label="Your private link" value={link} onFocus={(e) => e.currentTarget.select()} className="input flex-1 font-mono text-xs" />
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)); }} className="btn-secondary btn-sm shrink-0"><Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <Link href={`/apply/status/${token}`} className="btn-primary w-full mt-3">Open my application page</Link>
        </div>
      )}
    </motion.section>
  );
}

function ApplyForm({ slug, round, onSent }: { slug: string; round: Round; onSent: (r: { ref: string; token: string }) => void }) {
  const [student, setStudent] = useState({ name: '', dob: '', email: '' });
  const [contact, setContact] = useState({ name: '', email: '', phone: '', relation: '' });
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState('');
  const set = (id: string, v: string | string[]) => { setAnswers((a) => ({ ...a, [id]: v })); setErrors((e) => ({ ...e, [id]: '' })); };

  if (!round.open) {
    return (
      <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">{round.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{round.notYet ? `Applications open on ${format(new Date(round.opensAt), 'd MMMM yyyy')}.` : 'Applications for this round are closed.'}</p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const local: Record<string, string> = { ...checkAnswers(round.fields, answers, (id) => !!files[id]) };
    if (student.name.trim().length < 2) local.studentName = 'Enter the student’s full name.';
    if (contact.name.trim().length < 2) local.contactName = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) local.contactEmail = 'Enter an email address we can reach you on.';
    if (Object.keys(local).length) { setErrors(local); setProblem('Please check the highlighted answers.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('data', JSON.stringify({ student, contact, answers, website }));
      for (const [id, f] of Object.entries(files)) form.set(`file:${id}`, f);
      const res = await fetch(`/api/admissions/public/${encodeURIComponent(slug)}`, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(body.errors ?? {}); setProblem(body.error ?? 'Couldn’t send the application.'); return; }
      onSent(body);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setProblem('You seem to be offline. Your answers are still here: try again.'); }
    finally { setBusy(false); }
  };

  return (
    <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={submit} noValidate className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">{round.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">Applications close {format(new Date(round.closesAt), 'd MMMM yyyy')}.</p>
        {round.intro && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{round.intro}</p>}
      </header>

      <fieldset className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
        <legend className="px-1 font-bold text-zinc-900 dark:text-white">The student</legend>
        <Field label="Full name *" error={errors.studentName}>{(p) => <input {...p} autoComplete="off" value={student.name} maxLength={120} onChange={(e) => { setStudent({ ...student, name: e.target.value }); setErrors((x) => ({ ...x, studentName: '' })); }} className="input" />}</Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Date of birth" error={errors.studentDob}>{(p) => <input {...p} type="date" value={student.dob} onChange={(e) => setStudent({ ...student, dob: e.target.value })} className="input" />}</Field>
          <Field label="Their own email (optional)" hint="They’ll sign up with it if admitted" error={errors.studentEmail}>{(p) => <input {...p} type="email" value={student.email} maxLength={254} onChange={(e) => setStudent({ ...student, email: e.target.value })} className="input" />}</Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
        <legend className="px-1 font-bold text-zinc-900 dark:text-white">You</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Your name *" error={errors.contactName}>{(p) => <input {...p} autoComplete="name" value={contact.name} maxLength={120} onChange={(e) => { setContact({ ...contact, name: e.target.value }); setErrors((x) => ({ ...x, contactName: '' })); }} className="input" />}</Field>
          <Field label="You are">{(p) => <select {...p} value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} className="input"><option value="">Choose…</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>}</Field>
          <Field label="Email *" error={errors.contactEmail}>{(p) => <input {...p} type="email" autoComplete="email" value={contact.email} maxLength={254} onChange={(e) => { setContact({ ...contact, email: e.target.value }); setErrors((x) => ({ ...x, contactEmail: '' })); }} className="input" />}</Field>
          <Field label="Phone (optional)">{(p) => <input {...p} type="tel" autoComplete="tel" value={contact.phone} maxLength={30} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="input" />}</Field>
        </div>
      </fieldset>

      {round.fields.length > 0 && (
        <fieldset className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
          <legend className="px-1 font-bold text-zinc-900 dark:text-white">Questions</legend>
          {round.fields.map((f) => <Question key={f.id} f={f} value={answers[f.id]} file={files[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} onFile={(file) => {
            const big = !!file && file.size > MAX_FILE_BYTES;
            setFiles((x) => { const n = { ...x }; if (file && !big) n[f.id] = file; else delete n[f.id]; return n; });
            setErrors((x) => ({ ...x, [f.id]: big ? 'Files up to 4 MB, please.' : '' }));
          }} />)}
        </fieldset>
      )}

      {/* People don't see this; robots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send application</button>
      <p className="text-[11px] text-zinc-500 text-center">Your answers go only to the school’s admissions team.</p>
    </motion.form>
  );
}

function Question({ f, value, file, error, onChange, onFile }: { f: FormField; value: string | string[] | undefined; file?: File; error?: string; onChange: (v: string | string[]) => void; onFile: (f: File | null) => void }) {
  const label = `${f.label}${f.required ? ' *' : ''}`;
  const str = typeof value === 'string' ? value : '';
  const list = Array.isArray(value) ? value : [];
  if (f.type === 'choice' || f.type === 'multi' || f.type === 'yesno') {
    const options = f.type === 'yesno' ? ['yes', 'no'] : f.options ?? [];
    return (
      <fieldset aria-describedby={error ? `${f.id}-err` : undefined}>
        <legend className="label">{label}</legend>
        {f.help && <p className="text-xs text-zinc-500 mb-1">{f.help}</p>}
        <div className="flex flex-wrap gap-2 mt-1">
          {options.map((o) => {
            const on = f.type === 'multi' ? list.includes(o) : str === o;
            return (
              <label key={o} className={cn('min-h-11 px-3 rounded-xl border text-sm flex items-center gap-2 cursor-pointer transition-colors', on ? 'border-indigo-600 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-100')}>
                <input type={f.type === 'multi' ? 'checkbox' : 'radio'} name={f.id} checked={on} onChange={() => onChange(f.type === 'multi' ? (on ? list.filter((x) => x !== o) : [...list, o]) : o)} className="accent-indigo-600" />
                {f.type === 'yesno' ? (o === 'yes' ? 'Yes' : 'No') : o}
              </label>
            );
          })}
        </div>
        {error && <p id={`${f.id}-err`} className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </fieldset>
    );
  }
  if (f.type === 'file') {
    return (
      <Field label={label} hint={file ? undefined : f.help ?? 'PDF, JPG or PNG, up to 4 MB'} error={error}>
        {(p) => (
          <div className="flex items-center gap-2">
            <input {...p} type="file" accept={FILE_TYPES.join(',')} onChange={(e) => { const x = e.target.files?.[0] ?? null; if (x && x.size > MAX_FILE_BYTES) e.target.value = ''; onFile(x); }} className="block w-full text-sm text-zinc-600 dark:text-zinc-300 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-500/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 dark:file:text-indigo-300" />
            {file && <Paperclip className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Attached" />}
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field label={label} hint={f.help} error={error}>
      {(p) => f.type === 'long'
        ? <textarea {...p} rows={4} maxLength={5000} value={str} onChange={(e) => onChange(e.target.value)} className="input" />
        : <input {...p} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} maxLength={300} value={str} onChange={(e) => onChange(e.target.value)} className="input" />}
    </Field>
  );
}
