'use client';

import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Copy, Download } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import * as F from '@/lib/lab/filters';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from '@/components/sim/bench-ui';

// Hyperion Signals → Filter designer (M472): pick a response and a method, drag the passband and stopband edges on
// the response and it is redesigned as you drag (the sums are small: microseconds to a few milliseconds, so it runs
// on the page's thread). The shaded areas are the specification; the readouts say whether the design meets it.
// "Open in Code" writes the same design as a script.

type Resp = 'low' | 'high' | 'bandpass' | 'stop';
type Method = 'butter' | 'cheby1' | 'cheby2' | 'ellip' | 'window' | 'equiripple';
type Below = 'delay' | 'impulse' | 'test';
const METHODS: { value: Method; label: string; note: string }[] = [
  { value: 'butter', label: 'Butterworth (IIR)', note: 'The flattest passband; a gentle edge.' },
  { value: 'cheby1', label: 'Chebyshev I (IIR)', note: 'Ripple in the passband buys a sharper edge.' },
  { value: 'cheby2', label: 'Chebyshev II (IIR)', note: 'A flat passband, ripple in the stopband.' },
  { value: 'ellip', label: 'Elliptic (IIR)', note: 'Ripple in both bands: the sharpest edge for its order.' },
  { value: 'window', label: 'Windowed FIR', note: 'Always stable, no phase distortion; needs a higher order.' },
  { value: 'equiripple', label: 'Equiripple FIR', note: 'The smallest even ripple for its order (Parks–McClellan).' },
];
const RESPS: { value: Resp; label: string }[] = [{ value: 'low', label: 'Low-pass' }, { value: 'high', label: 'High-pass' }, { value: 'bandpass', label: 'Band-pass' }, { value: 'stop', label: 'Band-stop' }];
const isFir = (m: Method) => m === 'window' || m === 'equiripple';
const fmtHz = (v: number) => (v >= 1000 ? `${+(v / 1000).toPrecision(3)} kHz` : `${+v.toPrecision(3)} Hz`);
const fmtN = (v: number) => (!Number.isFinite(v) ? '–' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : String(+v.toPrecision(6)));

/** Default edges (fractions of Nyquist): pass and stop, in the order they lie along the axis for the response. */
function defaults(r: Resp): { pass: number[]; stop: number[] } {
  if (r === 'low') return { pass: [0.2], stop: [0.3] };
  if (r === 'high') return { pass: [0.3], stop: [0.2] };
  if (r === 'bandpass') return { pass: [0.3, 0.5], stop: [0.2, 0.6] };
  return { pass: [0.2, 0.6], stop: [0.3, 0.5] };
}
/** The edges' order along the axis (which one must stay below which). */
function sequence(r: Resp, pass: number[], stop: number[]): { key: 'pass' | 'stop'; i: number; v: number }[] {
  const P = (i: number) => ({ key: 'pass' as const, i, v: pass[i] }), S = (i: number) => ({ key: 'stop' as const, i, v: stop[i] });
  return r === 'low' ? [P(0), S(0)] : r === 'high' ? [S(0), P(0)] : r === 'bandpass' ? [S(0), P(0), P(1), S(1)] : [P(0), S(0), S(1), P(1)];
}

interface Design { b: number[]; a: number[]; n: number; zpk?: F.Zpk; estimated?: boolean; error?: string }
function design(resp: Resp, method: Method, pass: number[], stop: number[], rp: number, rs: number, minOrder: boolean, order: number): Design {
  try {
    if (!isFir(method)) {
      const kind = method as F.Kind;
      let n = order, wn = kind === 'cheby2' ? stop : pass;
      if (minOrder) ({ n, wn } = F.order(kind, pass, stop, rp, rs));
      if (n > 40) return { b: [1], a: [1], n, error: `That needs order ${n}: widen the gap between the edges or ask for less attenuation.` };
      const zpk = F.iir(kind, n, wn, resp, rp, rs);
      return { ...F.zpk2tf(zpk), n, zpk };
    }
    // FIR: Kaiser's estimate of the order for the narrowest transition.
    const gap = Math.min(...pass.map((p, i) => Math.abs(p - stop[i]))) / 2;
    let n = order, estimated = false;
    if (minOrder) {
      const dp = (10 ** (rp / 20) - 1) / (10 ** (rp / 20) + 1), ds = 10 ** (-rs / 20), A = -20 * Math.log10(Math.min(dp, ds));
      n = Math.ceil((A - 8) / (2.285 * 2 * Math.PI * gap)); estimated = true;
    }
    if ((resp === 'high' || resp === 'stop' || method === 'equiripple') && n % 2) n += 1;
    n = Math.max(2, n);
    if (n > 400) return { b: [1], a: [1], n, error: `That needs about ${n} taps: widen the gap between the edges.` };
    if (method === 'window') return { b: F.fir1(n, pass.map((p, i) => (p + stop[i]) / 2), resp), a: [1], n, estimated };
    const [f, g] = resp === 'low' ? [[0, pass[0], stop[0], 1], [1, 1, 0, 0]] : resp === 'high' ? [[0, stop[0], pass[0], 1], [0, 0, 1, 1]] : resp === 'bandpass' ? [[0, stop[0], pass[0], pass[1], stop[1], 1], [0, 0, 1, 1, 0, 0]] : [[0, pass[0], stop[0], stop[1], pass[1], 1], [1, 1, 0, 0, 1, 1]];
    // Weight the stopband by how much smaller its ripple must be than the passband's.
    const dp = (10 ** (rp / 20) - 1) / (10 ** (rp / 20) + 1), ds = 10 ** (-rs / 20), wt = Array.from({ length: f.length / 2 }, (_, k) => (g[2 * k] === 0 ? dp / ds : 1));
    return { b: F.firpm(n, f, g, wt).h, a: [1], n, estimated };
  } catch (e) { return { b: [1], a: [1], n: order, error: (e as Error).message }; }
}

/** Matching MATLAB code for the design (fs in Hz). */
function script(resp: Resp, method: Method, pass: number[], stop: number[], rp: number, rs: number, fs: number, d: Design): string {
  const hz = (v: number[]) => (v.length > 1 ? `[${v.map((x) => +(x * fs / 2).toPrecision(6)).join(' ')}]` : `${+(v[0] * fs / 2).toPrecision(6)}`);
  const type = resp === 'low' ? '' : resp === 'high' ? ", 'high'" : resp === 'stop' ? ", 'stop'" : '';
  const head = `% Designed in Hyperion's Filter designer\nfs = ${fs};                        % sample rate (Hz)\nWp = ${hz(pass)}/(fs/2); Ws = ${hz(stop)}/(fs/2);   % passband and stopband edges, as fractions of fs/2\nRp = ${rp}; Rs = ${rs};               % passband ripple and stopband attenuation (dB)\n`;
  let body: string;
  if (method === 'butter') body = `[n, Wn] = buttord(Wp, Ws, Rp, Rs);\n[b, a] = butter(n, Wn${type});\n`;
  else if (method === 'cheby1') body = `[n, Wn] = cheb1ord(Wp, Ws, Rp, Rs);\n[b, a] = cheby1(n, Rp, Wn${type});\n`;
  else if (method === 'cheby2') body = `[n, Wn] = cheb2ord(Wp, Ws, Rp, Rs);\n[b, a] = cheby2(n, Rs, Wn${type});\n`;
  else if (method === 'ellip') body = `[n, Wn] = ellipord(Wp, Ws, Rp, Rs);\n[b, a] = ellip(n, Rp, Rs, Wn${type});\n`;
  else if (method === 'window') body = `b = fir1(${d.n}, (Wp + Ws)/2${type}); a = 1;\n`;
  else {
    const f = resp === 'low' ? '[0 Wp Ws 1]' : resp === 'high' ? '[0 Ws Wp 1]' : resp === 'bandpass' ? '[0 Ws(1) Wp(1) Wp(2) Ws(2) 1]' : '[0 Wp(1) Ws(1) Ws(2) Wp(2) 1]';
    const g = resp === 'low' ? '[1 1 0 0]' : resp === 'high' ? '[0 0 1 1]' : resp === 'bandpass' ? '[0 0 1 1 0 0]' : '[1 1 0 0 1 1]';
    body = `b = firpm(${d.n}, ${f}, ${g}); a = 1;\n`;
  }
  return `${head}${body}freqz(b, a, 1024, fs)\n% Try it: a tone in the passband and one in the stopband, with noise\nt = (0:4*fs-1)/fs;\nx = sin(2*pi*${+((pass[0] * fs) / 2 * (resp === 'high' ? 1.2 : 0.6)).toPrecision(4)}*t) + sin(2*pi*${+((stop[0] * fs) / 2 * (resp === 'low' ? 1.3 : resp === 'high' ? 0.6 : 1)).toPrecision(4)}*t) + 0.1*randn(size(t));\nfigure; pwelch(x, 1024, 512, 1024, fs); hold on\n[p, f] = pwelch(filtfilt(b, a, x), 1024, 512, 1024, fs); plot(f, 10*log10(p)); hold off\nlegend('before', 'after')\n`;
}

const W = 1000, H = 1000;
export function FilterDesigner() {
  const dark = useDarkMode(), router = useRouter();
  const [resp, setRespNow] = useState<Resp>('low');
  const [method, setMethod] = useState<Method>('ellip');
  const [fs, setFs] = useState(8000);
  const [edges, setEdges] = useState(() => defaults('low'));
  const [rp, setRp] = useState(1);
  const [rs, setRs] = useState(60);
  const [minOrder, setMinOrder] = useState(true);
  const [order, setOrder] = useState(8);
  const [below, setBelow] = useState<Below>('delay');
  const [copied, setCopied] = useState(false);
  const plot = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: 'pass' | 'stop'; i: number } | null>(null);
  const setResp = (r: Resp) => { setRespNow(r); setEdges(defaults(r)); };

  const d = useMemo(() => design(resp, method, edges.pass, edges.stop, rp, rs, minOrder, order), [resp, method, edges, rp, rs, minOrder, order]);
  const N = 512, w = useMemo(() => Array.from({ length: N + 1 }, (_, k) => (Math.PI * k) / N), []);
  const db = useMemo(() => F.response(d.b, d.a, w).map((c) => Math.max(-140, 20 * Math.log10(Math.hypot(c[0], c[1]) || 1e-12))), [d, w]);
  // Measured against the specification: the worst passband dip and the weakest stopband attenuation.
  const meets = useMemo(() => {
    const inPass = (f: number) => (resp === 'low' ? f <= edges.pass[0] : resp === 'high' ? f >= edges.pass[0] : resp === 'bandpass' ? f >= edges.pass[0] && f <= edges.pass[1] : f <= edges.pass[0] || f >= edges.pass[1]);
    const inStop = (f: number) => (resp === 'low' ? f >= edges.stop[0] : resp === 'high' ? f <= edges.stop[0] : resp === 'bandpass' ? f <= edges.stop[0] || f >= edges.stop[1] : f >= edges.stop[0] && f <= edges.stop[1]);
    let pmin = Infinity, pmax = -Infinity, smax = -Infinity;
    db.forEach((v, k) => { const f = k / N; if (inPass(f)) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); } if (inStop(f)) smax = Math.max(smax, v); });
    return { ripple: pmax - pmin, atten: -smax, ok: pmax - pmin <= rp + 0.01 && -smax >= rs - 0.01 };
  }, [db, edges, resp, rp, rs]);
  const stable = !d.zpk || d.zpk.p.every((p) => Math.hypot(p[0], p[1]) < 1);

  const lo = -Math.max(rs + 30, 80), X = (f: number) => f * W, Y = (v: number) => ((0 + 6 - v) / (6 - lo)) * H;
  const seq = sequence(resp, edges.pass, edges.stop);
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const g = drag.current, el = plot.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect(), f = Math.min(0.995, Math.max(0.005, (e.clientX - r.left) / r.width));
    const k = seq.findIndex((s) => s.key === g.key && s.i === g.i), lower = k > 0 ? seq[k - 1].v + 0.01 : 0.005, upper = k < seq.length - 1 ? seq[k + 1].v - 0.01 : 0.995;
    const v = Math.min(upper, Math.max(lower, f));
    setEdges((old) => ({ ...old, [g.key]: old[g.key].map((x, i) => (i === g.i ? +v.toFixed(4) : x)) }));
  };
  const nudge = (key: 'pass' | 'stop', i: number, dir: number) => {
    const k = seq.findIndex((s) => s.key === key && s.i === i), lower = k > 0 ? seq[k - 1].v + 0.01 : 0.005, upper = k < seq.length - 1 ? seq[k + 1].v - 0.01 : 0.995;
    setEdges((old) => ({ ...old, [key]: old[key].map((x, j) => (j === i ? +Math.min(upper, Math.max(lower, x + dir * 0.005)).toFixed(4) : x)) }));
  };

  const code = script(resp, method, edges.pass, edges.stop, rp, rs, fs, d);
  const openInCode = async () => router.push(`/hyperion#${await shareFragment({ name: 'my_filter.m', code, view: 'code' })}`);
  const copy = async () => { try { await navigator.clipboard.writeText(`b = [${d.b.map(fmtN).join(' ')}];\na = [${d.a.map(fmtN).join(' ')}];\n`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ } };
  const download = () => {
    const rows = Array.from({ length: Math.max(d.b.length, d.a.length) }, (_, k) => `${k},${d.b[k] ?? ''},${d.a[k] ?? ''}`);
    const url = URL.createObjectURL(new Blob([`k,b,a\n${rows.join('\n')}\n`], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'filter.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const accent = dark ? '#a78bfa' : '#7c3aed', ink = dark ? '#e4e4e7' : '#27272a', okFill = dark ? '#4ade80' : '#16a34a', badFill = dark ? '#f87171' : '#dc2626';
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const { label, small } = ui;
  const passBands = resp === 'low' ? [[0, edges.pass[0]]] : resp === 'high' ? [[edges.pass[0], 1]] : resp === 'bandpass' ? [[edges.pass[0], edges.pass[1]]] : [[0, edges.pass[0]], [edges.pass[1], 1]];
  const stopBands = resp === 'low' ? [[edges.stop[0], 1]] : resp === 'high' ? [[0, edges.stop[0]]] : resp === 'bandpass' ? [[0, edges.stop[0]], [edges.stop[1], 1]] : [[edges.stop[0], edges.stop[1]]];

  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[32rem] gap-3">
      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Filter specification" data-no-motion>
        <label className={label}>Response
          <select value={resp} onChange={(e) => setResp(e.target.value as Resp)} className="input mt-1 w-full">
            {RESPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className={label}>Method
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="input mt-1 w-full">
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <span className="mt-1 block font-normal text-zinc-500 dark:text-zinc-400">{METHODS.find((m) => m.value === method)?.note}</span>
        </label>
        <NumField label="Sample rate" unit="Hz" value={fs} min={1} onChange={(v) => setFs(Math.max(1, v))} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Passband ripple" unit="dB" value={rp} min={0.01} onChange={(v) => setRp(Math.min(Math.max(0.01, v), rs - 1))} />
          <NumField label="Stopband down" unit="dB" value={rs} min={1} onChange={(v) => setRs(Math.max(rp + 1, Math.min(150, v)))} />
        </div>
        <fieldset className="space-y-1">
          <legend className={label}>Edges <span className="font-normal text-zinc-500 dark:text-zinc-400">(drag them on the response, or type)</span></legend>
          {seq.map((s) => (
            <div key={`${s.key}${s.i}`} className="grid grid-cols-[1fr_auto] items-end gap-1">
              <NumField label={`${s.key === 'pass' ? 'Passband' : 'Stopband'} edge${edges[s.key].length > 1 ? ` ${s.i + 1}` : ''}`} unit="Hz" value={+((s.v * fs) / 2).toPrecision(6)}
                onChange={(hz) => { const k = seq.indexOf(s), lower = k > 0 ? seq[k - 1].v + 0.01 : 0.005, upper = k < seq.length - 1 ? seq[k + 1].v - 0.01 : 0.995; setEdges((o) => ({ ...o, [s.key]: o[s.key].map((x, j) => (j === s.i ? Math.min(upper, Math.max(lower, (2 * hz) / fs)) : x)) })); }} />
            </div>
          ))}
        </fieldset>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={minOrder} onChange={(e) => setMinOrder(e.target.checked)} className="h-4 w-4 accent-violet-600" />The smallest order that meets it</label>
          {!minOrder && <NumField label="Order" value={order} min={1} onChange={(v) => setOrder(Math.max(1, Math.min(isFir(method) ? 400 : 40, Math.round(v))))} />}
        </div>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="Response" data-no-motion>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
          <span>Order <b className="font-mono tabular-nums">{d.n}</b>{d.estimated ? ' (estimated)' : ''}</span>
          <span>Passband ripple <b className="font-mono tabular-nums">{meets.ripple.toFixed(2)} dB</b></span>
          <span>Stopband down <b className="font-mono tabular-nums">{Number.isFinite(meets.atten) ? meets.atten.toFixed(1) : '–'} dB</b></span>
          <span className={cn('rounded-md px-1.5 py-0.5 font-medium', meets.ok && !d.error ? 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200')}>{d.error ? 'Not designed' : meets.ok ? 'Meets the specification' : 'Misses the specification'}</span>
          {!stable && <span className="rounded-md bg-red-100 px-1.5 py-0.5 font-medium text-red-900 dark:bg-red-500/15 dark:text-red-200">Unstable</span>}
        </div>
        {d.error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{d.error}</p>}
        <div className="flex min-h-0 flex-[3] gap-1.5">
          <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-end font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden><span>+6 dB</span><span>{Math.round((6 + lo) / 2)}</span><span>{lo} dB</span></div>
          <svg ref={plot} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full min-w-0 flex-1 touch-none select-none rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img"
            aria-label={`Magnitude response of the ${METHODS.find((m) => m.value === method)?.label} filter, order ${d.n}`}
            onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            {ticks.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={H} stroke={ink} opacity={0.08} vectorEffect="non-scaling-stroke" />)}
            {[0, -20, -40, -60, -80, -100, -120].filter((v) => v > lo).map((v) => <line key={v} x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke={ink} opacity={0.08} vectorEffect="non-scaling-stroke" />)}
            {passBands.map(([a, b]) => <rect key={`p${a}`} x={X(a)} width={X(b) - X(a)} y={Y(0)} height={Y(-rp) - Y(0)} fill={okFill} opacity={0.22} />)}
            {stopBands.map(([a, b]) => <rect key={`s${a}`} x={X(a)} width={X(b) - X(a)} y={0} height={Y(-rs)} fill={badFill} opacity={0.1} />)}
            <path d={db.map((v, k) => `${k ? 'L' : 'M'}${X(k / N).toFixed(1)},${Y(v).toFixed(1)}`).join('')} fill="none" stroke={accent} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {seq.map((s) => (
              <g key={`${s.key}${s.i}`}>
                <line x1={X(s.v)} x2={X(s.v)} y1={0} y2={H} stroke={s.key === 'pass' ? okFill : badFill} strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                <rect x={X(s.v) - 14} width={28} y={0} height={H} fill="transparent" className="cursor-ew-resize"
                  onPointerDown={(e) => { drag.current = { key: s.key, i: s.i }; plot.current?.setPointerCapture(e.pointerId); }} />
              </g>
            ))}
          </svg>
        </div>
        <div className="ms-[3.375rem] flex justify-between font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden>{ticks.map((t) => <span key={t}>{fmtHz((t * fs) / 2)}</span>)}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <span>Move an edge with the keys:</span>
          {seq.map((s) => (
            <span key={`${s.key}${s.i}`} className="inline-flex items-center gap-0.5">
              <button type="button" className={small} onClick={() => nudge(s.key, s.i, -1)} aria-label={`${s.key === 'pass' ? 'Passband' : 'Stopband'} edge ${s.i + 1} lower`}>‹</button>
              <span className="font-mono tabular-nums">{fmtHz((s.v * fs) / 2)}</span>
              <button type="button" className={small} onClick={() => nudge(s.key, s.i, 1)} aria-label={`${s.key === 'pass' ? 'Passband' : 'Stopband'} edge ${s.i + 1} higher`}>›</button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <Segmented<Below> label="Also show" value={below} onChange={setBelow} segments={[{ value: 'delay', label: 'Group delay' }, { value: 'impulse', label: 'Impulse response' }, { value: 'test', label: 'On a test signal' }]} />
        </div>
        <div className="min-h-0 flex-[2]"><Lower below={below} d={d} fs={fs} edges={edges} resp={resp} colour={accent} ink={ink} /></div>
      </section>

      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Coefficients and code" data-no-motion>
        <div>
          <p className={label}>Coefficients</p>
          <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-zinc-50 p-2 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-100">{`b = [${d.b.slice(0, 60).map(fmtN).join('\n     ')}${d.b.length > 60 ? '\n     …' : ''}]\na = [${d.a.map(fmtN).join('\n     ')}]`}</pre>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={small} onClick={() => void copy()}><Copy className="h-3.5 w-3.5" aria-hidden />{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" className={small} onClick={download}><Download className="h-3.5 w-3.5" aria-hidden />CSV</button>
          <button type="button" className={small} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{isFir(method) ? `${d.b.length} taps; the delay through it is ${(d.n / 2 / fs * 1000).toPrecision(3)} ms at every frequency.` : `${d.n} poles${d.zpk ? `, the largest ${Math.max(...d.zpk.p.map((p) => Math.hypot(p[0], p[1]))).toFixed(4)} from the centre (under 1 is stable)` : ''}. In code: filter(b, a, x), or filtfilt(b, a, x) for no delay.`}</p>
        <div className="mt-auto border-t border-zinc-200/80 pt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Green: the passband may dip at most the ripple; red: the stopband must stay below its line. Frequencies run to half the sample rate (Nyquist).</div>
      </aside>
    </div>
  );
}

/** The panel under the response: group delay, impulse response, or a test signal's spectrum before and after. */
function Lower({ below, d, fs, edges, resp, colour, ink }: { below: Below; d: Design; fs: number; edges: { pass: number[]; stop: number[] }; resp: Resp; colour: string; ink: string }) {
  const data = useMemo(() => {
    if (below === 'delay') {
      const w = Array.from({ length: 256 }, (_, k) => (Math.PI * k) / 256), g = F.groupDelay(d.b, d.a, w);
      return { series: [{ x: w.map((x) => (x / Math.PI) * (fs / 2)), y: g.map((v) => (v / fs) * 1000), colour }], xl: 'Hz', yl: 'Delay (ms)' };
    }
    if (below === 'impulse') {
      const L = Math.min(400, Math.max(64, d.b.length * 2)), x = new Float64Array(L); x[0] = 1;
      const y = F.lfilter(d.b, d.a, x).y;
      return { series: [{ x: Array.from({ length: L }, (_, k) => (k / fs) * 1000), y: [...y], colour }], xl: 'Time (ms)', yl: 'Response' };
    }
    // A tone in the passband, one in the stopband, and noise (a fixed seed, so it doesn't flicker while dragging).
    let s = 7;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32) - 0.5;
    const fp = resp === 'high' ? (edges.pass[0] + 1) / 2 : resp === 'bandpass' ? (edges.pass[0] + edges.pass[1]) / 2 : edges.pass[0] / 2;
    const fsb = resp === 'low' ? (edges.stop[0] + 1) / 2 : resp === 'high' || resp === 'bandpass' ? edges.stop[0] / 2 : (edges.stop[0] + edges.stop[1]) / 2;
    const n = 8192, x = Array.from({ length: n }, (_, k) => Math.sin(Math.PI * fp * k) + Math.sin(Math.PI * fsb * k) + 0.2 * rnd());
    const win = F.hammingW(512), before = F.welch(x, win, 256, 512, fs), after = F.welch(F.lfilter(d.b, d.a, x).y, win, 256, 512, fs);
    return { series: [{ x: before.f, y: before.pxx.map((p) => 10 * Math.log10(p || 1e-30)), colour: ink, dash: true }, { x: after.f, y: after.pxx.map((p) => 10 * Math.log10(p || 1e-30)), colour }], xl: 'Hz (dashed: before; line: after)', yl: 'dB/Hz' };
  }, [below, d, fs, edges, resp, colour, ink]);
  const all = data.series.flatMap((s) => s.y).filter(Number.isFinite), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
  const x1 = Math.max(...data.series[0].x) || 1, X = (x: number) => (x / x1) * 1000, Y = (y: number) => (1 - (y - lo + pad) / (hi - lo + 2 * pad)) * 1000;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-end font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden><span>{fmtN(+hi.toPrecision(3))}</span><span>{data.yl}</span><span>{fmtN(+lo.toPrecision(3))}</span></div>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="h-full min-w-0 flex-1 rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={below === 'delay' ? 'Group delay' : below === 'impulse' ? 'Impulse response' : 'A test signal’s spectrum before and after the filter'}>
          {data.series.map((s, i) => <path key={i} d={s.x.map((x, k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Number.isFinite(s.y[k]) ? s.y[k] : lo).toFixed(1)}`).join('')} fill="none" stroke={s.colour} strokeWidth={1.6} strokeDasharray={'dash' in s && s.dash ? '6 5' : undefined} vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
      <div className="ms-[3.375rem] flex justify-between pt-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden><span>0</span><span className="font-sans">{data.xl}</span><span>{fmtN(+x1.toPrecision(3))}</span></div>
    </div>
  );
}
