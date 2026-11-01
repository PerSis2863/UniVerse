'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONES, easeOut, glow, hash, seeded, useLiveCanvas, type Frame, type Tone } from './canvas';

// The planet (M52, after the owner's "Orbit" video and the "Globynk" picture): a globe of a few
// thousand dots on a jittered Fibonacci lattice (even, with no visible spiral), brighter where there is
// land (Natural Earth, the Trace maps' outlines, loaded after the page), lit from the top left with an
// Aqua Jade atmosphere, a teal light inside and a glint on its rim, the far side faintly showing
// through. A net of fine triangles covers it (M55, like the "Globynk" globe) with pink sparks at a few
// knots; Baby Pink arcs rise between the places, light running along them; small ripples land on it
// now and then. It turns slowly; the pointer leans it. Labels are pills on the canvas, the
// places are also a list for screen readers. Draws only while on screen (useLiveCanvas).

export interface Place { label: string; lat: number; lon: number; tone?: Tone; value?: string }

type V3 = [number, number, number];
const RAD = Math.PI / 180;
const toV = (lat: number, lon: number): V3 => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];
const LIGHT: V3 = (() => { const v: V3 = [-0.55, 0.6, 0.62]; const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; })();
const FONT = '600 11px Urbanist, system-ui, sans-serif';

interface Dot { v: V3; land: boolean; tone: 0 | 1 | 2; seed: number; delay: number; node: boolean; spark: boolean }
interface Model { dots: Dot[]; mesh: [number, number][]; proj: Float32Array }

/** The lattice for a globe of radius r (px). Land needs many points to show its shape, so the lattice
 *  is fine (5,000 to 14,000 points) and every land point is kept but only every third sea point. */
function lattice(r: number, land: ((lat: number, lon: number) => boolean) | null): Model {
  const n = Math.max(5000, Math.min(14000, Math.round(r * r * 0.5)));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dots: Dot[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
    // A little jitter breaks the visible Fibonacci spiral.
    const x = Math.cos(th) * rad + (seeded(i) - 0.5) * 0.02, z = Math.sin(th) * rad + (seeded(i + 0.5) - 0.5) * 0.02, yy = y + (seeded(i + 0.25) - 0.5) * 0.02;
    const l = Math.hypot(x, yy, z) || 1;
    const v: V3 = [x / l, yy / l, z / l];
    const isLand = land ? land(Math.asin(v[1]) / RAD, Math.atan2(v[0], v[2]) / RAD) : false;
    if (!isLand && i % 3) continue;
    const s = seeded(i + 3.7);
    // About one lattice point in nine is a node of the net (even over land and sea), a few of them pink.
    const node = i % 3 === 0 && seeded(i + 0.77) < 0.34;
    dots.push({ v, land: isLand, tone: s < 0.06 ? 2 : s < 0.32 ? 1 : 0, seed: i, delay: seeded(i + 9) * 0.35, node, spark: node && seeded(i + 5.1) < 0.06 });
  }
  // The net (M55, like the "Globynk" globe): every node joined to its four nearest, so the whole
  // globe is woven with fine triangles.
  const nodes = dots.map((d, i) => (d.node ? i : -1)).filter((i) => i >= 0);
  const reach = (2.3 * Math.sqrt((4 * Math.PI * 9) / n)) ** 2 / 2;
  const mesh: [number, number][] = [];
  const seen = new Set<string>();
  for (const a of nodes) {
    const near: [number, number][] = [];
    const va = dots[a].v;
    for (const b of nodes) {
      if (b === a) continue;
      const vb = dots[b].v, d = 1 - (va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
      if (d < reach) near.push([d, b]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (const [, b] of near.slice(0, 4)) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) { seen.add(key); mesh.push([a, b]); }
    }
  }
  return { dots, mesh, proj: new Float32Array(dots.length * 3) };
}

const dotSprites = new Map<string, HTMLCanvasElement>();
/** A small round dot with a soft edge, drawn once per colour. */
function dotSprite(rgb: string) {
  let c = dotSprites.get(rgb);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.45, `rgba(${rgb},0.95)`);
  gr.addColorStop(0.7, `rgba(${rgb},0.25)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 16);
  dotSprites.set(rgb, c);
  return c;
}

/** Where the land is: the Trace maps' country outlines drawn once into a small picture, then looked up. */
async function landMask(): Promise<(lat: number, lon: number) => boolean> {
  const { loadWorld, toBase, BASE } = await import('@/components/trace/map/engine');
  const world = await loadWorld('110m');
  const S = 512, k = S / BASE;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(k, k);
  g.fillStyle = '#fff';
  for (const country of world) g.fill(country.path);
  const px = g.getImageData(0, 0, S, S).data;
  return (lat, lon) => {
    if (Math.abs(lat) > 83) return false;
    const [x, y] = toBase(lon, lat);
    const i = (Math.min(S - 1, Math.max(0, Math.round(y * k))) * S + Math.min(S - 1, Math.max(0, Math.round(x * k)))) * 4;
    return px[i + 3] > 100;
  };
}

/** The atmosphere and the body's shading, drawn once per size. */
function bodySprite(r: number) {
  const pad = Math.ceil(r * 0.5), size = Math.ceil(r * 2 + pad * 2);
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.ceil(size * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const m = size / 2;
  // The atmosphere: Aqua Jade just outside the rim, fading out.
  const atm = g.createRadialGradient(m, m, r * 0.9, m, m, r * 1.45);
  atm.addColorStop(0, 'rgba(116,255,237,0)');
  atm.addColorStop(0.14, 'rgba(116,255,237,0.4)');
  atm.addColorStop(0.34, 'rgba(60,200,220,0.16)');
  atm.addColorStop(1, 'rgba(60,200,220,0)');
  g.fillStyle = atm;
  g.fillRect(0, 0, size, size);
  // The body: glassy, a teal light glowing inside it (the "Globynk" globe), lit from the top left,
  // darker at the far rim.
  const body = g.createRadialGradient(m - r * 0.3, m - r * 0.35, r * 0.05, m, m + r * 0.1, r);
  body.addColorStop(0, 'rgba(160,255,242,0.4)');
  body.addColorStop(0.35, 'rgba(70,200,205,0.32)');
  body.addColorStop(0.75, 'rgba(24,70,110,0.4)');
  body.addColorStop(1, 'rgba(12,22,56,0.6)');
  g.fillStyle = body;
  g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
  // A thin bright rim on the lit side.
  const rim = g.createLinearGradient(m - r, m - r, m + r, m + r);
  rim.addColorStop(0, 'rgba(166,255,243,0.75)');
  rim.addColorStop(0.5, 'rgba(116,255,237,0.12)');
  rim.addColorStop(1, 'rgba(116,255,237,0.02)');
  g.strokeStyle = rim; g.lineWidth = 1.2;
  g.beginPath(); g.arc(m, m, r - 0.6, 0, Math.PI * 2); g.stroke();
  return { c, size };
}

export function Planet({ places, arcs, label, className, pings = true, interactive = false, focus = null, selected, onPick }: {
  places: Place[];
  /** M67 (Trace's Live globe): a globe to use, not only look at. Drag to turn it, pinch / ctrl + scroll
   *  / buttons to zoom; it turns to `focus` (smoothly, the short way); no net or sparks over the land;
   *  only `selected` places (and the one pointed at) carry a name; `onPick` hears a click on a place. */
  interactive?: boolean;
  focus?: { lat: number; lon: number } | null;
  selected?: number[];
  onPick?: (i: number) => void;
  /** Pairs of indexes into places joined by an arc (default: each place to the next, in a ring). */
  arcs?: [number, number][];
  label: string;
  className?: string;
  /** Small ripples landing now and then (events arriving). */
  pings?: boolean;
}) {
  const [land, setLand] = useState<((lat: number, lon: number) => boolean) | null>(null);
  useEffect(() => {
    let live = true;
    landMask().then((f) => { if (live) setLand(() => f); }).catch(() => { /* no land: an even planet */ });
    return () => { live = false; };
  }, []);
  const pts = useMemo(() => places.map((p, i) => ({ ...p, v: toV(p.lat, p.lon), tone: p.tone ?? 'pink' as Tone, seed: hash(p.label) + i })), [places]);
  const links = useMemo(() => arcs ?? (places.length > 1 ? places.map((_, i) => [i, (i + 1) % places.length] as [number, number]).slice(0, places.length === 2 ? 1 : undefined) : []), [arcs, places]);
  const st = useRef<{ model: Model | null; land: unknown; landAt: number; body: ReturnType<typeof bodySprite> | null; r: number; yaw: number; pitch: number; widths: Map<string, number>;
    cy: number; cp: number; drag: boolean; idleAt: number; lastT: number; zoom: number; tz: number; xy: Float32Array; focusKey: string }>({
    model: null, land: null, landAt: 0, body: null, r: 0, yaw: 0, pitch: 0, widths: new Map(), cy: -0.6, cp: 0.38, drag: false, idleAt: 0, lastT: 0, zoom: 1, tz: 1, xy: new Float32Array(0), focusKey: '' });
  const [wake, setWake] = useState(0);

  const ref = useLiveCanvas(({ ctx, w, h, t, pointer, still }: Frame) => {
    const s = st.current;
    const R = Math.max(40, Math.min(w * 0.4, h * 0.4));
    if (!s.model || Math.abs(s.r - R) > 4 || s.land !== land) {
      if (s.land !== land) s.landAt = t;
      s.model = lattice(R, land); s.r = R; s.land = land; s.body = bodySprite(R);
    }
    const { dots, mesh } = s.model;
    const model = s.model;
    const cx = w / 2, cy = h / 2;
    const grow = still ? 1 : easeOut(t / 1.4);
    // Interactive: the camera eases (zoom, and the turn toward the focus, the short way round).
    const dt = s.lastT ? Math.min(0.05, Math.max(0, t - s.lastT)) : 0.016;
    s.lastT = t;
    const ease = still ? 1 : 1 - Math.exp(-dt / 0.12);
    if (interactive) {
      s.zoom += (s.tz - s.zoom) * ease;
      const fk = focus ? `${focus.lat},${focus.lon}` : '';
      if (fk !== s.focusKey) { s.focusKey = fk; s.drag = false; }
      if (focus && !s.drag) {
        const ty = focus.lon * RAD, tp = Math.max(-1.2, Math.min(1.2, focus.lat * RAD));
        const d = ((((ty - s.cy) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        s.cy += d * ease; s.cp += (tp - s.cp) * ease;
      } else if (!s.drag && !still && t > s.idleAt) s.cy += dt * 0.05;
    }
    const r = R * (0.9 + 0.1 * grow) * (interactive ? s.zoom : 1);
    const landIn = still ? 1 : easeOut((t - s.landAt) / 0.9);

    // The pointer leans the planet a little; it settles back when the pointer leaves.
    const tyaw = pointer && !interactive ? (pointer.x / w - 0.5) * 0.9 : 0, tpitch = pointer && !interactive ? (pointer.y / h - 0.5) * 0.35 : 0;
    s.yaw += (tyaw - s.yaw) * 0.06; s.pitch += (tpitch - s.pitch) * 0.06;
    const yaw = interactive ? s.cy : -0.6 + t * 0.07 + s.yaw, pitch = interactive ? s.cp : 0.38 + s.pitch;
    const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
    const rot = (v: V3): V3 => {
      const x1 = v[0] * cY - v[2] * sY, z1 = v[0] * sY + v[2] * cY;
      return [x1, v[1] * cP - z1 * sP, v[1] * sP + z1 * cP];
    };
    const lit = (q: V3) => Math.max(0, q[0] * LIGHT[0] + q[1] * LIGHT[1] + q[2] * LIGHT[2]);

    // Faint stars behind, twinkling.
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(220,240,255,${(0.1 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.9 + i * 1.7))) * grow})`;
      ctx.fillRect(seeded(i + 40) * w, seeded(i + 140) * h, 1, 1);
    }

    // The body and atmosphere.
    if (s.body) {
      const k = r / R, sz = s.body.size * k;
      ctx.globalAlpha = grow;
      ctx.drawImage(s.body.c, cx - sz / 2, cy - sz / 2, sz, sz);
      ctx.globalAlpha = 1;
    }

    // The dots: the far side faint (land only, showing through), the near side lit; land brighter
    // than sea, round and soft.
    const proj = model.proj;
    const LAND = [dotSprite('214,255,250'), dotSprite('116,255,237'), dotSprite(TONES.pink)], SEA = [dotSprite('140,165,255'), dotSprite('186,160,255')];
    const scale = Math.max(0.85, r / 170);
    ctx.fillStyle = 'rgb(140,155,255)';
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i], q = rot(d.v);
      proj[i * 3] = cx + q[0] * r; proj[i * 3 + 1] = cy - q[1] * r; proj[i * 3 + 2] = q[2];
      // Each dot arrives from the lit side outward; land fades in when it has loaded.
      const show = (still ? 1 : easeOut((t * 1.3 - (1 - q[2]) * 0.45 - d.delay) / 0.5)) * (d.land ? landIn : 1);
      if (show <= 0.01) continue;
      if (q[2] < 0) {
        // The far side shows through: its nodes and some land, faintly.
        if (!d.node && (!d.land || i % 2)) continue;
        ctx.globalAlpha = (d.node ? 0.32 : 0.14) * (1 + q[2] * 0.8) * show;
        ctx.fillRect(proj[i * 3] - 0.6, proj[i * 3 + 1] - 0.6, d.node ? 1.4 : 1, d.node ? 1.4 : 1);
        continue;
      }
      const L = lit(q), depth = 0.4 + 0.6 * q[2];
      const tw = 0.82 + 0.18 * Math.sin(t * 2.1 + d.seed);
      const sz = (d.node ? 1.6 + 0.6 * L : d.land ? 1.05 + 0.5 * L : 0.9 + 0.3 * L) * (0.65 + 0.35 * q[2]) * scale * 2;
      if (interactive && d.node && !d.land) continue; // no net knots over the sea: the land reads clearly
      ctx.globalAlpha = Math.min(1, (d.node ? 0.85 + 0.3 * L : d.land ? (interactive ? 0.6 + 0.35 * L : 0.34 + 0.32 * L) : 0.14 + 0.18 * L) * depth * tw * show);
      ctx.drawImage(d.node ? LAND[0] : d.land ? LAND[d.tone] : SEA[d.tone === 2 ? 1 : 0], proj[i * 3] - sz / 2, proj[i * 3 + 1] - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // The net: faint through the far side, brighter toward you; pink sparks glow at a few of its knots.
    const net = (lo: number, hi: number, alpha: number, width: number) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const [a, b] of mesh) {
        const z = Math.min(proj[a * 3 + 2], proj[b * 3 + 2]);
        if (z < lo || z >= hi) continue;
        ctx.moveTo(proj[a * 3], proj[a * 3 + 1]); ctx.lineTo(proj[b * 3], proj[b * 3 + 1]);
      }
      ctx.strokeStyle = `rgba(170,255,244,${alpha * grow})`;
      ctx.stroke();
    };
    if (!interactive) {
      net(-1.01, 0, 0.07, 0.5);
      net(0, 0.45, 0.22, 0.6);
      net(0.45, 1.01, 0.4, 0.75);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dots.length; i++) {
      if (interactive || !dots[i].spark) continue;
      const z = proj[i * 3 + 2];
      if (z < 0.05) continue;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.8 + dots[i].seed);
      ctx.globalAlpha = z * pulse * grow;
      ctx.drawImage(glow('pink'), proj[i * 3] - 9, proj[i * 3 + 1] - 9, 18, 18);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // The glint on the lit rim, like light catching the atmosphere.
    const gx = cx - r * 0.56, gy = cy - r * 0.62, gp = 0.75 + 0.25 * Math.sin(t * 1.3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * gp * grow;
    ctx.drawImage(glow('white'), gx - 22, gy - 22, 44, 44);
    ctx.globalAlpha = 0.35 * gp * grow;
    ctx.fillStyle = '#fff';
    ctx.fillRect(gx - 16, gy - 0.5, 32, 1); ctx.fillRect(gx - 0.5, gy - 12, 1, 24);
    ctx.globalAlpha = 1;

    // Events landing: a ripple at a land dot every 0.9 s.
    if (pings && !interactive && !still) {
      const step = Math.floor(t / 0.9);
      for (let k = step - 2; k <= step; k++) {
        if (k < 1) continue;
        const age = (t - k * 0.9) / 1.8;
        if (age < 0 || age > 1) continue;
        const i = Math.floor(seeded(k * 7.13) * dots.length);
        const z = proj[i * 3 + 2];
        if (z < 0.2) continue;
        const x = proj[i * 3], y = proj[i * 3 + 1], tone = seeded(k) < 0.5 ? 'aqua' : 'pink';
        ctx.globalAlpha = (1 - age) * z;
        ctx.drawImage(glow(tone), x - 10, y - 10, 20, 20);
        ctx.strokeStyle = `rgba(${TONES[tone]},${(1 - age) * 0.8 * z})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, 3 + age * 16, (3 + age * 16) * (0.35 + 0.65 * z), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The arcs: rising between places, hidden where they pass behind; a light runs along each.
    const P = pts.map((p) => rot(p.v));
    const hidden = (q: V3, x: number, y: number) => q[2] < 0 && Math.hypot(x - cx, y - cy) < r;
    links.forEach(([ia, ib], li) => {
      const a = pts[ia]?.v, b = pts[ib]?.v;
      if (!a || !b) return;
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), om = Math.acos(dot), so = Math.sin(om) || 1;
      const lift = 0.05 + 0.16 * (om / Math.PI);
      const N = 48, path: { x: number; y: number; hid: boolean }[] = [];
      for (let j = 0; j <= N; j++) {
        const u = j / N, fa = Math.sin((1 - u) * om) / so, fb = Math.sin(u * om) / so, hgt = 1 + lift * Math.sin(Math.PI * u);
        const q = rot([(a[0] * fa + b[0] * fb) * hgt, (a[1] * fa + b[1] * fb) * hgt, (a[2] * fa + b[2] * fb) * hgt]);
        const x = cx + q[0] * r, y = cy - q[1] * r;
        path.push({ x, y, hid: hidden(q, x, y) });
      }
      const drawn = still ? 1 : easeOut((t - 1 - li * 0.18) / 1.4);
      const end = Math.floor(N * drawn);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = `rgba(${TONES.pink},0.6)`;
      ctx.beginPath();
      for (let j = 1; j <= end; j++) {
        if (path[j].hid || path[j - 1].hid) continue;
        ctx.moveTo(path[j - 1].x, path[j - 1].y); ctx.lineTo(path[j].x, path[j].y);
      }
      ctx.stroke();
      if (still || drawn < 1) return;
      // The light: a bright head with a fading tail.
      const head = ((t / 2.6 + seeded(li + 1)) % 1) * N;
      for (let j = Math.max(1, Math.floor(head) - 10); j <= Math.floor(head); j++) {
        if (path[j].hid || path[j - 1].hid) continue;
        const f = 1 - (head - j) / 10;
        ctx.strokeStyle = `rgba(255,220,244,${0.9 * f})`;
        ctx.lineWidth = 1 + 1.4 * f;
        ctx.beginPath(); ctx.moveTo(path[j - 1].x, path[j - 1].y); ctx.lineTo(path[j].x, path[j].y); ctx.stroke();
      }
      const hp = path[Math.min(N, Math.floor(head))];
      if (!hp.hid) ctx.drawImage(glow('pink'), hp.x - 9, hp.y - 9, 18, 18);
    });
    ctx.globalCompositeOperation = 'source-over';

    // The places: a glowing node with a ripple, and a pill with the name.
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    if (s.xy.length !== pts.length * 2) s.xy = new Float32Array(pts.length * 2);
    // Interactive: the place pointed at (within 16 px) also gets its name.
    let hover = -1;
    if (interactive && pointer) {
      let best = 16;
      pts.forEach((_, i) => { const q = P[i]; if (q[2] < 0.05) return; const d = Math.hypot(cx + q[0] * r - pointer.x, cy - q[1] * r - pointer.y); if (d < best) { best = d; hover = i; } });
    }
    pts.forEach((p, i) => {
      const q = P[i];
      s.xy[i * 2] = q[2] < 0.05 ? -1e4 : cx + q[0] * r; s.xy[i * 2 + 1] = cy - q[1] * r;
      if (q[2] < 0.05) return;
      const x = cx + q[0] * r, y = cy - q[1] * r, z = Math.min(1, q[2] * 1.6), show = still ? 1 : easeOut((t - 1.2 - i * 0.12) / 0.6);
      if (show <= 0) return;
      ctx.globalAlpha = z * show;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow(p.tone), x - 13, y - 13, 26, 26);
      const rp = still ? 0.4 : ((t + seeded(p.seed)) % 2.4) / 2.4;
      ctx.strokeStyle = `rgba(${TONES[p.tone]},${(1 - rp) * 0.7})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 4 + rp * 12, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      // The pill, to the side away from the middle (interactive: only for the chosen and pointed-at).
      if (interactive && !(selected?.includes(i) || i === hover)) { ctx.globalAlpha = 1; return; }
      const text = p.value ? `${p.label} · ${p.value}` : p.label;
      let tw = s.widths.get(text);
      if (tw === undefined) { tw = ctx.measureText(text).width; s.widths.set(text, tw); }
      const bw = tw + 24, bh = 20, left = x < cx;
      const bx = Math.max(2, Math.min(w - bw - 2, left ? x - bw - 10 : x + 10)), by = Math.max(2, Math.min(h - bh - 2, y - bh - 4));
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = `rgb(${TONES[p.tone]})`;
      ctx.beginPath(); ctx.arc(bx + 10, by + bh / 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#171f44';
      ctx.fillText(text, bx + 17, by + bh / 2 + 0.5);
      ctx.globalAlpha = 1;
    });
  }, `${String(!!land)}${wake}`);

  // Turning it by hand, zooming, picking a place (interactive only).
  const down = useRef<{ x: number; y: number; moved: number; id: number } | null>(null);
  const zoomBy = (f: number) => { const s = st.current; s.tz = Math.max(1, Math.min(3.2, s.tz * f)); setWake((n) => n + 1); };
  const handlers = interactive ? {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { if ((e.target as HTMLElement).closest('button')) return; down.current = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = down.current, s = st.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy); d.x = e.clientX; d.y = e.clientY;
      if (d.moved < 4) return;
      if (!s.drag) e.currentTarget.setPointerCapture(e.pointerId);
      // A finger turns it sideways only (the page still scrolls up and down); a mouse both ways.
      const k = 1 / Math.max(80, s.r * s.zoom);
      s.drag = true; s.cy -= dx * k;
      if (e.pointerType === 'mouse') s.cp = Math.max(-1.2, Math.min(1.2, s.cp + dy * k));
      s.idleAt = s.lastT + 5;
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = down.current, s = st.current;
      down.current = null;
      if (!d || d.moved >= 4 || !onPick) { setWake((n) => n + 1); return; }
      const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = 18, pick = -1;
      for (let i = 0; i < s.xy.length / 2; i++) { const dd = Math.hypot(s.xy[i * 2] - x, s.xy[i * 2 + 1] - y); if (dd < best) { best = dd; pick = i; } }
      if (pick >= 0) onPick(pick);
    },
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.01)); },
  } : {};

  return (
    <div className={cn('relative', interactive && 'cursor-grab active:cursor-grabbing select-none', className)} {...handlers}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full touch-pan-y" />
      {interactive && (
        <div className="absolute end-3 bottom-3 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomBy(1.35)} className="w-9 h-9 grid place-items-center rounded-full bg-[#171f44]/85 text-white ring-1 ring-white/15 hover:bg-[#232d5c]" aria-label="Zoom in on the globe"><Plus className="w-4 h-4" aria-hidden /></button>
          <button type="button" onClick={() => zoomBy(1 / 1.35)} className="w-9 h-9 grid place-items-center rounded-full bg-[#171f44]/85 text-white ring-1 ring-white/15 hover:bg-[#232d5c]" aria-label="Zoom out of the globe"><Minus className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
      {places.length > 0 && (
        <ul className="sr-only">
          {places.map((p, i) => <li key={`${p.label}-${i}`}>{p.value ? `${p.label}: ${p.value}` : p.label}</li>)}
        </ul>
      )}
    </div>
  );
}
