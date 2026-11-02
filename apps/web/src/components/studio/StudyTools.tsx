'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Check, Download, Eye, Mic, Plus, Printer, RotateCcw, Shuffle, Square, Trash2, X } from 'lucide-react';
import { isDue, needed, nextBox, seeded, studyPlan, weighted, wordSearch, type Exam } from '@/lib/big-tools';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Dial } from '@/components/instruments/parts';
import { Btn, Field, area, save } from './QuickTools';
import { BRANCH } from './PlanTools';
import { printOnly, today, uid, useKept } from './kept';

// Collaborate → Create → Study and teach (M72): flashcards, grades, a revision plan, rubrics, word
// searches, certificates, a name wheel and a classroom noise meter. All on this device.

export type StudyId = 'cards' | 'gpa' | 'studyplan' | 'rubric' | 'wordsearch' | 'certificate' | 'wheel' | 'noise';

export function StudyTool({ id }: { id: StudyId }) {
  const T = { cards: Cards, gpa: Grades, studyplan: StudyPlan, rubric: Rubric, wordsearch: WordSearch, certificate: Certificate, wheel: Wheel, noise: Noise }[id];
  return <T />;
}

const reset = (msg: string, go: () => void) => { if (window.confirm(msg)) go(); };
const Stat = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
);

interface Card { id: string; front: string; back: string; box: number }
interface Deck { id: string; name: string; round: number; cards: Card[] }
const sample = (): Deck[] => [{ id: uid(), name: 'Capitals', round: 1, cards: [['France', 'Paris'], ['Japan', 'Tokyo'], ['Kenya', 'Nairobi'], ['Peru', 'Lima'], ['Canada', 'Ottawa']].map(([front, back]) => ({ id: uid(), front, back, box: 1 })) }];
/** Flashcards with five boxes (Leitner): known cards come back less often. */
function Cards() {
  const [decks, setDecks] = useKept<Deck[]>('uv-flashcards', sample);
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<'study' | 'edit'>('study');
  const [flip, setFlip] = useState(false);
  const [bulk, setBulk] = useState('');
  // Cards answered this round: a missed card goes back to box 1 and comes again next round.
  const [seen, setSeen] = useState<string[]>([]);
  const deck = decks[Math.min(at, decks.length - 1)];
  const due = useMemo(() => deck?.cards.filter((c) => isDue(c.box, deck.round) && !seen.includes(c.id)) ?? [], [deck, seen]);
  const card = due[0];
  const put = (d: Deck) => setDecks(decks.map((x) => (x.id === d.id ? d : x)));
  const answer = (right: boolean) => {
    if (!deck || !card) return;
    const cards = deck.cards.map((c) => (c.id === card.id ? { ...c, box: nextBox(c.box, right) } : c));
    setFlip(false); setSeen([...seen, card.id]); put({ ...deck, cards });
    if (cards.length > 1 && cards.every((c) => c.box === 5)) celebrate();
  };
  const nextRound = () => { if (deck) { put({ ...deck, round: deck.round + 1 }); setSeen([]); } };
  const key = (e: React.KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); setFlip((f) => !f); } else if (flip && e.key === 'ArrowRight') answer(true); else if (flip && e.key === 'ArrowLeft') answer(false); };
  const boxes = [1, 2, 3, 4, 5].map((b) => deck?.cards.filter((c) => c.box === b).length ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Deck"><select className="input" value={at} onChange={(e) => { setAt(+e.target.value); setFlip(false); setSeen([]); }}>{decks.map((d, k) => <option key={d.id} value={k}>{d.name} ({d.cards.length})</option>)}</select></Field>
        <Btn onClick={() => { const name = window.prompt('Name of the new deck'); if (name) { setDecks([...decks, { id: uid(), name: name.slice(0, 40), round: 1, cards: [] }]); setAt(decks.length); setMode('edit'); } }}><Plus className="w-3.5 h-3.5" aria-hidden />New deck</Btn>
        <Btn on={mode === 'study'} onClick={() => setMode('study')}>Study</Btn>
        <Btn on={mode === 'edit'} onClick={() => setMode('edit')}>Cards</Btn>
      </div>
      {deck && mode === 'study' && (
        <>
          <div className="grid grid-cols-5 gap-1.5" aria-label="Cards per box">
            {boxes.map((n, b) => (
              <div key={b} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] p-2 text-center">
                <div className="h-10 flex items-end justify-center"><motion.div className={cn('w-6 rounded-md', b === 4 ? 'bg-pink-500' : 'bg-indigo-400 dark:bg-aqua-300/70')} initial={false} animate={{ height: `${deck.cards.length ? Math.max(6, (n / deck.cards.length) * 100) : 6}%` }} transition={spring.smooth} /></div>
                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Box {b + 1}: <span className="font-mono tabular-nums">{n}</span></p>
              </div>
            ))}
          </div>
          {card ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums" role="status">Round {deck.round} · {due.length} to go</p>
              <button type="button" onClick={() => setFlip(!flip)} onKeyDown={key} className="block w-full [perspective:1200px]">
                <span className="sr-only">{flip ? 'Answer: ' : 'Question: '}</span>
                <motion.div className="relative h-56 [transform-style:preserve-3d]" animate={{ rotateY: flip ? 180 : 0 }} transition={spring.smooth}>
                  <div aria-hidden={flip} className="absolute inset-0 grid place-items-center rounded-3xl bg-white ring-1 ring-black/10 shadow-lg p-6 text-2xl font-bold text-zinc-900 [backface-visibility:hidden]" translate="no">{card.front}</div>
                  <div aria-hidden={!flip} className="absolute inset-0 grid place-items-center rounded-3xl bg-indigo-900 text-white shadow-lg p-6 text-2xl font-bold [backface-visibility:hidden] [transform:rotateY(180deg)]" translate="no">{card.back}</div>
                </motion.div>
              </button>
              <div className="flex justify-center gap-2">
                <button type="button" disabled={!flip} onClick={() => answer(false)} className="btn-secondary"><X className="w-4 h-4" aria-hidden />Not yet (←)</button>
                <button type="button" disabled={!flip} onClick={() => answer(true)} className="btn-primary"><Check className="w-4 h-4" aria-hidden />I knew it (→)</button>
              </div>
              <p className="text-center text-xs text-zinc-600 dark:text-zinc-300">Tap the card or press Space to turn it; then ← or →.</p>
            </div>
          ) : (
            <div className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-6 text-center space-y-2">
              <p className="font-bold text-zinc-900 dark:text-white">{!deck.cards.length ? 'This deck is empty.' : seen.length ? `Round ${deck.round} done.` : 'Nothing due this round.'}</p>
              {deck.cards.length > 0 ? <Btn onClick={nextRound}>Next round</Btn> : <Btn onClick={() => setMode('edit')}>Add cards</Btn>}
            </div>
          )}
        </>
      )}
      {deck && mode === 'edit' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Deck name"><input className="input" value={deck.name} onChange={(e) => put({ ...deck, name: e.target.value })} /></Field>
            <Btn onClick={() => { put({ ...deck, round: 1, cards: deck.cards.map((c) => ({ ...c, box: 1 })) }); setSeen([]); }}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Start again</Btn>
            {decks.length > 1 && <Btn onClick={() => reset(`Delete the deck “${deck.name}”?`, () => { setDecks(decks.filter((d) => d.id !== deck.id)); setAt(0); })}><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete deck</Btn>}
          </div>
          <ul className="space-y-1.5">
            {deck.cards.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="input" aria-label="Front" value={c.front} onChange={(e) => put({ ...deck, cards: deck.cards.map((x) => (x.id === c.id ? { ...x, front: e.target.value } : x)) })} />
                <input className="input" aria-label="Back" value={c.back} onChange={(e) => put({ ...deck, cards: deck.cards.map((x) => (x.id === c.id ? { ...x, back: e.target.value } : x)) })} />
                <button type="button" onClick={() => put({ ...deck, cards: deck.cards.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.front}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <Btn onClick={() => put({ ...deck, cards: [...deck.cards, { id: uid(), front: '', back: '', box: 1 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a card</Btn>
          <Field label="Or paste many: one card a line, front and back split by a dash, tab or comma"><textarea className={area} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'photosynthesis - how plants make food\nH2O - water'} /></Field>
          <Btn onClick={() => {
            const add = bulk.split('\n').map((l) => l.split(/\s+[-–]\s+|\t|,\s*/)).filter((p) => p.length >= 2 && p[0].trim()).map((p) => ({ id: uid(), front: p[0].trim(), back: p.slice(1).join(', ').trim(), box: 1 }));
            if (!add.length) return toast.error('No cards found: put a dash between the two sides.');
            put({ ...deck, cards: [...deck.cards, ...add] }); setBulk(''); toast.success(`${add.length} cards added`);
          }}>Add these cards</Btn>
        </div>
      )}
    </div>
  );
}

const LETTER: Record<string, number> = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, F: 0 };
/** Grades: a weighted average, what's needed on the rest, and a GPA. */
function Grades() {
  const [g, setG] = useKept('uv-grades', () => ({ rows: [{ name: 'Homework', score: 85, weight: 20 }, { name: 'Mid-term', score: 72, weight: 30 }], target: 75, courses: [{ name: 'Maths', credits: 4, grade: 'A-' }, { name: 'History', credits: 3, grade: 'B+' }] }));
  const avg = weighted(g.rows), doneW = g.rows.reduce((a, r) => a + r.weight, 0), rest = Math.max(0, 100 - doneW);
  const need = avg == null ? null : needed(avg, doneW, g.target, rest);
  const credits = g.courses.reduce((a, c) => a + c.credits, 0), gpa = credits ? g.courses.reduce((a, c) => a + (LETTER[c.grade] ?? 0) * c.credits, 0) / credits : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3" aria-labelledby="w-h">
        <h3 id="w-h" className="font-bold text-zinc-900 dark:text-white">Weighted average</h3>
        {g.rows.map((r, k) => (
          <div key={k} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
            <Field label="Work"><input className="input" value={r.name} onChange={(e) => setG({ ...g, rows: g.rows.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} /></Field>
            <Field label="Score %"><input type="number" className="input" value={r.score} onChange={(e) => setG({ ...g, rows: g.rows.map((x, j) => (j === k ? { ...x, score: +e.target.value } : x)) })} /></Field>
            <Field label="Worth %"><input type="number" className="input" value={r.weight} onChange={(e) => setG({ ...g, rows: g.rows.map((x, j) => (j === k ? { ...x, weight: +e.target.value } : x)) })} /></Field>
            <button type="button" onClick={() => setG({ ...g, rows: g.rows.filter((_, j) => j !== k) })} aria-label={`Remove ${r.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        ))}
        <Btn onClick={() => setG({ ...g, rows: [...g.rows, { name: 'Test', score: 70, weight: 10 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add work</Btn>
        <dl className="grid grid-cols-3 gap-2 text-sm"><Stat k="Average so far" v={avg == null ? '—' : `${avg.toFixed(1)}%`} /><Stat k="Counted" v={`${doneW}%`} /><Stat k="Still to come" v={`${rest}%`} /></dl>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="I want to end on (%)"><input type="number" className="input w-28" value={g.target} onChange={(e) => setG({ ...g, target: +e.target.value })} /></Field>
          <p className="pb-2 text-sm text-zinc-900 dark:text-white" role="status">{need == null ? 'Everything is counted already.' : need > 100 ? <>You would need <b className="font-mono">{need.toFixed(1)}%</b> on the rest: out of reach.</> : need <= 0 ? 'You are there already.' : <>You need <b className="font-mono">{need.toFixed(1)}%</b> on the remaining {rest}%.</>}</p>
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="gpa-h">
        <h3 id="gpa-h" className="font-bold text-zinc-900 dark:text-white">GPA (4.0 scale)</h3>
        {g.courses.map((c, k) => (
          <div key={k} className="grid grid-cols-[1fr_80px_90px_auto] gap-2 items-end">
            <Field label="Course"><input className="input" value={c.name} onChange={(e) => setG({ ...g, courses: g.courses.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} /></Field>
            <Field label="Credits"><input type="number" className="input" value={c.credits} onChange={(e) => setG({ ...g, courses: g.courses.map((x, j) => (j === k ? { ...x, credits: +e.target.value } : x)) })} /></Field>
            <Field label="Grade"><select className="input" value={c.grade} onChange={(e) => setG({ ...g, courses: g.courses.map((x, j) => (j === k ? { ...x, grade: e.target.value } : x)) })}>{Object.keys(LETTER).map((l) => <option key={l}>{l}</option>)}</select></Field>
            <button type="button" onClick={() => setG({ ...g, courses: g.courses.filter((_, j) => j !== k) })} aria-label={`Remove ${c.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        ))}
        <Btn onClick={() => setG({ ...g, courses: [...g.courses, { name: 'Course', credits: 3, grade: 'B' }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a course</Btn>
        <dl className="grid grid-cols-2 gap-2 text-sm"><Stat k="GPA" v={gpa == null ? '—' : gpa.toFixed(2)} /><Stat k="Credits" v={credits} /></dl>
      </section>
    </div>
  );
}

const ics = (days: { date: string; items: { name: string; hours: number }[] }[]) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Study plan//EN',
  ...days.flatMap((d) => d.items.map((i, k) => { const day = d.date.replace(/-/g, ''); return ['BEGIN:VEVENT', `UID:${day}-${k}-${i.name.replace(/\W/g, '')}@universe`, `DTSTAMP:${day}T000000Z`, `DTSTART;VALUE=DATE:${day}`, `SUMMARY:Revise ${i.name} (${i.hours} h)`, 'END:VEVENT'].join('\r\n'); })),
  'END:VCALENDAR'].join('\r\n');
/** Revision planner: exams and hours needed into a day-by-day plan. */
function StudyPlan() {
  const t0 = useMemo(() => today(), []);
  const add = (n: number) => new Date(Date.parse(`${t0}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const [p, setP] = useKept('uv-studyplan', () => ({ perDay: 3, exams: [{ name: 'Maths', date: add(10), hours: 12 }, { name: 'Biology', date: add(14), hours: 8 }, { name: 'History', date: add(7), hours: 5 }] as Exam[] }));
  const plan = useMemo(() => studyPlan(p.exams, t0, p.perDay), [p, t0]);
  const colour = (n: string) => BRANCH[Math.max(0, p.exams.findIndex((e) => e.name === n)) % BRANCH.length];
  return (
    <div className="space-y-4">
      {p.exams.map((e, k) => (
        <div key={k} className="grid grid-cols-[1fr_150px_90px_auto] gap-2 items-end">
          <Field label="Exam"><input className="input" value={e.name} onChange={(x) => setP({ ...p, exams: p.exams.map((y, j) => (j === k ? { ...y, name: x.target.value } : y)) })} /></Field>
          <Field label="Date"><input type="date" className="input" value={e.date} onChange={(x) => setP({ ...p, exams: p.exams.map((y, j) => (j === k ? { ...y, date: x.target.value } : y)) })} /></Field>
          <Field label="Hours"><input type="number" min={0} className="input" value={e.hours} onChange={(x) => setP({ ...p, exams: p.exams.map((y, j) => (j === k ? { ...y, hours: Math.max(0, +x.target.value || 0) } : y)) })} /></Field>
          <button type="button" onClick={() => setP({ ...p, exams: p.exams.filter((_, j) => j !== k) })} aria-label={`Remove ${e.name}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Btn onClick={() => setP({ ...p, exams: [...p.exams, { name: 'New exam', date: add(21), hours: 6 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add an exam</Btn>
        <Field label="Hours a day"><input type="number" min={1} max={12} className="input w-24" value={p.perDay} onChange={(e) => setP({ ...p, perDay: Math.max(1, Math.min(12, +e.target.value || 1)) })} /></Field>
        <Btn onClick={() => save('study-plan.ics', ics(plan.days), 'text/calendar')}><Download className="w-3.5 h-3.5" aria-hidden />Add to a calendar (.ics)</Btn>
        <Btn onClick={() => printOnly('study-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
      </div>
      {plan.short.length > 0 && <p role="alert" className="rounded-xl bg-amber-100 dark:bg-amber-400/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">Not enough days: {plan.short.map((s) => `${s.name} is ${s.hours} h short`).join(', ')}. Add hours a day or start sooner.</p>}
      <ol id="study-sheet" className="grid gap-1.5 sm:grid-cols-2">
        {plan.days.map((d) => { const exam = p.exams.filter((e) => e.date === d.date); return (
          <li key={d.date} className="flex items-center gap-2 rounded-xl ring-1 ring-zinc-200 dark:ring-white/10 px-3 py-2">
            <span className="w-24 shrink-0 text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            <span className="flex flex-wrap gap-1">
              {d.items.map((i) => <span key={i.name} className="rounded-full px-2 py-0.5 text-xs font-semibold text-zinc-900 dark:text-white" style={{ background: `${colour(i.name)}33` }}>{i.name} · {i.hours} h</span>)}
              {exam.map((e) => <span key={e.name} className="rounded-full px-2 py-0.5 text-xs font-bold bg-pink-500 text-indigo-900">{e.name} exam</span>)}
              {!d.items.length && !exam.length && <span className="text-xs text-zinc-600 dark:text-zinc-300">Rest</span>}
            </span>
          </li>
        ); })}
      </ol>
    </div>
  );
}

/** Rubric maker: what's marked against which levels; click cells to mark a piece of work. */
function Rubric() {
  const [r, setR] = useKept('uv-rubric', () => ({ title: 'Presentation', levels: ['Excellent', 'Good', 'Fair', 'Needs work'], points: [4, 3, 2, 1], rows: [{ name: 'Content', cells: ['Accurate and deep', 'Accurate', 'Some errors', 'Many errors'] }, { name: 'Delivery', cells: ['Clear and engaging', 'Clear', 'Hard to follow at times', 'Unclear'] }] }));
  const [mark, setMark] = useState<Record<number, number>>({});
  const total = Object.entries(mark).reduce((a, [, l]) => a + (r.points[l] ?? 0), 0), max = r.rows.length * Math.max(0, ...r.points);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Title"><input className="input" value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} /></Field>
        <Btn onClick={() => setR({ ...r, rows: [...r.rows, { name: 'New', cells: r.levels.map(() => '') }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Row</Btn>
        <Btn onClick={() => setR({ ...r, levels: [...r.levels, 'Level'], points: [...r.points, 0], rows: r.rows.map((x) => ({ ...x, cells: [...x.cells, ''] })) })}><Plus className="w-3.5 h-3.5" aria-hidden />Level</Btn>
        {r.levels.length > 2 && <Btn onClick={() => setR({ ...r, levels: r.levels.slice(0, -1), points: r.points.slice(0, -1), rows: r.rows.map((x) => ({ ...x, cells: x.cells.slice(0, -1) })) })}>Remove the last level</Btn>}
        <Btn onClick={() => printOnly('rubric-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
        <Btn onClick={() => setMark({})}>Clear the marking</Btn>
      </div>
      <div className="relative overflow-x-auto rounded-2xl ring-1 ring-black/10">
        <table id="rubric-sheet" className="w-full min-w-[640px] bg-white text-zinc-900 text-sm border-collapse">
          <caption className="p-3 text-start text-lg font-bold">{r.title}</caption>
          <thead><tr><th className="p-2 text-start text-xs text-[#4b5068] w-36">Marked on</th>{r.levels.map((l, j) => (
            <th key={j} className="p-1 align-bottom"><input aria-label={`Level ${j + 1}`} className="w-full bg-transparent font-bold px-1 py-1 rounded outline-none focus:bg-zinc-100" value={l} onChange={(e) => setR({ ...r, levels: r.levels.map((x, k) => (k === j ? e.target.value : x)) })} />
              <label className="flex items-center gap-1 px-1 text-[11px] font-normal text-[#4b5068]">Points<input type="number" aria-label={`Points for ${l}`} className="w-12 bg-zinc-100 rounded px-1" value={r.points[j]} onChange={(e) => setR({ ...r, points: r.points.map((x, k) => (k === j ? +e.target.value : x)) })} /></label></th>
          ))}<th><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i} className="border-t border-zinc-200 align-top">
                <td className="p-1"><input aria-label={`Row ${i + 1}`} className="w-full bg-transparent font-semibold px-1 py-1 rounded outline-none focus:bg-zinc-100" value={row.name} onChange={(e) => setR({ ...r, rows: r.rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></td>
                {row.cells.map((c, j) => (
                  <td key={j} className={cn('p-1 transition-colors', mark[i] === j && 'bg-pink-100')}>
                    <textarea aria-label={`${row.name}, ${r.levels[j]}`} rows={2} className="w-full resize-none bg-transparent px-1 py-1 rounded text-xs outline-none focus:bg-zinc-100" value={c} onChange={(e) => setR({ ...r, rows: r.rows.map((x, k) => (k === i ? { ...x, cells: x.cells.map((y, m) => (m === j ? e.target.value : y)) } : x)) })} />
                    <button type="button" onClick={() => setMark({ ...mark, [i]: j })} aria-pressed={mark[i] === j} className="mt-0.5 text-[11px] font-semibold text-pink-700 hover:underline print:hidden">{mark[i] === j ? '✓ Marked' : 'Mark this'}</button>
                  </td>
                ))}
                <td className="p-1"><button type="button" onClick={() => setR({ ...r, rows: r.rows.filter((_, k) => k !== i) })} aria-label={`Remove ${row.name}`} className="p-2 text-[#4b5068]"><Trash2 className="w-4 h-4" aria-hidden /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-zinc-300"><td className="p-2 font-bold">Total</td><td colSpan={r.levels.length + 1} className="p-2 font-mono tabular-nums font-bold" role="status">{total} / {max}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

const cellsOf = (p: { word: string; r: number; c: number; dr: number; dc: number }) => [...p.word].map((_, k) => `${p.r + p.dr * k},${p.c + p.dc * k}`);
/** Word search maker: print it or play it here (tap the first and last letter of a word). */
function WordSearch() {
  const [words, setWords] = useKept('uv-wordsearch', 'planet\norbit\ncomet\ngalaxy\nnebula\nrocket\nmoon\nstar');
  const [size, setSize] = useState(12), [hard, setHard] = useState(false), [seed, setSeed] = useState(1), [show, setShow] = useState(false);
  const [found, setFound] = useState<string[]>([]), [first, setFirst] = useState<[number, number] | null>(null);
  const ws = useMemo(() => wordSearch(words.split(/[\n,]/), size, hard, seeded(seed * 9301 + 49297)), [words, size, hard, seed]);
  const lit = useMemo(() => new Set(ws.placed.filter((p) => show || found.includes(p.word)).flatMap(cellsOf)), [ws, show, found]);
  const tap = (r: number, c: number) => {
    if (!first) return setFirst([r, c]);
    const hit = ws.placed.find((p) => { const e = [p.r + p.dr * (p.word.length - 1), p.c + p.dc * (p.word.length - 1)]; return (p.r === first[0] && p.c === first[1] && e[0] === r && e[1] === c) || (e[0] === first[0] && e[1] === first[1] && p.r === r && p.c === c); });
    setFirst(null);
    if (hit && !found.includes(hit.word)) { const next = [...found, hit.word]; setFound(next); if (next.length === ws.placed.length) celebrate(); }
  };
  const fresh = () => { setSeed(seed + 1); setFound([]); setFirst(null); };
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="space-y-2">
        <Field label="Words, one a line"><textarea className={area} value={words} onChange={(e) => { setWords(e.target.value); setFound([]); }} /></Field>
        <Field label={`Size: ${size} × ${size}`}><input type="range" min={8} max={18} value={size} onChange={(e) => { setSize(+e.target.value); setFound([]); }} className="w-full accent-pink-500" /></Field>
        <div className="flex flex-wrap gap-2">
          <Btn on={hard} onClick={() => { setHard(!hard); setFound([]); }}>Diagonal and backwards</Btn>
          <Btn onClick={fresh}><Shuffle className="w-3.5 h-3.5" aria-hidden />Mix again</Btn>
          <Btn on={show} onClick={() => setShow(!show)}><Eye className="w-3.5 h-3.5" aria-hidden />Answers</Btn>
          <Btn onClick={() => printOnly('ws-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
        </div>
        {ws.skipped.length > 0 && <p role="alert" className="text-xs text-amber-800 dark:text-amber-200">Didn’t fit: {ws.skipped.join(', ')}. Make the grid bigger.</p>}
      </div>
      <div id="ws-sheet" className="rounded-2xl bg-white ring-1 ring-black/10 p-3 sm:p-5 text-zinc-900 overflow-x-auto">
        <div className="grid gap-0.5 mx-auto w-max" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} role="group" aria-label="Word search">
          {ws.grid.map((row, r) => row.map((ch, c) => { const k = `${r},${c}`, on = lit.has(k), start = first?.[0] === r && first?.[1] === c; return (
            <button key={k} type="button" onClick={() => tap(r, c)} aria-label={`Row ${r + 1}, column ${c + 1}: ${ch}`} className={cn('w-6 h-6 sm:w-7 sm:h-7 rounded-md text-sm sm:text-base font-bold font-mono transition-[background-color,transform] duration-150 active:scale-90', on ? 'bg-pink-300' : 'hover:bg-zinc-100', start && 'ring-2 ring-indigo-600')}>{ch}</button>
          ); }))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 justify-center text-sm font-semibold" aria-label="Words to find">
          {ws.placed.map((p) => <li key={p.word} className={cn(found.includes(p.word) && 'line-through text-[#4b5068]')}>{p.word}</li>)}
        </ul>
        <p className="mt-2 text-center text-xs text-[#4b5068] print:hidden" role="status">{found.length} of {ws.placed.length} found</p>
      </div>
    </div>
  );
}

const THEMES = [{ name: 'Navy', ink: '#171f44', accent: '#ec74ce', paper: '#fffdf8' }, { name: 'Violet', ink: '#2e1f8f', accent: '#533ff6', paper: '#ffffff' }, { name: 'Gold', ink: '#3b2a10', accent: '#b8860b', paper: '#fffaf0' }];
/** Certificate maker: a name, what for, a date and a signature line, as a picture. */
function Certificate() {
  const [f, setF] = useKept('uv-certificate', () => ({ title: 'Certificate of Achievement', name: 'Alex Morgan', why: 'for outstanding work in the Science Fair', by: 'Ms Rivera, Head of Science', date: today(), theme: 0 }));
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 1600, H = 1131, g = c.getContext('2d')!, t = THEMES[f.theme] ?? THEMES[0]; c.width = W; c.height = H;
    g.fillStyle = t.paper; g.fillRect(0, 0, W, H);
    g.strokeStyle = t.ink; g.lineWidth = 14; g.strokeRect(40, 40, W - 80, H - 80);
    g.strokeStyle = t.accent; g.lineWidth = 3; g.strokeRect(66, 66, W - 132, H - 132);
    for (const [x, y] of [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]]) { g.fillStyle = t.accent; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill(); }
    g.textAlign = 'center'; g.fillStyle = t.ink;
    g.font = '700 72px Georgia, serif'; g.fillText(f.title, W / 2, 250);
    g.fillStyle = t.accent; g.fillRect(W / 2 - 120, 290, 240, 4);
    g.fillStyle = '#5b6077'; g.font = 'italic 34px Georgia, serif'; g.fillText('This is presented to', W / 2, 400);
    g.fillStyle = t.ink; g.font = '700 96px Georgia, serif'; g.fillText(f.name, W / 2, 530);
    g.fillStyle = '#3f4459'; g.font = '36px Georgia, serif'; g.fillText(f.why, W / 2, 630);
    g.strokeStyle = t.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(260, 900); g.lineTo(700, 900); g.moveTo(900, 900); g.lineTo(1340, 900); g.stroke();
    g.font = '28px Georgia, serif'; g.fillStyle = '#3f4459';
    g.fillText(new Date(`${f.date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }), 480, 880); g.fillText('Date', 480, 945);
    g.fillText(f.by, 1120, 945);
    g.fillStyle = t.accent; g.beginPath(); for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = k % 2 ? 62 : 74; g.lineTo(W / 2 + r * Math.cos(a), 780 + r * Math.sin(a)); } g.fill();
    g.fillStyle = '#ffffff'; g.font = '700 30px Georgia, serif'; g.fillText('★', W / 2, 792);
  }, [f]);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 40) })} /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.slice(0, 32) })} /></Field>
        <Field label="What for"><input className="input" value={f.why} onChange={(e) => setF({ ...f, why: e.target.value.slice(0, 70) })} /></Field>
        <Field label="Signed by"><input className="input" value={f.by} onChange={(e) => setF({ ...f, by: e.target.value.slice(0, 40) })} /></Field>
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <div className="flex items-end gap-2">{THEMES.map((t, k) => <Btn key={t.name} on={f.theme === k} onClick={() => setF({ ...f, theme: k })}>{t.name}</Btn>)}</div>
      </div>
      <canvas id="cert-sheet" ref={ref} role="img" aria-label={`${f.title} for ${f.name}`} className="w-full rounded-xl ring-1 ring-black/10" />
      <div className="flex gap-2">
        <Btn onClick={() => ref.current?.toBlob((b) => b && save(`certificate-${f.name.replace(/\W+/g, '-').toLowerCase()}.png`, b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
        <Btn onClick={() => printOnly('cert-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
      </div>
    </div>
  );
}

const WHEEL = ['#533ff6', '#ec74ce', '#0d9488', '#f59e0b', '#2563eb', '#e11d48', '#7c3aed', '#16a34a'];
/** Spin the wheel: pick a name with a spin everyone can watch. */
function Wheel() {
  const [t, setT] = useKept('uv-wheel', 'Aisha\nBen\nCarlos\nDara\nElif\nFinn');
  const [drop, setDrop] = useState(false), [winner, setWinner] = useState(''), [spinning, setSpinning] = useState(false);
  const names = t.split('\n').map((s) => s.trim()).filter(Boolean);
  const ref = useRef<HTMLCanvasElement>(null), angle = useRef(0);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const names = t.split('\n').map((s) => s.trim()).filter(Boolean);
    const S = 640, g = c.getContext('2d')!, n = Math.max(1, names.length), R = S / 2 - 8; c.width = S; c.height = S;
    g.clearRect(0, 0, S, S); g.translate(S / 2, S / 2);
    names.forEach((name, k) => {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      g.fillStyle = WHEEL[k % WHEEL.length]; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
      g.save(); g.rotate((a0 + a1) / 2); g.fillStyle = '#ffffff'; g.font = `700 ${n > 16 ? 18 : 26}px system-ui, sans-serif`; g.textAlign = 'end'; g.fillText(name.slice(0, 16), R - 22, 9); g.restore();
    });
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }, [t]);
  const spin = () => {
    if (spinning || names.length < 2) return;
    const pick = crypto.getRandomValues(new Uint32Array(1))[0] % names.length, n = names.length;
    // The pointer is at the top (-90°): land the middle of the picked slice there.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = angle.current, want = -90 - ((pick + 0.5) / n) * 360 + (Math.random() - 0.5) * (300 / n);
    const target = start + (calm ? 1 : 6) * 360 + ((((want - start) % 360) + 360) % 360);
    const dur = calm ? 600 : 4600, t0 = performance.now(), el = ref.current!;
    setSpinning(true); setWinner('');
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - (1 - p) ** 4;
      angle.current = start + (target - start) * e; el.style.transform = `rotate(${angle.current}deg)`;
      if (p < 1) requestAnimationFrame(step);
      else { setSpinning(false); setWinner(names[pick]); celebrate(el); if (drop) setT(names.filter((_, k) => k !== pick).join('\n')); }
    };
    requestAnimationFrame(step);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <div className="relative mx-auto w-full max-w-[420px]">
        <canvas ref={ref} onClick={spin} className="w-full aspect-square rounded-full cursor-pointer will-change-transform" role="img" aria-label={`A wheel with ${names.length} names`} />
        <span className="absolute -top-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-0 h-0 border-x-[14px] border-x-transparent border-t-[26px] border-t-zinc-900 dark:border-t-white" aria-hidden />
        <p className="mt-3 h-9 text-center text-2xl font-bold text-zinc-900 dark:text-white" role="status" aria-live="polite">{winner && <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy} className="inline-block">{winner}</motion.span>}</p>
      </div>
      <div className="space-y-2">
        <button type="button" onClick={spin} disabled={spinning || names.length < 2} className="btn-primary w-full">{spinning ? 'Spinning…' : 'Spin'}</button>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} className="accent-pink-500" />Take the winner off the wheel</label>
        <Field label="Names, one a line"><textarea className={cn(area, 'min-h-[220px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      </div>
    </div>
  );
}

/** Classroom noise meter: the microphone's level against a limit you set. Nothing is recorded. */
function Noise() {
  const [on, setOn] = useState(false), [level, setLevel] = useState(0), [limit, setLimit] = useKept('uv-noise-limit', 70), [loud, setLoud] = useState(0);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize); let raf = 0, last = 0, smooth = 0;
      const tick = (now: number) => {
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
        // About 0 in a silent room, 100 when shouting close by (not a calibrated decibel meter).
        const v = Math.max(0, Math.min(100, (20 * Math.log10(rms || 1e-6) + 70) * 1.6));
        smooth = smooth * 0.85 + v * 0.15;
        if (now - last > 80) { last = now; setLevel(smooth); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      stop.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); setOn(false); setLevel(0); };
      setOn(true);
    } catch { toast.error('The microphone isn’t available. Allow it in the browser’s settings.'); }
  };
  const over = on && level >= limit;
  useEffect(() => { if (!over) return; const t = setInterval(() => setLoud((n) => n + 1), 1000); return () => clearInterval(t); }, [over]);
  return (
    <div className={cn('rounded-3xl p-6 text-center transition-colors duration-500', over ? 'bg-rose-500/15' : on ? 'bg-emerald-500/10' : 'bg-zinc-100/70 dark:bg-white/[0.04]')}>
      <div className={cn('mx-auto max-w-[360px]', over ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300')}><Dial value={level} max={100} danger={limit / 100} labels={false} /></div>
      <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white" role="status">{!on ? 'Off' : over ? 'Too loud!' : level > limit * 0.75 ? 'Getting loud' : 'Nice and calm'}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">Level <span className="font-mono">{Math.round(level)}</span> · limit <span className="font-mono">{limit}</span> · seconds too loud <span className="font-mono">{loud}</span></p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {on ? <button type="button" onClick={() => stop.current()} className="btn-secondary"><Square className="w-4 h-4" aria-hidden />Stop</button> : <button type="button" onClick={() => void start()} className="btn-primary"><Mic className="w-4 h-4" aria-hidden />Start listening</button>}
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">Limit<input type="range" min={30} max={95} value={limit} onChange={(e) => setLimit(+e.target.value)} className="accent-pink-500" /></label>
        <Btn onClick={() => setLoud(0)}>Reset the count</Btn>
      </div>
      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">Only the loudness is measured, on this device; nothing is recorded or sent.</p>
    </div>
  );
}
