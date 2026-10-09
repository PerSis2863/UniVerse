'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BookOpen, Brain, Check, ChevronLeft, FileText, GraduationCap, Layers, Loader2, NotebookPen, Plus, RefreshCw, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

interface CourseItem { id: string; code: string; name: string; emoji: string | null; materials: number; readySources: number }
interface CoursesResp { courses: CourseItem[]; cards: { due: number; total: number }; canManage: boolean }
interface Source { id: string; title: string; kind: string; status: 'READY' | 'FAILED' | 'PENDING' | 'UNSUPPORTED'; error: string | null; chars: number; materialId: string | null }
interface SourcesResp { course: { id: string; code: string; name: string }; canManage: boolean; sources: Source[] }
interface Citation { n: number; title: string; excerpt: string }
interface Turn { role: 'user' | 'tutor'; text: string; citations?: Citation[]; grounded?: boolean }
interface Question { question: string; options: string[]; answer: number; explanation: string; sourceTitle: string | null }
interface Card { id: string; front: string; back: string; sourceTitle: string | null; interval: number; reps: number }

const TABS = [
  { id: 'ask', label: 'Ask', icon: Brain },
  { id: 'practice', label: 'Practice', icon: GraduationCap },
  { id: 'cards', label: 'Flashcards', icon: Layers },
  { id: 'sources', label: 'Sources', icon: FileText },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function TutorStudio() {
  const { data, mutate } = useSWR<CoursesResp>('/api/tutor/courses', authedJson);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('ask');
  const [topic, setTopic] = useState('');
  const course = data?.courses.find((c) => c.id === courseId);
  // ?course=<id>&tab=practice|cards&topic=… (from Learning DNA's "study next", Stage 5 · D1) opens straight there.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      const c = q.get('course'), t2 = q.get('tab');
      if (c) setCourseId(c);
      if (t2 === 'practice' || t2 === 'cards' || t2 === 'ask') setTab(t2);
      setTopic((q.get('topic') ?? '').slice(0, 200));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!data) return <div className="p-10"><ContentSkeleton variant="list" /></div>;

  if (!course) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5 min-w-0 w-full">
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] to-fuchsia-500/[0.06] p-5 sm:p-6">
          <p className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /> Your course tutor</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl">Ask questions about a course and get answers from <b>your teacher’s own materials</b>, with the source for every point. Practise with generated questions and learn with flashcards that come back just before you’d forget them.</p>
          {data.cards.total > 0 && <p className="mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-300">{data.cards.due ? `${data.cards.due} flashcard${data.cards.due === 1 ? '' : 's'} to review today` : 'All flashcards reviewed — nice work.'}</p>}
        </div>
        {data.courses.length === 0 ? (
          <p className="text-sm text-zinc-500">You’re not enrolled in any courses yet.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.courses.map((c) => (
              <li key={c.id}>
                <button onClick={() => { setCourseId(c.id); setTab('ask'); }} className="w-full text-left rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 hover:border-indigo-400/60 transition-colors">
                  <p className="text-2xl">{c.emoji || '📘'}</p>
                  <p className="mt-2 font-bold text-zinc-900 dark:text-white">{c.name}</p>
                  <p className="text-xs text-zinc-500">{c.code} · {c.readySources ? `${c.readySources} source${c.readySources === 1 ? '' : 's'} ready` : c.materials ? `${c.materials} material${c.materials === 1 ? '' : 's'} to prepare` : 'No materials yet'}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-w-0 w-full">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => { setCourseId(null); void mutate(); }} aria-label="All courses" className="p-2 -ml-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <p className="font-black text-zinc-900 dark:text-white truncate">{course.emoji || '📘'} {course.name}</p>
          <p className="text-xs text-zinc-500">{course.code}</p>
        </div>
      </div>
      <div role="tablist" className="flex gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('relative isolate flex-1 min-w-[4.75rem] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors', tab === t.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-500')}>
            {tab === t.id && <TabPill id="tutor-tab" variant="soft" />}
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'ask' && <AskPanel courseId={course.id} onNeedSources={() => setTab('sources')} />}
      {tab === 'practice' && <PracticePanel key={`p-${topic}`} courseId={course.id} initialTopic={topic} onNeedSources={() => setTab('sources')} />}
      {tab === 'cards' && <CardsPanel key={`c-${topic}`} courseId={course.id} initialTopic={topic} onNeedSources={() => setTab('sources')} />}
      {tab === 'sources' && <SourcesPanel courseId={course.id} onChanged={() => mutate()} />}
    </div>
  );
}

/** Shows [n] citation markers as small badges. */
function WithCitations({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\d+\])/g).map((part, i) =>
        /^\[\d+\]$/.test(part)
          ? <sup key={i} className="mx-0.5 px-1 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">{part.slice(1, -1)}</sup>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function NeedSources({ onGo, message }: { onGo: () => void; message: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-800 dark:text-amber-200">
      {message} <button onClick={onGo} className="font-semibold underline">Open Sources</button>
    </div>
  );
}

function AskPanel({ courseId, onNeedSources }: { courseId: string; onNeedSources: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [needSources, setNeedSources] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text: question }]);
    setQ(''); setBusy(true);
    try {
      const r = await authedJson<{ answer: string; grounded: boolean; citations: Citation[] }>(`/api/tutor/${courseId}/ask`, { method: 'POST', body: JSON.stringify({ question, history }) });
      setTurns((t) => [...t, { role: 'tutor', text: r.answer, citations: r.citations, grounded: r.grounded }]);
    } catch (e) {
      const err = e as Error & { body?: { code?: string } };
      if (err.body?.code === 'no-sources') setNeedSources(true);
      setTurns((t) => [...t, { role: 'tutor', text: err.message }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] flex flex-col min-h-[28rem]">
      <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[60vh]">
        {needSources && <NeedSources onGo={onNeedSources} message="The tutor needs course materials to answer from." />}
        {turns.length === 0 && (
          <div className="text-center py-8">
            <Brain className="w-10 h-10 mx-auto text-indigo-400" />
            <p className="mt-2 font-bold text-zinc-900 dark:text-white">Ask anything about this course</p>
            <p className="text-sm text-zinc-500">Answers come from the course materials, with sources.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['Summarise the key ideas of this course', 'Explain the hardest concept simply', 'What should I revise for the exam?'].map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-indigo-500/10">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap', t.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100 rounded-bl-md')}>
              {t.role === 'tutor' ? <WithCitations text={t.text} /> : t.text}
              {t.role === 'tutor' && t.grounded === false && t.citations !== undefined && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Not found in the course materials — check with your teacher.</p>}
              {!!t.citations?.length && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 list-none">Sources ({t.citations.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {t.citations.map((c) => (
                      <li key={c.n} className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
                        <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200"><span className="text-indigo-500">[{c.n}]</span> {c.title}</p>
                        <p className="mt-1 text-[11px] text-zinc-500 line-clamp-4">“{c.excerpt}…”</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Looking through the course…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="p-3 border-t border-zinc-100 dark:border-white/[0.06] flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={1500} placeholder="Ask a question…" aria-label="Question" className="flex-1 min-w-0 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <button disabled={busy || !q.trim()} aria-label="Ask" className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50"><Send className="w-4 h-4" /></button>
      </form>
      <p className="px-4 pb-3 text-[11px] text-zinc-500">AI can make mistakes — check the sources. Your questions aren’t stored.</p>
    </div>
  );
}

function PracticePanel({ courseId, initialTopic = '', onNeedSources }: { courseId: string; initialTopic?: string; onNeedSources: () => void }) {
  const [topic, setTopic] = useState(initialTopic);
  const [busy, setBusy] = useState(false);
  const [qs, setQs] = useState<Question[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [needSources, setNeedSources] = useState(false);

  const make = async () => {
    setBusy(true); setQs(null); setPicked({});
    try {
      const r = await authedJson<{ questions: Question[] }>(`/api/tutor/${courseId}/practice`, { method: 'POST', body: JSON.stringify({ topic, count: 5 }) });
      setQs(r.questions);
    } catch (e) {
      const err = e as Error & { body?: { code?: string } };
      if (err.body?.code === 'no-sources') setNeedSources(true); else toast.error(err.message);
    } finally { setBusy(false); }
  };
  const answered = qs ? Object.keys(picked).length : 0;
  const correct = qs ? qs.filter((q, i) => picked[i] === q.answer).length : 0;

  return (
    <div className="space-y-4">
      {needSources && <NeedSources onGo={onNeedSources} message="Practice questions are made from the course materials, and there are none ready yet." />}
      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Topic (optional), e.g. recursion" aria-label="Topic" className="flex-1 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <button onClick={make} aria-busy={busy || undefined} disabled={busy} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {qs ? 'New questions' : 'Make 5 questions'}</button>
      </div>
      {qs && (
        <>
          {answered === qs.length && <div role="status" className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-4 text-sm font-semibold text-indigo-700 dark:text-indigo-200">You got {correct} of {qs.length}. {correct === qs.length ? 'Excellent!' : 'Read the explanations, then try new questions.'}</div>}
          <ol className="space-y-3">
            {qs.map((q, i) => {
              const choice = picked[i];
              return (
                <li key={i} className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5">
                  <p className="font-semibold text-zinc-900 dark:text-white">{i + 1}. {q.question}</p>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((o, j) => {
                      const show = choice !== undefined;
                      return (
                        <button key={j} disabled={show} onClick={() => setPicked((p) => ({ ...p, [i]: j }))}
                          className={cn('text-left text-sm px-3.5 py-2.5 rounded-xl border transition-colors',
                            !show && 'border-zinc-200 dark:border-white/10 hover:border-indigo-400 text-zinc-700 dark:text-zinc-200',
                            show && j === q.answer && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                            show && j === choice && j !== q.answer && 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                            show && j !== q.answer && j !== choice && 'border-zinc-200 dark:border-white/10 text-zinc-400')}>
                          <span className="inline-flex items-center gap-2">{show && j === q.answer ? <Check className="w-4 h-4" /> : show && j === choice ? <X className="w-4 h-4" /> : <span className="w-4 text-center text-xs font-bold">{String.fromCharCode(65 + j)}</span>} {o}</span>
                        </button>
                      );
                    })}
                  </div>
                  {choice !== undefined && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{q.explanation}{q.sourceTitle && <span className="block mt-1 text-[11px] text-zinc-500">Source: {q.sourceTitle}</span>}</p>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function CardsPanel({ courseId, initialTopic = '', onNeedSources }: { courseId: string; initialTopic?: string; onNeedSources: () => void }) {
  const { data, mutate } = useSWR<{ cards: Card[]; due: number; total: number }>(`/api/tutor/cards?due=1&courseId=${courseId}`, authedJson);
  const [topic, setTopic] = useState(initialTopic);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [needSources, setNeedSources] = useState(false);
  const card = data?.cards[0];

  const generate = async () => {
    setBusy(true);
    try {
      const r = await authedJson<{ added: number }>(`/api/tutor/${courseId}/flashcards`, { method: 'POST', body: JSON.stringify({ topic }) });
      toast.success(`${r.added} flashcards added to your deck`);
      await mutate();
    } catch (e) {
      const err = e as Error & { body?: { code?: string } };
      if (err.body?.code === 'no-sources') setNeedSources(true); else toast.error(err.message);
    } finally { setBusy(false); }
  };
  const review = async (grade: 'again' | 'hard' | 'good' | 'easy') => {
    if (!card) return;
    setFlipped(false);
    mutate((d) => d && { ...d, cards: d.cards.slice(1), due: Math.max(0, d.due - (grade === 'again' ? 0 : 1)) }, { revalidate: false });
    setDone((n) => n + 1);
    try { await authedJson(`/api/tutor/cards/${card.id}`, { method: 'POST', body: JSON.stringify({ grade }) }); }
    catch (e) { toast.error((e as Error).message); }
    if ((data?.cards.length ?? 0) <= 1) void mutate();
  };
  const remove = async () => {
    if (!card || !(await confirmDialog({ title: 'Delete this card?', confirmLabel: 'Delete', destructive: true }))) return;
    await authedJson(`/api/tutor/cards/${card.id}`, { method: 'DELETE' }).catch(() => {});
    setFlipped(false); void mutate();
  };

  return (
    <div className="space-y-4">
      {needSources && <NeedSources onGo={onNeedSources} message="Flashcards are made from the course materials, and there are none ready yet." />}
      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Topic (optional)" aria-label="Flashcard topic" className="flex-1 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <button onClick={generate} aria-busy={busy || undefined} disabled={busy} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Make flashcards</button>
      </div>
      <p className="text-xs text-zinc-500">{data ? `${data.due} to review now · ${data.total} in this course’s deck${done ? ` · ${done} reviewed this session` : ''}` : ' '}</p>
      {!data ? <div className="p-10"><ContentSkeleton variant="list" /></div>
        : !card ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <Layers className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="mt-2 font-bold text-zinc-900 dark:text-white">{data.total ? 'All caught up!' : 'No flashcards yet'}</p>
            <p className="text-sm text-zinc-500">{data.total ? 'Cards come back when it’s time to review them.' : 'Make some from the course materials above.'}</p>
          </div>
        ) : (
          <div>
            <button onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Show question' : 'Show answer'} className="w-full min-h-[14rem] rounded-3xl border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-white to-indigo-50/60 dark:from-white/[0.04] dark:to-indigo-500/[0.06] p-6 flex flex-col items-center justify-center text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">{flipped ? 'Answer' : 'Question'}</p>
              <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white whitespace-pre-wrap">{flipped ? card.back : card.front}</p>
              {!flipped && <p className="mt-4 text-xs text-zinc-500">Tap to see the answer</p>}
              {flipped && card.sourceTitle && <p className="mt-4 text-[11px] text-zinc-500">Source: {card.sourceTitle}</p>}
            </button>
            {flipped ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {([['again', 'Again', 'bg-rose-500/10 text-rose-600 dark:text-rose-300'], ['hard', 'Hard', 'bg-amber-500/10 text-amber-700 dark:text-amber-300'], ['good', 'Good', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'], ['easy', 'Easy', 'bg-sky-500/10 text-sky-700 dark:text-sky-300']] as const).map(([g, l, cls]) => (
                  <button key={g} onClick={() => review(g)} className={cn('py-2.5 rounded-xl text-sm font-semibold', cls)}>{l}</button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex justify-between">
                <button onClick={remove} className="text-xs text-zinc-500 inline-flex items-center gap-1 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /> Delete card</button>
                <button onClick={() => setFlipped(true)} className="text-sm font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Show answer</button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function SourcesPanel({ courseId, onChanged }: { courseId: string; onChanged: () => void }) {
  const { data, mutate } = useSWR<SourcesResp>(`/api/tutor/${courseId}/sources`, authedJson);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState<{ title: string; text: string } | null>(null);
  const pending = data?.sources.filter((s) => s.status === 'PENDING').length ?? 0;

  const prepare = async () => {
    setPreparing(true);
    try {
      let r: { read: number; ready: number; remaining: number };
      do {
        r = await authedJson(`/api/tutor/${courseId}/sources`, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
        await mutate();
      } while (r.remaining > 0 && r.read > 0);
      toast.success('Materials are ready for the tutor');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setPreparing(false); }
  };
  const saveNote = async () => {
    if (!note) return;
    try {
      await authedJson(`/api/tutor/${courseId}/sources`, { method: 'POST', body: JSON.stringify(note) });
      toast.success('Note added'); setNote(null); await mutate(); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (s: Source) => {
    if (!(await confirmDialog({ title: `Remove “${s.title}”?`, message: s.kind === 'material' ? 'The tutor stops using it. You can prepare it again later.' : 'The note is deleted.', confirmLabel: 'Remove', destructive: true }))) return;
    try { await authedJson(`/api/tutor/${courseId}/sources?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' }); await mutate(); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!data) return <div className="p-10"><ContentSkeleton variant="list" /></div>;
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-zinc-900 dark:text-white flex-1">What the tutor reads</p>
          {pending > 0 && <button onClick={prepare} disabled={preparing} className="btn-primary">{preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Prepare {pending} material{pending === 1 ? '' : 's'}</button>}
          {data.canManage && !note && <button onClick={() => setNote({ title: '', text: '' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><NotebookPen className="w-4 h-4" /> Add a note</button>}
        </div>
        <p className="mt-1 text-xs text-zinc-500">PDFs and text files from the course materials, plus notes from the teacher (e.g. the syllabus or key definitions). Each file is read once.</p>
        {note && (
          <div className="mt-4 space-y-2">
            <input value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} maxLength={120} placeholder="Title, e.g. Syllabus" aria-label="Note title" className="w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <textarea value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} rows={6} maxLength={60000} placeholder="Paste or write the content…" aria-label="Note text" className="w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNote(null)} className="px-3 py-2 rounded-xl text-sm text-zinc-500">Cancel</button>
              <button onClick={saveNote} className="btn-primary">Save note</button>
            </div>
          </div>
        )}
        {data.sources.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No materials yet. {data.canManage ? 'Upload PDFs to the course, or add a note.' : 'Your teacher hasn’t added any materials.'}</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {data.sources.map((s) => (
              <li key={s.id} className="py-2.5 flex items-center gap-3">
                {s.kind === 'note' ? <NotebookPen className="w-4 h-4 text-violet-500 shrink-0" /> : <BookOpen className="w-4 h-4 text-sky-500 shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-zinc-800 dark:text-zinc-200 truncate">{s.title}</span>
                  <span className={cn('block text-[11px]', s.status === 'READY' ? 'text-emerald-600 dark:text-emerald-400' : s.status === 'FAILED' ? 'text-rose-500' : 'text-zinc-500')}>
                    {s.status === 'READY' ? `Ready · ${Math.round(s.chars / 1000)}k characters` : s.status === 'FAILED' ? s.error : s.status === 'PENDING' ? 'Not prepared yet' : 'This file type can’t be read (use PDF or text)'}
                  </span>
                </span>
                {data.canManage && (s.status === 'READY' || s.status === 'FAILED') && <button onClick={() => remove(s)} aria-label={`Remove ${s.title}`} className="p-1.5 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
