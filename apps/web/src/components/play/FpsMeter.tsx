'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// The frame-rate readout (M100, the owner: "at least 60 fps for each game"): frames counted over
// half a second, green from 55, amber from 40, red below. Shown when switched on in a game's bar.

const KEY = 'uv-play-fps';
export const fpsShown = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const showFps = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } };

export function FpsMeter({ className }: { className?: string }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0, n = 0, from = performance.now();
    const tick = (t: number) => {
      n++;
      if (t - from >= 500) { setFps(Math.round((n * 1000) / (t - from))); n = 0; from = t; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className={cn('rounded-full bg-black/60 px-2.5 py-1 font-mono text-xs font-bold tabular-nums ring-1', fps >= 55 ? 'text-emerald-300 ring-emerald-400/30' : fps >= 40 ? 'text-amber-300 ring-amber-400/30' : 'text-red-300 ring-red-400/30', className)}>
      {fps || '…'} fps
    </span>
  );
}
