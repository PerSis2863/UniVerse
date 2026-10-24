'use client';

import { useEffect, useId, useRef } from 'react';
import { animate } from 'framer-motion';
import { areaPath, fmt, linePath, points } from '@/lib/instruments';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';

// The small instruments inside a board's cells (the owner's "Instrumental" reference, 24 Oct 2026):
// a line with a glowing end, a histogram with its p95, an error strip, a dial, stacked bars, an
// hourglass, a ring, a two-way line and a slot meter. Plain SVG drawn in the text colour, with the
// hot pink (--ins-hot) for what matters; they animate in with transform and opacity only (.ins-*
// in globals.css), and Reduce Motion leaves them still.

/** A number that rolls to its new value (decimals kept). */
export function Roll({ value, digits, className }: { value: number; digits?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => { el.textContent = fmt(v, digits ?? (Number.isInteger(value) ? 0 : undefined)); };
    const from = shown.current ?? 0;
    shown.current = value;
    if (reducedMotion()) return void write(value);
    const c = animate(from, value, { duration: from ? 0.7 : 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: write });
    return () => c.stop();
  }, [value, digits]);
  return <span ref={ref} className={cn('tabular-nums', className)}>{fmt(value, digits)}</span>;
}

/** A line over a soft fill, drawn left to right, with a glowing dot at the latest value. */
export function Spark({ values, height = 64, className }: { values: number[]; height?: number; className?: string }) {
  const id = useId();
  const W = 300, H = height;
  const pts = points(values.length ? values : [0, 0], W, H - 8, 0, Math.max(1, ...values) * 1.15);
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('w-full overflow-visible', className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.18" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
      </defs>
      <g transform="translate(0 4)">
        <path d={areaPath(pts, H - 8)} fill={`url(#${id}f)`} className="ins-fade" />
        <path d={linePath(pts)} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className="ins-draw" />
      </g>
      <EndDot x={end[0]} y={end[1] + 4} />
    </svg>
  );
}

/** The glowing hot-pink dot at the end of a line (a soft ring breathes round it). */
function EndDot({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="7" className="ins-ping fill-[var(--ins-hot)]" opacity="0.35" />
      <circle r="3.2" className="fill-[var(--ins-hot)]" />
    </g>
  );
}

/** Columns of a distribution; the marked bin (e.g. p95) gets a hot-pink line and label. */
export function Histo({ bins, marker, label, height = 84 }: { bins: number[]; marker: number; label?: string; height?: number }) {
  const max = Math.max(1, ...bins);
  const W = 300, gap = 2, bw = (W - gap * (bins.length - 1)) / bins.length;
  return (
    <svg viewBox={`0 0 ${W} ${height + 14}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height: height + 14 }} aria-hidden>
      <line x1="0" x2={W} y1={height} y2={height} stroke="currentColor" strokeOpacity="0.15" vectorEffect="non-scaling-stroke" />
      {bins.map((c, i) => {
        const h = Math.max(c ? 2 : 0.5, (c / max) * (height - 6));
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="1" fill="currentColor" opacity={i > marker && marker >= 0 ? 0.25 : 0.85} className="ins-rise" style={{ animationDelay: `${i * 14}ms` }} />;
      })}
      {marker >= 0 && (
        <g transform={`translate(${marker * (bw + gap) + bw / 2} 0)`}>
          <line y1="0" y2={height} className="stroke-[var(--ins-hot)]" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {label && <text y={height + 12} textAnchor="middle" className="fill-[var(--ins-hot)] font-mono" fontSize="10">{label}</text>}
        </g>
      )}
    </svg>
  );
}

/** Rows of small cells (e.g. 4xx, 5xx, app errors per slice); the busiest glow hot pink. */
export function HeatStrip({ rows, foot }: { rows: { label: string; values: number[] }[]; foot?: [string, string] }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {rows.map((r, ri) => {
        // Each row against its own busiest slice; only the real spikes glow.
        const max = Math.max(1, ...r.values);
        const avg = r.values.reduce((a, b) => a + b, 0) / (r.values.length || 1);
        return (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-9 shrink-0 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{r.label}</span>
          <div className="flex-1 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${r.values.length}, minmax(0, 1fr))` }}>
            {r.values.map((v, i) => {
              const t = v / max;
              const hot = v > 0 && t > 0.8 && v > avg * 1.4;
              return <span key={i} className={cn('h-5 rounded-[3px] ins-pop', hot ? 'bg-[var(--ins-hot)]' : 'bg-current')}
                style={{ opacity: hot ? 0.6 + t * 0.4 : 0.12 + t * 0.55, animationDelay: `${ri * 60 + i * 8}ms` }} />;
            })}
          </div>
        </div>
        );
      })}
      {foot && <div className="flex justify-between ps-11 font-mono text-[10px] text-zinc-500 dark:text-zinc-400"><span>{foot[0]}</span><span>{foot[1]}</span></div>}
    </div>
  );
}

/** A half-circle dial with ticks, a needle that swings to the value and a hot-pink zone at the top. */
export function Dial({ value, max, danger = 0.85, labels = true }: { value: number; max: number; danger?: number; labels?: boolean }) {
  const t = Math.max(0, Math.min(1, max ? value / max : 0));
  const ticks = Array.from({ length: 31 }, (_, i) => i / 30);
  const R = 62;
  const at = (f: number, r: number) => { const a = Math.PI * (1 - f); return [80 + r * Math.cos(a), 78 - r * Math.sin(a)]; };
  return (
    <svg viewBox="0 0 160 96" className="w-full max-w-[220px] mx-auto overflow-visible" aria-hidden>
      {ticks.map((f) => {
        const [x1, y1] = at(f, R), [x2, y2] = at(f, f % 0.1 < 0.01 || f > 0.99 ? R - 9 : R - 5);
        return <line key={f} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={f >= danger ? 2 : 1.2} className={f >= danger ? 'stroke-[var(--ins-hot)]' : 'stroke-current'} strokeOpacity={f <= t || f >= danger ? 0.9 : 0.25} strokeLinecap="round" />;
      })}
      <g className="ins-needle" style={{ transform: `rotate(${-90 + t * 180}deg)`, transformOrigin: '80px 78px' }}>
        <line x1="80" y1="78" x2="80" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="80" cy="26" r="2.6" className="fill-[var(--ins-hot)]" />
      </g>
      <circle cx="80" cy="78" r="4.5" className="fill-[var(--surface,#fff)] stroke-current" strokeWidth="1.6" />
      {labels && <><text x="18" y="94" fontSize="9" className="fill-current font-mono" opacity="0.55">0</text><text x="142" y="94" fontSize="9" textAnchor="end" className="fill-current font-mono" opacity="0.55">{fmt(max)}</text></>}
    </svg>
  );
}

/** Stacked columns of two series (e.g. messages on top of page views), the newest with a pink dot. */
export function Stack({ a, b, height = 70 }: { a: number[]; b: number[]; height?: number }) {
  const n = Math.max(a.length, b.length);
  const max = Math.max(1, ...Array.from({ length: n }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0)));
  const W = 300, gap = 3, bw = (W - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const ha = ((a[i] ?? 0) / max) * (height - 8), hb = ((b[i] ?? 0) / max) * (height - 8);
        return (
          <g key={i} className="ins-rise" style={{ animationDelay: `${i * 12}ms` }}>
            <rect x={i * (bw + gap)} y={height - hb} width={bw} height={Math.max(1, hb)} rx="1" fill="currentColor" opacity="0.32" />
            <rect x={i * (bw + gap)} y={height - hb - ha} width={bw} height={ha} rx="1" fill="currentColor" opacity="0.9" />
          </g>
        );
      })}
      <circle cx={(n - 1) * (bw + gap) + bw / 2} cy={height - (((a[n - 1] ?? 0) + (b[n - 1] ?? 0)) / max) * (height - 8) - 4} r="3.2" className="fill-[var(--ins-hot)]" />
    </svg>
  );
}

/** An hourglass: sand left on top and gathered below, grains falling while anything waits. */
export function Hourglass({ fill, running = true }: { fill: number; running?: boolean }) {
  const id = useId();
  const t = Math.max(0, Math.min(1, fill));
  return (
    <svg viewBox="0 0 60 100" className="h-24 w-auto overflow-visible" aria-hidden>
      <path d="M8 4 H52 M8 96 H52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6 C12 34 27 42 27 50 C27 58 12 66 12 94 M48 6 C48 34 33 42 33 50 C33 58 48 66 48 94" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.4" />
      <clipPath id={`${id}t`}><path d="M13 7 C13 33 28 42 30 50 C32 42 47 33 47 7 Z" /></clipPath>
      <clipPath id={`${id}b`}><path d="M13 93 C13 67 28 58 30 50 C32 58 47 67 47 93 Z" /></clipPath>
      <rect x="10" width="40" y={7 + 43 * (1 - t)} height={43 * t} className="fill-current ins-sand" opacity="0.75" clipPath={`url(#${id}t)`} />
      <rect x="10" width="40" y={93 - 43 * (1 - t) * 0.9} height={43 * (1 - t) * 0.9} className="fill-current ins-sand" opacity="0.4" clipPath={`url(#${id}b)`} />
      {running && t > 0 && [0, 1, 2].map((i) => <circle key={i} cx="30" cy="52" r="1.1" className="fill-[var(--ins-hot)] ins-grain" style={{ animationDelay: `${i * 0.33}s` }} />)}
    </svg>
  );
}

/** A ring of ticks: the share that's good in the text colour, the rest in hot pink; the value inside. */
export function Ring({ pct, label, size = 112 }: { pct: number; label?: string; size?: number }) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const N = 60;
  return (
    <svg viewBox="0 0 120 120" style={{ width: size, height: size }} aria-hidden>
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2;
        const on = i / N < t;
        return <line key={i} x1={60 + 44 * Math.cos(a)} y1={60 + 44 * Math.sin(a)} x2={60 + 54 * Math.cos(a)} y2={60 + 54 * Math.sin(a)} strokeWidth="2.2" strokeLinecap="round"
          className={cn('ins-pop', on ? 'stroke-current' : 'stroke-[var(--ins-hot)]')} strokeOpacity={on ? 0.9 : 0.85} style={{ animationDelay: `${i * 10}ms` }} />;
      })}
      <text x="60" y="62" textAnchor="middle" fontSize="17" className="fill-current font-mono">{fmt(pct, pct % 1 ? 1 : 0)}</text>
      {label && <text x="60" y="76" textAnchor="middle" fontSize="7.5" letterSpacing="1" className="fill-current font-mono uppercase" opacity="0.55">{label}</text>}
    </svg>
  );
}

/** Two series mirrored round a middle line (e.g. sign-ins above, app opens below). */
export function Mirror({ up, down, height = 80 }: { up: number[]; down: number[]; height?: number }) {
  const id = useId();
  const W = 300, mid = height / 2;
  const max = Math.max(1, ...up, ...down) * 1.1;
  const top = points(up.length ? up : [0, 0], W, mid - 4, 0, max);
  const bot = points(down.length ? down : [0, 0], W, mid - 4, 0, max).map(([x, y]) => [x, height - y] as [number, number]);
  const end = top[top.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }} aria-hidden>
      <defs><linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.2" /><stop offset="0.5" stopColor="currentColor" stopOpacity="0.04" /><stop offset="1" stopColor="currentColor" stopOpacity="0.2" /></linearGradient></defs>
      <path d={`${linePath(top)} L${W},${mid} L0,${mid} Z ${linePath(bot)} L${W},${mid} L0,${mid} Z`} fill={`url(#${id}m)`} className="ins-fade" />
      <path d={linePath(top)} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="ins-draw" />
      <path d={linePath(bot)} pathLength={1} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="ins-draw" />
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="currentColor" strokeOpacity="0.12" vectorEffect="non-scaling-stroke" />
      <EndDot x={end[0]} y={end[1]} />
    </svg>
  );
}

/** A row of slots filled to a share, with 0 / 50 / 100 % under it. */
export function Meter({ pct, slots = 34 }: { pct: number; slots?: number }) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div aria-hidden>
      <div className="flex gap-[3px] h-10">
        {Array.from({ length: slots }, (_, i) => {
          const on = i / slots < t;
          const hot = on && i / slots >= 0.85;
          return <span key={i} className={cn('flex-1 rounded-[2px] ins-rise', hot ? 'bg-[var(--ins-hot)]' : 'bg-current')} style={{ opacity: on ? 0.88 : 0.14, animationDelay: `${i * 16}ms` }} />;
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500 dark:text-zinc-400"><span>0</span><span>50</span><span>100 %</span></div>
    </div>
  );
}

/** Label / value rows beside an instrument (Processed 34 /s …). */
export function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="w-full divide-y divide-zinc-200/70 dark:divide-white/[0.06] font-mono text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="text-zinc-800 dark:text-zinc-100 tabular-nums">{v}</dd></div>
      ))}
    </dl>
  );
}
