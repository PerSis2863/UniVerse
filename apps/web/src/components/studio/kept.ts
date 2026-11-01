import { createContext, useContext, useEffect, useRef, useState } from 'react';

// M75: a tool can be opened inside a scope (a shared copy: "shared:<token>:"), so its kept state
// lives apart from the person's own. Every mounted useKept is listed, so one Save button can collect
// the open tool's work without each tool knowing about saving.
const Scope = createContext('');
export const KeptScope = Scope.Provider;
const live = new Map<string, { base: string; value: () => unknown }>();

/** The open tool's kept state, as { "uv-…": JSON } (only what's on screen now, latest values). */
export function keptNow(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { base, value } of live.values()) out[base] = JSON.stringify(value());
  return out;
}

/** State kept on this device (localStorage), for the bigger Create tools. Loaded in the browser only. */
export function useKept<T>(key: string, init: T | (() => T)) {
  const scope = useContext(Scope), full = scope + key;
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(full); if (s) return JSON.parse(s) as T; } catch { /* private window */ }
    return typeof init === 'function' ? (init as () => T)() : init;
  });
  const first = useRef(true), latest = useRef(v);
  useEffect(() => {
    latest.current = v;
    if (first.current) { first.current = false; return; }
    // A short pause, so typing doesn't write on every key.
    const t = setTimeout(() => { try { localStorage.setItem(full, JSON.stringify(v)); } catch { /* full or blocked */ } }, 250);
    return () => clearTimeout(t);
  }, [full, v]);
  useEffect(() => {
    const id = `${full}#${Math.random()}`;
    live.set(id, { base: key, value: () => latest.current });
    return () => { live.delete(id); };
  }, [full, key]);
  return [v, setV] as const;
}

export const uid = () => crypto.randomUUID().slice(0, 8);
export const today = () => new Date().toISOString().slice(0, 10);

/** An SVG element as a PNG (white background), for saving. */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const { width, height } = svg.viewBox.baseVal;
  const c = document.createElement('canvas');
  c.width = width * scale; c.height = height * scale;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Couldn’t make the picture.'))), 'image/png'));
}

/** Prints only the element with this id (a print sheet hides the rest of the page). */
export function printOnly(id: string) {
  const style = document.createElement('style');
  style.textContent = `@media print { body * { visibility: hidden !important; } #${id}, #${id} * { visibility: visible !important; } #${id} { position: absolute; inset: 0 auto auto 0; width: 100%; } }`;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => style.remove(), 500);
}
