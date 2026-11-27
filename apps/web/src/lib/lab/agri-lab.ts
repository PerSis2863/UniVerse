import { LabError } from './parse';
import { mat, num, str, toMat, type Value } from './values';
import * as ag from './agri';
import { call, col, def, nums, options, optNum, record, row } from './sci-kit';

// Hyperion's agriculture and energy production in the language (M505): et0PM, kcCurve, soilWaterBalance, cropGrowth,
// economicDispatch, lcoe. Our own names. The process-optimisation examples use M422's linprog and fmincon.

function each(args: (Value | undefined)[], what: string[], f: (...x: number[]) => number) {
  const m = args.map((a, i) => toMat(a ?? num(NaN), what[i])), big = m.reduce((b, x) => (x.d.length > b.d.length ? x : b), m[0]);
  if (m.some((x) => x.d.length !== 1 && x.d.length !== big.d.length)) throw new LabError(`${what.join(', ')} must be the same size (or single numbers).`);
  return mat(big.r, big.c, Array.from(big.d, (_, k) => f(...m.map((x) => (x.d.length === 1 ? x.d[0] : x.d[k])))));
}

def('et0PM', (a) => {
  if (a.length < 7) throw new LabError("et0PM(Tmin, Tmax, RH, wind2, Rs, elevation, latitude, day): RH a mean (%) or [RHmin RHmax], Rs in MJ/m²/day (or NaN with 'Sunshine', hours).");
  const rh = toMat(a[2], 'The humidity'), o = options(a, 8, ['Sunshine'], 'et0PM'), sun = o.has('Sunshine') ? nums(o.get('Sunshine')) : null, doy = toMat(a[7] ?? num(NaN), 'The day of the year');
  const two = rh.c === 2 && rh.r >= 1;
  const rows2 = (k: number) => (two ? [rh.d[k % rh.r], rh.d[(k % rh.r) + rh.r]] : [rh.d[rh.d.length === 1 ? 0 : k]]);
  let k = 0;
  return [each([a[0], a[1], a[3], a[4], a[5], a[6], doy], ['Tmin', 'Tmax', 'The wind', 'Rs', 'The elevation', 'The latitude', 'The day'], (tmin, tmax, u2, rs, el, lat, d) => {
    const h = rows2(k), s = sun ? sun[sun.length === 1 ? 0 : k] : undefined; k++;
    return ag.et0({ tmin, tmax, wind: u2, rs: Number.isNaN(rs) ? undefined : rs, sunshine: s, elev: el, lat, doy: d, ...(h.length === 2 ? { rhmin: h[0], rhmax: h[1] } : { rhmean: h[0] }) }).et0;
  })];
});
def('kcCurve', (a) => {
  const kc = nums(a[0], 'Kc [initial mid end]'), st = nums(a[1], 'The stage lengths [initial development mid late] (days)');
  if (kc.length !== 3 || st.length !== 4 || st.some((v) => !(v >= 1))) throw new LabError('kcCurve([Kc_ini Kc_mid Kc_end], [ini dev mid late] days).');
  return [row(ag.kcCurve(kc as [number, number, number], st.map(Math.round) as [number, number, number, number]))];
});
def('soilWaterBalance', (a, nout, lab) => {
  const e = nums(a[0], 'The daily ET0 (mm)'), r = nums(a[1], 'The daily rain (mm)'), kc = nums(a[2], 'Kc (one number or one a day)');
  const o = options(a, 3, ['TAW', 'p', 'Irrigate', 'Efficiency'], 'soilWaterBalance'), taw = optNum(o, 'TAW', 120), p = optNum(o, 'p', 0.5), eff = optNum(o, 'Efficiency', 1);
  if (r.length !== e.length || !(taw > 0 && p > 0 && p < 1 && eff > 0 && eff <= 1)) throw new LabError("soilWaterBalance(ET0, rain, Kc, 'TAW', mm, 'p', 0.5, 'Irrigate', true): rain and ET0 day by day.");
  const w = ag.waterBalance(e, r, kc, taw, p, !!optNum(o, 'Irrigate', 1), eff), sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
  if (nout > 0) return [record([['Depletion', col(w.depletion)], ['Ks', col(w.ks)], ['ETc', col(w.etc)], ['Irrigation', col(w.irrigation)], ['Drainage', col(w.drainage)], ['RAW', w.raw], ['TotalIrrigation', sum(w.irrigation)], ['Events', w.irrigation.filter((v) => v > 0).length]])];
  const t = e.map((_, i) => i + 1);
  call(lab, 'plot', row(t), row(w.depletion), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([1, t.length]), row([w.raw, w.raw]), str('--'), row([1, t.length]), row([taw, taw]), str(':'));
  const ev = t.filter((_, i) => w.irrigation[i] > 0);
  if (ev.length) call(lab, 'plot', row(ev), row(ev.map(() => 0)), str('v'), str('MarkerFaceColor'), str('b'));
  call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Depletion'), str('Irrigate here (RAW)'), str('Wilting (TAW)'), ...(ev.length ? [str('Irrigation')] : []));
  call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('Root-zone depletion (mm)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${ev.length} irrigations, ${sum(w.irrigation).toFixed(0)} mm; crop used ${sum(w.etc).toFixed(0)} mm, rain ${sum(r).toFixed(0)} mm`));
  return [];
});
def('cropGrowth', (a, nout, lab) => {
  const tmin = nums(a[0], 'Tmin'), tmax = nums(a[1], 'Tmax'), rs = nums(a[2], 'Rs'), o = options(a, 3, ['Tbase', 'GDD', 'RUE', 'HI', 'Ks', 'LAImax'], 'cropGrowth');
  if (tmin.length !== tmax.length || tmin.length !== rs.length || tmin.length < 2) throw new LabError('cropGrowth needs daily Tmin, Tmax and Rs of the same length.');
  const g = ag.cropGrowth(tmin, tmax, rs, { tbase: optNum(o, 'Tbase', 10), gddMax: optNum(o, 'GDD', 1600), rue: optNum(o, 'RUE', 3), hi: optNum(o, 'HI', 0.5), ks: o.has('Ks') ? nums(o.get('Ks')) : undefined, laiMax: optNum(o, 'LAImax', 5) });
  if (nout > 0) return [record([['Yield', g.yield], ['Biomass', col(g.biomass)], ['LAI', col(g.lai)], ['GDD', col(g.gdd)], ['MaturityDay', g.maturityDay + 1]])];
  const t = tmin.map((_, i) => i + 1);
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(t), row(g.lai), str('LineWidth'), num(2)); call(lab, 'ylabel', str('Leaf area index')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Yield ${g.yield.toFixed(1)} t/ha${g.maturityDay >= 0 ? `, mature on day ${g.maturityDay + 1}` : ', not yet mature'}`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(t), row(g.biomass), str('LineWidth'), num(2)); call(lab, 'ylabel', str('Biomass (t/ha)')); call(lab, 'xlabel', str('Day')); call(lab, 'grid', str('on'));
  return [];
});
def('economicDispatch', (a) => {
  const b = nums(a[0], 'b'), c = nums(a[1], 'c'), pmin = nums(a[2], 'Pmin'), pmax = nums(a[3], 'Pmax'), D = toMat(a[4] ?? num(NaN), 'The demand');
  const n = b.length;
  if (![c, pmin, pmax].every((v) => v.length === n) || c.some((v) => !(v > 0)) || pmin.some((v, i) => !(v <= pmax[i]))) throw new LabError('economicDispatch(b, c, Pmin, Pmax, demand): one each per unit, c > 0, Pmin ≤ Pmax.');
  const res = [...D.d].map((d) => ag.dispatch(b, c, pmin, pmax, d));
  if (res.some((r) => !r)) throw new LabError(`The demand must be between ${pmin.reduce((s, v) => s + v, 0)} and ${pmax.reduce((s, v) => s + v, 0)} MW.`);
  return [mat(D.d.length, n, Array.from({ length: n * D.d.length }, (_, k) => res[k % D.d.length]!.p[Math.floor(k / D.d.length)])), col(res.map((r) => r!.lambda))];
});
def('lcoe', (a) => {
  const o = options(a, 5, ['Degradation'], 'lcoe');
  return [each([a[0], a[1], a[2], a[3], a[4]], ['The capital cost', 'The yearly cost', 'The yearly energy', 'The discount rate', 'The years'], (cx, ox, en, r, y) => ag.lcoe(cx, ox, en, r, Math.round(y), optNum(o, 'Degradation', 0)))];
});
