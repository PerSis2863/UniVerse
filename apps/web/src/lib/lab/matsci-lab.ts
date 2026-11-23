import { LabError } from './parse';
import { textOf } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as ms from './matsci';
import { call, col, def, need, nums, options, optNum, record, row, rows } from './sci-kit';

// Hyperion's semiconductors and materials in the language (M504): siliconNi, pnJunction, diodeIV, mosfetVth, mosfetIV,
// materialCurve, tensileTest, basquinFit, fatigueLife, rainflowCount, minerDamage, variogramExp, krigeGrade, idwGrade.
// Our own names (MATLAB's rainflow is in a toolbox and returns a different layout; its kriging is third-party).

function each(args: (Value | undefined)[], what: string[], f: (...x: number[]) => number) {
  const m = args.map((a, i) => toMat(a ?? num(NaN), what[i])), big = m.reduce((b, x) => (x.d.length > b.d.length ? x : b), m[0]);
  if (m.some((x) => x.d.length !== 1 && x.d.length !== big.d.length)) throw new LabError(`${what.join(', ')} must be the same size (or single numbers).`);
  return mat(big.r, big.c, Array.from(big.d, (_, k) => f(...m.map((x) => (x.d.length === 1 ? x.d[0] : x.d[k])))));
}

def('siliconNi', (a) => [each([a[0] ?? num(300)], ['The temperature (K)'], (T) => ms.siNi(T))]);
def('pnJunction', (a, nout, lab) => {
  const Na = need(a[0], 'The acceptor doping (cm⁻³)'), Nd = need(a[1], 'The donor doping (cm⁻³)'), o = options(a, 2, ['V', 'T'], 'pnJunction'), V = optNum(o, 'V', 0), T = optNum(o, 'T', 300);
  if (!(Na >= 1e12 && Na <= 1e21 && Nd >= 1e12 && Nd <= 1e21 && T > 50 && T < 700)) throw new LabError('Doping from 1e12 to 1e21 cm⁻³ and a temperature from 50 to 700 K.');
  const b = ms.bands(Na, Nd, V, T);
  if (b.drop <= 0) throw new LabError(`The forward bias reaches the built-in potential (${b.vbi.toFixed(3)} V): the depletion approximation stops there.`);
  const info = record([['Vbi', b.vbi], ['W', b.W], ['xn', b.xn], ['xp', b.xp], ['Emax', b.emax]]);
  if (nout > 0) return [info];
  const um = b.x.map((v) => v * 1e4);
  call(lab, 'plot', row(um), row(b.ec), row(um), row(b.ev), row(um), row(b.efp), str('--'), row(um), row(b.efn), str(':'));
  call(lab, 'legend', str('E_c'), str('E_v'), str('E_F (p)'), str('E_F (n)')); call(lab, 'xlabel', str('Position (µm), p side left')); call(lab, 'ylabel', str('Energy (eV)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`V_bi ${b.vbi.toFixed(3)} V, depletion ${(b.W * 1e4).toFixed(3)} µm, peak field ${(b.emax / 1e3).toFixed(0)} kV/cm`));
  return [];
});
def('diodeIV', (a, nout, lab) => {
  const V = toMat(a[0] ?? num(NaN), 'The voltages'), o = options(a, 1, ['Is', 'n', 'Rs', 'T'], 'diodeIV'), Is = optNum(o, 'Is', 1e-14), n = optNum(o, 'n', 1), Rs = optNum(o, 'Rs', 0), T = optNum(o, 'T', 300);
  if (!(Is > 0 && n >= 1 && Rs >= 0)) throw new LabError("'Is' > 0, 'n' ≥ 1, 'Rs' ≥ 0.");
  const I = mat(V.r, V.c, [...V.d].map((v) => ms.diodeCurrent(v, Is, n, Rs, T)));
  if (nout > 0) return [I];
  call(lab, 'semilogy', row(V.d), row([...I.d].map((v) => Math.abs(v)))); call(lab, 'xlabel', str('Voltage (V)')); call(lab, 'ylabel', str('|Current| (A)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Diode: Is ${Is.toExponential(1)} A, n ${n}, Rs ${Rs} Ω`));
  return [];
});
def('mosfetVth', (a) => {
  const Na = need(a[0], 'The substrate doping (cm⁻³)'), tox = need(a[1], 'The oxide thickness (nm)'), o = options(a, 2, ['Vfb', 'T'], 'mosfetVth');
  const r = ms.mosThreshold(Na, tox, optNum(o, 'Vfb', -0.9), optNum(o, 'T', 300));
  return [num(r.vth), num(r.cox), num(r.phiF)];
});
def('mosfetIV', (a, nout, lab) => {
  const o = options(a, 2, ['Vth', 'k', 'lambda'], 'mosfetIV'), vth = optNum(o, 'Vth', 0.7), k = optNum(o, 'k', 2e-3), lam = optNum(o, 'lambda', 0.02);
  const vgs = nums(a[0], 'The gate voltages'), vds = nums(a[1], 'The drain voltages');
  const Id = vgs.map((g) => vds.map((d) => ms.mosfetId(g, d, vth, k, lam)));
  if (nout > 0) return [rows(vds.map((_, j) => vgs.map((__, i) => Id[i][j])))];
  vgs.forEach((g, i) => { call(lab, 'plot', row(vds), row(Id[i].map((v) => v * 1000)), str('LineWidth'), num(1.5)); if (!i) call(lab, 'hold', str('on')); });
  call(lab, 'plot', row(vds), row(vds.map((d) => 500 * k * d * d)), str('k:')); call(lab, 'hold', str('off'));
  call(lab, 'legend', ...vgs.map((g) => str(`V_GS = ${g} V`)), str('Edge of saturation')); call(lab, 'xlabel', str('V_DS (V)')); call(lab, 'ylabel', str('I_D (mA)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`MOSFET, V_th ${vth} V`));
  return [];
});

const material = (v: Value | undefined) => {
  const key = v ? textOf(v).toLowerCase() : 'steel', m = ms.MATERIALS[key];
  if (!m) throw new LabError(`The materials are ${Object.keys(ms.MATERIALS).map((k) => `'${k}'`).join(', ')} (typical values for teaching, not design data).`);
  return m;
};
def('materialCurve', (a, nout, lab) => {
  const names = a.length ? a.map((v) => textOf(v)) : ['steel'], curves = names.map((n) => ({ m: material(str(n)), c: ms.stressStrain(material(str(n))) }));
  if (nout > 0) { const { c, m } = curves[0]; return [col(c.strain), col(c.stress), record([['Name', m.name], ['E', m.E], ['Yield', m.yield], ['UTS', m.uts], ['Elongation', m.elong], ['FatigueCoefficient', m.sf], ['BasquinExponent', m.b]])]; }
  curves.forEach(({ c }, i) => { call(lab, 'plot', row(c.strain.map((e) => 100 * e)), row(c.stress), str('LineWidth'), num(2)); if (!i) call(lab, 'hold', str('on')); });
  call(lab, 'hold', str('off')); call(lab, 'legend', ...curves.map(({ m }) => str(m.name))); call(lab, 'xlabel', str('Strain (%)')); call(lab, 'ylabel', str('Stress (MPa)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str('Stress–strain (typical values, for teaching)'));
  return [];
});
def('tensileTest', (a) => {
  const e = nums(a[0], 'The strain'), s = nums(a[1], 'The stress');
  if (e.length !== s.length || e.length < 10) throw new LabError('tensileTest needs 10 or more (strain, stress) points.');
  const r = ms.tensile(e, s);
  return [record([['E', r.E], ['Yield', r.yield], ['UTS', r.uts], ['Elongation', r.elongation], ['Toughness', r.toughness]])];
});
def('basquinFit', (a) => { const N = nums(a[0], 'The cycles'), S = nums(a[1], 'The amplitudes'); if (N.length !== S.length || N.length < 2 || N.some((v) => !(v > 0)) || S.some((v) => !(v > 0))) throw new LabError('basquinFit needs two or more positive (cycles, amplitude) pairs.'); const r = ms.basquinFit(N, S); return [num(r.sf), num(r.b)]; });
def('fatigueLife', (a) => {
  const sa = toMat(a[0] ?? num(NaN), 'The amplitude'), m = material(a[1]), o = options(a, 2, ['Mean'], 'fatigueLife'), mean = optNum(o, 'Mean', 0);
  return [mat(sa.r, sa.c, [...sa.d].map((v) => ms.cyclesToFailure(v, m.sf, m.b, mean, m.uts)))];
});
def('rainflowCount', (a, nout, lab) => {
  const x = nums(a[0], 'The load history');
  if (x.length < 3) throw new LabError('rainflowCount needs a load history of 3 or more points.');
  const c = ms.rainflow(x);
  if (nout > 0) return [rows(c.length ? c : [])];
  const ranges = [...new Set(c.map((r) => r[0]))].sort((p, q) => p - q), counts = ranges.map((r) => c.filter((q) => q[0] === r).reduce((s, q) => s + q[2], 0));
  call(lab, 'bar', row(ranges), row(counts)); call(lab, 'xlabel', str('Range')); call(lab, 'ylabel', str('Cycles')); call(lab, 'title', str(`Rainflow: ${c.reduce((s, q) => s + q[2], 0)} cycles`)); call(lab, 'grid', str('on'));
  return [];
});
def('minerDamage', (a) => {
  const C = toMat(a[0] ?? num(NaN), 'The cycles [range mean count]'), m = material(a[1]), o = options(a, 2, ['Scale'], 'minerDamage');
  if (C.c !== 3) throw new LabError('minerDamage takes rows [range mean count] from rainflowCount, then the material.');
  const cyc = Array.from({ length: C.r }, (_, i) => [C.d[i], C.d[i + C.r], C.d[i + 2 * C.r]] as [number, number, number]), d = ms.minerDamage(cyc, m.sf, m.b, m.uts, optNum(o, 'Scale', 1));
  return [num(d), num(d > 0 ? 1 / d : Infinity)];
});

const points = (v: Value | undefined, what: string) => { const m = toMat(v ?? num(NaN), what); if (m.c !== 2) throw new LabError(`${what} are rows [x y].`); return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r]]); };
def('variogramExp', (a, nout, lab) => {
  const xy = points(a[0], 'The sample places'), v = nums(a[1], 'The grades'), lag = need(a[2], 'The lag'), n = Math.round(a[3] ? need(a[3], 'The lags') : 10);
  if (v.length !== xy.length || v.length < 5 || v.length > 5000) throw new LabError('variogramExp needs 5 to 5,000 samples, a grade each.');
  const r = ms.variogram(xy, v, lag, n);
  if (nout > 0) return [row(r.h), row(r.gamma), row(r.pairs)];
  call(lab, 'plot', row(r.h), row(r.gamma), str('o')); call(lab, 'xlabel', str('Distance')); call(lab, 'ylabel', str('Semivariance')); call(lab, 'title', str('Experimental variogram')); call(lab, 'grid', str('on'));
  return [];
});
def('krigeGrade', (a) => {
  const xy = points(a[0], 'The sample places'), v = nums(a[1], 'The grades'), q = points(a[2], 'The places to estimate'), model = nums(a[3], 'The model [nugget sill range]');
  if (v.length !== xy.length || v.length > 1000 || model.length !== 3 || !(model[2] > 0)) throw new LabError('krigeGrade(places, grades, query, [nugget sill range]): up to 1,000 samples.');
  if (q.length > 200_000) throw new LabError('Up to 200,000 places to estimate.');
  const r = ms.krige(xy, v, q, model as [number, number, number]);
  return [col(r.map((x) => x.est)), col(r.map((x) => x.var))];
});
def('idwGrade', (a) => {
  const xy = points(a[0], 'The sample places'), v = nums(a[1], 'The grades'), q = points(a[2], 'The places to estimate'), p = a[3] ? need(a[3], 'The power') : 2;
  if (v.length !== xy.length) throw new LabError('One grade for each sample place.');
  return [col(ms.idw(xy, v, q, p))];
});
