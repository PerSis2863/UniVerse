'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Pause, Play, Plus, Printer, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import { poemLines, typingScore } from '@/lib/tools-5';
import { cn } from '@/lib/utils';
import { Btn, CopyBtn, Field, area, save } from './QuickTools';
import { printOnly, uid, useKept } from './kept';
import { rnd, Stat } from './bits';

// Collaborate → Create → Write, fifth set (M75): an essay planner, writing prompts, a poem helper,
// acrostics, typing practice, a glossary, Cornell notes and interview practice. Kept on the device
// (and saved to the account with Save).

export type PenId = 'essay' | 'prompts' | 'poem' | 'acrostic' | 'typing' | 'glossary' | 'cornell' | 'interview';

export function PenTool({ id }: { id: PenId }) {
  const T = { essay: Essay, prompts: Prompts, poem: Poem, acrostic: Acrostic, typing: Typing, glossary: Glossary, cornell: Cornell, interview: Interview }[id];
  return <T />;
}

interface Para { id: string; point: string; evidence: string; explain: string }
/** Essay planner: a question, a thesis, a paragraph per point (point, evidence, explain), a conclusion. */
function Essay() {
  const [e, setE] = useKept('uv-essay', () => ({ q: 'Should homework be banned?', thesis: '', intro: '', paras: [{ id: uid(), point: '', evidence: '', explain: '' }] as Para[], conclusion: '' }));
  const put = (id: string, p: Partial<Para>) => setE({ ...e, paras: e.paras.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const plan = `# ${e.q}\n\n**Thesis:** ${e.thesis}\n\n## Introduction\n${e.intro}\n\n${e.paras.map((p, i) => `## Paragraph ${i + 1}\n- Point: ${p.point}\n- Evidence: ${p.evidence}\n- Explain: ${p.explain}`).join('\n\n')}\n\n## Conclusion\n${e.conclusion}`;
  const filled = [e.thesis, e.intro, e.conclusion, ...e.paras.flatMap((p) => [p.point, p.evidence, p.explain])], done = filled.filter((x) => x.trim()).length;
  return (
    <div className="space-y-3">
      <Field label="The question"><input className="input font-bold" value={e.q} onChange={(x) => setE({ ...e, q: x.target.value })} /></Field>
      <Field label="Your answer in one sentence (thesis)"><textarea className="input min-h-[60px]" value={e.thesis} onChange={(x) => setE({ ...e, thesis: x.target.value })} placeholder="Homework should be limited, because…" /></Field>
      <Field label="Introduction: hook the reader, give background"><textarea className="input min-h-[60px]" value={e.intro} onChange={(x) => setE({ ...e, intro: x.target.value })} /></Field>
      {e.paras.map((p, i) => (
        <fieldset key={p.id} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 grid gap-2 lg:grid-cols-3">
          <legend className="px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Paragraph {i + 1} {e.paras.length > 1 && <button type="button" onClick={() => setE({ ...e, paras: e.paras.filter((x) => x.id !== p.id) })} className="ms-1 underline">remove</button>}</legend>
          <Field label="Point"><textarea className="input min-h-[70px]" value={p.point} onChange={(x) => put(p.id, { point: x.target.value })} /></Field>
          <Field label="Evidence (a quote, fact or example)"><textarea className="input min-h-[70px]" value={p.evidence} onChange={(x) => put(p.id, { evidence: x.target.value })} /></Field>
          <Field label="Explain how it proves the point"><textarea className="input min-h-[70px]" value={p.explain} onChange={(x) => put(p.id, { explain: x.target.value })} /></Field>
        </fieldset>
      ))}
      <Btn onClick={() => setE({ ...e, paras: [...e.paras, { id: uid(), point: '', evidence: '', explain: '' }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a paragraph</Btn>
      <Field label="Conclusion: answer the question again, sum up, end strongly"><textarea className="input min-h-[60px]" value={e.conclusion} onChange={(x) => setE({ ...e, conclusion: x.target.value })} /></Field>
      <div className="flex flex-wrap items-center gap-2"><CopyBtn text={plan} label="Copy the plan" /><Btn onClick={() => save('essay-plan.md', plan, 'text/markdown')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn><span className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{done} of {filled.length} parts written</span></div>
    </div>
  );
}

const PROMPTS = {
  Story: ['A door appears in your bedroom wall overnight.', 'The last library on Earth is closing tomorrow.', 'Your shadow starts moving on its own.', 'A letter arrives, addressed to you, dated 50 years ago.', 'Everyone in town wakes up speaking a different language.', 'The robot cleaning the school has a secret.', 'You find a map with your street on it, but the year is 2090.', 'A storm leaves something strange on the beach.'],
  Opinion: ['Should school start later in the morning?', 'Is social media good for friendships?', 'Should everyone learn to code?', 'Are zoos still needed?', 'Should voting start at 16?', 'Is it ever right to break a rule?', 'Should cities ban cars from the centre?', 'Do video games help people learn?'],
  Reflection: ['Something you changed your mind about this year.', 'A time you failed and what it taught you.', 'The person who has helped you most, and how.', 'A small thing that makes your day better.', 'What would you teach a class if you could?', 'A place where you feel calm.', 'Something you want to get better at, and your first step.', 'A moment you felt proud of someone else.'],
  Poetry: ['Write about rain from the point of view of a window.', 'A poem made only of questions.', 'Your morning, in five senses.', 'A colour that isn’t a colour (the colour of Monday…).', 'What the moon would say if it could text.', 'A list poem: things you would save in a fire.', 'An ordinary object, made huge.', 'A poem to your future self.'],
};
/** Writing prompts to start from, with a timer for a quick write. */
function Prompts() {
  const [kind, setKind] = useState<keyof typeof PROMPTS>('Story'), [p, setP] = useState(PROMPTS.Story[0]), [mins, setMins] = useState(10), [end, setEnd] = useState(0), [now, setNow] = useState(0);
  const [t, setT] = useKept('uv-draft-prompt', '');
  useEffect(() => { if (!end) return; const i = setInterval(() => { const n = Date.now(); setNow(n); if (n >= end) { setEnd(0); toast.success('Time! Read back what you wrote.'); } }, 500); return () => clearInterval(i); }, [end]);
  const left = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{(Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]).map((k) => <Btn key={k} on={kind === k} onClick={() => { setKind(k); setP(PROMPTS[k][rnd(PROMPTS[k].length)]); }}>{k}</Btn>)}</div>
      <p className="rounded-2xl bg-pink-500/10 ring-1 ring-pink-500/30 p-5 text-xl font-bold text-zinc-900 dark:text-white" role="status">{p}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => setP(PROMPTS[kind][rnd(PROMPTS[kind].length)])}><Shuffle className="w-3.5 h-3.5" aria-hidden />Another</Btn>
        <select className="input w-auto!" aria-label="Minutes" value={mins} onChange={(e) => setMins(+e.target.value)}>{[5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
        <button type="button" onClick={() => { if (end) setEnd(0); else { const n = Date.now(); setNow(n); setEnd(n + mins * 60000); } }} className="btn-primary btn-sm">{end ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{end ? 'Stop' : 'Start writing'}</button>
        {end > 0 && <span className="font-mono tabular-nums text-lg text-zinc-900 dark:text-white" role="timer">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
      </div>
      <Field label={`Your writing · ${t.trim() ? t.trim().split(/\s+/).length : 0} words`}><textarea className={cn(area, 'min-h-[240px] font-sans text-base')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
    </div>
  );
}

/** Poem helper: syllables per line, haiku check, and rhyming line endings. */
function Poem() {
  const [t, setT] = useKept('uv-draft-poem', 'An old silent pond\nA frog jumps into the pond\nSplash! Silence again');
  const p = useMemo(() => poemLines(t), [t]);
  const end = (l: string) => (l.toLowerCase().match(/[a-z]+(?=[^a-z]*$)/)?.[0] ?? '').slice(-2);
  const groups = new Map<string, number[]>(); p.lines.forEach((l, i) => { const e = end(l.line); if (e) groups.set(e, [...(groups.get(e) ?? []), i]); });
  const letter = new Map<number, string>(); let k = 0; [...groups.values()].filter((g) => g.length > 1).forEach((g) => { const L = String.fromCharCode(65 + k++); g.forEach((i) => letter.set(i, L)); });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label="Your poem"><textarea className={cn(area, 'min-h-[260px] font-sans text-base')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="space-y-2">
        <p className={cn('font-bold', p.haiku ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-white')} role="status">{p.haiku ? 'A haiku: 5, 7, 5 syllables.' : `${p.lines.length} lines`}</p>
        <ol className="space-y-1">{p.lines.map((l, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="w-8 text-end font-mono tabular-nums text-zinc-900 dark:text-white">{l.syllables}</span><span className="w-5 font-mono font-bold text-pink-600 dark:text-pink-300">{letter.get(i) ?? ''}</span><span className="truncate text-zinc-700 dark:text-zinc-200" translate="no">{l.line}</span></li>)}</ol>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Numbers: syllables per line (counted by rule, so check odd words). Letters: lines whose endings look like they rhyme.</p>
      </div>
    </div>
  );
}

/** Acrostic: a word down the side, a line for each letter. */
function Acrostic() {
  const [a, setA] = useKept('uv-acrostic', () => ({ word: 'HOPE', lines: {} as Record<number, string> }));
  const letters = [...a.word.toUpperCase().replace(/[^\p{L}]/gu, '')].slice(0, 20);
  const text = letters.map((l, i) => `${l}${(a.lines[i] ?? '').replace(/^\s*/, ' ')}`).join('\n');
  return (
    <div className="space-y-3">
      <Field label="The word"><input className="input w-56 text-lg font-bold uppercase" value={a.word} onChange={(e) => setA({ ...a, word: e.target.value })} /></Field>
      <div id="acrostic-sheet" className="rounded-2xl bg-white p-5 ring-1 ring-black/10 space-y-1.5">
        {letters.map((l, i) => (
          <label key={i} className="flex items-center gap-2"><span className="w-10 text-3xl font-bold text-pink-600">{l}</span><input className="flex-1 bg-transparent border-b border-zinc-300 py-1 text-lg text-zinc-900 outline-none focus:border-pink-500" aria-label={`Line starting with ${l}`} value={a.lines[i] ?? ''} onChange={(e) => setA({ ...a, lines: { ...a.lines, [i]: e.target.value } })} /></label>
        ))}
      </div>
      <div className="flex gap-2"><CopyBtn text={text} /><Btn onClick={() => printOnly('acrostic-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
    </div>
  );
}

const PASSAGES = [
  'The quick brown fox jumps over the lazy dog while the sun rises slowly over the quiet hills.',
  'Learning to type well takes practice, patience and a steady rhythm rather than raw speed.',
  'Every great project starts with a small idea, a clear plan and people who are willing to help.',
  'Water covers about seventy percent of the planet, yet only a tiny part of it is fresh and easy to reach.',
  'Good notes are short, use your own words and show how one idea connects to the next.',
];
/** Typing practice: type the passage, see speed and accuracy; keep a best. */
function Typing() {
  const [best, setBest] = useKept('uv-typing-best', 0), [hist, setHist] = useKept<number[]>('uv-typing-history', []);
  const [k, setK] = useState(0), [typed, setTyped] = useState(''), [start, setStart] = useState(0), [now, setNow] = useState(0);
  const target = PASSAGES[k], done = typed.length >= target.length;
  useEffect(() => { if (!start || done) return; const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, [start, done]);
  const s = typingScore(target, typed, Math.max(1, now - start));
  const finish = (val: string) => { if (val.length >= target.length && !done) { const end = Date.now(); setNow(end); const sc = typingScore(target, val, end - start); setHist([...hist.slice(-19), sc.wpm]); if (sc.wpm > best && sc.accuracy >= 90) { setBest(sc.wpm); toast.success(`New best: ${sc.wpm} words a minute`); } } };
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-white p-4 text-lg leading-relaxed ring-1 ring-black/10 font-mono" aria-label="Passage to type">
        {[...target].map((c, i) => <span key={i} className={cn(i < typed.length ? (typed[i] === c ? 'text-emerald-700' : 'bg-rose-200 text-rose-800') : i === typed.length ? 'bg-pink-200 text-zinc-900' : 'text-[#4b5068]')}>{c}</span>)}
      </p>
      <textarea ref={ref} className="input min-h-[90px] font-mono text-lg" aria-label="Type here" spellCheck={false} autoComplete="off" value={typed} disabled={done}
        onChange={(e) => { const v = e.target.value.slice(0, target.length); if (!start) { const n = Date.now(); setStart(n); setNow(n); } setTyped(v); finish(v); }} placeholder="Start typing: the clock starts with your first key" />
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat big k="Words a minute" v={start ? s.wpm : '—'} /><Stat big k="Accuracy" v={`${s.accuracy}%`} /><Stat big k="Mistakes" v={s.errors} /><Stat big k="Your best" v={best || '—'} /></dl>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => { setTyped(''); setStart(0); requestAnimationFrame(() => ref.current?.focus()); }}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Again</Btn>
        <Btn onClick={() => { setK((k + 1) % PASSAGES.length); setTyped(''); setStart(0); }}><Shuffle className="w-3.5 h-3.5" aria-hidden />Next passage</Btn>
        {hist.length > 1 && <span className="self-center text-xs text-zinc-600 dark:text-zinc-300">Last runs: <span className="font-mono">{hist.slice(-8).join(' · ')}</span></span>}
      </div>
    </div>
  );
}

interface Term { id: string; term: string; def: string }
/** Glossary: terms and meanings, A–Z, searchable; copy as flashcards. */
function Glossary() {
  const [list, setList] = useKept<Term[]>('uv-glossary', () => [{ id: uid(), term: 'Photosynthesis', def: 'How plants make food from light, water and carbon dioxide.' }, { id: uid(), term: 'Ecosystem', def: 'Living things and their surroundings, working together.' }]);
  const [term, setTerm] = useState(''), [def, setDef] = useState(''), [q, setQ] = useState('');
  const shown = [...list].filter((x) => `${x.term} ${x.def}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.term.localeCompare(b.term));
  const cards = list.map((x) => `${x.term} - ${x.def}`).join('\n');
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); if (term.trim() && def.trim()) { setList([...list, { id: uid(), term: term.trim(), def: def.trim() }]); setTerm(''); setDef(''); } }} className="grid gap-2 sm:grid-cols-[200px_1fr_auto] items-end">
        <Field label="Term"><input className="input" value={term} onChange={(e) => setTerm(e.target.value)} /></Field>
        <Field label="What it means"><input className="input" value={def} onChange={(e) => setDef(e.target.value)} /></Field>
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
      </form>
      <div className="flex flex-wrap gap-2"><input className="input flex-1 min-w-[160px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the glossary" /><CopyBtn text={cards} label="Copy for Flashcards" /><Btn onClick={() => printOnly('gloss-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
      <ul id="gloss-sheet" className="divide-y divide-zinc-200 dark:divide-white/10">
        {shown.map((x) => (
          <li key={x.id} className="flex gap-3 py-2"><b className="w-40 shrink-0 font-bold text-zinc-900 dark:text-white" translate="no">{x.term}</b><span className="flex-1 text-sm text-zinc-700 dark:text-zinc-200" translate="no">{x.def}</span><button type="button" onClick={() => setList(list.filter((y) => y.id !== x.id))} aria-label={`Remove ${x.term}`} className="btn-ghost btn-icon print:hidden"><Trash2 className="w-4 h-4" aria-hidden /></button></li>
        ))}
      </ul>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">“Copy for Flashcards” makes the lines Flashcards’ “paste many” box understands.</p>
    </div>
  );
}

/** Cornell notes: questions on the side, notes on the right, a summary at the bottom. */
function Cornell() {
  const [n, setN] = useKept('uv-cornell', () => ({ topic: 'Lesson topic', date: new Date().toISOString().slice(0, 10), cues: '', notes: '', summary: '' }));
  const md = `# ${n.topic} (${n.date})\n\n## Questions\n${n.cues}\n\n## Notes\n${n.notes}\n\n## Summary\n${n.summary}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Topic"><input className="input" value={n.topic} onChange={(e) => setN({ ...n, topic: e.target.value })} /></Field><Field label="Date"><input type="date" className="input" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} /></Field><CopyBtn text={md} label="Copy" /><Btn onClick={() => printOnly('cornell-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
      <div id="cornell-sheet" className="rounded-2xl bg-white ring-1 ring-black/10 text-zinc-900 overflow-hidden">
        <div className="grid sm:grid-cols-[1fr_2fr] divide-y sm:divide-y-0 sm:divide-x divide-zinc-300">
          <label className="block p-3"><span className="text-xs font-bold uppercase text-[#4b5068]">Questions and key words</span><textarea className="mt-1 w-full min-h-[260px] resize-y bg-transparent outline-none text-sm" value={n.cues} onChange={(e) => setN({ ...n, cues: e.target.value })} /></label>
          <label className="block p-3"><span className="text-xs font-bold uppercase text-[#4b5068]">Notes</span><textarea className="mt-1 w-full min-h-[260px] resize-y bg-transparent outline-none text-sm" value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} /></label>
        </div>
        <label className="block border-t border-zinc-300 p-3"><span className="text-xs font-bold uppercase text-[#4b5068]">Summary in your own words</span><textarea className="mt-1 w-full min-h-[80px] resize-y bg-transparent outline-none text-sm" value={n.summary} onChange={(e) => setN({ ...n, summary: e.target.value })} /></label>
      </div>
    </div>
  );
}

const QUESTIONS: Record<string, string[]> = {
  'Job or internship': ['Tell me about yourself.', 'Why do you want this role?', 'Describe a time you worked in a team.', 'What is your biggest strength?', 'Tell me about a mistake and what you learned.', 'Where do you see yourself in three years?', 'Why should we choose you?', 'Do you have any questions for us?'],
  'University or scholarship': ['Why this subject?', 'What have you read about it outside class?', 'Tell me about a challenge you overcame.', 'How would your teachers describe you?', 'What will you bring to the university?', 'What would you do with the scholarship?'],
  'Speaking exam': ['Describe your home town.', 'What do you do in your free time?', 'Talk about a book or film you enjoyed.', 'Is technology good for young people? Why?', 'Describe a memorable trip.', 'What would you change about your school?'],
};
/** Interview practice: a question, a timer for your answer, notes to improve. */
function Interview() {
  const [kind, setKind] = useState(Object.keys(QUESTIONS)[0]), [i, setI] = useState(0), [run, setRun] = useState(0), [now, setNow] = useState(0), [limit, setLimit] = useState(90);
  const [notes, setNotes] = useKept<Record<string, string>>('uv-interview-notes', {});
  useEffect(() => { if (!run) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [run]);
  const qs = QUESTIONS[kind], q = qs[i % qs.length], spent = run ? Math.floor((now - run) / 1000) : 0;
  const speak = () => { try { const u = new SpeechSynthesisUtterance(q); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no speech here */ } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{Object.keys(QUESTIONS).map((k) => <Btn key={k} on={kind === k} onClick={() => { setKind(k); setI(0); setRun(0); }}>{k}</Btn>)}</div>
      <p className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.05] p-5 text-2xl font-bold text-zinc-900 dark:text-white" role="status">{q}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (run) setRun(0); else { const n = Date.now(); setRun(n); setNow(n); speak(); } }} className="btn-primary btn-sm">{run ? <Pause className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{run ? 'Done answering' : 'Ask me'}</button>
        <Btn onClick={() => { setI(i + 1); setRun(0); }}>Next question</Btn>
        <select className="input w-auto!" aria-label="Answer time" value={limit} onChange={(e) => setLimit(+e.target.value)}>{[60, 90, 120, 180].map((s) => <option key={s} value={s}>{s} seconds</option>)}</select>
        {run > 0 && <span className={cn('font-mono tabular-nums text-lg', spent > limit ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-900 dark:text-white')} role="timer">{spent}s / {limit}s</span>}
      </div>
      <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className={cn('h-full transition-[width] duration-300 ease-linear', spent > limit ? 'bg-rose-500' : 'bg-pink-500')} style={{ width: `${Math.min(100, (spent / limit) * 100)}%` }} /></div>
      <Field label="Your notes for this question (key points, a story to tell)"><textarea className="input min-h-[100px]" value={notes[q] ?? ''} onChange={(e) => setNotes({ ...notes, [q]: e.target.value })} /></Field>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Tip: answer in about a minute and a half. For stories, use STAR: Situation, Task, Action, Result.</p>
    </div>
  );
}
