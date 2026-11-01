'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Hand, Minus, Pencil, Play, Plus, Printer, RotateCcw, Shuffle, SkipForward, Trash2 } from 'lucide-react';
import { bingoCard } from '@/lib/tools-5';
import { celebrate } from '@/lib/celebrate';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Btn, Field } from './QuickTools';
import { printOnly, useKept } from './kept';
import { BRANCH, FullBtn, inkOn, rnd, useFull } from './bits';

// Collaborate → Create → Present, fifth set (M75): bingo (cards and a caller), a quiz game board for
// teams, name tags to print, and a speaking queue for discussions.

export type StageId = 'bingo' | 'gameboard' | 'nametags' | 'queue';

export function StageTool({ id }: { id: StageId }) {
  const T = { bingo: Bingo, gameboard: GameBoard, nametags: NameTags, queue: Queue }[id];
  return <T />;
}

const LETTERS = 'BINGO';
/** Bingo: print cards for everyone, then call numbers here (big, with the ones already called). */
function Bingo() {
  const [called, setCalled] = useKept<number[]>('uv-bingo-called', []), [cards, setCards] = useState(4), [seed, setSeed] = useState(1);
  const { ref: fullRef, full: isFull, toggle, boxClass } = useFull<HTMLDivElement>();
  const last = called[called.length - 1];
  const call = () => { const left = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !called.includes(n)); if (left.length) setCalled([...called, left[rnd(left.length)]]); };
  const sheet = Array.from({ length: cards }, (_, k) => { let s = seed * 997 + k * 131; return bingoCard(() => ((s = (s * 16807) % 2147483647) / 2147483647)); });
  return (
    <div className="space-y-4">
      <div ref={fullRef} className={cn('space-y-3 text-center', boxClass)}>
        <AnimatePresence mode="popLayout"><motion.p key={last ?? 0} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.bouncy} className="font-bold text-zinc-900 dark:text-white" style={{ fontSize: isFull ? 'min(24vw, 260px)' : 96 }} role="status">{last ? `${LETTERS[Math.floor((last - 1) / 15)]} ${last}` : '—'}</motion.p></AnimatePresence>
        <div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={call} disabled={called.length >= 75} className="btn-primary"><Play className="w-4 h-4" aria-hidden />Call a number</button><Btn onClick={() => { if (window.confirm('Start a new game?')) setCalled([]); }}><RotateCcw className="w-3.5 h-3.5" aria-hidden />New game</Btn><FullBtn full={isFull} onClick={() => void toggle()} /></div>
        <div className="mx-auto grid max-w-3xl gap-1" style={{ gridTemplateColumns: 'auto repeat(15, minmax(0, 1fr))' }} aria-label={`${called.length} numbers called`}>
          {Array.from({ length: 5 }, (_, r) => [<span key={`l${r}`} className="pe-1 font-bold text-pink-600 dark:text-pink-300">{LETTERS[r]}</span>, ...Array.from({ length: 15 }, (_, c) => { const n = r * 15 + c + 1, on = called.includes(n); return <span key={n} className={cn('rounded-md py-0.5 text-xs font-mono tabular-nums transition-colors duration-300', n === last ? 'bg-pink-500 text-[#171f44] font-bold' : on ? 'bg-indigo-600 text-white dark:bg-aqua-300 dark:text-[#171f44]' : 'bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400')}>{n}</span>; })])}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2"><Field label="Cards to print"><input type="number" min={1} max={40} className="input w-24" value={cards} onChange={(e) => setCards(Math.max(1, Math.min(40, +e.target.value || 1)))} /></Field><Btn onClick={() => setSeed(seed + 1)}><Shuffle className="w-3.5 h-3.5" aria-hidden />New cards</Btn><Btn onClick={() => printOnly('bingo-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print the cards</Btn></div>
      <div id="bingo-sheet" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sheet.map((card, k) => (
          <table key={k} className="w-full bg-white text-zinc-900 text-center border-collapse ring-1 ring-black/20 break-inside-avoid">
            <thead><tr>{[...LETTERS].map((l) => <th key={l} className="bg-[#171f44] text-white py-1 font-bold">{l}</th>)}</tr></thead>
            <tbody>{card.map((row, r) => <tr key={r}>{row.map((v, c) => <td key={c} className={cn('border border-zinc-300 h-9 font-mono font-bold', v === null && 'bg-pink-200 text-xs font-sans')}>{v ?? 'FREE'}</td>)}</tr>)}</tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

interface Clue { q: string; a: string; used?: boolean }
const blankBoard = () => ({ cats: ['Science', 'History', 'Maths', 'Words'], clues: Array.from({ length: 4 }, () => Array.from({ length: 4 }, (): Clue => ({ q: '', a: '' }))), teams: [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }] });
/** Quiz game board: categories and points; pick a square, reveal the answer, give the points. */
function GameBoard() {
  const [b, setB] = useKept('uv-gameboard', blankBoard);
  const [edit, setEdit] = useState(false), [open, setOpen] = useState<[number, number] | null>(null), [show, setShow] = useState(false);
  const { ref: fullRef, full: isFull, toggle, boxClass } = useFull<HTMLDivElement>();
  const pts = (r: number) => (r + 1) * 100, cur = open ? b.clues[open[0]][open[1]] : null;
  const setClue = (c: number, r: number, p: Partial<Clue>) => setB({ ...b, clues: b.clues.map((col, ci) => (ci === c ? col.map((x, ri) => (ri === r ? { ...x, ...p } : x)) : col)) });
  const award = (t: number) => { if (!open) return; setB({ ...b, teams: b.teams.map((x, i) => (i === t ? { ...x, score: x.score + pts(open[1]) } : x)), clues: b.clues.map((col, ci) => (ci === open[0] ? col.map((x, ri) => (ri === open[1] ? { ...x, used: true } : x)) : col)) }); setOpen(null); setShow(false); };
  const close = () => { if (open) setClue(open[0], open[1], { used: true }); setOpen(null); setShow(false); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><Btn on={edit} onClick={() => setEdit(!edit)}><Pencil className="w-3.5 h-3.5" aria-hidden />{edit ? 'Done writing' : 'Write the questions'}</Btn><Btn onClick={() => setB({ ...b, clues: b.clues.map((col) => col.map((x) => ({ ...x, used: false }))), teams: b.teams.map((t) => ({ ...t, score: 0 })) })}><RotateCcw className="w-3.5 h-3.5" aria-hidden />New game</Btn><Btn onClick={() => setB({ ...b, teams: [...b.teams, { name: `Team ${String.fromCharCode(65 + b.teams.length)}`, score: 0 }] })}><Plus className="w-3.5 h-3.5" aria-hidden />Team</Btn><FullBtn full={isFull} onClick={() => void toggle()} /></div>
      {edit ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{b.cats.map((cat, c) => (
          <fieldset key={c} className="space-y-1.5 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-2">
            <input className="input py-1.5 font-bold" aria-label={`Category ${c + 1}`} value={cat} onChange={(e) => setB({ ...b, cats: b.cats.map((x, i) => (i === c ? e.target.value : x)) })} />
            {b.clues[c].map((x, r) => <div key={r} className="space-y-1"><span className="text-xs font-mono text-zinc-600 dark:text-zinc-300">{pts(r)}</span><input className="input py-1 text-sm" aria-label={`${cat} ${pts(r)} question`} placeholder="Question" value={x.q} onChange={(e) => setClue(c, r, { q: e.target.value })} /><input className="input py-1 text-sm" aria-label={`${cat} ${pts(r)} answer`} placeholder="Answer" value={x.a} onChange={(e) => setClue(c, r, { a: e.target.value })} /></div>)}
          </fieldset>
        ))}</div>
      ) : (
        <div ref={fullRef} className={cn('space-y-3', boxClass)}>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${b.cats.length}, minmax(0, 1fr))` }}>
            {b.cats.map((c, ci) => <div key={ci} className="rounded-xl bg-[#171f44] p-2 text-center text-sm font-bold text-white">{c}</div>)}
            {[0, 1, 2, 3].map((r) => b.cats.map((_, c) => { const x = b.clues[c][r]; return <button key={`${c}-${r}`} type="button" disabled={x.used || !x.q} onClick={() => { setOpen([c, r]); setShow(false); }} className={cn('rounded-xl py-4 font-mono text-2xl font-bold transition-[transform,opacity] active:scale-95', x.used ? 'bg-zinc-200 text-zinc-400 dark:bg-white/5 dark:text-zinc-600' : x.q ? 'bg-indigo-600 text-amber-300 hover:scale-[1.03]' : 'bg-zinc-100 text-zinc-400 dark:bg-white/5')}>{x.used ? '' : pts(r)}</button>; }))}
          </div>
          <AnimatePresence>{cur && open && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }} transition={spring.smooth} className="rounded-3xl bg-indigo-700 p-6 text-center text-white space-y-3" role="dialog" aria-label="Question">
              <p className="text-sm opacity-90">{b.cats[open[0]]} · {pts(open[1])}</p>
              <p className="text-2xl sm:text-3xl font-bold" translate="no">{cur.q}</p>
              {show ? <p className="text-xl text-amber-300 font-semibold" translate="no">{cur.a || '(no answer written)'}</p> : <button type="button" onClick={() => setShow(true)} className="btn-primary">Show the answer</button>}
              <div className="flex flex-wrap justify-center gap-2">{b.teams.map((t, i) => <button key={i} type="button" onClick={() => award(i)} className="rounded-full bg-white/20 px-3 py-1.5 font-semibold hover:bg-white/30">+{pts(open[1])} {t.name}</button>)}<button type="button" onClick={close} className="rounded-full bg-black/20 px-3 py-1.5">No one</button></div>
            </motion.div>
          )}</AnimatePresence>
          <ul className="flex flex-wrap justify-center gap-2">{b.teams.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-2xl px-4 py-2" style={{ background: BRANCH[i % BRANCH.length], color: inkOn(BRANCH[i % BRANCH.length]) }}>
              <input className="w-28 bg-transparent font-bold outline-none" aria-label="Team name" value={t.name} onChange={(e) => setB({ ...b, teams: b.teams.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
              <motion.span key={t.score} initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={spring.bouncy} className="font-mono text-2xl font-bold">{t.score}</motion.span>
              <button type="button" onClick={() => setB({ ...b, teams: b.teams.map((x, k) => (k === i ? { ...x, score: x.score - 100 } : x)) })} aria-label={`Take 100 from ${t.name}`} className="rounded-full bg-black/20 p-1"><Minus className="w-3.5 h-3.5" aria-hidden /></button>
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

/** Name tags: a list of names into printable tags (sizes, colours, a line under the name). */
function NameTags() {
  const [v, setV] = useKept('uv-nametags', () => ({ names: 'Aisha Khan\nBen Okafor\nCarlos Silva\nDara Patel', sub: 'Science Club', colour: 0, big: false }));
  const names = v.names.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <Field label="Names, one a line"><textarea className="input min-h-[130px]" value={v.names} onChange={(e) => setV({ ...v, names: e.target.value })} /></Field>
        <div className="space-y-2"><Field label="Under the name"><input className="input" value={v.sub} onChange={(e) => setV({ ...v, sub: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-1.5">{BRANCH.slice(0, 6).map((c, i) => <button key={c} type="button" onClick={() => setV({ ...v, colour: i })} aria-label={`Colour ${i + 1}`} aria-pressed={v.colour === i} className={cn('w-7 h-7 rounded-full ring-2', v.colour === i ? 'ring-pink-500' : 'ring-transparent')} style={{ background: c }} />)}</div>
          <div className="flex gap-2"><Btn on={v.big} onClick={() => setV({ ...v, big: !v.big })}>Big tags</Btn><Btn onClick={() => printOnly('tags-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print</Btn></div></div>
      </div>
      <div id="tags-sheet" className={cn('grid gap-3', v.big ? 'sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
        {names.map((n, i) => (
          <div key={i} className="rounded-2xl bg-white overflow-hidden ring-1 ring-black/20 break-inside-avoid text-center">
            <div className="py-1.5 text-xs font-bold uppercase tracking-widest text-white" style={{ background: BRANCH[v.colour] }}>Hello, my name is</div>
            <p className={cn('px-3 pt-4 font-bold text-zinc-900', v.big ? 'text-4xl' : 'text-2xl')} translate="no">{n}</p>
            <p className="px-3 pb-4 pt-1 text-sm text-[#4b5068]">{v.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Speaking queue: hands up go in a line; each speaker gets a timer; next, and a count of turns. */
function Queue() {
  const [q, setQ] = useKept('uv-speak-queue', () => ({ people: ['Aisha', 'Ben', 'Chen', 'Dara'], line: [] as string[], turns: {} as Record<string, number>, secs: 60 }));
  const [now, setNow] = useState(0), [since, setSince] = useState(0), [name, setName] = useState('');
  const { ref: fullRef, full: isFull, toggle, boxClass } = useFull<HTMLDivElement>();
  useEffect(() => { if (!since) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [since]);
  const speaking = q.line[0], left = since ? q.secs - Math.floor((now - since) / 1000) : q.secs;
  const next = () => { const done = q.line[0]; const line = q.line.slice(1); setQ({ ...q, line, turns: done ? { ...q.turns, [done]: (q.turns[done] ?? 0) + 1 } : q.turns }); const n = line.length ? Date.now() : 0; setSince(n); setNow(n); if (!line.length && done) celebrate(); };
  return (
    <div ref={fullRef} className={cn('space-y-4', boxClass)}>
      <div className="rounded-3xl bg-zinc-100/70 dark:bg-white/[0.04] p-6 text-center space-y-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{speaking ? 'Speaking now' : 'No one in the queue'}</p>
        <p className={cn('font-bold text-zinc-900 dark:text-white', isFull ? 'text-6xl' : 'text-4xl')} translate="no">{speaking ?? '—'}</p>
        {speaking && <p className={cn('font-mono tabular-nums text-3xl font-bold', left < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-900 dark:text-white')} role="timer">{left < 0 ? '+' : ''}{Math.floor(Math.abs(left) / 60)}:{String(Math.abs(left) % 60).padStart(2, '0')}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => { if (!since && speaking) { const n = Date.now(); setSince(n); setNow(n); } else next(); }} disabled={!speaking} className="btn-primary">{since ? <SkipForward className="w-4 h-4" aria-hidden /> : <Play className="w-4 h-4" aria-hidden />}{since ? 'Next speaker' : 'Start'}</button>
          <select className="input w-auto!" aria-label="Time each" value={q.secs} onChange={(e) => setQ({ ...q, secs: +e.target.value })}>{[30, 60, 90, 120, 180].map((s) => <option key={s} value={s}>{s} s each</option>)}</select>
          <FullBtn full={isFull} onClick={() => void toggle()} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label="Hands up" className="space-y-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Tap a name when a hand goes up</h3>
          <div className="flex flex-wrap gap-1.5">{q.people.map((p) => { const inLine = q.line.includes(p); return <button key={p} type="button" disabled={inLine} onClick={() => setQ({ ...q, line: [...q.line, p] })} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-[transform,opacity] active:scale-95', inLine ? 'opacity-40 ring-zinc-300' : 'ring-pink-500 text-zinc-900 dark:text-white hover:bg-pink-500/10')} translate="no"><Hand className="w-3.5 h-3.5" aria-hidden />{p}{q.turns[p] ? <span className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">·{q.turns[p]}</span> : null}</button>; })}</div>
          {!isFull && <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && !q.people.includes(name.trim())) { setQ({ ...q, people: [...q.people, name.trim()] }); setName(''); } }} className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name" aria-label="Add a name" /><button type="submit" className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden /><span className="sr-only">Add the name</span></button></form>}
        </section>
        <section aria-label="The queue" className="space-y-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">The queue ({q.line.length})</h3>
          <ol className="space-y-1.5"><AnimatePresence initial={false}>{q.line.map((p, i) => <motion.li key={p} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, transition: { duration: 0.12 } }} transition={spring.smooth} className={cn('flex items-center gap-2 rounded-xl px-3 py-2', i === 0 ? 'bg-pink-500/15' : 'bg-zinc-100/70 dark:bg-white/[0.04]')}><span className="w-5 font-mono text-sm text-zinc-600 dark:text-zinc-300">{i + 1}</span><span className="flex-1 font-semibold text-zinc-900 dark:text-white" translate="no">{p}</span><button type="button" onClick={() => setQ({ ...q, line: q.line.filter((x) => x !== p) })} aria-label={`Take ${p} out of the queue`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button></motion.li>)}</AnimatePresence></ol>
        </section>
      </div>
    </div>
  );
}
