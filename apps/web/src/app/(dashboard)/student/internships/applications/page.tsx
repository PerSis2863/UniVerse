'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Briefcase, CalendarClock, ExternalLink, FileText, Loader2, MapPin, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, INTERNSHIP_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { STAGES, STAGE_LABEL, type Stage, type TrackerDoc } from '@/lib/careers';
import { fadeUp, list } from '@/lib/motion';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// Stage 5 · Q15: every application in one place, made on UniVerse or elsewhere, with its stage,
// the next step (a reminder comes an hour before), notes and the documents sent (src/server/careers.ts).

interface App {
  id: string; title: string; company: string; url: string | null; location: string | null; stage: Stage; onUniverse: boolean;
  appliedAt: string | null; nextStep: string | null; nextAt: string | null; notes: string | null; documents: TrackerDoc[]; updatedAt: string;
}

const KEY = '/api/careers/applications';
const STAGE_TONE: Record<Stage, string> = {
  SAVED: 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200',
  APPLIED: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  INTERVIEW: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  OFFER: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  REJECTED: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** An ISO time as the value of a datetime-local / date input, in local time. */
const local = (iso: string | null, withTime = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  const s = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
  return withTime ? s.slice(0, 16) : s.slice(0, 10);
};

type Draft = { id?: string; onUniverse: boolean; title: string; company: string; url: string; location: string; stage: Stage; appliedAt: string; nextStep: string; nextAt: string; notes: string; documents: TrackerDoc[] };
const blank = (): Draft => ({ onUniverse: false, title: '', company: '', url: '', location: '', stage: 'APPLIED', appliedAt: '', nextStep: '', nextAt: '', notes: '', documents: [] });
const draftOf = (a: App): Draft => ({ id: a.id, onUniverse: a.onUniverse, title: a.title, company: a.company, url: a.url ?? '', location: a.location ?? '', stage: a.stage, appliedAt: local(a.appliedAt, false), nextStep: a.nextStep ?? '', nextAt: local(a.nextAt), notes: a.notes ?? '', documents: a.documents });

function Editor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (rows: App[]) => void }) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [doc, setDoc] = useState({ name: '', url: '' });
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // On UniVerse the company decides the result: the student can only mark an interview.
  const stages = d.onUniverse ? (['APPLIED', 'INTERVIEW'] as Stage[]).concat(STAGES.filter((s) => s === d.stage && s !== 'APPLIED' && s !== 'INTERVIEW')) : [...STAGES];

  const addLink = () => {
    const url = doc.url.trim();
    if (!doc.name.trim() || !/^https?:\/\//i.test(url)) { toast.error('Give the document a name and an https link.'); return; }
    set('documents', [...d.documents, { name: doc.name.trim(), url: url.replace(/^http:/i, 'https:') }].slice(0, 8));
    setDoc({ name: '', url: '' });
  };
  const upload = async (f: File) => {
    setUploading(true);
    try {
      const { url } = await authedJson<{ url: string }>(`/api/upload?filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      set('documents', [...d.documents, { name: f.name.slice(0, 120), url }].slice(0, 8));
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (file.current) file.current.value = ''; }
  };
  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...(d.id ? { id: d.id } : {}), stage: d.stage, nextStep: d.nextStep, notes: d.notes, documents: d.documents,
        appliedAt: d.appliedAt ? new Date(`${d.appliedAt}T12:00`).toISOString() : null,
        nextAt: d.nextAt ? new Date(d.nextAt).toISOString() : null,
      };
      if (!d.onUniverse) Object.assign(body, { title: d.title, company: d.company, url: d.url, location: d.location });
      const rows = await authedJson<App[]>(KEY, { method: 'POST', body: JSON.stringify(body) });
      onSaved(rows);
      toast.success(d.id ? 'Saved' : 'Added to your tracker');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Sheet title={d.id ? 'Edit application' : 'Add an application'} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving || uploading} onClick={save}>{saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save</button></div>}>
      <div className="space-y-4">
        {d.onUniverse && <p className="text-sm text-zinc-600 dark:text-zinc-400 rounded-2xl bg-indigo-500/[0.06] p-3">You applied on UniVerse, so the company sets the result. You can mark an interview and keep notes, next steps and documents here.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Role" className="sm:col-span-2">{(p) => <input {...p} className="input" value={d.title} disabled={d.onUniverse} maxLength={140} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Data analyst intern" />}</Field>
          <Field label="Company">{(p) => <input {...p} className="input" value={d.company} disabled={d.onUniverse} maxLength={120} onChange={(e) => set('company', e.target.value)} />}</Field>
          <Field label="Location">{(p) => <input {...p} className="input" value={d.location} disabled={d.onUniverse} maxLength={120} onChange={(e) => set('location', e.target.value)} placeholder="City or Remote" />}</Field>
          {!d.onUniverse && <Field label="Job advert link" className="sm:col-span-2" hint="Optional">{(p) => <input {...p} className="input" type="url" value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />}</Field>}
          <Field label="Stage">{(p) => (
            <select {...p} className="input" value={d.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
              {stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          )}</Field>
          <Field label="Applied on">{(p) => <input {...p} className="input" type="date" value={d.appliedAt} onChange={(e) => set('appliedAt', e.target.value)} />}</Field>
          <Field label="Next step" hint="An interview, a test, a follow-up email…">{(p) => <input {...p} className="input" value={d.nextStep} maxLength={140} onChange={(e) => set('nextStep', e.target.value)} />}</Field>
          <Field label="When" hint="We’ll remind you an hour before.">{(p) => <input {...p} className="input" type="datetime-local" value={d.nextAt} onChange={(e) => set('nextAt', e.target.value)} />}</Field>
          <Field label="Notes" className="sm:col-span-2" count={d.notes.length} max={4000}>{(p) => <textarea {...p} className="input min-h-[96px]" value={d.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} placeholder="Who you spoke to, what they asked, what to prepare" />}</Field>
        </div>
        <div>
          <p className="label">Documents sent</p>
          {d.documents.length > 0 && (
            <ul className="mt-1 space-y-1.5">
              {d.documents.map((x, i) => (
                <li key={`${x.url}-${i}`} className="flex items-center gap-2 text-sm min-w-0">
                  <FileText className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
                  <span className="truncate flex-1 text-zinc-800 dark:text-zinc-100">{x.name}</span>
                  <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove ${x.name}`} onClick={() => set('documents', d.documents.filter((_, j) => j !== i))}><X className="w-4 h-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          {d.documents.length < 8 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
              <input className="input" aria-label="Document name" placeholder="Name, e.g. CV" value={doc.name} maxLength={120} onChange={(e) => setDoc({ ...doc, name: e.target.value })} />
              <input className="input" aria-label="Document link" type="url" placeholder="https://" value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} />
              <button type="button" className="btn-secondary" onClick={addLink}>Add link</button>
            </div>
          )}
          {d.documents.length < 8 && (
            <div className="mt-2">
              <input ref={file} type="file" className="sr-only" id="tracker-upload" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
              <label htmlFor="tracker-upload" className="btn-ghost btn-sm cursor-pointer">{uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Paperclip className="w-4 h-4" aria-hidden />} Upload a file (4 MB max)</label>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function AppCard({ a, now, onEdit, onStage, onRemove }: { a: App; now: number; onEdit: () => void; onStage: (s: Stage) => void; onRemove: () => void }) {
  const soon = a.nextAt && new Date(a.nextAt).getTime() > now;
  const stages = a.onUniverse ? STAGES.filter((s) => s === 'APPLIED' || s === 'INTERVIEW' || s === a.stage) : STAGES;
  return (
    <motion.li variants={fadeUp} className="panel p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0"><Briefcase className="w-5 h-5" aria-hidden /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-zinc-900 dark:text-white leading-snug break-words">{a.title}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">{a.company}{a.onUniverse ? ' · on UniVerse' : ''}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', STAGE_TONE[a.stage])}>{STAGE_LABEL[a.stage]}</span>
      </div>
      {(a.nextStep || a.nextAt) && (
        <p className={cn('flex items-start gap-1.5 text-sm', soon ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400')}>
          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words"><strong className="font-semibold">{a.nextStep || 'Next step'}</strong>{a.nextAt ? ` · ${when(a.nextAt)}` : ''}{a.nextAt && !soon ? ' (past)' : ''}</span>
        </p>
      )}
      {a.notes && <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line line-clamp-3 break-words">{a.notes}</p>}
      {a.documents.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {a.documents.map((x, i) => (
            <li key={`${x.url}-${i}`}><a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 max-w-[14rem]"><FileText className="w-3.5 h-3.5 shrink-0" aria-hidden /><span className="truncate">{x.name}</span></a></li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-3 border-t border-zinc-200 dark:border-white/10 space-y-2.5">
        {(a.location || a.appliedAt || a.url) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {a.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {a.location}</span>}
            {a.appliedAt && <span>Applied {dateOnly(a.appliedAt)}</span>}
            {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300 underline underline-offset-2">Advert <ExternalLink className="w-3 h-3" aria-hidden /></a>}
          </div>
        )}
        <div className="flex items-center gap-2">
          <select aria-label={`Stage of ${a.title}`} className="input !w-auto !py-1.5 !text-xs" value={a.stage} onChange={(e) => onStage(e.target.value as Stage)}>
            {stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <span className="flex-1" />
          <button type="button" className="btn-ghost btn-sm" onClick={onEdit}><Pencil className="w-4 h-4" aria-hidden /> Edit</button>
          {!a.onUniverse && <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove ${a.title}`} onClick={onRemove}><Trash2 className="w-4 h-4" aria-hidden /></button>}
        </div>
      </div>
    </motion.li>
  );
}

export default function ApplicationsPage() {
  const { data, error, isLoading, mutate } = useSWR<App[]>(KEY, authedJson);
  const [filter, setFilter] = useState<Stage | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Draft | null>(null);
  const now = useNow();
  const rows = Array.isArray(data) ? data : [];
  const shown = rows.filter((a) => filter === 'ALL' || a.stage === filter);
  const upcoming = now ? rows.filter((a) => a.nextAt && new Date(a.nextAt).getTime() > now).sort((x, y) => x.nextAt!.localeCompare(y.nextAt!)).slice(0, 3) : [];
  const count = (s: Stage) => rows.filter((a) => a.stage === s).length;

  const write = async (init: RequestInit, url = KEY) => {
    try {
      const out = await authedJson<App[]>(url, init);
      if (Array.isArray(out)) await mutate(out, { revalidate: false }); else await mutate();
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (a: App) => {
    if (!(await confirmDialog({ title: `Remove “${a.title}”?`, message: 'Its notes and documents list go too (uploaded files stay in your files).', confirmLabel: 'Remove', destructive: true }))) return;
    await write({ method: 'DELETE' }, `${KEY}?id=${encodeURIComponent(a.id)}`);
  };

  return (
    <>
      <Topbar title="Internships" subtitle="Every application in one place, with next steps and notes" />
      <SectionTabs tabs={INTERNSHIP_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-5">
          {error ? (
            <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load your applications.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => mutate()}>Try again</button></div>
          ) : isLoading || !data ? (
            <ContentSkeleton variant="list" />
          ) : (
            <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
              <motion.div variants={fadeUp} className="flex flex-col-reverse sm:flex-row sm:items-start gap-3">
                <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {(['ALL', ...STAGES] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
                      className={cn('rounded-full px-3 py-1.5 text-sm font-medium transition-colors', filter === s ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10')}>
                      {s === 'ALL' ? 'All' : STAGE_LABEL[s]} <span className="tabular-nums opacity-70">{s === 'ALL' ? rows.length : count(s)}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-primary shrink-0 self-stretch sm:self-auto" onClick={() => setEditing(blank())}><Plus className="w-4 h-4" aria-hidden /> Add application</button>
              </motion.div>

              {upcoming.length > 0 && (
                <motion.section variants={fadeUp} className="panel p-4 sm:p-5" aria-labelledby="coming-up">
                  <h2 id="coming-up" className="font-bold text-zinc-900 dark:text-white">Coming up</h2>
                  <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
                    {upcoming.map((a) => (
                      <li key={a.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                        <span className="font-semibold text-zinc-900 dark:text-white">{a.nextStep || 'Next step'}</span>
                        <span className="text-zinc-600 dark:text-zinc-400 min-w-0 break-words">{a.title} · {a.company}</span>
                        <span className="sm:ml-auto tabular-nums text-zinc-700 dark:text-zinc-300">{when(a.nextAt!)}</span>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {shown.length ? (
                <motion.ul variants={list} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {shown.map((a) => (
                    <AppCard key={a.id} a={a} now={now} onEdit={() => setEditing(draftOf(a))} onRemove={() => remove(a)}
                      onStage={(stage) => write({ method: 'POST', body: JSON.stringify({ id: a.id, stage }) })} />
                  ))}
                </motion.ul>
              ) : rows.length ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing at this stage.</p>
              ) : (
                <div className="panel"><EmptyState icon={Briefcase} title="No applications yet" hint="Add ones you send elsewhere; ones you make on UniVerse appear here by themselves." action={{ label: 'Add application', onClick: () => setEditing(blank()), icon: Plus }} /></div>
              )}
            </motion.div>
          )}
        </div>
      </div>
      {editing && <Editor draft={editing} onClose={() => setEditing(null)} onSaved={(r) => { if (Array.isArray(r)) void mutate(r, { revalidate: false }); else void mutate(); }} />}
    </>
  );
}
