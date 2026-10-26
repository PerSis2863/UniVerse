'use client';

import { useRef, useState } from 'react';
import type { Button, Controls } from './core';

// On a phone: a joystick under the left thumb, the rest of the screen turns the camera, and big
// buttons under the right thumb (two columns when a game has more than four). Hidden on computers
// (keys and the mouse there).

export function TouchPad({ controls, buttons }: { controls: React.RefObject<Controls | null>; buttons: { id: Button; label: string }[] }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 56, many = buttons.length > 4;

  const down = (e: React.PointerEvent) => {
    const c = controls.current;
    if (!c) return;
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (x < r.width * 0.42 && !stick.current) { stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; setKnob({ x: 0, y: 0 }); }
    else if (!look.current) look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const move = (e: React.PointerEvent) => {
    const c = controls.current;
    if (!c) return;
    if (stick.current?.id === e.pointerId) {
      let dx = e.clientX - stick.current.x, dy = e.clientY - stick.current.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      c.setStick(dx / R, dy / R);
      setKnob({ x: dx, y: dy });
    } else if (look.current?.id === e.pointerId) {
      c.turn((e.clientX - look.current.x) * 0.006, (e.clientY - look.current.y) * 0.006);
      look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  };
  const up = (e: React.PointerEvent) => {
    const c = controls.current;
    if (stick.current?.id === e.pointerId) { stick.current = null; setKnob(null); c?.setStick(0, 0); }
    if (look.current?.id === e.pointerId) look.current = null;
  };

  return (
    <div className="absolute inset-0 touch-none select-none [@media(pointer:fine)]:hidden" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="pointer-events-none absolute bottom-6 start-6 grid h-28 w-28 place-items-center rounded-full bg-white/10 ring-1 ring-white/25">
        <span className="h-12 w-12 rounded-full bg-white/70 shadow-lg" style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }} />
      </div>
      <div className={many ? 'absolute bottom-5 end-4 grid grid-cols-2 gap-2.5' : 'absolute bottom-6 end-6 flex flex-col items-end gap-3'}>
        {buttons.map((b) => (
          <button key={b.id} type="button" className={`grid place-items-center rounded-full bg-white/85 font-black uppercase text-zinc-900 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none ${many ? 'h-14 w-14 text-[10px]' : 'h-16 w-16 text-xs'}`}
            onPointerDown={(e) => { e.stopPropagation(); controls.current?.press(b.id); }}
            onPointerUp={(e) => { e.stopPropagation(); controls.current?.release(b.id); }}
            onPointerCancel={() => controls.current?.release(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
