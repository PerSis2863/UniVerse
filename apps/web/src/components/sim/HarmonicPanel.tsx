'use client';

import { useMemo } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';
import type { Harmonic } from '@/lib/sim/modal';
import type { HarmonicOut } from './sim.worker';
import { NumField, ui } from './bench-ui';

// Hyperion Simulate → Vibration → Shaking (M442, the owner, 23 Nov: "more advanced vibration analysis"): Ansys's
// harmonic response. The part shaken steadily by its loads or through its supports, swept over a range of frequencies
// with damping; the curve of how far it moves, its resonances, and the part at the chosen frequency.

const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toPrecision(4)} kHz` : `${f.toPrecision(4)} Hz`);
const mm = (v: number) => `${+v.toPrecision(3)} mm`;

/** The sweep as a curve: frequency across, movement up on a log scale; a press picks the frequency shown. */
function SweepChart({ out, onPick }: { out: HarmonicOut; onPick: (hz: number) => void }) {
  const { f, amp } = out.sweep, W = 320, H = 150, L = 34, B = 18;
  const path = useMemo(() => {
    const lo = Math.log10(Math.max(Math.min(...amp.filter((a) => a > 0)), Math.max(...amp) * 1e-5)), hi = Math.log10(Math.max(...amp) || 1);
    const x = (hz: number) => L + ((hz - f[0]) / (f[f.length - 1] - f[0] || 1)) * (W - L - 4);
    const y = (a: number) => 4 + (1 - (Math.log10(Math.max(a, 10 ** lo)) - lo) / (hi - lo || 1)) * (H - B - 4);
    return { d: Array.from(f, (hz, k) => `${k ? 'L' : 'M'}${x(hz).toFixed(1)},${y(amp[k]).toFixed(1)}`).join(''), x, y, lo, hi };
  }, [f, amp]);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    const hz = f[0] + ((px - L) / (W - L - 4)) * (f[f.length - 1] - f[0]);
    onPick(Math.max(f[0], Math.min(f[f.length - 1], hz)));
  };
  const top = out.sweep.peaks.reduce((b, p) => (p.amp > b ? p.amp : b), 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair select-none" onPointerDown={pick} role="img"
      aria-label={`How far the part moves against the shaking frequency, from ${fmtHz(f[0])} to ${fmtHz(f[f.length - 1])}; largest ${mm(top || Math.max(...amp))}.`}>
      {[path.lo, path.hi].map((v, i) => <text key={i} x={L - 4} y={path.y(10 ** v) + (i ? 8 : 0)} textAnchor="end" className="fill-zinc-500 text-[9px] dark:fill-zinc-400">{+(10 ** v).toPrecision(2)}</text>)}
      <text x={L} y={H - 4} className="fill-zinc-500 text-[9px] dark:fill-zinc-400">{fmtHz(f[0])}</text>
      <text x={W - 4} y={H - 4} textAnchor="end" className="fill-zinc-500 text-[9px] dark:fill-zinc-400">{fmtHz(f[f.length - 1])}</text>
      <line x1={L} x2={W - 4} y1={H - B} y2={H - B} className="stroke-zinc-300 dark:stroke-white/20" />
      <line x1={L} x2={L} y1={4} y2={H - B} className="stroke-zinc-300 dark:stroke-white/20" />
      <path d={path.d} fill="none" className="stroke-violet-600 dark:stroke-violet-300" strokeWidth={1.6} />
      <line x1={path.x(out.hz)} x2={path.x(out.hz)} y1={4} y2={H - B} className="stroke-zinc-900 dark:stroke-white" strokeDasharray="3 3" />
    </svg>
  );
}

export function HarmonicPanel({ h, onChange, out, onPick, loads }: { h: Harmonic; onChange: (h: Harmonic) => void; out: HarmonicOut | null; onPick: (hz: number | undefined) => void; loads: number }) {
  const s = out?.sweep;
  const vmMax = out ? Math.max(...out.vm) : 0, swingMax = out ? Math.max(...out.swing) : 0;
  return (
    <div className="space-y-3">
      <div><p className={ui.label}>What shakes it</p>
        <Segmented<Harmonic['drive']> label="What shakes it" value={h.drive} onChange={(v) => { onChange({ ...h, drive: v }); onPick(undefined); }} className="mt-1"
          segments={[{ value: 'loads', label: 'Its loads' }, { value: 'base', label: 'Its supports' }]} /></div>
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{h.drive === 'loads'
        ? `Each load (${loads || 'none yet'}) swings back and forth at the frequency, at its full size: an unbalanced motor, a pump’s pulses.`
        : 'The supports shake the part, the way a machine’s floor or a car’s body shakes what is bolted to it.'}</p>
      {h.drive === 'base' && (
        <div className="space-y-2">
          <div><p className={ui.label}>Direction</p><Segmented<'x' | 'y'> label="Direction" value={h.dir} onChange={(v) => { onChange({ ...h, dir: v }); onPick(undefined); }} segments={[{ value: 'x', label: 'Sideways' }, { value: 'y', label: 'Up and down' }]} className="mt-1" /></div>
          <NumField label="Shaking" unit="g" value={h.g} min={0} onChange={(v) => onChange({ ...h, g: Math.max(0, v) })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Damping" unit="% of critical" value={+(h.zeta * 100).toPrecision(4)} min={0.01} onChange={(v) => onChange({ ...h, zeta: Math.max(0.0001, Math.min(0.5, v / 100)) })} />
        <NumField label="Up to" unit="Hz, 0 = automatic" value={h.fMax} min={0} onChange={(v) => { onChange({ ...h, fMax: Math.max(0, v) }); onPick(undefined); }} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Damping: welded steel about 1 %, bolted 2–5 %, with rubber mounts 10 % or more.</p>
      {out && s && (
        <>
          <div>
            <p className={ui.label}>How far it moves at each frequency <span className="font-normal text-zinc-500 dark:text-zinc-400">(mm; press to look at one)</span></p>
            <SweepChart out={out} onPick={onPick} />
          </div>
          <p className="rounded-lg bg-violet-50 p-2.5 text-xs leading-relaxed text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">
            At <b>{fmtHz(out.hz)}</b> the point that moves most swings <b>{mm(swingMax)}</b> and the stress reaches <b>{+vmMax.toPrecision(3)} MPa</b> over a cycle
            {s.staticAmp > 0 && swingMax > 0 ? `, ${+(swingMax / s.staticAmp).toPrecision(3)} times its movement under the same push held still (${mm(s.staticAmp)})` : ''}.
          </p>
          {s.peaks.length > 0 ? (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Resonance</th><th className="py-1 text-end font-medium">Frequency</th><th className="py-1 text-end font-medium">Movement</th></tr></thead>
              <tbody>
                {[...s.peaks].sort((x, y) => y.amp - x.amp).slice(0, 8).sort((x, y) => x.f - y.f).map((p, i) => (
                  <tr key={i} className={cn('border-t border-zinc-100 dark:border-white/[0.06]', Math.abs(p.f - out.hz) < 1e-9 && 'bg-violet-100/70 dark:bg-violet-900/40')}>
                    <td className="py-1"><button type="button" className="font-medium text-zinc-900 hover:underline dark:text-white" onClick={() => onPick(p.f)}>Mode {p.mode + 1}</button></td>
                    <td className="py-1 text-end font-mono">{fmtHz(p.f)}</td>
                    <td className="py-1 text-end font-mono">{mm(p.amp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-zinc-500 dark:text-zinc-400">No resonance in this range: the shaking is slower than the part’s first natural frequency.</p>}
          <NumField label="Look at" unit="Hz" value={+out.hz.toPrecision(5)} min={0} onChange={(v) => onPick(Math.max(0, v))} />
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">From the part’s lowest {s.modesUsed} modes plus its exact answer when held still. Damping is the same for every mode.</p>
        </>
      )}
    </div>
  );
}
