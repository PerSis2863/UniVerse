// Hyperion's control systems (M414): how a transfer function reads, from its polynomials (highest power first). Kept
// apart from control.ts so values.ts can show one without importing the whole toolbox.

const coef = (c: number) => String(+c.toPrecision(5));

/** A polynomial in s: [1 3 2] → "s^2 + 3 s + 2". */
export function polyText(p: number[], v = 's'): string {
  const n = p.length - 1, parts: string[] = [];
  p.forEach((c, i) => {
    if (c === 0) return;
    const k = n - i, mag = Math.abs(c), sign = c < 0 ? '-' : '+';
    const body = k === 0 ? coef(mag) : `${mag === 1 ? '' : `${coef(mag)} `}${v}${k > 1 ? `^${k}` : ''}`;
    parts.push(parts.length ? ` ${sign} ${body}` : `${c < 0 ? '-' : ''}${body}`);
  });
  return parts.join('') || '0';
}

/** The fraction on three lines, centred over a line of dashes. */
export function tfText(n: number[], d: number[]): string {
  const top = polyText(n), bottom = polyText(d);
  if (bottom === '1') return `  ${top}`;
  const w = Math.max(top.length, bottom.length), pad = (t: string) => `${' '.repeat(Math.floor((w - t.length) / 2))}${t}`;
  return `  ${pad(top)}\n  ${'-'.repeat(w)}\n  ${pad(bottom)}`;
}

/** On one line, for the variables list. */
export const tfInline = (n: number[], d: number[]) => (polyText(d) === '1' ? polyText(n) : `(${polyText(n)})/(${polyText(d)})`);
