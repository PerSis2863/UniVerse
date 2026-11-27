'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chartOf, type Diagram } from '@/lib/sim/blocks';
import type { Chart } from '@/lib/sim/chart';
import { ui } from './bench-ui';
import { fmt } from './scope-plot';
import type { FromBlocks } from './blocks.worker';

// Hyperion Simulate → Blocks → Logic (M563): a Chart block's states and transitions drawn, the run played back with
// the active state lit and the transition that led there marked; a strip of which state was active when, and how
// often each state was entered and each transition fired (one that never ran is flagged: a gap in the tests, M566).

const SW = 150, SH = 54, GX = 230, GY = 130;

interface Edge { from: number; to: number; text: string; on: boolean }
/** What the drawing shows: boxes (a flat chart's states, or the leaves of a chart with side-by-side states, M570),
 * their outer states, the lines between them, which boxes are lit and which box the chart starts in. */
function viewOf(ch: Chart, active: number, via: number) {
  const w = ch.written;
  if (w) {
    const box = (name: string) => { const exact = w.leaves.findIndex((l) => l.split('.').pop() === name); return exact >= 0 ? exact : w.leaves.findIndex((l) => l.split('.').includes(name)); };
    const fired = new Set(via >= 0 ? w.parts[via] : []);
    return {
      names: w.leaves, parents: w.leafParents, acts: w.leaves.map(() => ''), lit: new Set(w.active[active] ?? []), start: new Set(w.active[0]), parallel: new Set(w.parallel),
      edges: w.src.map((e, k): Edge => ({ from: box(e.from), to: box(e.to), text: w.leaves[box(e.from)]?.split('.').pop() === e.from ? e.text : `${e.text} (from ${e.from})`, on: fired.has(k) })),
    };
  }
  const edges: Edge[] = [];
  ch.trans.forEach((tr, k) => {
    // An outer state's transition is one per inner state once flattened: drawn once, lit when any of them fires.
    const same = (o: typeof tr) => o.line === tr.line && o.to === tr.to && / \(from \w+\)$/.test(o.text);
    if (same(tr) && ch.trans.findIndex(same) !== k) return;
    edges.push({ from: tr.from, to: tr.to, text: tr.text, on: k === via || (same(tr) && via >= 0 && same(ch.trans[via])) });
  });
  return {
    names: ch.states.map((s) => s.name), parents: ch.parents ?? ch.states.map(() => []), lit: new Set([active]), start: new Set([0]), parallel: new Set<string>(), edges,
    acts: ch.states.map((st) => [st.entry.length ? `entry: ${st.entry.map((a) => a.name).join(', ')}` : '', st.during.length ? `during: ${st.during.map((a) => a.name).join(', ')}` : ''].filter(Boolean).join(' · ')),
  };
}

/** A flat state's name for a narrow label: each active leaf's own name (`Pump.Idle | Light.Red` → `Idle + Red`). */
const short = (name: string) => (name.includes(' | ') ? name.split(' | ').map((x) => x.split('.').pop()).join(' + ') : name);

function layout(n: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  return Array.from({ length: n }, (_, i) => ({ x: 40 + (i % cols) * GX, y: 50 + Math.floor(i / cols) * GY }));
}

function ChartDrawing({ ch, active, via }: { ch: Chart; active: number; via: number }) {
  const v = viewOf(ch, active, via);
  const pos = layout(v.names.length), W = Math.max(...pos.map((p) => p.x)) + SW + 40, H = Math.max(...pos.map((p) => p.y)) + SH + 50;
  const centre = (i: number) => ({ x: pos[i].x + SW / 2, y: pos[i].y + SH / 2 });
  /** Where the line from a box's centre towards (dx, dy) leaves the box. */
  const edge = (i: number, dx: number, dy: number) => { const c = centre(i), k = Math.min(SW / 2 / Math.abs(dx || 1e-9), SH / 2 / Math.abs(dy || 1e-9)); return { x: c.x + dx * k, y: c.y + dy * k }; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-[22rem] w-full" role="img" aria-label={`The chart: ${v.names.join(', ')}; now in ${ch.states[active]?.name}`}>
      <defs>
        <marker id="uv-chart-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" className="fill-zinc-500 dark:fill-zinc-400" /></marker>
        <marker id="uv-chart-arrow-on" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" className="fill-violet-600 dark:fill-violet-400" /></marker>
      </defs>
      {/* States inside states (M569): a dashed box round each outer state's inner states, its name on top; a box whose
          inside runs side by side (M570) is marked so. */}
      {[...new Set(v.parents.flat())].map((outer) => {
        const inside = v.parents.map((ps, i) => (ps.includes(outer) ? i : -1)).filter((i) => i >= 0), depth = Math.max(...inside.map((i) => v.parents[i].length - v.parents[i].indexOf(outer)));
        const pad = 10 * depth, x0 = Math.min(...inside.map((i) => pos[i].x)) - pad, y0 = Math.min(...inside.map((i) => pos[i].y)) - pad - 14, x1 = Math.max(...inside.map((i) => pos[i].x)) + SW + pad, y1 = Math.max(...inside.map((i) => pos[i].y)) + SH + pad;
        return <g key={outer}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={14} fill="none" strokeDasharray={v.parallel.has(outer) ? undefined : '5 4'} className="stroke-zinc-400 dark:stroke-zinc-500" /><text x={x0 + 10} y={y0 + 13} fontSize={11} fontWeight={600} className="fill-zinc-700 dark:fill-zinc-200">{outer}{v.parallel.has(outer) ? ' (side by side)' : ''}</text></g>;
      })}
      {v.edges.map((tr, k) => {
        if (tr.from < 0 || tr.to < 0) return null;
        const on = tr.on;
        let d: string, lx: number, ly: number;
        if (tr.from === tr.to) {
          const p = pos[tr.from];
          d = `M${p.x + SW - 30},${p.y} C${p.x + SW - 20},${p.y - 34} ${p.x + SW + 22},${p.y - 20} ${p.x + SW},${p.y + 12}`;
          lx = p.x + SW + 8; ly = p.y - 18;
        } else {
          const a = centre(tr.from), b = centre(tr.to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          // Bent to one side, so A → B and B → A don't sit on top of each other.
          const nx = -dy / len, ny = dx / len, bend = 22, s = edge(tr.from, dx + nx * bend, dy + ny * bend), e = edge(tr.to, -dx + nx * bend, -dy + ny * bend);
          const mx = (a.x + b.x) / 2 + nx * bend * 1.6, my = (a.y + b.y) / 2 + ny * bend * 1.6;
          d = `M${s.x},${s.y} Q${mx},${my} ${e.x},${e.y}`;
          lx = mx; ly = my;
        }
        const label = (tr.text || 'always').replace(/\s+/g, ' '), short = label.length > 26 ? `${label.slice(0, 25)}…` : label;
        return (
          <g key={k}>
            <path d={d} fill="none" strokeWidth={on ? 2.4 : 1.5} className={on ? 'stroke-violet-600 dark:stroke-violet-400' : 'stroke-zinc-500 dark:stroke-zinc-400'} markerEnd={`url(#${on ? 'uv-chart-arrow-on' : 'uv-chart-arrow'})`} />
            <text x={lx} y={ly} fontSize={11} textAnchor="middle" className={cn('font-mono', on ? 'fill-violet-700 dark:fill-violet-300' : 'fill-zinc-600 dark:fill-zinc-300')} paintOrder="stroke" stroke="var(--color-bg, transparent)" strokeWidth={3}>[{short}]</text>
          </g>
        );
      })}
      {v.names.map((name, i) => {
        const p = pos[i], on = v.lit.has(i), acts = v.acts[i];
        return (
          <g key={name}>
            <rect x={p.x} y={p.y} width={SW} height={SH} rx={12} strokeWidth={on ? 2.4 : 1.3} className={on ? 'fill-violet-100 stroke-violet-600 dark:fill-violet-500/25 dark:stroke-violet-400' : 'fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-white/20'} />
            {v.start.has(i) && <><circle cx={p.x - 16} cy={p.y + SH / 2} r={4} className="fill-zinc-600 dark:fill-zinc-300" /><line x1={p.x - 12} y1={p.y + SH / 2} x2={p.x - 2} y2={p.y + SH / 2} className="stroke-zinc-600 dark:stroke-zinc-300" strokeWidth={1.5} markerEnd="url(#uv-chart-arrow)" /></>}
            <text x={p.x + SW / 2} y={p.y + (acts ? 23 : 32)} fontSize={13} fontWeight={600} textAnchor="middle" className="fill-zinc-900 dark:fill-white">{name.split('.').pop()}</text>
            {acts && <text x={p.x + SW / 2} y={p.y + 41} fontSize={10} textAnchor="middle" className="fill-zinc-600 font-mono dark:fill-zinc-300">{acts.length > 26 ? `${acts.slice(0, 25)}…` : acts}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function BlocksLogic({ dg, names, result }: { dg: Diagram; names: Map<string, string>; result: FromBlocks | null }) {
  const charts = dg.blocks.filter((b) => b.kind === 'chart');
  const [pick, setPick] = useState<string | null>(null);
  const block = charts.find((b) => b.id === pick) ?? charts[0] ?? null;
  // chartOf keeps each text's chart, so this is cheap on every render.
  const ch = (() => { if (!block) return null; try { return chartOf(block); } catch { return null; } })();
  const trace = block ? result?.charts?.[block.id] : undefined, t = result?.t ?? [];
  const [k, setK] = useState(0), [playing, setPlaying] = useState(false);
  const last = Math.max(0, t.length - 1), at = Math.min(k, last);
  const frame = useRef(0);
  useEffect(() => {
    if (!playing) return;
    // The whole run in about eight seconds.
    let prev = performance.now();
    const tick = (now: number) => {
      const adv = ((now - prev) / 8000) * last;
      if (adv >= 1) { prev = now; setK((v) => { const nx = Math.min(last, v + Math.floor(adv)); if (nx >= last) setPlaying(false); return nx; }); }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, last]);

  if (!charts.length) return <p className="text-xs text-zinc-600 dark:text-zinc-300">Add a Chart block (Logic) to the diagram: a state machine for supervisory control, mode switching and error handling. Or start from “A tank with a supervisor”.</p>;
  if (!ch) return <p className="text-xs text-red-700 dark:text-red-400">{block ? `${names.get(block.id)} has a mistake in its text: choose it to see where.` : ''}</p>;
  const active = trace?.active[at] ?? 0, prevActive = at > 0 ? trace?.active[at - 1] ?? active : active;
  const via = active !== prevActive ? ch.trans.findIndex((tr) => tr.from === prevActive && tr.to === active) : -1;
  const rowH = 18, PW = 900, L = 110, H = ch.states.length * rowH + 22, X = (i: number) => L + (i / Math.max(1, last)) * (PW - L - 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {charts.length > 1 && (
          <label className={ui.label}>Chart<select value={block!.id} onChange={(e) => setPick(e.target.value)} className="input mt-1 block">{charts.map((b) => <option key={b.id} value={b.id}>{names.get(b.id)}</option>)}</select></label>
        )}
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!trace} onClick={() => { if (at >= last) setK(0); setPlaying((p) => !p); }}>
          {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Play'}
        </button>
        <label className={cn(ui.label, 'min-w-60 flex-1')}>Time <span className="font-mono font-normal tabular-nums text-zinc-500 dark:text-zinc-400" data-chart-time>{fmt(t[at] ?? 0)} s, in {ch.states[active]?.name}</span>
          <input type="range" min={0} max={last} value={at} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" aria-valuetext={`${fmt(t[at] ?? 0)} seconds, ${ch.states[active]?.name}`} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 rounded-lg border border-zinc-200 p-2 dark:border-white/10"><ChartDrawing ch={ch} active={active} via={via} /></div>
        <div className="min-w-0 space-y-2 text-[13px]">
          <p className="text-xs font-semibold text-zinc-900 dark:text-white">What ran</p>
          <ul className="space-y-1">
            {ch.states.map((st, i) => <li key={st.name} className="flex justify-between gap-2"><span>State {st.name}</span><span className={cn('font-mono tabular-nums', !trace?.visits[i] && 'text-amber-700 dark:text-amber-400')}>{trace ? (trace.visits[i] ? `entered ${trace.visits[i]}×` : 'never') : '—'}</span></li>)}
            {ch.trans.map((tr, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate" title={tr.text}>{ch.states[tr.from].name} → {ch.states[tr.to].name}</span><span className={cn('shrink-0 font-mono tabular-nums', !trace?.fired[i] && 'text-amber-700 dark:text-amber-400')}>{trace ? (trace.fired[i] ? `${trace.fired[i]}×` : 'never') : '—'}</span></li>)}
          </ul>
        </div>
      </div>
      {trace && (
        <figure className="rounded-lg border border-zinc-200 p-2 dark:border-white/10">
          <figcaption className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">Active state over time</figcaption>
          <svg viewBox={`0 0 ${PW} ${H}`} className="h-auto w-full" role="img" aria-label={`Active state over time; ${ch.states.map((s, i) => `${s.name} ${trace.visits[i] ? `entered ${trace.visits[i]} times` : 'never'}`).join(', ')}`}>
            {ch.states.map((st, i) => {
              // Runs of the same state as one bar each.
              const bars: [number, number][] = [];
              let start = -1;
              trace.active.forEach((a, j) => { if (a === i && start < 0) start = j; if (a !== i && start >= 0) { bars.push([start, j]); start = -1; } });
              if (start >= 0) bars.push([start, trace.active.length - 1]);
              return <g key={st.name}>
                <text x={L - 8} y={i * rowH + 13} fontSize={11} textAnchor="end" className="fill-zinc-700 dark:fill-zinc-200"><title>{st.name}</title>{short(st.name)}</text>
                {bars.map(([a, b]) => <rect key={a} x={X(a)} y={i * rowH + 3} width={Math.max(1, X(b) - X(a))} height={rowH - 6} rx={3} className="fill-violet-500/80 dark:fill-violet-400/80" />)}
              </g>;
            })}
            <line x1={X(at)} x2={X(at)} y1={0} y2={ch.states.length * rowH} className="stroke-zinc-900 dark:stroke-white" strokeWidth={1.2} />
            <text x={L} y={H - 4} fontSize={11} className="fill-zinc-500 font-mono dark:fill-zinc-400">0 s</text>
            <text x={PW - 10} y={H - 4} fontSize={11} textAnchor="end" className="fill-zinc-500 font-mono dark:fill-zinc-400">{fmt(t[last] ?? 0)} s</text>
          </svg>
        </figure>
      )}
    </div>
  );
}
