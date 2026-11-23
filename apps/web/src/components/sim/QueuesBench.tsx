'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Pause, Play, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { mmc, simulate, type Dist, type Result } from '@/lib/sim/des';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from './bench-ui';

// Hyperion Simulate → Queues (M479): discrete-event simulation without code. Describe the arrivals and a line of
// stations (servers, how long each service takes), and the run is redone as you change anything (thousands of
// events take milliseconds). Play shows the stations filling and emptying over time; the statistics say how busy
// each station is and how long people wait, with Erlang's exact answer beside it when a station is M/M/c.

type Kind = 'exp' | 'const' | 'uniform' | 'normal' | 'erlang';
interface Row { name: string; servers: number; kind: Kind; mean: number; capacity: number }
const KINDS: { value: Kind; label: string }[] = [{ value: 'exp', label: 'Random (exponential)' }, { value: 'const', label: 'Always the same' }, { value: 'uniform', label: 'Uniform ±50%' }, { value: 'normal', label: 'Normal (±25%)' }, { value: 'erlang', label: 'Erlang (k = 3)' }];
const dist = (kind: Kind, mean: number): Dist => (kind === 'exp' ? { kind, mean } : kind === 'const' ? { kind, value: mean } : kind === 'uniform' ? { kind, lo: mean / 2, hi: (3 * mean) / 2 } : kind === 'normal' ? { kind, mean, sd: mean / 4 } : { kind, mean, k: 3 });
const distCode = (kind: Kind, mean: number) => (kind === 'exp' ? `{'exp', ${mean}}` : kind === 'const' ? `{'const', ${mean}}` : kind === 'uniform' ? `{'uniform', ${mean / 2}, ${(3 * mean) / 2}}` : kind === 'normal' ? `{'normal', ${mean}, ${mean / 4}}` : `{'erlang', ${mean}, 3}`);
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const COLOURS = { light: ['#7c3aed', '#ea580c', '#16a34a', '#2563eb', '#dc2626', '#0891b2'], dark: ['#a78bfa', '#fb923c', '#4ade80', '#60a5fa', '#f87171', '#22d3ee'] };
const START: Row[] = [{ name: 'Check-in', servers: 2, kind: 'exp', mean: 3, capacity: 0 }, { name: 'Security', servers: 1, kind: 'erlang', mean: 1.2, capacity: 0 }];

export function QueuesBench() {
  const dark = useDarkMode(), router = useRouter(), colours = dark ? COLOURS.dark : COLOURS.light;
  const [arrKind, setArrKind] = useState<Kind>('exp');
  const [arrMean, setArrMean] = useState(1.5);
  const [rows, setRows] = useState<Row[]>(START);
  const [until, setUntil] = useState(480);
  const [seed, setSeed] = useState(1);
  const [at, setAt] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  const result = useMemo((): { r: Result | null; error: string } => {
    try { return { r: simulate({ arrival: dist(arrKind, arrMean), stations: rows.map((s) => ({ name: s.name || 'Station', servers: Math.max(1, Math.round(s.servers)), service: dist(s.kind, s.mean), ...(s.capacity > 0 ? { capacity: Math.round(s.capacity) } : {}) })) }, until, seed, { maxArrivals: 50_000 }), error: '' }; } catch (e) { return { r: null, error: (e as Error).message }; }
  }, [arrKind, arrMean, rows, until, seed]);
  const r = result.r, frames = r?.timeline ?? [], k = Math.min(frames.length - 1, Math.floor(at * (frames.length - 1))), frame = frames[Math.max(0, k)];

  // Play: the time runs through the whole run in about 12 seconds.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 12_000; last = now;
      setAt((v) => { const n = v + dt; if (n >= 1) { setPlaying(false); return 1; } return n; });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const set = (i: number, p: Partial<Row>) => setRows((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const openInCode = async () => router.push(`/hyperion#${await shareFragment({
    name: 'queues.m', view: 'code',
    code: `% Made in Simulate → Queues: arrivals, then ${rows.length} station${rows.length > 1 ? 's' : ''} in a line\narrivals = ${distCode(arrKind, arrMean)};   % time between arrivals\nstations = {${rows.map((s) => `{'${s.name.replace(/'/g, "''")}', ${s.servers}, ${distCode(s.kind, s.mean)}${s.capacity > 0 ? `, ${s.capacity}` : ''}}`).join(', ...\n            ')}};\nr = queuesim(arrivals, stations, ${until}, 'Seed', ${seed});\ndisp(r.Stations)\nfprintf('On average %.2f in the system, %.2f per unit of time through\\n', r.MeanTimeInSystem, r.Throughput)\nqueuesim(arrivals, stations, ${until}, 'Seed', ${seed})   % the figure\n${rows.length === 1 && arrKind === 'exp' && rows[0].kind === 'exp' ? `theory = mmcqueue(1/${arrMean}, 1/${rows[0].mean}, ${rows[0].servers})   % Erlang's exact answer\n` : ''}`,
  })}`);

  const { label, small } = ui;
  const maxQ = Math.max(1, ...frames.flatMap((f) => f.q));
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[32rem] gap-3">
      <aside className="panel flex min-h-0 w-[20rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="The process" data-no-motion>
        <fieldset className="space-y-2">
          <legend className={label}>Arrivals</legend>
          <select value={arrKind} onChange={(e) => setArrKind(e.target.value as Kind)} className="input w-full" aria-label="How arrivals are spread">{KINDS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
          <NumField label="Time between arrivals" unit="mean, minutes" value={arrMean} min={0.01} onChange={(v) => setArrMean(Math.max(0.01, v))} />
        </fieldset>
        {rows.map((s, i) => (
          <fieldset key={i} className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
            <legend className="sr-only">Station {i + 1}</legend>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colours[i % colours.length] }} aria-hidden />
              <input value={s.name} onChange={(e) => set(i, { name: e.target.value.slice(0, 30) })} className="input min-w-0 flex-1" aria-label={`Station ${i + 1}'s name`} />
              <button type="button" className={small} disabled={rows.length <= 1} onClick={() => setRows((all) => all.filter((_, j) => j !== i))} aria-label={`Remove ${s.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Servers" value={s.servers} min={1} onChange={(v) => set(i, { servers: Math.max(1, Math.min(50, Math.round(v))) })} />
              <NumField label="Service" unit="mean, min" value={s.mean} min={0.01} onChange={(v) => set(i, { mean: Math.max(0.01, v) })} />
            </div>
            <select value={s.kind} onChange={(e) => set(i, { kind: e.target.value as Kind })} className="input w-full" aria-label={`How ${s.name}'s service times are spread`}>{KINDS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
            <NumField label="Room to wait" unit="0 = no limit" value={s.capacity} min={0} onChange={(v) => set(i, { capacity: Math.max(0, Math.round(v)) })} />
          </fieldset>
        ))}
        {rows.length < 6 && <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} onClick={() => setRows((all) => [...all, { name: `Station ${all.length + 1}`, servers: 1, kind: 'exp', mean: 1, capacity: 0 }])}><Plus className="h-3.5 w-3.5" aria-hidden />Add a station</button>}
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <NumField label="Run for" unit="minutes" value={until} min={1} onChange={(v) => setUntil(Math.max(1, Math.min(100_000, v)))} />
          <div className="flex items-end"><button type="button" className={small} onClick={() => setSeed((x) => x + 1)}><Shuffle className="h-3.5 w-3.5" aria-hidden />Another day</button></div>
        </div>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="The run" data-no-motion>
        {result.error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{result.error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} onClick={() => { if (at >= 1) setAt(0); setPlaying((p) => !p); }} disabled={!r}>{playing ? <><Pause className="h-3.5 w-3.5" aria-hidden />Pause</> : <><Play className="h-3.5 w-3.5" aria-hidden />Play</>}</button>
          <input type="range" min={0} max={1000} value={Math.round(at * 1000)} onChange={(e) => { setPlaying(false); setAt(Number(e.target.value) / 1000); }} className="min-w-0 flex-1 accent-violet-600" aria-label="Time in the run" aria-valuetext={`${fmt(frame?.t ?? 0, 0)} minutes`} />
          <span className="w-24 text-end font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300" data-sim-time>{fmt(frame?.t ?? 0, 0)} min</span>
        </div>
        <div className="flex min-h-0 flex-[3] items-stretch gap-3" role="img" aria-label={frame ? `At ${fmt(frame.t, 0)} minutes: ${rows.map((s, i) => `${s.name} ${frame.busy[i]} of ${s.servers} busy, ${frame.q[i]} waiting`).join('; ')}` : 'Nothing run yet'}>
          {rows.map((s, i) => {
            const q = frame?.q[i] ?? 0, b = frame?.busy[i] ?? 0, c = colours[i % colours.length];
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200" translate="no">{s.name}</p>
                <div className="flex flex-wrap gap-1.5">{Array.from({ length: Math.min(s.servers, 24) }, (_, j) => <span key={j} className="h-6 w-6 rounded-md border-2" style={{ borderColor: c, background: j < b ? c : 'transparent' }} />)}</div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{b} of {s.servers} busy · {q} waiting</p>
                <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-hidden">{Array.from({ length: Math.min(q, 120) }, (_, j) => <span key={j} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />)}{q > 120 && <span className="text-xs text-zinc-500 dark:text-zinc-400">+{q - 120}</span>}</div>
              </div>
            );
          })}
        </div>
        <div className="min-h-0 flex-[2]">
          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="h-full w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={`People waiting at each station over the run (up to ${maxQ})`}>
            {rows.map((_, i) => <path key={i} d={frames.map((f, j) => `${j ? 'L' : 'M'}${((f.t / (r?.time || 1)) * 1000).toFixed(1)},${(300 - (f.q[i] / maxQ) * 280).toFixed(1)}`).join('')} fill="none" stroke={colours[i % colours.length]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
            <line x1={at * 1000} x2={at * 1000} y1={0} y2={300} stroke={dark ? '#e4e4e7' : '#27272a'} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </section>

      <aside className="panel flex min-h-0 w-[21rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Statistics" data-no-motion>
        {r && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <p>Arrived <b className="block font-mono text-base tabular-nums text-zinc-900 dark:text-white">{r.arrived.toLocaleString()}</b></p>
              <p>Through <b className="block font-mono text-base tabular-nums text-zinc-900 dark:text-white">{r.finished.toLocaleString()}</b></p>
              <p>Time in the system <b className="block font-mono text-base tabular-nums text-zinc-900 dark:text-white" data-stat="system">{fmt(r.meanInSystem)} min</b></p>
              <p>Inside at once <b className="block font-mono text-base tabular-nums text-zinc-900 dark:text-white">{fmt(r.meanWip, 1)}</b></p>
            </div>
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Station</th><th className="py-1 text-end font-medium">Busy</th><th className="py-1 text-end font-medium">Wait</th><th className="py-1 text-end font-medium">Queue</th></tr></thead>
              <tbody>
                {r.stations.map((s, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-white/[0.06]">
                    <td className="py-1"><span className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colours[i % colours.length] }} aria-hidden /><span translate="no">{s.name}</span></td>
                    <td className="py-1 text-end font-mono">{Math.round(100 * s.utilisation)}%</td>
                    <td className="py-1 text-end font-mono">{fmt(s.meanWait)}<span className="text-zinc-500 dark:text-zinc-400"> / {fmt(s.maxWait, 0)}</span></td>
                    <td className="py-1 text-end font-mono">{fmt(s.meanQueue, 1)}<span className="text-zinc-500 dark:text-zinc-400"> / {s.maxQueue}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Wait and queue: the average, then the most. Busy: the share of time its servers worked.{r.stations.some((s) => s.balked) ? ` ${r.stations.reduce((n, s) => n + s.balked, 0)} turned away for want of room.` : ''}</p>
            {arrKind === 'exp' && rows[0].kind === 'exp' && (() => {
              // Erlang's answer for the first station when arrivals and its service are both exponential.
              const s = rows[0], t = mmc(1 / arrMean, 1 / s.mean, s.servers);
              return <p className="rounded-lg bg-zinc-50 p-2.5 text-xs leading-relaxed text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200"><b>{s.name}</b> is an M/M/{s.servers} queue: in the long run it waits {Number.isFinite(t.wq) ? `${fmt(t.wq)} min on average, busy ${Math.round(100 * t.rho)}%` : 'for ever (more arrive than it can serve)'} (Erlang’s formula). A longer run comes closer to it.</p>;
            })()}
            <div className="mt-auto border-t border-zinc-200/80 pt-3"><button type="button" className={small} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button></div>
          </>
        )}
      </aside>
    </div>
  );
}
