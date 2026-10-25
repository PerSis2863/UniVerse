'use client';

import { useMemo, useRef, useState } from 'react';
import { GAMES } from '@/lib/play';
import { CAPACITY, HELIPAD, RESCUE_LOST, rescuePoints, rescueSchedule, rescueTown, waterLevel, type Stranded } from '@/lib/play/rescue';
import { burst, calmMotion, drawEffects, steerBody, useGameCanvas, useSteer, type Float, type Particle } from './canvas';
import type { GameProps } from './game-props';

// Flood Rescue (src/lib/play/rescue.ts): a storm, a town going under, people waving from rooftops.
// Fly low and slow over a roof to winch them up, four at a time, then set down on the hospital's
// pad on the hill. The water keeps rising; low roofs go first. Drawn on one canvas: rain, lightning,
// a spotlight, the winch rope, the swell of the flood.

const WINCH_S = 0.55;
const UNLOAD_S = 0.3;
const SLOW = 190;

export function FloodRescue({ seed, startsAt, clock, onProgress }: GameProps) {
  const roofs = useMemo(() => rescueTown(seed), [seed]);
  const people = useMemo(() => rescueSchedule(seed, GAMES.rescue.seconds, roofs), [seed, roofs]);
  const box = useRef<HTMLDivElement>(null);
  const steer = useSteer(box);
  const [said, setSaid] = useState('');
  const g = useRef({
    heli: { x: -1, y: 0, vx: 0, vy: 0 }, aboard: [] as (Stranded & { pickedAt: number })[], gone: new Set<number>(), winch: 0, unload: 0,
    score: 0, saved: 0, lost: 0, reported: -1, parts: [] as Particle[], floats: [] as Float[], rain: [] as { x: number; y: number; s: number }[],
    flash: 0, nextBolt: 9 + (seed % 7), calm: calmMotion(),
  });

  const canvas = useGameCanvas((ctx, w, h, dt) => {
    const s = g.current, t = clock() - startsAt, hl = s.heli, time = t / 1000;
    if (hl.x < 0) { hl.x = HELIPAD.x * w; hl.y = HELIPAD.top * h - 70; }
    const water = waterLevel(t, GAMES.rescue.seconds) * h;
    const roofPx = roofs.map((r) => ({ x0: r.x * w, x1: (r.x + r.w) * w, top: r.top * h }));
    const pad = { x0: (HELIPAD.x - HELIPAD.w / 2) * w, x1: (HELIPAD.x + HELIPAD.w / 2) * w, top: HELIPAD.top * h };

    steerBody(hl, steer.current, dt, 420, { x0: 30, x1: w - 30, y0: 40, y1: water - 26 });
    const speed = Math.hypot(hl.vx, hl.vy);

    // Who's waiting now, and who was lost to the water or to time.
    const waiting = people.filter((p) => p.at <= t && !s.gone.has(p.id));
    for (const p of waiting) {
      if (t > p.at + p.ttl || roofs[p.roof].top * h > water) {
        s.gone.add(p.id); s.lost++;
        s.score = Math.max(0, s.score - RESCUE_LOST);
        const r = roofPx[p.roof];
        s.floats.push({ x: (r.x0 + r.x1) / 2, y: r.top - 24, text: `−${RESCUE_LOST}`, color: '#f87171', life: 0 });
        burst(s.parts, (r.x0 + r.x1) / 2, r.top, '#7dd3fc', s.calm ? 3 : 10, 120);
      }
    }

    // Winch: low and slow over a roof with someone on it.
    const over = roofPx.findIndex((r) => hl.x > r.x0 - 6 && hl.x < r.x1 + 6 && hl.y > r.top - 130 && hl.y < r.top - 20);
    const here = over >= 0 ? waiting.filter((p) => p.roof === over && !s.gone.has(p.id)) : [];
    const winching = here.length > 0 && speed < SLOW && s.aboard.length < CAPACITY;
    if (winching) {
      s.winch += dt;
      if (s.winch >= WINCH_S) {
        const p = here[0];
        s.gone.add(p.id); s.aboard.push({ ...p, pickedAt: t }); s.winch = 0;
        burst(s.parts, hl.x, hl.y + 20, '#f9a8d4', s.calm ? 3 : 8, 90);
        navigator.vibrate?.(10);
      }
    } else s.winch = Math.max(0, s.winch - dt * 2);

    // Land at the hospital: everyone aboard gets off, one by one.
    const landed = hl.x > pad.x0 && hl.x < pad.x1 && hl.y > pad.top - 110 && hl.y < pad.top - 15 && speed < SLOW;
    if (landed && s.aboard.length) {
      s.unload += dt;
      if (s.unload >= UNLOAD_S) {
        const p = s.aboard.shift()!;
        const pts = rescuePoints(p.pickedAt - p.at, p.ttl);
        s.score += pts; s.saved++; s.unload = 0;
        s.floats.push({ x: hl.x, y: hl.y - 26, text: `+${pts}`, color: '#86efac', life: 0 });
        burst(s.parts, hl.x, pad.top, '#86efac', s.calm ? 4 : 12);
        navigator.vibrate?.(14);
        if (s.saved % 5 === 0) setSaid(`${s.saved} people rescued.`);
      }
    } else s.unload = 0;
    if (s.score !== s.reported) { s.reported = s.score; onProgress(s.score, s.saved); }

    // Sky, storm and the distant city.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b1620'); sky.addColorStop(0.6, '#1b1b1e'); sky.addColorStop(1, '#2a2927');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    s.nextBolt -= dt;
    if (s.nextBolt <= 0 && !s.calm) { s.flash = 0.35; s.nextBolt = 8 + Math.random() * 9; }
    if (s.flash > 0) { s.flash -= dt; ctx.fillStyle = `rgba(226,232,240,${Math.max(0, s.flash) * 0.5})`; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = 'rgba(95,92,87,0.35)';
    for (let k = 0; k < 14; k++) { const bw = w / 14; const bh = 40 + ((k * 53) % 70); ctx.fillRect(k * bw, h * 0.62 - bh, bw - 4, bh + h); }

    // Houses and the people waiting on them.
    roofs.forEach((r, k) => {
      const p = roofPx[k], mid = (p.x0 + p.x1) / 2;
      ctx.fillStyle = k % 2 ? '#5F5C57' : '#3b4d5a'; ctx.fillRect(p.x0, p.top, p.x1 - p.x0, h - p.top);
      ctx.fillStyle = '#A8A59F'; ctx.beginPath(); ctx.moveTo(p.x0 - 6, p.top + 2); ctx.lineTo(mid, p.top - 16); ctx.lineTo(p.x1 + 6, p.top + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(253,224,71,0.5)';
      for (let wy = p.top + 14; wy < water - 10; wy += 26) { ctx.fillRect(p.x0 + 8, wy, 9, 11); ctx.fillRect(p.x1 - 17, wy, 9, 11); }
      const on = waiting.filter((x) => x.roof === k && !s.gone.has(x.id));
      ctx.font = '22px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      on.slice(0, 3).forEach((x, n) => {
        const bob = s.calm ? 0 : Math.sin(time * 6 + x.id) * 2;
        ctx.fillText(n === 0 ? '🙋' : '🧍', mid + (n - (Math.min(3, on.length) - 1) / 2) * 16, p.top - 14 + bob);
      });
      if (on.length) {
        const left = Math.max(0, 1 - (t - on[0].at) / on[0].ttl);
        ctx.strokeStyle = left > 0.5 ? '#4ade80' : left > 0.25 ? '#fbbf24' : '#f87171'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(mid, p.top - 52, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        if (on.length > 1) { ctx.fillStyle = '#f8fafc'; ctx.font = '700 11px Inter, system-ui'; ctx.textBaseline = 'middle'; ctx.fillText(String(on.length), mid, p.top - 52); }
      }
    });

    // The hill and the hospital pad.
    ctx.fillStyle = '#1f3a2f';
    ctx.beginPath(); ctx.moveTo(pad.x0 - w * 0.08, h); ctx.quadraticCurveTo(pad.x0 - 10, pad.top - 4, pad.x0, pad.top); ctx.lineTo(w, pad.top); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(pad.x1 - 30, pad.top - 40, 26, 40);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(pad.x1 - 20, pad.top - 33, 6, 18); ctx.fillRect(pad.x1 - 26, pad.top - 27, 18, 6);
    ctx.strokeStyle = landed && s.aboard.length ? '#86efac' : 'rgba(248,250,252,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse((pad.x0 + pad.x1) / 2 - 12, pad.top - 2, 22, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(248,250,252,0.9)'; ctx.font = '800 11px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', (pad.x0 + pad.x1) / 2 - 12, pad.top - 2);

    // The flood.
    const wg = ctx.createLinearGradient(0, water, 0, h);
    wg.addColorStop(0, 'rgba(56,148,190,0.85)'); wg.addColorStop(1, 'rgba(8,47,73,0.97)');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, water + Math.sin(x / 40 + time * 2) * 3 + Math.sin(x / 13 - time * 3) * 1.5);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(224,242,254,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let x = 0; x <= w; x += 12) ctx.lineTo(x, water + Math.sin(x / 40 + time * 2) * 3 + Math.sin(x / 13 - time * 3) * 1.5); ctx.stroke();

    // Winch rope and spotlight.
    if (winching && over >= 0) {
      const r = roofPx[over];
      const len = (r.top - 14 - hl.y) * Math.min(1, s.winch / WINCH_S + 0.2);
      ctx.strokeStyle = '#f9a8d4'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(hl.x, hl.y + 10); ctx.lineTo(hl.x, hl.y + 10 + len); ctx.stroke(); ctx.setLineDash([]);
    }
    const cone = ctx.createLinearGradient(0, hl.y, 0, hl.y + 180);
    cone.addColorStop(0, 'rgba(254,240,138,0.22)'); cone.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(hl.x - 6, hl.y + 8); ctx.lineTo(hl.x - 60, hl.y + 180); ctx.lineTo(hl.x + 60, hl.y + 180); ctx.lineTo(hl.x + 6, hl.y + 8); ctx.closePath(); ctx.fill();

    // The helicopter.
    ctx.save();
    ctx.translate(hl.x, hl.y);
    ctx.rotate(Math.max(-0.3, Math.min(0.3, hl.vx / 1300)));
    ctx.fillStyle = '#ec4899'; ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-44, -6); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cffafe'; ctx.beginPath(); ctx.ellipse(8, -2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, 14); ctx.lineTo(12, 14); ctx.stroke();
    const blade = s.calm ? 30 : 16 + Math.abs(Math.sin(time * 40)) * 16;
    ctx.strokeStyle = 'rgba(226,232,240,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-blade, -15); ctx.lineTo(blade, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -15); ctx.stroke();
    ctx.beginPath(); ctx.arc(-44, -6, s.calm ? 5 : 3 + Math.abs(Math.sin(time * 30)) * 4, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < CAPACITY; k++) { ctx.fillStyle = k < s.aboard.length ? '#86efac' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-9 + k * 6, 22, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();

    // Rain, effects, and the counters.
    if (s.rain.length === 0) for (let k = 0; k < (s.calm ? 40 : 140); k++) s.rain.push({ x: Math.random() * w, y: Math.random() * h, s: 0.6 + Math.random() * 0.6 });
    ctx.strokeStyle = 'rgba(203,213,225,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of s.rain) {
      d.y += 620 * d.s * dt; d.x -= 140 * d.s * dt;
      if (d.y > h) { d.y = -10; d.x = Math.random() * (w + 100); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 4 * d.s, d.y + 14 * d.s);
    }
    ctx.stroke();
    drawEffects(ctx, s.parts, s.floats, dt);
    ctx.fillStyle = 'rgba(20,20,22,0.75)'; ctx.beginPath(); ctx.roundRect(12, 12, 210, 32, 10); ctx.fill();
    ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f9a8d4'; ctx.fillText(`Aboard ${s.aboard.length}/${CAPACITY}`, 22, 28);
    ctx.fillStyle = '#86efac'; ctx.fillText(`Saved ${s.saved}`, 112, 28);
    ctx.fillStyle = '#fca5a5'; ctx.fillText(`Lost ${s.lost}`, 172, 28);
    if (s.aboard.length === CAPACITY) { ctx.fillStyle = '#fde68a'; ctx.textAlign = 'center'; ctx.fillText('Full: fly to the hospital (H)', w / 2, 60); }
  });

  return (
    <div className="mx-auto w-full">
      <div ref={box} className="relative h-[min(64vh,560px)] min-h-80 w-full touch-none select-none overflow-hidden rounded-3xl ring-1 ring-black/10 dark:ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Flood Rescue: a flooded town with people on rooftops and a hospital on a hill. Steer the helicopter with the mouse, a finger or the arrow keys." />
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Hover low and slow over a roof to winch people up · land on the H to drop them off · the ring shows how long they can wait.</p>
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}
