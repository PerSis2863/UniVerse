import { LabError } from './parse';
import { random } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as fn from './fin';
import { call, def, need, nums, options, optNum, optText, row, rows } from './sci-kit';

// Hyperion's finance pricing in the language (M501): MATLAB's Financial Toolbox names blsprice, blsdelta, blsgamma,
// blsvega, blstheta, blsrho, blsimpv and binprice (same arguments and outputs); our own mcOptionPrice, bondPrice,
// bondYield, bondDuration, zeroCurve, nelsonSiegel, nelsonSiegelFit (MATLAB's bond functions work on dates and its
// curves are objects; ours take years to maturity).

/** Element by element over arguments of one size (or single numbers). */
function each(args: (Value | undefined)[], what: string[], f: (...x: number[]) => number) {
  const ms = args.map((a, i) => toMat(a ?? num(NaN), what[i])), big = ms.reduce((b, m) => (m.d.length > b.d.length ? m : b), ms[0]);
  if (ms.some((m) => m.d.length !== 1 && m.d.length !== big.d.length)) throw new LabError(`${what.join(', ')} must be the same size (or single numbers).`);
  return mat(big.r, big.c, Array.from(big.d, (_, k) => f(...ms.map((m) => (m.d.length === 1 ? m.d[0] : m.d[k])))));
}
const BS = ['Price', 'Strike', 'Rate', 'Time', 'Volatility', 'Yield'];
const bsArgs = (a: Value[], name: string) => { if (a.length < 5) throw new LabError(`${name}(Price, Strike, Rate, Time, Volatility, Yield): the yield may be left out.`); return [a[0], a[1], a[2], a[3], a[4], a[5] ?? num(0)]; };
const greek = (name: string, pick: (g: fn.BsGreeks) => number[]) => def(name, (a) => {
  const args = bsArgs(a, name), outs = pick(fn.bs(1, 1, 0, 1, 0.2));
  return outs.map((_, k) => each(args, BS, (S, K, r, T, s, q) => pick(fn.bs(S, K, r, T, s, q))[k]));
});
greek('blsprice', (g) => [g.call, g.put]);
greek('blsdelta', (g) => [g.deltaC, g.deltaP]);
greek('blsgamma', (g) => [g.gamma]);
greek('blsvega', (g) => [g.vega]);
greek('blstheta', (g) => [g.thetaC, g.thetaP]);
greek('blsrho', (g) => [g.rhoC, g.rhoP]);
def('blsimpv', (a) => {
  if (a.length < 5) throw new LabError("blsimpv(Price, Strike, Rate, Time, Value, 'Yield', q, 'Class', 'put').");
  const o = options(a, 5, ['Yield', 'Class'], 'blsimpv'), cls = o.get('Class'), put = cls ? (cls.k === 'cell' ? textOf(cls.d[0]) : cls.k === 'str' ? cls.v : toMat(cls).d[0] ? 'call' : 'put').toLowerCase() === 'put' : false;
  return [each([a[0], a[1], a[2], a[3], a[4]], ['Price', 'Strike', 'Rate', 'Time', 'Value'], (S, K, r, T, v) => fn.impliedVol(v, S, K, r, T, optNum(o, 'Yield', 0), put))];
});
def('binprice', (a) => {
  if (a.length < 7) throw new LabError('binprice(Price, Strike, Rate, Time, Increment, Volatility, Flag): Flag 1 a call, 0 a put; American exercise.');
  const [S, K, r, T, dt, s, flag] = a.slice(0, 7).map((v, i) => need(v, ['Price', 'Strike', 'Rate', 'Time', 'Increment', 'Volatility', 'Flag'][i])), q = a[7] ? need(a[7], 'The dividend rate') : 0;
  const n = Math.round(T / dt);
  if (!(n >= 1 && n <= 2000 && S > 0 && K > 0 && s > 0)) throw new LabError('binprice takes 1 to 2,000 steps (Time / Increment) and positive prices and volatility.');
  const t = fn.crr(S, K, r, T, s, n, flag !== 0, true, q), clean = (m: number[][]) => m.map((row) => row.map((v) => (Number.isNaN(v) ? 0 : v)));
  return [rows(clean(t.asset)), rows(clean(t.value))];
});
def('mcOptionPrice', (a, nout, lab) => {
  if (a.length < 5) throw new LabError("mcOptionPrice(S, K, r, T, sigma, 'Paths', 1e5, 'Type', 'put', 'Payoff', 'asian', 'Barrier', B, 'Steps', 252).");
  const [S, K, r, T, sg] = a.slice(0, 5).map((v, i) => need(v, BS[i]));
  const o = options(a, 5, ['Paths', 'Type', 'Payoff', 'Barrier', 'Steps', 'Yield', 'Antithetic'], 'mcOptionPrice');
  const paths = Math.round(optNum(o, 'Paths', 100_000)), steps = Math.round(optNum(o, 'Steps', 252)), payoff = optText(o, 'Payoff', 'european').toLowerCase() as fn.Payoff;
  if (!['european', 'asian', 'barrier'].includes(payoff)) throw new LabError("'Payoff' is 'european', 'asian' or 'barrier'.");
  if (payoff === 'barrier' && !o.has('Barrier')) throw new LabError("A barrier option needs 'Barrier' (above the price: up-and-out; below: down-and-out).");
  if (!(paths >= 100 && steps >= 1 && paths * (payoff === 'european' ? 1 : steps) <= 2e7)) throw new LabError('At least 100 paths, and paths × steps up to 20 million.');
  const res = fn.monteCarlo(S, K, r, T, sg, paths, random, { put: optText(o, 'Type', 'call').toLowerCase() === 'put', payoff, barrier: o.has('Barrier') ? optNum(o, 'Barrier', NaN) : undefined, steps, q: optNum(o, 'Yield', 0), antithetic: !!optNum(o, 'Antithetic', 1) });
  if (nout > 0) return [num(res.price), num(res.se)];
  lab.host.out(`${payoff} ${optText(o, 'Type', 'call')}: ${res.price.toFixed(4)} ± ${(1.96 * res.se).toFixed(4)} (95%)\n`);
  return [];
});
def('bondPrice', (a) => {
  const [F, c, n, y] = [0, 1, 2, 3].map((i) => a[i]), f = a[4] ? need(a[4], 'The coupons a year') : 2;
  return [each([F, c, n, y], ['Face', 'Coupon rate', 'Years', 'Yield'], (Fv, cv, nv, yv) => fn.bondPrice(Fv, cv, nv, yv, f))];
});
def('bondYield', (a) => { const f = a[4] ? need(a[4], 'The coupons a year') : 2; return [each([a[0], a[1], a[2], a[3]], ['Price', 'Face', 'Coupon rate', 'Years'], (P, F, c, n) => fn.bondYield(P, F, c, n, f))]; });
def('bondDuration', (a) => {
  const F = need(a[0], 'The face'), c = need(a[1], 'The coupon rate'), n = need(a[2], 'The years'), y = need(a[3], 'The yield'), f = a[4] ? need(a[4], 'The coupons a year') : 2;
  const r = fn.bondRisk(F, c, n, y, f);
  return [num(r.macaulay), num(r.modified), num(r.convexity)];
});
def('zeroCurve', (a, nout, lab) => {
  const par = nums(a[0], 'The par yields'), f = a[1] ? Math.round(need(a[1], 'The coupons a year')) : 1;
  if (!par.length || par.length > 400 || !(f >= 1 && f <= 12)) throw new LabError('zeroCurve(par yields at 1/f, 2/f, … years, f): up to 400 of them.');
  const r = fn.bootstrap(par, f);
  if (nout > 0) return [row(r.zero), row(r.df), row(r.t)];
  call(lab, 'plot', row(r.t), row(par.map((v) => 100 * v)), str('o-'), row(r.t), row(r.zero.map((v) => 100 * v)), str('s-'));
  call(lab, 'legend', str('Par yield'), str('Zero rate')); call(lab, 'xlabel', str('Years')); call(lab, 'ylabel', str('%')); call(lab, 'title', str('Bootstrapped zero curve')); call(lab, 'grid', str('on'));
  return [];
});
def('nelsonSiegel', (a) => { const p = nums(a[0], 'The parameters [b0 b1 b2 tau]'); if (p.length !== 4) throw new LabError('nelsonSiegel needs [b0 b1 b2 tau].'); const t = toMat(a[1] ?? num(NaN), 'The maturities'); return [mat(t.r, t.c, [...t.d].map((x) => fn.nelsonSiegel(p, x)))]; });
def('nelsonSiegelFit', (a, nout, lab) => {
  const t = nums(a[0], 'The maturities (years)'), y = nums(a[1], 'The yields');
  if (t.length !== y.length || t.length < 4 || t.some((x) => !(x > 0))) throw new LabError('nelsonSiegelFit needs four or more positive maturities and a yield for each (as decimals).');
  const r = fn.fitNelsonSiegel(t, y);
  if (nout > 0) return [row(r.params), num(r.rmse)];
  const grid = Array.from({ length: 200 }, (_, i) => 0.05 + (i * (Math.max(...t) * 1.05)) / 199);
  call(lab, 'plot', row(t), row(y.map((v) => 100 * v)), str('o')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(grid), row(grid.map((s) => 100 * fn.nelsonSiegel(r.params, s))), str('LineWidth'), num(2)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Yields'), str('Nelson–Siegel')); call(lab, 'xlabel', str('Years')); call(lab, 'ylabel', str('%')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`β0 ${(100 * r.params[0]).toFixed(2)}%, β1 ${(100 * r.params[1]).toFixed(2)}%, β2 ${(100 * r.params[2]).toFixed(2)}%, τ ${r.params[3].toFixed(2)}`));
  return [];
});
