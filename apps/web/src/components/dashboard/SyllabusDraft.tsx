'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';

// An AI first draft of the course's modules (Stage 5 · B2, src/server/syllabus.ts): the teacher picks
// the level and number of weeks, edits what comes back (titles, summaries, topics, outcomes) and adds
// it. The new modules start hidden from students; each topic is a page to fill in.

interface Draft { outcomes: string[]; skills: string[]; modules: { title: string; summary: string; topics: string[] }[] }

const LEVELS = [
  { value: 'school', label: 'School (ages 14–18)' }, { value: 'first-year', label: 'First year, no background' },
  { value: 'intermediate', label: 'Second or third year' }, { value: 'advanced', label: 'Final year' }, { value: 'postgraduate', label: 'Postgraduate' },
];

export function SyllabusDraft({ courseId, onClose, onAdded }: { courseId: string; onClose: () => void; onAdded: () => void }) {
  const [level, setLevel] = useState('first-year');
  const [weeks, setWeeks] = useState(12);
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [useSkills, setUseSkills] = useState(true);
  const [busy, setBusy] = useState<'draft' | 'add' | null>(null);

  const ask = async () => {
    setBusy('draft');
    try {
      const out = await authedJson<{ draft: Draft }>(`/api/courses/${courseId}/syllabus/draft`, { method: 'POST', body: JSON.stringify({ level, weeks, notes }) });
      setDraft(out.draft);
    } catch (e) {
      toast.error(errorMessage(e, 'The AI couldn’t draft a syllabus this time.'));
    } finally {
      setBusy(null);
    }
  };
  const add = async () => {
    if (!draft) return;
    setBusy('add');
    try {
      const out = await authedJson<{ modules: number }>(`/api/courses/${courseId}/syllabus`, { method: 'POST', body: JSON.stringify({ draft, useSkills }) });
      toast.success(`${out.modules} module${out.modules === 1 ? '' : 's'} added, hidden from students until you publish them`);
      onAdded();
    } catch (e) {
      toast.error(errorMessage(e, 'The modules couldn’t be added. Try again.'));
    } finally {
      setBusy(null);
    }
  };
  const setModule = (i: number, m: Partial<Draft['modules'][number]>) => draft && setDraft({ ...draft, modules: draft.modules.map((x, j) => (j === i ? { ...x, ...m } : x)) });

  return (
    <Sheet title="Draft a syllabus with AI" onClose={() => { if (!busy) onClose(); }}
      footer={draft ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(null)} disabled={!!busy} className="btn-secondary flex-1 justify-center">Start again</button>
          <button type="button" onClick={() => void add()} disabled={!!busy || !draft.modules.length} className="btn-primary flex-1 justify-center">{busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" />} Add {draft.modules.length} module{draft.modules.length === 1 ? '' : 's'}</button>
        </div>
      ) : (
        <button type="button" onClick={() => void ask()} disabled={!!busy} className="btn-primary w-full justify-center">{busy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy === 'draft' ? 'Drafting…' : 'Draft it'}</button>
      )}>
      {!draft ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">A first plan from the course’s name and description: one module a week with its topics, learning outcomes and skills. You edit it before anything is added. It uses one AI request.</p>
          <div>
            <label htmlFor="syl-level" className="label">Level</label>
            <select id="syl-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </div>
          <div>
            <label htmlFor="syl-weeks" className="label">Weeks</label>
            <input id="syl-weeks" type="number" inputMode="numeric" min={1} max={20} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="input w-28" />
          </div>
          <div>
            <label htmlFor="syl-notes" className="label">Anything to include (optional)</label>
            <textarea id="syl-notes" rows={3} maxLength={800} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="e.g. a project in the last three weeks, Python only" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="syl-out">
            <h3 id="syl-out" className="text-sm font-bold text-zinc-900 dark:text-white">Learning outcomes</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">They become a “Course outcomes” page in the first module.</p>
            <ul className="mt-2 space-y-2">
              {draft.outcomes.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <input aria-label={`Outcome ${i + 1}`} value={o} maxLength={200} onChange={(e) => setDraft({ ...draft, outcomes: draft.outcomes.map((x, j) => (j === i ? e.target.value : x)) })} className="input" />
                  <button type="button" aria-label={`Remove outcome ${i + 1}`} onClick={() => setDraft({ ...draft, outcomes: draft.outcomes.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </section>
          {draft.skills.length >= 3 && (
            <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input type="checkbox" className="mt-1" checked={useSkills} onChange={(e) => setUseSkills(e.target.checked)} />
              <span>Use these as the course’s skills: <span className="font-semibold">{draft.skills.join(', ')}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400">Graded work then counts as evidence for them on students’ passports.</span></span>
            </label>
          )}
          <section aria-labelledby="syl-mods">
            <h3 id="syl-mods" className="text-sm font-bold text-zinc-900 dark:text-white">Modules</h3>
            <ol className="mt-2 space-y-3">
              {draft.modules.map((m, i) => (
                <li key={i} className="panel p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 w-12 shrink-0">Week {i + 1}</span>
                    <input aria-label={`Week ${i + 1} title`} value={m.title} maxLength={120} onChange={(e) => setModule(i, { title: e.target.value })} className="input" />
                    <button type="button" aria-label={`Remove week ${i + 1}`} onClick={() => setDraft({ ...draft, modules: draft.modules.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <textarea aria-label={`Week ${i + 1} summary`} rows={2} maxLength={400} value={m.summary} onChange={(e) => setModule(i, { summary: e.target.value })} className="input text-sm" />
                  <ul className="space-y-1.5">
                    {m.topics.map((t, k) => (
                      <li key={k} className="flex gap-2">
                        <input aria-label={`Week ${i + 1} topic ${k + 1}`} value={t} maxLength={120} onChange={(e) => setModule(i, { topics: m.topics.map((x, j) => (j === k ? e.target.value : x)) })} className="input text-sm py-1.5" />
                        <button type="button" aria-label={`Remove topic ${k + 1} of week ${i + 1}`} onClick={() => setModule(i, { topics: m.topics.filter((_, j) => j !== k) })} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                  {m.topics.length < 6 && <button type="button" onClick={() => setModule(i, { topics: [...m.topics, ''] })} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add a topic</button>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  );
}
