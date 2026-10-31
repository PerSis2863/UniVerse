'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Fuel, Package, Wind } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { CAPACITY, CRATE_MS, CRATE_PTS, CRATES, FUEL_SECONDS, HELIPAD, RESCUE_LOST, STRIKE_TAKES, STRIKE_WARN_MS, rescuePoints, rescueSchedule, rescueStorm, rescueTown, waterLevel, type Stranded } from '@/lib/play/rescue';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { burst, calmMotion, drawEffects, steerBody, useGameCanvas, useSteer, type Float, type Particle } from './canvas';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// Flood Rescue (src/lib/play/rescue.ts): a storm, a town going under, people (some with pets)
// waving from rooftops. Fly low and slow over a roof to winch them up, four at a time, then set
// down on the hospital's pad, which also refuels. Lightning strikes roofs after a warning (people
// there have less time); gusts push the helicopter; an empty tank makes it limp. One canvas: two
// layers of skyline, rain, bolts, a spotlight, the winch rope, spray on the flood and its sheen.

const WINCH_S = 0.55;
const UNLOAD_S = 0.3;
const SLOW = 190;

export function FloodRescue({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const roofs = useMemo(() => rescueTown(seed), [seed]);
  const people = useMemo(() => rescueSchedule(seed, GAMES.rescue.seconds, roofs), [seed, roofs]);
  const storm = useMemo(() => rescueStorm(seed, GAMES.rescue.seconds, roofs), [seed, roofs]);
  const box = useRef<HTMLDivElement>(null);
  const steer = useSteer(box);
  const arena = useArena();
  const [hud, setHud] = useState({ fuel: 1, gust: 0, crates: CRATES });
  const stats = useRef(onStats);
  useEffect(() => { stats.current = onStats; });
  const g = useRef({
    heli: { x: -1, y: 0, vx: 0, vy: 0 }, aboard: [] as (Stranded & { pickedAt: number })[], gone: new Set<number>(), cut: new Map<number, number>(), winch: 0, unload: 0,
    score: 0, saved: 0, pets: 0, trips: 0, lost: 0, reported: -1, parts: [] as Particle[], floats: [] as Float[], rain: [] as { x: number; y: number; s: number }[],
    fuel: FUEL_SECONDS, lowSaid: false, emptySaid: false, flash: 0, bolt: null as null | { x: number; y: number; t: number }, nextStrike: 0, nextGust: 0, gust: null as null | { dir: number; until: number }, hudAt: 0, calm: calmMotion(),
    crates: CRATES, dropAsk: false, drops: [] as { x: number; y: number; vy: number; roof: number }[], helped: 0,
  });
  const deadline = (p: Stranded) => p.at + p.ttl - (g.current.cut.get(p.id) ?? 0);

  const canvas = useGameCanvas((ctx, w, h, dt) => {
    const s = g.current, t = clock() - startsAt, hl = s.heli, time = t / 1000;
    if (hl.x < 0) { hl.x = HELIPAD.x * w; hl.y = HELIPAD.top * h - 70; }
    const water = waterLevel(t, GAMES.rescue.seconds) * h;
    const roofPx = roofs.map((r) => ({ x0: r.x * w, x1: (r.x + r.w) * w, top: r.top * h }));
    const pad = { x0: (HELIPAD.x - HELIPAD.w / 2) * w, x1: (HELIPAD.x + HELIPAD.w / 2) * w, top: HELIPAD.top * h };

    // Fuel: burns in the air, fills on the pad; an empty tank limps.
    const speed0 = Math.hypot(hl.vx, hl.vy);
    const onPad = hl.x > pad.x0 && hl.x < pad.x1 && hl.y > pad.top - 110 && hl.y < pad.top - 15 && speed0 < SLOW;
    s.fuel = onPad ? Math.min(FUEL_SECONDS, s.fuel + dt * 14) : Math.max(0, s.fuel - dt);
    if (onPad && s.crates < CRATES) s.crates = CRATES;
    if (s.fuel / FUEL_SECONDS < 0.25 && !s.lowSaid) { s.lowSaid = true; arena.announce('Low fuel! Land on the H', 'bad'); arena.sfx('alarm'); }
    if (s.fuel <= 0 && !s.emptySaid) { s.emptySaid = true; arena.announce('Out of fuel!', 'bad'); }
    if (s.fuel / FUEL_SECONDS > 0.6) { s.lowSaid = false; s.emptySaid = false; }
    // Gusts push it sideways.
    while (s.nextGust < storm.gusts.length && storm.gusts[s.nextGust].at <= t) {
      const gu = storm.gusts[s.nextGust++];
      s.gust = { dir: gu.dir, until: t + gu.dur };
      arena.announce(gu.dir > 0 ? 'Gust → hold on!' : '← Gust! hold on', 'pink'); arena.sfx('whoosh');
    }
    if (s.gust && t > s.gust.until) s.gust = null;
    if (s.gust) hl.vx += s.gust.dir * 300 * dt;
    steerBody(hl, steer.current, dt, s.fuel > 0 ? 420 : 150, { x0: 30, x1: w - 30, y0: 40, y1: water - 26 });
    const speed = Math.hypot(hl.vx, hl.vy);

    // Lightning: a warning over a roof, then the strike takes time from everyone there.
    while (s.nextStrike < storm.strikes.length && storm.strikes[s.nextStrike].at <= t) {
      const st = storm.strikes[s.nextStrike++], r = roofPx[st.roof];
      for (const p of people) if (p.roof === st.roof && p.at <= t && !s.gone.has(p.id)) s.cut.set(p.id, (s.cut.get(p.id) ?? 0) + Math.max(0, deadline(p) - t) * STRIKE_TAKES);
      s.bolt = { x: (r.x0 + r.x1) / 2, y: r.top - 20, t: 0 };
      s.flash = 1; arena.sfx('thunder'); arena.shake(0.7);
      burst(s.parts, (r.x0 + r.x1) / 2, r.top - 10, '#fde68a', s.calm ? 4 : 18, 200);
    }
    const warn = storm.strikes[s.nextStrike];
    const warnRoof = warn && warn.at - t < STRIKE_WARN_MS ? warn.roof : -1;

    // Who's waiting now, and who was lost to the water or to time.
    const waiting = people.filter((p) => p.at <= t && !s.gone.has(p.id));
    for (const p of waiting) {
      if (t > deadline(p) || roofs[p.roof].top * h > water) {
        s.gone.add(p.id); s.lost++;
        s.score = Math.max(0, s.score - RESCUE_LOST);
        const r = roofPx[p.roof];
        s.floats.push({ x: (r.x0 + r.x1) / 2, y: r.top - 24, text: `−${RESCUE_LOST}`, color: '#f87171', life: 0 });
        burst(s.parts, (r.x0 + r.x1) / 2, r.top, '#7dd3fc', s.calm ? 3 : 10, 120);
        arena.sfx('wrong');
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
        burst(s.parts, hl.x, hl.y + 20, '#ffc0e6', s.calm ? 3 : 8, 90);
        arena.sfx('pick', s.aboard.length * 2);
        if (s.aboard.length === CAPACITY) arena.announce('Full! Fly to the hospital', 'gold');
        haptic('tap', false);
      }
    } else s.winch = Math.max(0, s.winch - dt * 2);

    // Supply crates: fall from the helicopter; on a roof they buy everyone there more time.
    if (s.dropAsk) {
      s.dropAsk = false;
      if (s.crates > 0) { s.crates--; s.drops.push({ x: hl.x, y: hl.y + 16, vy: hl.vy * 0.3, roof: -1 }); arena.sfx('whoosh'); }
      else arena.announce('No crates: refill on the H', 'pink');
    }
    for (let k = s.drops.length - 1; k >= 0; k--) {
      const d = s.drops[k];
      d.vy += 900 * dt; d.y += d.vy * dt;
      const ri = roofPx.findIndex((r) => d.x > r.x0 && d.x < r.x1 && d.y >= r.top - 6 && d.y - d.vy * dt < r.top);
      if (ri >= 0) {
        const there = people.filter((p) => p.roof === ri && p.at <= t && !s.gone.has(p.id));
        for (const p of there) s.cut.set(p.id, (s.cut.get(p.id) ?? 0) - CRATE_MS);
        s.score += CRATE_PTS * there.length; s.helped += there.length;
        s.floats.push({ x: d.x, y: roofPx[ri].top - 30, text: there.length ? `+${CRATE_MS / 1000}s ×${there.length}` : 'No one here', color: there.length ? '#fde68a' : '#cbd5e1', life: 0 });
        burst(s.parts, d.x, roofPx[ri].top - 4, '#f59e0b', s.calm ? 3 : 10, 110);
        arena.sfx(there.length ? 'coin' : 'land', there.length);
        s.drops.splice(k, 1);
      } else if (d.y > water) { burst(s.parts, d.x, water, '#7dd3fc', s.calm ? 3 : 10, 120); arena.sfx('splash'); s.drops.splice(k, 1); }
    }

    // Land at the hospital: everyone aboard gets off, one by one.
    if (onPad && s.aboard.length) {
      s.unload += dt;
      if (s.unload >= UNLOAD_S) {
        const p = s.aboard.shift()!;
        const pts = rescuePoints(p.pickedAt - p.at, p.ttl, p.pet);
        s.score += pts; s.saved++; s.unload = 0;
        if (p.pet) { s.pets++; s.floats.push({ x: hl.x + 20, y: hl.y - 44, text: '🐕 +50', color: '#fde68a', life: 0 }); }
        if (!s.aboard.length) s.trips++;
        s.floats.push({ x: hl.x, y: hl.y - 26, text: `+${pts}`, color: '#86efac', life: 0 });
        burst(s.parts, hl.x, pad.top, '#86efac', s.calm ? 4 : 12);
        arena.sfx('right', s.saved % 10);
        if (s.saved % 10 === 0) arena.announce(`${s.saved} people rescued!`, 'good');
        haptic('tap', false);
      }
    } else s.unload = 0;
    if (s.score !== s.reported) {
      s.reported = s.score; onProgress(s.score, s.saved);
      stats.current?.([{ label: 'Rescued', value: String(s.saved) }, { label: 'Lost', value: String(s.lost) }, { label: 'Pets saved', value: String(s.pets) }, { label: 'Trips', value: String(s.trips) }, { label: 'Helped by crates', value: String(s.helped) }]);
    }
    if (t - s.hudAt > 200) { s.hudAt = t; const next = { fuel: Math.round((s.fuel / FUEL_SECONDS) * 50) / 50, gust: s.gust ? s.gust.dir : 0, crates: s.crates }; setHud((p) => (p.fuel === next.fuel && p.gust === next.gust && p.crates === next.crates ? p : next)); }

    // Sky, two layers of skyline that drift with the helicopter.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b1620'); sky.addColorStop(0.6, '#222c5a'); sky.addColorStop(1, '#2b3568');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt * 2.5); ctx.fillStyle = `rgba(226,232,240,${s.flash * 0.45})`; ctx.fillRect(0, 0, w, h); }
    const par = (hl.x / w - 0.5);
    ctx.fillStyle = 'rgba(88,97,127,0.22)';
    for (let k = 0; k < 18; k++) { const bw = w / 16; const bh = 30 + ((k * 71) % 90); ctx.fillRect(k * bw - par * 20 - bw, h * 0.56 - bh, bw - 3, bh + h); }
    ctx.fillStyle = 'rgba(88,97,127,0.38)';
    for (let k = 0; k < 15; k++) { const bw = w / 13; const bh = 40 + ((k * 53) % 70); ctx.fillRect(k * bw - par * 44 - bw, h * 0.63 - bh, bw - 4, bh + h); if (k % 3 === 0) { ctx.fillStyle = 'rgba(253,224,71,0.25)'; ctx.fillRect(k * bw - par * 44 - bw + 8, h * 0.63 - bh + 10, 5, 6); ctx.fillStyle = 'rgba(88,97,127,0.38)'; } }

    // Houses, the people (and pets) waiting on them, the lightning warning.
    roofs.forEach((r, k) => {
      const p = roofPx[k], mid = (p.x0 + p.x1) / 2;
      ctx.fillStyle = k % 2 ? '#58617F' : '#3b4d5a'; ctx.fillRect(p.x0, p.top, p.x1 - p.x0, h - p.top);
      ctx.fillStyle = '#A0A9CC'; ctx.beginPath(); ctx.moveTo(p.x0 - 6, p.top + 2); ctx.lineTo(mid, p.top - 16); ctx.lineTo(p.x1 + 6, p.top + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(253,224,71,0.5)';
      for (let wy = p.top + 14; wy < water - 10; wy += 26) { ctx.fillRect(p.x0 + 8, wy, 9, 11); ctx.fillRect(p.x1 - 17, wy, 9, 11); }
      const on = waiting.filter((x) => x.roof === k && !s.gone.has(x.id));
      ctx.font = '22px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      on.slice(0, 3).forEach((x, n) => {
        const bob = s.calm ? 0 : Math.sin(time * 6 + x.id) * 2, px = mid + (n - (Math.min(3, on.length) - 1) / 2) * 16;
        ctx.fillText(n === 0 ? '🙋' : '🧍', px, p.top - 14 + bob);
        if (x.pet) { ctx.font = '15px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; ctx.fillText('🐕', px + 11, p.top - 14); ctx.font = '22px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; }
      });
      if (on.length) {
        const left = Math.max(0, (deadline(on[0]) - t) / on[0].ttl);
        ctx.strokeStyle = left > 0.5 ? '#4ade80' : left > 0.25 ? '#fbbf24' : '#f87171'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(mid, p.top - 52, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        if (on.length > 1) { ctx.fillStyle = '#f8fafc'; ctx.font = '700 11px Inter, system-ui'; ctx.textBaseline = 'middle'; ctx.fillText(String(on.length), mid, p.top - 52); }
      }
      if (k === warnRoof && Math.floor(time * 6) % 2 === 0) { ctx.font = '26px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; ctx.textBaseline = 'middle'; ctx.fillText('⚡', mid, p.top - 82); }
    });

    // The hill and the hospital pad.
    ctx.fillStyle = '#1f3a2f';
    ctx.beginPath(); ctx.moveTo(pad.x0 - w * 0.08, h); ctx.quadraticCurveTo(pad.x0 - 10, pad.top - 4, pad.x0, pad.top); ctx.lineTo(w, pad.top); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(pad.x1 - 30, pad.top - 40, 26, 40);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(pad.x1 - 20, pad.top - 33, 6, 18); ctx.fillRect(pad.x1 - 26, pad.top - 27, 18, 6);
    const glow = onPad && (s.aboard.length || s.fuel < FUEL_SECONDS);
    ctx.strokeStyle = glow ? '#86efac' : 'rgba(248,250,252,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse((pad.x0 + pad.x1) / 2 - 12, pad.top - 2, 22, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(248,250,252,0.9)'; ctx.font = '800 11px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', (pad.x0 + pad.x1) / 2 - 12, pad.top - 2);

    // The flood, its sheen, and spray under a low helicopter.
    const wave = (x: number) => water + Math.sin(x / 40 + time * 2) * 3 + Math.sin(x / 13 - time * 3) * 1.5;
    const wg = ctx.createLinearGradient(0, water, 0, h);
    wg.addColorStop(0, 'rgba(56,148,190,0.85)'); wg.addColorStop(1, 'rgba(8,47,73,0.97)');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, wave(x));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(224,242,254,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let x = 0; x <= w; x += 12) ctx.lineTo(x, wave(x)); ctx.stroke();
    ctx.strokeStyle = 'rgba(224,242,254,0.12)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, water + k * 18 + Math.sin(x / 55 + time * 1.5 + k) * 2); ctx.stroke(); }
    if (water - hl.y < 120 && !s.calm && Math.random() < dt * 40) s.parts.push({ x: hl.x + (Math.random() - 0.5) * 50, y: water, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, life: 0, max: 0.5, color: '#bae6fd', size: 1.5 + Math.random() * 2 });

    // A bolt where lightning struck.
    if (s.bolt) {
      s.bolt.t += dt;
      if (s.bolt.t > 0.28) s.bolt = null;
      else {
        ctx.strokeStyle = `rgba(254,249,195,${1 - s.bolt.t / 0.28})`; ctx.lineWidth = 3; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 16;
        ctx.beginPath(); let x = s.bolt.x + 30; ctx.moveTo(x, 0);
        for (let y = 0; y < s.bolt.y; y += 26) { x += ((y * 7919) % 37) - 18; ctx.lineTo(x, y); }
        ctx.lineTo(s.bolt.x, s.bolt.y); ctx.stroke(); ctx.shadowBlur = 0;
      }
    }

    // Winch rope and spotlight.
    if (winching && over >= 0) {
      const r = roofPx[over];
      const len = (r.top - 14 - hl.y) * Math.min(1, s.winch / WINCH_S + 0.2);
      ctx.strokeStyle = '#ffc0e6'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(hl.x, hl.y + 10); ctx.lineTo(hl.x, hl.y + 10 + len); ctx.stroke(); ctx.setLineDash([]);
    }
    const cone = ctx.createLinearGradient(0, hl.y, 0, hl.y + 180);
    cone.addColorStop(0, 'rgba(254,240,138,0.22)'); cone.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(hl.x - 6, hl.y + 8); ctx.lineTo(hl.x - 60, hl.y + 180); ctx.lineTo(hl.x + 60, hl.y + 180); ctx.lineTo(hl.x + 6, hl.y + 8); ctx.closePath(); ctx.fill();

    // The helicopter (sputtering when the tank is empty).
    ctx.save();
    ctx.translate(hl.x, hl.y + (s.fuel <= 0 && !s.calm ? Math.sin(time * 9) * 3 : 0));
    ctx.rotate(Math.max(-0.3, Math.min(0.3, hl.vx / 1300)));
    ctx.fillStyle = '#fe81d1'; ctx.strokeStyle = '#fe81d1'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-44, -6); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cffafe'; ctx.beginPath(); ctx.ellipse(8, -2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, 14); ctx.lineTo(12, 14); ctx.stroke();
    const blade = s.calm ? 30 : 16 + Math.abs(Math.sin(time * (s.fuel > 0 ? 40 : 14))) * 16;
    ctx.strokeStyle = 'rgba(226,232,240,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-blade, -15); ctx.lineTo(blade, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -15); ctx.stroke();
    ctx.beginPath(); ctx.arc(-44, -6, s.calm ? 5 : 3 + Math.abs(Math.sin(time * 30)) * 4, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < CAPACITY; k++) { ctx.fillStyle = k < s.aboard.length ? '#86efac' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-9 + k * 6, 22, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();

    // Falling crates, with a little parachute.
    for (const d of s.drops) {
      ctx.fillStyle = 'rgba(248,250,252,0.85)'; ctx.beginPath(); ctx.arc(d.x, d.y - 18, 9, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(248,250,252,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.x - 9, d.y - 18); ctx.lineTo(d.x - 4, d.y - 5); ctx.moveTo(d.x + 9, d.y - 18); ctx.lineTo(d.x + 4, d.y - 5); ctx.stroke();
      ctx.fillStyle = '#b45309'; ctx.fillRect(d.x - 6, d.y - 6, 12, 12); ctx.strokeStyle = '#fbbf24'; ctx.strokeRect(d.x - 6, d.y - 6, 12, 12);
    }

    // Rain (slanted harder in a gust), effects, and the counters.
    if (s.rain.length === 0) for (let k = 0; k < (s.calm ? 40 : 160); k++) s.rain.push({ x: Math.random() * w, y: Math.random() * h, s: 0.6 + Math.random() * 0.6 });
    const slant = s.gust ? s.gust.dir * 420 : -140;
    ctx.strokeStyle = 'rgba(203,213,225,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of s.rain) {
      d.y += 620 * d.s * dt; d.x += slant * d.s * dt;
      if (d.y > h) { d.y = -10; d.x = Math.random() * (w + 200) - 100; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + (slant / 620) * 14 * d.s, d.y + 14 * d.s);
    }
    ctx.stroke();
    drawEffects(ctx, s.parts, s.floats, dt);
    ctx.fillStyle = 'rgba(29,38,80,0.75)'; ctx.beginPath(); ctx.roundRect(12, 12, 250, 32, 10); ctx.fill();
    ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffc0e6'; ctx.fillText(`Aboard ${s.aboard.length}/${CAPACITY}`, 22, 28);
    ctx.fillStyle = '#86efac'; ctx.fillText(`Saved ${s.saved}`, 112, 28);
    ctx.fillStyle = '#fca5a5'; ctx.fillText(`Lost ${s.lost}`, 172, 28);
    ctx.fillStyle = '#fde68a'; ctx.fillText(`🐕 ${s.pets}`, 222, 28);
  });

  // D (or the Drop button) lets a crate go.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) g.current.dropAsk = true; };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div ref={box} className="relative h-[min(72vh,700px)] min-h-80 w-full touch-none select-none overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Flood Rescue: a flooded town with people on rooftops and a hospital on a hill. Steer the helicopter with the mouse, a finger or the arrow keys." />
        <button type="button" onClick={() => { g.current.dropAsk = true; }} disabled={!hud.crates}
          className="absolute bottom-4 end-4 z-10 inline-flex h-12 items-center gap-1.5 rounded-full bg-amber-300 px-4 text-sm font-black text-amber-950 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none disabled:opacity-40">
          <Package className="h-4 w-4" aria-hidden />Drop ×{hud.crates}<kbd className="hidden rounded bg-black/15 px-1 text-[11px] font-medium [@media(pointer:fine)]:inline">D</kbd>
        </button>
        <div className="pointer-events-none absolute end-3 top-3 flex items-center gap-2">
          {hud.gust !== 0 && <span className="inline-flex items-center gap-1 rounded-full bg-sky-300 px-3 py-1 text-xs font-black text-sky-950"><Wind className="h-3.5 w-3.5" aria-hidden />Gust</span>}
          <div className="w-36 rounded-2xl bg-black/60 px-3 py-2 ring-1 ring-white/15">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Fuel className="h-3.5 w-3.5" aria-hidden />Fuel {Math.round(hud.fuel * 100)}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full w-full origin-left rounded-full transition-transform duration-200 rtl:origin-right', hud.fuel > 0.25 ? 'bg-amber-300' : 'bg-red-500')} style={{ transform: `scaleX(${hud.fuel})` }} /></div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Hover low and slow over a roof to winch people up · land on the H to drop them off, refuel and reload · D drops a crate on a roof (+6 s for everyone there) · ⚡ marks where lightning will strike.</p>
    </div>
  );
}
