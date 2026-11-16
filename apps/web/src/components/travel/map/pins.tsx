'use client';

import { BedDouble, BookOpen, Coffee, Landmark, Palette, ShoppingBag, Star, TrainFront, Trees, Utensils, Wine, type LucideIcon } from 'lucide-react';
import type { Map as MLMap } from 'maplibre-gl';
import type { CategoryId } from '@/lib/travel-map';

// M214 (the owner, on the map: "this thing look messy … user cant understand what to look for … it should
// look sharp"): each kind of place gets a round pin in its own colour with its icon, drawn at twice the
// screen's size so it stays sharp, and placed by the map without overlapping (the notable ones first).
// The icons are the app's own (lucide), read from hidden SVGs this component renders.

export const PINS: Record<CategoryId | 'story' | 'review', { icon: LucideIcon; color: string }> = {
  see: { icon: Landmark, color: '#e11d48' },
  eat: { icon: Utensils, color: '#ea580c' },
  cafe: { icon: Coffee, color: '#a16207' },
  drink: { icon: Wine, color: '#9333ea' },
  museum: { icon: Palette, color: '#db2777' },
  park: { icon: Trees, color: '#15803d' },
  shop: { icon: ShoppingBag, color: '#b45309' },
  stay: { icon: BedDouble, color: '#4f46e5' },
  go: { icon: TrainFront, color: '#0369a1' },
  story: { icon: BookOpen, color: '#d97706' },
  review: { icon: Star, color: '#047857' },
};
export type PinId = keyof typeof PINS;
/** A pin's name colour beside it on the map (M229, as Apple Maps does): its own colour, lighter on the dark map. */
export function labelColor(id: PinId, dark: boolean): string {
  const hex = PINS[id].color, mix = dark ? 0.4 : 0;
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - mix) + 255 * mix).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}
export type PinImages = Map<string, ImageData>;

/** The icons as hidden SVGs, to draw the pins from. */
export function PinSource({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} hidden aria-hidden>
      {(Object.keys(PINS) as PinId[]).map((k) => { const Icon = PINS[k].icon; return <Icon key={k} data-pin={k} />; })}
    </div>
  );
}

const R = 2; // drawn at twice the size
/** An icon as a picture (never waiting more than a second: the map doesn't wait on its pins). */
const load = (svg: string) => new Promise<HTMLImageElement | null>((ok) => { const img = new Image(); const t = setTimeout(() => ok(null), 1000); img.onload = () => { clearTimeout(t); ok(img); }; img.onerror = () => { clearTimeout(t); ok(null); }; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });

/** A pin per kind: a 30 px disc in its colour, a white rim and its white icon; and a small grey dot for other places. */
export async function drawPins(root: HTMLElement | null): Promise<PinImages> {
  const out: PinImages = new Map();
  const size = 34 * R, c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!root || !g) return out;
  for (const el of root.querySelectorAll<SVGElement>('svg[data-pin]')) {
    const id = el.dataset.pin as PinId;
    const svg = el.cloneNode(true) as SVGElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
    svg.setAttribute('stroke', '#ffffff'); svg.setAttribute('stroke-width', '2.25');
    const icon = await load(new XMLSerializer().serializeToString(svg));
    g.clearRect(0, 0, size, size);
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 3 * R; g.shadowOffsetY = 1 * R;
    g.beginPath(); g.arc(size / 2, size / 2, 15 * R, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.shadowColor = 'transparent';
    g.beginPath(); g.arc(size / 2, size / 2, 13 * R, 0, Math.PI * 2); g.fillStyle = PINS[id].color; g.fill();
    if (icon) g.drawImage(icon, size / 2 - 8 * R, size / 2 - 8 * R, 16 * R, 16 * R);
    out.set(`uv-pin-${id}`, g.getImageData(0, 0, size, size));
  }
  // Other places: a small dot with a hairline rim.
  const d = 10 * R, dc = document.createElement('canvas');
  dc.width = d; dc.height = d;
  const dg = dc.getContext('2d', { willReadFrequently: true });
  if (dg) {
    dg.beginPath(); dg.arc(d / 2, d / 2, 4 * R, 0, Math.PI * 2); dg.fillStyle = '#ffffff'; dg.fill();
    dg.beginPath(); dg.arc(d / 2, d / 2, 3 * R, 0, Math.PI * 2); dg.fillStyle = '#8b95a1'; dg.fill();
    out.set('uv-dot', dg.getImageData(0, 0, d, d));
  }
  return out;
}

/** Put the pins into the map's style (again after every style change). */
export function addPins(map: MLMap, pins: PinImages) {
  for (const [id, data] of pins) if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: R });
}
