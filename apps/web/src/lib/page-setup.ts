// Page setup for documents (Office suite · O3): paper size, orientation, margins, and a header,
// footer and page numbers, used when printing (PDF) and in Word copies. Import-free.

export interface PageSetup { size: 'A4' | 'Letter' | 'Legal' | 'A5'; orientation: 'portrait' | 'landscape'; margins: 'normal' | 'narrow' | 'wide'; header: string; footer: string; numbers: boolean }
export const DEFAULT_PAGE: PageSetup = { size: 'A4', orientation: 'portrait', margins: 'normal', header: '', footer: '', numbers: false };
/** Paper sizes in millimetres (portrait) and margins in millimetres. */
export const PAPER: Record<PageSetup['size'], [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A5: [148, 210] };
export const MARGIN_MM: Record<PageSetup['margins'], number> = { normal: 25.4, narrow: 12.7, wide: 38.1 };
export function cleanPage(v: unknown): PageSetup {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pick = <T extends string>(x: unknown, list: readonly T[], d: T) => (list.includes(x as T) ? (x as T) : d);
  return {
    size: pick(o.size, ['A4', 'Letter', 'Legal', 'A5'] as const, 'A4'), orientation: pick(o.orientation, ['portrait', 'landscape'] as const, 'portrait'), margins: pick(o.margins, ['normal', 'narrow', 'wide'] as const, 'normal'),
    header: typeof o.header === 'string' ? o.header.slice(0, 200) : '', footer: typeof o.footer === 'string' ? o.footer.slice(0, 200) : '', numbers: o.numbers === true,
  };
}
/** The print CSS for a page setup: paper, margins, and the header, footer and page numbers. */
export function pageCss(p: PageSetup): string {
  const [w, h] = PAPER[p.size];
  const [pw, ph] = p.orientation === 'landscape' ? [h, w] : [w, h];
  const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
  const box = (where: string, content: string) => `@${where}{content:${content};font:9pt -apple-system,Segoe UI,Arial,sans-serif;color:#58617f}`;
  return `@page{size:${pw}mm ${ph}mm;margin:${MARGIN_MM[p.margins]}mm;${p.header ? box('top-center', q(p.header)) : ''}${p.footer ? box('bottom-left', q(p.footer)) : ''}${p.numbers ? box('bottom-right', `"Page " counter(page) " of " counter(pages)`) : ''}}`;
}
