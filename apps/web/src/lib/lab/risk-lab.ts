import { LabError } from './parse';
import { random } from './builtins';
import { textOf } from './interp';
import { mat, num, str, toMat, type Mat, type Value } from './values';
import * as rk from './risk';
import { call, col, def, need, nums, options, optNum, optText, record, row, rows } from './sci-kit';

// Hyperion's portfolios and risk in the language (M502): MATLAB's Financial Toolbox names tick2ret, ret2tick,
// ewstats, portstats, portvrisk and maxdrawdown (same arguments and outputs); our own efficientFrontier, maxSharpe,
// valueAtRisk, varBacktest, garchFit, garchSim, ewmaVol, backtestStrategy, carbonStress (MATLAB does these with
// Portfolio, varbacktest and garch objects the engine doesn't have). A teaching tool, not investment advice.

const columns = (v: Value | undefined, what: string) => { const m = toMat(v ?? num(NaN), what); const M = m.r === 1 ? { ...m, r: m.c, c: 1 } : m; return { m: M, cols: Array.from({ length: M.c }, (_, j) => Array.from(M.d.subarray(j * M.r, (j + 1) * M.r))), row1: m.r === 1 }; };
const fromCols = (cs: number[][], asRow: boolean): Mat => { const r = cs[0]?.length ?? 0, out = mat(r, cs.length); cs.forEach((c, j) => out.d.set(c, j * r)); return asRow && cs.length === 1 ? mat(1, r, out.d) : out; };
const covOf = (v: Value | undefined, n: number) => { const C = toMat(v ?? num(NaN), 'The covariance'); if (C.r !== n || C.c !== n) throw new LabError(`The covariance must be ${n} × ${n}.`); return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => C.d[i + j * n])); };
const returnsMatrix = (v: Value | undefined) => { const { cols } = columns(v, 'The returns'); return cols[0].map((_, t) => cols.map((c) => c[t])); };

def('tick2ret', (a) => {
  const { cols, row1 } = columns(a[0], 'The prices'), method = (a[2] ? textOf(a[2]) : a[1]?.k === 'str' ? textOf(a[1]) : 'simple').toLowerCase();
  if (cols[0].length < 2) throw new LabError('tick2ret needs at least two prices.');
  return [fromCols(cols.map((c) => rk.toReturns(c, method === 'continuous')), row1)];
});
def('ret2tick', (a) => {
  const { cols, row1 } = columns(a[0], 'The returns'), o = options(a, 1, ['StartPrice', 'Method'], 'ret2tick');
  return [fromCols(cols.map((c) => rk.toPrices(c, optNum(o, 'StartPrice', 1), optText(o, 'Method', 'simple').toLowerCase() === 'continuous')), row1)];
});
def('ewstats', (a) => { const R = returnsMatrix(a[0]); if (R.length < 2) throw new LabError('ewstats needs two or more rows of returns.'); const s = rk.stats(R); return [row(s.mu), rows(s.C)]; });
def('portstats', (a) => {
  const mu = nums(a[0], 'The expected returns'), C = covOf(a[1], mu.length), W = toMat(a[2] ?? num(NaN), 'The weights');
  const Wr = W.c === mu.length ? W : W.r === mu.length && W.c === 1 ? { ...W, r: 1, c: W.r } : null;
  if (!Wr) throw new LabError('Each row of the weights is a portfolio, one weight per asset.');
  const ps = Array.from({ length: Wr.r }, (_, i) => rk.portfolio(Array.from({ length: mu.length }, (_, j) => Wr.d[i + j * Wr.r]), mu, C));
  return [col(ps.map((p) => p.risk)), col(ps.map((p) => p.ret))];
});
def('portvrisk', (a) => {
  const ret = need(a[0], 'The portfolio return'), risk = need(a[1], 'The portfolio risk'), p = a[2] ? need(a[2], 'The probability') : 0.05, value = a[3] ? need(a[3], 'The value') : 1;
  if (!(p > 0 && p < 1)) throw new LabError('The risk threshold is a probability between 0 and 1 (0.05 for 95%).');
  return [num(Math.max(0, -(ret + rk.ninv(p) * risk)) * value)];
});
def('maxdrawdown', (a) => { const p = nums(a[0], 'The prices'); if (p.length < 2) throw new LabError('maxdrawdown needs a price series.'); const r = rk.maxDrawdown(p); return [num(r.dd), col([r.from + 1, r.to + 1])]; });

def('efficientFrontier', (a, nout, lab) => {
  const mu = nums(a[0], 'The expected returns'), C = covOf(a[1], mu.length), n = Math.round(a[2] ? need(a[2], 'The points') : 20), o = options(a, 3, ['LongOnly'], 'efficientFrontier');
  if (!(n >= 2 && n <= 500 && mu.length >= 2 && mu.length <= 200)) throw new LabError('efficientFrontier takes 2–200 assets and 2–500 points.');
  const f = rk.frontier(mu, C, n, !!optNum(o, 'LongOnly', 1));
  if (nout > 0) return [col(f.map((p) => p.risk)), col(f.map((p) => p.ret)), rows(f.map((p) => p.w))];
  const sd = C.map((r, i) => Math.sqrt(r[i]));
  call(lab, 'plot', row(f.map((p) => 100 * p.risk)), row(f.map((p) => 100 * p.ret)), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(sd.map((v) => 100 * v)), row(mu.map((v) => 100 * v)), str('o')); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Efficient frontier'), str('Single assets')); call(lab, 'xlabel', str('Risk (standard deviation, %)')); call(lab, 'ylabel', str('Expected return (%)')); call(lab, 'grid', str('on'));
  return [];
});
def('maxSharpe', (a) => {
  const mu = nums(a[0], 'The expected returns'), C = covOf(a[1], mu.length), rf = a[2] ? need(a[2], 'The risk-free rate') : 0, o = options(a, 3, ['LongOnly'], 'maxSharpe');
  const r = rk.maxSharpe(mu, C, rf, !!optNum(o, 'LongOnly', 1));
  return [col(r.w), num(r.ret), num(r.risk), num(r.sharpe)];
});
def('valueAtRisk', (a) => {
  const r = nums(a[0], 'The returns'), c = a[1] ? need(a[1], 'The confidence') : 0.95, o = options(a, 2, ['Method'], 'valueAtRisk'), m = optText(o, 'Method', 'historical').toLowerCase();
  if (r.length < 20 || !(c > 0.5 && c < 1)) throw new LabError('valueAtRisk needs 20 or more returns and a confidence between 0.5 and 1 (0.95, 0.99).');
  if (!['historical', 'normal', 'cornishfisher'].includes(m)) throw new LabError("'Method' is 'historical', 'normal' or 'cornishfisher'.");
  const v = rk.var_(r, c, m as 'historical');
  return [num(v.var), num(v.es)];
});
def('varBacktest', (a) => {
  const r = nums(a[0], 'The returns'), V = toMat(a[1] ?? num(NaN), 'The VaR'), c = a[2] ? need(a[2], 'The confidence') : 0.95;
  const vv = V.d.length === 1 ? r.map(() => V.d[0]) : [...V.d];
  if (vv.length !== r.length) throw new LabError('One VaR (a positive loss) for each return, or one for all.');
  const fails = r.filter((x, i) => -x > vv[i]).length, k = rk.kupiec(fails, r.length, c);
  return [record([['Failures', fails], ['Expected', r.length * (1 - c)], ['LR', k.lr], ['PValue', k.p], ['Result', k.p < 0.05 ? 'reject' : 'accept']])];
});
def('garchFit', (a, nout, lab) => {
  const r = nums(a[0], 'The returns');
  if (r.length < 100 || r.length > 100_000) throw new LabError('garchFit needs 100 to 100,000 returns.');
  const g = rk.garchFit(r);
  if (nout > 0) return [record([['Omega', g.omega], ['Alpha', g.alpha], ['Beta', g.beta], ['Mean', g.mean], ['LongRunVol', g.longRun], ['LogLikelihood', g.logLik], ['Sigma', col(g.sigma)]])];
  const t = r.map((_, i) => i + 1);
  call(lab, 'plot', row(t), row(r), str('Color'), str('#a1a1aa')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(t), row(g.sigma.map((s) => 2 * s)), row(t), row(g.sigma.map((s) => -2 * s)), str('LineWidth'), num(1.5)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Returns'), str('±2σ (GARCH)')); call(lab, 'xlabel', str('Day')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`GARCH(1,1): ω ${g.omega.toExponential(2)}, α ${g.alpha.toFixed(3)}, β ${g.beta.toFixed(3)}`));
  return [];
});
def('garchSim', (a) => {
  const n = Math.round(need(a[0], 'The length')), w = need(a[1], 'ω'), al = need(a[2], 'α'), be = need(a[3], 'β');
  if (!(n >= 1 && n <= 1e6 && w > 0 && al >= 0 && be >= 0 && al + be < 1)) throw new LabError('garchSim(n, ω > 0, α ≥ 0, β ≥ 0) with α + β < 1.');
  return [col(rk.garchSim(n, w, al, be, random))];
});
def('ewmaVol', (a) => { const r = nums(a[0], 'The returns'), l = a[1] ? need(a[1], 'λ') : 0.94; if (!(l > 0 && l < 1)) throw new LabError('λ is between 0 and 1 (RiskMetrics uses 0.94).'); return [col(rk.ewma(r, l))]; });
def('backtestStrategy', (a, nout, lab) => {
  const p = nums(a[0], 'The prices'), s = Math.round(a[1] ? need(a[1], 'The short average') : 20), l = Math.round(a[2] ? need(a[2], 'The long average') : 100), o = options(a, 3, ['Cost', 'PerYear'], 'backtestStrategy');
  if (!(s >= 1 && l > s && p.length > l + 10)) throw new LabError('backtestStrategy(prices, short, long): the long average longer than the short, and more prices than it.');
  const r = rk.backtestMA(p, s, l, optNum(o, 'Cost', 0.001), optNum(o, 'PerYear', 252));
  const st = (x: typeof r.strategy) => record([['CAGR', x.cagr], ['Volatility', x.vol], ['Sharpe', x.sharpe], ['MaxDrawdown', x.maxdd]]);
  if (nout > 0) return [record([['Strategy', st(r.strategy)], ['BuyAndHold', st(r.buyHold)], ['Trades', r.trades], ['Equity', col(r.equity)], ['Position', col(r.position)]])];
  const t = p.map((_, i) => i);
  call(lab, 'plot', row(t), row(r.equity), row(t), row(r.hold)); call(lab, 'legend', str(`${s}/${l}-day crossover`), str('Buy and hold')); call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('Growth of 1')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Sharpe ${r.strategy.sharpe.toFixed(2)} vs ${r.buyHold.sharpe.toFixed(2)}; max drawdown ${(100 * r.strategy.maxdd).toFixed(0)}% vs ${(100 * r.buyHold.maxdd).toFixed(0)}%; ${r.trades} trades`));
  return [];
});
def('carbonStress', (a) => {
  const v = nums(a[0], 'The holdings’ values'), e = nums(a[1], 'Their emissions (t CO₂ a year)'), price = need(a[2], 'The carbon price (a tonne)'), o = options(a, 3, ['PassThrough', 'Rate'], 'carbonStress');
  if (v.length !== e.length || v.some((x) => !(x > 0)) || e.some((x) => !(x >= 0))) throw new LabError('carbonStress needs a positive value and emissions ≥ 0 for each holding.');
  const pass = optNum(o, 'PassThrough', 0), rate = optNum(o, 'Rate', 0.08);
  if (!(pass >= 0 && pass <= 1 && rate > 0)) throw new LabError("'PassThrough' is 0 to 1 (the share passed on to customers), 'Rate' positive.");
  const r = rk.carbonStress(v, e, price, pass, rate);
  return [row(r.loss), row(r.share), num(r.portfolio)];
});
