import { HOLD, type Part, type Wave } from './circuit';

// Hyperion Simulate → Circuits (M410): the drawing board. Parts and wires join grid points; points joined by wires are
// one node; a ground symbol makes its point node "0"; probes show a node on the oscilloscope. `netlist` turns the board
// into the simulator's parts. Kept on this device (`uv-sim-circuit`).

export type ItemKind = 'wire' | 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'S' | 'M' | 'Mo';
/** `hold` and `sense` (M431): a switch that holds `hold` volts at the probe `sense` (a mark's id); 0 or none: off.
 * `ac`, `depth`, `invert` (M432): a switch whose on-time follows a sine of `ac` Hz (`depth` 0–1), or the opposite
 * half of a pair. */
export interface Item { id: string; kind: ItemKind; x1: number; y1: number; x2: number; y2: number; value: number; wave: Wave; freq: number; hold?: number; sense?: string; ac?: number; depth?: number; invert?: boolean }
export interface Mark { id: string; kind: 'ground' | 'probe'; x: number; y: number }
export interface Board { items: Item[]; marks: Mark[]; dt: number; window: number }

export const DEFAULTS: Record<Exclude<ItemKind, 'wire'>, number> = { R: 1000, C: 1e-6, L: 10e-3, V: 5, I: 1e-3, D: 0, S: 0.5, M: 2, Mo: 0.05 };
export const UNITS: Record<ItemKind, string> = { wire: '', R: 'Ω', C: 'F', L: 'H', V: 'V', I: 'A', D: '', S: '', M: 'V', Mo: 'N·m' };
export const NAMES: Record<ItemKind, string> = { wire: 'Wire', R: 'Resistor', C: 'Capacitor', L: 'Coil (inductor)', V: 'Voltage source', I: 'Current source', D: 'Diode', S: 'Switch (PWM)', M: 'Transistor (MOSFET)', Mo: 'Motor (DC)' };
/** A small DC motor's winding and shaft (M432): 1 Ω, 5 mH, 0.1 V·s/rad, 0.1 g·m², light friction. Its value on the
 * board is the load torque it turns against. */
export const MOTOR = { r: 1, l: 5e-3, k: 0.1, j: 1e-4, fric: 1e-5 };
/** A MOSFET's on-strength k (A/V²) and λ: a power transistor's (about 6 mΩ on at 10 V on its gate). */
export const MOS_K = 20, MOS_LAMBDA = 0.01;
/** Where a transistor's gate is: two grid steps to the left of its middle, going from drain to source. */
export function gatePoint(it: Pick<Item, 'x1' | 'y1' | 'x2' | 'y2'>) {
  const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1) || 1, px = -(it.y2 - it.y1) / len, py = (it.x2 - it.x1) / len;
  return { x: Math.round((it.x1 + it.x2) / 2 + 2 * px), y: Math.round((it.y1 + it.y2) / 2 + 2 * py) };
}
export const PROBE_COLOURS = ['#f59e0b', '#0ea5e9', '#ec4899', '#22c55e', '#8b5cf6', '#ef4444'];

let seq = 0;
export const itemId = (k: string) => `${k}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newItem = (kind: ItemKind, x1: number, y1: number, x2: number, y2: number): Item =>
  ({ id: itemId(kind), kind, x1, y1, x2, y2, value: kind === 'wire' ? 0 : DEFAULTS[kind], wave: 'dc', freq: kind === 'S' ? 50_000 : 50 });

/** The simulator's parts, and which node each grid point and probe is on. */
export function netlist(board: Board) {
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(k, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra === '0' ? rb : ra, ra === '0' ? ra : rb); };
  const key = (x: number, y: number) => `${x},${y}`;
  for (const it of board.items) {
    find(key(it.x1, it.y1)); find(key(it.x2, it.y2));
    if (it.kind === 'wire') join(key(it.x1, it.y1), key(it.x2, it.y2));
    if (it.kind === 'M') { const gp = gatePoint(it); find(key(gp.x, gp.y)); }
  }
  parent.set('0', '0');
  for (const m of board.marks) if (m.kind === 'ground') { find(key(m.x, m.y)); join('0', key(m.x, m.y)); }
  const node = (x: number, y: number) => find(key(x, y));
  const parts: Part[] = board.items.filter((it) => it.kind !== 'wire').map((it): Part => {
    const a = node(it.x1, it.y1), b = node(it.x2, it.y2);
    if (it.kind === 'V') return { id: it.id, kind: 'V', a, b, value: it.value, wave: it.wave, freq: it.freq };
    if (it.kind === 'D') return { id: it.id, kind: 'D', a, b };
    if (it.kind === 'Mo') return { id: it.id, kind: 'Mo', a, b, ...MOTOR, load: Math.max(0, it.value) };
    // A transistor's value is its threshold voltage; its gate is the point beside it.
    if (it.kind === 'M') { const gp = gatePoint(it); return { id: it.id, kind: 'M', a, b, g: node(gp.x, gp.y), vth: Math.max(0, it.value), k: MOS_K, lambda: MOS_LAMBDA }; }
    // A switch's value is its duty (the share of each period it is on).
    if (it.kind === 'S') {
      const probe = it.hold ? board.marks.find((m) => m.id === it.sense && m.kind === 'probe') : undefined;
      return { id: it.id, kind: 'S', a, b, duty: Math.max(0, Math.min(1, it.value)), freq: it.freq, ...(probe ? { hold: { node: node(probe.x, probe.y), target: it.hold!, ...HOLD } } : it.ac ? { sine: { m: Math.max(0, Math.min(1, it.depth ?? 0.8)), f: it.ac, phase: 0 } } : {}), ...(it.invert ? { invert: true } : {}) };
    }
    return { id: it.id, kind: it.kind as 'R' | 'C' | 'L' | 'I', a, b, value: it.value };
  });
  const probes = board.marks.filter((m) => m.kind === 'probe').map((m, i) => ({ id: m.id, node: node(m.x, m.y), label: `P${i + 1}`, colour: PROBE_COLOURS[i % PROBE_COLOURS.length] }));
  return { parts, node, probes, grounded: board.marks.some((m) => m.kind === 'ground') };
}

const it = (kind: ItemKind, x1: number, y1: number, x2: number, y2: number, value?: number, wave: Wave = 'dc', freq = 50, extra: Partial<Item> = {}): Item => ({ ...it0(kind, x1, y1, x2, y2, value, wave, freq), ...extra });
const it0 = (kind: ItemKind, x1: number, y1: number, x2: number, y2: number, value?: number, wave: Wave = 'dc', freq = 50): Item => ({ ...newItem(kind, x1, y1, x2, y2), ...(value !== undefined ? { value } : {}), wave, freq });
const mk = (kind: Mark['kind'], x: number, y: number): Mark => ({ id: itemId(kind), kind, x, y });

/** Ready-made circuits to start from. */
export const EXAMPLES: { id: string; name: string; make: () => Board }[] = [
  { id: 'rc', name: 'A capacitor charging (RC)', make: () => ({ dt: 1e-5, window: 0.03, items: [it('V', 4, 4, 4, 10, 5, 'square', 100), it('R', 4, 4, 14, 4, 1000), it('C', 14, 4, 14, 10, 2.2e-6), it('wire', 4, 10, 14, 10)], marks: [mk('ground', 4, 10), mk('probe', 4, 4), mk('probe', 14, 4)] }) },
  { id: 'rlc', name: 'Ringing (RLC)', make: () => ({ dt: 5e-6, window: 0.01, items: [it('V', 4, 4, 4, 10, 1, 'square', 100), it('R', 4, 4, 10, 4, 20), it('L', 10, 4, 16, 4, 10e-3), it('C', 16, 4, 16, 10, 1e-6), it('wire', 4, 10, 16, 10)], marks: [mk('ground', 4, 10), mk('probe', 16, 4)] }) },
  { id: 'rectifier', name: 'Turning AC into DC (rectifier)', make: () => ({ dt: 5e-5, window: 0.06, items: [it('V', 4, 4, 4, 10, 10, 'sine', 50), it('D', 4, 4, 10, 4), it('C', 10, 4, 10, 10, 100e-6), it('wire', 10, 4, 16, 4), it('R', 16, 4, 16, 10, 1000), it('wire', 4, 10, 16, 10)], marks: [mk('ground', 4, 10), mk('probe', 4, 4), mk('probe', 10, 4)] }) },
  // M424, power electronics: a PWM switch, a diode, a coil and a capacitor make DC into a lower (buck) or higher
  // (boost) DC voltage; the output settles near D·Vin (buck) or Vin/(1 − D) (boost), less the diode's drop.
  { id: 'buck', name: 'Stepping 12 V down (buck converter)', make: () => ({ dt: 1e-6, window: 0.01, items: [it('V', 4, 4, 4, 10, 12), it('S', 4, 4, 10, 4, 0.5, 'dc', 50_000), it('D', 10, 10, 10, 4), it('L', 10, 4, 18, 4, 100e-6), it('C', 18, 4, 18, 10, 100e-6), it('wire', 18, 4, 24, 4), it('R', 24, 4, 24, 10, 10), it('wire', 4, 10, 10, 10), it('wire', 10, 10, 18, 10), it('wire', 18, 10, 24, 10)], marks: [mk('ground', 4, 10), mk('probe', 10, 4), mk('probe', 18, 4)] }) },
  { id: 'boost', name: 'Stepping 5 V up (boost converter)', make: () => ({ dt: 1e-6, window: 0.01, items: [it('V', 4, 4, 4, 10, 5), it('L', 4, 4, 12, 4, 100e-6), it('S', 12, 4, 12, 10, 0.5, 'dc', 50_000), it('D', 12, 4, 18, 4), it('C', 18, 4, 18, 10, 100e-6), it('wire', 18, 4, 24, 4), it('R', 24, 4, 24, 10, 20), it('wire', 4, 10, 12, 10), it('wire', 12, 10, 18, 10), it('wire', 18, 10, 24, 10)], marks: [mk('ground', 4, 10), mk('probe', 12, 4), mk('probe', 18, 4)] }) },
  // M430: a real transistor. Its gate (the third lead) is driven by a 10 V square wave; above its 2 V threshold it
  // conducts from drain to source.
  { id: 'mosfet-boost', name: 'Boost with a transistor (MOSFET)', make: () => ({ dt: 1e-6, window: 0.01, items: [it('V', 4, 4, 4, 10, 5), it('L', 4, 4, 12, 4, 100e-6), it('M', 12, 4, 12, 10, 2), it('V', 7, 7, 7, 10, 10, 'square', 50_000), it('wire', 7, 7, 10, 7), it('D', 12, 4, 18, 4), it('C', 18, 4, 18, 10, 100e-6), it('wire', 18, 4, 24, 4), it('R', 24, 4, 24, 10, 20), it('wire', 4, 10, 7, 10), it('wire', 7, 10, 12, 10), it('wire', 12, 10, 18, 10), it('wire', 18, 10, 24, 10)], marks: [mk('ground', 4, 10), mk('probe', 12, 4), mk('probe', 18, 4)] }) },
  { id: 'mosfet-switch', name: 'A transistor switching a lamp', make: () => ({ dt: 1e-4, window: 1, items: [it('V', 4, 3, 4, 11, 12), it('wire', 4, 3, 14, 3), it('R', 14, 3, 14, 6, 24), it('M', 14, 6, 14, 11, 2), it('V', 9, 9, 9, 11, 5, 'square', 2), it('wire', 9, 9, 12, 9), it('wire', 4, 11, 9, 11), it('wire', 9, 11, 14, 11)], marks: [mk('ground', 4, 11), mk('probe', 14, 6), mk('probe', 12, 9)] }) },
  // M431: the same converters holding their own voltage: the switch reads the probe and sets its own duty.
  { id: 'reg-buck', name: 'A regulated 5 V supply (buck holding 5 V)', make: () => { const out = mk('probe', 18, 4); return { dt: 1e-6, window: 0.03, items: [it('V', 4, 4, 4, 10, 12), it('S', 4, 4, 10, 4, 0.5, 'dc', 50_000, { hold: 5, sense: out.id }), it('D', 10, 10, 10, 4), it('L', 10, 4, 18, 4, 100e-6), it('C', 18, 4, 18, 10, 100e-6), it('wire', 18, 4, 24, 4), it('R', 24, 4, 24, 10, 10), it('wire', 4, 10, 10, 10), it('wire', 10, 10, 18, 10), it('wire', 18, 10, 24, 10)], marks: [mk('ground', 4, 10), out] }; } },
  { id: 'reg-boost', name: 'A regulated 12 V from 5 V (boost holding 12 V)', make: () => { const out = mk('probe', 18, 4); return { dt: 1e-6, window: 0.03, items: [it('V', 4, 4, 4, 10, 5), it('L', 4, 4, 12, 4, 100e-6), it('S', 12, 4, 12, 10, 0.5, 'dc', 50_000, { hold: 12, sense: out.id }), it('D', 12, 4, 18, 4), it('C', 18, 4, 18, 10, 100e-6), it('wire', 18, 4, 24, 4), it('R', 24, 4, 24, 10, 30), it('wire', 4, 10, 12, 10), it('wire', 12, 10, 18, 10), it('wire', 18, 10, 24, 10)], marks: [mk('ground', 4, 10), out] }; } },
  // M432: an inverter. Two switches take turns (the lower one is the opposite of the upper), their on-time following a
  // 50 Hz sine; a coil and a capacitor smooth the pulses into AC of 0.8 × 24 V peak.
  { id: 'inverter', name: 'Turning DC into 50 Hz AC (inverter)', make: () => ({ dt: 2e-6, window: 0.04, items: [it('V', 4, 3, 4, 8, 24), it('V', 4, 8, 4, 13, 24), it('wire', 4, 3, 12, 3), it('S', 12, 3, 12, 8, 0.5, 'dc', 10_000, { ac: 50, depth: 0.8 }), it('S', 12, 8, 12, 13, 0.5, 'dc', 10_000, { ac: 50, depth: 0.8, invert: true }), it('wire', 4, 13, 12, 13), it('L', 12, 8, 20, 8, 2e-3), it('C', 20, 8, 20, 13, 10e-6), it('wire', 20, 8, 26, 8), it('R', 26, 8, 26, 13, 10), it('wire', 20, 13, 26, 13)], marks: [mk('ground', 4, 8), mk('ground', 20, 13), mk('probe', 12, 8), mk('probe', 20, 8)] }) },
  // M432: a motor drive. The switch's on-time sets the motor's average voltage and so its speed; the diode carries the
  // winding's current while the switch is off.
  { id: 'motor', name: 'Driving a motor (PWM speed control)', make: () => ({ dt: 5e-6, window: 0.1, items: [it('V', 4, 4, 4, 10, 24), it('S', 4, 4, 12, 4, 0.5, 'dc', 20_000), it('D', 12, 10, 12, 4), it('wire', 12, 4, 20, 4), it('Mo', 20, 4, 20, 10, 0.05), it('wire', 4, 10, 12, 10), it('wire', 12, 10, 20, 10)], marks: [mk('ground', 4, 10), mk('probe', 12, 4), mk('probe', 20, 4)] }) },
  { id: 'divider', name: 'A voltage divider', make: () => ({ dt: 1e-4, window: 0.01, items: [it('V', 4, 4, 4, 10, 9), it('R', 4, 4, 12, 4, 1000), it('R', 12, 4, 12, 10, 2000), it('wire', 4, 10, 12, 10)], marks: [mk('ground', 4, 10), mk('probe', 12, 4)] }) },
];

/** A kept board read back safely (anything odd: the first example). */
export function readBoard(raw: unknown): Board {
  const b = raw as Partial<Board> | null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  if (!b || !Array.isArray(b.items) || !Array.isArray(b.marks)) return EXAMPLES[0].make();
  const kinds: ItemKind[] = ['wire', 'R', 'C', 'L', 'V', 'I', 'D', 'S', 'M', 'Mo'];
  return {
    dt: Math.max(1e-7, Math.min(1e-2, num(b.dt, 1e-5))), window: Math.max(1e-4, Math.min(5, num(b.window, 0.03))),
    items: b.items.filter((x) => x && kinds.includes(x.kind)).slice(0, 200).map((x) => ({ id: String(x.id), kind: x.kind, x1: num(x.x1, 0), y1: num(x.y1, 0), x2: num(x.x2, 0), y2: num(x.y2, 0), value: num(x.value, x.kind === 'wire' ? 0 : DEFAULTS[x.kind]), ...(x.kind === 'S' && typeof x.hold === 'number' && Number.isFinite(x.hold) && x.hold !== 0 && typeof x.sense === 'string' ? { hold: Math.max(-1000, Math.min(1000, x.hold)), sense: x.sense.slice(0, 80) } : {}), ...(x.kind === 'S' && typeof x.ac === 'number' && x.ac > 0 && x.ac <= 1e5 ? { ac: x.ac, depth: Math.max(0, Math.min(1, num(x.depth, 0.8))) } : {}), ...(x.kind === 'S' && x.invert === true ? { invert: true } : {}), wave: (['dc', 'sine', 'square'] as const).find((w) => w === x.wave) ?? 'dc', freq: Math.max(0.01, Math.min(1e7, num(x.freq, x.kind === 'S' ? 50_000 : 50))) })),
    marks: b.marks.filter((m) => m && (m.kind === 'ground' || m.kind === 'probe')).slice(0, 40).map((m) => ({ id: String(m.id), kind: m.kind, x: num(m.x, 0), y: num(m.y, 0) })),
  };
}
