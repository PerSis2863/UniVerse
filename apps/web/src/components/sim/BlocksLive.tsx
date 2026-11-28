'use client';

import { useEffect, useRef, useState } from 'react';
import { Cpu, Pause, Play, Plug, Unplug } from 'lucide-react';
import { KINDS, type Block, type Diagram } from '@/lib/sim/blocks';
import { RealTime, type Timing } from '@/lib/sim/realtime';
import { serialLink, serialSupported, type LinkState } from '@/components/lab/serial-link';
import { ui } from './bench-ui';
import { fmt, ScopePlot } from './scope-plot';

// Hyperion Simulate → Blocks → Real time (M564): the diagram run against the clock, with its Board blocks reading and
// writing a real Arduino (Web Serial, StandardFirmata) or the simulated one (pin 9's PWM comes back on A5). The live
// scopes show the last ten seconds; the timing line says how well it kept up.

const WINDOW = 10;
const pinIndex = (s: LinkState, name: string) => s.analogMap.indexOf(Number(name.replace(/^A/, '')));

export function BlocksLive({ dg, names, colours }: { dg: Diagram; names: Map<string, string>; colours: string[] }) {
  const [link, setLink] = useState<LinkState>(() => serialLink.state);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<{ t: number[]; scopes: Record<string, number[][]>; now: number; timing: Timing; outs: Record<string, number> } | null>(null);
  const [error, setError] = useState('');
  const frame = useRef(0);
  useEffect(() => serialLink.subscribe((e) => { if (e.state) setLink(e.state); }), []);
  const board = link.open && link.firmata && link.pins.length > 0;
  const ins = dg.blocks.filter((b) => b.kind === 'boardIn'), outs = dg.blocks.filter((b) => b.kind === 'boardOut'), scopes = dg.blocks.filter((b) => b.kind === 'scope');

  const stop = useRef<(() => void) | null>(null);
  const halt = () => { stop.current?.(); stop.current = null; setRunning(false); };
  useEffect(() => () => stop.current?.(), []);
  /** A run starts when Run is pressed, with the diagram as it is then. */
  const start = () => {
    let rt: RealTime;
    const levels: Record<string, number> = {};
    try {
      rt = new RealTime(dg, {
        read: (b: Block) => {
          const s = serialLink.state, i = pinIndex(s, String(b.p.pin));
          return s.open && s.firmata && i >= 0 && s.pins[i] ? (s.pins[i].value / 1023) * Number(b.p.scale ?? 1) : Number(b.p.test ?? 0);
        },
      }, (b, level) => {
        levels[b.id] = level;
        if (!serialLink.state.open || !serialLink.state.firmata) return;
        const pin = Number(b.p.pin);
        void (b.p.mode === 'digital' ? serialLink.digitalWrite(pin, level) : serialLink.analogWrite(pin, level)).catch(() => {});
      });
    } catch (e) { setError((e as Error).message); return; }
    setError('');
    // The board's pins set up for the blocks that use them.
    const s = serialLink.state;
    if (s.open && s.firmata) {
      for (const b of ins) { const i = pinIndex(s, String(b.p.pin)); if (i >= 0) void serialLink.pinMode(i, 'analog').catch(() => {}); }
      for (const b of outs) void serialLink.pinMode(Number(b.p.pin), b.p.mode === 'digital' ? 'output' : 'pwm').catch((e: Error) => setError(e.message));
    }
    const t: number[] = [], buf: Record<string, number[][]> = {};
    let prev = performance.now(), shown = 0;
    const tick = (now: number) => {
      const wall = (now - prev) / 1000;
      prev = now;
      try {
        const smp = rt.advance(wall, Math.max(0, wall * 1000 - 1000 / 60));
        t.push(smp.t);
        for (const [id, v] of Object.entries(smp.scopes)) { buf[id] ??= v.map(() => []); v.forEach((x, i) => buf[id][i].push(x)); }
        while (t.length && t[0] < smp.t - WINDOW) { t.shift(); for (const id in buf) buf[id].forEach((a) => a.shift()); }
        // The page redrawn about 15 times a second (the model runs every frame).
        if (now - shown > 66) { shown = now; setView({ t: t.map((x) => x - Math.max(0, smp.t - WINDOW)), scopes: Object.fromEntries(Object.entries(buf).map(([k, v]) => [k, v.map((a) => [...a])])), now: smp.t, timing: { ...rt.timing }, outs: { ...levels } }); }
      } catch (e) { setError((e as Error).message); stop.current = null; setRunning(false); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    stop.current = () => cancelAnimationFrame(frame.current);
    setRunning(true);
  };

  const rate = view && view.now > 0 ? view.timing.steps / view.now : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-2 text-[13px] dark:border-white/10">
        <Cpu className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
        <span className="me-2" aria-live="polite">{link.open ? `${link.name}${link.firmata ? (board ? ', Firmata ready' : ', starting Firmata…') : ' (not in Firmata mode)'}` : 'No board: Board inputs use their test values'}</span>
        {!link.open ? (
          <>
            <button type="button" className={ui.small} onClick={() => void serialLink.simulate(true)}><Cpu className="h-3.5 w-3.5" aria-hidden />Use the simulated Arduino</button>
            <button type="button" className={ui.small} disabled={!serialSupported()} title={serialSupported() ? undefined : 'Chrome, Edge or Hyperion’s computer app can reach a board'} onClick={() => void serialLink.connect(57600, true)}><Plug className="h-3.5 w-3.5" aria-hidden />Connect a board (StandardFirmata)</button>
          </>
        ) : <button type="button" className={ui.small} onClick={() => { halt(); void serialLink.close(); }}><Unplug className="h-3.5 w-3.5" aria-hidden />Disconnect</button>}
        {link.error && <span className="text-red-700 dark:text-red-400">{link.error}</span>}
        <button type="button" className="btn-primary ms-auto px-3 py-1.5 text-xs" onClick={() => (running ? halt() : start())}>
          {running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{running ? 'Stop' : 'Run in real time'}
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-2">
          {scopes.length === 0 && <p className="text-xs text-zinc-600 dark:text-zinc-300">Add a Scope to watch signals live.</p>}
          {view && scopes.map((s) => (
            <ScopePlot key={s.id} title={`${names.get(s.id)} (last ${WINDOW} s)`} t={view.t} colours={colours}
              traces={Array.from({ length: KINDS.scope.ins(s.p) }, (_, i) => { const w = dg.wires.find((ww) => ww.to === s.id && ww.in === i); return { label: w ? names.get(w.from) ?? `Input ${i + 1}` : `Input ${i + 1}`, v: view.scopes[s.id]?.[i] ?? [] }; })} />
          ))}
          {!view && <p className="text-xs text-zinc-600 dark:text-zinc-300">Run in real time steps the diagram with the clock: one second of model time each second. Board input and Board output blocks (Hardware) read and write the board’s pins: with the plant here and the controller on the board it’s hardware-in-the-loop testing; with the controller here and the machine on the board, rapid control prototyping.</p>}
        </div>
        <div className="space-y-3 text-[13px]">
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">Timing</p>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1" data-live-timing>
              <dt>Model time</dt><dd className="font-mono tabular-nums">{view ? `${fmt(view.now)} s` : '—'}</dd>
              <dt>Steps a second</dt><dd className="font-mono tabular-nums">{view ? Math.round(rate).toLocaleString() : '—'}</dd>
              <dt>Worst late frame</dt><dd className="font-mono tabular-nums">{view ? `${Math.round(view.timing.worstLateMs)} ms` : '—'}</dd>
              <dt>Steps dropped</dt><dd className="font-mono tabular-nums">{view ? view.timing.dropped.toLocaleString() : '—'}</dd>
              <dt>Work a frame</dt><dd className="font-mono tabular-nums">{view ? `${view.timing.turnaroundMs.toFixed(2)} ms` : '—'}</dd>
            </dl>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">Board pins</p>
            {ins.length + outs.length === 0 ? <p className="text-xs text-zinc-600 dark:text-zinc-300">No Board blocks yet: add Board input and Board output (Hardware).</p> : (
              <ul className="space-y-1">
                {ins.map((b) => { const i = pinIndex(link, String(b.p.pin)); return <li key={b.id} className="flex justify-between gap-2"><span>{names.get(b.id)} ← {String(b.p.pin)}</span><span className="font-mono tabular-nums">{board && i >= 0 && link.pins[i] ? link.pins[i].value : `test ${fmt(Number(b.p.test))}`}</span></li>; })}
                {outs.map((b) => <li key={b.id} className="flex justify-between gap-2"><span>{names.get(b.id)} → D{String(b.p.pin)} ({b.p.mode === 'digital' ? 'on/off' : 'PWM'})</span><span className="font-mono tabular-nums">{view?.outs[b.id] ?? '—'}</span></li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
