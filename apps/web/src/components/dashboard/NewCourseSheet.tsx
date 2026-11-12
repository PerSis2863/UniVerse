'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FlaskConical, Loader2, MessagesSquare, MonitorPlay, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { TemplateCards, type TemplateOption } from '@/components/ui/TemplateCards';
import { api, errorMessage } from '@/lib/api';

// M142: a teacher's "New course", after the Ballast reels' "New agent" window: start from a kind of
// course (it sets the credits and what students will do), name it, tick what students will do, and the
// description writes itself until the teacher types their own. It starts as a draft, as before.

type Kind = 'lecture' | 'lab' | 'seminar' | 'project' | 'online' | 'scratch';
type Template = TemplateOption<Kind> & { credits: number; blurb: string; does: string[] };

const KINDS: Template[] = [
  { value: 'lecture', title: 'Lecture course', sub: 'Weekly lectures, homework and a final exam', icon: BookOpen, credits: 3, blurb: 'Weekly lectures with homework and exams.', does: ['Weekly lectures', 'Homework every week', 'A midterm', 'A final exam'] },
  { value: 'lab', title: 'Lab course', sub: 'Hands-on sessions with a graded report each', icon: FlaskConical, credits: 4, blurb: 'Hands-on lab sessions, each with a graded report.', does: ['A lab session every week', 'A report after each lab', 'A safety briefing', 'A practical exam'] },
  { value: 'seminar', title: 'Seminar', sub: 'Small-group discussion and a term paper', icon: MessagesSquare, credits: 2, blurb: 'Small-group discussion of weekly readings.', does: ['Weekly readings', 'Leading one discussion', 'Short reflections', 'A term paper'] },
  { value: 'project', title: 'Project course', sub: 'Team projects with milestones and a demo', icon: Users, credits: 4, blurb: 'Students build a project in teams.', does: ['Teams of 3 to 5', 'A milestone every few weeks', 'Peer review', 'A final demo'] },
  { value: 'online', title: 'Online course', sub: 'Self-paced lessons, quizzes and a forum', icon: MonitorPlay, credits: 3, blurb: 'Self-paced online lessons.', does: ['Recorded lessons', 'A quiz after each unit', 'A discussion forum', 'An online final'] },
  { value: 'scratch', title: 'Start from scratch', sub: 'Describe the course in your own words', icon: Plus, credits: 3, blurb: '', does: [] },
];

/** The description a template and the ticked activities give. */
const writeUp = (t: Template, does: string[]) =>
  [t.blurb, does.length ? `Students: ${does.map((d) => d.charAt(0).toLowerCase() + d.slice(1)).join(', ')}.` : ''].filter(Boolean).join(' ');

const LABEL = 'block text-[13px] font-medium text-zinc-700 dark:text-zinc-300';

export function NewCourseSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('3');
  const [does, setDoes] = useState<string[]>([]);
  const [desc, setDesc] = useState('');
  const [ownWords, setOwnWords] = useState(false);
  const [busy, setBusy] = useState(false);
  const tpl = KINDS.find((k) => k.value === kind) ?? null;

  const choose = (k: Kind) => {
    const t = KINDS.find((x) => x.value === k)!;
    setKind(k);
    setCredits(String(t.credits));
    setDoes(t.does);
    if (!ownWords) setDesc(writeUp(t, t.does));
  };
  const tick = (d: string) => {
    if (!tpl) return;
    const next = does.includes(d) ? does.filter((x) => x !== d) : tpl.does.filter((x) => x === d || does.includes(x));
    setDoes(next);
    if (!ownWords) setDesc(writeUp(tpl, next));
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) { toast.error('Please fill in the course name and code.'); return; }
    setBusy(true);
    try {
      await api.post('/courses', { name: name.trim(), code: code.trim().toUpperCase(), credits: Math.min(Math.max(parseInt(credits) || 3, 1), 12), description: desc.trim() || undefined });
      toast.success(`Course "${name.trim()}" created`, { description: 'It starts as a draft. Your admin can enroll students, and you can post materials on Blackboard.' });
      onClose();
      router.push('/teacher/blackboard');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the course'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="New course" wide onClose={onClose} footer={
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-xs text-zinc-500 dark:text-zinc-400">You can change all of this later.</p>
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button type="submit" form="new-course" disabled={busy || !name.trim() || !code.trim()} className="btn-primary btn-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create course
        </button>
      </div>
    }>
      <form id="new-course" onSubmit={create} className="space-y-5">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 -mt-1">Start from a kind of course. It starts as a draft: students see it once your admin enrolls them.</p>
        <div>
          <p className={`${LABEL} mb-2`}>Start from</p>
          <TemplateCards options={KINDS} value={kind} onChange={choose} label="Start from" className="sm:grid-cols-3" />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className={LABEL}>Name
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="e.g. Introduction to Machine Learning" />
          </label>
          <label className={LABEL}>Code
            <input required maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input mt-1 font-mono" placeholder="e.g. CS501" />
          </label>
          <label className={LABEL}>Credits
            <select value={credits} onChange={(e) => setCredits(e.target.value)} className="input mt-1">
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <div className="flex items-center justify-between gap-3 mb-2">
            <legend className={LABEL}>What students will do</legend>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{!tpl ? 'Pick a kind first' : tpl.does.length ? `${does.length} of ${tpl.does.length} chosen` : 'In your own words, below'}</span>
          </div>
          {!tpl ? (
            <div aria-hidden className="rounded-xl border border-zinc-200 dark:border-white/[0.08] divide-y divide-zinc-200 dark:divide-white/[0.08]">
              {[52, 64, 40, 58].map((w) => (
                <div key={w} className="flex items-center gap-3 px-3.5 h-11">
                  <span className="w-4 h-4 rounded bg-zinc-100 dark:bg-white/[0.06]" />
                  <span className="h-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06]" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : tpl.does.length > 0 && (
            <ul key={tpl.value} className="app-in rounded-xl border border-zinc-200 dark:border-white/[0.08] divide-y divide-zinc-200 dark:divide-white/[0.08]">
              {tpl.does.map((d) => (
                <li key={d}>
                  <label className="flex items-center gap-3 px-3.5 h-11 text-[13.5px] text-zinc-900 dark:text-white cursor-pointer">
                    <input type="checkbox" checked={does.includes(d)} onChange={() => tick(d)} className="w-4 h-4 accent-indigo-600" />{d}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <label className={LABEL}>Description
          <textarea rows={3} maxLength={2000} value={desc} onChange={(e) => { setDesc(e.target.value); setOwnWords(true); }} className="input mt-1 resize-none" placeholder="What the course covers…" />
        </label>
      </form>
    </Sheet>
  );
}
