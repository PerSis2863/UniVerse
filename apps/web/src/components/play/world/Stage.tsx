'use client';

import { useEffect, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import type { Controls } from './core';
import { TouchPad } from './TouchPad';

// The frame every 3D world plays in: the canvas, the game's own overlays (its HUD), the phone
// controls, and on a computer a hint to click (the mouse then turns the camera; Esc frees it).

export function WorldFrame({ canvas, controls, buttons, keys, children, label }: {
  canvas: React.RefObject<HTMLCanvasElement | null>; controls: React.RefObject<Controls | null>;
  buttons: { id: 'jump' | 'fire' | 'act'; label: string }[]; keys: string; label: string; children?: React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const on = () => setLocked(!!document.pointerLockElement && document.pointerLockElement === canvas.current);
    document.addEventListener('pointerlockchange', on);
    return () => document.removeEventListener('pointerlockchange', on);
  }, [canvas]);
  return (
    <div className="relative h-[min(76vh,760px)] min-h-[420px] w-full select-none overflow-hidden rounded-[1.75rem] bg-black ring-1 ring-white/10">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full cursor-crosshair outline-none" tabIndex={0} aria-label={label} />
      {children}
      <TouchPad controls={controls} buttons={buttons} />
      {!locked && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto hidden w-fit items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white ring-1 ring-white/15 [@media(pointer:fine)]:flex">
          <MousePointer2 className="h-3.5 w-3.5" aria-hidden />Click to look around · {keys} · Esc frees the mouse
        </p>
      )}
    </div>
  );
}

/** A big number with a label, for the worlds' HUDs. */
export function HudChip({ label, value, tone = 'white' }: { label: string; value: React.ReactNode; tone?: 'white' | 'good' | 'bad' | 'gold' }) {
  const c = { white: 'text-white', good: 'text-emerald-300', bad: 'text-red-300', gold: 'text-amber-300' }[tone];
  return (
    <div className="rounded-2xl bg-black/55 px-3.5 py-2 ring-1 ring-white/15">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{label}</p>
      <p className={`text-xl font-black tabular-nums leading-tight ${c}`}>{value}</p>
    </div>
  );
}
