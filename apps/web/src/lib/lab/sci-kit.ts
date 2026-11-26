import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';

// The small pieces every science and industry toolbox (M492–M505) shares when it speaks the language: registering a
// function, calling another (plot, title…), turning numbers into rows and columns, reading name–value options and
// building result structs.

export const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
export const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
export const row = (v: ArrayLike<number>) => mat(1, v.length, v);
export const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
/** A matrix whose rows are the given rows. */
export const rows = (r: number[][]) => { const m = mat(r.length, r[0]?.length ?? 0); r.forEach((x, i) => x.forEach((v, j) => { m.d[i + j * r.length] = v; })); return m; };
export const nums = (v: Value | undefined, what = 'This') => [...toMat(v ?? mat(0, 0), what).d];
/** One number, or the default when the argument is missing or empty. */
export const one = (v: Value | undefined, d: number) => (v && v.k === 'mat' && v.d.length ? v.d[0] : d);
export const need = (v: Value | undefined, what: string) => { const x = one(v, NaN); if (!Number.isFinite(x)) throw new LabError(`${what} is needed (a number).`); return x; };
export const isText = (v: Value | undefined): v is { k: 'str'; v: string } => v?.k === 'str';
/** Name–value pairs from `from` on: the names (lower case) it may take, each kept as its value. */
export function options(a: Value[], from: number, allowed: string[], what: string): Map<string, Value> {
  const out = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) {
    const ai = a[i], k = isText(ai) ? ai.v.toLowerCase() : '';
    const hit = allowed.find((x) => x.toLowerCase() === k);
    if (!hit || a[i + 1] === undefined) throw new LabError(`${what}'s options are ${allowed.map((x) => `'${x}'`).join(', ')} (as name, value pairs).`);
    out.set(hit, a[i + 1]);
  }
  return out;
}
export const optNum = (o: Map<string, Value>, k: string, d: number) => one(o.get(k), d);
export const optText = (o: Map<string, Value>, k: string, d: string) => (o.has(k) ? textOf(o.get(k)!) : d);
/** A struct of numbers, rows of numbers and text. */
export const record = (fields: [string, number | ArrayLike<number> | string | Value][]): Struct => ({
  k: 'struct',
  f: new Map<string, Value>(fields.map(([k, v]) => [k, typeof v === 'number' ? num(v) : typeof v === 'string' ? str(v) : 'k' in (v as object) ? (v as Value) : row(v as ArrayLike<number>)])),
});
export const field = (s: Value | undefined, k: string, what: string): number => {
  if (s?.k !== 'struct' || !s.f.has(k)) throw new LabError(`${what} needs a struct with the field ${k}.`);
  return toMat(s.f.get(k)!).d[0];
};
/** Lines against one x, with a legend, labels and a grid. */
export function lines(lab: Lab, x: ArrayLike<number>, ys: ArrayLike<number>[], labels: string[], xl: string, yl: string, title: string) {
  const args: Value[] = ys.flatMap((y) => [row(x), row(y)]);
  call(lab, 'plot', ...args);
  if (labels.length) call(lab, 'legend', ...labels.map(str));
  call(lab, 'xlabel', str(xl)); call(lab, 'ylabel', str(yl)); call(lab, 'title', str(title)); call(lab, 'grid', str('on'));
}
