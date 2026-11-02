'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Check, Play, Plus, Printer, RotateCcw, Trash2, Volume2, X } from 'lucide-react';
import { det, inverse, matMul, molarMass, solveTriangle, type Matrix } from '@/lib/tools-5';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Btn, Field } from './QuickTools';
import { printOnly, uid, useKept } from './kept';
import { BRANCH, nf, rnd, Segments, Stat } from './bits';

// Collaborate → Create → Study and teach, fifth set (M75): times tables, spelling tests, telling the
// time, a number line, Venn diagrams, a history timeline, probability, trigonometry, triangles,
// matrices, molar mass and physics formulas. All on the device.

export type ScienceId = 'times' | 'spelling' | 'clock' | 'numberline' | 'venn' | 'history' | 'probability' | 'trig' | 'triangle' | 'matrices' | 'molar' | 'physics';

export function ScienceTool({ id }: { id: ScienceId }) {
  const T = { times: Times, spelling: Spelling, clock: ClockQuiz, numberline: NumberLine, venn: Venn, history: History, probability: Probability, trig: Trig, triangle: Triangle, matrices: Matrices, molar: Molar, physics: Physics }[id];
  return <T />;
}

/** Times tables: the square to explore, and a quick quiz on one table. */
function Times() {
  const [n, setN] = useState(12), [hover, setHover] = useState<[number, number] | null>(null), [table, setTable] = useState(7), [q, setQ] = useState(() => 1 + rnd(12)), [ans, setAns] = useState(''), [score, setScore] = useState({ ok: 0, all: 0 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Field label="Size"><select className="input w-auto!" value={n} onChange={(e) => setN(+e.target.value)}>{[10, 12, 15, 20].map((x) => <option key={x} value={x}>{x} × {x}</option>)}</select></Field>{hover && <p className="pt-5 font-mono text-lg font-bold text-zinc-900 dark:text-white" role="status">{hover[0]} × {hover[1]} = {hover[0] * hover[1]}</p>}</div>
      <div tabIndex={0} role="region" aria-label="Times table square" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500" onPointerLeave={() => setHover(null)}>
        <table className="text-xs font-mono tabular-nums border-collapse">
          <tbody>{Array.from({ length: n + 1 }, (_, r) => <tr key={r}>{Array.from({ length: n + 1 }, (_, c) => { const head = !r || !c, on = hover && (hover[0] === r || hover[1] === c) && r <= hover[0] && c <= hover[1]; return <td key={c} onPointerEnter={() => !head && setHover([r, c])} onClick={() => !head && setHover([r, c])} className={cn('w-8 h-8 text-center transition-colors duration-100', head ? 'font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10' : on ? 'bg-pink-300 text-zinc-900' : 'text-zinc-800 dark:text-zinc-100')}>{!r && !c ? '×' : !r ? c : !c ? r : r * c}</td>; })}</tr>)}</tbody>
        </table>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const ok = +ans === table * q; setScore({ ok: score.ok + (ok ? 1 : 0), all: score.all + 1 }); (ok ? toast.success : toast.error)(ok ? 'Right!' : `${table} × ${q} = ${table * q}`); setQ(1 + rnd(12)); setAns(''); }} className="flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-4">
        <select className="input w-auto!" aria-label="Table to practise" value={table} onChange={(e) => setTable(+e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>The {i + 1} times table</option>)}</select>
        <span className="font-mono text-2xl font-bold text-zinc-900 dark:text-white">{table} × {q} =</span>
        <input className="input w-24 font-mono text-xl" inputMode="numeric" aria-label="Answer" value={ans} onChange={(e) => setAns(e.target.value.replace(/\D/g, ''))} />
        <button type="submit" className="btn-primary btn-sm">Check</button>
        <span className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{score.ok}/{score.all} right</span>
      </form>
    </div>
  );
}

/** Spelling test: the words are read aloud; type each; see the score and the ones to practise. */
function Spelling() {
  const [words, setWords] = useKept('uv-spelling-words', 'necessary\nseparate\nrhythm\nbeautiful\nbecause\nenvironment');
  const list = words.split('\n').map((w) => w.trim()).filter(Boolean);
  const [i, setI] = useState(-1), [typed, setTyped] = useState(''), [res, setRes] = useState<{ w: string; got: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const say = (w: string) => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(w); u.rate = 0.8; speechSynthesis.speak(u); } catch { toast.error('This browser can’t read aloud.'); } };
  const begin = () => { setRes([]); setI(0); setTyped(''); say(list[0]); requestAnimationFrame(() => input.current?.focus()); };
  const submit = () => { const r = [...res, { w: list[i], got: typed.trim() }]; setRes(r); setTyped(''); if (i + 1 < list.length) { setI(i + 1); say(list[i + 1]); } else { setI(-2); if (r.every((x) => x.got.toLowerCase() === x.w.toLowerCase())) celebrate(); } };
  const right = res.filter((x) => x.got.toLowerCase() === x.w.toLowerCase()).length;
  return (
    <div className="space-y-3">
      {i === -1 && <><Field label="Words, one a line (the teacher or a parent types them)"><textarea className="input min-h-[150px]" value={words} onChange={(e) => setWords(e.target.value)} /></Field><button type="button" disabled={!list.length} onClick={begin} className="btn-primary btn-sm"><Play className="w-4 h-4" aria-hidden />Start the test ({list.length} words)</button></>}
      {i >= 0 && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-5 space-y-3 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">Word {i + 1} of {list.length}</p>
          <button type="button" onClick={() => say(list[i])} className="btn-secondary"><Volume2 className="w-4 h-4" aria-hidden />Hear it again</button>
          <input ref={input} className="input mx-auto max-w-xs text-center text-2xl" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label="Spell the word" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" className="btn-primary btn-sm">Next</button>
        </form>
      )}
      {i === -2 && (
        <div className="space-y-2">
          <p className="text-3xl font-bold text-zinc-900 dark:text-white" role="status"><span className="font-mono">{right}/{res.length}</span> right</p>
          <ul className="space-y-1">{res.map((x, k) => { const ok = x.got.toLowerCase() === x.w.toLowerCase(); return <li key={k} className="flex items-center gap-2 text-sm">{ok ? <Check className="w-4 h-4 text-emerald-600" aria-label="right" /> : <X className="w-4 h-4 text-rose-600" aria-label="wrong" />}<span className="font-semibold text-zinc-900 dark:text-white" translate="no">{x.w}</span>{!ok && <span className="text-zinc-600 dark:text-zinc-300 line-through" translate="no">{x.got || '(blank)'}</span>}</li>; })}</ul>
          <div className="flex gap-2"><button type="button" onClick={begin} className="btn-primary btn-sm"><RotateCcw className="w-4 h-4" aria-hidden />Again</button><Btn onClick={() => { setWords(res.filter((x) => x.got.toLowerCase() !== x.w.toLowerCase()).map((x) => x.w).join('\n') || words); setI(-1); }}>Practise the wrong ones</Btn></div>
        </div>
      )}
    </div>
  );
}

const clockWords = (h: number, m: number) => { const H = ((h + 11) % 12) + 1, N = (H % 12) + 1; return m === 0 ? `${H} o’clock` : m === 15 ? `quarter past ${H}` : m === 30 ? `half past ${H}` : m === 45 ? `quarter to ${N}` : m < 30 ? `${m} minutes past ${H}` : `${60 - m} minutes to ${N}`; };
/** Telling the time: an analogue clock to read, set and be quizzed on. */
function ClockQuiz() {
  const [t, setT] = useState({ h: 3, m: 40 }), [step, setStep] = useState(5), [guess, setGuess] = useState(''), [score, setScore] = useState({ ok: 0, all: 0 });
  const ha = ((t.h % 12) + t.m / 60) * 30, ma = t.m * 6;
  const hand = (a: number, len: number, w: number, c: string) => <line x1="100" y1="100" x2={100 + len * Math.sin((a * Math.PI) / 180)} y2={100 - len * Math.cos((a * Math.PI) / 180)} stroke={c} strokeWidth={w} strokeLinecap="round" style={{ transition: 'all 400ms var(--ease-out-soft)' }} />;
  const fresh = () => { setT({ h: 1 + rnd(12), m: rnd(60 / step) * step }); setGuess(''); };
  const hh = String(t.h).padStart(2, '0'), mm = String(t.m).padStart(2, '0');
  return (
    <div className="grid gap-4 sm:grid-cols-[220px_1fr] items-start">
      <svg viewBox="0 0 200 200" className="w-full max-w-[220px]" role="img" aria-label={`A clock showing ${clockWords(t.h, t.m)}`}>
        <circle cx="100" cy="100" r="94" fill="#ffffff" stroke="#171f44" strokeWidth="5" />
        {Array.from({ length: 60 }, (_, i) => { const a = (i * 6 * Math.PI) / 180, r1 = i % 5 ? 84 : 78; return <line key={i} x1={100 + r1 * Math.sin(a)} y1={100 - r1 * Math.cos(a)} x2={100 + 89 * Math.sin(a)} y2={100 - 89 * Math.cos(a)} stroke="#171f44" strokeWidth={i % 5 ? 1 : 2.5} />; })}
        {Array.from({ length: 12 }, (_, i) => { const a = ((i + 1) * 30 * Math.PI) / 180; return <text key={i} x={100 + 64 * Math.sin(a)} y={106 - 64 * Math.cos(a)} textAnchor="middle" fontSize="16" fontWeight="700" fill="#171f44" fontFamily="system-ui">{i + 1}</text>; })}
        {hand(ha, 46, 7, '#171f44')}{hand(ma, 70, 4, '#ec4899')}<circle cx="100" cy="100" r="6" fill="#171f44" />
      </svg>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end"><Field label="Hour"><input type="number" min={1} max={12} className="input w-20" value={t.h} onChange={(e) => setT({ ...t, h: Math.max(1, Math.min(12, +e.target.value || 12)) })} /></Field><Field label="Minutes"><input type="number" min={0} max={59} className="input w-20" value={t.m} onChange={(e) => setT({ ...t, m: Math.max(0, Math.min(59, +e.target.value || 0)) })} /></Field></div>
        <p className="text-sm text-zinc-700 dark:text-zinc-200">In words: <b>{clockWords(t.h, t.m)}</b> · digital: <span className="font-mono">{hh}:{mm}</span></p>
        <form onSubmit={(e) => { e.preventDefault(); const m = /^(\d{1,2})[:.](\d{2})$/.exec(guess.trim()); const ok = !!m && ((+m[1] % 12) || 12) === ((t.h % 12) || 12) && +m[2] === t.m; setScore({ ok: score.ok + (ok ? 1 : 0), all: score.all + 1 }); (ok ? toast.success : toast.error)(ok ? 'Right!' : `It’s ${hh}:${mm}`); fresh(); }} className="flex flex-wrap items-end gap-2 rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-3">
          <Field label="Quiz: what time is it? (like 3:40)"><input className="input w-28 font-mono" value={guess} onChange={(e) => setGuess(e.target.value)} /></Field>
          <button type="submit" className="btn-primary btn-sm">Check</button><Btn onClick={fresh}>New time</Btn>
          <select className="input w-auto!" aria-label="Minutes in steps of" value={step} onChange={(e) => setStep(+e.target.value)}><option value={30}>Half hours</option><option value={15}>Quarters</option><option value={5}>5 minutes</option><option value={1}>Any minute</option></select>
          <span className="pb-2 text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{score.ok}/{score.all}</span>
        </form>
      </div>
    </div>
  );
}

/** Number line: put numbers, fractions and decimals on a line to compare them. */
function NumberLine() {
  const [t, setT] = useKept('uv-numberline', '-2, 1/2, 0.75, 1.5, 3, -0.5');
  const vals = t.split(/[,\s]+/).filter(Boolean).map((s) => { const m = /^(-?\d+)\/(\d+)$/.exec(s); const v = m ? +m[1] / +m[2] : Number(s); return { s, v }; }).filter((x) => Number.isFinite(x.v));
  const lo = Math.floor(Math.min(0, ...vals.map((x) => x.v))), hi = Math.ceil(Math.max(1, ...vals.map((x) => x.v))), W = 640, X = (v: number) => 30 + ((v - lo) / (hi - lo || 1)) * (W - 60);
  const sorted = [...vals].sort((a, b) => a.v - b.v);
  return (
    <div className="space-y-3">
      <Field label="Numbers (fractions like 3/4 are fine)"><input className="input font-mono" value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <svg viewBox={`0 0 ${W} 120`} className="w-full rounded-xl bg-white ring-1 ring-black/10" role="img" aria-label={`Number line: ${sorted.map((x) => x.s).join(' < ')}`}>
        <line x1={20} x2={W - 20} y1={70} y2={70} stroke="#171f44" strokeWidth={2} />
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => <g key={n}><line x1={X(n)} x2={X(n)} y1={62} y2={78} stroke="#171f44" strokeWidth={n === 0 ? 3 : 1.5} /><text x={X(n)} y={98} textAnchor="middle" fontSize={14} fill="#171f44" fontFamily="ui-monospace,monospace">{n}</text></g>)}
        {sorted.map((x, i) => <motion.g key={x.s + i} initial={false} animate={{ x: X(x.v) }} transition={spring.smooth}><circle cx={0} cy={70} r={7} fill={BRANCH[i % BRANCH.length]} /><text x={0} y={i % 2 ? 46 : 32} textAnchor="middle" fontSize={13} fontWeight={700} fill={BRANCH[i % BRANCH.length]} fontFamily="ui-monospace,monospace">{x.s}</text></motion.g>)}
      </svg>
      <p className="font-mono text-sm text-zinc-900 dark:text-white" role="status">{sorted.map((x) => x.s).join('  <  ')}</p>
    </div>
  );
}

/** Venn diagram: two or three groups; items in each go where they belong. */
function Venn() {
  const [v, setV] = useKept('uv-venn', () => ({ names: ['Cats', 'Dogs', 'Birds'], three: false, items: [{ id: uid(), text: 'Have fur', in: [true, true, false] }, { id: uid(), text: 'Can fly', in: [false, false, true] }, { id: uid(), text: 'Pets', in: [true, true, true] }] }));
  const n = v.three ? 3 : 2, C = v.three ? [[150, 120], [250, 120], [200, 205]] : [[160, 140], [260, 140]], R = 95;
  const fill = ['#ec74ce', '#533ff6', '#0d9488'];
  const pos = (inn: boolean[]) => { const on = inn.slice(0, n).map((x, i) => (x ? i : -1)).filter((i) => i >= 0); if (!on.length) return [400 - 30, 30]; const cx = on.reduce((a, i) => a + C[i][0], 0) / on.length, cy = on.reduce((a, i) => a + C[i][1], 0) / on.length; if (on.length === 1) { const o = C.reduce((a, c) => [a[0] + c[0] / n, a[1] + c[1] / n], [0, 0]); return [cx + (cx - o[0]) * 0.6, cy + (cy - o[1]) * 0.6]; } return [cx, cy]; };
  const groups = new Map<string, string[]>(); v.items.forEach((it) => { const k = it.in.slice(0, n).join(); groups.set(k, [...(groups.get(k) ?? []), it.text]); });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <svg id="venn-sheet" viewBox="0 0 410 320" className="w-full rounded-xl bg-white ring-1 ring-black/10" role="img" aria-label="Venn diagram" fontFamily="system-ui">
        {C.slice(0, n).map((c, i) => <g key={i}><circle cx={c[0]} cy={c[1]} r={R} fill={`${fill[i]}22`} stroke={fill[i]} strokeWidth={2} /><text x={c[0] + (i === 2 ? 0 : i ? 40 : -40)} y={i === 2 ? c[1] + R + 16 : c[1] - R - 6} textAnchor="middle" fontWeight={700} fontSize={15} fill={fill[i]}>{v.names[i]}</text></g>)}
        {[...groups].map(([k, texts]) => { const [x, y] = pos(k.split(',').map((b) => b === 'true')); return <text key={k} x={x} y={y - (texts.length - 1) * 8} textAnchor="middle" fontSize={12} fill="#141320">{texts.map((t, j) => <tspan key={j} x={x} dy={j ? 16 : 0}>{t.slice(0, 18)}</tspan>)}</text>; })}
      </svg>
      <div className="space-y-2">
        <div className="flex gap-2"><Btn on={!v.three} onClick={() => setV({ ...v, three: false })}>2 groups</Btn><Btn on={v.three} onClick={() => setV({ ...v, three: true })}>3 groups</Btn><Btn onClick={() => printOnly('venn-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div>
        {v.names.slice(0, n).map((nm, i) => <input key={i} className="input py-1.5 font-bold" aria-label={`Group ${i + 1}`} value={nm} onChange={(e) => setV({ ...v, names: v.names.map((x, j) => (j === i ? e.target.value : x)) })} style={{ borderInlineStart: `6px solid ${fill[i]}` }} />)}
        <ul className="space-y-1.5">{v.items.map((it) => (
          <li key={it.id} className="flex items-center gap-1.5"><input className="input py-1 text-sm flex-1" aria-label="Item" value={it.text} onChange={(e) => setV({ ...v, items: v.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })} />
            {Array.from({ length: n }, (_, i) => <button key={i} type="button" onClick={() => setV({ ...v, items: v.items.map((x) => (x.id === it.id ? { ...x, in: x.in.map((b, j) => (j === i ? !b : b)) } : x)) })} aria-pressed={it.in[i]} aria-label={`${it.text} in ${v.names[i]}`} className="w-7 h-7 rounded-full ring-2 text-xs font-bold" style={{ background: it.in[i] ? fill[i] : 'transparent', color: it.in[i] ? '#fff' : fill[i], borderColor: fill[i], boxShadow: `inset 0 0 0 2px ${fill[i]}` }}>{v.names[i]?.[0]}</button>)}
            <button type="button" onClick={() => setV({ ...v, items: v.items.filter((x) => x.id !== it.id) })} aria-label={`Remove ${it.text}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></li>
        ))}</ul>
        <Btn onClick={() => setV({ ...v, items: [...v.items, { id: uid(), text: 'New item', in: [true, false, false] }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Item</Btn>
      </div>
    </div>
  );
}

interface Ev { id: string; year: number; what: string }
/** History timeline: events by year on a line, spaced by time; print it. */
function History() {
  const [evs, setEvs] = useKept<Ev[]>('uv-history', () => [{ id: uid(), year: 1440, what: 'Printing press' }, { id: uid(), year: 1687, what: 'Newton’s laws' }, { id: uid(), year: 1903, what: 'First powered flight' }, { id: uid(), year: 1969, what: 'Moon landing' }, { id: uid(), year: 1991, what: 'The web goes public' }]);
  const [y, setY] = useState(''), [w, setW] = useState('');
  const s = [...evs].sort((a, b) => a.year - b.year), lo = s[0]?.year ?? 0, hi = s[s.length - 1]?.year ?? 1, W = 900, xAt = (yr: number) => 40 + ((yr - lo) / (hi - lo || 1)) * (W - 80);
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); const yr = parseInt(y, 10); if (Number.isFinite(yr) && w.trim()) { setEvs([...evs, { id: uid(), year: yr, what: w.trim() }]); setY(''); setW(''); } }} className="flex flex-wrap items-end gap-2"><Field label="Year (BC as minus)"><input className="input w-28 font-mono" inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} /></Field><Field label="What happened"><input className="input" value={w} onChange={(e) => setW(e.target.value)} /></Field><button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button><Btn onClick={() => printOnly('history-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></form>
      <div tabIndex={0} role="region" aria-label="Timeline" className="relative overflow-x-auto rounded-xl bg-white ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-pink-500">
        <svg id="history-sheet" viewBox={`0 0 ${W} 240`} width={W} height={240} fontFamily="system-ui" role="img" aria-label={s.map((e) => `${e.year}: ${e.what}`).join('; ')}>
          <line x1={30} x2={W - 30} y1={120} y2={120} stroke="#171f44" strokeWidth={3} strokeLinecap="round" />
          {s.map((e, i) => { const up = i % 2 === 0, x = xAt(e.year); return <g key={e.id}><line x1={x} x2={x} y1={120} y2={up ? 70 : 170} stroke={BRANCH[i % BRANCH.length]} strokeWidth={2} /><circle cx={x} cy={120} r={6} fill={BRANCH[i % BRANCH.length]} /><text x={x} y={up ? 52 : 196} textAnchor="middle" fontSize={15} fontWeight={800} fill="#141320">{e.year < 0 ? `${-e.year} BC` : e.year}</text><text x={x} y={up ? 68 : 212} textAnchor="middle" fontSize={12} fill="#3f4459">{e.what.slice(0, 26)}</text></g>; })}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-1.5">{s.map((e) => <li key={e.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] ps-3 pe-1 py-0.5 text-sm text-zinc-900 dark:text-white"><span className="font-mono">{e.year}</span> {e.what}<button type="button" onClick={() => setEvs(evs.filter((x) => x.id !== e.id))} aria-label={`Remove ${e.what}`} className="p-1"><X className="w-3.5 h-3.5" aria-hidden /></button></li>)}</ul>
    </div>
  );
}

/** Probability: roll dice or flip coins thousands of times; compare with the theory. */
function Probability() {
  const [kind, setKind] = useState<'coin' | 'die' | 'two'>('two'), [n, setN] = useState(1000), [counts, setCounts] = useState<number[]>([]);
  const outcomes = kind === 'coin' ? ['Heads', 'Tails'] : kind === 'die' ? ['1', '2', '3', '4', '5', '6'] : Array.from({ length: 11 }, (_, i) => String(i + 2));
  const theory = (i: number) => (kind === 'coin' ? 1 / 2 : kind === 'die' ? 1 / 6 : (6 - Math.abs(i + 2 - 7)) / 36);
  const run = () => { const c = new Array<number>(outcomes.length).fill(0), r = new Uint32Array(n * 2); crypto.getRandomValues(r); for (let k = 0; k < n; k++) { if (kind === 'coin') c[r[k] % 2]++; else if (kind === 'die') c[r[k] % 6]++; else c[(r[k] % 6) + (r[k + n] % 6)]++; } setCounts(c); };
  const total = counts.reduce((a, b) => a + b, 0), top = Math.max(...outcomes.map((_, i) => Math.max(theory(i), total ? (counts[i] ?? 0) / total : 0)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Segments label="What" value={kind} onChange={(k) => { setKind(k); setCounts([]); }} options={[['coin', 'A coin'], ['die', 'A die'], ['two', 'Two dice (sum)']] as const} />
        <select className="input w-auto!" aria-label="How many times" value={n} onChange={(e) => setN(+e.target.value)}>{[10, 100, 1000, 10000, 100000].map((x) => <option key={x} value={x}>{x.toLocaleString()} times</option>)}</select>
        <button type="button" onClick={run} className="btn-primary btn-sm"><Play className="w-4 h-4" aria-hidden />Run</button>
      </div>
      <div className="flex items-end gap-1 h-48 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-3" role="img" aria-label="Results against theory">
        {outcomes.map((o, i) => { const got = total ? (counts[i] ?? 0) / total : 0; return (
          <div key={o} className="flex-1 flex flex-col items-center gap-1 h-full justify-end relative">
            <span className="absolute w-full border-t-2 border-dashed border-pink-500" style={{ bottom: `calc(${(theory(i) / top) * 85}% + 20px)` }} aria-hidden />
            <motion.div className="w-full rounded-t-md bg-indigo-500 dark:bg-aqua-300/80" initial={false} animate={{ height: `${(got / top) * 85}%` }} transition={spring.smooth} />
            <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-200">{kind === 'coin' ? o[0] : o}</span>
          </div>
        ); })}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Bars: what happened. Pink dashes: what theory says. The more times you run it, the closer they get (the law of large numbers).</p>
    </div>
  );
}

/** Trigonometry: drag the angle round the unit circle; see sin, cos and tan. */
function Trig() {
  const [a, setA] = useState(35);
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), P = [110 + 90 * c, 110 - 90 * s];
  return (
    <div className="grid gap-4 sm:grid-cols-[240px_1fr] items-start">
      <svg viewBox="0 0 220 220" className="w-full max-w-[240px] rounded-xl bg-white ring-1 ring-black/10 touch-none" role="img" aria-label={`Unit circle at ${a} degrees`}
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={(e) => { if (!e.buttons) return; const b = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * 220 - 110, y = 110 - ((e.clientY - b.top) / b.height) * 220; setA(Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)); }}>
        <line x1="10" x2="210" y1="110" y2="110" stroke="#c7cad6" /><line y1="10" y2="210" x1="110" x2="110" stroke="#c7cad6" />
        <circle cx="110" cy="110" r="90" fill="none" stroke="#171f44" strokeWidth="2" />
        <line x1="110" y1="110" x2={P[0]} y2={P[1]} stroke="#171f44" strokeWidth="2.5" />
        <line x1={P[0]} y1="110" x2={P[0]} y2={P[1]} stroke="#ec4899" strokeWidth="3" /><line x1="110" y1="110" x2={P[0]} y2="110" stroke="#533ff6" strokeWidth="3" />
        <circle cx={P[0]} cy={P[1]} r="7" fill="#ec4899" />
      </svg>
      <div className="space-y-3">
        <Field label={`Angle: ${a}°`}><input type="range" min={0} max={359} value={a} onChange={(e) => setA(+e.target.value)} className="w-full accent-pink-500" /></Field>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><Stat big k="sin (pink)" v={nf(s, 4)} /><Stat big k="cos (violet)" v={nf(c, 4)} /><Stat big k="tan" v={Math.abs(c) < 1e-9 ? '∞' : nf(s / c, 4)} /><Stat big k="Radians" v={nf(r, 4)} /></dl>
        <div className="flex flex-wrap gap-1.5">{[0, 30, 45, 60, 90, 120, 180, 270].map((x) => <Btn key={x} on={a === x} onClick={() => setA(x)}>{x}°</Btn>)}</div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Drag the dot round the circle. sin is the height, cos the distance across.</p>
      </div>
    </div>
  );
}

/** Triangle solver: three of the sides and angles give the rest, the area and a drawing. */
function Triangle() {
  const [v, setV] = useState<Record<string, string>>({ a: '3', b: '4', c: '5', A: '', B: '', C: '' });
  let r: ReturnType<typeof solveTriangle> | null = null, err = '';
  try { const k = Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim() && +x > 0).map(([key, x]) => [key, +x])); r = solveTriangle(k); } catch (e) { err = (e as Error).message; }
  const pts = r ? (() => { const s = 200 / Math.max(r.a, r.b, r.c), Bx = r.c * s, Cx = r.b * Math.cos((r.A * Math.PI) / 180) * s, Cy = r.b * Math.sin((r.A * Math.PI) / 180) * s; return [[20, 190], [20 + Bx, 190], [20 + Cx, 190 - Cy]]; })() : null;
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">{['a', 'b', 'c'].map((k) => <Field key={k} label={`Side ${k}`}><input className="input font-mono" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}{['A', 'B', 'C'].map((k) => <Field key={k} label={`Angle ${k} (°)`}><input className="input font-mono" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</div>
        <Btn onClick={() => setV({ a: '', b: '', c: '', A: '', B: '', C: '' })}>Clear</Btn>
        {err ? <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{err}</p> : r && <dl className="grid grid-cols-3 gap-2 text-sm">{[['a', r.a], ['b', r.b], ['c', r.c], ['A', r.A], ['B', r.B], ['C', r.C], ['Area', r.area], ['Perimeter', r.perimeter]].map(([k, x]) => <Stat key={k as string} k={k as string} v={`${nf(x as number, 3)}${/^[ABC]$/.test(k as string) ? '°' : ''}`} />)}</dl>}
      </div>
      {pts && <svg viewBox="0 0 240 210" className="w-full rounded-xl bg-white ring-1 ring-black/10" role="img" aria-label="The triangle"><polygon points={pts.map((p) => p.join(',')).join(' ')} fill="#ec74ce33" stroke="#ec4899" strokeWidth={2.5} />{(['A', 'B', 'C'] as const).map((k, i) => <text key={k} x={pts[i][0] + (i === 1 ? 6 : i === 0 ? -14 : 0)} y={pts[i][1] + (i === 2 ? -8 : 16)} fontSize={14} fontWeight={700} fill="#171f44" fontFamily="system-ui">{k}</text>)}</svg>}
    </div>
  );
}

const parseM = (t: string): Matrix => t.trim().split('\n').map((r) => r.trim().split(/[\s,]+/).map(Number));
const showM = (m: Matrix) => m.map((r) => r.map((v) => nf(Math.abs(v) < 1e-12 ? 0 : v, 4)).join('\t')).join('\n');
/** Matrices: add, multiply, determinant, inverse and transpose. */
function Matrices() {
  const [a, setA] = useKept('uv-matrix-a', '1 2\n3 4'), [b, setB] = useKept('uv-matrix-b', '5 6\n7 8');
  const [out, setOut] = useState(''), [err, setErr] = useState('');
  const go = (f: () => string) => { try { const A = parseM(a), B = parseM(b); if ([A, B].some((m) => m.some((r) => r.length !== m[0].length || r.some((v) => !Number.isFinite(v))))) throw new Error('Each row needs the same number of numbers.'); setOut(f()); setErr(''); } catch (e) { setErr((e as Error).message); setOut(''); } };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Matrix A (rows on lines)"><textarea className="input min-h-[110px] font-mono" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Matrix B"><textarea className="input min-h-[110px] font-mono" value={b} onChange={(e) => setB(e.target.value)} /></Field></div>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => go(() => { const A = parseM(a), B = parseM(b); if (A.length !== B.length || A[0].length !== B[0].length) throw new Error('A and B must be the same size.'); return showM(A.map((r, i) => r.map((v, j) => v + B[i][j]))); })}>A + B</Btn>
        <Btn onClick={() => go(() => showM(matMul(parseM(a), parseM(b))))}>A × B</Btn>
        <Btn onClick={() => go(() => `det A = ${nf(det(parseM(a)), 6)}`)}>det A</Btn>
        <Btn onClick={() => go(() => showM(inverse(parseM(a))))}>A⁻¹</Btn>
        <Btn onClick={() => go(() => { const A = parseM(a); return showM(A[0].map((_, j) => A.map((r) => r[j]))); })}>Aᵀ</Btn>
      </div>
      {err ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : out && <pre className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] p-4 font-mono text-lg text-zinc-900 dark:text-white" role="status">{out}</pre>}
    </div>
  );
}

/** Molar mass: a formula's mass in g/mol and how much of it each element makes up. */
function Molar() {
  const [f, setF] = useKept('uv-molar', 'CuSO4·5H2O');
  const r = useMemo(() => { try { return molarMass(f); } catch (e) { return { err: (e as Error).message }; } }, [f]);
  return (
    <div className="space-y-3">
      <Field label="Chemical formula (brackets and ·5H2O are fine)"><input className="input font-mono text-lg" value={f} onChange={(e) => setF(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-1.5">{['H2O', 'CO2', 'NaCl', 'C6H12O6', 'Ca(OH)2', 'H2SO4', 'CaCO3'].map((x) => <Btn key={x} on={f === x} onClick={() => setF(x)}>{x}</Btn>)}</div>
      {'err' in r ? <p role="status" className="text-sm text-rose-700 dark:text-rose-300">{r.err}</p> : (
        <>
          <p className="text-3xl font-bold text-zinc-900 dark:text-white" role="status"><span className="font-mono">{nf(r.total, 3)}</span> g/mol</p>
          <ul className="space-y-1.5">{r.parts.map(([el, n, m], i) => (
            <li key={el} className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-sm"><span className="font-mono font-bold text-zinc-900 dark:text-white">{el}<sub>{n > 1 ? n : ''}</sub></span><span className="h-3 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full rounded-full" style={{ background: BRANCH[i % BRANCH.length] }} initial={{ width: 0 }} animate={{ width: `${(m / r.total) * 100}%` }} transition={spring.smooth} /></span><span className="font-mono tabular-nums text-zinc-900 dark:text-white">{nf(m, 3)} · {nf((m / r.total) * 100, 1)}%</span></li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

const FORMULAS: Record<string, { vars: [string, string][]; solve: (k: string, v: Record<string, number>) => number; text: string }> = {
  'Speed = distance ÷ time': { vars: [['v', 'speed (m/s)'], ['d', 'distance (m)'], ['t', 'time (s)']], text: 'v = d / t', solve: (k, x) => (k === 'v' ? x.d / x.t : k === 'd' ? x.v * x.t : x.d / x.v) },
  'Force = mass × acceleration': { vars: [['F', 'force (N)'], ['m', 'mass (kg)'], ['a', 'acceleration (m/s²)']], text: 'F = m × a', solve: (k, x) => (k === 'F' ? x.m * x.a : k === 'm' ? x.F / x.a : x.F / x.m) },
  'Ohm’s law': { vars: [['V', 'voltage (V)'], ['I', 'current (A)'], ['R', 'resistance (Ω)']], text: 'V = I × R', solve: (k, x) => (k === 'V' ? x.I * x.R : k === 'I' ? x.V / x.R : x.V / x.I) },
  'Power = energy ÷ time': { vars: [['P', 'power (W)'], ['E', 'energy (J)'], ['t', 'time (s)']], text: 'P = E / t', solve: (k, x) => (k === 'P' ? x.E / x.t : k === 'E' ? x.P * x.t : x.E / x.P) },
  'Density = mass ÷ volume': { vars: [['ρ', 'density (kg/m³)'], ['m', 'mass (kg)'], ['V', 'volume (m³)']], text: 'ρ = m / V', solve: (k, x) => (k === 'ρ' ? x.m / x.V : k === 'm' ? x['ρ'] * x.V : x.m / x['ρ']) },
  'Kinetic energy': { vars: [['E', 'energy (J)'], ['m', 'mass (kg)'], ['v', 'speed (m/s)']], text: 'E = ½ m v²', solve: (k, x) => (k === 'E' ? 0.5 * x.m * x.v ** 2 : k === 'm' ? (2 * x.E) / x.v ** 2 : Math.sqrt((2 * x.E) / x.m)) },
  'Weight = mass × g': { vars: [['W', 'weight (N)'], ['m', 'mass (kg)'], ['g', 'gravity (N/kg)']], text: 'W = m × g', solve: (k, x) => (k === 'W' ? x.m * x.g : k === 'm' ? x.W / x.g : x.W / x.m) },
  'Pressure = force ÷ area': { vars: [['p', 'pressure (Pa)'], ['F', 'force (N)'], ['A', 'area (m²)']], text: 'p = F / A', solve: (k, x) => (k === 'p' ? x.F / x.A : k === 'F' ? x.p * x.A : x.F / x.p) },
};
/** Physics formulas: pick one, fill two, get the third with the working. */
function Physics() {
  const [f, setF] = useState(Object.keys(FORMULAS)[0]), [vals, setVals] = useState<Record<string, string>>({ d: '100', t: '9.58', g: '9.81' }), [find, setFind] = useState('v');
  const F = FORMULAS[f], known = Object.fromEntries(F.vars.filter(([k]) => k !== find).map(([k]) => [k, Number(vals[k])]));
  const ok = Object.values(known).every((x) => Number.isFinite(x) && x !== 0), ans = ok ? F.solve(find, known) : NaN;
  return (
    <div className="space-y-3">
      <Field label="Formula"><select className="input" value={f} onChange={(e) => { setF(e.target.value); setFind(FORMULAS[e.target.value].vars[0][0]); }}>{Object.keys(FORMULAS).map((k) => <option key={k}>{k}</option>)}</select></Field>
      <p className="font-mono text-xl font-bold text-zinc-900 dark:text-white">{F.text}</p>
      <div className="grid gap-2 sm:grid-cols-3">{F.vars.map(([k, l]) => (
        <div key={k} className={cn('rounded-xl p-2 ring-1', k === find ? 'ring-pink-500 bg-pink-500/10' : 'ring-zinc-200 dark:ring-white/10')}>
          <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-200"><input type="radio" name="find" checked={k === find} onChange={() => setFind(k)} className="accent-pink-500" />Find {k} · {l}</label>
          {k === find ? <p className="mt-1 font-mono text-xl font-bold text-zinc-900 dark:text-white" role="status">{Number.isFinite(ans) ? nf(ans, 4) : '—'}</p> : <input className="input mt-1 font-mono" inputMode="decimal" aria-label={l} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
        </div>
      ))}</div>
    </div>
  );
}
