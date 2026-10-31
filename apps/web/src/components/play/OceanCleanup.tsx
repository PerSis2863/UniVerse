'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Magnet, Shield, Waves, Zap } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { BOOST_SPEED, MAGNET_PX, OCEAN_COMBO_MS, OCEAN_HIT, OCEAN_PHASES, OIL_SLOW, POWER_MS, SEA, SWEEP_CHARGE, SWEEP_PX, isLife, isPower, isTrash, kgOf, oceanMultiplier, oceanPhase, oceanSchedule, type Drift } from '@/lib/play/ocean';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { burst, calmMotion, drawEffects, steerBody, useGameCanvas, useSteer, type Float, type Particle } from './canvas';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// Ocean Cleanup (src/lib/play/ocean.ts): a boat on a living sea that turns from calm to a storm.
// Plastic drifts down; scoop it up for points and combos. Sea life costs points (unless a shield is
// up); oil slicks slow the boat. Power-ups: a magnet pulls plastic in, a shield takes one bump, a
// boost makes the boat faster and doubles points. One canvas: swell, light shafts, fish shadows
// below, rain and lightning in the storm, the wake, foam, splashes and floating scores.

interface Live { d: Drift; x: number; y: number; state: null | 'got' | 'hit' | 'used'; t: number }

export function OceanCleanup({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const sea = useMemo(() => oceanSchedule(seed, GAMES.ocean.seconds), [seed]);
  const box = useRef<HTMLDivElement>(null);
  const steer = useSteer(box);
  const arena = useArena();
  const [hud, setHud] = useState({ magnet: 0, boost: 0, shield: false, oily: false, phase: 0, sweep: 0 });
  const g = useRef({
    boat: { x: -1, y: 0, vx: 0, vy: 0 }, next: 0, live: [] as Live[], score: 0, combo: 0, best: 0, lastPick: -1e9, stunUntil: 0, picked: 0, kg: 0, hits: 0,
    magnetUntil: 0, boostUntil: 0, shield: false, oilUntil: 0, phase: -1, flash: 0, nextBolt: 0,
    wake: [] as { x: number; y: number }[], parts: [] as Particle[], floats: [] as Float[], shake: 0, reported: -1, hudAt: 0, calm: calmMotion(),
    fish: Array.from({ length: 7 }, (_, i) => ({ x: (i * 0.143 + 0.05) % 1, y: (i * 0.37) % 1, s: 0.6 + (i % 3) * 0.25, v: 0.02 + (i % 4) * 0.01 })),
    rain: Array.from({ length: 90 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.271) % 1 })),
    sweep: 0, sweepAsk: false, sweepT: -1, swept: 0,
  });
  // The results' numbers, whenever they change.
  const stats = useRef(onStats);
  useEffect(() => { stats.current = onStats; });

  const canvas = useGameCanvas((ctx, w, h, dt) => {
    const s = g.current, t = clock() - startsAt, b = s.boat, time = t / 1000;
    if (b.x < 0) { b.x = w / 2; b.y = h * 0.78; }
    // The sea's stage: calm → choppy → storm, announced.
    const phase = oceanPhase(Math.max(0, t), GAMES.ocean.seconds);
    if (phase !== s.phase) {
      if (s.phase >= 0) { arena.announce(OCEAN_PHASES[phase], phase === 2 ? 'bad' : 'pink'); arena.sfx(phase === 2 ? 'thunder' : 'whoosh'); }
      s.phase = phase; s.nextBolt = t + 2500;
    }
    if (phase === 2 && t > s.nextBolt && !s.calm) { s.flash = 1; s.nextBolt = t + 5000 + Math.random() * 4000; arena.sfx('thunder'); arena.shake(0.5); }
    s.flash = Math.max(0, s.flash - dt * 2.5);

    // Things drift in on the shared schedule.
    while (s.next < sea.length && sea[s.next].at <= t) {
      const d = sea[s.next++];
      s.live.push({ d, x: d.x * w, y: -40, state: null, t: 0 });
    }
    const stunned = t < s.stunUntil, boosted = t < s.boostUntil, magnet = t < s.magnetUntil, oily = t < s.oilUntil;
    const top = (stunned ? 120 : 560) * (boosted ? BOOST_SPEED : 1) * (oily ? OIL_SLOW : 1);
    steerBody(b, steer.current, dt, top, { x0: 30, x1: w - 30, y0: h * 0.3, y1: h - 36 });

    // Scooping a piece: points with the combo (and the boost); it also charges the sweep.
    const take = (o: Live, charge: boolean) => {
      const k = o.d.kind;
      o.state = 'got';
      s.combo = t - s.lastPick < OCEAN_COMBO_MS ? s.combo + 1 : 0;
      s.best = Math.max(s.best, s.combo);
      s.lastPick = t;
      const pts = Math.round(SEA[k].pts * oceanMultiplier(s.combo)) * (boosted ? 2 : 1);
      s.score += pts; s.picked++; s.kg += kgOf(k);
      if (charge) s.sweep = Math.min(SWEEP_CHARGE, s.sweep + 1);
      s.floats.push({ x: o.x, y: o.y - 10, text: s.combo ? `+${pts} ×${oceanMultiplier(s.combo).toFixed(1)}` : `+${pts}`, color: k === 'net' ? '#ffc0e6' : '#a5f3fc', life: 0 });
      burst(s.parts, o.x, o.y, k === 'net' ? '#ff9fdc' : '#67e8f9', s.calm ? 5 : 18);
      arena.sfx(k === 'net' ? 'coin' : 'pick', s.combo);
      if (s.combo === 5 || s.combo === 10) arena.announce(s.combo === 10 ? 'Max combo!' : 'Combo ×1.5!', 'pink');
      haptic('tap', false);
    };
    // The sweep: a ring of bubbles from the boat collects all the plastic in reach.
    if (s.sweepAsk) {
      s.sweepAsk = false;
      if (s.sweep >= SWEEP_CHARGE) {
        s.sweep = 0; s.sweepT = 0;
        let n = 0;
        for (const o of s.live) if (!o.state && isTrash(o.d.kind) && Math.hypot(o.x - b.x, o.y - b.y) < SWEEP_PX) { take(o, false); n++; }
        s.swept += n;
        arena.announce(n ? `Sweep! ${n} pieces` : 'Sweep! (nothing in reach)', 'gold'); arena.sfx('boost'); arena.shake(0.3);
      }
    }

    // Move, pull, collide, drop what's gone.
    let inOil = false;
    for (let i = s.live.length - 1; i >= 0; i--) {
      const o = s.live[i], k = o.d.kind;
      if (o.state) { o.t += dt; o.y += (o.state === 'hit' ? 220 : -30) * dt; if (o.t > 0.45) s.live.splice(i, 1); continue; }
      o.y += o.d.speed * h * dt * (phase === 2 ? 1.15 : 1);
      o.x += Math.sin(t / 700 + o.d.wobble) * (phase === 2 ? 34 : 18) * dt;
      if (o.y > h + 60) { s.live.splice(i, 1); continue; }
      const dist = Math.hypot(o.x - b.x, o.y - b.y);
      if (magnet && isTrash(k) && dist < MAGNET_PX) { o.x += (b.x - o.x) * Math.min(1, dt * 5); o.y += (b.y - o.y) * Math.min(1, dt * 5); }
      if (k === 'oil') { if (dist < 58) inOil = true; continue; }
      if (dist >= 38) continue;
      if (isLife(k)) {
        if (stunned) continue;
        o.state = 'hit';
        if (s.shield) {
          s.shield = false;
          s.floats.push({ x: o.x, y: o.y - 10, text: 'Shield!', color: '#93c5fd', life: 0 });
          burst(s.parts, b.x, b.y, '#93c5fd', s.calm ? 4 : 18);
          arena.sfx('hit');
          continue;
        }
        s.score = Math.max(0, s.score - OCEAN_HIT); s.combo = 0; s.hits++;
        s.stunUntil = t + 750; s.shake = s.calm ? 0 : 0.28;
        s.floats.push({ x: o.x, y: o.y - 10, text: `−${OCEAN_HIT}`, color: '#f87171', life: 0 });
        burst(s.parts, o.x, o.y, '#fca5a5', s.calm ? 4 : 14);
        arena.sfx('hurt'); arena.shake(0.4);
        haptic('warning', false);
      } else if (isPower(k)) {
        o.state = 'used';
        if (k === 'magnet') s.magnetUntil = t + POWER_MS;
        if (k === 'boost') s.boostUntil = t + POWER_MS;
        if (k === 'shield') s.shield = true;
        arena.announce(k === 'magnet' ? 'Magnet!' : k === 'boost' ? 'Boost! ×2 points' : 'Shield up', 'gold');
        arena.sfx('power');
        burst(s.parts, o.x, o.y, '#fde68a', s.calm ? 5 : 22);
      } else take(o, true);
    }
    if (inOil) { if (!oily) arena.sfx('splash'); s.oilUntil = t + 900; }
    if (s.score !== s.reported) {
      s.reported = s.score;
      onProgress(s.score, s.picked);
      stats.current?.([{ label: 'Pieces cleared', value: String(s.picked) }, { label: 'Plastic out', value: `${s.kg.toFixed(2)} kg` }, { label: 'Best combo', value: `×${oceanMultiplier(s.best).toFixed(1)}` }, { label: 'Swept up', value: String(s.swept) }, { label: 'Bumps', value: String(s.hits) }]);
    }
    if (t - s.hudAt > 150) {
      s.hudAt = t;
      const next = { magnet: magnet ? Math.ceil((s.magnetUntil - t) / 1000) : 0, boost: boosted ? Math.ceil((s.boostUntil - t) / 1000) : 0, shield: s.shield, oily, phase, sweep: s.sweep / SWEEP_CHARGE };
      setHud((p) => (p.magnet === next.magnet && p.boost === next.boost && p.shield === next.shield && p.oily === next.oily && p.phase === next.phase && p.sweep === next.sweep ? p : next));
    }

    // Draw: the sea (darker and rougher in the storm).
    ctx.save();
    if (s.shake > 0) { s.shake -= dt; ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10); }
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    const tops = ['#0f4c66', '#0c3a52', '#0a1f2e'], mids = ['#0a2f42', '#0a2534', '#071520'];
    sky.addColorStop(0, tops[phase]); sky.addColorStop(0.55, mids[phase]); sky.addColorStop(1, '#171F44');
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, w + 20, h + 20);
    // Light shafts in calm water.
    if (phase < 2) {
      ctx.globalAlpha = phase === 0 ? 0.045 : 0.025;
      ctx.fillStyle = '#e0f2fe';
      for (let k = 0; k < 4; k++) { const x = ((k * 0.27 + 0.1) * w + Math.sin(time * 0.3 + k) * 30); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 190, h); ctx.lineTo(x + 90, h); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // Fish shadows far below, drifting.
    ctx.fillStyle = 'rgba(2,12,20,0.35)';
    for (const f of s.fish) {
      f.x = (f.x + f.v * dt) % 1.1;
      const fx = f.x * w - 40, fy = (f.y * 0.7 + 0.2) * h + Math.sin(time + f.y * 9) * 8;
      ctx.beginPath(); ctx.ellipse(fx, fy, 22 * f.s, 7 * f.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - 20 * f.s, fy); ctx.lineTo(fx - 32 * f.s, fy - 7 * f.s); ctx.lineTo(fx - 32 * f.s, fy + 7 * f.s); ctx.fill();
    }
    // The swell.
    const amp = [5, 8, 13][phase];
    for (let row = 0; row < 14; row++) {
      const y0 = ((row * 46 + time * (28 + phase * 14)) % (h + 60)) - 30;
      ctx.strokeStyle = `rgba(165,243,252,${0.04 + (y0 / h) * 0.07})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 70 + time * (1.4 + phase * 0.5) + row) * amp);
      ctx.stroke();
    }
    for (let k = 0; k < 26 && phase < 2; k++) {
      const gx = (Math.sin(k * 91.7) * 0.5 + 0.5) * w, gy = ((Math.cos(k * 37.3) * 0.5 + 0.5) * h + time * 30) % h;
      ctx.globalAlpha = 0.15 + 0.15 * Math.sin(time * 3 + k);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(gx, gy, 6, 1.5);
    }
    ctx.globalAlpha = 1;

    // Oil slicks: dark, with a rainbow sheen.
    for (const o of s.live) {
      if (o.d.kind !== 'oil') continue;
      const gr = ctx.createRadialGradient(o.x - 10, o.y - 8, 4, o.x, o.y, 62);
      gr.addColorStop(0, 'rgba(255,159,220,0.35)'); gr.addColorStop(0.35, 'rgba(96,165,250,0.3)'); gr.addColorStop(0.6, 'rgba(250,204,21,0.22)'); gr.addColorStop(1, 'rgba(10,10,12,0)');
      ctx.fillStyle = 'rgba(8,8,10,0.75)';
      ctx.beginPath(); ctx.ellipse(o.x, o.y, 58 + Math.sin(time * 2 + o.d.wobble) * 4, 38, Math.sin(o.d.wobble) * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(o.x, o.y, 58, 38, Math.sin(o.d.wobble) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Floating things.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of s.live) {
      const k = o.d.kind;
      if (k === 'oil') continue;
      const life = isLife(k), power = isPower(k);
      ctx.globalAlpha = o.state ? Math.max(0, 1 - o.t / 0.45) : 1;
      if (k === 'net' && !o.state) { ctx.fillStyle = 'rgba(255,159,220,0.18)'; ctx.beginPath(); ctx.arc(o.x, o.y, 26, 0, Math.PI * 2); ctx.fill(); }
      if (power && !o.state) {
        const pulse = 1 + Math.sin(time * 5) * 0.12;
        ctx.fillStyle = 'rgba(253,230,138,0.25)'; ctx.beginPath(); ctx.arc(o.x, o.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(253,230,138,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, 22 * pulse, 0, Math.PI * 2); ctx.stroke();
      }
      if (life && !o.state) { ctx.strokeStyle = 'rgba(248,113,113,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, o.y, 22, 0, Math.PI * 2); ctx.stroke(); }
      ctx.font = `${o.state === 'got' ? 34 - o.t * 40 : 30}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.sin(time * 2 + o.d.wobble) * 0.18);
      ctx.fillText(SEA[k].emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // The sweep's ring of bubbles, racing out from the boat.
    if (s.sweepT >= 0) {
      s.sweepT += dt;
      const k = Math.min(1, s.sweepT / 0.5), r = SWEEP_PX * (1 - (1 - k) ** 3);
      ctx.strokeStyle = `rgba(165,243,252,${0.8 * (1 - k)})`; ctx.lineWidth = 6 * (1 - k) + 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      if (!s.calm) for (let q = 0; q < 14; q++) { const a = q / 14 * Math.PI * 2 + time; ctx.fillStyle = `rgba(224,242,254,${0.7 * (1 - k)})`; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 3, 0, Math.PI * 2); ctx.fill(); }
      if (s.sweepT > 0.6) s.sweepT = -1;
    }
    // The magnet's reach.
    if (magnet) { ctx.strokeStyle = `rgba(253,230,138,${0.25 + Math.sin(time * 8) * 0.1})`; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, MAGNET_PX, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // The wake (longer and brighter with the boost), foam at the bow.
    s.wake.push({ x: b.x, y: b.y + 18 });
    if (s.wake.length > (boosted ? 40 : 26)) s.wake.shift();
    for (let i = 1; i < s.wake.length; i++) {
      const a = s.wake[i - 1], c = s.wake[i], spread = (s.wake.length - i) * 0.9;
      ctx.strokeStyle = boosted ? `rgba(253,230,138,${(i / s.wake.length) * 0.5})` : `rgba(224,242,254,${(i / s.wake.length) * 0.35})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x - spread, a.y + (s.wake.length - i) * 1.2); ctx.lineTo(c.x - spread * 0.9, c.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x + spread, a.y + (s.wake.length - i) * 1.2); ctx.lineTo(c.x + spread * 0.9, c.y); ctx.stroke();
    }
    if (Math.hypot(b.vx, b.vy) > 120 && !s.calm && Math.random() < dt * 30) s.parts.push({ x: b.x + (Math.random() - 0.5) * 16, y: b.y - 24, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, life: 0, max: 0.35, color: '#e0f2fe', size: 1.5 + Math.random() * 1.5 });
    // The boat.
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.max(-0.35, Math.min(0.35, b.vx / 1400)) + (stunned && !s.calm ? Math.sin(t / 40) * 0.4 : 0) + (phase === 2 && !s.calm ? Math.sin(time * 3) * 0.05 : 0));
    ctx.globalAlpha = stunned && Math.floor(t / 90) % 2 ? 0.5 : 1;
    ctx.shadowColor = boosted ? 'rgba(253,230,138,0.7)' : 'rgba(254,129,209,0.55)'; ctx.shadowBlur = 18;
    ctx.fillStyle = oily ? '#9ca3af' : '#f8fafc';
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.quadraticCurveTo(18, -8, 16, 20); ctx.lineTo(-16, 20); ctx.quadraticCurveTo(-18, -8, 0, -28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fe81d1'; ctx.fillRect(-16, 11, 32, 9);
    ctx.fillStyle = '#1d2650'; ctx.beginPath(); ctx.roundRect(-8, -9, 16, 15, 4); ctx.fill();
    ctx.fillStyle = '#7dd3fc'; ctx.fillRect(-5, -6, 10, 4);
    ctx.strokeStyle = 'rgba(255,159,220,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -28, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
    if (s.shield) { ctx.strokeStyle = `rgba(147,197,253,${0.6 + Math.sin(time * 6) * 0.2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, 40, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(147,197,253,0.08)'; ctx.fill(); }

    drawEffects(ctx, s.parts, s.floats, dt);

    // The storm: rain and lightning.
    if (phase === 2 && !s.calm) {
      ctx.strokeStyle = 'rgba(186,230,253,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const r of s.rain) { r.y = (r.y + dt * 1.6) % 1; r.x = (r.x + dt * 0.25) % 1; const x = r.x * w, y = r.y * h; ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); }
      ctx.stroke();
    }
    if (s.flash > 0) { ctx.fillStyle = `rgba(226,232,240,${s.flash * 0.55})`; ctx.fillRect(0, 0, w, h); }

    // Combo meter.
    const left = Math.max(0, 1 - (t - s.lastPick) / OCEAN_COMBO_MS);
    if (s.combo > 0 && left > 0) {
      ctx.fillStyle = 'rgba(29,38,80,0.75)'; ctx.beginPath(); ctx.roundRect(12, 12, 132, 34, 10); ctx.fill();
      ctx.fillStyle = '#ffc0e6'; ctx.font = '700 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`Combo ×${oceanMultiplier(s.combo).toFixed(1)}`, 22, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(22, 36, 112, 4);
      ctx.fillStyle = '#fe81d1'; ctx.fillRect(22, 36, 112 * left, 4);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(224,242,254,0.85)'; ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(`♻ ${s.picked} cleared · ${s.kg.toFixed(1)} kg`, w - 14, 24);
    ctx.restore();
  });

  // Space (or E) fires the sweep.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key.toLowerCase() === 'e') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); g.current.sweepAsk = true; } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div ref={box} className="relative h-[min(72vh,700px)] min-h-80 w-full touch-none select-none overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Ocean Cleanup: a boat on the sea. Steer with the mouse, a finger or the arrow keys to scoop up plastic and avoid sea life." />
        <button type="button" onClick={() => { g.current.sweepAsk = true; }} disabled={hud.sweep < 1}
          className="absolute bottom-14 end-4 z-10 inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-cyan-300 px-4 text-sm font-black text-cyan-950 shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-1 active:shadow-none disabled:bg-zinc-800 disabled:text-zinc-300">
          <span className="absolute inset-y-0 start-0 bg-cyan-200/60 transition-[width] duration-200" style={{ width: `${hud.sweep * 100}%` }} aria-hidden />
          <Waves className="relative h-4 w-4" aria-hidden /><span className="relative">{hud.sweep >= 1 ? 'Sweep!' : `Sweep ${Math.round(hud.sweep * 100)}%`}</span><kbd className="relative hidden rounded bg-black/15 px-1 text-[11px] font-medium [@media(pointer:fine)]:inline">Space</kbd>
        </button>
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-sky-100 ring-1 ring-white/15">{OCEAN_PHASES[hud.phase]}</span>
          {hud.magnet > 0 && <Power icon={Magnet} text={`Magnet ${hud.magnet}s`} />}
          {hud.boost > 0 && <Power icon={Zap} text={`Boost ×2 · ${hud.boost}s`} />}
          {hud.shield && <Power icon={Shield} text="Shield" tone="blue" />}
          {hud.oily && <span className="rounded-full bg-zinc-900/85 px-3 py-1 text-xs font-bold text-zinc-200 ring-1 ring-white/20">Oil! Slowed down</span>}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Steer: move the mouse or drag · arrow keys or WASD. Pink circles are ghost nets (150); gold rings are power-ups; dark slicks are oil. Every 15 pieces charge the sweep: Space collects all plastic near the boat.</p>
    </div>
  );
}

function Power({ icon: Icon, text, tone = 'gold' }: { icon: typeof Zap; text: string; tone?: 'gold' | 'blue' }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black', tone === 'gold' ? 'bg-amber-300 text-amber-950' : 'bg-sky-300 text-sky-950')}><Icon className="h-3.5 w-3.5" aria-hidden />{text}</span>;
}
