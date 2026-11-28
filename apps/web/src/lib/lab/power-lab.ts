import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as pw from './power';

// Hyperion's power electronics in the language (M563–, from MathWorks' power-electronics pages: circuit design, motor
// drives, power conversion control; written fresh). Part 1, losses and heat: powerDevice, conductionLoss,
// switchingLoss, buckLosses, efficiencyMap, fosterNet, zth, foster2cauer, junctionTemp. Devices and networks are
// plain structs, as Hyperion's motors are (motor-lab.ts).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const n0 = (v: Value | undefined, d: number) => (v ? toMat(v).d[0] : d);
const vec = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is missing.`); return [...toMat(v).d]; };
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const S = (fields: [string, Value][]): Struct => ({ k: 'struct', f: new Map(fields) });
/** Name–value pairs, case-insensitive, into a record of Values. */
function pairs(a: Value[], from: number, names: string[], what: string): Map<string, Value> {
  const out = new Map<string, Value>();
  if ((a.length - from) % 2) throw new LabError(`${what} takes name, value pairs after its first arguments.`);
  for (let i = from; i < a.length; i += 2) {
    const want = textOf(a[i]).toLowerCase(), name = names.find((n) => n.toLowerCase() === want);
    if (!name) throw new LabError(`${what} has no '${textOf(a[i])}': it takes ${names.map((n) => `'${n}'`).join(', ')}.`);
    out.set(name, a[i + 1]);
  }
  return out;
}

// ——— Devices ———
const DEV_FIELDS: [keyof pw.Device, string][] = [['rds', 'Rds'], ['alpha', 'Alpha'], ['vce0', 'Vce0'], ['rce', 'Rce'], ['vf', 'Vf'], ['rd', 'Rd'], ['vTest', 'Vtest'], ['iTab', 'I'], ['eon', 'Eon'], ['eoff', 'Eoff'], ['err', 'Err']];
function devStruct(d: pw.Device): Struct {
  return S([['Type', str(d.kind === 'mosfet' ? 'MOSFET' : 'IGBT')], ...DEV_FIELDS.map(([k, name]) => [name, Array.isArray(d[k]) ? row(d[k] as number[]) : num(d[k] as number)] as [string, Value])]);
}
export function devOf(v: Value | undefined): pw.Device {
  if (!v || v.k !== 'struct' || !v.f.has('Eon')) throw new LabError('Give a device from powerDevice (powerDevice(\'mosfet\') or powerDevice(\'igbt\')).');
  const kind = textOf(v.f.get('Type')!).toLowerCase() === 'igbt' ? 'igbt' : 'mosfet';
  const d = { kind } as pw.Device;
  for (const [k, name] of DEV_FIELDS) { const x = toMat(v.f.get(name)!).d; (d as unknown as Record<string, unknown>)[k] = Array.isArray(pw.MOSFET[k]) ? [...x] : x[0]; }
  if (new Set([d.iTab.length, d.eon.length, d.eoff.length, d.err.length]).size !== 1) throw new LabError('The device\'s I, Eon, Eoff and Err tables must be the same length.');
  return d;
}
def('powerDevice', (a) => {
  const kind = a[0] ? textOf(a[0]).toLowerCase() : 'mosfet';
  if (kind !== 'mosfet' && kind !== 'igbt') throw new LabError('powerDevice(\'mosfet\') or powerDevice(\'igbt\'), then name, value pairs (Rds, Vce0, Eon, …).');
  const d = devStruct(kind === 'igbt' ? pw.IGBT : pw.MOSFET);
  const p = pairs(a, 1, DEV_FIELDS.map(([, n]) => n), 'powerDevice');
  for (const [k, v] of p) d.f.set(k, v);
  devOf(d);
  return [d];
});
def('conductionLoss', (a) => {
  const d = devOf(a[0]), iavg = n0(a[1], NaN), irms = n0(a[2], iavg), tj = n0(a[3], 25);
  if (!(iavg >= 0)) throw new LabError('conductionLoss(dev, Iavg, Irms, Tj): currents in A.');
  return [num(pw.conduction(d, iavg, irms, tj)), num(pw.diodeConduction(d, iavg, irms))];
});
def('switchingLoss', (a, nout) => {
  const d = devOf(a[0]), i = n0(a[1], NaN), v = n0(a[2], NaN), fsw = n0(a[3], NaN);
  if (!(i >= 0 && v > 0 && fsw > 0)) throw new LabError('switchingLoss(dev, I, V, fsw): current (A), voltage (V), switching frequency (Hz).');
  const s = pw.switching(d, i, v, fsw);
  return nout > 1 ? [num(s.on), num(s.off), num(s.rr)] : [num(s.on + s.off + s.rr)];
});

// ——— Converters ———
const BUCK = ['fsw', 'L', 'DCR', 'Device', 'Tj', 'Sync'];
function buck(a: Value[], from: number, vin: number, vout: number, iout: number) {
  const p = pairs(a, from, BUCK, 'buckLosses');
  const d = p.has('Device') ? devOf(p.get('Device')) : pw.MOSFET;
  return pw.buckLoss(vin, vout, iout, n0(p.get('fsw'), 100e3), n0(p.get('L'), 10e-6), n0(p.get('DCR'), 5e-3), d, n0(p.get('Tj'), 25), n0(p.get('Sync'), 1) !== 0);
}
def('buckLosses', (a) => {
  const vin = n0(a[0], NaN), vout = n0(a[1], NaN), iout = n0(a[2], NaN);
  if (!(iout > 0)) throw new LabError('buckLosses(Vin, Vout, Iout, \'fsw\', 100e3, \'L\', 10e-6, \'DCR\', 5e-3, \'Device\', dev, \'Tj\', 25, \'Sync\', true).');
  let r: pw.BuckLoss;
  try { r = buck(a, 3, vin, vout, iout); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  return [S([
    ['Mode', str(r.mode)], ['Duty', num(r.duty)], ['Ripple', num(r.ripple)],
    ['HighConduction', num(r.high.conduction)], ['TurnOn', num(r.high.on)], ['TurnOff', num(r.high.off)],
    ['LowConduction', num(r.low.conduction)], ['ReverseRecovery', num(r.low.rr)], ['Inductor', num(r.inductor)],
    ['Total', num(r.total)], ['Output', num(r.out)], ['Efficiency', num(r.efficiency)],
  ])];
});
def('efficiencyMap', (a) => {
  const vins = vec(a[0], 'Vin'), vout = n0(a[1], NaN), iouts = vec(a[2], 'Iout');
  if (!iouts.every((x) => x > 0)) throw new LabError('efficiencyMap(Vins, Vout, Iouts, …): output currents above 0.');
  const e = new Float64Array(vins.length * iouts.length);
  try { vins.forEach((vin, i) => iouts.forEach((io, j) => { e[j * vins.length + i] = buck(a, 3, vin, vout, io).efficiency; })); }
  catch (err) { throw new LabError(err instanceof Error ? err.message : String(err)); }
  return [mat(vins.length, iouts.length, e)];
});

// ——— Heat ———
function netOf(v: Value | undefined): pw.Foster {
  if (!v || v.k !== 'struct' || !v.f.has('R') || !v.f.has('Tau')) throw new LabError('Give a network from fosterNet(R, tau).');
  return { r: [...toMat(v.f.get('R')!).d], tau: [...toMat(v.f.get('Tau')!).d] };
}
def('fosterNet', (a) => {
  const r = vec(a[0], 'R (K/W)'), tau = vec(a[1], 'tau (s)');
  if (r.length !== tau.length || !r.length || !r.every((x) => x > 0) || !tau.every((x) => x > 0)) throw new LabError('fosterNet(R, tau): as many resistances (K/W) as time constants (s), all above 0.');
  return [S([['Type', str('Foster')], ['R', row(r)], ['Tau', row(tau)], ['Rth', num(r.reduce((s, x) => s + x, 0))]])];
});
def('zth', (a) => {
  const f = netOf(a[0]), t = toMat(a[1] ?? num(NaN));
  return [{ ...t, d: t.d.map((x) => pw.zth(f, x)) }];
});
def('foster2cauer', (a, nout) => {
  const c = pw.fosterToCauer(netOf(a[0]));
  if (!c.r.every((x) => x > 0 && Number.isFinite(x)) || !c.c.every((x) => x > 0 && Number.isFinite(x))) throw new LabError('That Foster network has no Cauer ladder with positive parts (its time constants may be too close together).');
  return nout > 1 ? [row(c.r), row(c.c)] : [S([['Type', str('Cauer')], ['R', row(c.r)], ['C', row(c.c)]])];
});
def('junctionTemp', (a) => {
  const f = netOf(a[0]), P = toMat(a[1] ?? num(NaN)), dt = n0(a[2], NaN);
  if (!(dt > 0) || !P.d.length) throw new LabError('junctionTemp(net, P, dt, \'Ambient\', 25, \'Sink\', [R tau]): power samples (W) every dt seconds.');
  const p = pairs(a, 3, ['Ambient', 'Sink'], 'junctionTemp');
  const sink = p.has('Sink') ? vec(p.get('Sink'), 'Sink') : null;
  if (sink && !(sink.length === 2 && sink[0] > 0 && sink[1] > 0)) throw new LabError('\'Sink\' is [R tau]: the heatsink\'s resistance (K/W) and time constant (s).');
  const tj = pw.junctionTemp(f, P.d, dt, n0(p.get('Ambient'), 25), sink ? { r: sink[0], tau: sink[1] } : undefined);
  return [P.r === 1 ? row(tj) : col(tj)];
});
