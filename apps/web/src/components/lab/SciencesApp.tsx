'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Code2, Copy } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { SCI_APPS, defaults, otherText, resultsOf, scriptFor, type Values } from '@/lib/lab/sci-apps';
import { shareFragment } from '@/lib/lab/share';
import { ui } from '@/components/sim/bench-ui';
import type { FigOut, FromLab, ToLab } from './lab.worker';
import { watchWorker } from '@/lib/error-monitor';

// Hyperion Learn → Sciences (M508, the owner, 23 Nov: point-and-click windows for "all of them"): every science and
// industry toolbox (M492–M505) without writing code. Pick a toolbox, move its sliders and menus; the window writes the
// script (lib/lab/sci-apps.ts), Hyperion's engine runs it in its own thread, and the figure, the results and the script
// come back. "Open in Code" carries the same script into the editor.

const KEEP = 'uv-sci-app';
const fmt = (x: number) => (Math.abs(x) >= 1e5 ? x.toExponential(2) : String(+x.toFixed(6)));

export function SciencesApp() {
  const dark = useDarkMode(), router = useRouter();
  const [appId, setAppId] = useState(() => { try { const s = sessionStorage.getItem(KEEP); return SCI_APPS.some((a) => a.id === s) ? s! : SCI_APPS[0].id; } catch { return SCI_APPS[0].id; } });
  const app = SCI_APPS.find((a) => a.id === appId) ?? SCI_APPS[0];
  const [values, setValues] = useState<Record<string, Values>>({});
  const v = values[app.id] ?? defaults(app);
  const [fig, setFig] = useState<FigOut | null>(null), [text, setText] = useState(''), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const worker = useRef<Worker | null>(null), buf = useRef(''), running = useRef(false), queued = useRef<string | null>(null), id = useRef(0);
  const code = scriptFor(app, v);

  const send = (script: string) => {
    const w = worker.current;
    if (!w) return;
    if (running.current) { queued.current = script; return; }
    running.current = true; buf.current = ''; setBusy(true);
    w.postMessage({ run: `close('all'); clear;\n${script}`, id: ++id.current } satisfies ToLab);
  };
  const onMessage = useEffectEvent((m: FromLab) => {
    if ('out' in m) { buf.current += m.out; return; }
    if (!('done' in m)) return;
    running.current = false;
    const next = queued.current;
    if (next !== null) { queued.current = null; send(next); return; } // an older run's result: the newest is on its way
    setBusy(false); setText(buf.current); setError(m.error ?? null);
    if (m.figs) setFig(m.figs.find((f) => f.id === m.current) ?? m.figs[m.figs.length - 1] ?? null);
    else setFig(null);
  });
  useEffect(() => {
    const w = new Worker(new URL('./lab.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromLab>) => onMessage(e.data);
    watchWorker(w, 'sciences', (msg) => { running.current = false; queued.current = null; setBusy(false); setError(msg); });
    w.postMessage({ figure: -1, w: 760, h: 520 } satisfies ToLab);
    worker.current = w;
    return () => { w.terminate(); worker.current = null; running.current = false; };
  }, []);
  // Run when the script changes (a slider moving: the newest position wins, older ones are skipped).
  const runNow = useEffectEvent(() => send(code));
  useEffect(() => { const t = setTimeout(() => runNow(), 120); return () => clearTimeout(t); }, [code]);

  const pick = (next: string) => { if (next === app.id) return; setAppId(next); setFig(null); setText(''); setError(null); try { sessionStorage.setItem(KEEP, next); } catch { /* private mode */ } };
  const set = (key: string, x: number | string | boolean) => setValues((all) => ({ ...all, [app.id]: { ...v, [key]: x } }));
  const results = resultsOf(text), printed = otherText(text);
  const openInCode = async () => router.push(`/hyperion#${await shareFragment({ name: `${app.id}.m`, code, view: 'code' })}`);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ } };
  const { label, small } = ui;

  return (
    <div className="flex h-[calc(100dvh-9rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <nav className="panel flex min-h-0 w-[13rem] shrink-0 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Toolboxes" data-no-motion>
        {SCI_APPS.map((a) => (
          <button key={a.id} type="button" onClick={() => pick(a.id)} aria-pressed={a.id === app.id} className={cn(ui.item, a.id === app.id && ui.on)}>{a.title}</button>
        ))}
      </nav>
      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label={`${app.title} settings`} data-no-motion>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">{app.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{app.blurb}</p>
          {app.note && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{app.note}</p>}
        </div>
        {app.fields.filter((f) => !f.when || f.when(v)).map((f) => {
          const id = `sci-${app.id}-${f.key}`, x = v[f.key];
          if (f.kind === 'menu') return (
            <label key={f.key} className={label} htmlFor={id}>{f.label}
              <select id={id} value={String(x)} onChange={(e) => set(f.key, e.target.value)} className="input mt-1 w-full">
                {f.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
              </select>
            </label>
          );
          if (f.kind === 'toggle') return (
            <label key={f.key} className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={Boolean(x)} onChange={(e) => set(f.key, e.target.checked)} />{f.label}</label>
          );
          if (f.kind === 'text') return (
            <label key={f.key} className={label} htmlFor={id}>{f.label}{f.hint && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({f.hint})</span>}
              <textarea id={id} value={String(x)} rows={4} spellCheck={false} maxLength={f.max} onChange={(e) => set(f.key, e.target.value)} className="input mt-1 w-full break-all font-mono text-xs" translate="no" />
            </label>
          );
          const val = Number(x);
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label className={label} htmlFor={id}>{f.label}{f.unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({f.unit})</span>}</label>
                <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={Number.isFinite(val) ? fmt(val) : ''} aria-label={`${f.label}, exact value`}
                  onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) set(f.key, n); }}
                  className="w-24 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-end font-mono text-xs tabular-nums text-zinc-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-white" />
              </div>
              <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={val} onChange={(e) => set(f.key, Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
            </div>
          );
        })}
        <button type="button" className={cn(small, 'self-start')} onClick={() => setValues((all) => ({ ...all, [app.id]: defaults(app) }))}>Start again</button>
      </aside>
      <section className="panel flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-label={`${app.title}: the figure and results`} aria-busy={busy} data-no-motion>
        <div className="relative min-h-[18rem] flex-1">
          {fig
            ? <div className="h-full [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full" role="img" aria-label={`${app.title}: the figure`} dangerouslySetInnerHTML={{ __html: dark ? fig.dark : fig.light }} />
            : <div className="grid h-full place-items-center text-xs text-zinc-500 dark:text-zinc-400">{busy ? 'Working it out…' : error ? '' : 'No figure for this view: see the results below.'}</div>}
          {busy && fig && <span className="absolute end-2 top-2 rounded-md bg-zinc-900/80 px-2 py-0.5 text-xs text-white">Working…</span>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
        {results.length > 0 && (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((r) => (
              <div key={r.label} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.04]">
                <dt className="text-xs text-zinc-600 dark:text-zinc-300">{r.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {printed && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200">What it printed</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 font-mono text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-200" tabIndex={0} translate="no">{printed}</pre>
          </details>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200">The script</summary>
          <div className="mt-1 flex gap-1">
            <button type="button" className={small} onClick={copy}>{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" className={small} onClick={openInCode}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
          </div>
          <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-zinc-50 p-2 font-mono text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-200" tabIndex={0} translate="no">{code}</pre>
        </details>
      </section>
    </div>
  );
}
