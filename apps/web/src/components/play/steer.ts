'use client';

import { useEffect, useRef } from 'react';

// Steering for the action games (UniVerse Play M32; drawn in 3D since M103, world/board.ts): a point
// under the mouse or finger (in the game box's pixels), or the arrow keys / WASD, and a body that
// moves toward it smoothly with a speed cap. The rules of Flood Rescue and Ocean Cleanup run on this.

export interface Steer { tx: number | null; ty: number | null; keys: Set<string> }
const KEYS: Record<string, string> = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd', A: 'l', D: 'r', W: 'u', S: 'd' };

/** Where the player is steering: a point under the mouse or finger (in the element's pixels), or keys held. */
export function useSteer(el: React.RefObject<HTMLElement | null>) {
  const steer = useRef<Steer>({ tx: null, ty: null, keys: new Set() });
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const s = steer.current;
    const at = (e: PointerEvent) => { const r = node.getBoundingClientRect(); s.tx = e.clientX - r.left; s.ty = e.clientY - r.top; };
    const down = (e: PointerEvent) => { at(e); node.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => { if (e.pointerType === 'mouse' || e.buttons) at(e); };
    const key = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (!k || e.metaKey || e.ctrlKey) return;
      e.preventDefault(); // arrows steer, they don't scroll the page
      if (e.type === 'keydown') { s.keys.add(k); s.tx = s.ty = null; } else s.keys.delete(k);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    };
  }, [el]);
  return steer;
}

/** Moves a body toward the steering point (smoothly, capped) or by the keys held. */
export function steerBody(b: { x: number; y: number; vx: number; vy: number }, s: Steer, dt: number, max: number, box: { x0: number; x1: number; y0: number; y1: number }) {
  let ax = 0, ay = 0;
  if (s.keys.size) {
    ax = (s.keys.has('r') ? 1 : 0) - (s.keys.has('l') ? 1 : 0);
    ay = (s.keys.has('d') ? 1 : 0) - (s.keys.has('u') ? 1 : 0);
    b.vx += ax * max * 6 * dt; b.vy += ay * max * 6 * dt;
  } else if (s.tx !== null && s.ty !== null) {
    b.vx += ((s.tx - b.x) * 7 - b.vx) * Math.min(1, dt * 9);
    b.vy += ((s.ty - b.y) * 7 - b.vy) * Math.min(1, dt * 9);
  }
  if (!ax) b.vx *= s.keys.size ? Math.pow(0.02, dt) : 1;
  if (!ay) b.vy *= s.keys.size ? Math.pow(0.02, dt) : 1;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
  if (!s.keys.size && s.tx === null) { b.vx *= Math.pow(0.05, dt); b.vy *= Math.pow(0.05, dt); }
  b.x = Math.max(box.x0, Math.min(box.x1, b.x + b.vx * dt));
  b.y = Math.max(box.y0, Math.min(box.y1, b.y + b.vy * dt));
}

/** True when the device asks for less motion (fewer particles, no shake). */
export const calmMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
