'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Download, Film, Pause, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMedia } from '@/lib/use-media';
import { GifWriter, indexPixels, PaletteMaker } from '@/lib/lab/gif';
import { findings, num, sweepColumns, sweepCsv, type Column, type SweepFrame } from '@/lib/lab/sweep';

// Hyperion's Sweep (M402): the frames of a slider run through its range, played like a film (and saved as a GIF),
// with the numbers each run left behind in a table that says where they peak.

export interface ShownFrame extends SweepFrame { lightUrl: string; darkUrl: string }
export interface Sweep { script: number; scriptName: string; name: string; values: number[]; frames: (ShownFrame | undefined)[]; done: boolean }
export const FRAME_W = 640, FRAME_H = 480;
const RATES = [2, 4, 8, 12];

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** The film as a GIF, drawn from the light frames a frame at a time (the page stays smooth while it works). */
async function makeGif(frames: ShownFrame[], fps: number, progress: (k: number) => void): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W; canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pics: Uint8ClampedArray[] = [], pm = new PaletteMaker();
  for (const f of frames) {
    const img = new window.Image();
    img.src = f.lightUrl;
    await img.decode();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.drawImage(img, 0, 0, FRAME_W, FRAME_H);
    const px = ctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
    pm.add(px); pics.push(px);
    progress(pics.length / (frames.length * 2));
    await pause();
  }
  const pal = pm.make(), gif = new GifWriter(FRAME_W, FRAME_H, pal);
  for (let k = 0; k < pics.length; k++) {
    gif.frame(indexPixels(pics[k], pal), 1000 / fps);
    progress((frames.length + k + 1) / (frames.length * 2));
    await pause();
  }
  return new Blob([gif.finish() as BlobPart], { type: 'image/gif' });
}

/** A small line of how a result moves across the sweep, a dot where the film is. */
function Trend({ c, k }: { c: Column; k: number }) {
  const W = 72, H = 18, real = c.values.filter((v): v is number => v !== null), lo = Math.min(...real), hi = Math.max(...real);
  const x = (i: number) => (c.values.length > 1 ? (i / (c.values.length - 1)) * (W - 4) + 2 : W / 2);
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4);
  const pts = c.values.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const now = c.values[k];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="mt-0.5 block text-violet-600 dark:text-violet-300" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      {now !== null && now !== undefined && <circle cx={x(k)} cy={y(now)} r="2.4" fill="currentColor" />}
    </svg>
  );
}

export function LabSweep({ sweep, dark, onClose, onUse, onDownload }: {
  sweep: Sweep; dark: boolean; onClose: () => void; onUse: ((v: number) => void) | null;
  onDownload: (name: string, body: BlobPart, type: string) => void;
}) {
  const { name, values, frames, done } = sweep;
  const arrived = frames.filter(Boolean).length;
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(4);
  const [gifAt, setGifAt] = useState<number | null>(null);
  const still = useMedia('(prefers-reduced-motion: reduce)');
  // While it runs the newest frame shows; once done it plays (unless a frame was picked, or motion is reduced).
  const newest = Math.max(0, frames.reduce((m, f, i) => (f ? i : m), -1));
  const k = Math.min(picked ?? newest, Math.max(0, values.length - 1));
  const started = useRef(false);
  useEffect(() => {
    if (!done || started.current) return;
    started.current = true;
    if (picked === null && !still && arrived > 1) { const t = window.setTimeout(() => { setPicked(0); setPlaying(true); }, 0); return () => clearTimeout(t); }
  }, [done, picked, still, arrived]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setPicked((p) => ((p ?? 0) + 1) % Math.max(1, arrived)), 1000 / fps);
    return () => clearTimeout(t);
  }, [playing, fps, k, arrived]);
  const seek = (i: number) => { setPlaying(false); setPicked(Math.max(0, Math.min(values.length - 1, i))); };

  const f = frames[k];
  const cols = sweepColumns(frames, name);
  const says = done ? findings(cols, name, values) : [];
  const films = frames.filter((x): x is ShownFrame => !!x && !!x.light);
  const saveGif = async () => {
    if (gifAt !== null || !films.length) return;
    setGifAt(0);
    try {
      const blob = await makeGif(films, fps, setGifAt);
      onDownload(`sweep-${name}.gif`, blob, 'image/gif');
      toast.success(`GIF saved: ${films.length} frames, ${(blob.size / 1e6).toFixed(1)} MB.`);
    } catch { toast.error('Couldn’t make the GIF in this browser.'); } finally { setGifAt(null); }
  };
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';
  const iconBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 disabled:opacity-35 dark:text-zinc-200 dark:hover:bg-white/[0.1]';
  const v = values[k];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0" data-no-motion data-no-arrange>
      <div role="group" aria-label={`Sweep of ${name}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
        <span className="inline-flex items-center gap-0.5">
          <button type="button" className={iconBtn} aria-label="Previous frame" disabled={k === 0} onClick={() => seek(k - 1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
          <button type="button" className={cn(iconBtn, 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400')} aria-label={playing ? 'Pause' : 'Play'} disabled={arrived < 2} onClick={() => { if (!playing && picked === null) setPicked(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}</button>
          <button type="button" className={iconBtn} aria-label="Next frame" disabled={k >= arrived - 1} onClick={() => seek(k + 1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
        </span>
        <input type="range" min={0} max={Math.max(0, values.length - 1)} value={k} onChange={(e) => seek(Number(e.target.value))} aria-label="Frame" className="min-w-[6rem] flex-1 accent-violet-600" />
        <span className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-100" translate="no">{name} = {num(v)}</span>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{done ? `${k + 1} / ${values.length}` : `running ${arrived} / ${values.length}…`}</span>
        <label className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">Speed
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs dark:border-white/15 dark:bg-white/[0.06]">
            {RATES.map((r) => <option key={r} value={r}>{r} a second</option>)}
          </select>
        </label>
        <button type="button" className={iconBtn} aria-label="Close the sweep" onClick={onClose}><X className="h-4 w-4" aria-hidden /></button>
      </div>

      <div className="px-2 pt-2">
        {!f ? <div className="grid h-40 place-items-center text-[13px] text-zinc-500 dark:text-zinc-400">Running {name} = {num(v)}…</div>
          : f.error ? <p className="rounded-lg bg-red-50 p-3 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-300">With {name} = {num(v)} the script stopped: {f.error}</p>
            : f.light ? <Image unoptimized src={dark ? f.darkUrl : f.lightUrl} width={FRAME_W} height={FRAME_H} alt={`The figure with ${name} = ${num(v)}`} className="mx-auto h-auto max-h-[min(55vh,26rem)] w-full object-contain" draggable={false} />
              : <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">This run drew no figure; its numbers are in the table below.</p>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:thin]" aria-label="Frames">
        {values.map((val, i) => {
          const fr = frames[i];
          return (
            <button key={i} type="button" onClick={() => seek(i)} aria-pressed={i === k} aria-label={`${name} = ${num(val)}`}
              className={cn('flex shrink-0 flex-col items-center gap-0.5 rounded-lg p-1 outline-offset-1', i === k ? 'bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-500/20' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
              {fr?.light && !fr.error ? <Image unoptimized src={dark ? fr.darkUrl : fr.lightUrl} width={FRAME_W} height={FRAME_H} alt="" className="h-auto w-20 rounded" draggable={false} />
                : <span className={cn('grid h-[60px] w-20 place-items-center rounded text-[11px]', fr?.error ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400')}>{fr?.error ? 'error' : fr ? 'no figure' : '…'}</span>}
              <span className="font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">{num(val)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-zinc-200/80 px-3 py-1.5 dark:border-white/10">
        <button type="button" className={btn} disabled={!done || !films.length || gifAt !== null} onClick={() => void saveGif()}>
          <Film className="h-3.5 w-3.5" aria-hidden />{gifAt !== null ? `Making the GIF… ${Math.round(gifAt * 100)}%` : 'Save as GIF'}
        </button>
        <button type="button" className={btn} disabled={!done || !cols.length} onClick={() => onDownload(`sweep-${name}.csv`, sweepCsv(cols, name, values), 'text/csv')}><Download className="h-3.5 w-3.5" aria-hidden />Table as CSV</button>
        {onUse && <button type="button" className={btn} disabled={!f || !!f.error} onClick={() => onUse(v)}><Check className="h-3.5 w-3.5" aria-hidden />Use {name} = {num(v)}</button>}
      </div>

      {cols.length > 0 ? (
        <div className="px-3 pb-3">
          <div className="max-h-64 overflow-auto rounded-lg border border-zinc-200/80 dark:border-white/10" tabIndex={0} role="region" aria-label="What each run gave">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="sticky top-0 bg-white text-xs text-zinc-500 dark:bg-[#1b1d22] dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 text-start font-medium" translate="no">{name}</th>
                  {cols.map((c) => <th key={c.name} className="px-2 py-1.5 text-end font-medium"><span className="font-mono" translate="no">{c.name}</span>{done && <span className="flex justify-end"><Trend c={c} k={k} /></span>}</th>)}
                </tr>
              </thead>
              <tbody>
                {values.map((val, i) => (
                  <tr key={i} onClick={() => seek(i)} className={cn('cursor-pointer border-t border-zinc-100 dark:border-white/[0.06]', i === k ? 'bg-violet-100/70 dark:bg-violet-900/40' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.04]')}>
                    <td className="px-2 py-1 font-mono text-zinc-900 dark:text-white">{num(val)}</td>
                    {cols.map((c) => {
                      const top = done && c.max === i, low = done && c.min === i;
                      return (
                        <td key={c.name} className={cn('px-2 py-1 text-end font-mono', top || low ? 'font-semibold text-violet-800 dark:text-violet-200' : 'text-zinc-700 dark:text-zinc-200')}>
                          {num(c.values[i])}{top && <span aria-hidden> ▲</span>}{low && <span aria-hidden> ▼</span>}
                          {top && <span className="sr-only"> (largest)</span>}{low && <span className="sr-only"> (smallest)</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {says.length > 0 && <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">{says.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      ) : done && <p className="px-3 pb-3 text-xs text-zinc-500 dark:text-zinc-400">No single number changed from one run to the next, so there is no table: give a result a name (r = …) to see it here.</p>}
    </div>
  );
}
