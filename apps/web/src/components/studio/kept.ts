import { useEffect, useRef, useState } from 'react';

/** State kept on this device (localStorage), for the bigger Create tools. Loaded in the browser only. */
export function useKept<T>(key: string, init: T | (() => T)) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); if (s) return JSON.parse(s) as T; } catch { /* private window */ }
    return typeof init === 'function' ? (init as () => T)() : init;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // A short pause, so typing doesn't write on every key.
    const t = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full or blocked */ } }, 250);
    return () => clearTimeout(t);
  }, [key, v]);
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
