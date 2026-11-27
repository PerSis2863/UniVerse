'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Download, Shuffle, Upload } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Fill } from '@/components/ui/Fill';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { FEATURES, healthScript } from '@/lib/lab/health-meta';
import type { LifeTest, Rank } from '@/lib/lab/health';
import { shareFragment } from '@/lib/lab/share';
import { watchWorker } from '@/lib/error-monitor';
import { NumField, ui } from '@/components/sim/bench-ui';
import type { FromHealth, Source, ToHealth } from './health.worker';

// Hyperion Learn → Machine health (M465, the owner, 23 Nov: "a point-and-click maintenance window"): a diagnostic
// feature designer without code. Pick a fleet of vibration recordings, look at any one (signal, spectrum, envelope
// spectrum), see every feature computed from all of them and ranked (how well it tracks wear, or tells the faults
// apart), follow the chosen one over each machine's life or across the kinds of fault, and test a remaining-life model
// on a machine it never saw. "Open in Code" writes the same work as a script; the features download as a CSV for Classify.

type Kind = 'life' | 'faults' | 'files';
type Show = 'signal' | 'spectrum' | 'envelope';
const LIGHT = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'], DARK = ['#60a5fa', '#fb923c', '#4ade80', '#c084fc', '#f87171', '#22d3ee', '#facc15', '#f472b6'];
const fmt = (v: number) => (!Number.isFinite(v) ? '–' : Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(3)));

interface Series { x: number[]; y: number[]; colour: string; dots?: boolean; dash?: boolean; name?: string }
/** A line or dot chart that fills its box: the marks scale with it, the numbers on its edges stay their size. */
function Chart({ series, band, xLabel, label, xTicks }: { series: Series[]; band?: { x: number[]; lo: number[]; hi: number[]; colour: string }; xLabel: string; label: string; xTicks?: { at: number; text: string }[] }) {
  const all = series.flatMap((s) => s.x.map((x, k) => [x, s.y[k]] as const)).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const ys = [...all.map(([, y]) => y), ...(band ? [...band.lo, ...band.hi] : [])];
  if (!all.length) return <div className="grid h-full place-items-center text-xs text-zinc-500 dark:text-zinc-400">Nothing to draw yet.</div>;
  const x0 = Math.min(...all.map(([x]) => x)), x1 = Math.max(...all.map(([x]) => x)), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.06 || Math.abs(y1) * 0.1 || 1, lo = y0 - pad, hi = y1 + pad;
  const X = (x: number) => ((x - x0) / (x1 - x0 || 1)) * 1000, Y = (y: number) => (1 - (y - lo) / (hi - lo)) * 1000;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="flex w-14 shrink-0 flex-col justify-between py-0.5 text-end font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden>
          <span>{fmt(hi)}</span><span>{fmt(lo)}</span>
        </div>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="h-full min-w-0 flex-1 rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={label}>
          {band && <path d={`${band.x.map((x, k) => `${k ? 'L' : 'M'}${X(x)},${Y(band.hi[k])}`).join('')}${band.x.map((x, k) => `L${X(band.x[band.x.length - 1 - k])},${Y(band.lo[band.x.length - 1 - k])}`).join('')}Z`} fill={band.colour} opacity={0.18} />}
          {series.map((s, i) => s.dots
            ? <path key={i} d={s.x.map((x, k) => `M${X(x).toFixed(1)},${Y(s.y[k]).toFixed(1)}h0`).join('')} stroke={s.colour} strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            : <path key={i} d={s.x.map((x, k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(s.y[k]).toFixed(1)}`).join('')} fill="none" stroke={s.colour} strokeWidth={1.6} strokeDasharray={s.dash ? '6 5' : undefined} vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
      <div className="ms-[3.875rem] flex justify-between pt-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden>
        {xTicks ? xTicks.map((t) => <span key={t.text} className="font-sans">{t.text}</span>) : <><span>{fmt(x0)}</span><span className="font-sans">{xLabel}</span><span>{fmt(x1)}</span></>}
      </div>
    </div>
  );
}

export function HealthApp() {
  const dark = useDarkMode(), colours = dark ? DARK : LIGHT, router = useRouter();
  const [kind, setKind] = useState<Kind>('life');
  const [seed, setSeed] = useState(1);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [fs, setFs] = useState(10_000), [fr, setFr] = useState(0);
  const [built, setBuilt] = useState<Extract<FromHealth, { built: unknown }>['built'] | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(0), [show, setShow] = useState<Show>('signal');
  const [view, setView] = useState<Extract<FromHealth, { viewed: unknown }>['viewed'] | null>(null);
  const [feature, setFeature] = useState<string | null>(null), [hidden, setHidden] = useState<string[]>([]);
  const [allRanks, setAllRanks] = useState(false);
  const [test, setTest] = useState(-1), [life, setLife] = useState<LifeTest | null>(null), [lifeError, setLifeError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null), job = useRef(0), want = useRef({ build: 0, view: 0, life: 0 });

  useEffect(() => {
    const w = new Worker(new URL('./health.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromHealth>) => {
      const m = e.data;
      if ('built' in m && m.job === want.current.build) { setBuilt(m.built); setError(null); setBusy(false); setRec(0); setLife(null); setTest(m.built.fleet.machines.length - 1); }
      else if ('viewed' in m && m.job === want.current.view) setView(m.viewed);
      else if ('tested' in m && m.job === want.current.life) { setLife(m.tested); setLifeError(null); }
      else if ('error' in m) {
        if (m.job === want.current.build) { setError(m.error); setBusy(false); setBuilt(null); }
        else if (m.job === want.current.life) { setLifeError(m.error); setLife(null); }
      }
    };
    watchWorker(w, 'machine health', (msg) => { setError(msg); setBusy(false); });
    worker.current = w;
    return () => w.terminate();
  }, []);
  const send = useEffectEvent((msg: Omit<ToHealth, 'job'>, slot: keyof typeof want.current) => { const id = ++job.current; want.current[slot] = id; worker.current?.postMessage({ ...msg, job: id } as ToHealth); });

  // The data: made again when its source changes.
  useEffect(() => {
    const src: Source | null = kind === 'files' ? (files.length ? { kind: 'files', files, fs, fr } : null) : { kind, seed };
    if (!src) return;
    const t = window.setTimeout(() => { setBusy(true); send({ build: src }, 'build'); }, 150);
    return () => clearTimeout(t);
  }, [kind, seed, files, fs, fr]);
  useEffect(() => { if (built) send({ view: { rec: Math.min(rec, built.fleet.recs.length - 1), show } }, 'view'); }, [built, rec, show]);

  const fleet = built?.fleet ?? null;
  const ranks: Rank[] = useMemo(() => (built ? built.ranks.filter((r) => !hidden.includes(r.id)) : []), [built, hidden]);
  const chosen = feature && ranks.some((r) => r.id === feature) ? feature : ranks[0]?.id ?? null;
  const col = built && chosen ? built.ids.indexOf(chosen) : -1;
  const featName = (id: string | null) => FEATURES.find((f) => f.id === id)?.name ?? '';
  useEffect(() => { if (built?.fleet.kind === 'life' && col >= 0 && test >= 0) send({ life: { feature: col, test } }, 'life'); }, [built, col, test]);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])].slice(0, 400);
    e.target.value = '';
    if (!list.length) return;
    if (list.some((f) => f.size > 5_000_000)) { setError('Each recording can be up to 5 MB.'); return; }
    void Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))).then((got) => { setFiles(got); setKind('files'); });
  };
  const download = () => {
    if (!built || !fleet) return;
    const names = built.ids.map((id) => featName(id).replace(/,/g, ''));
    const rows = [['recording', 'machine', fleet.kind === 'life' ? 'day' : 'index', 'label', ...names].join(','), ...fleet.recs.map((r, i) => [`"${r.name}"`, `"${fleet.machines[r.machine]}"`, r.t, `"${fleet.classes[r.label]}"`, ...built.table[i].map((v) => +v.toPrecision(7))].join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`${rows.join('\n')}\n`], { type: 'text/csv' }));
    a.download = 'machine-health-features.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const openInCode = async () => { if (chosen && fleet) router.push(`/hyperion#${await shareFragment({ name: 'machine_health.m', code: healthScript(chosen, fleet.kind), view: 'code' })}`); };

  // The chosen feature: over each machine's life, or across the kinds of fault (a column of dots each).
  const featureSeries: Series[] = !built || !fleet || col < 0 ? [] : fleet.kind === 'life'
    ? fleet.machines.map((_, m) => { const pts = fleet.recs.map((r, i) => ({ r, v: built.table[i][col] })).filter((q) => q.r.machine === m).sort((a, b) => a.r.t - b.r.t); return { x: pts.map((q) => q.r.t), y: pts.map((q) => q.v), colour: colours[m % colours.length], name: fleet.machines[m] }; })
    : fleet.classes.map((_, c) => { const pts = fleet.recs.map((r, i) => ({ r, v: built.table[i][col] })).filter((q) => q.r.label === c); return { x: pts.map((_, k) => c + 0.15 + (0.7 * k) / Math.max(1, pts.length - 1)), y: pts.map((q) => q.v), colour: colours[c % colours.length], dots: true, name: fleet.classes[c] }; });
  if (life && fleet?.kind === 'life' && featureSeries.length) featureSeries.push({ x: [0, Math.max(...fleet.recs.map((r) => r.t))], y: [life.threshold, life.threshold], colour: dark ? '#e4e4e7' : '#27272a', dash: true, name: 'Failure level' });
  const { label, small } = ui;

  return (
    <div className="flex h-[calc(100dvh-9rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[20rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Machine health settings" data-no-motion>
        <label className={label}>Data
          <select value={kind} onChange={(e) => { const v = e.target.value as Kind; if (v === 'files' && !files.length) { document.getElementById('health-files')?.click(); return; } setKind(v); }} className="input mt-1 w-full">
            <option value="life">Bearings run to failure</option>
            <option value="faults">A pump’s faults</option>
            <option value="files">{files.length ? `Your recordings (${files.length})` : 'Your recordings…'}</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {kind !== 'files' && <button type="button" className={small} onClick={() => setSeed((s) => s + 1)}><Shuffle className="h-3.5 w-3.5" aria-hidden />Other machines</button>}
          <label className={cn(small, 'cursor-pointer')}><Upload className="h-3.5 w-3.5" aria-hidden />Open recordings<input id="health-files" type="file" multiple accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={onFiles} /></label>
        </div>
        {kind === 'files' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Sample rate" unit="Hz" value={fs} min={1} onChange={(v) => setFs(Math.max(1, v))} />
              <NumField label="Shaft speed" unit="Hz, 0 = unknown" value={fr} min={0} onChange={(v) => setFr(Math.max(0, v))} />
            </div>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">One recording a file (its first column of numbers). Files are grouped by their name up to the first _ or -: <span className="font-mono">healthy_01.csv</span>, <span className="font-mono">worn_02.csv</span>. They stay on this computer.</p>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        {fleet && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{fleet.recs.length} recordings of {fleet.machines.length} {fleet.kind === 'life' ? 'machines, every 2 days until each failed' : fleet.classes.length > 1 ? 'kinds' : 'kind'}, {(fleet.recs[0]?.n ?? 0).toLocaleString()} samples at {fleet.fs.toLocaleString()} Hz{fleet.fr ? `, shaft at ${fleet.fr} Hz` : ''}.</p>}
        {built && (
          <fieldset className="space-y-1">
            <legend className={label}>Features <span className="font-normal text-zinc-500 dark:text-zinc-400">(untick to leave one out)</span></legend>
            {(['Time', 'Frequency'] as const).map((g) => (
              <div key={g} className="pt-1">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{g === 'Time' ? 'From the signal' : 'From its spectrum'}</p>
                {FEATURES.filter((f) => f.group === g && built.ids.includes(f.id)).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 py-0.5 text-[13px] text-zinc-700 dark:text-zinc-200">
                    <input type="checkbox" checked={!hidden.includes(f.id)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== f.id) : [...h, f.id]))} className="h-4 w-4 accent-violet-600" />{f.name}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        )}
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="Recordings and features" data-no-motion>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Recording
            <select value={rec} onChange={(e) => setRec(Number(e.target.value))} disabled={!fleet} className={ui.select}>
              {fleet?.machines.map((mName, m) => (
                <optgroup key={m} label={mName}>{fleet.recs.map((r, i) => (r.machine === m ? <option key={i} value={i}>{r.name}</option> : null))}</optgroup>
              ))}
            </select>
          </label>
          <Segmented<Show> label="Show the recording as" value={show} onChange={setShow} segments={[{ value: 'signal', label: 'Signal' }, { value: 'spectrum', label: 'Spectrum' }, { value: 'envelope', label: 'Envelope spectrum' }]} />
          {busy && <span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">computing…</span>}
        </div>
        <div className="min-h-0 flex-1">
          {view && fleet ? <Chart series={[{ x: view.x, y: view.y, colour: colours[0] }]} xLabel={view.xLabel} label={`${fleet.recs[rec]?.name ?? ''}: ${show === 'signal' ? 'the signal' : show === 'spectrum' ? 'its spectrum' : 'its envelope spectrum'}`} /> : <div className="h-full rounded-xl skeleton" aria-busy="true" />}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Feature
            <select value={chosen ?? ''} onChange={(e) => setFeature(e.target.value)} disabled={!ranks.length} className={ui.select}>
              {ranks.map((r) => <option key={r.id} value={r.id}>{featName(r.id)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
            {featureSeries.map((s) => <span key={s.name} className="inline-flex items-center gap-1"><span className={cn('h-2.5 w-2.5', s.dash ? 'h-0.5 w-3' : 'rounded-full')} style={{ background: s.colour }} aria-hidden />{s.name}</span>)}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {fleet && featureSeries.length > 0 ? (
            <Chart series={featureSeries} xLabel={fleet.kind === 'life' ? 'Day' : ''} xTicks={fleet.kind === 'faults' ? fleet.classes.map((c, i) => ({ at: i + 0.5, text: c })) : undefined}
              label={fleet.kind === 'life' ? `${featName(chosen)} over each machine’s life` : `${featName(chosen)} for each kind of fault`} />
          ) : <div className="h-full rounded-xl skeleton" aria-busy="true" />}
        </div>
      </section>

      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Feature ranking" data-no-motion>
        <div>
          <p className={label}>Best features <span className="font-normal text-zinc-500 dark:text-zinc-400">{fleet?.kind === 'life' ? '(how well each tracks wear)' : '(how well each tells the kinds apart)'}</span></p>
          <ul className="mt-2 space-y-1">
            {(allRanks ? ranks : ranks.slice(0, 6)).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setFeature(r.id)} aria-pressed={r.id === chosen} className={cn('w-full rounded-xl px-2.5 py-1 text-start', r.id === chosen ? 'bg-violet-100 dark:bg-violet-500/20' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                  <span className="flex items-baseline justify-between gap-2 text-[13px] text-zinc-800 dark:text-zinc-100"><span className="truncate">{featName(r.id)}</span><span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{r.score.toFixed(2)}</span></span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"><Fill value={r.score} className="bg-violet-600 dark:bg-violet-400" /></span>
                </button>
              </li>
            ))}
          </ul>
          {ranks.length > 6 && <button type="button" className={cn(small, 'mt-1')} onClick={() => setAllRanks((v) => !v)}>{allRanks ? 'Show the best 6' : `Show all ${ranks.length}`}</button>}
          {fleet?.kind === 'life' && chosen && ranks.find((r) => r.id === chosen) && (
            <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{Object.entries(ranks.find((r) => r.id === chosen)!.parts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}. Monotonic: only rises; trendable: every machine follows one shape; prognosable: they fail at a similar level.</p>
          )}
          {fleet?.kind === 'faults' && <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">The share of each feature’s spread that the kind of fault explains (η², from the analysis of variance): 1 when the kinds never overlap.</p>}
        </div>
        {fleet?.kind === 'faults' && built && col >= 0 && (
          <div className="border-t border-zinc-200/80 pt-3 dark:border-white/10">
            <p className={label}>{featName(chosen)} by kind</p>
            <table className="mt-1 w-full text-xs tabular-nums">
              <thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Kind</th><th className="py-1 text-end font-medium">Average</th><th className="py-1 text-end font-medium">Spread (sd)</th><th className="py-1 text-end font-medium">Count</th></tr></thead>
              <tbody>
                {fleet.classes.map((c, k) => {
                  const v = fleet.recs.flatMap((r, i) => (r.label === k ? [built.table[i][col]] : [])), m = v.reduce((a2, x) => a2 + x, 0) / (v.length || 1), sd = Math.sqrt(v.reduce((a2, x) => a2 + (x - m) ** 2, 0) / Math.max(1, v.length - 1));
                  return <tr key={c} className="border-t border-zinc-100 dark:border-white/[0.06]"><td className="py-1"><span className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colours[k % colours.length] }} aria-hidden />{c}</td><td className="py-1 text-end font-mono">{fmt(m)}</td><td className="py-1 text-end font-mono">{fmt(sd)}</td><td className="py-1 text-end font-mono">{v.length}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        {fleet?.kind === 'life' && (
          <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
            <p className={label}>Remaining useful life</p>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Test on
              <select value={test} onChange={(e) => setTest(Number(e.target.value))} className={ui.select}>{fleet.machines.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
            </label>
            {lifeError ? <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{lifeError}</p> : life && (
              <>
                <div className="h-44"><Chart series={[{ x: life.t, y: life.truth, colour: dark ? '#e4e4e7' : '#27272a', dash: true }, { x: life.t, y: life.rul, colour: colours[0] }]} band={{ x: life.t, lo: life.lo, hi: life.hi, colour: colours[0] }} xLabel="Day (days left, up)" label={`Predicted days left against the truth for ${fleet.machines[test]}`} /></div>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">An exponential wear model learnt from the other machines by <b>{featName(chosen)}</b>, updated with each reading of {fleet.machines[test]} (it failed on day {life.life}): the line is its guess of the days left, the band 90 % of its range, the dashes the truth. On average it is <b>{life.error.toFixed(1)} days</b> out.</p>
              </>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-1 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <button type="button" className={small} disabled={!built} onClick={download}><Download className="h-3.5 w-3.5" aria-hidden />Features (CSV)</button>
          <button type="button" className={small} disabled={!chosen} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">The CSV opens in Classify to train a model that tells the faults apart.</p>
      </aside>
    </div>
  );
}
