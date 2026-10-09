'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Bell, CheckCircle2, ChevronRight, Clock, Download, FileSignature, Loader2, Lock, Paperclip, Plus, Unlock, UserX, X, XCircle } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// Consent forms for teachers and school admins (Stage 5 · B16.4; src/server/consent-forms.ts):
// send a form to the parents of a class (admins: of every student), then follow who agreed,
// declined or hasn't answered, remind the rest, download the answers and close the form.

interface Summary { id: string; title: string; dueAt: string | null; closed: boolean; createdAt: string; from: string; to: string; students: number; yes: number; no: number }
interface List { canSendToSchool: boolean; courses: { id: string; code: string; name: string }[]; forms: Summary[] }
type Status = 'yes' | 'no' | 'waiting' | 'no-parent';
interface Row { studentId: string; name: string; status: Status; answer: { by: string; signedName: string; signedAt: string; note: string | null; drawn: boolean } | null }
interface Detail {
  form: { id: string; title: string; body: string; attachmentUrl: string | null; attachmentName: string | null; dueAt: string | null; allowDecline: boolean; closed: boolean; remindedAt: string | null; createdAt: string; from: string; to: string };
  counts: { students: number; yes: number; no: number; waiting: number; noParent: number };
  rows: Row[];
}

const KEY = '/api/consent-forms';
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const STATUS: Record<Status, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  yes: { label: 'Agreed', tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', Icon: CheckCircle2 },
  no: { label: 'Declined', tone: 'text-rose-700 dark:text-rose-300 bg-rose-500/10', Icon: XCircle },
  waiting: { label: 'Waiting', tone: 'text-amber-800 dark:text-amber-300 bg-amber-500/10', Icon: Clock },
  'no-parent': { label: 'No parent account', tone: 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', Icon: UserX },
};

/** ?form=<id> (from a notification) opens that form; opening and closing one keeps the address in step. */
export function useFormParam() {
  const [formId, setFormId] = useState<string | null>(null);
  useEffect(() => {
    // After the first render: the address can change just after a client-side navigation.
    const t = setTimeout(() => setFormId(new URLSearchParams(window.location.search).get('form')), 0);
    return () => clearTimeout(t);
  }, []);
  const set = (id: string | null) => {
    setFormId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('form', id); else url.searchParams.delete('form');
    window.history.replaceState(window.history.state, '', url);
  };
  return [formId, set] as const;
}

export function ConsentFormsManager({ formId, onForm }: { formId: string | null; onForm: (id: string | null) => void }) {
  const { data, error, isLoading, mutate } = useSWR<List>(KEY, authedJson);
  const [creating, setCreating] = useState(false);

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <ContentSkeleton variant="list" />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xl">Trip permissions, photo consent, medical forms: parents sign for each child in their app, and you see who has answered.</p>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary btn-sm shrink-0"><Plus className="w-4 h-4" /> New form</button>
      </div>
      {data.forms.length === 0 ? (
        <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-8 text-center`}>
          <FileSignature className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="font-semibold text-zinc-900 dark:text-white">No forms yet</p>
          <p className="text-sm text-zinc-500 mt-1">Send your first form. Parents with an account get it in their app straight away.</p>
        </motion.section>
      ) : (
        <motion.ul variants={list} initial="hidden" animate="show" className={`${card} p-2 sm:p-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
          {data.forms.map((f) => <FormRow key={f.id} form={f} onOpen={() => { haptic('tap'); onForm(f.id); }} />)}
        </motion.ul>
      )}
      {creating && <CreateSheet data={data} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); void mutate(); onForm(id); }} />}
      {formId && <DetailSheet key={formId} id={formId} onClose={() => { onForm(null); void mutate(); }} />}
    </div>
  );
}

function FormRow({ form, onOpen }: { form: Summary; onOpen: () => void }) {
  const answered = form.yes + form.no;
  const pct = form.students ? Math.min(100, Math.round((answered / form.students) * 100)) : 0;
  return (
    <motion.li variants={fadeUp}>
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
        <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', form.closed ? 'bg-zinc-500/10 text-zinc-500' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300')}>
          {form.closed ? <Lock className="w-5 h-5" /> : <FileSignature className="w-5 h-5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-white truncate">{form.title}</span>
            {form.closed && <span className="text-[11px] font-semibold text-zinc-500">Closed</span>}
          </span>
          <span className="block text-xs text-zinc-500 truncate">{form.to} · {form.from} · {format(new Date(form.createdAt), 'd MMM')}{form.dueAt ? ` · answer by ${format(new Date(form.dueAt), 'd MMM')}` : ''}</span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden flex" aria-hidden>
              <motion.span className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${form.students ? (form.yes / form.students) * 100 : 0}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
              <motion.span className="h-full bg-rose-500 ml-px" initial={{ width: 0 }} animate={{ width: `${form.students ? (form.no / form.students) * 100 : 0}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </span>
            <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{answered}/{form.students} answered · {pct}%</span>
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
      </button>
    </motion.li>
  );
}

function CreateSheet({ data, onClose, onCreated }: { data: List; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const [dueAt, setDueAt] = useState('');
  const [allowDecline, setAllowDecline] = useState(true);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const noTarget = !courseId && !data.canSendToSchool;

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const res = await authedFetch(`/api/upload?filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      const r = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !r.url) throw new Error(r.error || 'Upload failed.');
      setFile({ url: r.url, name: f.name });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t attach the file.')); }
    finally { setUploading(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await authedJson<{ id: string; told: number }>(KEY, { method: 'POST', body: JSON.stringify({ title, body, courseId: courseId || null, dueAt: dueAt || null, allowDecline, attachmentUrl: file?.url, attachmentName: file?.name }) });
      haptic('success');
      toast.success('Form sent', { description: r.told ? `${r.told} parent${r.told === 1 ? '' : 's'} told in their app.` : 'No parents have linked accounts yet. They’ll see it once they do.' });
      onCreated(r.id);
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t send the form.'));
      setBusy(false);
    }
  };

  return (
    <Sheet title="New form for parents" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" count={title.length} max={120}>
          {(p) => <input {...p} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Science museum trip, 14 November" />}
        </Field>
        <Field label="Send to">
          {(p) => (
            <select {...p} value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input">
              {data.canSendToSchool && <option value="">Every student’s parents</option>}
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="What parents agree to" count={body.length} max={5000} hint="Where, when, cost, what to bring, who to contact.">
          {(p) => <textarea {...p} required rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className="input" />}
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={picker} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          {file ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 pl-3 pr-1 py-1 text-sm max-w-full">
              <Paperclip className="w-4 h-4 shrink-0 text-zinc-500" /><span className="truncate">{file.name}</span>
              <button type="button" aria-label="Remove the attachment" onClick={() => setFile(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
            </span>
          ) : (
            <button type="button" onClick={() => picker.current?.click()} disabled={uploading} className="btn-secondary btn-sm">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />} Attach a file (optional)
            </button>
          )}
        </div>
        <Field label="Answer by (optional)">
          {(p) => <input {...p} type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input" />}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="consent-decline" className="text-sm text-zinc-700 dark:text-zinc-200">
            Parents can say no
            <span className="block text-xs text-zinc-500">Turn off for forms that must be agreed to, like school rules.</span>
          </label>
          <Switch id="consent-decline" checked={allowDecline} onChange={setAllowDecline} />
        </div>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy || uploading || noTarget || !title.trim() || !body.trim()} className="btn-primary w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Send to parents
        </button>
        {noTarget && <p className="text-xs text-zinc-500">You don’t teach any classes yet, so there’s nobody to send a form to.</p>}
        <p className="text-[11px] text-zinc-500">Parents get it in their app and as a notification (never by email). Students without a parent account are listed so you can follow up on paper.</p>
      </form>
    </Sheet>
  );
}

function DetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const key = `${KEY}/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key, authedJson);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter), [data, filter]);
  const remindedLately = !!data?.form.remindedAt && now > 0 && now - new Date(data.form.remindedAt).getTime() < 12 * 3600_000;

  const act = async (action: 'remind' | 'close' | 'reopen') => {
    setBusy(action);
    try {
      const r = await authedJson<{ told?: number; closed?: boolean }>(key, { method: 'POST', body: JSON.stringify({ action }) });
      haptic('success');
      if (action === 'remind') toast.success(r.told ? `Reminded ${r.told} parent${r.told === 1 ? '' : 's'}` : 'Nobody left to remind');
      else toast.success(action === 'close' ? 'Form closed' : 'Form reopened');
      await mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  const download = () => {
    if (!data) return;
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [['Student', 'Answer', 'Signed by', 'Typed name', 'Signed at', 'Drawn signature', 'Note'].join(',')];
    for (const r of data.rows) lines.push([r.name, STATUS[r.status].label, r.answer?.by ?? '', r.answer?.signedName ?? '', r.answer ? new Date(r.answer.signedAt).toISOString() : '', r.answer ? (r.answer.drawn ? 'yes' : 'no') : '', r.answer?.note ?? ''].map(cell).join(','));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${data.form.title.replace(/[^\w -]+/g, '').slice(0, 60) || 'form'} answers.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Sheet title={data?.form.title ?? 'Form'} onClose={onClose}>
      {error && !data ? <LoadError onRetry={() => mutate()} />
        : !data ? <ContentSkeleton variant="list" />
        : (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">{data.form.to} · from {data.form.from} · {format(new Date(data.form.createdAt), 'd MMM yyyy')}{data.form.dueAt ? ` · answer by ${format(new Date(data.form.dueAt), 'd MMM')}` : ''}{data.form.allowDecline ? '' : ' · agree only'}</p>
            <details className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] px-3 py-2">
              <summary className="text-sm font-semibold text-zinc-900 dark:text-white cursor-pointer min-h-8 flex items-center">What parents see</summary>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">{data.form.body}</p>
              {safeHref(data.form.attachmentUrl) && <a href={safeHref(data.form.attachmentUrl)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300"><Paperclip className="w-4 h-4" />{data.form.attachmentName || 'Attachment'}</a>}
            </details>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([['yes', data.counts.yes], ['no', data.counts.no], ['waiting', data.counts.waiting], ['no-parent', data.counts.noParent]] as [Status, number][]).map(([s, n]) => {
                const { label, tone, Icon } = STATUS[s];
                return (
                  <div key={s} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3">
                    <span className={cn('inline-flex w-7 h-7 rounded-full items-center justify-center', tone)}><Icon className="w-4 h-4" /></span>
                    <p className="mt-1 text-xl font-black tabular-nums text-zinc-900 dark:text-white">{n}</p>
                    <p className="text-[11px] text-zinc-500 leading-tight">{label}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {!data.form.closed && (
                <button type="button" onClick={() => void act('remind')} disabled={!!busy || remindedLately || data.counts.waiting === 0} className="btn-secondary btn-sm">
                  {busy === 'remind' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  {remindedLately ? `Reminded ${now - new Date(data.form.remindedAt!).getTime() < 60_000 ? 'just now' : formatDistanceToNowStrict(new Date(data.form.remindedAt!), { addSuffix: true })}` : 'Remind parents'}
                </button>
              )}
              <button type="button" onClick={() => void act(data.form.closed ? 'reopen' : 'close')} disabled={!!busy} className="btn-secondary btn-sm">
                {busy === 'close' || busy === 'reopen' ? <Loader2 className="w-4 h-4 animate-spin" /> : data.form.closed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {data.form.closed ? 'Reopen' : 'Close form'}
              </button>
              <button type="button" onClick={download} className="btn-ghost btn-sm"><Download className="w-4 h-4" /> Download answers</button>
            </div>
            <Segmented<'all' | Status> label="Show" value={filter} onChange={setFilter} className="w-full"
              segments={[{ value: 'all', label: 'All' }, { value: 'waiting', label: 'Waiting' }, { value: 'yes', label: 'Agreed' }, { value: 'no', label: 'Declined' }]} />
            {rows.length === 0 ? <p className="text-sm text-zinc-500 text-center py-4">{data.rows.length ? 'Nobody here.' : 'No students in this class yet.'}</p> : (
              <motion.ul key={filter} variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {rows.map((r) => {
                  const { label, tone, Icon } = STATUS[r.status];
                  return (
                    <motion.li key={r.studentId} variants={fadeUp} className="py-2.5 flex items-start gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.name}</span>
                        {r.answer && <span className="block text-xs text-zinc-500">Signed “{r.answer.signedName}”{r.answer.by !== r.answer.signedName ? ` (account: ${r.answer.by})` : ''} · {format(new Date(r.answer.signedAt), 'd MMM, HH:mm')}{r.answer.drawn ? ' · drawn signature' : ''}</span>}
                        {r.answer?.note && <span className="block text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 break-words">Note: {r.answer.note}</span>}
                      </span>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', tone)}><Icon className="w-3 h-3" />{label}</span>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
            <p className="text-[11px] text-zinc-500">Each answer keeps the parent’s account, the name they typed and the time. Parents can change their answer until you close the form.</p>
          </div>
        )}
    </Sheet>
  );
}
