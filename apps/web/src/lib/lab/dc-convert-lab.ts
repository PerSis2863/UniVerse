import { LabError } from './parse';
import { mat, num, str, toMat, type Value } from './values';
import * as cv from './dc-convert';
import { call, col, def, field, lines, need, nums, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's 800 V DC solid-state transformer in the language (M573): dabDesign, dabPower, dabWaveform,
// dabEfficiency, sstSimulate, dcControllerCode. Our own names (MathWorks builds these in Simscape Electrical).

const dabArgs = (a: Value[], w: string) => {
  const [V1, V2, n, L, fs] = [0, 1, 2, 3, 4].map((i) => need(a[i], `${w}: ${['V1', 'V2', 'n', 'L', 'fs'][i]}`));
  if (![V1, V2, n, L, fs].every((x) => x > 0)) throw new LabError(`${w}(V1, V2, n, L, fs, …): all above 0 (V, turns ratio N1/N2, H, Hz).`);
  return { V1, V2, n, L, fs };
};

def('dabDesign', (a) => {
  const [V1, V2, P, fs] = [0, 1, 2, 3].map((i) => need(a[i], 'dabDesign(V1, V2, P, fs)')), phi = toMat(a[4] ?? num(Math.PI / 6)).d[0];
  if (![V1, V2, P, fs].every((x) => x > 0) || !(phi > 0 && phi < Math.PI / 2)) throw new LabError('dabDesign(V1, V2, P, fs, phi): above 0, phi between 0 and pi/2.');
  const d = cv.dabDesign(V1, V2, P, fs, phi);
  return [record([['Type', 'dab'], ['V1', V1], ['V2', V2], ['n', d.n], ['L', d.L], ['fs', fs], ['Prated', P], ['Pmax', d.pmax], ['Phi', phi]])];
});
def('dabPower', (a) => {
  const d = dabArgs(a, 'dabPower'), phi = toMat(a[5] ?? num(NaN), 'The phase shift (rad)');
  return [mat(phi.r, phi.c, [...phi.d].map((p) => cv.dabPower(d.V1, d.V2, d.n, d.L, d.fs, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p)))))];
});
def('dabWaveform', (a, nout, lab) => {
  const d = dabArgs(a, 'dabWaveform'), phi = need(a[5], 'dabWaveform: the phase shift (rad)');
  const w = cv.dabWaveform(d.V1, d.V2, d.n, d.L, d.fs, phi);
  if (nout > 0) return [row(w.t), row(w.i), record([['IPrimary', w.iPrimary], ['ISecondary', w.iSecondary], ['ZVSPrimary', +w.zvsPrimary], ['ZVSSecondary', +w.zvsSecondary], ['RMS', w.rms], ['Peak', w.peak], ['Power', w.power]])];
  const us = w.t.map((x) => x * 1e6);
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, us, [w.v1, w.v2], ['v_1', 'n v_2'], 'Time (µs)', 'Bridge voltage (V)', `Phase shift ${((phi * 180) / Math.PI).toFixed(1)}°: ${(w.power / 1e3).toFixed(1)} kW`);
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, us, [w.i], [], 'Time (µs)', 'Inductor current (A)', `RMS ${w.rms.toFixed(1)} A; zero-voltage switching: primary ${w.zvsPrimary ? 'yes' : 'no'}, secondary ${w.zvsSecondary ? 'yes' : 'no'}`);
  return [];
});
def('dabEfficiency', (a, nout, lab) => {
  const d = dabArgs(a, 'dabEfficiency'), P = nums(a[5], 'The powers (W)'), o = options(a, 6, ['Rds', 'Eoff', 'Eon', 'Ref', 'Core', 'Rac'], 'dabEfficiency');
  const rds = o.has('Rds') ? nums(o.get('Rds')) : [cv.DEVICES.rds1, cv.DEVICES.rds2], ref = o.has('Ref') ? nums(o.get('Ref')) : [cv.DEVICES.vref, cv.DEVICES.iref];
  const dev: cv.Devices = { rds1: rds[0], rds2: rds[1] ?? rds[0], eoff: optNum(o, 'Eoff', cv.DEVICES.eoff), eon: optNum(o, 'Eon', cv.DEVICES.eon), vref: ref[0], iref: ref[1], core: optNum(o, 'Core', cv.DEVICES.core), rac: optNum(o, 'Rac', cv.DEVICES.rac) };
  const r = P.map((p) => cv.dabLosses(d.V1, d.V2, d.n, d.L, d.fs, p, dev));
  if (r.some((x) => !x)) throw new LabError(`dabEfficiency: some powers are beyond the most this DAB carries (${(cv.dabPower(d.V1, d.V2, d.n, d.L, d.fs, Math.PI / 2) / 1e3).toFixed(1)} kW).`);
  const c = (k: 'efficiency' | 'conduction' | 'switching' | 'total' | 'phi') => col(r.map((x) => x![k]));
  if (nout > 0) return [c('efficiency'), record([['Conduction', c('conduction')], ['Switching', c('switching')], ['Core', dev.core], ['Total', c('total')], ['Phi', c('phi')], ['ZVS', col(r.map((x) => +x!.zvs))]])];
  const best = r.reduce((b, x, i) => (x!.efficiency > r[b]!.efficiency ? i : b), 0);
  lines(lab, P.map((p) => p / 1e3), [r.map((x) => 100 * x!.efficiency)], [], 'Power (kW)', 'Efficiency (%)', `Best ${(100 * r[best]!.efficiency).toFixed(2)}% at ${(P[best] / 1e3).toFixed(0)} kW`);
  return [];
});
def('sstSimulate', (a, nout, lab) => {
  const dab = a[0], t = nums(a[1], 'The times (s)'), P = nums(a[2], 'The load (W)');
  if (P.length !== 1 && P.length !== t.length) throw new LabError('sstSimulate(dab, t, P): the load one number or one per time.');
  const w = 'sstSimulate', o = options(a, 3, ['V1', 'C1', 'C2', 'Ts', 'Bandwidth', 'TauI', 'Efficiency', 'Fidelity'], w);
  const bw = o.has('Bandwidth') ? nums(o.get('Bandwidth')) : [20, 300], eff = o.has('Efficiency') ? nums(o.get('Efficiency')) : [0.985, 0.985], fid = optText(o, 'Fidelity', 'average').toLowerCase();
  if (fid !== 'average' && fid !== 'switching') throw new LabError("sstSimulate's 'Fidelity' is 'average' or 'switching'.");
  const s: cv.Sst = { v1: optNum(o, 'V1', field(dab, 'V1', w)), v2: field(dab, 'V2', w), n: field(dab, 'n', w), L: field(dab, 'L', w), fs: field(dab, 'fs', w), pmax: field(dab, 'Prated', w), c1: optNum(o, 'C1', 2e-3), c2: optNum(o, 'C2', 3e-3), ts: optNum(o, 'Ts', 2e-5), bw1: bw[0], bw2: bw[1] ?? 300, tauI: optNum(o, 'TauI', 5e-4), etaPfc: eff[0], etaDab: eff[1] ?? eff[0], fidelity: fid };
  if (!(s.c1 > 0 && s.c2 > 0 && s.ts > 0 && s.tauI > 0) || t.some((v, i) => i && !(v > t[i - 1]))) throw new LabError('sstSimulate: rising times; capacitances, Ts and TauI above 0.');
  if (fid === 'switching' && (t[t.length - 1] - t[0]) * s.fs > 5000) throw new LabError("sstSimulate 'switching' runs at most 5,000 switching periods (shorten the time or use 'average').");
  const load = t.map((_, i) => P[P.length === 1 ? 0 : i]), r = cv.sstSimulate(t, load, s);
  if (nout > 0) return [record([['t', row(t)], ['V1', row(r.V1)], ['V2', row(r.V2)], ['Phi', row(r.phi)], ['Pgrid', row(r.Pg)], ['Pdab', row(r.Pdab)], ['IL', row(r.iL)], ['Kp', row([r.gains.kp1, r.gains.kp2])], ['Ki', row([r.gains.ki1, r.gains.ki2])]])];
  const ms = t.map((x) => x * 1e3), dev = Math.max(...r.V2.map((v) => Math.abs(v - s.v2)));
  call(lab, 'subplot', num(3), num(1), num(1)); lines(lab, ms, [r.V2], [], '', 'Bus (V)', `800 V bus: at most ${dev.toFixed(1)} V off (${((100 * dev) / s.v2).toFixed(2)}%), ${fid}`);
  call(lab, 'subplot', num(3), num(1), num(2)); lines(lab, ms, [r.V1], [], '', 'DC link (V)', 'Medium-voltage DC link');
  call(lab, 'subplot', num(3), num(1), num(3)); lines(lab, ms, [load.map((x) => x / 1e3), r.Pg.map((x) => x / 1e3)], ['Load', 'Grid'], 'Time (ms)', 'Power (kW)', '');
  return [];
});
def('dcControllerCode', (a) => {
  const [kp, ki, ts, ref] = [0, 1, 2, 3].map((i) => need(a[i], 'dcControllerCode(Kp, Ki, Ts, ref)')), o = options(a, 4, ['Limits', 'Language', 'Frac'], 'dcControllerCode');
  const lim = o.has('Limits') ? nums(o.get('Limits')) : [-Math.PI / 2, Math.PI / 2], lang = optText(o, 'Language', 'c').toLowerCase();
  if ((lang !== 'c' && lang !== 'verilog') || lim.length !== 2 || !(lim[0] < lim[1]) || !(ts > 0)) throw new LabError("dcControllerCode: 'Language' 'c' or 'verilog', 'Limits' [low high], Ts above 0.");
  return [str(cv.controllerCode(kp, ki, ts, ref, lim[0], lim[1], lang, Math.round(optNum(o, 'Frac', 16))))];
});
