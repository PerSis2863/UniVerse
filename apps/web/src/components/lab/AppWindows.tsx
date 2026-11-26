'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { AppOut, PartOut } from '@/lib/lab/app-lab';
import type { FigOut } from './lab.worker';

// Hyperion's apps (M554): the windows a script made with uifigure, drawn over the Code window's figure side. Each part
// sits where its Position puts it (MATLAB's pixels, measured from the bottom left), scaled down when the window is
// smaller than the app; a press, a slide (when let go), a typed value (on Enter or leaving the field) or a choice
// goes to the worker, which runs the part's callback. A uiaxes shows its figure. Close hides a window until the next run.

type Send = (part: number, value: number | string | boolean | null) => void;

function PartView({ p, fig, dark, send, busy }: { p: PartOut; fig: FigOut | undefined; dark: boolean; send: Send; busy: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const off = !p.enable || busy;
  const field = 'w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[13px] text-zinc-900 dark:border-white/20 dark:bg-zinc-900 dark:text-white';
  switch (p.kind) {
    case 'button': return <button type="button" disabled={off} onClick={() => send(p.id, null)} className="h-full w-full rounded-md bg-zinc-900 px-2 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">{p.text}</button>;
    case 'label': return <span className="block truncate text-[13px] text-zinc-800 dark:text-zinc-100">{p.text}</span>;
    case 'checkbox': return <label className="flex items-center gap-2 text-[13px] text-zinc-800 dark:text-zinc-100"><input type="checkbox" disabled={off} checked={!!p.value} onChange={(e) => send(p.id, e.target.checked)} className="h-4 w-4 accent-violet-600" />{p.text}</label>;
    case 'dropdown': return <select aria-label={p.text || 'Choice'} disabled={off} value={String(p.value)} onChange={(e) => send(p.id, e.target.value)} className={field}>{p.items.map((i) => <option key={i} value={i}>{i}</option>)}</select>;
    case 'slider': {
      const v = draft !== null ? Number(draft) : Number(p.value);
      return (
        <label className="flex items-center gap-2">
          <span className="sr-only">{p.text || 'Slider'}</span>
          <input type="range" min={p.limits[0]} max={p.limits[1]} step={(p.limits[1] - p.limits[0]) / 200} value={v} disabled={off} className="min-w-0 flex-1 accent-violet-600"
            onChange={(e) => setDraft(e.target.value)} onPointerUp={() => { if (draft !== null) { send(p.id, Number(draft)); setDraft(null); } }} onKeyUp={() => { if (draft !== null) { send(p.id, Number(draft)); setDraft(null); } }} />
          <span className="w-12 text-end font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{+v.toPrecision(4)}</span>
        </label>
      );
    }
    case 'editfield': case 'numfield': {
      const commit = () => { if (draft === null) return; send(p.id, p.kind === 'numfield' ? Number(draft) || 0 : draft); setDraft(null); };
      return <input aria-label={p.text || 'Value'} disabled={off} inputMode={p.kind === 'numfield' ? 'decimal' : undefined} value={draft ?? String(p.value)} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} className={field} />;
    }
    case 'axes': return fig ? <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" role="img" aria-label="App axes" dangerouslySetInnerHTML={{ __html: dark ? fig.dark : fig.light }} /> : <div className="h-full w-full rounded border border-dashed border-zinc-300 dark:border-white/20" />;
  }
}

export function AppWindows({ apps, figs, dark, busy, send }: { apps: AppOut[]; figs: FigOut[]; dark: boolean; busy: boolean; send: Send }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const shown = apps.filter((a) => !hidden.includes(a.id));
  if (!shown.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-end justify-end gap-3" data-no-arrange>
      {shown.map((a) => {
        const [, , W, H] = a.pos, scale = Math.min(1, 560 / W, (typeof window === 'undefined' ? 800 : window.innerHeight * 0.6) / H);
        return (
          <section key={a.id} aria-label={a.name} className="panel pointer-events-auto overflow-hidden p-0 shadow-xl">
            <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-1.5 dark:border-white/10">
              <span className="flex-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-white" translate="no">{a.name}</span>
              <button type="button" aria-label={`Close ${a.name}`} onClick={() => setHidden((h) => [...h, a.id])} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" aria-hidden /></button>
            </div>
            <div className="relative" style={{ width: W * scale, height: H * scale }}>
              {a.parts.map((p) => (
                <div key={p.id} className="absolute" style={{ left: p.pos[0] * scale, bottom: p.pos[1] * scale, width: p.pos[2] * scale, height: Math.max(p.kind === 'slider' ? 24 : 0, p.pos[3] * scale) }}>
                  <PartView p={p} fig={p.figure !== null ? figs.find((f) => f.id === p.figure) : undefined} dark={dark} send={send} busy={busy} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
