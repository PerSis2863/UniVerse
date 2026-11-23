'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Upload } from 'lucide-react';
import { Fill } from '@/components/ui/Fill';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { csvColumns, csvData, irisData, LEARNER_IDS, LEARNERS, MADE, madeData, scriptFor, type DataSet, type LearnerId, type MadeKind } from '@/lib/lab/learn';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from '@/components/sim/bench-ui';
import type { FromLearn, ToLearn } from './learn.worker';

// Hyperion Learn (M421, the owner: "make everything ultra smooth"): a learner window. Pick data (the iris flowers,
// made-up shapes or a CSV), the models to compare and how to test them; every model trains in a worker with k-fold
// cross-validation and appears as soon as it's ready, the chosen one's decision regions drawn over the points (its
// out-of-fold mistakes ringed) and its confusion matrix; "Open in Code" writes the same thing as a script.

type Source = 'iris' | MadeKind | 'csv';
type Result = { accuracy: number; ms: number; pred: number[]; confusion: number[][] } | { error: string };
type Region = Extract<FromLearn, { region: unknown }>['region'];
const KEEP = 'uv-learn';
const LIGHT = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'], DARK = ['#60a5fa', '#fb923c', '#4ade80', '#c084fc', '#f87171', '#22d3ee', '#facc15', '#f472b6'];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

interface Settings { source: Source; n: number; noise: number; seed: number; k: number; models: LearnerId[]; chosen: LearnerId | null; xi: number; yi: number }
const START: Settings = { source: 'iris', n: 240, noise: 0.15, seed: 1, k: 5, models: [...LEARNER_IDS], chosen: null, xi: 2, yi: 3 };
const read = (): Settings => {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Partial<Settings> | null;
    if (!v) return START;
    const okSource = v.source === 'iris' || MADE.some((m) => m.id === v.source) ? v.source! : 'iris';
    const n = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
    return { source: okSource, n: n(v.n, 240, 40, 1000), noise: n(v.noise, 0.15, 0, 1), seed: n(v.seed, 1, 1, 9999), k: v.k === 10 ? 10 : 5, models: Array.isArray(v.models) ? v.models.filter((m): m is LearnerId => LEARNER_IDS.includes(m as LearnerId)) : START.models, chosen: LEARNER_IDS.includes(v.chosen as LearnerId) ? (v.chosen as LearnerId) : null, xi: n(v.xi, 2, 0, 50), yi: n(v.yi, 3, 0, 50) };
  } catch { return START; }
};

/** A worker that keeps only the newest job: a new job while one runs replaces the worker. */
function useLatestWorker(onMessage: (m: FromLearn) => void) {
  const w = useRef<Worker | null>(null), busy = useRef(false), handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; });
  useEffect(() => () => w.current?.terminate(), []);
  return (job: ToLearn) => {
    if (!w.current || busy.current) {
      w.current?.terminate();
      w.current = new Worker(new URL('./learn.worker.ts', import.meta.url));
      w.current.onmessage = (e: MessageEvent<FromLearn>) => { if ('done' in e.data) busy.current = false; handler.current(e.data); };
    }
    busy.current = true;
    w.current.postMessage(job);
  };
}

export function LearnApp() {
  const dark = useDarkMode(), colours = dark ? DARK : LIGHT, router = useRouter();
  const [s, setNow] = useState<Settings>(read);
  const [csv, setCsv] = useState<{ name: string; text: string; answer: number; use: number[] } | null>(null);
  const [results, setResults] = useState<{ job: number; of: Partial<Record<LearnerId, Result>> }>({ job: 0, of: {} });
  const [region, setRegion] = useState<Region | null>(null);
  const [running, setRunning] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const jobs = useRef({ cv: 0, view: 0 }), keepTimer = useRef(0);
  const set = (patch: Partial<Settings>) => setNow((v) => {
    const next = { ...v, ...patch };
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });

  // The data, from the settings (a CSV only once a file is chosen).
  const built = useMemo((): { data: DataSet | null; error: string | null } => {
    try {
      if (s.source === 'iris') return { data: irisData(), error: null };
      if (s.source === 'csv') return csv ? { data: csvData(csv.text, csv.answer, csv.use, csv.name), error: null } : { data: null, error: null };
      return { data: madeData(s.source, s.n, s.noise, s.seed), error: null };
    } catch (e) { return { data: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [s.source, s.n, s.noise, s.seed, csv]);
  const data = built.data, p = data?.predictors.length ?? 0;
  const xi = Math.min(s.xi, Math.max(0, p - 1)), yi = p > 1 ? (Math.min(s.yi, p - 1) === xi ? (xi + 1) % p : Math.min(s.yi, p - 1)) : 0;

  const cvWorker = useLatestWorker((m) => {
    if (m.id !== jobs.current.cv) return;
    if ('done' in m) { setRunning(false); return; }
    if ('model' in m) setResults((r) => ({ job: m.id, of: { ...(r.job === m.id ? r.of : {}), [m.model]: 'error' in m ? { error: m.error } : { accuracy: m.accuracy, ms: m.ms, pred: m.pred, confusion: m.confusion } } }));
  });
  const viewWorker = useLatestWorker((m) => { if (m.id === jobs.current.view && 'region' in m) setRegion(m.region); });

  // Cross-validate every chosen model when the data or the models change (a moment after the last change).
  const modelsKey = s.models.join(',');
  const startCv = useEffectEvent(() => {
    if (!data) return;
    const id = ++jobs.current.cv;
    setRunning(true);
    setResults({ job: id, of: {} });
    cvWorker({ id, data, models: LEARNER_IDS.filter((m) => s.models.includes(m)), k: s.k, view: null });
  });
  useEffect(() => {
    const t = window.setTimeout(startCv, 250);
    return () => clearTimeout(t);
  }, [data, modelsKey, s.k]);

  const done = Object.entries(results.of).filter((e): e is [LearnerId, Extract<Result, { accuracy: number }>] => !!e[1] && 'accuracy' in e[1]);
  const best = done.length ? done.reduce((a, b) => (b[1].accuracy > a[1].accuracy ? b : a))[0] : null;
  const chosen = s.chosen && s.models.includes(s.chosen) ? s.chosen : best;
  const chosenResult = chosen ? results.of[chosen] : undefined;

  // The chosen model's regions on the two predictors shown.
  const startView = useEffectEvent(() => {
    if (!data || !chosen || p < 2 || (LEARNERS[chosen].twoOnly && data.classes.length !== 2)) return;
    const id = ++jobs.current.view;
    viewWorker({ id, data, models: [], k: s.k, view: { model: chosen, xi, yi } });
  });
  useEffect(() => {
    const t = window.setTimeout(startView, 120);
    return () => clearTimeout(t);
  }, [data, chosen, xi, yi]);

  // ——— The picture ———
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 420 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, Math.round(e.contentRect.width)), h: Math.max(200, Math.round(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showRegion = region && data && region.xi === xi && region.yi === yi && region.model === chosen ? region : null;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = size.w, H = size.h;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = 46, B = 34, T = 10, R = 12, pw = W - L - R, ph = H - T - B;
    const xs = data.X.map((r) => r[xi]), ys = data.X.map((r) => r[yi]);
    const pad = (lo: number, hi: number) => { const q = (hi - lo) * 0.08 || 1; return [lo - q, hi + q] as [number, number]; };
    const xr = showRegion?.xr ?? pad(Math.min(...xs), Math.max(...xs)), yr = showRegion?.yr ?? pad(Math.min(...ys), Math.max(...ys));
    const X = (v: number) => L + ((v - xr[0]) / (xr[1] - xr[0])) * pw, Y = (v: number) => T + (1 - (v - yr[0]) / (yr[1] - yr[0])) * ph;
    if (showRegion && p >= 2) {
      // The regions as a small picture, scaled up smoothly: each class's colour, fainter where the model is unsure.
      const img = new ImageData(showRegion.w, showRegion.h), bg = dark ? [24, 24, 27] : [255, 255, 255];
      for (let i = 0; i < showRegion.cls.length; i++) {
        const col = hex(colours[showRegion.cls[i] % colours.length]), a = (dark ? 0.32 : 0.22) * (0.35 + 0.65 * (showRegion.sure[i] / 255));
        img.data.set([...[0, 1, 2].map((q) => Math.round(bg[q] + (col[q] - bg[q]) * a)), 255], i * 4);
      }
      const off = new OffscreenCanvas(showRegion.w, showRegion.h);
      off.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      // Rounded like every Hyperion surface (the owner, 23 Nov: "round corners everywhere").
      g.save(); g.beginPath(); g.roundRect(L, T, pw, ph, 10); g.clip();
      g.drawImage(off, L, T, pw, ph);
      g.restore();
    }
    g.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'; g.lineWidth = 1; g.beginPath(); g.roundRect(L + 0.5, T + 0.5, pw - 1, ph - 1, 10); g.stroke();
    g.fillStyle = dark ? '#d4d4d8' : '#52525b'; g.font = '11px Inter, system-ui, sans-serif';
    for (let i = 0; i <= 4; i++) {
      const vx = xr[0] + ((xr[1] - xr[0]) * i) / 4, vy = yr[0] + ((yr[1] - yr[0]) * i) / 4;
      g.textAlign = 'center'; g.fillText(String(+vx.toPrecision(3)), X(vx), H - B + 15);
      g.textAlign = 'end'; g.fillText(String(+vy.toPrecision(3)), L - 6, Y(vy) + 4);
    }
    g.textAlign = 'center'; g.fillText(data.predictors[xi] ?? '', L + pw / 2, H - 4);
    g.save(); g.translate(11, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(p > 1 ? data.predictors[yi] : '', 0, 0); g.restore();
    const wrong = chosenResult && 'pred' in chosenResult ? chosenResult.pred : null;
    data.X.forEach((r, i) => {
      const x = X(r[xi]), y = p > 1 ? Y(r[yi]) : T + ph / 2;
      g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fillStyle = colours[data.y[i] % colours.length]; g.fill();
      g.lineWidth = 1; g.strokeStyle = dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)'; g.stroke();
      if (wrong && wrong[i] !== data.y[i]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.lineWidth = 1.8; g.strokeStyle = dark ? '#fafafa' : '#18181b'; g.stroke(); }
    });
  }, [data, xi, yi, p, showRegion, chosenResult, size, dark, colours]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5_000_000) { setFileError('That file is over 5 MB: Learn reads files up to 5 MB.'); return; }
    void f.text().then((text) => {
      try { const { head, numeric } = csvColumns(text); const answer = head.length - 1; setCsv({ name: f.name, text, answer, use: head.flatMap((_, j) => (j !== answer && numeric[j] ? [j] : [])) }); setFileError(null); set({ source: 'csv', xi: 0, yi: 1 }); }
      catch (err) { setFileError(err instanceof Error ? err.message : String(err)); }
    });
  };
  const cols = csv ? csvColumns(csv.text) : null;
  const openInCode = async () => {
    if (!data || !chosen) return;
    router.push(`/hyperion#${await shareFragment({ name: `learn_${chosen}.m`, code: scriptFor(chosen, data, s.k), view: 'code' })}`);
  };
  const { label, small } = ui;
  const conf = chosenResult && 'confusion' in chosenResult ? chosenResult.confusion : null;

  return (
    <div className="flex h-[calc(100dvh-6.25rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Learn settings" data-no-motion>
        <label className={label}>Data
          <select value={s.source} onChange={(e) => { const v = e.target.value as Source; if (v === 'csv' && !csv) { document.getElementById('learn-file')?.click(); return; } set({ source: v, xi: v === 'iris' ? 2 : 0, yi: v === 'iris' ? 3 : 1 }); }} className="input mt-1 w-full">
            <option value="iris">Iris flowers (150, 3 species)</option>
            {MADE.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="csv">{csv ? csv.name : 'Your CSV file…'}</option>
          </select>
        </label>
        <label className={cn(small, 'cursor-pointer self-start border border-zinc-200 dark:border-white/15')}>
          <Upload className="h-3.5 w-3.5" aria-hidden />Open a CSV file
          <input id="learn-file" type="file" accept=".csv,.txt,.tsv,text/csv" className="sr-only" onChange={onFile} />
        </label>
        {s.source !== 'iris' && s.source !== 'csv' && (
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Rows" value={s.n} min={40} onChange={(v) => { if (v >= 40 && v <= 1000) set({ n: Math.round(v) }); }} />
            <NumField label="Noise" value={s.noise} min={0} onChange={(v) => { if (v >= 0 && v <= 1) set({ noise: v }); }} />
            <NumField label="Seed" value={s.seed} min={1} onChange={(v) => { if (v >= 1 && v <= 9999) set({ seed: Math.round(v) }); }} />
          </div>
        )}
        {s.source === 'csv' && csv && cols && (
          <div className="space-y-2">
            <label className={label}>Answer column
              <select value={csv.answer} onChange={(e) => { const a = Number(e.target.value); setCsv({ ...csv, answer: a, use: csv.use.filter((j) => j !== a) }); }} className="input mt-1 w-full">
                {cols.head.map((h, j) => <option key={j} value={j}>{h || `Column ${j + 1}`}</option>)}
              </select>
            </label>
            <fieldset>
              <legend className={label}>Predictors</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {cols.head.map((h, j) => j !== csv.answer && cols.numeric[j] && (
                  <label key={j} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 dark:border-white/15 dark:text-zinc-200">
                    <input type="checkbox" checked={csv.use.includes(j)} onChange={() => setCsv({ ...csv, use: csv.use.includes(j) ? csv.use.filter((q) => q !== j) : [...csv.use, j].sort((a, b) => a - b) })} className="h-3.5 w-3.5 accent-violet-600" />{h || `Column ${j + 1}`}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {(fileError ?? built.error) && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300" role="alert">{fileError ?? built.error}</p>}
        <fieldset>
          <legend className={label}>Models</legend>
          <div className="mt-1 space-y-0.5">
            {LEARNER_IDS.map((m) => (
              <label key={m} className="flex items-center gap-2 rounded-md px-1 py-1 text-[13px] text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.04]">
                <input type="checkbox" checked={s.models.includes(m)} onChange={() => set({ models: s.models.includes(m) ? s.models.filter((q) => q !== m) : [...s.models, m] })} className="h-3.5 w-3.5 accent-violet-600" />
                {LEARNERS[m].name}<span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">{LEARNERS[m].detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>Testing
          <select value={s.k} onChange={(e) => set({ k: Number(e.target.value) })} className="input mt-1 w-full">
            <option value={5}>5-fold cross-validation</option>
            <option value={10}>10-fold cross-validation</option>
          </select>
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Every model learns {s.k} times, each time without a fifth{s.k === 10 ? ' (a tenth)' : ''} of the rows, and is scored on the rows it didn’t see: an honest accuracy.</p>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="Results">
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300" data-no-motion>
              {p > 1 && (
                <>
                  <label className="inline-flex items-center gap-1">Across<select value={xi} onChange={(e) => set({ xi: Number(e.target.value) })} className={ui.select}>{data?.predictors.map((n, j) => <option key={j} value={j}>{n}</option>)}</select></label>
                  <label className="inline-flex items-center gap-1">Up<select value={yi} onChange={(e) => set({ yi: Number(e.target.value) })} className={ui.select}>{data?.predictors.map((n, j) => <option key={j} value={j}>{n}</option>)}</select></label>
                </>
              )}
              <span className="ms-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                {data?.classes.map((c, k) => <span key={c} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colours[k % colours.length] }} aria-hidden />{c}</span>)}
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-zinc-900 dark:border-zinc-50" aria-hidden />wrong</span>
              </span>
            </div>
            <div ref={box} className="relative min-h-0 flex-1">
              <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={data ? `${data.name}: ${data.X.length} rows by ${data.predictors[xi]}${p > 1 ? ` and ${data.predictors[yi]}` : ''}${chosen ? `, regions of ${LEARNERS[chosen].name}` : ''}` : 'No data yet'} />
              {!data && !built.error && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600 dark:text-zinc-300">Open a CSV file to learn from it.</p>}
            </div>
            {chosen && LEARNERS[chosen].twoOnly && data && data.classes.length !== 2 && <p className="text-xs text-zinc-600 dark:text-zinc-300">Logistic regression separates two classes; choose another model to see its regions.</p>}
          </div>
          <div className="flex w-[19rem] shrink-0 flex-col gap-3 overflow-y-auto" data-no-motion>
            <div role="radiogroup" aria-label="Models by accuracy" className="space-y-1">
              {s.models.length === 0 && <p className="text-xs text-zinc-600 dark:text-zinc-300">Tick a model to train.</p>}
              {LEARNER_IDS.filter((m) => s.models.includes(m)).map((m) => {
                const r = results.of[m], on = m === chosen;
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} onClick={() => set({ chosen: m })}
                    className={cn('block w-full rounded-lg border px-2.5 py-1.5 text-start transition-[background-color,border-color] duration-150', on ? 'border-violet-400 bg-violet-50 dark:border-violet-400/60 dark:bg-violet-500/15' : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/[0.04]')}>
                    <span className="flex items-baseline gap-2 text-[13px] font-medium text-zinc-900 dark:text-white">
                      {LEARNERS[m].name}{m === best && <span className="rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">Best</span>}
                      <span className="ms-auto text-[11px] font-normal text-zinc-500 dark:text-zinc-400">{!r ? (running ? 'Training…' : '') : 'error' in r ? r.error : r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(1)} s`}</span>
                      <span className="w-12 text-end font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">{!r ? (running ? '…' : '') : 'error' in r ? '—' : `${(100 * r.accuracy).toFixed(1)}%`}</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10"><Fill value={r && 'accuracy' in r ? r.accuracy : 0} className="h-full rounded-full bg-violet-500" /></span>
                  </button>
                );
              })}
            </div>
            {conf && data && chosen && (
              <div>
                <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">{LEARNERS[chosen].name}: true class (rows) against predicted</p>
                <table className="w-full table-fixed border-separate border-spacing-0.5 text-center font-mono text-xs tabular-nums">
                  <thead><tr><td className="w-16" />{data.classes.map((c) => <th key={c} scope="col" className="truncate px-0.5 font-sans text-[11px] font-medium text-zinc-600 dark:text-zinc-300" title={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {conf.map((row, i) => {
                      const top = Math.max(1, ...conf.flat());
                      return (
                        <tr key={i}>
                          <th scope="row" className="truncate text-end font-sans text-[11px] font-medium text-zinc-600 dark:text-zinc-300" title={data.classes[i]}>{data.classes[i]}</th>
                          {row.map((v, j) => { const a = v / top; return <td key={j} className="rounded py-1 text-zinc-900 dark:text-white" style={{ background: i === j ? `rgba(37,99,235,${0.06 + 0.4 * a})` : v ? `rgba(220,38,38,${0.1 + 0.35 * a})` : 'transparent' }}>{v}</td>; })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {chosen && data && <button type="button" className={cn(small, 'self-start border border-zinc-200 dark:border-white/15')} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
