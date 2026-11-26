'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { tfInline } from '@/lib/lab/lti-text';
import { blockId, chartOf, coeffs, EXAMPLES, KINDS, MAX_STEPS, newBlock, readDiagram, type Block, type BlockKind, type Diagram } from '@/lib/sim/blocks';
import { NumField, ui } from './bench-ui';
import { fmt, ScopePlot } from './scope-plot';
import { BlocksTune } from './BlocksTune';
import { BlocksLogic } from './BlocksLogic';
import { BlocksLive } from './BlocksLive';
import { BlocksCode } from './BlocksCode';
import { BlocksVerify } from './BlocksVerify';
import { Segmented } from '@/components/ui/Segmented';
import type { FromBlocks, ToBlocks } from './blocks.worker';

// Hyperion Simulate → Blocks (M415): model-based design. Add blocks from the library, drag them about, drag from a
// block's output (the dot on its right) to another's input to wire them (or choose each input in the panel); the
// diagram runs as you build it (src/lib/sim/blocks.ts, in a worker) and every Scope block draws its inputs below.

const KEEP = 'uv-sim-blocks';
type Tool = 'scopes' | 'tune' | 'logic' | 'live' | 'code' | 'verify';
const VW = 760, VH = 340, BW = 88, SNAP = 10;
const height = (b: Block) => Math.max(54, 18 * (Math.max(KINDS[b.kind].ins(b.p), KINDS[b.kind].outs(b.p)) + 1));
const inPort = (b: Block, i: number) => ({ x: b.x, y: b.y + (height(b) * (i + 1)) / (KINDS[b.kind].ins(b.p) + 1) });
const outPort = (b: Block, k = 0) => ({ x: b.x + BW, y: b.y + (height(b) * (k + 1)) / (KINDS[b.kind].outs(b.p) + 1) });
/** A chart's input and output names (empty while its text has a mistake). */
const ports = (b: Block) => { if (b.kind !== 'chart') return { ins: [], outs: [] }; try { const c = chartOf(b); return { ins: c.inputs, outs: c.outputs }; } catch { return { ins: [], outs: [] }; } };
const GROUPS = ['Sources', 'Maths', 'Continuous', 'Logic', 'Hardware', 'Sinks'];
const LIGHT = ['#7c3aed', '#0e7490', '#b45309', '#047857'], DARK = ['#a78bfa', '#22d3ee', '#fbbf24', '#34d399'];

type Field = { key: string; label: string; unit?: string; text?: string };
const FIELDS: Record<BlockKind, Field[]> = {
  step: [{ key: 'time', label: 'Step time', unit: 's' }, { key: 'before', label: 'Value before' }, { key: 'after', label: 'Value after' }],
  sine: [{ key: 'amplitude', label: 'Amplitude' }, { key: 'frequency', label: 'Frequency', unit: 'Hz' }, { key: 'phase', label: 'Phase', unit: 'degrees' }],
  constant: [{ key: 'value', label: 'Value' }],
  pulse: [{ key: 'amplitude', label: 'Amplitude' }, { key: 'period', label: 'Period', unit: 's' }, { key: 'width', label: 'On for', unit: '% of the period' }],
  ramp: [{ key: 'slope', label: 'Slope', unit: 'per second' }, { key: 'start', label: 'Starts at', unit: 's' }],
  gain: [{ key: 'k', label: 'Gain' }],
  sum: [{ key: 'signs', label: 'Signs', text: 'one + or − per input, e.g. +- or ++-' }],
  product: [],
  saturation: [{ key: 'lower', label: 'Lowest' }, { key: 'upper', label: 'Highest' }],
  integrator: [{ key: 'initial', label: 'Starts at' }],
  tf: [{ key: 'num', label: 'Numerator', text: 'powers of s, highest first: 1 2 = s + 2' }, { key: 'den', label: 'Denominator', text: '1 3 2 = s² + 3s + 2' }],
  pid: [{ key: 'Kp', label: 'Kp (proportional)' }, { key: 'Ki', label: 'Ki (integral)' }, { key: 'Kd', label: 'Kd (derivative)' }, { key: 'N', label: 'Derivative filter N' }],
  chart: [],
  delay: [{ key: 'time', label: 'Delay', unit: 's' }, { key: 'initial', label: 'Output before then' }],
  boardIn: [{ key: 'pin', label: 'Analog pin', text: 'A0 to A5' }, { key: 'scale', label: 'Full scale (the value at 1023)' }, { key: 'test', label: 'Value with no board' }],
  boardOut: [{ key: 'pin', label: 'Pin (PWM: 3, 5, 6, 9, 10, 11)' }, { key: 'lo', label: 'Input for 0' }, { key: 'hi', label: 'Input for full (255, or on)' }],
  scope: [],
};

function summary(b: Block): string {
  const p = b.p, v = (k: string) => fmt(Number(p[k]));
  switch (b.kind) {
    case 'step': return `${v('before')} → ${v('after')} at ${v('time')} s`;
    case 'sine': return `${v('amplitude')} · sin, ${v('frequency')} Hz`;
    case 'constant': return v('value');
    case 'pulse': return `${v('amplitude')} every ${v('period')} s`;
    case 'ramp': return `slope ${v('slope')}`;
    case 'gain': return `× ${v('k')}`;
    case 'sum': return String(p.signs).replace(/-/g, '−');
    case 'saturation': return `${v('lower')} to ${v('upper')}`;
    case 'integrator': return `starts at ${v('initial')}`;
    case 'tf': return tfInline(coeffs(p.num), coeffs(p.den));
    case 'pid': return `Kp ${v('Kp')}, Ki ${v('Ki')}, Kd ${v('Kd')}`;
    case 'chart': try { return `${chartOf(b).states.length} states`; } catch { return 'a chart with a mistake'; }
    case 'delay': return `${v('time')} s later`;
    case 'boardIn': return `pin ${String(p.pin)}`;
    case 'boardOut': return `pin ${String(p.pin)}, ${p.mode === 'digital' ? 'on/off' : 'PWM'}`;
    case 'scope': return `${KINDS.scope.ins(p)} input${KINDS.scope.ins(p) > 1 ? 's' : ''}`;
    default: return '';
  }
}

/** The picture inside a block, centred on (0, 0). */
function Glyph({ b }: { b: Block }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const big = (t: string, size = 20) => <text x={0} y={size * 0.36} fontSize={size} textAnchor="middle" fill="currentColor" className="font-mono">{t}</text>;
  switch (b.kind) {
    case 'step': return <path d="M-22,8 H-4 V-8 H22" {...line} />;
    case 'sine': return <path d="M-22,0 C-16,-14 -10,-14 -5.5,0 S5,14 11,0 S19,-12 22,-6" {...line} />;
    case 'pulse': return <path d="M-22,8 H-16 V-8 H-6 V8 H4 V-8 H14 V8 H22" {...line} />;
    case 'ramp': return <path d="M-22,10 H-10 L22,-10" {...line} />;
    case 'saturation': return <path d="M-22,8 H-8 L8,-8 H22" {...line} />;
    case 'constant': return big(fmt(Number(b.p.value)), 16);
    case 'gain': return big(`×${fmt(Number(b.p.k))}`, 15);
    case 'sum': return big('Σ', 24);
    case 'product': return big('×', 24);
    case 'pid': return big('PID', 15);
    case 'delay': return <><text x={0} y={5} fontSize={14} textAnchor="middle" fill="currentColor" className="font-mono">e⁻ˢᵀ</text></>;
    case 'boardIn': return <><rect x={-16} y={-12} width={32} height={24} rx={3} {...line} strokeWidth={1.4} /><text x={0} y={5} fontSize={11} textAnchor="middle" fill="currentColor" className="font-mono">{String(b.p.pin)}</text><path d="M-26,0 H-16" {...line} /></>;
    case 'boardOut': return <><rect x={-16} y={-12} width={32} height={24} rx={3} {...line} strokeWidth={1.4} /><text x={0} y={5} fontSize={11} textAnchor="middle" fill="currentColor" className="font-mono">D{String(b.p.pin)}</text><path d="M16,0 H26" {...line} /></>;
    case 'chart': return <><rect x={-24} y={-13} width={20} height={12} rx={4} {...line} strokeWidth={1.4} /><rect x={4} y={1} width={20} height={12} rx={4} {...line} strokeWidth={1.4} /><path d="M-4,-7 C6,-7 14,-6 14,0" {...line} strokeWidth={1.4} /><path d="M11,-3 L14,1 L17,-3" {...line} strokeWidth={1.4} /></>;
    case 'integrator': return <><text x={0} y={-4} fontSize={13} textAnchor="middle" fill="currentColor" className="font-mono">1</text><line x1={-10} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={1.2} /><text x={0} y={14} fontSize={13} textAnchor="middle" fill="currentColor" className="font-mono">s</text></>;
    case 'tf': {
      const cut = (t: string) => (t.length > 12 ? `${t.slice(0, 11)}…` : t);
      const top = cut(tfInline(coeffs(b.p.num), [1])), bottom = cut(tfInline(coeffs(b.p.den), [1]));
      return <><text x={0} y={-5} fontSize={10.5} textAnchor="middle" fill="currentColor" className="font-mono">{top}</text><line x1={-34} y1={0} x2={34} y2={0} stroke="currentColor" strokeWidth={1.1} /><text x={0} y={13} fontSize={10.5} textAnchor="middle" fill="currentColor" className="font-mono">{bottom}</text></>;
    }
    case 'scope': return <><rect x={-22} y={-14} width={44} height={28} rx={4} fill="none" stroke="currentColor" strokeWidth={1.4} /><path d="M-17,6 C-10,-12 -4,12 3,-2 S13,-8 17,-4" {...line} strokeWidth={1.4} /></>;
  }
}

export function BlocksBench() {
  const dark = useDarkMode(), colours = dark ? DARK : LIGHT;
  const [dg, setDgNow] = useState<Diagram>(() => { try { return readDiagram(JSON.parse(localStorage.getItem(KEEP) ?? 'null')); } catch { return EXAMPLES[0].make(); } });
  const [chosen, setChosen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ move: string; dx: number; dy: number } | { from: string; out: number; x: number; y: number } | null>(null);
  const [result, setResult] = useState<FromBlocks | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(0);
  const [tool, setTool] = useState<Tool>('scopes');
  const svg = useRef<SVGSVGElement>(null), keepTimer = useRef(0), worker = useRef<Worker | null>(null), asked = useRef(0);
  const setDg = (f: (d: Diagram) => Diagram) => setDgNow((d) => {
    const next = f(d);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });

  useEffect(() => {
    const w = new Worker(new URL('./blocks.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromBlocks>) => { if (e.data.id === asked.current) setResult(e.data); };
    worker.current = w;
    return () => w.terminate();
  }, []);
  // Runs again when what the diagram does changes (not when a block is only moved).
  const logic = useMemo(() => JSON.stringify([dg.blocks.map((b) => [b.id, b.kind, b.p]), dg.wires, dg.stop, dg.dt]), [dg]);
  const run = useEffectEvent(() => { asked.current += 1; setPending(asked.current); worker.current?.postMessage({ id: asked.current, diagram: dg } satisfies ToBlocks); });
  useEffect(() => {
    const t = window.setTimeout(run, 220);
    return () => clearTimeout(t);
  }, [logic]);

  const byId = useMemo(() => new Map(dg.blocks.map((b) => [b.id, b])), [dg.blocks]);
  const names = useMemo(() => {
    const seen = new Map<string, number>(), total = new Map<string, number>(), out = new Map<string, string>();
    for (const b of dg.blocks) total.set(b.kind, (total.get(b.kind) ?? 0) + 1);
    for (const b of dg.blocks) { const k = (seen.get(b.kind) ?? 0) + 1; seen.set(b.kind, k); out.set(b.id, total.get(b.kind)! > 1 ? `${KINDS[b.kind].name} ${k}` : KINDS[b.kind].name); }
    return out;
  }, [dg.blocks]);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const el = svg.current!, p = el.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  };
  const place = (b: Block, x: number, y: number) => ({ ...b, x: Math.max(0, Math.min(VW - BW, Math.round(x / SNAP) * SNAP)), y: Math.max(0, Math.min(VH - height(b) - 18, Math.round(y / SNAP) * SNAP)) });
  const connect = (from: string, out: number, to: string, port: number) => setDg((d) => ({ ...d, wires: [...d.wires.filter((w) => !(w.to === to && w.in === port)), { id: blockId('w'), from, out, to, in: port }] }));
  const unwire = (to: string, port: number) => setDg((d) => ({ ...d, wires: d.wires.filter((w) => !(w.to === to && w.in === port)) }));

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const q = toWorld(e);
    if ('move' in drag) setDg((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === drag.move ? place(b, q.x - drag.dx, q.y - drag.dy) : b)) }));
    else setDrag({ ...drag, x: q.x, y: q.y });
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag && 'from' in drag) {
      const q = toWorld(e);
      let best: { b: Block; i: number; d: number } | null = null;
      for (const b of dg.blocks) for (let i = 0; i < KINDS[b.kind].ins(b.p); i++) { const p = inPort(b, i), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < 20 && (!best || d < best.d)) best = { b, i, d }; }
      if (!best) {
        // Dropped on a block: its first free input (or its first).
        const b = dg.blocks.find((bb) => q.x >= bb.x && q.x <= bb.x + BW && q.y >= bb.y && q.y <= bb.y + height(bb) && KINDS[bb.kind].ins(bb.p) > 0);
        if (b) { const n = KINDS[b.kind].ins(b.p), free = Array.from({ length: n }, (_, i) => i).find((i) => !dg.wires.some((w) => w.to === b.id && w.in === i)); best = { b, i: free ?? 0, d: 0 }; }
      }
      if (best) connect(drag.from, drag.out, best.b.id, best.i);
    }
    setDrag(null);
  };

  const add = (kind: BlockKind) => {
    const b = newBlock(kind, 0, 0), h = height(b);
    // The first free spot, left to right, top to bottom.
    let spot = { x: 40, y: 30 };
    search: for (let y = 30; y + h < VH - 18; y += 90) for (let x = 40; x + BW < VW; x += 140) {
      if (!dg.blocks.some((o) => x < o.x + BW + 20 && x + BW + 20 > o.x && y < o.y + height(o) + 24 && y + h + 24 > o.y)) { spot = { x, y }; break search; }
    }
    setDg((d) => ({ ...d, blocks: [...d.blocks, { ...b, ...spot }] }));
    setChosen(b.id);
  };
  const remove = (id: string) => { setDg((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id), wires: d.wires.filter((w) => w.id !== id && w.from !== id && w.to !== id) })); setChosen(null); };
  const setParam = (id: string, key: string, value: number | string) => setDg((d) => {
    const blocks = d.blocks.map((b) => (b.id === id ? { ...b, p: { ...b.p, [key]: value } } : b)), b = blocks.find((bb) => bb.id === id)!;
    // Fewer inputs (a sum's signs, a scope's inputs): wires into the ones gone go too.
    // (A chart's wires stay while its text is edited: a half-typed line would drop them.)
    return { ...d, blocks, wires: key === 'chart' ? d.wires : d.wires.filter((w) => w.to !== id || w.in < KINDS[b.kind].ins(b.p)) };
  });
  const setParams = (id: string, p: Record<string, number>) => setDg((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, p: { ...b.p, ...p } } : b)) }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && chosen) { e.preventDefault(); remove(chosen); }
      if (e.key === 'Escape') { setChosen(null); setDrag(null); }
      const step = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] }[e.key];
      if (step && chosen && byId.has(chosen)) { e.preventDefault(); setDg((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === chosen ? place(b, b.x + step[0], b.y + step[1]) : b)) })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Every wire's path: across, down or up, across; one that would cross a block goes round above it, and a feedback
   * wire (back to the left) round underneath, each in its own lane. */
  const paths = useMemo(() => {
    const box = (b: Block) => ({ id: b.id, x0: b.x - 6, x1: b.x + BW + 6, y0: b.y - 6, y1: b.y + height(b) + 18 });
    const boxes = dg.blocks.map(box), out = new Map<string, string>();
    const across = (x0: number, x1: number, y: number, skip: string[]) => boxes.some((bx) => !skip.includes(bx.id) && y > bx.y0 && y < bx.y1 && Math.max(x0, x1) > bx.x0 && Math.min(x0, x1) < bx.x1);
    const down = (x: number, y0: number, y1: number, skip: string[]) => boxes.some((bx) => !skip.includes(bx.id) && x > bx.x0 && x < bx.x1 && Math.max(y0, y1) > bx.y0 && Math.min(y0, y1) < bx.y1);
    let above = 0, below = 0;
    for (const w of dg.wires) {
      const a = byId.get(w.from), b = byId.get(w.to);
      if (!a || !b) continue;
      const p = outPort(a, w.out), q = inPort(b, w.in), skip = [a.id, b.id], x0 = Math.min(p.x, q.x) - 20, x1 = Math.max(p.x, q.x) + 20;
      const spanned = boxes.filter((bx) => bx.x1 > x0 && bx.x0 < x1);
      if (q.x - p.x >= 10) {
        const mx = Math.round((p.x + q.x) / 2);
        if (!across(p.x, mx, p.y, skip) && !down(mx, p.y, q.y, skip) && !across(mx, q.x, q.y, skip)) { out.set(w.id, `M${p.x},${p.y} H${mx} V${q.y} H${q.x - 6}`); continue; }
        const k = above++, lane = Math.max(6, Math.min(...spanned.map((bx) => bx.y0)) - 10 - 8 * k);
        out.set(w.id, `M${p.x},${p.y} H${p.x + 12 + 5 * k} V${lane} H${q.x - 14 - 5 * k} V${q.y} H${q.x - 6}`);
      } else {
        const k = below++, lane = Math.min(VH - 4, Math.max(...spanned.map((bx) => bx.y1)) + 6 + 8 * k);
        out.set(w.id, `M${p.x},${p.y} H${p.x + 12 + 5 * k} V${lane} H${q.x - 14 - 5 * k} V${q.y} H${q.x - 6}`);
      }
    }
    return out;
  }, [dg.blocks, dg.wires, byId]);

  const sel = chosen ? byId.get(chosen) ?? null : null, selWire = chosen ? dg.wires.find((w) => w.id === chosen) ?? null : null;
  const scopes = dg.blocks.filter((b) => b.kind === 'scope'), stale = !result || result.id !== pending;
  const steps = Math.ceil(dg.stop / dg.dt);
  const { label, small } = ui;

  return (
    <div className="flex h-[calc(100dvh-9rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Block diagram settings" data-no-motion>
        <div>
          <span className={label}>Add a block</span>
          {GROUPS.map((g) => (
            <div key={g} className="mt-2">
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{g}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(KINDS) as BlockKind[]).filter((k) => KINDS[k].group === g).map((k) => <button key={k} type="button" className={ui.add} onClick={() => add(k)}>{KINDS[k].name}</button>)}
              </div>
            </div>
          ))}
          <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Drag a block to move it. Drag from the dot on a block’s right to another block’s input to wire them. Delete removes what’s chosen.</p>
        </div>
        {sel && (
          <div key={sel.id} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10" aria-live="polite">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{names.get(sel.id)}</p>
            {FIELDS[sel.kind].map((f) => f.text !== undefined ? (
              <label key={f.key} className={label}>{f.label} <span className="font-normal text-zinc-500 dark:text-zinc-400">({f.text})</span>
                <input value={text[`${sel.id}:${f.key}`] ?? String(sel.p[f.key])} className={ui.input}
                  onChange={(e) => {
                    const v = e.target.value;
                    setText((t) => ({ ...t, [`${sel.id}:${f.key}`]: v }));
                    const ok = f.key === 'pin' ? /^A[0-5]$/.test(v.trim().toUpperCase()) : f.key === 'signs' ? /^[+-]{1,6}$/.test(v.replace(/−/g, '-').replace(/\s/g, '')) : v.trim() !== '' && v.trim().split(/[\s,]+/).every((x) => Number.isFinite(Number(x)));
                    if (ok) setParam(sel.id, f.key, f.key === 'pin' ? v.trim().toUpperCase() : f.key === 'signs' ? v.replace(/−/g, '-').replace(/\s/g, '') : v.trim().slice(0, 80));
                  }}
                  onBlur={() => setText((t) => { const next = { ...t }; delete next[`${sel.id}:${f.key}`]; return next; })} />
              </label>
            ) : <NumField key={f.key} label={f.label} unit={f.unit} value={Number(sel.p[f.key])} onChange={(v) => setParam(sel.id, f.key, v)} />)}
            {sel.kind === 'chart' && (() => {
              let problem = '';
              try { chartOf(sel); } catch (err) { problem = (err as Error).message; }
              return (
                <label className={label}>The chart <span className="font-normal text-zinc-500 dark:text-zinc-400">(inputs:, outputs:, state Name, entry: / during: / exit: actions, A -&gt; B: condition after seconds / actions)</span>
                  <textarea value={String(sel.p.chart)} rows={14} spellCheck={false} translate="no" className="input mt-1 w-full font-mono text-xs leading-relaxed"
                    onChange={(e) => setParam(sel.id, 'chart', e.target.value.slice(0, 4000))} aria-invalid={!!problem} aria-describedby={problem ? 'uv-chart-problem' : undefined} />
                  {problem && <span id="uv-chart-problem" className="mt-1 block text-xs font-normal text-red-700 dark:text-red-400">{problem}</span>}
                </label>
              );
            })()}
            {sel.kind === 'boardOut' && (
              <label className={label}>Drives the pin as
                <select value={String(sel.p.mode)} onChange={(e) => setParam(sel.id, 'mode', e.target.value)} className="input mt-1 w-full"><option value="pwm">PWM (0–255)</option><option value="digital">On or off</option></select>
              </label>
            )}
            {sel.kind === 'scope' && (
              <label className={label}>Inputs
                <select value={KINDS.scope.ins(sel.p)} onChange={(e) => setParam(sel.id, 'inputs', Number(e.target.value))} className="input mt-1 w-full">{[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}</select>
              </label>
            )}
            {Array.from({ length: KINDS[sel.kind].ins(sel.p) }, (_, i) => {
              const w = dg.wires.find((ww) => ww.to === sel.id && ww.in === i);
              return (
                <label key={i} className={label}>Input {i + 1}{sel.kind === 'sum' ? ` (${String(sel.p.signs)[i] === '-' ? 'minus' : 'plus'})` : ''} comes from
                  <select value={w ? `${w.from}#${w.out}` : ''} onChange={(e) => { const [from, out] = e.target.value.split('#'); if (from) connect(from, Number(out) || 0, sel.id, i); else unwire(sel.id, i); }} className="input mt-1 w-full">
                    <option value="">Nothing (0)</option>
                    {dg.blocks.flatMap((b) => Array.from({ length: KINDS[b.kind].outs(b.p) }, (_, k) => <option key={`${b.id}#${k}`} value={`${b.id}#${k}`}>{names.get(b.id)}{KINDS[b.kind].outs(b.p) > 1 ? `: ${ports(b).outs[k] ?? `output ${k + 1}`}` : ''}</option>))}
                  </select>
                </label>
              );
            })}
            <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => remove(sel.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete the block</button>
          </div>
        )}
        {selWire && (
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10" aria-live="polite">
            <p className="text-[13px] text-zinc-800 dark:text-zinc-100">A wire from <strong>{names.get(selWire.from)}</strong> to input {selWire.in + 1} of <strong>{names.get(selWire.to)}</strong></p>
            <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => remove(selWire.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete the wire</button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Run for" unit="s" value={dg.stop} min={0.001} onChange={(v) => { if (v > 0 && v <= 1e5) setDg((d) => ({ ...d, stop: v })); }} />
          <NumField label="Time step" unit="s" value={dg.dt} min={0.00001} onChange={(v) => { if (v >= 1e-5 && v <= 10) setDg((d) => ({ ...d, dt: v })); }} />
        </div>
        <p className="-mt-2 text-xs text-zinc-600 dark:text-zinc-300">{steps.toLocaleString()} steps of Runge–Kutta (4th order){steps > MAX_STEPS ? `: only the first ${MAX_STEPS.toLocaleString()} run; make the step bigger` : ''}.</p>
        <label className={label}>Start from
          <select value="" onChange={(e) => { const ex = EXAMPLES.find((x) => x.id === e.target.value); if (ex) { setDg(() => ex.make()); setChosen(null); } }} className="input mt-1 w-full">
            <option value="">Choose a model…</option>{EXAMPLES.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </label>
        <button type="button" className={cn(small, 'self-start')} onClick={() => { if (confirm('Clear the whole diagram?')) { setDg((d) => ({ ...d, blocks: [], wires: [] })); setChosen(null); } }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Clear the diagram</button>
      </aside>
      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="Block diagram">
        {result?.error && result.id === pending && <p className="border-b border-zinc-200/80 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-white/10 dark:bg-red-950/40 dark:text-red-300">{result.error}</p>}
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <svg ref={svg} viewBox={`0 0 ${VW} ${VH}`} className="h-full max-h-full w-full touch-none select-none" role="group" aria-label={`Block diagram: ${dg.blocks.length} blocks, ${dg.wires.length} wires`}
            onPointerMove={move} onPointerUp={up} onPointerDown={(e) => { if (e.target === e.currentTarget) setChosen(null); }} data-no-motion>
            <defs><pattern id="uv-blocks-dots" width={20} height={20} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} className="fill-zinc-300 dark:fill-zinc-700" /></pattern></defs>
            <rect width={VW} height={VH} fill="url(#uv-blocks-dots)" pointerEvents="none" />
            {dg.wires.map((w) => {
              const d = paths.get(w.id), on = w.id === chosen, q = byId.get(w.to) && inPort(byId.get(w.to)!, w.in);
              if (!d || !q) return null;
              return (
                <g key={w.id} role="button" tabIndex={0} aria-label={`Wire from ${names.get(w.from)} to ${names.get(w.to)} input ${w.in + 1}`} className="cursor-pointer outline-none"
                  onPointerDown={(e) => { e.stopPropagation(); setChosen(w.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(w.id); } }}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                  <path d={d} fill="none" strokeWidth={on ? 2.6 : 1.8} strokeLinejoin="round" className={on ? 'stroke-violet-600 dark:stroke-violet-400' : 'stroke-zinc-500 dark:stroke-zinc-400'} />
                  <path d={`M${q.x - 8},${q.y - 4.5} L${q.x},${q.y} L${q.x - 8},${q.y + 4.5} Z`} className={on ? 'fill-violet-600 dark:fill-violet-400' : 'fill-zinc-500 dark:fill-zinc-400'} />
                </g>
              );
            })}
            {dg.blocks.map((b) => {
              const h = height(b), on = b.id === chosen, ins = KINDS[b.kind].ins(b.p);
              return (
                <g key={b.id}>
                  <g role="button" tabIndex={0} aria-label={`${names.get(b.id)}: ${summary(b)}`} aria-pressed={on} className="cursor-grab outline-none"
                    onPointerDown={(e) => { e.stopPropagation(); setChosen(b.id); const q = toWorld(e); svg.current?.setPointerCapture(e.pointerId); setDrag({ move: b.id, dx: q.x - b.x, dy: q.y - b.y }); }}
                    onFocus={() => setChosen(b.id)}>
                    <rect x={b.x} y={b.y} width={BW} height={h} rx={10} strokeWidth={on ? 2.2 : 1.2} className={cn('fill-white dark:fill-zinc-900', on ? 'stroke-violet-600 dark:stroke-violet-400' : 'stroke-zinc-300 dark:stroke-white/20')} />
                    <text x={b.x + BW / 2} y={b.y + h + 14} fontSize={11} textAnchor="middle" className="fill-zinc-600 dark:fill-zinc-300">{names.get(b.id)}</text>
                  </g>
                  {/* The picture sits outside the button, so its name is the block's name alone. */}
                  <g transform={`translate(${b.x + BW / 2} ${b.y + h / 2})`} opacity={b.kind === 'chart' ? 0.35 : 1} className="pointer-events-none text-zinc-800 dark:text-zinc-100" aria-hidden><Glyph b={b} /></g>
                  {Array.from({ length: ins }, (_, i) => {
                    const p = inPort(b, i);
                    return <g key={i} aria-hidden>
                      <circle cx={p.x} cy={p.y} r={3.5} className="fill-white stroke-zinc-500 dark:fill-zinc-900 dark:stroke-zinc-400" strokeWidth={1.4} />
                      {b.kind === 'sum' && <text x={p.x + 8} y={p.y + 4} fontSize={12} className="fill-zinc-700 font-mono dark:fill-zinc-200">{String(b.p.signs)[i] === '-' ? '−' : '+'}</text>}
                    </g>;
                  })}
                  {Array.from({ length: KINDS[b.kind].outs(b.p) }, (_, k) => {
                    const o = outPort(b, k);
                    return (
                      <g key={`o${k}`} aria-hidden className="cursor-crosshair" onPointerDown={(e) => { e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); const q = toWorld(e); setDrag({ from: b.id, out: k, x: q.x, y: q.y }); }}>
                        <circle cx={o.x} cy={o.y} r={11} fill="transparent" />
                        <circle cx={o.x} cy={o.y} r={4.5} className="fill-violet-600 dark:fill-violet-400" />
                      </g>
                    );
                  })}
                  {b.kind === 'chart' && (() => {
                    // A chart's input and output names beside its ports.
                    const pn = ports(b), cut = (t: string) => (t.length > 7 ? `${t.slice(0, 6)}…` : t);
                    return <g aria-hidden className="pointer-events-none fill-zinc-600 dark:fill-zinc-300" fontSize={9.5}>
                      {pn.ins.map((nm, i) => <text key={`i${nm}`} x={b.x + 7} y={inPort(b, i).y + 3.5}>{cut(nm)}</text>)}
                      {pn.outs.map((nm, k) => <text key={`o${nm}`} x={b.x + BW - 7} y={outPort(b, k).y + 3.5} textAnchor="end">{cut(nm)}</text>)}
                    </g>;
                  })()}
                </g>
              );
            })}
            {drag && 'from' in drag && byId.get(drag.from) && <path d={`M${outPort(byId.get(drag.from)!, drag.out).x},${outPort(byId.get(drag.from)!, drag.out).y} L${drag.x},${drag.y}`} className="stroke-violet-600 dark:stroke-violet-400" strokeWidth={2} strokeDasharray="5 4" fill="none" pointerEvents="none" />}
          </svg>
        </div>
        <div role="region" aria-label={{ scopes: 'Scopes', tune: 'PID tuner', logic: 'State chart logic', live: 'Real time run', code: 'Generated code', verify: 'Verification' }[tool]} tabIndex={0} className={cn('shrink-0 overflow-y-auto border-t border-zinc-200/80 p-3 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-white/10', tool === 'scopes' ? 'max-h-[48%]' : 'max-h-[64%]')} data-no-motion>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-600 dark:text-zinc-300">
            <Segmented<Tool> label="Tools" value={tool} onChange={setTool} segments={[{ value: 'scopes', label: 'Scopes' }, { value: 'tune', label: 'Tune' }, { value: 'logic', label: 'Logic' }, { value: 'live', label: 'Real time' }, { value: 'code', label: 'Code' }, { value: 'verify', label: 'Verify' }]} />
            {tool === 'scopes' && result && !result.error && <span className="font-mono tabular-nums">ran {Math.min(steps, MAX_STEPS).toLocaleString()} steps in {result.ms < 10 ? result.ms.toFixed(1) : Math.round(result.ms)} ms{result.capped ? ' (cut short)' : ''}</span>}
            {tool === 'scopes' && stale && pending > 0 && <span>running…</span>}
          </div>
          {tool === 'tune' ? <BlocksTune dg={dg} names={names} colours={colours} setParams={setParams} /> : tool === 'verify' ? <BlocksVerify dg={dg} names={names} setReqs={(reqs) => setDg((d) => ({ ...d, reqs }))} /> : tool === 'code' ? <BlocksCode dg={dg} /> : tool === 'live' ? <BlocksLive dg={dg} names={names} colours={colours} /> : tool === 'logic' ? <BlocksLogic dg={dg} names={names} result={result?.id === pending ? result : null} /> : scopes.length === 0 ? <p className="text-xs text-zinc-600 dark:text-zinc-300">Add a Scope block (Sinks) and wire what you want to see into it.</p> : (
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {scopes.map((s) => {
                const traces = Array.from({ length: KINDS.scope.ins(s.p) }, (_, i) => {
                  const w = dg.wires.find((ww) => ww.to === s.id && ww.in === i);
                  return { label: w ? names.get(w.from) ?? `Input ${i + 1}` : `Input ${i + 1} (not wired)`, v: result?.scopes[s.id]?.[i] ?? [] };
                });
                return <ScopePlot key={s.id} title={names.get(s.id) ?? 'Scope'} t={result?.t ?? []} traces={traces} colours={colours} />;
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
