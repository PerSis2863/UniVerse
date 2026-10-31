'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { easeOut, glow, hash, seeded, useLiveCanvas, type Frame } from './canvas';

// A night city (M50, richer in M51 after the "Waypoint" video's live map): seen from above at an
// angle. Streets with lanes and lamps, towers, clusters and low squares with lit windows, rooftop
// lights blinking and pink neon strips; cars' head and tail lights moving along every street; the
// warehouse hub in the middle with a beam and rings; each batch a small van going from a factory at
// the edge, through the hub, to its shop, a glowing trail behind it and dashes running ahead, a beam
// of light over its shop. Buildings hide what is behind them (a faint see-through line keeps the
// routes readable). The city lights up outward from the hub when first seen.
// Cheap per frame: the ground and the buildings are drawn once per size into two pictures; each
// frame stamps them and draws only the lights that move.

export interface Van { id: string; label: string; /** 0 to 1 along the whole journey. */ progress: number; state: 'moving' | 'done' | 'parked'; note?: string }

type P = [number, number];
type Iso = (x: number, y: number, z?: number) => P;
interface Layer { key: string; ground: HTMLCanvasElement; city: HTMLCanvasElement; twinkle: P[]; antennas: P[]; neon: P[] }
type Route = ReturnType<typeof plan>[number];

export function CityView({ vans, label, className }: { vans: Van[]; label: string; className?: string }) {
  const layer = useRef<Layer | null>(null);
  const planned = useRef<{ vans: Van[]; G: number; routes: Route[] } | null>(null);

  const ref = useLiveCanvas(({ ctx, w, h, t, pointer }: Frame) => {
    const G = w < 520 ? 8 : 10, H = G / 2;
    // Fill the height; on narrow screens the city's far corners may run off the sides (like a map).
    const s = Math.min(h * 0.94 / (G + 1.3), w * 1.35 / (2 * 0.866 * G));
    const ox = w / 2, oy = (h - s * G - 1.3 * s) / 2 + 1.3 * s;
    const iso: Iso = (x, y, z = 0) => [ox + (x - y) * s * 0.866, oy + (x + y) * s * 0.5 - z * s];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${w}x${h}x${dpr}x${G}`;
    if (layer.current?.key !== key) layer.current = build(key, w, h, dpr, G, s, iso);
    if (planned.current?.vans !== vans || planned.current.G !== G) planned.current = { vans, G, routes: plan(vans, G) };
    const L = layer.current, routes = planned.current.routes;
    const [hx, hy] = iso(H, H);
    const reveal = easeOut(t / 1.6);

    // 1 · The ground: streets, lanes, lamps.
    ctx.globalAlpha = Math.min(1, t / 0.5);
    ctx.drawImage(L.ground, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // 2 · Traffic: head and tail lights moving along the streets (buildings in front hide them).
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(236,72,153,0.55)';
    for (let i = 0; i < 46; i++) {
      const axis = i % 2, line = Math.floor(seeded(i * 3.1) * (G + 1)), dir = seeded(i * 7.7) < 0.5 ? 1 : -1;
      const lane = dir * 0.055, speed = 0.25 + seeded(i * 5.3) * 0.45;
      const pos = (((seeded(i * 9.1) * G + t * speed * dir) % G) + G) % G;
      const [x, y] = axis ? iso(line + lane, pos) : iso(pos, line + lane);
      const [bx, by] = axis ? iso(line + lane, pos - dir * 0.22) : iso(pos - dir * 0.22, line + lane);
      ctx.globalAlpha = 0.85 * reveal;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
      ctx.drawImage(glow('white'), x - 4, y - 4, 8, 8);
    }
    ctx.globalAlpha = 1;

    // Where a van is along its way (in street units), and which way it faces.
    const at = (r: Route, f: number) => {
      let d = Math.max(0, Math.min(1, f)) * r.total;
      for (let i = 0; i < r.lens.length; i++) {
        if (d <= r.lens[i] || i === r.lens.length - 1) {
          const k = r.lens[i] ? Math.min(1, d / r.lens[i]) : 0, a = r.pts[i], b = r.pts[i + 1];
          return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: Math.sign(b[0] - a[0]), dy: Math.sign(b[1] - a[1]) };
        }
        d -= r.lens[i];
      }
      const e = r.pts[r.pts.length - 1];
      return { x: e[0], y: e[1], dx: 0, dy: 1 };
    };
    const path = (r: Route, a: number, b: number) => {
      ctx.beginPath();
      for (let q = 0; q <= 48; q++) { const p = at(r, a + (q / 48) * (b - a)); const [x, y] = iso(p.x, p.y, 0.01); if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    };
    let near = -1;
    if (pointer) {
      let best = 28;
      routes.forEach((r, i) => { const p = at(r, r.v.progress); const [x, y] = iso(p.x, p.y); const d = Math.hypot(x - pointer.x, y - pointer.y); if (d < best) { best = d; near = i; } });
    }
    const grow = (i: number) => easeOut((t - 0.9 - i * 0.07) / 0.9);

    // The vans' ways, on the ground.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    routes.forEach((r, i) => {
      const k = grow(i);
      if (k <= 0) return;
      const p = r.v.progress * k, lit = i === near, moving = r.v.state === 'moving';
      // Still to go: dashes running toward the shop.
      ctx.globalCompositeOperation = 'source-over';
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = moving ? -t * 18 : 0;
      ctx.strokeStyle = `rgba(255,255,255,${lit ? 0.4 : 0.18})`; ctx.lineWidth = 1.2;
      path(r, p, 1); ctx.stroke();
      ctx.setLineDash([]);
      if (r.v.state === 'parked') return;
      // Done: a wide soft glow under a bright line, brightest just behind the van (its trail).
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(236,72,153,${lit ? 0.35 : 0.2})`; ctx.lineWidth = 7;
      path(r, 0, p); ctx.stroke();
      ctx.strokeStyle = `rgba(244,114,182,${lit ? 1 : 0.8})`; ctx.lineWidth = 1.8;
      path(r, 0, p); ctx.stroke();
      if (moving) {
        ctx.strokeStyle = 'rgba(255,240,248,0.9)'; ctx.lineWidth = 2.4;
        path(r, Math.max(0, p - 0.06), p); ctx.stroke();
      }
    });
    routes.forEach((r, i) => { const k = grow(i); if (k > 0) drawVan(ctx, iso, at(r, r.v.progress * k), r.v.state, i === near, t); });
    ctx.globalCompositeOperation = 'source-over';

    // 3 · The buildings, lighting up outward from the hub.
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, reveal * Math.hypot(w, h), 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(L.city, 0, 0, w, h);
    ctx.restore();

    // 4 · Over the buildings: a faint see-through line for each way, so none is lost behind a tower.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.2;
    routes.forEach((r, i) => {
      const k = grow(i);
      if (k <= 0 || r.v.state === 'parked') return;
      ctx.strokeStyle = `rgba(236,72,153,${i === near ? 0.4 : 0.16})`;
      path(r, 0, r.v.progress * k); ctx.stroke();
      // And the van, as a soft light, in case a tower stands in front of it.
      const v = at(r, r.v.progress * k), [x, y] = iso(v.x, v.y, 0.05);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(glow(r.v.state === 'done' ? 'gold' : 'pink'), x - 9, y - 9, 18, 18);
      ctx.globalAlpha = 1;
    });

    // Windows breathing, rooftop lights blinking, neon pulsing.
    for (let i = 0; i < 40 && L.twinkle.length; i++) {
      const [x, y] = L.twinkle[Math.floor(seeded(i + Math.floor(t / 2.5) * 13) * L.twinkle.length)];
      ctx.globalAlpha = 0.6 * Math.max(0, Math.sin((t / 2.5) * Math.PI * 2 + i)) * reveal;
      ctx.drawImage(glow('gold'), x - 5, y - 5, 10, 10);
    }
    L.antennas.forEach(([x, y], i) => {
      ctx.globalAlpha = ((t * 0.9 + i * 0.37) % 1.6 < 0.18 ? 1 : 0.25) * reveal;
      ctx.drawImage(glow('pink'), x - 6, y - 6, 12, 12);
    });
    L.neon.forEach(([x, y], i) => {
      ctx.globalAlpha = (0.35 + 0.25 * Math.sin(t * 3 + i * 1.7)) * reveal;
      ctx.drawImage(glow('pink'), x - 10, y - 14, 20, 28);
    });
    ctx.globalAlpha = 1;

    // 5 · The hub: a hexagon of light on the ground, a ring turning, rings going out, a beam.
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; const [x, y] = iso(H + Math.cos(a) * 0.42, H + Math.sin(a) * 0.42, 0.02); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.fillStyle = `rgba(233,196,106,${0.18 * reveal})`; ctx.fill();
    ctx.strokeStyle = `rgba(233,196,106,${0.85 * reveal})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([3, 5]); ctx.lineDashOffset = t * 10;
    ctx.strokeStyle = `rgba(233,196,106,${0.5 * reveal})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.75, s * 0.375, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    for (let r = 0; r < 3; r++) {
      const f = (t * 0.45 + r / 3) % 1;
      ctx.strokeStyle = `rgba(233,196,106,${0.45 * (1 - f) * reveal})`;
      ctx.beginPath(); ctx.ellipse(hx, hy, s * (0.4 + f * 1.4), s * (0.4 + f * 1.4) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    beam(ctx, hx, hy, s * 2.6, '233,196,106', 0.55 * reveal, 5);
    const hs = s * 1.4 + Math.sin(t * 2) * 3;
    ctx.globalAlpha = 0.9 * reveal;
    ctx.drawImage(glow('gold'), hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.globalAlpha = 1;

    // Beams over the shops: violet while on the way, gold once delivered.
    routes.forEach((r, i) => {
      const k = grow(i);
      if (k <= 0) return;
      const e = r.pts[r.pts.length - 1], [x, y] = iso(e[0], e[1]), done = r.v.state === 'done';
      beam(ctx, x, y, s * (done ? 1.2 : 1.6), done ? '233,196,106' : '168,85,247', (done ? 0.5 : 0.35 + 0.15 * Math.sin(t * 2 + i)) * k, 3);
    });
    ctx.globalCompositeOperation = 'source-over';

    // 6 · Names: pills for vans on the move (any van when pointed at), a gold tick where one arrived.
    ctx.font = '600 11px Urbanist, system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'start';
    const placed: [number, number, number, number][] = [];
    routes.forEach((r, i) => {
      const k = grow(i);
      if (k <= 0) return;
      const lit = i === near;
      if (r.v.state === 'done' && !lit) {
        const e = r.pts[r.pts.length - 1], [x, y] = iso(e[0], e[1]), by = y - s * 1.25;
        ctx.globalAlpha = k;
        ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(x, by, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - 2.6, by); ctx.lineTo(x - 0.6, by + 2); ctx.lineTo(x + 2.8, by - 2); ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      if (r.v.state !== 'moving' && !lit) return;
      const p = at(r, r.v.progress * k), [vx, vy] = iso(p.x, p.y, 0.1);
      const text = r.v.note ? `${r.v.label} · ${r.v.note}` : r.v.label;
      const bw = ctx.measureText(text).width + 22, bh = 20;
      const x = Math.min(w - bw - 4, Math.max(4, vx - bw / 2));
      let y = vy - 40;
      while (placed.some(([px, py, pw, ph]) => x < px + pw && x + bw > px && y < py + ph && y + bh > py)) y -= bh + 4;
      placed.push([x, y, bw, bh]);
      ctx.globalAlpha = k * (near < 0 || lit ? 1 : 0.6);
      ctx.strokeStyle = 'rgba(244,114,182,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(vx, vy - 4); ctx.lineTo(vx, y + bh); ctx.stroke();
      ctx.fillStyle = 'rgba(12,12,14,0.9)';
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 10); ctx.fill();
      ctx.strokeStyle = r.v.state === 'done' ? 'rgba(233,196,106,0.6)' : 'rgba(236,72,153,0.6)'; ctx.stroke();
      ctx.fillStyle = r.v.state === 'done' ? '#e9c46a' : '#ec4899';
      ctx.beginPath(); ctx.arc(x + 9, y + bh / 2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 15, y + bh / 2 + 0.5);
      ctx.globalAlpha = 1;
    });
  });

  return (
    <div className={cn('relative', className)}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      <ul className="sr-only">{vans.map((v) => <li key={v.id} translate="no">{v.label}: {v.state === 'done' ? 'delivered' : v.state === 'parked' ? 'not shipped yet' : `${Math.round(v.progress * 100)}% of the way${v.note ? `, ${v.note}` : ''}`}</li>)}</ul>
    </div>
  );
}

/** Each van's way along the streets: from a factory at the edge, to the hub, to its shop. */
function plan(vans: Van[], G: number) {
  const H = G / 2;
  return vans.slice(0, 14).map((v) => {
    const s = hash(v.id), side = s % 4, along = 1 + ((s >> 3) % (G - 1));
    const start: P = side === 0 ? [along, 0] : side === 1 ? [G, along] : side === 2 ? [along, G] : [0, along];
    let dest: P = [1 + ((s >> 6) % (G - 1)), 1 + ((s >> 9) % (G - 1))];
    if (dest[0] === H && dest[1] === H) dest = [dest[0] + 1, dest[1]];
    const leg = (a: P, b: P, xFirst: boolean): P[] => (xFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]);
    const hub: P = [H, H];
    const pts = [...leg(start, hub, s % 2 === 0), ...leg(hub, dest, s % 3 === 0).slice(1)];
    const lens = pts.slice(1).map((p, i) => Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]));
    return { v, pts, lens, total: lens.reduce((a, b) => a + b, 0) || 1 };
  });
}

/** A column of light rising from a point. */
function beam(ctx: CanvasRenderingContext2D, x: number, y: number, tall: number, rgb: string, a: number, wide: number) {
  const g = ctx.createLinearGradient(0, y, 0, y - tall);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - wide / 2, y - tall, wide, tall);
  ctx.fillRect(x - wide * 1.6, y - tall * 0.6, wide * 3.2, tall * 0.6);
}

/** A van: a small box along its street, its roof lit, headlights ahead and tail lights behind. */
function drawVan(ctx: CanvasRenderingContext2D, iso: Iso, p: { x: number; y: number; dx: number; dy: number }, state: Van['state'], lit: boolean, t: number) {
  const along = p.dx !== 0 ? [Math.sign(p.dx), 0] : [0, Math.sign(p.dy) || 1];
  const side = [-along[1], along[0]];
  const L = 0.13, W = 0.065, Z = 0.07;
  const c = (a: number, b: number, z: number) => iso(p.x + along[0] * a + side[0] * b, p.y + along[1] * a + side[1] * b, z);
  const face = (pts: P[], fill: string) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  ctx.globalCompositeOperation = 'lighter';
  const [gx, gy] = c(0, 0, 0.03), gs = lit ? 40 : 30;
  ctx.globalAlpha = (state === 'parked' ? 0.25 : 0.75) + (lit ? 0.2 : 0);
  ctx.drawImage(glow(state === 'done' ? 'gold' : 'pink'), gx - gs / 2, gy - gs / 2, gs, gs);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = state === 'parked' ? 0.45 : 1;
  face([c(-L, -W, 0), c(L, -W, 0), c(L, -W, Z), c(-L, -W, Z)], '#c9c4bd');
  face([c(-L, W, 0), c(L, W, 0), c(L, W, Z), c(-L, W, Z)], '#a39e98');
  face([c(L, -W, 0), c(L, W, 0), c(L, W, Z), c(L, -W, Z)], '#8e8984');
  face([c(-L, -W, 0), c(-L, W, 0), c(-L, W, Z), c(-L, -W, Z)], '#8e8984');
  face([c(-L, -W, Z), c(L, -W, Z), c(L, W, Z), c(-L, W, Z)], '#fffaf5');
  ctx.globalAlpha = 1;
  if (state === 'moving') {
    ctx.globalCompositeOperation = 'lighter';
    const [fx, fy] = c(L + 0.12, 0, 0.02), [bx, by] = c(-L - 0.02, 0, 0.03);
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 6);
    ctx.drawImage(glow('white'), fx - 9, fy - 6, 18, 12);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glow('pink'), bx - 5, by - 4, 10, 8);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** The still city for one size: the ground picture and the buildings picture, and where the lights are. */
function build(key: string, w: number, h: number, dpr: number, G: number, s: number, iso: Iso): Layer {
  const H = G / 2;
  const make = () => { const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, g] as const; };
  const quad = (g: CanvasRenderingContext2D, pts: P[], fill: string | CanvasGradient) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };

  // The ground: dark, a little lighter toward the hub; streets with lanes; lamps at the crossings.
  const [ground, gg] = make();
  const [hx, hy] = iso(H, H);
  const base = gg.createRadialGradient(hx, hy, 0, hx, hy, s * G * 0.9);
  base.addColorStop(0, '#16151a'); base.addColorStop(1, '#09090b');
  quad(gg, [iso(-0.2, -0.2), iso(G + 0.2, -0.2), iso(G + 0.2, G + 0.2), iso(-0.2, G + 0.2)], base);
  for (let i = 0; i <= G; i++) {
    quad(gg, [iso(i - 0.14, -0.2), iso(i + 0.14, -0.2), iso(i + 0.14, G + 0.2), iso(i - 0.14, G + 0.2)], '#121216');
    quad(gg, [iso(-0.2, i - 0.14), iso(G + 0.2, i - 0.14), iso(G + 0.2, i + 0.14), iso(-0.2, i + 0.14)], '#121216');
  }
  gg.setLineDash([3, 5]); gg.strokeStyle = 'rgba(255,255,255,0.07)'; gg.lineWidth = 1;
  for (let i = 0; i <= G; i++) {
    gg.beginPath(); gg.moveTo(...iso(i, -0.2)); gg.lineTo(...iso(i, G + 0.2)); gg.stroke();
    gg.beginPath(); gg.moveTo(...iso(-0.2, i)); gg.lineTo(...iso(G + 0.2, i)); gg.stroke();
  }
  gg.setLineDash([]);
  gg.globalCompositeOperation = 'lighter';
  for (let i = 0; i <= G; i++) {
    for (let j = 0; j <= G; j++) {
      const [x, y] = iso(i + 0.17, j + 0.17);
      gg.globalAlpha = 0.35; gg.drawImage(glow('gold'), x - 7, y - 4, 14, 8);
      gg.globalAlpha = 1; gg.fillStyle = 'rgba(255,236,200,0.9)'; gg.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
  }
  gg.globalCompositeOperation = 'source-over';

  // The buildings: towers (taller toward the middle), clusters of four, pairs and low squares.
  interface B { x0: number; x1: number; y0: number; y1: number; z: number; warm: number; neon: boolean }
  const list: B[] = [];
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const r = seeded(i * 31 + j * 7 + G), x0 = i + 0.17, x1 = i + 0.83, y0 = j + 0.17, y1 = j + 0.83;
      const centre = 1 - Math.min(1, Math.hypot(i + 0.5 - H, j + 0.5 - H) / (H * 1.1));
      const tall = (k: number) => 0.25 + Math.pow(seeded(k), 1.6) * (0.6 + 1.3 * centre);
      if (Math.abs(i + 0.5 - H) < 1 && Math.abs(j + 0.5 - H) < 1) { list.push({ x0, x1, y0, y1, z: 0.05, warm: 0, neon: false }); continue; } // the hub's square
      if (r < 0.28) list.push({ x0: x0 + 0.05, x1: x1 - 0.05, y0: y0 + 0.05, y1: y1 - 0.05, z: tall(i * 13 + j) + 0.35 * centre, warm: seeded(i + j * 3), neon: seeded(i * 5 + j) < 0.35 });
      else if (r < 0.62) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, g2 = 0.03;
        for (const [a, b, c, d, k] of [[x0, mx - g2, y0, my - g2, 1], [mx + g2, x1, y0, my - g2, 2], [x0, mx - g2, my + g2, y1, 3], [mx + g2, x1, my + g2, y1, 4]] as const) {
          list.push({ x0: a, x1: b, y0: c, y1: d, z: tall(i * 17 + j * 5 + k) * 0.75, warm: seeded(i * k + j), neon: false });
        }
      } else if (r < 0.86) {
        const my = (y0 + y1) / 2;
        list.push({ x0, x1, y0, y1: my - 0.03, z: tall(i + j * 11) * 0.85, warm: seeded(j * 7 + i), neon: false });
        list.push({ x0, x1, y0: my + 0.03, y1, z: tall(i * 3 + j * 19) * 0.6, warm: seeded(j + i * 9), neon: false });
      } else list.push({ x0, x1, y0, y1, z: 0.06 + seeded(i + j) * 0.08, warm: 0.2, neon: false });
    }
  }
  // Back to front, so nearer buildings cover farther ones.
  list.sort((a, b) => a.x0 + a.y0 + a.x1 + a.y1 - (b.x0 + b.y0 + b.x1 + b.y1));

  const [city, cg] = make();
  const twinkle: P[] = [], antennas: P[] = [], neon: P[] = [];
  for (const b of list) {
    const { x0, x1, y0, y1, z } = b;
    const [, top] = iso(x1, y1, z), [, bottom] = iso(x1, y1, 0);
    const shade = (light: number) => { const g = cg.createLinearGradient(0, bottom, 0, top); g.addColorStop(0, `rgb(${10 + light},${10 + light},${13 + light})`); g.addColorStop(1, `rgb(${22 + light},${21 + light},${26 + light})`); return g; };
    quad(cg, [iso(x0, y1), iso(x1, y1), iso(x1, y1, z), iso(x0, y1, z)], shade(4));
    quad(cg, [iso(x1, y0), iso(x1, y1), iso(x1, y1, z), iso(x1, y0, z)], shade(-2));
    quad(cg, [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], '#24232a');
    // A thin bright edge on the roof, catching the light.
    cg.strokeStyle = 'rgba(255,255,255,0.07)'; cg.lineWidth = 1;
    cg.beginPath(); cg.moveTo(...iso(x0, y1, z)); cg.lineTo(...iso(x1, y1, z)); cg.lineTo(...iso(x1, y0, z)); cg.stroke();
    if (z < 0.15) continue;
    // Windows on both faces: floors and columns, some lit warm, a few cool.
    const floors = Math.max(1, Math.round(z * 9)), lit = 0.18 + b.warm * 0.45;
    for (const face of [0, 1] as const) {
      const span = face === 0 ? x1 - x0 : y1 - y0, cols = Math.max(2, Math.round(span * 9));
      const pt = (u: number, zz: number): P => (face === 0 ? iso(x0 + u * span, y1, zz) : iso(x1, y0 + u * span, zz));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const on = seeded(x0 * 97 + y0 * 31 + f * 7 + c * 3 + face) < lit;
          const u0 = (c + 0.2) / cols, u1 = (c + 0.75) / cols, z0 = ((f + 0.25) / floors) * z * 0.96, z1 = ((f + 0.7) / floors) * z * 0.96;
          const tone = seeded(f * 13 + c + x0) < 0.2 ? '255,236,245' : '233,196,106';
          quad(cg, [pt(u0, z0), pt(u1, z0), pt(u1, z1), pt(u0, z1)], on ? `rgba(${tone},${0.45 + seeded(c + f) * 0.5})` : 'rgba(255,255,255,0.03)');
          if (on && twinkle.length < 700 && seeded(f + c * 7 + y1) < 0.5) twinkle.push(pt((u0 + u1) / 2, (z0 + z1) / 2));
        }
      }
    }
    // Tall ones: an antenna with a light on top; some: a pink neon strip down the front corner.
    if (z > 1) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      cg.strokeStyle = 'rgba(255,255,255,0.25)';
      cg.beginPath(); cg.moveTo(...iso(cx, cy, z)); cg.lineTo(...iso(cx, cy, z + 0.3)); cg.stroke();
      antennas.push(iso(cx, cy, z + 0.3));
    }
    if (b.neon) {
      quad(cg, [iso(x1 - 0.015, y1, z * 0.15), iso(x1, y1 - 0.015, z * 0.15), iso(x1, y1 - 0.015, z * 0.9), iso(x1 - 0.015, y1, z * 0.9)], 'rgba(244,114,182,0.95)');
      neon.push(iso(x1, y1, z * 0.55));
    }
  }
  return { key, ground, city, twinkle, antennas, neon };
}
