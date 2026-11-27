'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Code2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import * as M from '@/lib/lab/mixsig';
import { adcMetrics, inlDnl } from '@/lib/lab/convert';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from './bench-ui';

// Hyperion Simulate → Mixed-signal (M568, the owner, 27 Nov: MathWorks' mixed-signal page, "build this in hyperion"):
// top-down design without code. PLL: a charge-pump loop from its specification (the filter designed for a bandwidth
// and margin), its lock in time and its phase noise. Converters: flash, SAR or pipeline ADCs and binary, thermometer
// or segmented DACs with their mismatch, measured as a testbench would (spectrum, ENOB, INL, DNL). SerDes: a lossy
// channel with FFE, CTLE and DFE, the eye, the bathtub and a CDR. Verification: the same designs as SystemVerilog
// DPI-C blocks and IBIS-AMI models, through Code (dpigen, amigen). Everything is redone as a value changes.

type Tab = 'pll' | 'conv' | 'serdes' | 'verify';
const KEEP = 'uv-mixsig-tab';
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const eng = (x: number, unit: string) => { const p = [[1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M'], [1e9, 'G']] as const; let b: (typeof p)[number] = p[0]; for (const q of p) if (Math.abs(x) >= q[0]) b = q; return `${+(x / b[0]).toPrecision(3)} ${b[1]}${unit}`; };
const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (Math.log10(a) + (Math.log10(b) - Math.log10(a)) * i / (n - 1)));

interface Series { x: number[]; y: number[]; colour: string; dashed?: boolean; label?: string; width?: number; opacity?: number }
/** A small line chart in SVG: linear or log axes, a dashed line at `mark`, its own ticks. */
function Chart({ series, logX, logY, yRange, xLabel, yLabel, mark, title, dark }: { series: Series[]; logX?: boolean; logY?: boolean; yRange?: [number, number]; xLabel: string; yLabel: string; mark?: number; title: string; dark: boolean }) {
  const W = 600, H = 250, L = 52, R = 12, T = 12, B = 34;
  const tx = (v: number) => (logX ? Math.log10(v) : v), ty = (v: number) => (logY ? Math.log10(Math.max(v, 1e-300)) : v);
  const xs = series.flatMap((s) => s.x.map(tx)).filter(Number.isFinite), ys = series.flatMap((s) => s.y.map(ty)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return <p className="text-xs text-zinc-500">Nothing to draw.</p>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let [y0, y1] = yRange ? [ty(yRange[0]), ty(yRange[1])] : [Math.min(...ys), Math.max(...ys)];
  if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; } else if (!yRange) { const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad; }
  const px = (v: number) => L + ((tx(v) - x0) / (x1 - x0 || 1)) * (W - L - R), py = (v: number) => T + (1 - (Math.min(y1, Math.max(y0, ty(v))) - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (a: number, b: number, log?: boolean) => {
    if (log) { const out: number[] = []; for (let e = Math.ceil(a); e <= Math.floor(b); e++) out.push(e); return out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out; }
    const step = 10 ** Math.floor(Math.log10((b - a) / 4 || 1)), m = [1, 2, 5, 10].find((k) => (b - a) / (k * step) <= 6) ?? 10, s = m * step, out: number[] = [];
    for (let v = Math.ceil(a / s) * s; v <= b + 1e-9 * s; v += s) out.push(+v.toPrecision(10)); return out;
  };
  const lbl = (v: number, log?: boolean) => (log ? `1e${v}` : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(0) : String(+v.toPrecision(4)));
  const grid = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', ink = dark ? '#d4d4d8' : '#52525b';
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={`${title}: ${yLabel} against ${xLabel}`}>
        {ticks(x0, x1, logX).map((v) => { const X = L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R); return <g key={`x${v}`}><line x1={X} x2={X} y1={T} y2={H - B} stroke={grid} /><text x={X} y={H - B + 14} fontSize="11" textAnchor="middle" fill={ink}>{lbl(v, logX)}</text></g>; })}
        {ticks(y0, y1, logY).map((v) => { const Y = T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); return <g key={`y${v}`}><line x1={L} x2={W - R} y1={Y} y2={Y} stroke={grid} /><text x={L - 6} y={Y + 4} fontSize="11" textAnchor="end" fill={ink}>{lbl(v, logY)}</text></g>; })}
        {mark !== undefined && <line x1={L} x2={W - R} y1={py(mark)} y2={py(mark)} stroke={ink} strokeDasharray="4 4" />}
        {series.map((s, i) => <polyline key={i} fill="none" stroke={s.colour} strokeWidth={s.width ?? 1.6} strokeOpacity={s.opacity ?? 1} strokeDasharray={s.dashed ? '5 4' : undefined} points={s.x.map((x, j) => (Number.isFinite(s.y[j]) ? `${px(x).toFixed(1)},${py(s.y[j]).toFixed(1)}` : '')).filter(Boolean).join(' ')} />)}
        <text x={(L + W - R) / 2} y={H - 4} fontSize="11" textAnchor="middle" fill={ink}>{xLabel}</text>
        <text x={12} y={(T + H - B) / 2} fontSize="11" textAnchor="middle" fill={ink} transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>
      </svg>
      {series.some((s) => s.label) && <p className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">{series.filter((s) => s.label).map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: s.colour }} aria-hidden />{s.label}</span>)}</p>}
    </figure>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.04]"><p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{value}</p></div>;
}
function Problem({ text }: { text: string }) { return <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{text}</p>; }

export function MixedSignalBench() {
  const [tab, setTabNow] = useState<Tab>(() => { try { return (['conv', 'serdes', 'verify'] as const).find((k) => k === sessionStorage.getItem(KEEP)) ?? 'pll'; } catch { return 'pll'; } });
  const setTab = (k: Tab) => { setTabNow(k); try { sessionStorage.setItem(KEEP, k); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Tab> label="Mixed-signal part" value={tab} onChange={setTab} segments={[{ value: 'pll', label: 'Phase-locked loop' }, { value: 'conv', label: 'Data converters' }, { value: 'serdes', label: 'SerDes links' }, { value: 'verify', label: 'Verification' }]} />
      {tab === 'pll' ? <PllPane /> : tab === 'conv' ? <ConvPane /> : tab === 'serdes' ? <SerdesPane /> : <VerifyPane />}
    </div>
  );
}

function useOpenInCode() {
  const router = useRouter();
  return async (name: string, code: string) => router.push(`/hyperion#${await shareFragment({ name, view: 'code', code })}`);
}
const Layout = ({ side, children }: { side: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex min-h-[32rem] gap-3">
    <aside className="panel flex w-[19rem] shrink-0 flex-col gap-3 self-start p-4" aria-label="Settings" data-no-motion>{side}</aside>
    <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="Results" data-no-motion>{children}</section>
  </div>
);
const CodeButton = ({ onClick }: { onClick: () => void }) => <div className="mt-1 border-t border-zinc-200/80 pt-3 dark:border-white/10"><button type="button" className={ui.small} onClick={onClick}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button></div>;

function PllPane() {
  const dark = useDarkMode(), open = useOpenInCode(), c = dark ? ['#a78bfa', '#fb923c', '#4ade80', '#60a5fa'] : ['#7c3aed', '#ea580c', '#16a34a', '#2563eb'];
  const [s, setS] = useState({ fref: 25, fout: 2400, bw: 500, pm: 55, kvco: 100, icp: 1, ref: -150, vco: -110, cycles: 500 });
  const set = (k: keyof typeof s) => (v: number) => setS((o) => ({ ...o, [k]: v }));
  const q = useDeferredValue(s);
  const r = useMemo(() => {
    try {
      const d = M.pllDesign({ fref: q.fref * 1e6, fout: q.fout * 1e6, bandwidth: q.bw * 1e3, phaseMargin: q.pm, kvco: q.kvco * 1e6, icp: q.icp * 1e-3 });
      const f = logspace(d.bandwidth / 100, Math.min(d.fref / 2, d.bandwidth * 100), 160), b = M.pllBode(d, f);
      const run = M.pllSim(d, { cycles: Math.min(4000, Math.max(50, Math.round(q.cycles))) });
      const fo = logspace(1e3, Math.min(d.fref / 2, 100e6), 160), nz = M.pllNoise(d, fo, { refNoise: q.ref, vcoNoise: q.vco });
      return { d, f, b, run, fo, nz, error: '' };
    } catch (e) { return { error: (e as Error).message }; }
  }, [q]);
  const code = `% Made in Simulate → Mixed-signal → Phase-locked loop
p = plldesign(${s.fref}e6, ${s.fout}e6, ${s.bw}e3, 'PhaseMargin', ${s.pm}, 'Kvco', ${s.kvco}e6, 'Icp', ${s.icp}e-3)
figure; pllsim(p, 'Cycles', ${s.cycles})
figure; pllnoise(p, 'Reference', ${s.ref}, 'VCO', ${s.vco})`;
  return (
    <Layout side={<>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">A charge-pump PLL: the loop filter is designed from what you ask for, then the loop runs edge by edge. A fractional output (not a whole multiple of the reference) uses a sigma-delta divider.</p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Reference" unit="MHz" value={s.fref} onChange={set('fref')} min={0} />
        <NumField label="Output" unit="MHz" value={s.fout} onChange={set('fout')} min={0} />
        <NumField label="Loop bandwidth" unit="kHz" value={s.bw} onChange={set('bw')} min={0} />
        <NumField label="Phase margin" unit="°" value={s.pm} onChange={set('pm')} min={1} />
        <NumField label="VCO gain" unit="MHz/V" value={s.kvco} onChange={set('kvco')} min={0} />
        <NumField label="Pump current" unit="mA" value={s.icp} onChange={set('icp')} min={0} />
        <NumField label="Reference noise" unit="dBc/Hz" value={s.ref} onChange={set('ref')} />
        <NumField label="VCO at 1 MHz" unit="dBc/Hz" value={s.vco} onChange={set('vco')} />
        <NumField label="Periods to run" value={s.cycles} onChange={set('cycles')} min={50} />
      </div>
      <CodeButton onClick={() => void open('pll.m', code)} />
    </>}>
      {'error' in r && r.error ? <Problem text={r.error} /> : 'd' in r && r.d && r.run && r.nz && r.b && r.f && r.fo && <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Fact label="Divider N" value={fmt(r.d.n, 4)} /><Fact label="C1" value={eng(r.d.c1, 'F')} /><Fact label="C2" value={eng(r.d.c2, 'F')} /><Fact label="R2" value={eng(r.d.r2, 'Ω')} />
          <Fact label="Lock time" value={r.run.locked ? eng(r.run.lockTime, 's') : 'not yet'} /><Fact label="RMS jitter" value={eng(r.nz.jitter, 's')} />
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Chart dark={dark} title="Locking: the output frequency" xLabel="Time (µs)" yLabel="MHz" mark={r.d.fout / 1e6} series={[{ x: r.run.t.map((t) => t * 1e6), y: r.run.fout.map((f) => f / 1e6), colour: c[0] }]} />
          <Chart dark={dark} title="Open loop (gain crosses 0 dB at the bandwidth)" xLabel="Frequency (Hz)" yLabel="dB" logX mark={0} series={[{ x: r.f, y: r.b.mag, colour: c[0], label: 'Gain (dB)' }, { x: r.f, y: r.b.phase.map((p) => p / 3), colour: c[1], dashed: true, label: 'Phase ÷ 3 (°)' }]} />
          <Chart dark={dark} title="Phase noise at the output" xLabel="Offset (Hz)" yLabel="dBc/Hz" logX series={[{ x: r.fo, y: r.nz.total, colour: dark ? '#fafafa' : '#18181b', label: 'Total', width: 2 }, { x: r.fo, y: r.nz.ref, colour: c[0], dashed: true, label: 'Reference' }, { x: r.fo, y: r.nz.vco, colour: c[1], dashed: true, label: 'VCO' }, ...(r.nz.sd.some(Number.isFinite) ? [{ x: r.fo, y: r.nz.sd, colour: c[2], dashed: true, label: 'Sigma-delta' }] : [])]} />
          <Chart dark={dark} title="Control voltage" xLabel="Time (µs)" yLabel="V" series={[{ x: r.run.t.map((t) => t * 1e6), y: r.run.vc, colour: c[3] }]} />
        </div>
      </>}
    </Layout>
  );
}

function ConvPane() {
  const dark = useDarkMode(), open = useOpenInCode(), c = dark ? ['#a78bfa', '#fb923c'] : ['#7c3aed', '#ea580c'];
  const [s, setS] = useState({ arch: 'sar' as M.AdcArch, bits: 10, offset: 0, mismatch: 0.005, gain: 0, noise: 0, dac: 'segmented' as M.DacArch, dbits: 10, dmis: 0.01, msb: 5, seed: 1 });
  const set = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS((o) => ({ ...o, [k]: v }));
  const q = useDeferredValue(s);
  const r = useMemo(() => {
    try {
      const N = 4096, x = Array.from({ length: N }, (_, i) => 0.99 * Math.sin(2 * Math.PI * 397 * i / N));
      const codes = M.archAdc(x, q.arch, q.bits, -1, 1, { offset: q.offset, mismatch: q.mismatch, gain: q.gain, noise: q.noise, seed: q.seed });
      const m = adcMetrics(codes.map((k) => -1 + (k + 0.5) * 2 / 2 ** q.bits), 1);
      // the code-density test: a coherent sine (a prime number of cycles in the record) slightly beyond full scale, its
      // codes' histogram against the sine's (IEEE 1241)
      const hist = q.bits <= 12 ? inlDnl(M.archAdc(Array.from({ length: 2 ** q.bits * 32 }, (_, i) => 1.02 * Math.sin(2 * Math.PI * 1031 * i / (2 ** q.bits * 32))), q.arch, q.bits, -1, 1, { offset: q.offset, mismatch: q.mismatch, gain: q.gain, noise: q.noise, seed: q.seed }), q.bits) : null;
      const dac = M.archDac(q.dac, q.dbits, q.dmis, { msb: q.msb, seed: q.seed });
      return { m, dac, hist, error: '' };
    } catch (e) { return { error: (e as Error).message }; }
  }, [q]);
  const offsetUnit = s.arch === 'pipeline' ? 'share of range' : 'LSB';
  const code = `% Made in Simulate → Mixed-signal → Data converters: a sine through the ADC, measured like a testbench
x = 0.99*sin(2*pi*397*(0:4095)/4096);
[codes, xq] = adcarch(x, '${s.arch}', ${s.bits}, [-1 1], 'Offset', ${s.offset}, 'Mismatch', ${s.mismatch}, 'Gain', ${s.gain}, 'Noise', ${s.noise}, 'Seed', ${s.seed});
m = adcmetrics(xq)
figure; adcmetrics(xq)
figure; dacarch('${s.dac}', ${s.dbits}, ${s.dmis}, 'MSB', ${s.msb}, 'Seed', ${s.seed})`;
  return (
    <Layout side={<>
      <fieldset className="space-y-2">
        <legend className={ui.label}>ADC</legend>
        <select value={s.arch} onChange={(e) => set('arch')(e.target.value as M.AdcArch)} className="input w-full" aria-label="ADC architecture"><option value="flash">Flash (fastest, many comparators)</option><option value="sar">SAR (successive approximation)</option><option value="pipeline">Pipeline (1.5-bit stages)</option></select>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Bits" value={s.bits} onChange={(v) => set('bits')(Math.round(v))} min={3} />
          <NumField label="Comparator offset" unit={offsetUnit} value={s.offset} onChange={set('offset')} min={0} />
          {s.arch === 'sar' && <NumField label="Capacitor mismatch" unit="share" value={s.mismatch} onChange={set('mismatch')} min={0} />}
          {s.arch === 'pipeline' && <NumField label="Stage gain error" unit="share" value={s.gain} onChange={set('gain')} min={0} />}
          <NumField label="Comparator noise" unit="LSB" value={s.noise} onChange={set('noise')} min={0} />
        </div>
      </fieldset>
      <fieldset className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
        <legend className={ui.label}>DAC</legend>
        <select value={s.dac} onChange={(e) => set('dac')(e.target.value as M.DacArch)} className="input w-full" aria-label="DAC architecture"><option value="binary">Binary-weighted</option><option value="thermometer">Thermometer (one source a step)</option><option value="segmented">Segmented</option></select>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Bits" value={s.dbits} onChange={(v) => set('dbits')(Math.round(v))} min={2} />
          <NumField label="Source mismatch" unit="share" value={s.dmis} onChange={set('dmis')} min={0} />
          {s.dac === 'segmented' && <NumField label="Thermometer bits" value={s.msb} onChange={(v) => set('msb')(Math.round(v))} min={1} />}
          <NumField label="Chip (seed)" value={s.seed} onChange={(v) => set('seed')(Math.round(v))} min={1} />
        </div>
      </fieldset>
      <CodeButton onClick={() => void open('converters.m', code)} />
    </>}>
      {'error' in r && r.error ? <Problem text={r.error} /> : 'm' in r && r.m && r.dac && <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Fact label="ENOB" value={`${fmt(r.m.enob)} bits`} /><Fact label="SNR" value={`${fmt(r.m.snr, 1)} dB`} /><Fact label="SINAD" value={`${fmt(r.m.sinad, 1)} dB`} /><Fact label="SFDR" value={`${fmt(r.m.sfdr, 1)} dB`} />
          <Fact label="DAC worst DNL" value={`${fmt(Math.max(...r.dac.dnl.map(Math.abs)))} LSB`} /><Fact label="DAC worst INL" value={`${fmt(Math.max(...r.dac.inl.map(Math.abs)))} LSB`} />
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Chart dark={dark} title="ADC testbench: the spectrum of a full-scale sine" xLabel="Frequency (cycles a sample)" yLabel="dB below the signal" yRange={[-160, 5]} series={[{ x: r.m.freqs, y: r.m.spectrum, colour: c[0], width: 1 }]} />
          {r.hist ? <Chart dark={dark} title={`ADC: INL from the code-density test (worst ${fmt(Math.max(...r.hist.inl.map(Math.abs)))} LSB)`} xLabel="Code" yLabel="LSB" mark={0} series={[{ x: r.hist.inl.map((_, i) => i), y: r.hist.inl, colour: c[1], width: 1 }]} /> : <p className="text-xs text-zinc-500 dark:text-zinc-400">The ADC’s INL is measured up to 12 bits.</p>}
          <Chart dark={dark} title="DAC: DNL at every code" xLabel="Code" yLabel="LSB" mark={0} series={[{ x: r.dac.dnl.map((_, i) => i), y: r.dac.dnl, colour: c[0], width: 1 }]} />
          <Chart dark={dark} title="DAC: INL at every code" xLabel="Code" yLabel="LSB" mark={0} series={[{ x: r.dac.inl.map((_, i) => i), y: r.dac.inl, colour: c[1], width: 1 }]} />
        </div>
      </>}
    </Layout>
  );
}

function SerdesPane() {
  const dark = useDarkMode(), open = useOpenInCode(), c = dark ? ['#a78bfa', '#fb923c', '#4ade80'] : ['#7c3aed', '#ea580c', '#16a34a'];
  const [s, setS] = useState({ rate: 25, loss: 20, pam4: false, pre: -0.1, main: 0.8, post: -0.1, ctle: 8, dfe: 3, noise: 0.01, jitter: 0.01 });
  const set = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS((o) => ({ ...o, [k]: v }));
  const q = useDeferredValue(s);
  const r = useMemo(() => {
    try { return { run: M.linkRun({ rate: q.rate * 1e9, loss: q.loss, pam4: q.pam4, ffe: [q.pre, q.main, q.post], ctle: q.ctle || undefined, dfe: Math.round(q.dfe), noise: q.noise, jitter: q.jitter, bits: 2000 }), error: '' }; }
    catch (e) { return { error: (e as Error).message }; }
  }, [q]);
  const code = `% Made in Simulate → Mixed-signal → SerDes links
k = serdes('Rate', ${s.rate}e9, 'Loss', ${s.loss}, 'PAM4', ${s.pam4}, 'FFE', [${s.pre} ${s.main} ${s.post}], 'CTLE', ${s.ctle}, 'DFE', ${s.dfe}, 'Noise', ${s.noise}, 'Jitter', ${s.jitter})
figure; serdes('Rate', ${s.rate}e9, 'Loss', ${s.loss}, 'PAM4', ${s.pam4}, 'FFE', [${s.pre} ${s.main} ${s.post}], 'CTLE', ${s.ctle}, 'DFE', ${s.dfe}, 'Noise', ${s.noise}, 'Jitter', ${s.jitter})
% The equalisers as IBIS-AMI models for a channel simulator:
amigen('hyper_tx', 'Tx', 'FFE', [${s.pre} ${s.main} ${s.post}], 'Rate', ${s.rate}e9)
amigen('hyper_rx', 'Rx', 'CTLE', ${s.ctle}, 'DFE', ${s.dfe}, 'Rate', ${s.rate}e9)`;
  const run = 'run' in r ? r.run : undefined;
  const eye = useMemo(() => {
    if (!run) return [];
    const sps = run.pulse.sps, n = 2 * sps + 1, out: Series[] = [], col = dark ? '#a78bfa' : '#7c3aed';
    for (let j = 0; j < 160; j++) { const st = (16 + j) * sps; if (st + n > run.wave.length) break; out.push({ x: Array.from({ length: n }, (_, i) => i / sps), y: run.wave.slice(st, st + n), colour: col, width: 0.8, opacity: 0.35 }); }
    return out;
  }, [run, dark]);
  return (
    <Layout side={<>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">A serial link: PRBS data through a lossy channel, shaped by the transmitter’s FFE, the receiver’s CTLE and DFE.</p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Data rate" unit="Gb/s" value={s.rate} onChange={set('rate')} min={0} />
        <NumField label="Channel loss" unit="dB at Nyquist" value={s.loss} onChange={set('loss')} min={0} />
      </div>
      <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={s.pam4} onChange={(e) => set('pam4')(e.target.checked)} className="accent-violet-600" />PAM4 (two bits a symbol)</label>
      <fieldset className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
        <legend className={ui.label}>TX FFE taps</legend>
        <div className="grid grid-cols-3 gap-2"><NumField label="Pre" value={s.pre} onChange={set('pre')} /><NumField label="Main" value={s.main} onChange={set('main')} /><NumField label="Post" value={s.post} onChange={set('post')} /></div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
        <NumField label="CTLE peaking" unit="dB" value={s.ctle} onChange={set('ctle')} min={0} />
        <NumField label="DFE taps" value={s.dfe} onChange={(v) => set('dfe')(Math.round(v))} min={0} />
        <NumField label="Noise" unit="σ, share" value={s.noise} onChange={set('noise')} min={0} />
        <NumField label="Jitter" unit="σ, UI" value={s.jitter} onChange={set('jitter')} min={0} />
      </div>
      <CodeButton onClick={() => void open('serdes.m', code)} />
    </>}>
      {'error' in r && r.error ? <Problem text={r.error} /> : run && <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Fact label="Eye height" value={run.eyeHeight > 0 ? fmt(run.eyeHeight, 3) : 'closed'} /><Fact label="Eye width" value={`${fmt(run.eyeWidth * 100, 0)}% UI`} />
          <Fact label="Open at BER 1e-12" value={`${fmt(run.widthAt * 100, 0)}% UI`} /><Fact label="Main cursor" value={fmt(run.pulse.main, 3)} /><Fact label="DFE taps" value={run.dfeTaps.length ? run.dfeTaps.map((t) => t.toFixed(3)).join(' ') : 'none'} />
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Chart dark={dark} title={run.eyeHeight > 0 ? 'Eye diagram (after the DFE)' : 'Eye diagram: closed'} xLabel="Time (UI)" yLabel="Signal" series={eye} />
          <Chart dark={dark} title="Bathtub: bit errors across the symbol" xLabel="Sampling phase (UI)" yLabel="BER" logY yRange={[1e-18, 1]} mark={1e-12} series={[{ x: run.bathtub.phase, y: run.bathtub.ber, colour: c[1], width: 2 }]} />
          <Chart dark={dark} title="Pulse response (one symbol through it all)" xLabel="Symbols from the main cursor" yLabel="Signal" mark={0} series={[{ x: run.pulse.p.slice(0, run.pulse.peak + 12 * run.pulse.sps).map((_, i) => (i - run.pulse.peak) / run.pulse.sps), y: run.pulse.p.slice(0, run.pulse.peak + 12 * run.pulse.sps), colour: c[0] }]} />
          <Chart dark={dark} title="Clock recovery (bang-bang CDR) settling" xLabel="Symbols" yLabel="Phase (UI)" yRange={[0, 1]} series={[{ x: run.cdr.map((_, i) => i), y: run.cdr.map((p) => p / run.pulse.sps), colour: c[2] }]} />
        </div>
      </>}
    </Layout>
  );
}

const DPI_DEMO = `% Mixed-signal verification: a block from Hyperion into a SystemVerilog simulator.
% dpigen turns a function into C, a DPI-C module calling it, and a self-checking testbench
% whose expected answers are Hyperion's own (run in Xcelium, VCS or Questa with the C file).
dpigen('quantise', {[0.12 0.37 -0.51 0.9], 0.25})
type quantise_tb.sv

function [y, err] = quantise(x, step)
  y = round(x / step) * step;
  err = sum(abs(y - x));
end
`;
const AMI_DEMO = `% IBIS-AMI models for channel simulation: the TX FFE and the RX CTLE + DFE as .ami parameter
% files, a .ibs file pointing at them, and the C of AMI_Init / AMI_GetWave / AMI_Close.
amigen('hyper_tx', 'Tx', 'FFE', [-0.1 0.8 -0.1], 'Rate', 25e9)
amigen('hyper_rx', 'Rx', 'CTLE', 8, 'DFE', 3, 'Rate', 25e9)
type hyper_rx_ami.c
`;
function VerifyPane() {
  const open = useOpenInCode();
  const card = 'rounded-xl border border-zinc-200/80 p-4 dark:border-white/10';
  return (
    <section className="panel grid grid-cols-1 gap-3 p-4 lg:grid-cols-2" aria-label="Verification" data-no-motion>
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">SystemVerilog DPI-C</h3>
        <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">A function written in Hyperion becomes C plus a SystemVerilog module that calls it, so the same model runs inside a chip-level testbench before the RTL or the SPICE netlist exists. A self-checking testbench comes with it: Hyperion’s own answers are its scoreboard.</p>
        <p className="mt-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">name.c · name.h · name_dpi.sv · name_tb.sv</p>
        <button type="button" className={cn(ui.small, 'mt-3 border border-zinc-200 dark:border-white/15')} onClick={() => void open('dpi_demo.m', DPI_DEMO)}><Code2 className="h-3.5 w-3.5" aria-hidden />Try it in Code</button>
      </div>
      <div className={card}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">IBIS-AMI models</h3>
        <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">The equalisers from SerDes links as IBIS-AMI models for channel simulation: the .ami parameter file, the .ibs file that points at it with the output buffer’s own I-V and switching tables at typical, slow and fast corners (ibisbuffer), and the C of the model’s library (build it with gcc or Visual Studio).</p>
        <p className="mt-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">name.ami · name.ibs · name_ami.c</p>
        <button type="button" className={cn(ui.small, 'mt-3 border border-zinc-200 dark:border-white/15')} onClick={() => void open('ami_demo.m', AMI_DEMO)}><Code2 className="h-3.5 w-3.5" aria-hidden />Try it in Code</button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 lg:col-span-2">Hyperion writes the files; compiling the C and running the simulator happen in your own design tools.</p>
    </section>
  );
}
