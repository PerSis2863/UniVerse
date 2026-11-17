'use client';

import type { LucideIcon } from 'lucide-react';

// M262: the recording's map marks, for the canvas maps (Relief, Trace; WorldCanvas): round markers with an icon
// (ink for the usual, white with an accent ring and a soft halo for what's at risk, the accent filled with two rings
// pulsing out for the chosen one), an incident's rings, a destination's dashed zone, a route already travelled (ink),
// planned (dotted grey) and new (accent), and a place's white tag with a second line. Icons come from hidden lucide
// SVGs drawn once into small canvases (`IconSource` + `drawIcons`), never per frame.

export type Look = 'ink' | 'risk' | 'hot' | 'plain';
export type Icons = Map<string, HTMLCanvasElement>; // `${id}:${tone}`
const TONES = { white: '#ffffff', ink: '#18181b', muted: '#52525b' } as const;
const PX = 2; // drawn at twice the size: sharp on phones

/** The icons, hidden, for `drawIcons` to read. */
export function IconSource({ ref, icons }: { ref: React.Ref<HTMLDivElement>; icons: Record<string, LucideIcon> }) {
  return (
    <div ref={ref} aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', visibility: 'hidden' }}>
      {Object.entries(icons).map(([id, I]) => <I key={id} data-id={id} width={24} height={24} strokeWidth={2.2} />)}
    </div>
  );
}
const load = (svg: string) => new Promise<HTMLImageElement | null>((ok) => {
  const img = new Image(), t = setTimeout(() => ok(null), 1500);
  img.onload = () => { clearTimeout(t); ok(img); }; img.onerror = () => { clearTimeout(t); ok(null); };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
/** Each icon in white, ink, grey and the accent, as 20 px images. */
export async function drawIcons(root: HTMLElement | null, accent: string): Promise<Icons> {
  const out: Icons = new Map();
  if (!root) return out;
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-id]')) {
    for (const [tone, color] of Object.entries({ ...TONES, accent })) {
      const c = svg.cloneNode(true) as SVGSVGElement;
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('color', color); c.style.color = color;
      const img = await load(new XMLSerializer().serializeToString(c));
      if (!img) continue;
      const cv = document.createElement('canvas'); cv.width = cv.height = 20 * PX;
      cv.getContext('2d')!.drawImage(img, 0, 0, 20 * PX, 20 * PX);
      out.set(`${svg.dataset.id}:${tone}`, cv);
    }
  }
  return out;
}

const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
/** Two rings pulsing out from a point (`t` the frame's time; still with Reduce Motion). */
export function rings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, t: number, calm: boolean, reach = 26) {
  ctx.lineWidth = 1.5;
  for (const k of [0, 0.5]) {
    const ph = calm ? 0.45 + k * 0.4 : ((t / 2200) + k) % 1;
    ctx.strokeStyle = alpha(color, (1 - ph) * 0.75);
    ctx.beginPath(); ctx.arc(x, y, r + ph * reach, 0, Math.PI * 2); ctx.stroke();
  }
}
/** The still part of a marker (halo, disc, shadow, ring, icon), drawn once per look, icon, theme and size, then stamped
 *  every frame with drawImage: a canvas shadow per marker per frame is what makes a busy map stutter. */
const stamps = new Map<string, HTMLCanvasElement>();
function stamp(look: Look, icons: Icons, icon: string, accent: string, dark: boolean, s: number) {
  const img = icons.get(`${icon}:${look === 'ink' ? (dark ? 'ink' : 'white') : look === 'hot' ? 'white' : look === 'risk' ? 'accent' : dark ? 'white' : 'muted'}`);
  const key = `${look}|${icon}|${accent}|${dark}|${s}|${img ? 1 : 0}`;
  const had = stamps.get(key);
  if (had) return had;
  const r = (look === 'hot' ? 15 : look === 'plain' ? 10.5 : 13) * s, halo = look === 'hot' ? 13 : look === 'risk' ? 10 : 0, half = Math.ceil(r + halo * s + 6);
  const c = document.createElement('canvas'); c.width = c.height = half * 2 * PX;
  const ctx = c.getContext('2d')!; ctx.scale(PX, PX);
  const x = half, y = half;
  if (halo) { ctx.fillStyle = alpha(accent, look === 'hot' ? 0.2 : 0.16); ctx.beginPath(); ctx.arc(x, y, r + halo * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.fillStyle = look === 'ink' ? (dark ? '#f4f4f5' : '#18181b') : look === 'hot' ? accent : dark ? '#26282e' : '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (look === 'risk' || look === 'hot') { ctx.strokeStyle = look === 'hot' ? '#ffffff' : accent; ctx.lineWidth = look === 'hot' ? 3 : 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  if (look === 'plain') { ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  const d = (look === 'plain' ? 11 : 14) * s;
  if (img) ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
  if (img) stamps.set(key, c); // until the icons arrive, drawn again next time
  return c;
}
/** A round marker with its icon. */
export function unit(ctx: CanvasRenderingContext2D, x: number, y: number, look: Look, icons: Icons, icon: string, o: { accent: string; dark: boolean; t: number; calm: boolean; scale?: number; badge?: string }) {
  const s = Math.round((o.scale ?? 1) * 20) / 20, r = (look === 'hot' ? 15 : look === 'plain' ? 10.5 : 13) * s;
  const c = stamp(look, icons, icon, o.accent, o.dark, s), w = c.width / PX;
  ctx.drawImage(c, x - w / 2, y - w / 2, w, w);
  if (look === 'hot') rings(ctx, x, y, r + 4, o.accent, o.t, o.calm, 30 * s);
  if (o.badge) { // a small dot at the top right (green: someone's on it)
    ctx.fillStyle = o.badge; ctx.strokeStyle = o.dark ? '#17191e' : '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + r * 0.72, y - r * 0.72, 4.5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
/** A number in an ink circle (several close together). */
export function count(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, dark: boolean, hot: boolean, accent: string) {
  const r = 11 + Math.min(7, Math.log2(n) * 2.2);
  if (hot) { ctx.fillStyle = alpha(accent, 0.18); ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.arc(x, y + 1.5, r + 1.5, 0, Math.PI * 2); ctx.fill(); // a soft edge without a canvas shadow
  ctx.fillStyle = dark ? '#f4f4f5' : '#18181b'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (hot) { ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = dark ? '#18181b' : '#ffffff'; ctx.font = `700 ${n > 99 ? 11 : 12}px Inter, ui-sans-serif, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + 0.5);
  return r;
}
/** An incident: a dot inside two still rings, with two more pulsing out. */
export function incident(ctx: CanvasRenderingContext2D, x: number, y: number, accent: string, t: number, calm: boolean) {
  ctx.fillStyle = alpha(accent, 0.12); ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = alpha(accent, 0.7);
  for (const r of [10, 20]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  rings(ctx, x, y, 20, accent, t, calm, 22);
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
}
/** A destination's zone: a soft disc with a dashed edge and a dot. */
export function zone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, accent: string) {
  ctx.fillStyle = alpha(accent, 0.14); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.setLineDash([4, 4]); ctx.strokeStyle = alpha(accent, 0.85); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = accent; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
/** A route: already travelled (ink), planned (dotted grey) or new (the accent); a gentle curve through its points. */
export function route(ctx: CanvasRenderingContext2D, pts: [number, number][], kind: 'done' | 'plan' | 'new', o: { accent: string; dark: boolean }) {
  if (pts.length < 2) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'plan') { ctx.setLineDash([1.5, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = o.dark ? 'rgba(228,228,231,0.6)' : 'rgba(63,63,70,0.65)'; }
  else { ctx.lineWidth = kind === 'done' ? 3.5 : 4; ctx.strokeStyle = kind === 'done' ? (o.dark ? '#f4f4f5' : '#18181b') : o.accent; }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    // One stretch: a slight bow, as the recording's lines curve rather than run ruler-straight.
    const [a, b] = pts, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    ctx.quadraticCurveTo(mx - dy * 0.12, my + dx * 0.12, b[0], b[1]);
  } else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke(); ctx.restore();
}
/** A place's white tag: a bold name and a quieter second line, beside the point. */
export function tag(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string | null, dark: boolean) {
  ctx.font = '600 12px Inter, ui-sans-serif, system-ui';
  const w1 = ctx.measureText(title).width;
  ctx.font = '500 11px Inter, ui-sans-serif, system-ui';
  const w2 = sub ? ctx.measureText(sub).width : 0, w = Math.max(w1, w2) + 20, h = sub ? 38 : 26, top = y - h / 2;
  // Beside the point, on its left when there's no room on the right.
  const room = ctx.canvas.clientWidth || Infinity, left = x + 12 + w > room - 56 ? x - 12 - w : x + 12;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  ctx.fillStyle = dark ? '#1f2127' : '#ffffff'; ctx.beginPath(); ctx.roundRect(left, top, w, h, 9); ctx.fill(); ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '600 12px Inter, ui-sans-serif, system-ui'; ctx.fillStyle = dark ? '#f4f4f5' : '#18181b'; ctx.fillText(title, left + 10, sub ? top + 13 : y);
  if (sub) { ctx.font = '500 11px Inter, ui-sans-serif, system-ui'; ctx.fillStyle = dark ? '#a1a1aa' : '#71717a'; ctx.fillText(sub, left + 10, top + 27); }
}
