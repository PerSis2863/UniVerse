'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MousePointer2, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import { Circuit, parseSi, si, type Wave } from '@/lib/sim/circuit';
import { EXAMPLES, NAMES, netlist, newItem, readBoard, UNITS, type Board, type Item, type ItemKind, type Mark } from '@/lib/sim/schematic';
import { ui } from './bench-ui';

// Hyperion Simulate → Circuits (M410): a drawing board and an oscilloscope. Pick a part, drag from one dot to another
// to place it; wires join points; a ground (⏚) is the 0 V point; probes show their voltage on the oscilloscope. The
// circuit runs as you build it (modified nodal analysis, src/lib/sim/circuit.ts); wires are coloured by their voltage.

const KEEP = 'uv-sim-circuit';
const G = 26, COLS = 34, ROWS = 15, PAD = 18;
type Tool = 'select' | ItemKind | 'ground' | 'probe';
const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: 'select', label: 'Select', glyph: '' }, { id: 'wire', label: 'Wire', glyph: '—' }, { id: 'R', label: 'Resistor', glyph: 'R' }, { id: 'C', label: 'Capacitor', glyph: 'C' },
  { id: 'L', label: 'Coil', glyph: 'L' }, { id: 'V', label: 'Voltage source', glyph: 'V' }, { id: 'I', label: 'Current source', glyph: 'I' }, { id: 'D', label: 'Diode', glyph: 'D' }, { id: 'S', label: 'Switch (PWM)', glyph: 'S' },
  { id: 'ground', label: 'Ground', glyph: '⏚' }, { id: 'probe', label: 'Probe', glyph: 'P' },
];
const STEPS = [1e-6, 5e-6, 1e-5, 5e-5, 1e-4, 1e-3], WINDOWS = [2e-4, 5e-4, 1e-3, 3e-3, 0.01, 0.03, 0.06, 0.1, 0.3, 1];

/** A part's drawing along the x axis from 0 to len (its leads to the ends), turned into place by the caller. */
function Symbol({ it, len }: { it: Item; len: number }) {
  const m = len / 2, s = 'currentColor';
  const lead = (a: number, b: number) => <><line x1={0} y1={0} x2={a} y2={0} stroke={s} strokeWidth={1.6} /><line x1={b} y1={0} x2={len} y2={0} stroke={s} strokeWidth={1.6} /></>;
  if (it.kind === 'R') return <>{lead(m - 18, m + 18)}<polyline points={`${m - 18},0 ${m - 15},-6 ${m - 9},6 ${m - 3},-6 ${m + 3},6 ${m + 9},-6 ${m + 15},6 ${m + 18},0`} fill="none" stroke={s} strokeWidth={1.6} strokeLinejoin="round" /></>;
  if (it.kind === 'C') return <>{lead(m - 4, m + 4)}<line x1={m - 4} y1={-10} x2={m - 4} y2={10} stroke={s} strokeWidth={2.2} /><line x1={m + 4} y1={-10} x2={m + 4} y2={10} stroke={s} strokeWidth={2.2} /></>;
  if (it.kind === 'L') return <>{lead(m - 18, m + 18)}<path d={`M${m - 18},0 ${Array(4).fill('a4.5,5 0 0 1 9,0').join(' ')}`} fill="none" stroke={s} strokeWidth={1.6} /></>;
  if (it.kind === 'D') return <>{lead(m - 8, m + 8)}<polygon points={`${m - 8},-8 ${m - 8},8 ${m + 6},0`} fill={s} /><line x1={m + 7} y1={-8} x2={m + 7} y2={8} stroke={s} strokeWidth={2} /></>;
  // A switch (M424): two contacts and a blade, drawn open; its PWM drives it.
  if (it.kind === 'S') return <>{lead(m - 12, m + 12)}<circle cx={m - 12} cy={0} r={2.2} fill={s} /><circle cx={m + 12} cy={0} r={2.2} fill={s} /><line x1={m - 12} y1={0} x2={m + 10} y2={-10} stroke={s} strokeWidth={1.8} strokeLinecap="round" /></>;
  if (it.kind === 'V' || it.kind === 'I') {
    return (
      <>{lead(m - 12, m + 12)}<circle cx={m} cy={0} r={12} fill="none" stroke={s} strokeWidth={1.6} />
        {it.kind === 'I' ? <path d={`M${m + 6},0 L${m - 6},0 M${m - 2},-4 L${m - 6},0 L${m - 2},4`} fill="none" stroke={s} strokeWidth={1.6} />
          : it.wave === 'sine' ? <path d={`M${m - 7},0 q3.5,-8 7,0 t7,0`} fill="none" stroke={s} strokeWidth={1.6} />
            : it.wave === 'square' ? <path d={`M${m - 7},4 v-8 h7 v8 h7 v-8`} fill="none" stroke={s} strokeWidth={1.4} />
              : <><text x={m - 7} y={4} fontSize={11} fill={s} textAnchor="middle">+</text><text x={m + 7} y={4} fontSize={12} fill={s} textAnchor="middle">−</text></>}
      </>
    );
  }
  return <line x1={0} y1={0} x2={len} y2={0} stroke={s} strokeWidth={2} />;
}

/** The board's grid of dots: drawn once, the same element every frame. */
const DOTS = <path d={Array.from({ length: (COLS + 1) * (ROWS + 1) }, (_, k) => `M${PAD + (k % (COLS + 1)) * G - 1.3},${PAD + Math.floor(k / (COLS + 1)) * G}a1.3,1.3 0 1 0 2.6,0a1.3,1.3 0 1 0 -2.6,0`).join('')} className="fill-zinc-300 dark:fill-zinc-700" />;

export function CircuitBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [board, setBoardNow] = useState<Board>(() => { try { return readBoard(JSON.parse(localStorage.getItem(KEEP) ?? 'null')); } catch { return EXAMPLES[0].make(); } });
  const [tool, setTool] = useState<Tool>('select');
  const [chosen, setChosen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [running, setRunning] = useState(!still);
  // What the oscilloscope shows: a copy of the samples, taken each frame (the samples themselves live in a ref).
  const [shot, setShot] = useState<{ of: unknown; t: number[]; v: number[][] }>({ of: null, t: [], v: [] });
  const [valueText, setValueText] = useState<Record<string, string>>({});
  const svg = useRef<SVGSVGElement>(null), keepTimer = useRef(0);
  const setBoard = (f: (b: Board) => Board) => setBoardNow((b) => {
    const next = f(b);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });

  // The circuit (rebuilt when the board changes) and the oscilloscope's samples.
  const net = useMemo(() => netlist(board), [board]);
  const built = useMemo(() => {
    // Switched on at t = 0 from rest (everything at 0 V), so a capacitor is seen charging.
    try { return { c: new Circuit(net.parts), error: null as string | null }; }
    catch (e) { return { c: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [net]);
  const scope = useRef<{ t: number[]; v: number[][] }>({ t: [], v: [] });
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { scope.current = { t: [], v: net.probes.map(() => []) }; }, [net, board.dt, board.window]);
  useEffect(() => {
    const c = built.c;
    if (!c || !running) return;
    let raf = 0;
    const perWindow = board.window / board.dt, perFrame = Math.max(1, Math.min(4000, Math.round(perWindow / 120))), every = Math.max(1, Math.round(perWindow / 600));
    let count = 0, drawn = 0;
    const tick = () => {
      try {
        // At most ~6 ms of stepping a frame, so the page keeps 60 frames a second however heavy the circuit
        // (a switching converter's diode can need many Newton steps); the simulation then runs a little slower.
        const until = performance.now() + 6;
        for (let k = 0; k < perFrame && (k % 8 || performance.now() < until); k++) {
          c.step(board.dt);
          if (++count % every === 0) {
            const s = scope.current;
            s.t.push(c.t); net.probes.forEach((p, i) => { (s.v[i] ??= []).push(c.v(p.node)); });
            while (s.t.length && s.t[0] < c.t - board.window) { s.t.shift(); s.v.forEach((a) => a.shift()); }
          }
        }
      } catch (e) { setFailed(e instanceof Error ? e.message : String(e)); setRunning(false); return; }
      const sc = scope.current;
      // The picture is redrawn about 30 times a second (the stepping goes on every frame): half the drawing work.
      const now = performance.now();
      if (now - drawn >= 30) { drawn = now; setShot({ of: c, t: [...sc.t], v: sc.v.map((a) => [...a]) }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [built, running, board.dt, board.window, net]);

  const c = built.c, error = built.error ?? failed;
  const nodeV = (x: number, y: number) => (c ? c.v(net.node(x, y)) : 0);
  const vmax = Math.max(1e-9, ...(c ? c.nodes.map((n) => Math.abs(c.v(n))) : [1]));
  const volt = (v: number) => {
    const t = Math.min(1, Math.abs(v) / vmax), grey = dark ? [113, 113, 122] : [161, 161, 170], to = v >= 0 ? [22, 163, 74] : [220, 38, 38];
    return `rgb(${grey.map((g, i) => Math.round(g + (to[i] - g) * t)).join(',')})`;
  };

  const toGrid = (e: { clientX: number; clientY: number }) => {
    const el = svg.current!, p = el.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: Math.max(0, Math.min(COLS, Math.round((q.x - PAD) / G))), y: Math.max(0, Math.min(ROWS, Math.round((q.y - PAD) / G))) };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'select') return;
    const g = toGrid(e);
    if (tool === 'ground' || tool === 'probe') {
      const mark: Mark = { id: `${tool}${Date.now().toString(36)}`, kind: tool, x: g.x, y: g.y };
      setBoard((b) => ({ ...b, marks: [...b.marks.filter((m) => !(m.kind === tool && m.x === g.x && m.y === g.y)), mark] }));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x1: g.x, y1: g.y, x2: g.x, y2: g.y });
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const g = toGrid(e);
    // Parts lie along a row or a column (wires may also go straight there).
    const across = Math.abs(g.x - drag.x1) >= Math.abs(g.y - drag.y1);
    setDrag({ ...drag, x2: across ? g.x : drag.x1, y2: across ? drag.y1 : g.y });
  };
  const up = () => {
    if (!drag || tool === 'select' || tool === 'ground' || tool === 'probe') { setDrag(null); return; }
    const { x1, y1, x2, y2 } = drag;
    setDrag(null);
    if (x1 === x2 && y1 === y2) return;
    const item = newItem(tool, x1, y1, x2, y2);
    setBoard((b) => ({ ...b, items: [...b.items, item] }));
    if (tool !== 'wire') setChosen(item.id);
  };
  const remove = (id: string) => { setBoard((b) => ({ ...b, items: b.items.filter((i) => i.id !== id), marks: b.marks.filter((m) => m.id !== id) })); setChosen(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && chosen) { e.preventDefault(); remove(chosen); }
      if (e.key === 'Escape') { setTool('select'); setDrag(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sel = board.items.find((i) => i.id === chosen) ?? null, selMark = board.marks.find((m) => m.id === chosen) ?? null;
  const setItem = (id: string, patch: Partial<Item>) => setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const part = sel && c ? net.parts.find((p) => p.id === sel.id) : undefined;
  const across = sel ? nodeV(sel.x1, sel.y1) - nodeV(sel.x2, sel.y2) : 0, through = part && c ? c.current(part) : 0;
  const describe = (it: Item) => (it.kind === 'S' ? `PWM ${si(it.freq, 'Hz')} · ${Math.round(it.value * 100)}%` : it.kind === 'V' ? (it.wave === 'dc' ? `${si(it.value, 'V')}` : `${si(it.value, 'V')} ${it.wave === 'sine' ? '~' : '⊓'} ${si(it.freq, 'Hz')}`) : it.kind === 'D' || it.kind === 'wire' ? '' : si(it.value, UNITS[it.kind]));
  const X = (gx: number) => PAD + gx * G, Y = (gy: number) => PAD + gy * G;

  // Oscilloscope.
  // Samples of an older circuit (before the last change) aren't shown.
  const s = shot.of === c ? shot : { t: [] as number[], v: [] as number[][] }, tNow = c?.t ?? 0, t0 = tNow - board.window;
  const vScope = Math.max(0.1, ...s.v.flat().map(Math.abs));
  const nice = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= v) ?? v; };
  const vTop = nice(vScope * 1.1), SW = 600, SH = 200;
  const traces = net.probes.map((p, i) => ({ p, pts: (s.v[i] ?? []).map((v, k) => `${(((s.t[k] - t0) / board.window) * SW).toFixed(1)},${(SH / 2 - (v / vTop) * (SH / 2 - 6)).toFixed(1)}`).join(' ') }));
  const { label, small } = ui;

  return (
    <div className="flex h-[calc(100dvh-13.5rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Circuit settings" data-no-motion>
        <div>
          <span className={label}>Parts</span>
          <div className="mt-1 grid grid-cols-5 gap-1" role="toolbar" aria-label="Parts">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tool === t.id} title={t.label} aria-label={t.label} onClick={() => setTool(t.id)}
                className={cn('grid h-10 place-items-center rounded-lg border text-sm font-semibold', tool === t.id ? 'border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-white' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]')}>
                {t.id === 'select' ? <MousePointer2 className="h-4 w-4" aria-hidden /> : <span aria-hidden className="font-mono">{t.glyph}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{tool === 'select' ? 'Press a part to change it (Delete removes it).' : tool === 'ground' ? 'Press a dot: it becomes 0 volts. Every circuit needs one.' : tool === 'probe' ? 'Press a dot to watch its voltage on the oscilloscope.' : `Drag from one dot to another to place a ${TOOLS.find((t) => t.id === tool)?.label.toLowerCase()}.`}</p>
        </div>
        {(sel || selMark) && (
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10" aria-live="polite">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{sel ? NAMES[sel.kind] : selMark!.kind === 'ground' ? 'Ground' : 'Probe'}</p>
            {sel?.kind === 'S' && (
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Frequency (Hz)<input type="number" min={1} step="any" value={sel.freq} onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 1e7) setItem(sel.id, { freq: n }); }} className={ui.input} /></label>
                <label className={label}>On for (%)<input type="number" min={0} max={100} step="any" value={Math.round(sel.value * 1000) / 10} onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && n >= 0 && n <= 100) setItem(sel.id, { value: n / 100 }); }} className={ui.input} /></label>
              </div>
            )}
            {sel && sel.kind !== 'wire' && sel.kind !== 'D' && sel.kind !== 'S' && (
              <label className={label}>{sel.kind === 'V' && sel.wave !== 'dc' ? 'Peak' : 'Value'} <span className="font-normal text-zinc-500 dark:text-zinc-400">({UNITS[sel.kind]}; 4.7k, 10u, 2m…)</span>
                <input value={valueText[sel.id] ?? si(sel.value, '').trim()} onChange={(e) => { setValueText((v) => ({ ...v, [sel.id]: e.target.value })); const n = parseSi(e.target.value); if (n !== null && (n > 0 || sel.kind === 'V' || sel.kind === 'I')) setItem(sel.id, { value: n }); }}
                  onBlur={() => setValueText((v) => { const next = { ...v }; delete next[sel.id]; return next; })} className={ui.input} />
              </label>
            )}
            {sel?.kind === 'V' && (
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Kind
                  <select value={sel.wave} onChange={(e) => setItem(sel.id, { wave: e.target.value as Wave })} className="input mt-1 w-full"><option value="dc">Steady (DC)</option><option value="sine">Sine (AC)</option><option value="square">Square (on, off)</option></select>
                </label>
                {sel.wave !== 'dc' && <label className={label}>Frequency (Hz)<input type="number" min={0.01} step="any" value={sel.freq} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setItem(sel.id, { freq: n }); }} className={ui.input} /></label>}
              </div>
            )}
            {sel && sel.kind !== 'wire' && c && <p className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">Now: {si(across, 'V')} across, {si(through, 'A')} through</p>}
            <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => remove(chosen!)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>Time step
            <select value={board.dt} onChange={(e) => setBoard((b) => ({ ...b, dt: Number(e.target.value) }))} className="input mt-1 w-full">{STEPS.map((v) => <option key={v} value={v}>{si(v, 's')}</option>)}</select>
          </label>
          <label className={label}>Screen shows
            <select value={board.window} onChange={(e) => setBoard((b) => ({ ...b, window: Number(e.target.value) }))} className="input mt-1 w-full">{WINDOWS.map((v) => <option key={v} value={v}>{si(v, 's')}</option>)}</select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={small} onClick={() => { setFailed(null); setRunning((r) => !r); }}>{running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{running ? 'Pause' : 'Run'}</button>
          <button type="button" className={small} onClick={() => { setFailed(null); setBoard((b) => ({ ...b })); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Start again</button>
        </div>
        <label className={label}>Start from
          <select value="" onChange={(e) => { const ex = EXAMPLES.find((x) => x.id === e.target.value); if (ex) { setBoard(() => ex.make()); setChosen(null); setFailed(null); } }} className="input mt-1 w-full">
            <option value="">Choose a circuit…</option>{EXAMPLES.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </label>
        <button type="button" className={cn(small, 'self-start')} onClick={() => { if (confirm('Clear the whole board?')) { setBoard((b) => ({ ...b, items: [], marks: [] })); setChosen(null); } }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Clear the board</button>
      </aside>
      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="Circuit">
        {error ? <p className="border-b border-zinc-200/80 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-white/10 dark:bg-red-950/40 dark:text-red-300">{error}</p>
          : !net.grounded && board.items.length > 0 && <p className="border-b border-zinc-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-white/10 dark:bg-amber-950/40 dark:text-amber-200">Add a ground (⏚) somewhere: the voltages are measured from it.</p>}
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <svg ref={svg} viewBox={`0 0 ${COLS * G + 2 * PAD} ${ROWS * G + 2 * PAD}`} className={cn('h-auto w-full touch-none select-none', tool === 'select' ? 'cursor-default' : 'cursor-crosshair')} role="group" aria-label={`Circuit board: ${board.items.length} parts and wires`} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-no-motion>
            {DOTS}
            {board.items.map((it) => {
              const x1 = X(it.x1), y1 = Y(it.y1), x2 = X(it.x2), y2 = Y(it.y2), len = Math.hypot(x2 - x1, y2 - y1), ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
              const on = it.id === chosen, colour = it.kind === 'wire' ? volt(nodeV(it.x1, it.y1)) : undefined;
              const text = describe(it), vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
              return (
                <g key={it.id} role="button" tabIndex={0} aria-label={`${NAMES[it.kind]} ${text}`} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setChosen(it.id); } }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(it.id); } }} className="cursor-pointer outline-none">
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
                  <g transform={`translate(${x1} ${y1}) rotate(${ang})`} style={{ color: colour ?? (on ? '#7c3aed' : dark ? '#e4e4e7' : '#27272a') }}>
                    {it.kind === 'wire' ? <line x1={0} y1={0} x2={len} y2={0} stroke={on ? '#7c3aed' : colour} strokeWidth={on ? 3 : 2.4} strokeLinecap="round" /> : <Symbol it={it} len={len} />}
                  </g>
                  {text && <text x={(x1 + x2) / 2 + (vertical ? 16 : 0)} y={(y1 + y2) / 2 + (vertical ? 4 : -16)} fontSize={11} textAnchor={vertical ? 'start' : 'middle'} className="fill-zinc-600 dark:fill-zinc-300">{text}</text>}
                </g>
              );
            })}
            {board.marks.map((m) => {
              const x = X(m.x), y = Y(m.y), on = m.id === chosen, probe = net.probes.find((p) => p.id === m.id);
              return (
                <g key={m.id} role="button" tabIndex={0} aria-label={m.kind === 'ground' ? 'Ground' : `Probe ${probe?.label} ${c && probe ? si(c.v(probe.node), 'V') : ''}`.trim()} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setChosen(m.id); } }} onKeyDown={(e) => { if (e.key === 'Enter') setChosen(m.id); }} className="cursor-pointer outline-none">
                  {m.kind === 'ground' ? (
                    <g stroke={on ? '#7c3aed' : dark ? '#e4e4e7' : '#27272a'} strokeWidth={1.8}><line x1={x} y1={y} x2={x} y2={y + 8} /><line x1={x - 9} y1={y + 8} x2={x + 9} y2={y + 8} /><line x1={x - 6} y1={y + 12} x2={x + 6} y2={y + 12} /><line x1={x - 3} y1={y + 16} x2={x + 3} y2={y + 16} /></g>
                  ) : probe && (
                    <g><circle cx={x} cy={y} r={on ? 7 : 6} fill={probe.colour} stroke={dark ? '#18181b' : '#fff'} strokeWidth={2} />
                      <text x={x + 9} y={y - 8} fontSize={11} fontWeight={600} fill={probe.colour}>{probe.label} {c ? si(c.v(probe.node), 'V') : ''}</text></g>
                  )}
                </g>
              );
            })}
            {drag && (drag.x1 !== drag.x2 || drag.y1 !== drag.y2) && <line x1={X(drag.x1)} y1={Y(drag.y1)} x2={X(drag.x2)} y2={Y(drag.y2)} stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 4" />}
          </svg>
        </div>
        <div className="border-t border-zinc-200/80 p-3 dark:border-white/10" data-no-motion>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-white">Oscilloscope</span>
            {net.probes.length ? net.probes.map((p) => <span key={p.id} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: p.colour }} aria-hidden />{p.label}</span>) : <span>Add a probe (P) to watch a voltage.</span>}
            <span className="ms-auto font-mono tabular-nums">{si(vTop / 5, 'V')}/div · {si(board.window / 10, 's')}/div · t = {si(tNow, 's')}</span>
          </div>
          <svg viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" className="h-40 w-full rounded-lg bg-zinc-950" role="img" aria-label={`Oscilloscope: ${net.probes.map((p) => `${p.label} ${c ? si(c.v(p.node), 'V') : ''}`).join(', ')}`}>
            {Array.from({ length: 11 }, (_, k) => <line key={`v${k}`} x1={(k * SW) / 10} y1={0} x2={(k * SW) / 10} y2={SH} stroke="#3f3f46" strokeWidth={k === 0 || k === 10 ? 1 : 0.5} vectorEffect="non-scaling-stroke" />)}
            {Array.from({ length: 11 }, (_, k) => <line key={`h${k}`} x1={0} y1={(k * SH) / 10} x2={SW} y2={(k * SH) / 10} stroke={k === 5 ? '#71717a' : '#3f3f46'} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
            {traces.map((tr) => <polyline key={tr.p.id} points={tr.pts} fill="none" stroke={tr.p.colour} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
          </svg>
        </div>
      </section>
    </div>
  );
}
