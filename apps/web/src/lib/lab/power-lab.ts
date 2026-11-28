import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf } from './interp';
import { cmat, mat, num, str, toMat, type Struct, type Value } from './values';
import { makeTf, tfOf } from './control';
import * as pw from './power';
import * as pwc from './powerctl';
import * as im from './induction';
import type { Lab } from './interp';

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

// ——— M564: converter design ———
const TOPS: Record<string, pw.Topology> = { buck: 'buck', boost: 'boost', buckboost: 'buckboost', 'buck-boost': 'buckboost' };
def('converterModel', (a) => {
  const top = TOPS[a[0] ? textOf(a[0]).toLowerCase() : ''];
  if (!top) throw new LabError("converterModel('buck', 'Vin', 48, 'Vout', 12, 'L', 22e-6, 'C', 100e-6, 'R', 1.2, 'fsw', 200e3): 'buck', 'boost' or 'buckboost'; 'Duty' in place of 'Vout'; 'ESR' for the capacitor.");
  const p = pairs(a, 1, ['Vin', 'Vout', 'Duty', 'L', 'C', 'R', 'fsw', 'ESR'], 'converterModel');
  let m: pw.Averaged;
  try { m = pw.averaged(top, n0(p.get('Vin'), 48), p.has('Vout') ? n0(p.get('Vout'), NaN) : NaN, n0(p.get('Duty'), p.has('Vout') ? NaN : 0.5), n0(p.get('L'), 22e-6), n0(p.get('C'), 100e-6), n0(p.get('R'), 10), n0(p.get('fsw'), 100e3), n0(p.get('ESR'), 0)); }
  catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  const op = S([['Topology', str(top)], ['Mode', str(m.mode)], ['Duty', num(m.duty)], ['Ratio', num(m.ratio)], ['Vout', num(m.vout)], ['InductorCurrent', num(m.iL)], ['Ripple', num(m.ripple)], ['K', num(m.k)], ['Kcrit', num(m.kCrit)]]);
  return [op, makeTf(m.num, m.den)];
});
def('llcGain', (a) => {
  const fn = vec(a[0], 'fn'), Ln = n0(a[1], 5), Qs = vec(a[2] ?? num(0.4), 'Q');
  if (!(Ln > 0) || !Qs.every((q) => q >= 0)) throw new LabError('llcGain(fn, Ln, Q): normalised frequency f/fr, Ln = Lm/Lr above 0, Q 0 or more.');
  const out = new Float64Array(Qs.length * fn.length);
  Qs.forEach((q, i) => fn.forEach((f, j) => { out[j * Qs.length + i] = pw.llcGain(f, Ln, q); }));
  return [mat(Qs.length, fn.length, out)];
});
def('dabPower', (a) => {
  const [v1, v2, n] = [0, 1, 2].map((i) => n0(a[i], NaN)), phi = toMat(a[3] ?? num(NaN)), fsw = n0(a[4], NaN), L = n0(a[5], NaN);
  if (!(v1 > 0 && v2 > 0 && n > 0 && fsw > 0 && L > 0)) throw new LabError('dabPower(V1, V2, n, phi, fsw, L): voltages, turns ratio, phase shift (rad), frequency, series inductance.');
  return [{ ...phi, d: phi.d.map((x) => pw.dabPower(v1, v2, n, x, fsw, L)) }];
});
def('buckDesign', (a) => {
  const vin = n0(a[0], NaN), vout = n0(a[1], NaN), iout = n0(a[2], NaN);
  const p = pairs(a, 3, ['Inductors', 'Capacitors', 'Fsw', 'MaxRipple', 'MaxVoutRipple', 'MinEfficiency', 'Device', 'Goal'], 'buckDesign');
  const parts = (k: string, what: string) => { const m = p.get(k) ? toMat(p.get(k)!) : null; if (!m || m.c < 2) throw new LabError(`buckDesign needs '${k}': one row per part, [${what} cost] (cost may be left out).`); return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r], m.c > 2 ? m.d[i + 2 * m.r] : 0]); };
  const Ls = parts('Inductors', 'L DCR'), Cs = parts('Capacitors', 'C ESR'), fs = p.has('Fsw') ? vec(p.get('Fsw'), 'Fsw') : [100e3, 200e3, 400e3];
  const maxRip = n0(p.get('MaxRipple'), 0.4), maxV = n0(p.get('MaxVoutRipple'), 0.01), minEff = n0(p.get('MinEfficiency'), 0);
  const dev = p.has('Device') ? devOf(p.get('Device')) : pw.MOSFET, goal = p.has('Goal') ? textOf(p.get('Goal')!).toLowerCase() : 'efficiency';
  const rows: number[][] = [];
  for (const f of fs) for (const [L, dcr, cl] of Ls) for (const [C, esr, cc] of Cs) {
    let r: pw.BuckLoss;
    try { r = pw.buckLoss(vin, vout, iout, f, L, dcr, dev); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
    const vr = r.ripple * (esr + 1 / (8 * f * C));
    if (r.ripple / iout <= maxRip && vr / vout <= maxV && r.efficiency >= minEff) rows.push([f, L, dcr, C, esr, r.efficiency, r.ripple, vr, cl + cc]);
  }
  if (!rows.length) throw new LabError('No pair of parts meets those limits: allow more ripple, add parts or try other frequencies.');
  rows.sort((x, y) => (goal === 'cost' ? x[8] - y[8] || y[5] - x[5] : y[5] - x[5] || x[8] - y[8]));
  const b = rows[0];
  const best = S([['fsw', num(b[0])], ['L', num(b[1])], ['DCR', num(b[2])], ['C', num(b[3])], ['ESR', num(b[4])], ['Efficiency', num(b[5])], ['Ripple', num(b[6])], ['VoutRipple', num(b[7])], ['Cost', num(b[8])]]);
  const all = new Float64Array(rows.length * 9);
  rows.forEach((r, i) => r.forEach((x, j) => { all[j * rows.length + i] = x; }));
  return [best, mat(rows.length, 9, all)];
});
def('monteCarlo', (a, _n, lab) => {
  const fn = a[0];
  if (fn?.k !== 'fn') throw new LabError('monteCarlo(@(p) f(p), nominal, tol, N, \'Dist\', \'uniform\', \'Spec\', [lo hi]): a function of the parameter vector.');
  const nom = vec(a[1], 'nominal'), tolv = vec(a[2], 'tol'), N = Math.round(n0(a[3], 1000));
  const tol = tolv.length === 1 ? nom.map(() => tolv[0]) : tolv;
  if (tol.length !== nom.length || !(N >= 2 && N <= 1e6)) throw new LabError('monteCarlo: one tolerance (a fraction, 0.05 for ±5 %) per parameter, or one for all; N from 2 to a million.');
  const p = pairs(a, 4, ['Dist', 'Spec'], 'monteCarlo'), dist = p.has('Dist') ? textOf(p.get('Dist')!).toLowerCase() : 'uniform';
  const spec = p.has('Spec') ? vec(p.get('Spec'), 'Spec') : null;
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = random(); while (v === 0) v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let outs = 0;
  const ys: number[][] = [];
  for (let k = 0; k < N; k++) {
    // Normal: the tolerance is three standard deviations (99.7 % of parts inside it).
    const x = nom.map((v, i) => v * (1 + tol[i] * (dist === 'normal' ? gauss() / 3 : 2 * random() - 1)));
    const y = [...toMat(lab.callFn(fn, [mat(1, x.length, x)])[0], 'The function\'s answer').d];
    if (!outs) outs = y.length;
    ys.push(y);
  }
  const Y = new Float64Array(N * outs);
  ys.forEach((y, i) => y.forEach((v, j) => { Y[j * N + i] = v; }));
  const c0 = ys.map((y) => y[0]), mean = c0.reduce((s, v) => s + v, 0) / N, sd = Math.sqrt(c0.reduce((s, v) => s + (v - mean) ** 2, 0) / (N - 1));
  const info = S([['Mean', num(mean)], ['Std', num(sd)], ['Min', num(Math.min(...c0))], ['Max', num(Math.max(...c0))], ...(spec ? [['Yield', num(c0.filter((v) => v >= spec[0] && v <= spec[1]).length / N)] as [string, Value]] : [])]);
  return [mat(N, outs, Y), info];
});
def('prbs', (a) => {
  const n = Math.round(n0(a[0], 10)), len = Math.round(n0(a[1], 2 ** n - 1)), amp = n0(a[2], 1);
  try { return [col(pw.prbs(n, len).map((x) => x * amp))]; } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
});
def('idinput', (a) => {
  const N = Math.round(n0(a[0], 255)), type = a[1] ? textOf(a[1]).toLowerCase() : 'prbs', lv = a[3] ? vec(a[3], 'levels') : [-1, 1];
  if (type !== 'prbs' && type !== 'rbs') throw new LabError("idinput(N, 'prbs', band, levels): 'prbs' or 'rbs'.");
  const bits = Math.min(16, Math.max(2, Math.ceil(Math.log2(N + 1))));
  const s = type === 'prbs' ? pw.prbs(bits, N) : Float64Array.from({ length: N }, () => (random() < 0.5 ? -1 : 1));
  return [col(s.map((x) => (x > 0 ? lv[1] : lv[0])))];
});
def('frestimate', (a) => {
  const u = toMat(a[0] ?? num(NaN)).d, y = toMat(a[1] ?? num(NaN)).d, Ts = n0(a[2], NaN), w = vec(a[3], 'w (rad/s)');
  if (!(Ts > 0) || u.length !== y.length || u.length < 64) throw new LabError('frestimate(u, y, Ts, w): input and output of the same length (64 samples or more), the sample time, frequencies in rad/s.');
  const { re, im } = pw.frestimate(u, y, Ts, w);
  return [cmat(w.length, 1, re, im), col(w)];
});
def('pidtune', (a) => {
  const g = tfOf(a[0] ?? num(NaN), 'The plant'), type = (a[1] ? textOf(a[1]) : 'PI').toUpperCase();
  if (type !== 'P' && type !== 'PI' && type !== 'PID') throw new LabError("pidtune(G, 'PI', wc): 'P', 'PI' or 'PID'; wc the crossover in rad/s (left out: chosen).");
  const p = pairs(a, a[2] && a[2].k !== 'str' ? 3 : 2, ['PhaseMargin'], 'pidtune');
  let r: ReturnType<typeof pw.pidtune>;
  try { r = pw.pidtune(g.n, g.d, type, a[2] && a[2].k !== 'str' ? n0(a[2], NaN) : undefined, n0(p.get('PhaseMargin'), 60)); }
  catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  const C = BUILTINS.pid([num(r.Kp), num(r.Ki), num(r.Kd)], 1, undefined as never)[0];
  return [C, S([['Kp', num(r.Kp)], ['Ki', num(r.Ki)], ['Kd', num(r.Kd)], ['Crossover', num(r.wc)], ['PhaseMargin', num(r.pm)]])];
});


// ——— M565: converter control ———
const series = (m: ArrayLike<number>) => col(Float64Array.from(m));
function rowsOf(v: Value | undefined, cols: number, what: string): number[][] {
  if (!v) return [];
  const m = toMat(v);
  if (m.c !== cols) throw new LabError(`${what} has ${cols} columns, one row per step.`);
  return Array.from({ length: m.r }, (_, i) => Array.from({ length: cols }, (_, j) => m.d[i + j * m.r]));
}
def('buckControlSim', (a) => {
  const mode = (a[0] ? textOf(a[0]) : 'voltage').toLowerCase();
  if (mode !== 'voltage' && mode !== 'current') throw new LabError("buckControlSim('voltage') or buckControlSim('current'), then 'Vin', 'Vref', 'L', 'C', 'R', 'fsw', 'ESR', 'Cycles', 'Steps' ([t R] rows).");
  const p = pairs(a, 1, ['Vin', 'Vref', 'L', 'C', 'R', 'fsw', 'ESR', 'Cycles', 'Steps'], 'buckControlSim'), d = pwc.BUCK_CTL;
  const cfg: pwc.BuckCtl = { mode, vin: n0(p.get('Vin'), d.vin), vref: n0(p.get('Vref'), d.vref), L: n0(p.get('L'), d.L), C: n0(p.get('C'), d.C), R: n0(p.get('R'), d.R), fsw: n0(p.get('fsw'), d.fsw), esr: n0(p.get('ESR'), d.esr), cycles: Math.round(n0(p.get('Cycles'), d.cycles)), steps: p.has('Steps') ? rowsOf(p.get('Steps'), 2, "'Steps'").map(([t, R]) => ({ t, R })) : d.steps };
  if (!(cfg.vin > cfg.vref && cfg.vref > 0 && cfg.cycles >= 10 && cfg.cycles <= 20000)) throw new LabError('buckControlSim: Vin above Vref above 0; Cycles from 10 to 20,000.');
  let r: ReturnType<typeof pwc.buckControl>;
  try { r = pwc.buckControl(cfg); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  const t0 = cfg.steps[0]?.t ?? 0, st = pwc.settle(r.t, r.vout, t0, 0.02 * cfg.vref);
  return [S([['t', series(r.t)], ['Vout', series(r.vout)], ['IL', series(r.iL)], ['Duty', series(r.duty)], ['Peak', series(r.peak)], ['Kp', num(r.gains.Kp)], ['Ki', num(r.gains.Ki)], ['Kd', num(r.gains.Kd)], ['SettlingTime', num(st.time)], ['Deviation', num(st.deviation)]])];
});
def('pfcSim', (a) => {
  const p = pairs(a, 0, ['Vrms', 'Fline', 'Vout', 'L', 'C', 'P', 'fsw', 'Cycles'], 'pfcSim'), d = pwc.PFC;
  const cfg: pwc.Pfc = { vrms: n0(p.get('Vrms'), d.vrms), fline: n0(p.get('Fline'), d.fline), vout: n0(p.get('Vout'), d.vout), L: n0(p.get('L'), d.L), C: n0(p.get('C'), d.C), P: n0(p.get('P'), d.P), fsw: n0(p.get('fsw'), d.fsw), cycles: Math.round(n0(p.get('Cycles'), d.cycles)) };
  if (!(cfg.vout > cfg.vrms * Math.SQRT2 && cfg.P > 0 && cfg.cycles >= 2 && cfg.cycles <= 100)) throw new LabError('pfcSim: Vout above the line\'s peak (√2·Vrms), P above 0, Cycles (of the line) from 2 to 100.');
  const r = pwc.pfcBoost(cfg);
  return [S([['t', series(r.t)], ['Vout', series(r.vout)], ['Iin', series(r.iin)], ['Vac', series(r.vac)], ['PowerFactor', num(r.pf)], ['THD', num(r.thd)], ['Ripple', num(r.ripple)], ['Vmean', num(r.vmean)]])];
});
def('mpptSim', (a) => {
  const method = (a[0] ? textOf(a[0]) : 'po').toLowerCase();
  if (method !== 'po' && method !== 'inccond') throw new LabError("mpptSim('po', G) or mpptSim('inccond', G): G the irradiance (W/m²) at each step; 'T', 'Step', 'Series'.");
  const G = vec(a[1], 'G (W/m²)'), p = pairs(a, 2, ['T', 'Step', 'Series'], 'mpptSim');
  if (!G.every((g) => g >= 0)) throw new LabError('mpptSim: irradiance is 0 or more.');
  const r = pwc.mppt(method, G, n0(p.get('T'), 25), n0(p.get('Step'), 0.2), undefined, Math.max(1, Math.round(n0(p.get('Series'), 1))));
  return [S([['V', series(r.v)], ['P', series(r.p)], ['Pmax', series(r.pmax)], ['Efficiency', num(r.efficiency)]])];
});
def('svpwm', (a, nout) => {
  const va = toMat(a[0] ?? num(NaN)), vb = toMat(a[1] ?? num(NaN)), vdc = n0(a[2], NaN);
  if (va.d.length !== vb.d.length || !(vdc > 0)) throw new LabError('svpwm(valpha, vbeta, Vdc): the reference vector\'s two parts (the same size) and the DC link.');
  const out = [0, 1, 2, 3].map(() => new Float64Array(va.d.length));
  va.d.forEach((x, i) => { const r = pwc.svpwm(x, vb.d[i], vdc); out[0][i] = r.da; out[1][i] = r.db; out[2][i] = r.dc; out[3][i] = r.sector; });
  const shape = (d: Float64Array) => ({ ...va, d });
  return out.slice(0, Math.max(1, nout)).map(shape);
});
def('gridInverterSim', (a) => {
  const p = pairs(a, 0, ['Vgrid', 'f', 'Vdc', 'L', 'R', 'fsw', 'Tend', 'Steps'], 'gridInverterSim'), d = pwc.GRID_INV;
  const cfg: pwc.GridInv = { vgrid: n0(p.get('Vgrid'), d.vgrid), f: n0(p.get('f'), d.f), vdc: n0(p.get('Vdc'), d.vdc), L: n0(p.get('L'), d.L), R: n0(p.get('R'), d.R), fsw: n0(p.get('fsw'), d.fsw), tEnd: n0(p.get('Tend'), d.tEnd), steps: p.has('Steps') ? rowsOf(p.get('Steps'), 3, "'Steps'").map(([t, P, Q]) => ({ t, P, Q })) : d.steps };
  if (!(cfg.tEnd > 0 && cfg.tEnd * cfg.fsw <= 2e6)) throw new LabError('gridInverterSim: Tend above 0 and at most two million steps (Tend·fsw).');
  const r = pwc.gridInverter(cfg);
  return [S([['t', series(r.t)], ['P', series(r.P)], ['Q', series(r.Q)], ['Id', series(r.id)], ['Iq', series(r.iq)], ['Ia', series(r.ia)], ['AngleError', series(r.angleErr)]])];
});
def('droopShare', (a) => {
  const load = n0(a[0], NaN), m = vec(a[1], 'm (Hz/W)'), pmax = a[2] ? vec(a[2], 'Pmax') : m.map(() => Infinity), f0 = n0(a[3], 50);
  if (!(load >= 0) || m.length !== pmax.length || !m.every((x) => x > 0)) throw new LabError('droopShare(load, m, Pmax, f0): the load (W), each unit\'s droop (Hz per W, above 0) and limit.');
  const r = pwc.droopShare(load, m, pmax, f0);
  return [row(r.P), num(r.f), S([['Overloaded', { ...num(r.overloaded ? 1 : 0), logical: true }]])];
});

// ——— M566: induction motors and the rectifier ———
const IM_FIELDS: [keyof im.Induction, string][] = [['rs', 'Rs'], ['rr', 'Rr'], ['lls', 'Lls'], ['llr', 'Llr'], ['lm', 'Lm'], ['pp', 'PolePairs'], ['J', 'J'], ['B', 'B'], ['vll', 'Vll'], ['f', 'f']];
def('inductionMotor', (a) => {
  const p = pairs(a, 0, IM_FIELDS.map(([, n]) => n), 'inductionMotor');
  const m = S([['Type', str('Induction')], ...IM_FIELDS.map(([k, n]) => [n, p.get(n) ?? num(im.IM4KW[k])] as [string, Value])]);
  imOf(m);
  return [m];
});
function imOf(v: Value | undefined): im.Induction {
  if (!v || v.k !== 'struct' || !v.f.has('Lm') || !v.f.has('PolePairs')) throw new LabError('Give a machine from inductionMotor.');
  const m = {} as im.Induction;
  for (const [k, n] of IM_FIELDS) { const x = toMat(v.f.get(n)!).d[0]; if (!(x > 0)) throw new LabError(`The machine's ${n} must be above 0.`); m[k] = x; }
  return m;
}
/** A number, or a handle of time sampled every 0.1 ms. */
function ofT(lab: Lab, v: Value | undefined, d: number, what: string): (t: number) => number {
  if (!v) return () => d;
  if (v.k !== 'fn') { const x = toMat(v).d[0]; return () => x; }
  const cache = new Map<number, number>();
  return (t) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(v, [num(k / 1e4)])[0], what).d[0]; cache.set(k, y); } return y; };
}
def('inductionSim', (a, _n, lab) => {
  const m = imOf(a[0]), mode = (a[1] ? textOf(a[1]) : 'foc').toLowerCase();
  if (mode !== 'vf' && mode !== 'foc' && mode !== 'sensorless') throw new LabError("inductionSim(m, 'foc', 'Speed', 100, 'Load', @(t) 10*(t > 0.5), 'Tend', 1): 'vf', 'foc' or 'sensorless'.");
  const p = pairs(a, 2, ['Speed', 'Load', 'Tend', 'dt'], 'inductionSim'), tEnd = n0(p.get('Tend'), 1), dt = n0(p.get('dt'), 2e-5);
  if (!(tEnd > 0 && dt > 0 && tEnd / dt <= 2e6)) throw new LabError('inductionSim: Tend and dt above 0, at most two million steps.');
  const r = im.inductionRun(m, { mode, speed: ofT(lab, p.get('Speed'), 100, 'The speed'), load: ofT(lab, p.get('Load'), 0, 'The load'), tEnd, dt });
  // Every 10th step is plenty to plot.
  const thin = (x: Float64Array) => series(x.filter((_, i) => i % 10 === 0));
  return [S([['t', thin(r.t)], ['Speed', thin(r.speed)], ['Torque', thin(r.torque)], ['Ia', thin(r.ia)], ['Flux', thin(r.flux)], ['SpeedEstimate', thin(r.estimate)]])];
});
def('torqueSpeed', (a) => {
  const m = imOf(a[0]), s = toMat(a[1] ?? num(NaN));
  if (!s.d.every((x) => x > 0 && x <= 2)) throw new LabError('torqueSpeed(m, slip): slips above 0 (1 is standstill, 0 synchronous speed).');
  const T = im.torqueSpeed(m, [...s.d], n0(a[2], m.vll), n0(a[3], m.f));
  return [{ ...s, d: Float64Array.from(T) }];
});
def('rectifier3', (a) => {
  const p = pairs(a, 0, ['Vll', 'f', 'Ld', 'C', 'R', 'Cycles'], 'rectifier3'), d = im.RECT;
  const cfg: im.Rect = { vll: n0(p.get('Vll'), d.vll), f: n0(p.get('f'), d.f), Ld: n0(p.get('Ld'), d.Ld), C: n0(p.get('C'), d.C), R: n0(p.get('R'), d.R), cycles: Math.round(n0(p.get('Cycles'), 40)) };
  if (!(cfg.cycles >= 2 && cfg.cycles <= 500)) throw new LabError('rectifier3: Cycles from 2 to 500.');
  let r: ReturnType<typeof im.rectifier3>;
  try { r = im.rectifier3(cfg); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  return [S([['Vdc', series(r.vdc)], ['Id', series(r.id)], ['Ia', series(r.ia)], ['Harmonics', row(r.harmonics)], ['THD', num(r.thd)], ['PowerFactor', num(r.pf)], ['Vmean', num(r.vmean)]])];
});
