import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import type { Lab } from './interp';
import { textOf } from './interp';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import * as st from './stats';

// Hyperion's statistics in the language (M556; GNU Octave's statistics and statistics-resampling packages' functions,
// written from their documented behaviour, no Octave code): the distributions (cdf, inverse, density) for t, χ², F,
// beta, gamma, binomial and Poisson; gammaln, gammainc and betainc; tiedrank; ttest, ttest2, ranksum, signrank, anova1,
// anova2, kruskalwallis, chi2gof, normfit, fitdist; bootstrp and bootci. MATLAB's argument and output orders.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const vec = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is missing.`); return [...toMat(v, what).d].filter((x) => !Number.isNaN(x)); };
const sc = (v: Value | undefined, d: number) => (v ? toMat(v).d[0] : d);
/** Elementwise over the first argument (a matrix keeps its shape), the rest as scalars. */
const each = (name: string, f: (x: number, ...p: number[]) => number) => def(name, (a) => {
  const x = toMat(a[0], 'The first argument'), p = a.slice(1).map((v) => toMat(v).d[0]), out = mat(x.r, x.c);
  if (x.p) out.p = x.p;
  out.d = Float64Array.from(x.d, (v) => f(v, ...p));
  return [out];
});
/** Name–value options after the positional arguments. */
const opts = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i + 1 < a.length; i += 2) if (a[i].k === 'str') o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1]);
  return o;
};
const tailOf = (v: Value | undefined): st.Tail => { const t = v ? textOf(v).toLowerCase() : 'both'; return t === 'right' || t === 'left' ? t : 'both'; };
const struct = (pairs: [string, Value][]): Struct => ({ k: 'struct', f: new Map(pairs) });
const cell = (rows: (string | number)[][]): Cell => {
  const r = rows.length, c = rows[0].length, d: Value[] = [];
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const v = rows[i][j]; d.push(typeof v === 'string' ? str(v) : Number.isNaN(v) ? mat(0, 0) : num(v)); }
  return { k: 'cell', r, c, d };
};
const row2 = (x: [number, number]) => mat(2, 1, x);

// ——— Distributions and special functions ———
each('gammaln', (x) => st.gammaln(x));
each('gammainc', (x, a) => st.gammainc(x, a));
each('betainc', (x, a, b) => st.betainc(x, a, b));
each('tcdf', (x, v) => st.tcdf(x, v)); each('tinv', (p, v) => st.tinv(p, v));
each('tpdf', (x, v) => Math.exp(st.gammaln((v + 1) / 2) - st.gammaln(v / 2)) / Math.sqrt(v * Math.PI) * (1 + (x * x) / v) ** (-(v + 1) / 2));
each('chi2cdf', (x, v) => st.chi2cdf(x, v)); each('chi2inv', (p, v) => st.chi2inv(p, v));
each('chi2pdf', (x, v) => (x < 0 ? 0 : Math.exp((v / 2 - 1) * Math.log(x) - x / 2 - (v / 2) * Math.log(2) - st.gammaln(v / 2))));
each('fcdf', (x, a, b) => st.fcdf(x, a, b)); each('finv', (p, a, b) => st.finv(p, a, b));
each('fpdf', (x, a, b) => (x <= 0 ? 0 : Math.exp(0.5 * (a * Math.log(a * x) + b * Math.log(b) - (a + b) * Math.log(a * x + b)) - Math.log(x) - (st.gammaln(a / 2) + st.gammaln(b / 2) - st.gammaln((a + b) / 2)))));
each('betacdf', (x, a, b) => st.betacdf(x, a, b));
each('betapdf', (x, a, b) => (x < 0 || x > 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (st.gammaln(a) + st.gammaln(b) - st.gammaln(a + b)))));
each('gamcdf', (x, k, th) => st.gamcdf(x, k, th ?? 1));
each('gampdf', (x, k, th = 1) => (x < 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / th - st.gammaln(k) - k * Math.log(th))));
each('binocdf', (x, n, p) => st.binocdf(x, n, p));
each('binopdf', (x, n, p) => (x < 0 || x > n || x % 1 ? 0 : Math.exp(st.gammaln(n + 1) - st.gammaln(x + 1) - st.gammaln(n - x + 1) + x * Math.log(p) + (n - x) * Math.log(1 - p))));
each('poisscdf', (x, l) => st.poisscdf(x, l));
each('poisspdf', (x, l) => (x < 0 || x % 1 ? 0 : Math.exp(x * Math.log(l) - l - st.gammaln(x + 1))));
def('tiedrank', (a) => { const x = toMat(a[0]), r = st.tiedrank([...x.d]); return [mat(x.r, x.c, r.r), num(r.ties / 2)]; });

// ——— Tests ———
def('ttest', (a) => {
  // ttest(x), ttest(x, m), ttest(x, y) paired; options Alpha, Tail.
  const x = vec(a[0], 'x'), second = a[1] && a[1].k !== 'str' ? toMat(a[1]) : null, o = opts(a, second ? 2 : 1);
  const paired = !!second && second.d.length === x.length && x.length > 1;
  const r = st.ttest(paired ? x.map((v, i) => v - second!.d[i]) : x, paired || !second ? 0 : second.d[0], sc(o.get('alpha'), 0.05), tailOf(o.get('tail')));
  return [num(r.h), num(r.p), row2(r.ci), struct([['tstat', num(r.tstat)], ['df', num(r.df)], ['sd', num(r.sd)]])];
});
def('ttest2', (a) => {
  const o = opts(a, 2), r = st.ttest2(vec(a[0], 'x'), vec(a[1], 'y'), sc(o.get('alpha'), 0.05), tailOf(o.get('tail')), !/^unequal$/i.test(o.get('vartype') ? textOf(o.get('vartype')!) : 'equal'));
  return [num(r.h), num(r.p), row2(r.ci), struct([['tstat', num(r.tstat)], ['df', num(r.df)], ['sd', Array.isArray(r.sd) ? mat(1, 2, r.sd) : num(r.sd)]])];
});
def('ranksum', (a) => {
  const o = opts(a, 2), r = st.ranksum(vec(a[0], 'x'), vec(a[1], 'y'), sc(o.get('alpha'), 0.05));
  return [num(r.p), num(r.h), struct([['ranksum', num(r.ranksum)], ...(r.zval !== null ? [['zval', num(r.zval)] as [string, Value]] : [])])];
});
def('signrank', (a) => {
  const x = vec(a[0], 'x'), second = a[1] && a[1].k !== 'str' ? toMat(a[1]) : null, o = opts(a, second ? 2 : 1);
  const r = second && second.d.length === x.length && x.length > 1 ? st.signrank(x.map((v, i) => v - second.d[i]), 0, sc(o.get('alpha'), 0.05)) : st.signrank(x, second ? second.d[0] : 0, sc(o.get('alpha'), 0.05));
  return [num(r.p), num(r.h), struct([['signedrank', num(r.signedrank)], ...(r.zval !== null ? [['zval', num(r.zval)] as [string, Value]] : [])])];
});
/** Groups from (y, group) or a matrix's columns. */
const groupsOf = (a: Value[]): { groups: number[][]; names: string[] } => {
  const y = toMat(a[0], 'y');
  if (a[1] && !(a[1].k === 'mat' && a[1].d.length === 0) && a[1].k !== 'str') {
    const labels = a[1].k === 'cell' ? a[1].d.map((v) => textOf(v)) : [...toMat(a[1]).d].map(String), names: string[] = [], groups: number[][] = [];
    [...y.d].forEach((v, i) => { const k = labels[i]; let at = names.indexOf(k); if (at < 0) { at = names.length; names.push(k); groups.push([]); } if (!Number.isNaN(v)) groups[at].push(v); });
    return { groups, names };
  }
  const groups = Array.from({ length: y.c }, (_, j) => [...y.d.slice(j * y.r, (j + 1) * y.r)].filter((v) => !Number.isNaN(v)));
  return { groups, names: groups.map((_, j) => String(j + 1)) };
};
def('anova1', (a) => {
  const { groups, names } = groupsOf(a), r = st.anova1(groups);
  const tbl = cell([['Source', 'SS', 'df', 'MS', 'F', 'Prob>F'], ...r.table]);
  return [num(r.p), tbl, struct([['gnames', { k: 'cell', r: names.length, c: 1, d: names.map(str) }], ['n', mat(1, groups.length, groups.map((g) => g.length))], ['means', mat(1, groups.length, groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length))]])];
});
def('anova2', (a) => {
  const y = toMat(a[0], 'y'), reps = sc(a[1], 1), rows = Array.from({ length: y.r }, (_, i) => Array.from({ length: y.c }, (_, j) => y.d[i + j * y.r]));
  if (y.r % reps) throw new LabError('The number of rows must be a multiple of reps.');
  const r = st.anova2(rows, reps);
  return [mat(1, r.p.length, r.p), cell([['Source', 'SS', 'df', 'MS', 'F', 'Prob>F'], ...r.table])];
});
def('kruskalwallis', (a) => {
  const { groups } = groupsOf(a), r = st.kruskalwallis(groups);
  return [num(r.p), cell([['Source', 'Chi-sq', 'df', 'Prob>Chi-sq'], ['Groups', r.H, r.df, r.p]]), struct([['chi2', num(r.H)], ['df', num(r.df)]])];
});
def('chi2gof', (a) => {
  const o = opts(a, 1), r = st.chi2gof(vec(a[0], 'x'), sc(o.get('nbins'), 10), sc(o.get('alpha'), 0.05));
  return [num(r.h), num(r.p), struct([['chi2stat', num(r.chi2stat)], ['df', num(r.df)], ['edges', mat(1, r.edges.length, r.edges)], ['O', mat(1, r.O.length, r.O)], ['E', mat(1, r.E.length, r.E)]])];
});
def('normfit', (a) => { const r = st.normfit(vec(a[0], 'x'), sc(a[1], 0.05)); return [num(r.mu), num(r.sigma), row2(r.muci), row2(r.sigmaci)]; });
def('fitdist', (a) => {
  let r;
  try { r = st.fitdist(vec(a[0], 'x'), a[1] ? textOf(a[1]) : 'Normal'); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  return [struct([['DistributionName', str(r.name)], ['ParameterNames', { k: 'cell', r: 1, c: r.names.length, d: r.names.map(str) }], ['ParameterValues', mat(1, r.params.length, r.params)], ['NLogL', num(-r.logL)], ...r.names.map((n, i) => [n, num(r.params[i])] as [string, Value])])];
});

// ——— Resampling ———
const statOf = (lab: Lab, fn: Value) => (x: number[]) => toMat(lab.callFn(fn, [mat(x.length, 1, x)])[0], 'The statistic').d[0];
def('bootstrp', (a, _n, lab) => {
  const n = sc(a[0], 1000), fn = a[1], data = vec(a[2], 'The data');
  if (fn.k !== 'fn') throw new LabError('bootstrp(nboot, @fun, data): fun is a function such as @mean.');
  const b = st.bootstrap(data, statOf(lab, fn), n, random);
  return [mat(n, 1, b)];
});
def('bootci', (a, _n, lab) => {
  // bootci(nboot, @fun, data) or bootci(nboot, {@fun, data}, 'Type', 'per', 'Alpha', 0.05).
  const n = sc(a[0], 1000), packed = a[1]?.k === 'cell', fn = packed ? (a[1] as Cell).d[0] : a[1], data = vec(packed ? (a[1] as Cell).d[1] : a[2], 'The data');
  if (!fn || fn.k !== 'fn') throw new LabError('bootci(nboot, @fun, data): fun is a function such as @mean.');
  const o = opts(a, packed ? 2 : 3), type = o.get('type') && /^per/i.test(textOf(o.get('type')!)) ? 'per' : 'bca';
  return [row2(st.bootci(data, statOf(lab, fn), n, random, sc(o.get('alpha'), 0.05), type))];
});
