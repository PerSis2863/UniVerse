'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LayoutGroup, m as motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import { change as pctChange, fmt, linePath, areaPath, niceTicks, points, stats } from '@/lib/instruments';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Roll } from './parts';

// An instrument board (the owner's "Instrumental" reference, 24 Oct 2026): a header with a live
// light, then a grid of cells, each a number and its own small instrument. A cell with a detail
// opens in place (the grid glides round it): the big line with a limit line you can drag (or move
// with ↑ ↓), a crosshair that reads any point, the period chips, and average / lowest / highest /
// p95. Esc closes it. Used by the owner console and the analytics pages.

export interface CellDetail {
  title: string;
  description: string;
  series: number[];
  /** One label per point (shown thinned out under the chart). */
  labels: string[];
  /** Where the limit line starts (the owner can move it; it's remembered on this device). */
  threshold?: number;
  /** The same period before, to say how much it changed. */
  before?: number[];
  extra?: [string, string][];
}

export interface InstrumentCell {
  id: string;
  label: string;
  value: number;
  digits?: number;
  unit?: string;
  /** A line under the number (e.g. "↓ 8% on the period before"). */
  note?: ReactNode;
  body: ReactNode;
  detail?: CellDetail;
  /** Amber edge: something waits. */
  warn?: boolean;
}

export interface BoardRange<R extends string> { id: R; label: string }

export function InstrumentBoard<R extends string>({ icon: Icon, title, subtitle, cells, ranges, range, onRange, live = true, storageKey, className }: {
  icon: LucideIcon; title: string; subtitle?: string; cells: InstrumentCell[];
  ranges?: BoardRange<R>[]; range?: R; onRange?: (r: R) => void; live?: boolean; storageKey: string; className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const opened = cells.find((c) => c.id === open && c.detail);
  return (
    <section className={cn('ins-board', className)} aria-label={title}>
      <div className="ins-board-inner">
        <header className="flex flex-wrap items-center gap-3 mb-4">
          <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-zinc-100 dark:bg-white/[0.05] ring-1 ring-zinc-200 dark:ring-white/[0.07]"><Icon className="w-5 h-5 text-zinc-700 dark:text-zinc-200" aria-hidden /></span>
          <div className="min-w-0 me-auto">
            <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white">{title}</h2>
            {subtitle && <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>}
          </div>
          {live && <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100"><span className="relative w-1.5 h-1.5 rounded-full bg-[var(--ins-hot)]"><span className="absolute inset-0 rounded-full bg-[var(--ins-hot)] ins-live" /></span>Live</span>}
          <span className="hidden md:inline font-mono text-[11px] text-zinc-500 dark:text-zinc-400">Click a cell to open it</span>
          {ranges && range && onRange && <Chips ranges={ranges} range={range} onRange={onRange} id={`${storageKey}-head`} />}
        </header>
        <LayoutGroup id={storageKey}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [grid-auto-flow:dense]">
            {cells.map((c) => {
              const isOpen = opened?.id === c.id;
              return (
                <motion.div key={c.id} layout transition={spring.smooth} className={cn('ins-cell', isOpen && 'sm:col-span-2 sm:row-span-2 is-open', c.warn && 'is-warn')}>
                  {isOpen && c.detail ? (
                    <Detail cell={c} detail={c.detail} storageKey={`${storageKey}:${c.id}`} onClose={() => setOpen(null)} ranges={ranges} range={range} onRange={onRange} />
                  ) : (
                    <CellFace cell={c} onOpen={c.detail ? () => setOpen(c.id) : undefined} />
                  )}
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
    </section>
  );
}

function CellFace({ cell, onOpen }: { cell: InstrumentCell; onOpen?: () => void }) {
  const inner = (
    <>
      <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">{cell.label}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <Roll value={cell.value} digits={cell.digits} className="font-mono text-[28px] leading-none font-light tracking-tight text-zinc-900 dark:text-white" />
        {cell.unit && <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{cell.unit}</span>}
      </span>
      {cell.note && <span className="mt-1 block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{cell.note}</span>}
      <span className="mt-3 block text-zinc-800 dark:text-zinc-100">{cell.body}</span>
    </>
  );
  return onOpen
    ? <button type="button" onClick={onOpen} className="flex flex-col justify-start w-full h-full text-start p-4 rounded-[inherit] focus-visible:outline-2">{inner}<span className="sr-only">Open the detail</span></button>
    : <div className="p-4">{inner}</div>;
}

function Chips<R extends string>({ ranges, range, onRange, id }: { ranges: BoardRange<R>[]; range: R; onRange: (r: R) => void; id: string }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex p-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.06]">
      {ranges.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={r.id === range} onClick={() => onRange(r.id)}
          className={cn('relative px-3 h-7 rounded-full text-xs font-semibold transition-colors', r.id === range ? 'text-zinc-900' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white')}>
          {r.id === range && <motion.span layoutId={`chip-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-white dark:bg-zinc-100 shadow-sm" />}
          <span className="relative">{r.label}</span>
        </button>
      ))}
    </div>
  );
}

function Detail<R extends string>({ cell, detail, storageKey, onClose, ranges, range, onRange }: {
  cell: InstrumentCell; detail: CellDetail; storageKey: string; onClose: () => void; ranges?: BoardRange<R>[]; range?: R; onRange?: (r: R) => void;
}) {
  const s = stats(detail.series);
  const ticks = niceTicks(Math.max(s.max, detail.threshold ?? 0) * 1.15 || 1);
  const top = ticks[ticks.length - 1];
  const step = (ticks[1] - ticks[0]) / 10 || 1;
  const [limit, setLimit] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(`ins-th:${storageKey}`)); if (v > 0) return v; } catch { /* private mode */ }
    return detail.threshold ?? Math.round(top * 0.8);
  });
  const save = (v: number) => {
    const next = Math.max(0, Math.min(top, Math.round(v / step) * step));
    setLimit(next);
    try { localStorage.setItem(`ins-th:${storageKey}`, String(next)); } catch { /* private mode */ }
  };
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  const ch = detail.before ? pctChange(s.total, detail.before.reduce((a, b) => a + b, 0)) : null;
  const over = s.last > limit;
  return (
    <div ref={box} tabIndex={-1} className="p-4 sm:p-5 outline-none" role="group" aria-label={`${detail.title}, detail`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); save(limit + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)); }
      }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 me-auto">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{detail.title}</h3>
          <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{detail.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the detail" className="w-8 h-8 shrink-0 rounded-lg grid place-items-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><X className="w-4 h-4" /></button>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex flex-col">
          <span className="flex items-baseline gap-1.5">
            <Roll value={cell.value} digits={cell.digits} className="font-mono text-4xl font-light tracking-tight text-zinc-900 dark:text-white" />
            {cell.unit && <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{cell.unit}</span>}
          </span>
          {ch !== null && <span className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{ch >= 0 ? '↑' : '↓'} {fmt(Math.abs(ch), 1)} % on the period before</span>}
          <dl className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/[0.06] font-mono text-xs">
            {([['Average', s.avg], ['Lowest', s.min], ['Highest', s.max], ['95th percentile', s.p95]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="flex justify-between py-2"><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{fmt(v)}</dd></div>
            ))}
            {detail.extra?.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{v}</dd></div>)}
          </dl>
          <p className="mt-auto pt-4 font-mono text-[10px] text-zinc-500 dark:text-zinc-400 hidden md:block"><Key>↑</Key><Key>↓</Key> move the limit<br /><Key>Esc</Key> closes the detail</p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300"><span className={cn('w-1.5 h-1.5 rounded-full', over ? 'bg-[var(--ins-hot)]' : 'bg-zinc-400 dark:bg-zinc-300')} />{over ? 'Over the limit' : 'Within the limit'}</span>
            {ranges && range && onRange && <span className="ms-auto"><Chips ranges={ranges} range={range} onRange={onRange} id={`${storageKey}-detail`} /></span>}
          </div>
          <DetailChart series={detail.series} labels={detail.labels} unit={cell.unit} top={top} ticks={ticks} limit={limit} onLimit={save} />
        </div>
      </div>
    </div>
  );
}

const Key = ({ children }: { children: ReactNode }) => <kbd className="inline-grid place-items-center min-w-5 h-5 px-1 me-1 rounded border border-zinc-300 dark:border-white/15 text-[10px]">{children}</kbd>;

/** The big line: y ticks, a crosshair that reads the nearest point, and the draggable limit line. */
export function DetailChart({ series, labels, unit, top, ticks, limit, onLimit, height = 220 }: {
  series: number[]; labels: string[]; unit?: string; top: number; ticks: number[]; limit?: number; onLimit?: (v: number) => void; height?: number;
}) {
  const fillId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const L = 40, B = 22, T = 8, iw = w - L - 8, ih = height - B - T;
  const pts = points(series.length ? series : [0, 0], iw, ih, 0, top);
  const yOf = (v: number) => T + ih - (v / top) * ih;
  const vOf = (y: number) => ((T + ih - y) / ih) * top;
  const end = pts[pts.length - 1];
  const every = Math.max(1, Math.ceil(labels.length / 6));
  const at = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = clientX - r.left - L;
    const i = Math.round((x / iw) * (series.length - 1));
    return Math.max(0, Math.min(series.length - 1, i));
  };
  const hp = hover !== null ? pts[hover] : null;
  return (
    <div ref={wrap} className="relative select-none touch-pan-y text-zinc-800 dark:text-zinc-100"
      onPointerMove={(e) => {
        if (drag.current && onLimit) { const r = wrap.current!.getBoundingClientRect(); onLimit(vOf(e.clientY - r.top)); return; }
        setHover(at(e.clientX));
      }}
      onPointerLeave={() => setHover(null)} onPointerUp={() => { drag.current = false; }}>
      <svg width={w} height={height} className="block overflow-visible" role="img" aria-label={`Line of ${series.length} points, highest ${fmt(Math.max(...series, 0))}${unit ? ` ${unit}` : ''}`}>
        <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.16" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={L + iw} y1={yOf(t)} y2={yOf(t)} stroke="currentColor" strokeOpacity="0.07" />
            <text x={L - 8} y={yOf(t) + 3} textAnchor="end" fontSize="10" className="fill-current font-mono" opacity="0.5">{fmt(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && (
          <text key={i} x={L + (labels.length > 1 ? (i / (labels.length - 1)) * iw : 0)} y={height - 6} textAnchor="middle" fontSize="10" className="fill-current font-mono" opacity="0.5">{l}</text>
        ))}
        <g transform={`translate(${L} ${T})`}>
          <path d={areaPath(pts, ih)} fill={`url(#${fillId})`} className="ins-fade" />
          <path key={series.join(',').length} d={linePath(pts)} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.8" className="ins-draw" />
          <g transform={`translate(${end[0]} ${end[1]})`}><circle r="8" className="ins-ping fill-[var(--ins-hot)]" opacity="0.35" /><circle r="3.5" className="fill-[var(--ins-hot)]" /></g>
          {hp && (
            <g>
              <line x1={hp[0]} x2={hp[0]} y1="0" y2={ih} stroke="currentColor" strokeOpacity="0.35" />
              <circle cx={hp[0]} cy={hp[1]} r="4" className="fill-[var(--surface,#fff)] stroke-current" strokeWidth="1.6" />
            </g>
          )}
        </g>
        {limit !== undefined && (
          <line x1={L} x2={L + iw} y1={yOf(limit)} y2={yOf(limit)} className="stroke-[var(--ins-hot)]" strokeDasharray="4 4" strokeWidth="1.3" />
        )}
      </svg>
      {limit !== undefined && onLimit && (
        <button type="button" role="slider" aria-label="Limit" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.round(limit)}
          onPointerDown={(e) => { drag.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) { const r = wrap.current!.getBoundingClientRect(); onLimit(vOf(e.clientY - r.top)); } }}
          onPointerUp={() => { drag.current = false; }}
          className="absolute end-0 -translate-y-1/2 px-2 h-6 rounded-md bg-[var(--ins-hot)] text-white font-mono text-[10px] font-bold shadow-[0_6px_18px_-6px_var(--ins-hot)] cursor-ns-resize touch-none"
          style={{ top: yOf(limit) }}>
          LIMIT {fmt(limit)}
        </button>
      )}
      {hp && hover !== null && (
        <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2 py-1 rounded-md bg-white dark:bg-zinc-100 text-zinc-900 font-mono text-[10px] shadow-lg whitespace-nowrap"
          style={{ left: L + hp[0], top: T + hp[1] - 10 }}>
          {fmt(series[hover])}{unit ? ` ${unit}` : ''} · {labels[hover]}
        </span>
      )}
    </div>
  );
}
