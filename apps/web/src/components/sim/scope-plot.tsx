// Hyperion Simulate → Blocks (M415): a scope's plot (time across, its traces with their final and peak values), shared by
// the Scopes, the PID tuner (M562) and the real-time run.

export const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : String(+v.toPrecision(4)));

/** Nice round tick values from lo to hi. */
export function ticks(lo: number, hi: number, count = 5) {
  if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
  const raw = (hi - lo) / count, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function ScopePlot({ title, t, traces, colours }: { title: string; t: number[]; traces: { label: string; v: number[] }[]; colours: string[] }) {
  const PW = 900, PH = 240, L = 58, R = 14, T = 10, Bt = 40;
  const all = traces.flatMap((tr) => tr.v.filter(Number.isFinite));
  const lo0 = all.length ? Math.min(...all) : -1, hi0 = all.length ? Math.max(...all) : 1, padY = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.1 || 1;
  const yt = ticks(lo0 - padY, hi0 + padY), lo = Math.min(yt[0], lo0 - padY), hi = Math.max(yt.at(-1)!, hi0 + padY);
  const tEnd = t.at(-1) ?? 1, xt = ticks(0, tEnd, 6).filter((v) => v <= tEnd + 1e-9);
  const X = (tt: number) => L + (tt / (tEnd || 1)) * (PW - L - R), Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (PH - T - Bt);
  return (
    <figure className="min-w-0 rounded-lg border border-zinc-200 p-2 dark:border-white/10">
      <figcaption className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-white">{title}</span>
        {traces.map((tr, i) => {
          const v = tr.v.filter(Number.isFinite);
          return <span key={i} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: colours[i] }} aria-hidden />{tr.label}{v.length > 0 && <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">ends {fmt(v.at(-1)!)}, peak {fmt(Math.max(...v))}</span>}</span>;
        })}
      </figcaption>
      <svg viewBox={`0 0 ${PW} ${PH}`} className="h-auto w-full" role="img" aria-label={`${title}: ${traces.map((tr) => { const v = tr.v.filter(Number.isFinite); return `${tr.label} ${v.length ? `ends at ${fmt(v.at(-1)!)}` : 'not wired'}`; }).join('; ')}`}>
        {yt.map((v) => <g key={`y${v}`}><line x1={L} x2={PW - R} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'stroke-zinc-400 dark:stroke-zinc-500' : 'stroke-zinc-200 dark:stroke-white/10'} strokeWidth={1} /><text x={L - 6} y={Y(v) + 4} fontSize={12} textAnchor="end" className="fill-zinc-600 font-mono dark:fill-zinc-300">{fmt(v)}</text></g>)}
        {xt.map((v) => <g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={T} y2={PH - Bt} className="stroke-zinc-200 dark:stroke-white/10" strokeWidth={1} /><text x={X(v)} y={PH - Bt + 16} fontSize={12} textAnchor="middle" className="fill-zinc-600 font-mono dark:fill-zinc-300">{fmt(v)}</text></g>)}
        <text x={(L + PW - R) / 2} y={PH - 3} fontSize={12} textAnchor="middle" className="fill-zinc-500 dark:fill-zinc-400">time (s)</text>
        {traces.map((tr, i) => {
          // At most ~1,200 points drawn (the run keeps up to ~2,000).
          const every = Math.max(1, Math.ceil(t.length / 1200)), pts: string[] = [];
          for (let k = 0; k < t.length; k += every) if (Number.isFinite(tr.v[k])) pts.push(`${X(t[k]).toFixed(1)},${Y(Math.max(lo, Math.min(hi, tr.v[k]))).toFixed(1)}`);
          return <polyline key={i} points={pts.join(' ')} fill="none" stroke={colours[i]} strokeWidth={1.8} strokeLinejoin="round" />;
        })}
      </svg>
    </figure>
  );
}

