import { LabError } from './parse';
import { mat, num, str, toMat, type Value } from './values';
import * as ep from './epi';
import { random } from './builtins';
import { call, col, def, lines, need, nums, options, optNum, optText, record, row, rows } from './sci-kit';

// Hyperion's epidemics in the language (M492): sir, seir, sirAge, epiR0, epiFinalSize, herdImmunity, fitEpidemic,
// epiRt; sirGillespie and seihrd (M510). MATLAB has no toolbox functions for these (SimBiology builds models as objects the engine doesn't have), so
// the names are our own.

/** 'Intervention' [from to cut; …], 'Vaccinate' (share of S a day), 'VaccineFrom' (day), 'Mu' (births = deaths a day). */
function epiOptions(a: Value[], from: number, what: string, extra: string[] = [], o = options(a, from, ['Intervention', 'Vaccinate', 'VaccineFrom', 'Mu', ...extra], what)): ep.EpiOptions {
  const out: ep.EpiOptions = {};
  if (o.has('Intervention')) {
    const m = toMat(o.get('Intervention')!, 'The intervention');
    if (m.c !== 3) throw new LabError("'Intervention' is rows [from to cut]: the days it starts and ends and the share of transmission it removes (0 to 1).");
    out.interventions = Array.from({ length: m.r }, (_, i) => ({ from: m.d[i], to: m.d[i + m.r], cut: m.d[i + 2 * m.r] }));
    if (out.interventions.some((v) => !(v.cut >= 0 && v.cut <= 1))) throw new LabError('An intervention removes between 0 and 1 of transmission.');
  }
  out.vaccinate = optNum(o, 'Vaccinate', 0); out.vaccineFrom = optNum(o, 'VaccineFrom', 0); out.mu = optNum(o, 'Mu', 0);
  if (!(out.vaccinate >= 0 && out.vaccinate < 1 && out.mu >= 0)) throw new LabError("'Vaccinate' is a share of the susceptible a day (0 to 1) and 'Mu' a rate ≥ 0.");
  return out;
}
const days = (v: Value | undefined) => { const d = Math.round(need(v, 'The number of days')); if (!(d >= 1 && d <= 20_000)) throw new LabError('The days run from 1 to 20,000.'); return d; };
const positive = (x: number, what: string) => { if (!(x > 0)) throw new LabError(`${what} must be positive.`); return x; };

function answer(r: ep.EpiRun, nout: number, lab: Parameters<typeof call>[0], title: string, show = r.names) {
  if (nout > 0) return [col(r.t), rows(r.y), col(r.incidence)];
  const idx = show.map((n) => r.names.indexOf(n));
  lines(lab, r.t, idx.map((i) => r.y.map((s) => s[i])), show, 'Day', 'People', title);
  return [];
}

def('sir', (a, nout, lab) => {
  const b = positive(need(a[0], 'β (infections per infectious person a day)'), 'β'), g = positive(need(a[1], 'γ (1 / the days infectious)'), 'γ'), y0 = nums(a[2], 'The start [S I R]');
  if (y0.length !== 3 || y0.some((x) => !(x >= 0))) throw new LabError('sir needs the start as [S I R] (people in each).');
  const r = ep.sir(b, g, y0 as [number, number, number], days(a[3]), epiOptions(a, 4, 'sir'));
  return answer(r, nout, lab, `SIR, R0 = ${(b / g).toFixed(2)}`);
});
def('seir', (a, nout, lab) => {
  const b = positive(need(a[0], 'β'), 'β'), s = positive(need(a[1], 'σ (1 / the days latent)'), 'σ'), g = positive(need(a[2], 'γ'), 'γ'), y0 = nums(a[3], 'The start [S E I R]');
  if (y0.length !== 4 || y0.some((x) => !(x >= 0))) throw new LabError('seir needs the start as [S E I R].');
  const r = ep.seir(b, s, g, y0 as [number, number, number, number], days(a[4]), epiOptions(a, 5, 'seir'));
  return answer(r, nout, lab, `SEIR, R0 = ${(b / g).toFixed(2)}`);
});
function contacts(v: Value | undefined, n: number) {
  const C = toMat(v ?? mat(0, 0), 'The contact matrix');
  if (C.r !== n || C.c !== n || [...C.d].some((x) => !(x >= 0))) throw new LabError(`The contact matrix must be ${n} × ${n} (one row and column per group), no negative numbers.`);
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => C.d[i + j * n]));
}
def('sirAge', (a, nout, lab) => {
  const b = positive(need(a[0], 'β (infections per contact)'), 'β'), N = nums(a[3], 'The group sizes'), n = N.length, C = contacts(a[1], n), g = positive(need(a[2], 'γ'), 'γ');
  const I0 = nums(a[4], 'The first infected');
  if (!n || n > 40 || I0.length !== n || N.some((x) => !(x > 0))) throw new LabError('sirAge(β, C, γ, N, I0, days): N and I0 have one number per group (at most 40 groups).');
  const r = ep.sirAge(b, C, g, N, I0, days(a[5]), epiOptions(a, 6, 'sirAge'));
  if (nout > 0) return [col(r.t), rows(r.y), col(r.incidence)];
  lines(lab, r.t, N.map((_, i) => r.y.map((s) => (100 * s[n + i]) / N[i])), N.map((_, i) => `Group ${i + 1}`), 'Day', 'Infectious (% of the group)', `SIR by age, R0 = ${ep.r0(b, g, C, N).toFixed(2)}`);
  return [];
});
def('epiR0', (a) => {
  const b = need(a[0], 'β'), g = positive(need(a[1], 'γ'), 'γ');
  if (a.length < 3) return [num(ep.r0(b, g))];
  const N = nums(a[3], 'The group sizes');
  return [num(ep.r0(b, g, contacts(a[2], N.length), N))];
});
def('epiFinalSize', (a) => { const m = toMat(a[0] ?? num(NaN), 'R0'); return [mat(m.r, m.c, [...m.d].map(ep.finalSize))]; });
def('herdImmunity', (a) => { const m = toMat(a[0] ?? num(NaN), 'R0'); return [mat(m.r, m.c, [...m.d].map(ep.herdImmunity))]; });

def('fitEpidemic', (a, nout, lab) => {
  const cases = nums(a[0], 'The daily cases'), N = positive(need(a[1], 'The population'), 'The population');
  if (cases.length < 8 || cases.some((x) => !(x >= 0))) throw new LabError('fitEpidemic needs at least 8 days of new cases (counts ≥ 0) and the population.');
  if (cases.length > 2000) throw new LabError('fitEpidemic fits up to 2,000 days.');
  const o = options(a, 2, ['Model', 'Sigma', 'Report', 'Guess'], 'fitEpidemic'), kind = optText(o, 'Model', 'SIR').toUpperCase();
  if (kind !== 'SIR' && kind !== 'SEIR') throw new LabError("fitEpidemic's 'Model' is 'SIR' or 'SEIR'.");
  const guess = o.has('Guess') ? nums(o.get('Guess')) : undefined;
  if (guess && (guess.length !== 3 || guess.some((x) => !(x > 0)))) throw new LabError("'Guess' is [β γ I0], all positive.");
  const report = optNum(o, 'Report', 1);
  if (!(report > 0 && report <= 1)) throw new LabError("'Report' is the share of infections counted as cases (0 to 1).");
  const f = ep.fitEpidemic(cases, N, kind, { sigma: optNum(o, 'Sigma', 0.2), report, guess: guess as [number, number, number] | undefined });
  const out = record([['Model', kind], ['Beta', f.beta], ['Gamma', f.gamma], ...(f.sigma ? [['Sigma', f.sigma] as [string, number]] : []), ['I0', f.i0], ['R0', f.r0], ['RMSE', f.rmse], ['Fitted', col(f.model)],
    ['BetaCI', f.ci.beta], ['GammaCI', f.ci.gamma], ['I0CI', f.ci.i0], ['R0CI', f.ci.r0]]);
  if (nout > 0) return [out];
  const t = cases.map((_, k) => k);
  call(lab, 'bar', row(t), row(cases)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(t), row(f.model), str('LineWidth'), num(2)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Reported cases'), str(`${kind} fit`)); call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('New cases a day'));
  call(lab, 'title', str(`β = ${f.beta.toFixed(3)}, γ = ${f.gamma.toFixed(3)}, R0 = ${f.r0.toFixed(2)}`)); call(lab, 'grid', str('on'));
  lab.host.out(`${kind} fit: beta = ${f.beta.toPrecision(4)}, gamma = ${f.gamma.toPrecision(4)} (infectious ${(1 / f.gamma).toFixed(1)} days), I0 = ${f.i0.toPrecision(3)}, R0 = ${f.r0.toFixed(2)} (95%: ${f.ci.r0.map((x) => x.toFixed(2)).join(' to ')}), RMSE = ${f.rmse.toPrecision(3)} cases a day\n`);
  return [];
});
def('epiRt', (a, nout, lab) => {
  const cases = nums(a[0], 'The daily cases'), m = positive(need(a[1], "The serial interval's mean (days)"), 'The mean'), sd = positive(need(a[2], "The serial interval's standard deviation"), 'The standard deviation');
  const o = options(a, 3, ['Window'], 'epiRt'), win = Math.round(optNum(o, 'Window', 7));
  if (!(win >= 1 && win < cases.length)) throw new LabError("'Window' is 1 day or more and shorter than the data.");
  const r = ep.rt(cases, m, sd, win);
  if (nout > 0) return [col(r.r), col(r.lo), col(r.hi)];
  const t = cases.map((_, k) => k);
  call(lab, 'plot', row(t), row(r.r), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(t), row(r.lo), str('--'), row(t), row(r.hi), str('--'));
  call(lab, 'plot', row([0, t.length - 1]), row([1, 1]), str(':')); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('R_t'), str('95% low'), str('95% high'), str('R = 1')); call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('Reproduction number'));
  call(lab, 'title', str(`R_t over ${win}-day windows`)); call(lab, 'grid', str('on'));
  return [];
});

def('sirGillespie', (a, nout, lab) => {
  const b = positive(need(a[0], 'β'), 'β'), g = positive(need(a[1], 'γ'), 'γ'), y0 = nums(a[2], 'The start [S I R]');
  if (y0.length !== 3 || y0.some((x) => !(x >= 0 && Number.isInteger(x)))) throw new LabError('sirGillespie needs the start as [S I R], whole people.');
  const N = y0[0] + y0[1] + y0[2], d = days(a[3]), o = options(a, 4, ['Runs'], 'sirGillespie'), runs = Math.round(optNum(o, 'Runs', 20));
  if (!(N >= 1 && N <= 1e6)) throw new LabError('sirGillespie follows every person: the population is 1 to 1,000,000 (sir is the smooth model for bigger ones).');
  if (!(runs >= 1 && runs <= 500) || runs * N > 2e7) throw new LabError("'Runs' is 1 to 500, and runs × people at most 20 million.");
  const all = Array.from({ length: runs }, () => ep.sirGillespie(b, g, y0 as [number, number, number], d, random));
  const I = rows(Array.from({ length: d + 1 }, (_, k) => all.map((r) => r.y[Math.min(k, r.y.length - 1)][1])));
  const ever = all.map((r) => N - r.y[r.y.length - 1][0]), small = ever.filter((x) => x < 0.05 * N).length;
  const t = Array.from({ length: d + 1 }, (_, k) => k);
  if (nout > 0) return [col(t), I, col(ever)];
  const smooth = ep.sir(b, g, y0 as [number, number, number], d);
  call(lab, 'plot', ...all.flatMap((r) => [row(t), row(t.map((k) => r.y[Math.min(k, r.y.length - 1)][1]))]), str('Color'), row([0.55, 0.6, 0.7]));
  call(lab, 'hold', str('on')); call(lab, 'plot', row(t), row(smooth.y.map((s) => s[1])), str('LineWidth'), num(2.5)); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('Infectious')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${runs} random outbreaks against the smooth SIR (thick), R0 = ${(b / g).toFixed(2)}`));
  lab.host.out(`${small} of ${runs} runs died out early (under 5% ever infected); theory for ${y0[1]} first case${y0[1] === 1 ? '' : 's'}: ${(100 * Math.min(1, g / b) ** y0[1]).toFixed(0)}%\n`);
  return [];
});

def('seihrd', (a, nout, lab) => {
  const b = positive(need(a[0], 'β'), 'β'), s = positive(need(a[1], 'σ'), 'σ'), g = positive(need(a[2], 'γ'), 'γ'), y0 = nums(a[3], 'The start [S E I H R D]');
  if (y0.length !== 6 || y0.some((x) => !(x >= 0))) throw new LabError('seihrd needs the start as [S E I H R D].');
  const care = ['Hospital', 'StayDays', 'Fatality', 'Beds', 'FatalityNoBed'], o = options(a, 5, ['Intervention', 'Vaccinate', 'VaccineFrom', ...care], 'seihrd');
  const opt: ep.CareOptions = { ...epiOptions(a, 5, 'seihrd', care, o), hospital: optNum(o, 'Hospital', 0.05), stay: optNum(o, 'StayDays', 10), fatality: optNum(o, 'Fatality', 0.15), beds: optNum(o, 'Beds', Infinity) };
  opt.fatalityNoBed = optNum(o, 'FatalityNoBed', opt.fatality!);
  if ([opt.hospital, opt.fatality, opt.fatalityNoBed].some((x) => !(x! >= 0 && x! <= 1)) || !(opt.stay! > 0) || !(opt.beds! >= 0)) throw new LabError("'Hospital', 'Fatality' and 'FatalityNoBed' are shares (0 to 1), 'StayDays' and 'Beds' positive.");
  const r = ep.seihrd(b, s, g, y0, days(a[4]), opt);
  if (nout > 0) return [col(r.t), rows(r.y), col(r.incidence), col(r.admissions)];
  const H = r.y.map((x) => x[3]), D = r.y.map((x) => x[5]), over = H.filter((x) => x > opt.beds!).length;
  call(lab, 'plot', row(r.t), row(H), str('LineWidth'), num(2), row(r.t), row(D), str('LineWidth'), num(2));
  const labels = ['In hospital', 'Deaths (total)'];
  if (Number.isFinite(opt.beds!)) { call(lab, 'hold', str('on')); call(lab, 'plot', row([0, r.t[r.t.length - 1]]), row([opt.beds!, opt.beds!]), str('--')); call(lab, 'hold', str('off')); labels.push('Beds'); }
  call(lab, 'legend', ...labels.map(str)); call(lab, 'xlabel', str('Day')); call(lab, 'ylabel', str('People')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`SEIHRD, R0 = ${(b / g).toFixed(2)}`));
  lab.host.out(`Peak in hospital: ${Math.round(Math.max(...H))}${Number.isFinite(opt.beds!) ? ` (beds ${opt.beds}; over for ${over} day${over === 1 ? '' : 's'})` : ''}; deaths: ${Math.round(D[D.length - 1])}\n`);
  return [];
});
