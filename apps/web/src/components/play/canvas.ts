'use client';

import { useEffect, useRef } from 'react';

// The action games' engine (UniVerse Play M32): one canvas drawn by requestAnimationFrame (sharp on
// retina screens, resized with its box, paused by the browser in a hidden tab), and steering from
// the mouse, a finger or the arrow keys / WASD. Game state lives outside React; React only shows
// the score.

export type Frame = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void;

export function useGameCanvas(frame: Frame) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(frame);
  useEffect(() => { latest.current = frame; });
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const size = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(size);
    ro.observe(c);
    size();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (w && h) latest.current(ctx, w, h, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return ref;
}

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

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
export interface Float { x: number; y: number; text: string; color: string; life: number }

/** A burst of sparks or droplets at a point. */
export function burst(list: Particle[], x: number, y: number, color: string, n: number, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0, max: 0.5 + Math.random() * 0.4, color, size: 1.5 + Math.random() * 2.5 });
  }
  if (list.length > 300) list.splice(0, list.length - 300);
}

/** Moves and draws sparks and floating "+50"s; drops the finished ones. */
export function drawEffects(ctx: CanvasRenderingContext2D, parts: Particle[], floats: Float[], dt: number) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max) { parts.splice(i, 1); continue; }
    p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = '700 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life += dt;
    if (f.life >= 1) { floats.splice(i, 1); continue; }
    const e = 1 - (1 - f.life) ** 3;
    ctx.globalAlpha = f.life < 0.15 ? f.life / 0.15 : 1 - Math.max(0, f.life - 0.6) / 0.4;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - e * 42);
  }
  ctx.globalAlpha = 1;
}

export const calmMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
