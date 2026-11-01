'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Check, Dices, Minus, Pencil, Play, Plus, Printer, RotateCcw, Shuffle, Trash2, X } from 'lucide-react';
import { divisors, fracOp, gcd, isPrime, lcm, mixed, parseFrac, primeFactors, solveQuadratic, type Frac } from '@/lib/more-tools';
import { ELEMENTS, FAMILIES, type Element, type Family } from '@/lib/elements';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Btn, Field } from './QuickTools';
import { printOnly, uid, useKept } from './kept';
import { ask, BRANCH, FullBtn, nf, rnd, Stat, useFull } from './bits';

// Collaborate → Create → Study and teach, fourth set (M74): a maths drill, the periodic table, a quiz
// maker, a seating plan, dice and coins, fractions, an equation solver, shapes, number facts, a
// classroom traffic light and a scoreboard. All on this device.

export type ClassId = 'drill' | 'periodic' | 'quiz' | 'seating' | 'dice' | 'fractions' | 'equation' | 'shapes' | 'numfacts' | 'traffic' | 'scoreboard';

export function ClassTool({ id }: { id: ClassId }) {
  const T = { drill: Drill, periodic: Periodic, quiz: Quiz, seating: Seating, dice: DiceCoins, fractions: Fractions, equation: Equation, shapes: Shapes, numfacts: NumFacts, traffic: Traffic, scoreboard: Scoreboard }[id];
  return <T />;
}

type Op = '+' | '−' | '×' | '÷';
const question = (ops: Op[], max: number): [string, number] => {
  const op = ops[rnd(ops.length)], a = 1 + rnd(max), b = 1 + rnd(max);
  if (op === '+') return [`${a} + ${b}`, a + b];
  if (op === '−') return [`${Math.max(a, b)} − ${Math.min(a, b)}`, Math.abs(a - b)];
  if (op === '×') return [`${a} × ${b}`, a * b];
  return [`${a * b} ÷ ${a}`, b];
};
/** Maths drill: as many sums as you can in a minute. */
function Drill() {
  const [ops, setOps] = useKept<Op[]>('uv-drill-ops', ['+', '×']), [max, setMax] = useKept('uv-drill-max', 12), [best, setBest] = useKept('uv-drill-best', 0);
  const [phase, setPhase] = useState<'ready' | 'run' | 'done'>('ready'), [q, setQ] = useState<[string, number]>(['', 0]), [ans, setAns] = useState('');
  const [score, setScore] = useState(0), [tries, setTries] = useState(0), [end, setEnd] = useState(0), [now, setNow] = useState(0), [flash, setFlash] = useState<'ok' | 'no' | null>(null);
  const input = useRef<HTMLInputElement>(null), scoreRef = useRef(0);
  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const n = Date.now(); setNow(n);
      if (n >= end) { setPhase('done'); if (scoreRef.current > best) { setBest(scoreRef.current); celebrate(); } }
    }, 200);
    return () => clearInterval(t);
  }, [phase, end, best, setBest]);
  const start = () => { scoreRef.current = 0; setScore(0); setTries(0); setQ(question(ops, max)); setAns(''); const n = Date.now(); setNow(n); setEnd(n + 60_000); setPhase('run'); requestAnimationFrame(() => input.current?.focus()); };
  const submit = () => {
    if (!ans.trim()) return;
    const ok = Number(ans) === q[1];
    setTries(tries + 1); if (ok) { scoreRef.current = score + 1; setScore(score + 1); }
    setFlash(ok ? 'ok' : 'no'); setTimeout(() => setFlash(null), 250);
    setQ(question(ops, max)); setAns('');
  };
  return (
    <div className="space-y-4">
      {phase !== 'run' && (
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Sums" className="flex gap-1">{(['+', '−', '×', '÷'] as Op[]).map((o) => <Btn key={o} on={ops.includes(o)} onClick={() => setOps(ops.includes(o) ? (ops.length > 1 ? ops.filter((x) => x !== o) : ops) : [...ops, o])}><span className="font-mono text-base">{o}</span></Btn>)}</div>
          <Field label="Numbers up to"><select className="input w-auto!" value={max} onChange={(e) => setMax(+e.target.value)}>{[5, 10, 12, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <button type="button" onClick={start} className="btn-primary"><Play className="w-4 h-4" aria-hidden />{phase === 'done' ? 'Again' : 'Start (60 s)'}</button>
          <span className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">Best: <b className="font-mono text-zinc-900 dark:text-white">{best}</b></span>
        </div>
      )}
      {phase === 'run' && (
        <div className={cn('rounded-3xl p-6 text-center transition-colors duration-200', flash === 'ok' ? 'bg-emerald-500/15' : flash === 'no' ? 'bg-rose-500/15' : 'bg-zinc-100/70 dark:bg-white/[0.04]')}>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums" role="timer">{Math.max(0, Math.ceil((end - now) / 1000))} s · {score} right</p>
          <p className="mt-2 text-5xl font-bold font-mono text-zinc-900 dark:text-white">{q[0]} =</p>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-4 flex justify-center gap-2">
            <input ref={input} className="input w-40 text-center text-3xl font-mono" inputMode="numeric" value={ans} onChange={(e) => setAns(e.target.value.replace(/[^\d-]/g, ''))} aria-label="Your answer" autoComplete="off" />
            <button type="submit" className="btn-primary">Enter</button>
          </form>
        </div>
      )}
      {phase === 'done' && (
        <motion.dl initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="grid grid-cols-3 gap-2 text-sm"><Stat big k="Right" v={score} /><Stat big k="Tried" v={tries} /><Stat big k="Accuracy" v={tries ? `${Math.round((score / tries) * 100)}%` : '—'} /></motion.dl>
      )}
    </div>
  );
}

const FAM_COLOUR: Record<Family, string> = { a: '#fecaca', e: '#fed7aa', t: '#fde68a', p: '#d9f99d', m: '#a7f3d0', n: '#bae6fd', h: '#c7d2fe', g: '#e9d5ff', l: '#fbcfe8', c: '#fecdd3', u: '#e5e7eb' };
/** The periodic table: tap an element for its facts; search and highlight families. */
function Periodic() {
  const [sel, setSel] = useState<Element>(ELEMENTS[5]), [q, setQ] = useState(''), [fam, setFam] = useState<Family | null>(null);
  const match = (e: Element) => (!q.trim() || `${e.symbol} ${e.name} ${e.z}`.toLowerCase().includes(q.trim().toLowerCase())) && (!fam || e.family === fam);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find: iron, Fe, 26…" aria-label="Find an element" />
        {(Object.keys(FAMILIES) as Family[]).map((f) => <button key={f} type="button" onClick={() => setFam(fam === f ? null : f)} aria-pressed={fam === f} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-black/10 transition-transform active:scale-95', fam === f && 'ring-2 ring-pink-600')} style={{ background: FAM_COLOUR[f] }}>{FAMILIES[f]}</button>)}
      </div>
      <div className="grid gap-4 2xl:grid-cols-[1fr_240px]">
        <div tabIndex={0} role="region" aria-label="Periodic table (scrolls sideways)" className="relative overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-pink-500">
          <div className="grid gap-0.5 min-w-[760px]" style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gridTemplateRows: 'repeat(7, auto) 10px repeat(2, auto)' }}>
            {ELEMENTS.map((e) => { const on = match(e); return (
              <button key={e.z} type="button" onClick={() => setSel(e)} aria-pressed={sel.z === e.z}
                className={cn('aspect-square rounded-md p-0.5 text-zinc-900 text-start leading-none transition-[transform,opacity] duration-200 hover:scale-110 hover:z-10 focus-visible:z-10', !on && 'opacity-20', sel.z === e.z && 'ring-2 ring-pink-600 scale-110 z-10')}
                style={{ gridColumn: e.col, gridRow: e.row, background: FAM_COLOUR[e.family] }}>
                <span className="block text-[9px] font-mono">{e.z}</span>{' '}
                <span className="block text-center text-sm font-bold">{e.symbol}</span><span className="sr-only">, {e.name}</span>
              </button>
            ); })}
          </div>
        </div>
        <motion.div key={sel.z} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="rounded-2xl p-4 text-zinc-900 ring-1 ring-black/10 self-start" style={{ background: FAM_COLOUR[sel.family] }} aria-live="polite">
          <p className="font-mono text-sm">{sel.z}</p>
          <p className="text-5xl font-bold">{sel.symbol}</p>
          <p className="text-xl font-semibold">{sel.name}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-700">Atomic weight</dt><dd className="font-mono">{sel.mass}</dd>
            <dt className="text-zinc-700">Family</dt><dd>{FAMILIES[sel.family]}</dd>
            <dt className="text-zinc-700">Group</dt><dd className="font-mono">{sel.group ?? '—'}</dd>
            <dt className="text-zinc-700">Period</dt><dd className="font-mono">{sel.period}</dd>
            <dt className="text-zinc-700">At room temp.</dt><dd>{sel.state}</dd>
          </dl>
        </motion.div>
      </div>
    </div>
  );
}

interface Q { id: string; q: string; options: string[]; answer: number }
interface QuizT { id: string; title: string; questions: Q[] }
const sampleQuiz = (): QuizT => ({ id: uid(), title: 'Solar system', questions: [
  { id: uid(), q: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], answer: 1 },
  { id: uid(), q: 'What is the largest planet?', options: ['Saturn', 'Neptune', 'Jupiter', 'Uranus'], answer: 2 },
  { id: uid(), q: 'Which planet has the famous rings?', options: ['Saturn', 'Mars', 'Venus', 'Mercury'], answer: 0 },
] });
/** Quiz maker: write questions, then take the quiz here or print it with an answer key. */
function Quiz() {
  const [quizzes, setQuizzes] = useKept<QuizT[]>('uv-quizzes', () => [sampleQuiz()]);
  const [at, setAt] = useState(0), [mode, setMode] = useState<'edit' | 'take'>('take');
  const [order, setOrder] = useState<number[]>(() => (quizzes[0]?.questions ?? []).map((_, k) => k)), [i, setI] = useState(0), [picked, setPicked] = useState<number | null>(null), [right, setRight] = useState(0), [mixUp, setMixUp] = useState(false);
  const quiz = quizzes[Math.min(at, quizzes.length - 1)];
  const put = (p: Partial<QuizT>) => setQuizzes(quizzes.map((x) => (x.id === quiz.id ? { ...x, ...p } : x)));
  const begin = (qz: QuizT = quiz) => { const o = qz.questions.map((_, k) => k); if (mixUp) for (let k = o.length - 1; k > 0; k--) { const j = rnd(k + 1); [o[k], o[j]] = [o[j], o[k]]; } setOrder(o); setI(0); setPicked(null); setRight(0); setMode('take'); };
  const cur = quiz?.questions[order[i]];
  const finished = mode === 'take' && quiz && i >= order.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Quiz"><select className="input" value={at} onChange={(e) => { setAt(+e.target.value); begin(quizzes[+e.target.value]); }}>{quizzes.map((x, k) => <option key={x.id} value={k}>{x.title} ({x.questions.length})</option>)}</select></Field>
        <Btn on={mode === 'take'} onClick={() => begin()}><Play className="w-3.5 h-3.5" aria-hidden />Take it</Btn>
        <Btn on={mode === 'edit'} onClick={() => setMode('edit')}><Pencil className="w-3.5 h-3.5" aria-hidden />Edit</Btn>
        <Btn onClick={() => { const n: QuizT = { id: uid(), title: 'New quiz', questions: [{ id: uid(), q: '', options: ['', '', '', ''], answer: 0 }] }; setQuizzes([...quizzes, n]); setAt(quizzes.length); setMode('edit'); }}><Plus className="w-3.5 h-3.5" aria-hidden />New quiz</Btn>
        <Btn onClick={() => printOnly('quiz-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn>
      </div>
      {mode === 'edit' && quiz && (
        <div className="space-y-3">
          <div className="flex gap-2"><input className="input font-bold" aria-label="Quiz title" value={quiz.title} onChange={(e) => put({ title: e.target.value })} />{quizzes.length > 1 && <Btn onClick={() => ask(`Delete “${quiz.title}”?`, () => { setQuizzes(quizzes.filter((x) => x.id !== quiz.id)); setAt(0); })}><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete</Btn>}</div>
          {quiz.questions.map((qq, k) => (
            <fieldset key={qq.id} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 space-y-2">
              <legend className="px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Question {k + 1}</legend>
              <div className="flex gap-2"><input className="input" aria-label={`Question ${k + 1}`} value={qq.q} onChange={(e) => put({ questions: quiz.questions.map((x) => (x.id === qq.id ? { ...x, q: e.target.value } : x)) })} placeholder="The question" />
                <button type="button" onClick={() => put({ questions: quiz.questions.filter((x) => x.id !== qq.id) })} aria-label={`Remove question ${k + 1}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {qq.options.map((o, j) => (
                  <label key={j} className="flex items-center gap-2">
                    <input type="radio" name={`ans-${qq.id}`} checked={qq.answer === j} onChange={() => put({ questions: quiz.questions.map((x) => (x.id === qq.id ? { ...x, answer: j } : x)) })} className="accent-pink-500" aria-label={`Answer ${j + 1} is right`} />
                    <input className="input py-1.5" aria-label={`Answer ${j + 1}`} value={o} onChange={(e) => put({ questions: quiz.questions.map((x) => (x.id === qq.id ? { ...x, options: x.options.map((y, m) => (m === j ? e.target.value : y)) } : x)) })} placeholder={`Answer ${j + 1}`} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <Btn onClick={() => put({ questions: [...quiz.questions, { id: uid(), q: '', options: ['', '', '', ''], answer: 0 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Add a question</Btn>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">Pick the circle beside the right answer.</p>
        </div>
      )}
      {mode === 'take' && quiz && (finished ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy} className="rounded-3xl bg-zinc-100/70 dark:bg-white/[0.04] p-6 text-center space-y-2">
          <p className="text-5xl font-bold font-mono text-zinc-900 dark:text-white">{right}/{order.length}</p>
          <p className="text-zinc-700 dark:text-zinc-200">{right === order.length ? 'Perfect!' : right >= order.length / 2 ? 'Well done.' : 'Keep practising.'}</p>
          <div className="flex justify-center gap-2"><button type="button" onClick={() => begin()} className="btn-primary"><RotateCcw className="w-4 h-4" aria-hidden />Again</button><Btn on={mixUp} onClick={() => setMixUp(!mixUp)}><Shuffle className="w-3.5 h-3.5" aria-hidden />Mix the order</Btn></div>
        </motion.div>
      ) : cur ? (
        <motion.div key={cur.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={spring.smooth} className="space-y-3">
          <div className="flex items-center gap-3"><span className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><span className="block h-full bg-pink-500 transition-[width] duration-300" style={{ width: `${(i / order.length) * 100}%` }} /></span><span className="text-sm font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{i + 1}/{order.length}</span></div>
          <p className="text-xl font-bold text-zinc-900 dark:text-white" translate="no">{cur.q}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {cur.options.map((o, j) => o && (
              <button key={j} type="button" disabled={picked !== null} onClick={() => { setPicked(j); if (j === cur.answer) setRight(right + 1); }}
                className={cn('rounded-2xl border-2 p-3 text-start font-semibold transition-[background-color,border-color,transform] active:scale-[0.98] disabled:cursor-default', picked === null ? 'border-zinc-200 dark:border-white/10 hover:border-pink-500 text-zinc-900 dark:text-white' : j === cur.answer ? 'border-emerald-600 bg-emerald-500/15 text-zinc-900 dark:text-white' : picked === j ? 'border-rose-600 bg-rose-500/15 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-white/10 opacity-60 text-zinc-900 dark:text-white')} translate="no">
                {picked !== null && j === cur.answer && <Check className="inline w-4 h-4 me-1" aria-hidden />}{picked === j && j !== cur.answer && <X className="inline w-4 h-4 me-1" aria-hidden />}{o}
              </button>
            ))}
          </div>
          {picked !== null && <button type="button" onClick={() => { setI(i + 1); setPicked(null); }} className="btn-primary">{i + 1 < order.length ? 'Next question' : 'See my score'}</button>}
        </motion.div>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">This quiz has no questions yet: choose Edit.</p>)}
      {quiz && (
        <div id="quiz-sheet" className="hidden print:block text-zinc-900">
          <h2 className="text-2xl font-bold">{quiz.title}</h2>
          <ol className="mt-4 space-y-4 list-decimal ps-6">{quiz.questions.map((qq) => <li key={qq.id}><p className="font-semibold">{qq.q}</p><ol className="list-[lower-alpha] ps-6">{qq.options.filter(Boolean).map((o, j) => <li key={j}>{o}</li>)}</ol></li>)}</ol>
          <p className="mt-8 text-sm">Answers: {quiz.questions.map((qq, k) => `${k + 1}${String.fromCharCode(97 + qq.answer)}`).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}

/** Seating plan: names into seats; tap two seats to swap them; shuffle; print. */
function Seating() {
  const [s, setS] = useKept('uv-seating', () => ({ rows: 4, cols: 6, names: 'Aisha\nBen\nCarlos\nDara\nElif\nFinn\nGrace\nHiro\nIsha\nJonas\nKofi\nLena', seats: [] as string[] }));
  const [pick, setPick] = useState<number | null>(null);
  const n = s.rows * s.cols, names = s.names.split('\n').map((x) => x.trim()).filter(Boolean);
  const seats = Array.from({ length: n }, (_, k) => s.seats[k] ?? '');
  const fill = (list: string[]) => setS({ ...s, seats: Array.from({ length: n }, (_, k) => list[k] ?? '') });
  const shuffle = () => { const l = [...names]; for (let k = l.length - 1; k > 0; k--) { const j = rnd(k + 1); [l[k], l[j]] = [l[j], l[k]]; } fill(l); };
  const tap = (k: number) => { if (pick === null) return setPick(k); const next = [...seats]; [next[pick], next[k]] = [next[k], next[pick]]; setS({ ...s, seats: next }); setPick(null); };
  const missing = names.filter((x) => !seats.includes(x));
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        <Field label="Names, one a line"><textarea className="input min-h-[200px] text-sm" value={s.names} onChange={(e) => setS({ ...s, names: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Rows"><input type="number" min={1} max={12} className="input" value={s.rows} onChange={(e) => setS({ ...s, rows: Math.max(1, Math.min(12, +e.target.value || 1)) })} /></Field><Field label="Seats a row"><input type="number" min={1} max={12} className="input" value={s.cols} onChange={(e) => setS({ ...s, cols: Math.max(1, Math.min(12, +e.target.value || 1)) })} /></Field></div>
        <div className="flex flex-wrap gap-2"><Btn onClick={() => fill(names)}>In order</Btn><Btn onClick={shuffle}><Shuffle className="w-3.5 h-3.5" aria-hidden />Shuffle</Btn><Btn onClick={() => printOnly('seat-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
        {missing.length > 0 && seats.some(Boolean) && <p className="text-xs text-amber-800 dark:text-amber-200">Not seated: {missing.join(', ')}</p>}
      </div>
      <div id="seat-sheet" className="rounded-2xl bg-white p-4 ring-1 ring-black/10 text-zinc-900 space-y-3">
        <p className="mx-auto w-1/2 rounded-lg bg-zinc-800 py-1.5 text-center text-sm font-semibold text-white">Front of the room</p>
        <div tabIndex={0} role="region" aria-label="Seats" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
          <div className="grid gap-2 mx-auto w-max" style={{ gridTemplateColumns: `repeat(${s.cols}, 88px)` }}>
            {seats.map((name, k) => (
              <motion.button key={k} layout type="button" onClick={() => tap(k)} aria-pressed={pick === k} aria-label={`Seat ${k + 1}: ${name || 'empty'}`} transition={spring.snappy}
                className={cn('h-14 rounded-xl border-2 px-1 text-sm font-semibold transition-colors', pick === k ? 'border-pink-600 bg-pink-100' : name ? 'border-zinc-300 bg-zinc-50 hover:border-pink-400' : 'border-dashed border-zinc-300 text-[#4b5068]')} translate="no">
                {name || '—'}
              </motion.button>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-[#4b5068] print:hidden">{pick === null ? 'Tap a seat, then another, to swap them.' : 'Now tap the seat to swap with.'}</p>
      </div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]] };
/** Dice, a coin and random numbers, fairly (the browser's crypto random). */
function DiceCoins() {
  const [n, setN] = useState(2), [dice, setDice] = useState<number[]>([3, 5]), [roll, setRoll] = useState(0), [coin, setCoin] = useState<'Heads' | 'Tails' | null>(null), [flips, setFlips] = useState(0);
  const [lo, setLo] = useState(1), [hi, setHi] = useState(100), [num, setNum] = useState<number | null>(null), [hist, setHist] = useState<string[]>([]);
  const log = (t: string) => setHist((h) => [t, ...h].slice(0, 10));
  const rollDice = () => { const d = Array.from({ length: n }, () => 1 + rnd(6)); setDice(d); setRoll(roll + 1); log(`Dice: ${d.join(' + ')} = ${d.reduce((a, b) => a + b, 0)}`); };
  const flip = () => { const c = rnd(2) ? 'Heads' : 'Tails'; setCoin(c); setFlips(flips + 1); log(`Coin: ${c}`); };
  const pickNum = () => { const a = Math.min(lo, hi), b = Math.max(lo, hi), v = a + rnd(b - a + 1); setNum(v); log(`Number ${a}–${b}: ${v}`); };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-4 space-y-3 text-center" aria-label="Dice">
        <div className="flex flex-wrap justify-center gap-3 min-h-16">
          {dice.map((d, k) => (
            <motion.div key={`${roll}-${k}`} initial={{ rotate: -200, scale: 0.85, opacity: 0.4 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: k * 0.05 }} className="grid grid-cols-3 grid-rows-3 w-16 h-16 rounded-2xl bg-white p-2 shadow-md ring-1 ring-black/10" role="img" aria-label={`${d}`}>
              {Array.from({ length: 9 }, (_, c) => <span key={c} className={cn('m-auto w-2.5 h-2.5 rounded-full', PIPS[d].some(([r, cc]) => r * 3 + cc === c) ? 'bg-zinc-900' : '')} />)}
            </motion.div>
          ))}
        </div>
        <p className="font-mono text-2xl font-bold text-zinc-900 dark:text-white" role="status">{dice.reduce((a, b) => a + b, 0)}</p>
        <div className="flex justify-center items-center gap-2"><select className="input w-auto!" aria-label="How many dice" value={n} onChange={(e) => setN(+e.target.value)}>{[1, 2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x} dice</option>)}</select><button type="button" onClick={rollDice} className="btn-primary btn-sm"><Dices className="w-4 h-4" aria-hidden />Roll</button></div>
      </section>
      <section className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-4 space-y-3 text-center [perspective:600px]" aria-label="Coin">
        <motion.div key={flips} initial={{ rotateY: 0 }} animate={{ rotateY: 720 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="mx-auto grid place-items-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 font-bold shadow-md">{coin ? coin[0] : '?'}</motion.div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-white" role="status">{coin ?? 'Flip it'}</p>
        <button type="button" onClick={flip} className="btn-primary btn-sm">Flip a coin</button>
      </section>
      <section className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-4 space-y-3 text-center" aria-label="Random number">
        <div className="flex justify-center gap-2"><Field label="From"><input type="number" className="input w-24" value={lo} onChange={(e) => setLo(Math.trunc(+e.target.value))} /></Field><Field label="To"><input type="number" className="input w-24" value={hi} onChange={(e) => setHi(Math.trunc(+e.target.value))} /></Field></div>
        <motion.p key={num ?? 'x'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy} className="font-mono text-4xl font-bold text-zinc-900 dark:text-white" role="status">{num ?? '—'}</motion.p>
        <button type="button" onClick={pickNum} className="btn-primary btn-sm">Pick a number</button>
      </section>
      {hist.length > 0 && <ol className="lg:col-span-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-300" aria-label="Last results">{hist.map((h, k) => <li key={k} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5">{h}</li>)}</ol>}
    </div>
  );
}

/** Fractions: add, take away, times, divide; simplest form, mixed number and decimal. */
function Fractions() {
  const [a, setA] = useState('1 1/2'), [b, setB] = useState('3/4'), [op, setOp] = useState<'+' | '-' | '×' | '÷'>('+');
  let res: Frac | null = null, err = '';
  try { res = fracOp(parseFrac(a), op, parseFrac(b)); } catch (e) { err = (e as Error).message; }
  const val = res ? res[0] / res[1] : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="First"><input className="input w-32 font-mono text-lg" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <div role="group" aria-label="Sum" className="flex gap-1 pb-1">{(['+', '-', '×', '÷'] as const).map((o) => <Btn key={o} on={op === o} onClick={() => setOp(o)}><span className="font-mono text-base">{o === '-' ? '−' : o}</span></Btn>)}</div>
        <Field label="Second"><input className="input w-32 font-mono text-lg" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      {err ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : res && (
        <>
          <dl className="grid grid-cols-3 gap-2 text-sm"><Stat big k="Simplest" v={`${res[0]}/${res[1]}`} /><Stat big k="Mixed number" v={mixed(res)} /><Stat big k="Decimal" v={nf(val, 6)} /></dl>
          {val >= 0 && val <= 4 && (
            <div className="flex gap-1" role="img" aria-label={`${mixed(res)} as bars`}>
              {Array.from({ length: Math.max(1, Math.ceil(val)) }, (_, k) => <span key={k} className="flex-1 h-6 rounded-md bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full bg-pink-500" initial={false} animate={{ width: `${Math.max(0, Math.min(1, val - k)) * 100}%` }} transition={spring.smooth} /></span>)}
            </div>
          )}
        </>
      )}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Write 3/4, 1 1/2 (a space before the fraction), a whole number or a decimal.</p>
    </div>
  );
}

/** Equation solver: ax² + bx + c = 0 (or a straight line), with the working. */
function Equation() {
  const [a, setA] = useState('1'), [b, setB] = useState('-5'), [c, setC] = useState('6');
  const r = solveQuadratic(+a || 0, +b || 0, +c || 0);
  const term = (v: string, x: string) => (+v ? `${+v < 0 ? ' − ' : ' + '}${Math.abs(+v) === 1 && x ? '' : Math.abs(+v)}${x}` : '');
  const eq = `${(+a ? `${+a === 1 ? '' : +a === -1 ? '−' : +a}x²` : '') + term(b, 'x') + term(c, '')}`.replace(/^ \+ /, '').replace(/^ − /, '−') || '0';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 font-mono">
        <Field label="a (x²)"><input className="input w-24" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="b (x)"><input className="input w-24" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        <Field label="c"><input className="input w-24" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-white"><span className="font-mono">{eq} = 0</span></p>
      <ol className="space-y-1 rounded-2xl bg-zinc-100/70 dark:bg-white/[0.05] p-4 font-mono text-sm text-zinc-900 dark:text-white">{r.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
      <p className="text-xl font-bold text-zinc-900 dark:text-white" role="status">{r.roots.length ? r.roots.map((x, k) => <span key={k} className="me-4 font-mono">x{r.roots.length > 1 ? <sub>{k + 1}</sub> : ''} = {x}</span>) : 'No single answer.'}</p>
    </div>
  );
}

const SHAPES: Record<string, { inputs: string[]; out: (v: number[]) => [string, number, string][]; svg: React.ReactNode }> = {
  Rectangle: { inputs: ['Length', 'Width'], out: ([l, w]) => [['Area', l * w, 'l × w'], ['Perimeter', 2 * (l + w), '2(l + w)'], ['Diagonal', Math.hypot(l, w), '√(l² + w²)']], svg: <rect x="10" y="20" width="80" height="50" /> },
  Circle: { inputs: ['Radius'], out: ([r]) => [['Area', Math.PI * r * r, 'πr²'], ['Circumference', 2 * Math.PI * r, '2πr'], ['Diameter', 2 * r, '2r']], svg: <circle cx="50" cy="45" r="32" /> },
  Triangle: { inputs: ['Base', 'Height', 'Side a', 'Side b'], out: ([b, h, a, c]) => [['Area', 0.5 * b * h, '½ × base × height'], ['Perimeter', b + a + c, 'base + a + b']], svg: <polygon points="10,75 90,75 40,15" /> },
  Trapezium: { inputs: ['Top', 'Bottom', 'Height'], out: ([a, b, h]) => [['Area', ((a + b) / 2) * h, '½(a + b) × h']], svg: <polygon points="30,20 70,20 90,75 10,75" /> },
  Cube: { inputs: ['Side'], out: ([s]) => [['Volume', s ** 3, 's³'], ['Surface area', 6 * s * s, '6s²']], svg: <><rect x="20" y="30" width="45" height="45" /><polyline points="20,30 35,15 80,15 65,30" /><polyline points="80,15 80,60 65,75" /></> },
  Cylinder: { inputs: ['Radius', 'Height'], out: ([r, h]) => [['Volume', Math.PI * r * r * h, 'πr²h'], ['Surface area', 2 * Math.PI * r * (r + h), '2πr(r + h)']], svg: <><ellipse cx="50" cy="18" rx="30" ry="8" /><path d="M20,18 V72 A30,8 0 0 0 80,72 V18" /></> },
  Cone: { inputs: ['Radius', 'Height'], out: ([r, h]) => [['Volume', (Math.PI * r * r * h) / 3, '⅓πr²h'], ['Surface area', Math.PI * r * (r + Math.hypot(r, h)), 'πr(r + slant)']], svg: <><ellipse cx="50" cy="72" rx="30" ry="8" /><polyline points="20,72 50,10 80,72" /></> },
  Sphere: { inputs: ['Radius'], out: ([r]) => [['Volume', (4 / 3) * Math.PI * r ** 3, '⁴⁄₃πr³'], ['Surface area', 4 * Math.PI * r * r, '4πr²']], svg: <><circle cx="50" cy="45" r="32" /><ellipse cx="50" cy="45" rx="32" ry="9" /></> },
};
/** Shapes: area, perimeter, volume and surface, with the formula. */
function Shapes() {
  const [shape, setShape] = useState('Rectangle'), [vals, setVals] = useState<Record<string, string>>({ Length: '8', Width: '5', Radius: '3', Base: '6', Height: '4', 'Side a': '5', 'Side b': '5', Top: '4', Bottom: '8', Side: '3' }), [unit, setUnit] = useState('cm');
  const s = SHAPES[shape], v = s.inputs.map((k) => Math.max(0, +vals[k] || 0));
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">{Object.keys(SHAPES).map((k) => <Btn key={k} on={shape === k} onClick={() => setShape(k)}>{k}</Btn>)}</div>
        <div className="flex flex-wrap items-end gap-2">
          {s.inputs.map((k) => <Field key={k} label={k}><input className="input w-24 font-mono" inputMode="decimal" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>)}
          <Field label="Unit"><select className="input w-auto!" value={unit} onChange={(e) => setUnit(e.target.value)}>{['mm', 'cm', 'm', 'km', 'in', 'ft'].map((u) => <option key={u}>{u}</option>)}</select></Field>
        </div>
        <dl className="grid gap-2 sm:grid-cols-3 text-sm">
          {s.out(v).map(([k, n, f]) => <div key={k} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{k} · <span className="font-mono">{f}</span></dt><dd className="font-mono tabular-nums text-lg font-bold text-zinc-900 dark:text-white">{nf(n, 3)} {unit}{/Area|Surface/.test(k) ? '²' : /Volume/.test(k) ? '³' : ''}</dd></div>)}
        </dl>
      </div>
      <svg viewBox="0 0 100 90" className="w-full max-w-[160px] fill-pink-500/20 stroke-pink-600 dark:stroke-pink-300" strokeWidth={2} role="img" aria-label={shape}>{s.svg}</svg>
    </div>
  );
}

/** Number facts: prime or not, factors, primes that make it; GCD and LCM of a list. */
function NumFacts() {
  const [v, setV] = useState('360'), [list, setList] = useState('12, 18, 30');
  const n = Math.trunc(+v);
  const ok = Number.isFinite(n) && n > 0 && n <= 1e12;
  const pf = ok ? primeFactors(n) : [], powers = [...new Set(pf)].map((p) => { const c = pf.filter((x) => x === p).length; return c > 1 ? `${p}${String(c).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])}` : `${p}`; }).join(' × ');
  const nums = list.split(/[\s,]+/).map(Number).filter((x) => Number.isInteger(x) && x > 0);
  return (
    <div className="space-y-4">
      <Field label="A whole number"><input className="input w-48 font-mono text-lg" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      {ok ? (
        <dl className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-sm">
          <Stat k="Prime?" v={isPrime(n) ? 'Yes' : 'No'} /><Stat k="Even or odd" v={n % 2 ? 'Odd' : 'Even'} /><Stat k="Square root" v={nf(Math.sqrt(n), 4)} /><Stat k="In binary" v={n.toString(2)} />
          <div className="col-span-2 sm:col-span-4 rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">Made of primes</dt><dd className="font-mono text-lg text-zinc-900 dark:text-white">{n === 1 ? '1' : powers}</dd></div>
          {n <= 1e9 && <div className="col-span-2 sm:col-span-4 rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">Factors ({divisors(n).length})</dt><dd className="font-mono text-sm text-zinc-900 dark:text-white break-words">{divisors(n).slice(0, 200).join(', ')}</dd></div>}
        </dl>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">Type a whole number from 1 to a trillion.</p>}
      <div className="space-y-2">
        <Field label="Several numbers, for HCF and LCM"><input className="input font-mono" value={list} onChange={(e) => setList(e.target.value)} /></Field>
        {nums.length > 1 && <dl className="grid grid-cols-2 gap-2 text-sm"><Stat big k="Highest common factor" v={nums.reduce(gcd)} /><Stat big k="Lowest common multiple" v={nums.reduce(lcm).toLocaleString()} /></dl>}
      </div>
    </div>
  );
}

const LIGHTS = [{ k: 'red', c: '#ef4444', dim: '#7f1d1d' }, { k: 'amber', c: '#f59e0b', dim: '#78350f' }, { k: 'green', c: '#22c55e', dim: '#14532d' }] as const;
/** Classroom traffic light: show what kind of work it is, big. */
function Traffic() {
  const [on, setOn] = useKept<'red' | 'amber' | 'green'>('uv-traffic-on', 'green');
  const [labels, setLabels] = useKept('uv-traffic-labels', { red: 'Silent work', amber: 'Whisper with a partner', green: 'Open discussion' });
  const { ref: fullRef, full: isFull, toggle: toggleFull, boxClass } = useFull<HTMLDivElement>();
  return (
    <div ref={fullRef} className={cn('space-y-4', boxClass, isFull && 'grid place-items-center')}>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
        <div className="flex flex-col gap-3 rounded-[2rem] bg-zinc-900 p-4 shadow-xl" role="radiogroup" aria-label="Light">
          {LIGHTS.map((l) => (
            <button key={l.k} type="button" role="radio" aria-checked={on === l.k} aria-label={labels[l.k]} onClick={() => setOn(l.k)} className="rounded-full transition-[background-color,box-shadow] duration-300" style={{ width: isFull ? 'min(22vh, 180px)' : 96, height: isFull ? 'min(22vh, 180px)' : 96, background: on === l.k ? l.c : l.dim, boxShadow: on === l.k ? `0 0 48px ${l.c}` : 'none' }} />
          ))}
        </div>
        <p className={cn('max-w-md text-center font-bold text-zinc-900 dark:text-white', isFull ? 'text-6xl' : 'text-3xl')} role="status" translate="no">{labels[on]}</p>
      </div>
      {!isFull && (
        <div className="grid gap-2 sm:grid-cols-3">
          {LIGHTS.map((l) => <Field key={l.k} label={`${l.k[0].toUpperCase()}${l.k.slice(1)} means`}><input className="input" value={labels[l.k]} onChange={(e) => setLabels({ ...labels, [l.k]: e.target.value })} /></Field>)}
        </div>
      )}
      <div className="flex justify-center"><FullBtn full={isFull} onClick={() => void toggleFull()} /></div>
    </div>
  );
}

/** Scoreboard for teams: big numbers, the leader on top. */
function Scoreboard() {
  const [teams, setTeams] = useKept('uv-scoreboard', () => [{ id: uid(), name: 'Team Red', score: 0, c: 5 }, { id: uid(), name: 'Team Blue', score: 0, c: 4 }, { id: uid(), name: 'Team Green', score: 0, c: 7 }]);
  const [sort, setSort] = useState(true);
  const { ref: fullRef, full: isFull, toggle: toggleFull, boxClass } = useFull<HTMLDivElement>();
  const add = (id: string, d: number) => setTeams(teams.map((t) => (t.id === id ? { ...t, score: t.score + d } : t)));
  const shown = sort ? [...teams].sort((a, b) => b.score - a.score) : teams, top = Math.max(...teams.map((t) => t.score));
  return (
    <div ref={fullRef} className={cn('space-y-3', boxClass)}>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setTeams([...teams, { id: uid(), name: `Team ${teams.length + 1}`, score: 0, c: teams.length % BRANCH.length }])}><Plus className="w-3.5 h-3.5" aria-hidden />Team</Btn>
        <Btn on={sort} onClick={() => setSort(!sort)}>Leader on top</Btn>
        <Btn onClick={() => ask('Set every score back to 0?', () => setTeams(teams.map((t) => ({ ...t, score: 0 }))))}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Reset</Btn>
        <FullBtn full={isFull} onClick={() => void toggleFull()} />
      </div>
      <ul className="space-y-2">
        {shown.map((t) => (
          <motion.li key={t.id} layout transition={spring.smooth} className="flex items-center gap-3 rounded-2xl p-3 text-white" style={{ background: BRANCH[t.c % BRANCH.length] }}>
            <input className={cn('flex-1 min-w-0 bg-transparent font-bold outline-none placeholder:text-white/70', isFull ? 'text-4xl' : 'text-xl')} aria-label="Team name" value={t.name} onChange={(e) => setTeams(teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} />
            {t.score === top && top > 0 && <span className="text-2xl" aria-label="Leading">★</span>}
            <motion.span key={t.score} initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={spring.bouncy} className={cn('font-mono tabular-nums font-bold', isFull ? 'text-7xl' : 'text-4xl')}>{t.score}</motion.span>
            <div className="flex gap-1">
              <button type="button" onClick={() => add(t.id, -1)} aria-label={`Minus one for ${t.name}`} className="w-10 h-10 grid place-items-center rounded-full bg-black/20 active:scale-90 transition-transform"><Minus className="w-4 h-4" aria-hidden /></button>
              <button type="button" onClick={() => add(t.id, 1)} aria-label={`Plus one for ${t.name}`} className="w-10 h-10 grid place-items-center rounded-full bg-white/25 active:scale-90 transition-transform"><Plus className="w-4 h-4" aria-hidden /></button>
              <button type="button" onClick={() => add(t.id, 5)} className="h-10 px-3 rounded-full bg-white/25 font-bold active:scale-90 transition-transform">+5<span className="sr-only"> for {t.name}</span></button>
              {!isFull && teams.length > 1 && <button type="button" onClick={() => { setTeams(teams.filter((x) => x.id !== t.id)); toast.success(`${t.name} removed`); }} aria-label={`Remove ${t.name}`} className="w-10 h-10 grid place-items-center rounded-full bg-black/20"><Trash2 className="w-4 h-4" aria-hidden /></button>}
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

