import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { textOf } from './interp';
import { gfx } from './plot';
import './files'; // its delete is wrapped below, so it must be defined first
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';

// Hyperion's apps (M554, the owner, 26 Nov: "building your own app windows with buttons and sliders"): a script makes a
// window with uifigure and puts parts in it (uibutton, uislider, uilabel, uieditfield, uicheckbox, uidropdown,
// uiaxes), each at a Position [left bottom width height] in pixels like MATLAB's. Each part is a handle (a number):
// set(h, 'Text', …) and get(h, 'Value') change and read it, plot(ax, …) draws in a uiaxes. A press, a slide or a choice
// in the window runs the part's callback in the same workspace with (source, event), event.Value the new value. The
// worker sends the windows' description after every run (`appsOut`); the Code window draws them (`AppWindows.tsx`).

export type PartKind = 'button' | 'slider' | 'label' | 'editfield' | 'numfield' | 'checkbox' | 'dropdown' | 'axes';
export interface Part {
  id: number; kind: PartKind; parent: number; pos: [number, number, number, number];
  text: string; value: number | string | boolean; limits: [number, number]; items: string[]; enable: boolean;
  /** The callback (ButtonPushedFcn or ValueChangedFcn), kept as the language's function value. */
  fn: Value | null;
  /** uiaxes: the figure it draws into. */
  figure: number | null;
}
export interface AppWin { id: number; name: string; pos: [number, number, number, number]; parts: number[] }
interface Apps { wins: AppWin[]; parts: Map<number, Part>; next: number }

const STATE = new WeakMap<Lab, Apps>();
const appsOf = (lab: Lab): Apps => { let s = STATE.get(lab); if (!s) { s = { wins: [], parts: new Map(), next: 50_001 }; STATE.set(lab, s); } return s; };

/** What the window draws: every app window and its parts (no function values: they stay in the worker). */
export interface PartOut { id: number; kind: PartKind; pos: [number, number, number, number]; text: string; value: number | string | boolean; limits: [number, number]; items: string[]; enable: boolean; figure: number | null }
export interface AppOut { id: number; name: string; pos: [number, number, number, number]; parts: PartOut[] }
export function appsOut(lab: Lab): AppOut[] {
  const s = appsOf(lab);
  return s.wins.map((w) => ({ id: w.id, name: w.name, pos: w.pos, parts: w.parts.map((p) => s.parts.get(p)!).filter(Boolean).map((p) => ({ id: p.id, kind: p.kind, pos: p.pos, text: p.text, value: p.value, limits: p.limits, items: p.items, enable: p.enable, figure: p.figure })) }));
}
/** The figures drawn inside apps (the Figure tab leaves them out). */
export const appFigures = (lab: Lab) => [...appsOf(lab).parts.values()].flatMap((p) => (p.figure !== null ? [p.figure] : []));

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const handle = (v: Value | undefined) => (v && v.k === 'mat' && v.d.length === 1 ? v.d[0] : NaN);
const isApp = (lab: Lab, v: Value | undefined) => appsOf(lab).wins.some((w) => w.id === handle(v));
const cellOf = (items: string[]): Cell => ({ k: 'cell', r: 1, c: items.length, d: items.map(str) });
const listOf = (v: Value): string[] => (v.k === 'cell' ? v.d.map((x) => textOf(x)) : v.k === 'str' ? [v.v] : [...toMat(v).d].map(String));
const vec4 = (v: Value, what: string): [number, number, number, number] => { const d = [...toMat(v, what).d]; if (d.length !== 4) throw new LabError(`${what} is [left bottom width height].`); return d as [number, number, number, number]; };

/** Name–value pairs on a part (or a window). */
function setProps(lab: Lab, target: Part | AppWin, args: Value[]) {
  for (let i = 0; i + 1 < args.length; i += 2) {
    const k = textOf(args[i]).toLowerCase(), v = args[i + 1];
    if (k === 'position') target.pos = vec4(v, 'Position');
    else if ('parts' in target) { if (k === 'name') target.name = textOf(v); }
    else if (k === 'text') target.text = textOf(v);
    else if (k === 'value') target.value = v.k === 'str' ? v.v : target.kind === 'checkbox' ? !!toMat(v).d[0] : toMat(v).d[0];
    else if (k === 'limits') { const d = [...toMat(v, 'Limits').d]; target.limits = [d[0], d[1]]; }
    else if (k === 'items') target.items = listOf(v);
    else if (k === 'enable') target.enable = v.k === 'str' ? /^on$/i.test(v.v) : !!toMat(v).d[0];
    else if (k === 'buttonpushedfcn' || k === 'valuechangedfcn' || k === 'valuechangingfcn') target.fn = v;
    else if (k === 'title') { if (target.figure !== null) { gfx(lab).figure(target.figure); BUILTINS.title([v], 0, lab); } }
  }
  if ('kind' in target && target.kind === 'slider' && typeof target.value === 'number') target.value = Math.min(target.limits[1], Math.max(target.limits[0], target.value));
}

const START: Record<PartKind, Partial<Part> & { size: [number, number] }> = {
  button: { text: 'Button', size: [100, 22] }, slider: { value: 0, limits: [0, 100], size: [150, 3] }, label: { text: 'Label', size: [80, 22] },
  editfield: { value: '', size: [100, 22] }, numfield: { value: 0, size: [100, 22] }, checkbox: { text: 'Check Box', value: false, size: [120, 22] },
  dropdown: { items: ['Option 1', 'Option 2', 'Option 3', 'Option 4'], value: 'Option 1', size: [100, 22] }, axes: { size: [300, 185] },
};
function makePart(lab: Lab, kind: PartKind, a: Value[]): Value[] {
  const s = appsOf(lab);
  let rest = a, parent = s.wins[s.wins.length - 1]?.id ?? NaN;
  if (a.length && isApp(lab, a[0])) { parent = handle(a[0]); rest = a.slice(1); }
  if (Number.isNaN(parent)) { parent = makeWin(lab, []); }
  // uieditfield(fig, 'numeric'): the style before the pairs.
  let k = kind;
  if (kind === 'editfield' && rest[0]?.k === 'str' && /^numeric$/i.test(rest[0].v)) { k = 'numfield'; rest = rest.slice(1); }
  else if (kind === 'editfield' && rest[0]?.k === 'str' && /^text$/i.test(rest[0].v)) rest = rest.slice(1);
  const st = START[k], win = s.wins.find((w) => w.id === parent)!, n = win.parts.length;
  const p: Part = { id: s.next++, kind: k, parent, pos: [20, win.pos[3] - 40 - n * 34, st.size[0], st.size[1]], text: st.text ?? '', value: st.value ?? '', limits: st.limits ?? [0, 1], items: st.items ?? [], enable: true, fn: null, figure: null };
  if (k === 'axes') { const g = gfx(lab), before = g.current; p.figure = g.figure().id; if (before) g.current = before; }
  setProps(lab, p, rest);
  s.parts.set(p.id, p);
  win.parts.push(p.id);
  gfx(lab).changed();
  return [num(p.id)];
}
function makeWin(lab: Lab, a: Value[]): number {
  const s = appsOf(lab), w: AppWin = { id: s.next++, name: `App ${s.wins.length + 1}`, pos: [100, 100, 640, 480], parts: [] };
  let rest = a;
  if (rest[0]?.k === 'str' && rest.length % 2 === 1) { w.name = rest[0].v; rest = rest.slice(1); }
  setProps(lab, w, rest);
  s.wins.push(w);
  gfx(lab).changed();
  return w.id;
}

def('uifigure', (a, _n, lab) => [num(makeWin(lab, a))]);
def('uibutton', (a, _n, lab) => makePart(lab, 'button', a));
def('uislider', (a, _n, lab) => makePart(lab, 'slider', a));
def('uilabel', (a, _n, lab) => makePart(lab, 'label', a));
def('uieditfield', (a, _n, lab) => makePart(lab, 'editfield', a));
def('uicheckbox', (a, _n, lab) => makePart(lab, 'checkbox', a));
def('uidropdown', (a, _n, lab) => makePart(lab, 'dropdown', a));
def('uiaxes', (a, _n, lab) => makePart(lab, 'axes', a));
def('uialert', (a, _n, lab) => { lab.host.out(`[${a[2] ? textOf(a[2]) : 'Alert'}] ${a[1] ? textOf(a[1]) : ''}\n`); return []; });

// set and get on app parts and windows; anything else goes to the graphics' own set/get.
const plainSet = BUILTINS.set, plainGet = BUILTINS.get;
def('set', (a, n, lab) => {
  const s = appsOf(lab), id = handle(a[0]), target = s.parts.get(id) ?? s.wins.find((w) => w.id === id);
  if (!target) return plainSet(a, n, lab);
  setProps(lab, target, a.slice(1));
  gfx(lab).changed();
  return [];
});
def('get', (a, n, lab) => {
  const s = appsOf(lab), p = s.parts.get(handle(a[0]));
  if (!p) { if (plainGet) return plainGet(a, n, lab); throw new LabError('get needs a handle.'); }
  const k = a[1] ? textOf(a[1]).toLowerCase() : 'value';
  if (k === 'value') return [typeof p.value === 'string' ? str(p.value) : mat(1, 1, [Number(p.value)])];
  if (k === 'text') return [str(p.text)];
  if (k === 'limits') return [mat(1, 2, p.limits)];
  if (k === 'items') return [cellOf(p.items)];
  if (k === 'position') return [mat(1, 4, p.pos)];
  throw new LabError(`An app part has no property ${textOf(a[1])}.`);
});
def('delete', ((orig) => (a: Value[], n: number, lab: Lab) => {
  const s = appsOf(lab), id = handle(a[0]), w = s.wins.find((x) => x.id === id);
  if (w) { for (const p of w.parts) s.parts.delete(p); s.wins = s.wins.filter((x) => x !== w); gfx(lab).changed(); return []; }
  if (s.parts.has(id)) { const p = s.parts.get(id)!; s.parts.delete(id); const pw = s.wins.find((x) => x.id === p.parent); if (pw) pw.parts = pw.parts.filter((x) => x !== id); gfx(lab).changed(); return []; }
  if (orig) return orig(a, n, lab);
  throw new LabError('delete needs a file name or a handle.');
})(BUILTINS.delete));

// Drawing into a uiaxes: plot(ax, …), title(ax, …) and the rest draw on its figure, then the current one comes back.
for (const name of ['plot', 'scatter', 'bar', 'area', 'stairs', 'stem', 'histogram', 'surf', 'mesh', 'contour', 'title', 'xlabel', 'ylabel', 'grid', 'hold', 'legend', 'axis', 'cla', 'xlim', 'ylim', 'semilogy', 'loglog', 'fill', 'line', 'text', 'imagesc', 'image', 'imshow']) {
  const orig = BUILTINS[name];
  if (!orig) continue;
  BUILTINS[name] = (a, n, lab) => {
    const p = appsOf(lab).parts.get(handle(a[0]));
    if (!p || p.figure === null) return orig(a, n, lab);
    const g = gfx(lab), before = g.current;
    g.figure(p.figure);
    try { return orig(a.slice(1), n, lab); } finally { if (before && before.id !== p.figure) g.current = before; }
  };
}

/** A press, slide or choice in the window: the part takes the value, then its callback runs as fn(source, event). */
export function fireAppEvent(lab: Lab, ev: { part: number; value: number | string | boolean | null }) {
  const p = appsOf(lab).parts.get(ev.part);
  if (!p) throw new LabError('That app part no longer exists: run the script again.');
  if (ev.value !== null) p.value = p.kind === 'slider' ? Math.min(p.limits[1], Math.max(p.limits[0], Number(ev.value))) : ev.value;
  gfx(lab).changed();
  if (!p.fn) return;
  const value: Value = typeof p.value === 'string' ? str(p.value) : mat(1, 1, [Number(p.value)]);
  const event: Struct = { k: 'struct', f: new Map<string, Value>([['Value', value], ['Source', num(p.id)], ['EventName', str(p.kind === 'button' ? 'ButtonPushed' : 'ValueChanged')]]) };
  // A callback written for one argument (or none) gets what it asks for.
  const want = p.fn.k === 'fn' && p.fn.params ? p.fn.params.length : 2;
  lab.callFn(p.fn, [num(p.id), event].slice(0, Math.min(2, want)), 0);
}
