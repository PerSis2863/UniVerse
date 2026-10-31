// Readable colours (Office suite): text colours someone chose are nudged lighter or darker until
// they can be read on the background they're shown on (WCAG's 4.5 : 1), so a dark red typed in a
// light sheet still reads in dark mode, and text on a coloured fill picks black or white.
// Import-free; tested in contrast.test.ts.

const rgb = (hex: string): [number, number, number] | null => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function contrast(a: string, b: string): number {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return 21;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `fg`, or the nearest colour to it that reads on `bg`. */
export function readable(fg: string, bg: string, min = 4.5): string {
  const f = rgb(fg), b = rgb(bg);
  if (!f || !b || contrast(fg, bg) >= min) return fg;
  const toward = lum(b) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let k = 0.1; k <= 1.0001; k += 0.1) {
    const c = hex(f.map((v, i) => v + (toward[i] - v) * k));
    if (contrast(c, bg) >= min) return c;
  }
  return hex(toward);
}
/** Black or white text, whichever reads better on a fill. */
export const textOn = (bg: string) => (contrast('#1d2650', bg) >= contrast('#ffffff', bg) ? '#1d2650' : '#ffffff');
