'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowLeft, BookCheck, Eye, EyeOff, Loader2, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { MathText } from '@/components/ui/MathText';
import { api, fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RevisionPack } from '@/lib/revision-pack';

// Revision packs (M294; API /revision-packs, src/server/revision-packs.ts): made from the course's own
// materials and class recaps, checked and published by the teacher, read and practised by students.

type Pack = { id: string; title: string; pack: RevisionPack; sources: string[]; usedAi: boolean; published: boolean; createdAt: string };
type List = { canEdit: boolean; sources: { id: string; title: string; kind: string; chars: number }[]; packs: Pack[] };

export function RevisionPacks({ courseId }: { courseId: string }) {
  const key = `/revision-packs?courseId=${courseId}`;
  const { data, error, isLoading, mutate } = useSWR<List>(key, fetcher);
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <LoadError onRetry={() => void mutate()} />;
  if (isLoading || !data) return <ContentSkeleton />;
  const pack = data.packs.find((p) => p.id === open);
  if (pack) return <PackView p={pack} canEdit={data.canEdit} onBack={() => setOpen(null)} onChanged={() => void mutate()} />;
  return (
    <div className="space-y-3">
      {data.canEdit && <div className="flex justify-end"><button type="button" className="btn-primary btn-sm" onClick={() => setMaking(true)}><Plus className="w-4 h-4" aria-hidden />New revision pack</button></div>}
      {!data.packs.length ? (
        <EmptyState icon={BookCheck} title={data.canEdit ? 'No revision packs yet' : 'No revision packs yet'} hint={data.canEdit ? 'Make one from your materials and class recaps: topics, key terms, practice questions and a checklist.' : 'When your teacher shares a revision pack, it shows here.'} action={data.canEdit ? { label: 'New revision pack', onClick: () => setMaking(true), icon: Plus } : undefined} />
      ) : (
        <ul className="space-y-2">
          {data.packs.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p.id)} className="card w-full p-4 text-start">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-white me-auto" translate="no">{p.title}</span>
                  {data.canEdit && <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', p.published ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-amber-500/10 text-amber-900 dark:text-amber-200')}>{p.published ? 'Shared' : 'Draft'}</span>}
                </span>
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-300">{p.pack.topics.length} topics · {p.pack.questions.length} practice questions</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {making && <NewPack courseId={courseId} sources={data.sources} onClose={() => setMaking(false)} onMade={(id) => { setMaking(false); void mutate().then(() => setOpen(id)); }} />}
    </div>
  );
}

function NewPack({ courseId, sources, onClose, onMade }: { courseId: string; sources: List['sources']; onClose: () => void; onMade: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState<string[]>(() => sources.slice(0, 8).map((s) => s.id));
  const [recaps, setRecaps] = useState(true);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string; usedAi: boolean }>('/revision-packs', { courseId, title, sourceIds: chosen, recaps });
      toast.success('Revision pack made', { description: r.data.usedAi ? 'Check it, then share it with the class.' : 'AI wasn’t available, so it’s an outline from your modules. Check it, then share it.' });
      onMade(r.data.id);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t make the pack.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="New revision pack" onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void make()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}{busy ? 'Making it…' : 'Make the pack'}</button>
      </div>
    }>
      <div className="space-y-4">
        <Field label="Title">{(p) => <input {...p} className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm revision" />}</Field>
        <fieldset>
          <legend className="label">Made from</legend>
          {!sources.length ? <p className="text-sm text-zinc-600 dark:text-zinc-300">No materials with text yet. Upload materials (the Ghidra tutor reads them), or the pack follows your modules.</p> : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {sources.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-white/5">
                    <input type="checkbox" checked={chosen.includes(s.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id].slice(0, 20) : c.filter((x) => x !== s.id)))} />
                    <span className="min-w-0 flex-1 truncate" translate="no">{s.title}</span>
                    <span className="text-xs text-zinc-500">{s.kind === 'note' ? 'note' : 'material'}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={recaps} onChange={(e) => setRecaps(e.target.checked)} />Also the recaps of recorded classes</label>
        </fieldset>
      </div>
    </Sheet>
  );
}

function PackView({ p, canEdit, onBack, onChanged }: { p: Pack; canEdit: boolean; onBack: () => void; onChanged: () => void }) {
  const [shown, setShown] = useState<number[]>([]);
  const [ticked, setTicked] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(`uv-pack:${p.id}`) ?? '[]'); } catch { return []; } });
  const [busy, setBusy] = useState(false);
  const tick = (i: number) => setTicked((t) => {
    const next = t.includes(i) ? t.filter((x) => x !== i) : [...t, i];
    try { localStorage.setItem(`uv-pack:${p.id}`, JSON.stringify(next)); } catch { /* private window: kept for this visit only */ }
    return next;
  });
  const patch = async (body: object, done: string) => {
    setBusy(true);
    try { await api.patch(`/revision-packs/${p.id}`, body); toast.success(done); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Remove this pack?', message: 'Students no longer see it.', destructive: true }))) return;
    try { await api.delete(`/revision-packs/${p.id}`); onBack(); onChanged(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); }
  };
  const print = () => {
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const { pack } = p;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}><ArrowLeft className="w-4 h-4" aria-hidden />Packs</button>
        <span className="me-auto" />
        <button type="button" className="btn-ghost btn-sm" onClick={print}><Printer className="w-4 h-4" aria-hidden />Print</button>
        {canEdit && <button type="button" className="btn-ghost btn-sm" onClick={() => void remove()}><Trash2 className="w-4 h-4" aria-hidden />Remove</button>}
        {canEdit && <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void patch({ published: !p.published }, p.published ? 'Hidden from students' : 'Shared with the class')}>{p.published ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}{p.published ? 'Hide from students' : 'Share with the class'}</button>}
      </div>
      <article className="print-report panel p-5 space-y-5">
        <header>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white" translate="no">{p.title}</h2>
          {pack.overview && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200"><MathText text={pack.overview} /></p>}
          {p.sources.length > 0 && <p className="mt-1 text-xs text-zinc-500">Made from: <span translate="no">{p.sources.join(', ')}</span>{p.usedAi ? ' · with AI: check it against the material' : ''}</p>}
        </header>
        {pack.topics.map((t, i) => (
          <section key={i} className="break-inside-avoid">
            <h3 className="font-semibold text-zinc-900 dark:text-white"><span className="text-zinc-500 tabular-nums">{i + 1}.</span> <span translate="no">{t.title}</span></h3>
            {t.summary && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200"><MathText text={t.summary} /></p>}
            {t.points.length > 0 && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm text-zinc-700 dark:text-zinc-200">{t.points.map((x, k) => <li key={k}><MathText text={x} /></li>)}</ul>}
            {t.terms.length > 0 && (
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                {t.terms.map((x, k) => <div key={k} className="contents"><dt className="font-medium text-zinc-900 dark:text-white">{x.term}</dt><dd className="text-zinc-600 dark:text-zinc-300"><MathText text={x.meaning} /></dd></div>)}
              </dl>
            )}
          </section>
        ))}
        {pack.questions.length > 0 && (
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Test yourself</h3>
            <ol className="mt-2 space-y-2">
              {pack.questions.map((q, i) => (
                <li key={i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
                  <p className="text-zinc-900 dark:text-white"><span className="tabular-nums text-zinc-500">{i + 1}.</span> <MathText text={q.q} /></p>
                  {shown.includes(i) ? <p className="mt-2 text-zinc-700 dark:text-zinc-200"><MathText text={q.a} /></p> : <button type="button" className="btn-ghost btn-sm print-hide mt-1" onClick={() => setShown((s) => [...s, i])}>Show the answer</button>}
                </li>
              ))}
            </ol>
          </section>
        )}
        {pack.checklist.length > 0 && (
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Before the exam</h3>
            <ul className="mt-2 space-y-1">
              {pack.checklist.map((c, i) => (
                <li key={i}><label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" className="mt-1" checked={ticked.includes(i)} onChange={() => tick(i)} /><span className={cn(ticked.includes(i) && 'text-zinc-500 line-through')}>{c}</span></label></li>
              ))}
            </ul>
            <p className="print-hide mt-2 text-xs text-zinc-500 tabular-nums">{ticked.length} of {pack.checklist.length} ticked (kept on this device)</p>
          </section>
        )}
      </article>
    </div>
  );
}
