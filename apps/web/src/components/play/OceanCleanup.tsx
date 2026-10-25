'use client';

import { useMemo, useRef, useState } from 'react';
import { GAMES } from '@/lib/play';
import { OCEAN_COMBO_MS, OCEAN_HIT, SEA, isLife, oceanMultiplier, oceanSchedule, type Drift } from '@/lib/play/ocean';
import { burst, calmMotion, drawEffects, steerBody, useGameCanvas, useSteer, type Float, type Particle } from './canvas';
import type { GameProps } from './game-props';

// Ocean Cleanup (src/lib/play/ocean.ts): a boat on a living sea. Plastic drifts down; scoop it up
// for points and combos. Bump into a turtle, fish or octopus and the boat spins out for a moment.
// Drawn on one canvas: rolling swell, sun glitter, the boat's wake, splashes and floating scores.

interface Live { d: Drift; x: number; y: number; state: null | 'got' | 'hit'; t: number }

export function OceanCleanup({ seed, startsAt, clock, onProgress }: GameProps) {
  const sea = useMemo(() => oceanSchedule(seed, GAMES.ocean.seconds), [seed]);
  const box = useRef<HTMLDivElement>(null);
  const steer = useSteer(box);
  const [said, setSaid] = useState('');
  const g = useRef({
    boat: { x: -1, y: 0, vx: 0, vy: 0 }, next: 0, live: [] as Live[], score: 0, combo: 0, lastPick: -1e9, stunUntil: 0, picked: 0, hits: 0,
    wake: [] as { x: number; y: number }[], parts: [] as Particle[], floats: [] as Float[], shake: 0, reported: -1, calm: calmMotion(),
  });

  const canvas = useGameCanvas((ctx, w, h, dt) => {
    const s = g.current, t = clock() - startsAt, b = s.boat;
    if (b.x < 0) { b.x = w / 2; b.y = h * 0.78; }

    // Things drift in on the shared schedule.
    while (s.next < sea.length && sea[s.next].at <= t) {
      const d = sea[s.next++];
      s.live.push({ d, x: d.x * w, y: -30, state: null, t: 0 });
    }
    const stunned = t < s.stunUntil;
    steerBody(b, steer.current, dt, stunned ? 120 : 560, { x0: 28, x1: w - 28, y0: h * 0.3, y1: h - 34 });

    // Move, collide, and drop what's gone.
    for (let i = s.live.length - 1; i >= 0; i--) {
      const o = s.live[i];
      if (o.state) { o.t += dt; o.y += (o.state === 'hit' ? 220 : -30) * dt; if (o.t > 0.45) s.live.splice(i, 1); continue; }
      o.y += o.d.speed * h * dt;
      o.x += Math.sin(t / 700 + o.d.wobble) * 18 * dt;
      if (o.y > h + 40) { s.live.splice(i, 1); continue; }
      if (Math.hypot(o.x - b.x, o.y - b.y) < 36) {
        if (isLife(o.d.kind)) {
          if (stunned) continue;
          o.state = 'hit';
          s.score = Math.max(0, s.score - OCEAN_HIT); s.combo = 0; s.hits++;
          s.stunUntil = t + 750; s.shake = s.calm ? 0 : 0.28;
          s.floats.push({ x: o.x, y: o.y - 10, text: `−${OCEAN_HIT}`, color: '#f87171', life: 0 });
          burst(s.parts, o.x, o.y, '#fca5a5', s.calm ? 4 : 14);
          navigator.vibrate?.([40, 30, 40]);
        } else {
          o.state = 'got';
          s.combo = t - s.lastPick < OCEAN_COMBO_MS ? s.combo + 1 : 0;
          s.lastPick = t;
          const pts = Math.round(SEA[o.d.kind].pts * oceanMultiplier(s.combo));
          s.score += pts; s.picked++;
          s.floats.push({ x: o.x, y: o.y - 10, text: s.combo ? `+${pts} ×${oceanMultiplier(s.combo).toFixed(1)}` : `+${pts}`, color: o.d.kind === 'net' ? '#f9a8d4' : '#a5f3fc', life: 0 });
          burst(s.parts, o.x, o.y, o.d.kind === 'net' ? '#f472b6' : '#67e8f9', s.calm ? 5 : 18);
          navigator.vibrate?.(8);
        }
      }
    }
    if (s.score !== s.reported) {
      s.reported = s.score;
      onProgress(s.score, s.picked);
      if (s.picked && s.picked % 10 === 0) setSaid(`${s.picked} pieces of plastic cleared.`);
    }

    // Draw: the sea first.
    ctx.save();
    if (s.shake > 0) { s.shake -= dt; ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); }
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0e3a4f'); sky.addColorStop(0.55, '#0a2534'); sky.addColorStop(1, '#0B0B0C');
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, w + 20, h + 20);
    const time = t / 1000;
    for (let row = 0; row < 14; row++) {
      const y0 = ((row * 46 + time * 28) % (h + 60)) - 30;
      ctx.strokeStyle = `rgba(165,243,252,${0.04 + (y0 / h) * 0.06})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 70 + time * 1.4 + row) * 5);
      ctx.stroke();
    }
    // Sun glitter on the swell.
    for (let k = 0; k < 26; k++) {
      const gx = (Math.sin(k * 91.7) * 0.5 + 0.5) * w, gy = ((Math.cos(k * 37.3) * 0.5 + 0.5) * h + time * 30) % h;
      ctx.globalAlpha = 0.15 + 0.15 * Math.sin(time * 3 + k);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(gx, gy, 6, 1.5);
    }
    ctx.globalAlpha = 1;

    // Floating things.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of s.live) {
      const k = o.d.kind, life = isLife(k);
      ctx.globalAlpha = o.state ? Math.max(0, 1 - o.t / 0.45) : 1;
      if (k === 'net' && !o.state) { ctx.fillStyle = 'rgba(244,114,182,0.18)'; ctx.beginPath(); ctx.arc(o.x, o.y, 26, 0, Math.PI * 2); ctx.fill(); }
      if (life && !o.state) { ctx.strokeStyle = 'rgba(248,113,113,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, o.y, 22, 0, Math.PI * 2); ctx.stroke(); }
      ctx.font = `${o.state === 'got' ? 34 - o.t * 40 : 30}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.sin(time * 2 + o.d.wobble) * 0.18);
      ctx.fillText(SEA[k].emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // The wake, then the boat.
    s.wake.push({ x: b.x, y: b.y + 18 });
    if (s.wake.length > 26) s.wake.shift();
    for (let i = 1; i < s.wake.length; i++) {
      const a = s.wake[i - 1], c = s.wake[i], spread = (s.wake.length - i) * 0.9;
      ctx.strokeStyle = `rgba(224,242,254,${(i / s.wake.length) * 0.35})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x - spread, a.y + (s.wake.length - i) * 1.2); ctx.lineTo(c.x - spread * 0.9, c.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x + spread, a.y + (s.wake.length - i) * 1.2); ctx.lineTo(c.x + spread * 0.9, c.y); ctx.stroke();
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.max(-0.35, Math.min(0.35, b.vx / 1400)) + (stunned && !s.calm ? Math.sin(t / 40) * 0.4 : 0));
    ctx.globalAlpha = stunned && Math.floor(t / 90) % 2 ? 0.5 : 1;
    ctx.shadowColor = 'rgba(236,72,153,0.55)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(17, -8, 15, 18); ctx.lineTo(-15, 18); ctx.quadraticCurveTo(-17, -8, 0, -26); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ec4899'; ctx.fillRect(-15, 10, 30, 8);
    ctx.fillStyle = '#141416'; ctx.beginPath(); ctx.roundRect(-7, -8, 14, 14, 4); ctx.fill();
    // The scoop net at the bow.
    ctx.strokeStyle = 'rgba(244,114,182,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -26, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();

    drawEffects(ctx, s.parts, s.floats, dt);

    // Combo meter.
    const left = Math.max(0, 1 - (t - s.lastPick) / OCEAN_COMBO_MS);
    if (s.combo > 0 && left > 0) {
      ctx.fillStyle = 'rgba(20,20,22,0.75)'; ctx.beginPath(); ctx.roundRect(12, 12, 132, 34, 10); ctx.fill();
      ctx.fillStyle = '#f9a8d4'; ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`Combo ×${oceanMultiplier(s.combo).toFixed(1)}`, 22, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(22, 36, 112, 4);
      ctx.fillStyle = '#ec4899'; ctx.fillRect(22, 36, 112 * left, 4);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(224,242,254,0.85)'; ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(`♻ ${s.picked} cleared`, w - 14, 24);
    ctx.restore();
  });

  return (
    <div className="mx-auto w-full">
      <div ref={box} className="relative h-[min(64vh,560px)] min-h-80 w-full touch-none select-none overflow-hidden rounded-3xl ring-1 ring-black/10 dark:ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Ocean Cleanup: a boat on the sea. Steer with the mouse, a finger or the arrow keys to scoop up plastic and avoid sea life." />
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Steer: move the mouse or drag · arrow keys or WASD. Pink circles are ghost nets (150).</p>
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}
