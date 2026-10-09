'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Dna, Loader2, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { Band } from '@/lib/mastery';
import { BAND, MasteryMap } from './MasteryMap';

// Learning DNA for a course's teacher (Stage 5 · D1; src/server/learning-dna.ts): the class
// (concept × student, colour and number, with what to re-teach), the concepts (add, AI suggestions,
// edit, reorder) and tagging (which concepts each quiz question and rubric criterion tests, with AI
// suggestions to accept).

type View = 'class' | 'concepts' | 'tags';
interface Concept { id: string; name: string; description: string | null; parentId: string | null; position: number; tagged: number }
interface ClassData {
  students: { id: string; name: string }[];
  concepts: { id: string; name: string; parentId: string | null; cells: ({ level: number; n: number; band: Band } | null)[] }[];
  reteach: { conceptId: string; name: string; average: number | null; students: number; struggling: number }[];
  untagged: boolean;
}
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';

export function TeacherDna({ courseId }: { courseId: string }) {
  const [view, setView] = useState<View>('class');
  const concepts = useSWR<{ concepts: Concept[] }>(`/api/courses/${courseId}/concepts`, authedJson);
  const none = concepts.data && concepts.data.concepts.length === 0;
  return (
    <div className="space-y-4">
      <Segmented<View> label="Show" value={view} onChange={setView} className="w-full sm:w-auto" segments={[{ value: 'class', label: 'Class' }, { value: 'concepts', label: `Concepts${concepts.data ? ` (${concepts.data.concepts.length})` : ''}` }, { value: 'tags', label: 'Tagging' }]} />
      <motion.div key={view} variants={fadeUp} initial="hidden" animate="show">
        {view === 'class' ? (none ? <Empty onGo={() => setView('concepts')} /> : <ClassView courseId={courseId} onTag={() => setView('tags')} />)
          : view === 'concepts' ? <ConceptsView courseId={courseId} data={concepts.data} onChanged={() => void concepts.mutate()} />
          : none ? <Empty onGo={() => setView('concepts')} /> : <TagsView courseId={courseId} concepts={concepts.data?.concepts ?? []} onChanged={() => void concepts.mutate()} />}
      </motion.div>
    </div>
  );
}

function Empty({ onGo }: { onGo: () => void }) {
  return (
    <section className={`${card} p-8 text-center`}>
      <Dna className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden />
      <p className="font-semibold text-zinc-900 dark:text-white">Map the course’s concepts first</p>
      <p className="text-sm text-zinc-500 mt-1">List what students should master (the AI can suggest a list), then tag your quiz questions and rubric criteria with them.</p>
      <button type="button" onClick={onGo} className="btn-primary btn-sm mt-4"><Plus className="w-4 h-4" /> Add concepts</button>
    </section>
  );
}

function ClassView({ courseId, onTag }: { courseId: string; onTag: () => void }) {
  const { data, error, mutate } = useSWR<ClassData>(`/api/courses/${courseId}/mastery/class`, authedJson);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="table" />;
  if (!data.students.length) return <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No students in this course yet.</p>;
  return (
    <div className="space-y-4">
      {data.untagged && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">Nothing is tagged yet, so the map is empty. <button type="button" onClick={onTag} className="font-semibold underline">Tag quiz questions and rubric criteria</button> and it fills in from what students have already done.</p>
      )}
      {data.reteach.length > 0 && (
        <section className={`${card} p-4`} aria-labelledby="reteach-title">
          <h2 id="reteach-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-hidden /> Worth re-teaching</h2>
          <ul className="mt-2 space-y-1.5">
            {data.reteach.map((r) => <li key={r.conceptId} className="text-sm text-zinc-800 dark:text-zinc-100"><span className="font-semibold">{r.name}</span> <span className="text-zinc-500">· class average {Math.round((r.average ?? 0) * 100)}%, {r.struggling} of {r.students} still learning</span></li>)}
          </ul>
        </section>
      )}
      <section className={`${card} p-2 sm:p-3 overflow-x-auto`} aria-label="Concepts by student">
        <table className="text-xs border-separate border-spacing-1 min-w-full">
          <thead>
            <tr>
              <th scope="col" className="text-left font-semibold text-zinc-500 sticky left-0 tone-panel z-10 min-w-36 px-1">Concept</th>
              {data.students.map((s) => (
                <th key={s.id} scope="col" className="font-semibold text-zinc-600 dark:text-zinc-300 px-0.5 align-bottom">
                  <button type="button" onClick={() => setStudent(s)} className="block max-w-[4.5rem] truncate hover:underline mx-auto" title={s.name}>{s.name.split(' ')[0]}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.concepts.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="text-left font-medium text-zinc-800 dark:text-zinc-100 sticky left-0 tone-panel z-10 px-1 max-w-48 truncate" title={c.name}>{c.parentId ? <span className="text-zinc-400 mr-1" aria-hidden>↳</span> : null}{c.name}</th>
                {c.cells.map((cell, i) => (
                  <td key={data.students[i].id} className="p-0">
                    <span className={cn('block w-12 h-7 mx-auto rounded-md text-center leading-7 tabular-nums font-semibold', !cell ? 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-400' : cell.band === 'mastered' ? 'bg-emerald-500/80 text-white' : cell.band === 'nearly' ? 'bg-indigo-500/70 text-white' : 'bg-amber-500/80 text-zinc-950')}
                      title={`${data.students[i].name}: ${cell ? `${BAND[cell.band].label}, ${Math.round(cell.level * 100)}% from ${cell.n}` : 'no answers yet'}`}>
                      {cell ? Math.round(cell.level * 100) : '·'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
        {(['mastered', 'nearly', 'learning'] as Band[]).map((b) => <span key={b} className="inline-flex items-center gap-1"><span aria-hidden className={cn('w-3 h-3 rounded-sm', b === 'mastered' ? 'bg-emerald-500/80' : b === 'nearly' ? 'bg-indigo-500/70' : 'bg-amber-500/80')} />{BAND[b].label}</span>)}
        <span>· numbers are % mastery; tap a name for that student’s map</span>
      </p>
      {student && (
        <Sheet title={student.name} onClose={() => setStudent(null)}>
          <MasteryMap courseId={courseId} studentId={student.id} practice={false} />
        </Sheet>
      )}
    </div>
  );
}

function ConceptsView({ courseId, data, onChanged }: { courseId: string; data?: { concepts: Concept[] }; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<{ name: string; description: string; parent?: string; pick: boolean }[] | null>(null);
  const [editing, setEditing] = useState<Concept | null>(null);
  const key = `/api/courses/${courseId}/concepts`;
  const post = <T,>(body: Record<string, unknown>) => authedJson<T>(key, { method: 'POST', body: JSON.stringify(body) });
  if (!data) return <ContentSkeleton variant="list" />;
  const add = async (concepts: { name: string; description?: string; parent?: string }[], tag: string) => {
    setBusy(tag);
    try { const r = await post<{ added: string[] }>({ action: 'add', concepts }); haptic('success'); toast.success(`${r.added.length} added`); setName(''); setSuggested(null); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t add.')); }
    finally { setBusy(null); }
  };
  const suggest = async () => {
    setBusy('suggest');
    try { const r = await authedJson<{ concepts: { name: string; description: string; parent?: string }[] }>(`${key}/suggest`, { method: 'POST' }); setSuggested(r.concepts.map((c) => ({ ...c, pick: true }))); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t suggest concepts.')); }
    finally { setBusy(null); }
  };
  const move = async (i: number, d: -1 | 1) => {
    const ids = data.concepts.map((c) => c.id);
    const [x] = ids.splice(i, 1); ids.splice(i + d, 0, x);
    try { await post({ action: 'order', ids }); onChanged(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t reorder.')); }
  };
  const remove = async (c: Concept) => {
    if (!(await confirmDialog({ title: `Remove “${c.name}”?`, message: c.tagged ? `Its ${c.tagged} tag${c.tagged === 1 ? '' : 's'} go too.` : undefined, confirmLabel: 'Remove', destructive: true }))) return;
    try { await post({ action: 'remove', id: c.id }); onChanged(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove.')); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input aria-label="New concept" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); void add([{ name }], 'add'); } }} className="input flex-1 min-w-0" placeholder="A concept, like “Recursion”" />
        <button type="button" disabled={!!busy || !name.trim()} onClick={() => void add([{ name }], 'add')} className="btn-primary shrink-0">{busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</button>
      </div>
      <button type="button" disabled={!!busy} onClick={() => void suggest()} className="btn-secondary btn-sm">{busy === 'suggest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Suggest concepts from the course</button>
      {suggested && (
        <section className={`${card} p-3 space-y-2`} aria-label="Suggested concepts">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suggested · untick what you don’t want</p>
          <ul className="space-y-1">
            {suggested.map((c, i) => (
              <li key={c.name}>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={c.pick} onChange={() => setSuggested((cur) => cur!.map((x, j) => (j === i ? { ...x, pick: !x.pick } : x)))} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
                  <span><span className="font-semibold text-zinc-900 dark:text-white">{c.parent ? `${c.parent} › ` : ''}{c.name}</span> <span className="text-zinc-500">{c.description}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy || !suggested.some((c) => c.pick)} onClick={() => void add(suggested.filter((c) => c.pick), 'take')} className="btn-primary btn-sm">{busy === 'take' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Add {suggested.filter((c) => c.pick).length}</button>
            <button type="button" onClick={() => setSuggested(null)} className="btn-ghost btn-sm">Dismiss</button>
          </div>
        </section>
      )}
      {data.concepts.length > 0 && (
        <motion.ul variants={list} initial="hidden" animate="show" className={`${card} p-2 divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
          {data.concepts.map((c, i) => (
            <motion.li key={c.id} variants={fadeUp} className="flex items-center gap-2 px-2 py-2">
              <button type="button" onClick={() => setEditing(c)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.parentId ? <span className="text-zinc-400 mr-1" aria-hidden>↳</span> : null}{c.name}</span>
                <span className="block text-xs text-zinc-500 truncate">{c.tagged ? `${c.tagged} question${c.tagged === 1 ? '' : 's'} or criteria` : 'Nothing tagged yet'}{c.description ? ` · ${c.description}` : ''}</span>
              </button>
              <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => void move(i, -1)} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" aria-label={`Move ${c.name} down`} disabled={i === data.concepts.length - 1} onClick={() => void move(i, 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => void remove(c)} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {editing && <EditConcept key={editing.id} c={editing} all={data.concepts} courseId={courseId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function EditConcept({ c, all, courseId, onClose, onSaved }: { c: Concept; all: Concept[]; courseId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description ?? '');
  const [parentId, setParentId] = useState(c.parentId ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await authedJson(`/api/courses/${courseId}/concepts`, { method: 'POST', body: JSON.stringify({ action: 'edit', id: c.id, name, description, parentId: parentId || null }) }); toast.success('Saved'); onSaved(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save.')); setBusy(false); }
  };
  return (
    <Sheet title="Edit concept" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block"><span className="label">Name</span><input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" /></label>
        <label className="block"><span className="label">What mastering it means (optional)</span><textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="input mt-1" /></label>
        <label className="block"><span className="label">Part of</span>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="input mt-1">
            <option value="">Nothing (a main concept)</option>
            {all.filter((x) => x.id !== c.id && !x.parentId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
      </form>
    </Sheet>
  );
}

interface Taggable { id: string; title: string; items: { refId: string; text: string; concepts: string[] }[] }

function TagsView({ courseId, concepts, onChanged }: { courseId: string; concepts: Concept[]; onChanged: () => void }) {
  const key = `/api/courses/${courseId}/concepts/tags`;
  const { data, error, mutate } = useSWR<{ quizzes: Taggable[]; assignments: Taggable[] }>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const save = async (items: { kind: string; refId: string; conceptIds: string[] }[], done: string, tag: string) => {
    setBusy(tag);
    try { await authedJson(key, { method: 'POST', body: JSON.stringify({ items }) }); haptic('success'); toast.success(done); await mutate(); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the tags.')); }
    finally { setBusy(null); }
  };
  const suggest = async (kind: 'QUESTION' | 'CRITERION', id: string) => {
    setBusy(`ai-${id}`);
    try {
      const r = await authedJson<{ items: { kind: string; refId: string; conceptIds: string[] }[] }>(`/api/courses/${courseId}/concepts/suggest-tags`, { method: 'POST', body: JSON.stringify(kind === 'QUESTION' ? { quizId: id } : { assignmentId: id }) });
      if (!r.items.length) { toast('No suggestions this time'); return; }
      setBusy(null);
      await save(r.items, `${r.items.length} tagged by the AI: check them below`, `ai-${id}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t suggest tags.')); setBusy(null); }
  };
  const group = (kind: 'QUESTION' | 'CRITERION', title: string, list_: Taggable[]) => list_.length > 0 && (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {list_.map((g) => (
        <div key={g.id} className={`${card} p-3 space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-zinc-900 dark:text-white text-sm truncate">{g.title}</p>
            {g.items.length > 0 && <button type="button" disabled={!!busy} onClick={() => void suggest(kind, g.id)} className="btn-ghost btn-sm shrink-0">{busy === `ai-${g.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Suggest</button>}
          </div>
          {g.items.length === 0 ? <p className="text-xs text-zinc-500">{kind === 'QUESTION' ? 'No questions.' : 'No rubric.'}</p> : (
            <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {g.items.map((it) => (
                <li key={it.refId} className="py-2 space-y-1.5">
                  <p className="text-sm text-zinc-800 dark:text-zinc-100 line-clamp-2">{it.text}</p>
                  <div className="flex flex-wrap gap-1">
                    {concepts.map((c) => {
                      const on = it.concepts.includes(c.id);
                      return (
                        <button key={c.id} type="button" aria-pressed={on} disabled={!!busy} onClick={() => void save([{ kind, refId: it.refId, conceptIds: on ? it.concepts.filter((x) => x !== c.id) : [...it.concepts, c.id] }], on ? 'Tag removed' : 'Tagged', it.refId)}
                          className={cn('min-h-8 px-2.5 rounded-full border text-[11px] font-semibold transition-colors', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]')}>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
  if (!data.quizzes.length && !data.assignments.length) return <p className={`${card} p-8 text-center text-sm text-zinc-500`}>This course has no quizzes or assignments to tag yet.</p>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Tap the concepts each question or rubric criterion tests. Students’ past answers count straight away.</p>
      {group('QUESTION', 'Quizzes', data.quizzes)}
      {group('CRITERION', 'Assignment rubrics', data.assignments)}
    </div>
  );
}
