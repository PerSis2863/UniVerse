import { LabError } from './parse';
import { textOf } from './interp';
import { num, str, type Struct, type Value } from './values';
import * as pk from './pk';
import { call, col, def, field, need, nums, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's pharmacokinetics in the language (M493): pkModel, pkSimulate, pkSteadyState, pkDosingWindow, pkNCA; pkEffect
// and pkFit (M511). Our own names (MATLAB's SimBiology builds these as model objects the engine doesn't have).

def('pkModel', (a) => {
  const o = options(a, 0, ['CL', 'V', 'Q', 'V2', 'Q3', 'V3', 'ka', 'F', 'Vmax', 'Km', 'Lag'], 'pkModel');
  const m: pk.PkModel = { cl: optNum(o, 'CL', NaN), v: optNum(o, 'V', NaN), q: optNum(o, 'Q', 0), v2: optNum(o, 'V2', 0), q3: optNum(o, 'Q3', 0), v3: optNum(o, 'V3', 0), ka: optNum(o, 'ka', 1), f: optNum(o, 'F', 1), vmax: optNum(o, 'Vmax', 0), km: optNum(o, 'Km', 0), lag: optNum(o, 'Lag', 0) };
  return [modelRecord(check(m))];
});
function check(m: pk.PkModel): pk.PkModel {
  if (m.vmax && m.km) { if (!(m.v > 0)) throw new LabError("A saturating model needs 'V' (L) with 'Vmax' (mg/h) and 'Km' (mg/L)."); m.cl = m.vmax / m.km; }
  if (!(m.cl > 0 && m.v > 0)) throw new LabError("pkModel needs 'CL' (clearance, L/h) and 'V' (volume, L): pkModel('CL', 5, 'V', 50).");
  if ((m.q! > 0) !== (m.v2! > 0)) throw new LabError("A second compartment needs both 'Q' (L/h between them) and 'V2' (L).");
  if (!(m.ka! > 0 && m.f! > 0 && m.f! <= 1)) throw new LabError("'ka' (1/h) must be positive and 'F' (bioavailability) from 0 to 1.");
  if ((m.q3! > 0) !== (m.v3! > 0) || (m.q3! > 0 && !(m.q! > 0))) throw new LabError("A third compartment needs 'Q3' and 'V3', and the second ('Q', 'V2') first.");
  if (m.vmax && m.q) throw new LabError('A saturating model has one compartment.');
  if (!(m.lag! >= 0)) throw new LabError("'Lag' (hours before a dose by mouth starts to be absorbed) can't be negative.");
  return m;
}
const modelRecord = (m: pk.PkModel) => record([['Type', 'pkModel'], ['Compartments', m.q3 ? 3 : m.q ? 2 : 1], ['CL', m.cl], ['V', m.v], ['Q', m.q ?? 0], ['V2', m.v2 ?? 0], ['Q3', m.q3 ?? 0], ['V3', m.v3 ?? 0], ['ka', m.ka ?? 1], ['F', m.f ?? 1], ['Vmax', m.vmax ?? 0], ['Km', m.km ?? 0], ['Lag', m.lag ?? 0], ['Rates', pk.modes(m).map((x) => x.l)], ['HalfLife', pk.halfLife(m)]]);
const model = (v: Value | undefined, name: string): pk.PkModel => {
  if (v?.k !== 'struct' || !v.f.get('Type') || textOf(v.f.get('Type')!) !== 'pkModel') throw new LabError(`${name} needs a model from pkModel.`);
  const g = (k: string) => field(v, k, name), opt = (k: string) => (v.f.has(k) ? g(k) : 0);
  return { cl: g('CL'), v: g('V'), q: g('Q'), v2: g('V2'), q3: opt('Q3'), v3: opt('V3'), ka: g('ka'), f: g('F'), vmax: g('Vmax'), km: g('Km'), lag: opt('Lag') };
};
function route(o: Map<string, Value>): { route: pk.Route; duration?: number } {
  const r = optText(o, 'Route', 'iv').toLowerCase();
  if (r !== 'iv' && r !== 'oral' && r !== 'infusion') throw new LabError("'Route' is 'iv' (a bolus), 'infusion' (with 'Duration', h) or 'oral'.");
  const duration = optNum(o, 'Duration', 1);
  if (r === 'infusion' && !(duration > 0)) throw new LabError("An infusion's 'Duration' must be positive.");
  return { route: r, duration: r === 'infusion' ? duration : undefined };
}

def('pkSimulate', (a, nout, lab) => {
  const m = model(a[0], 'pkSimulate'), amount = need(a[1], 'The dose (mg)');
  const o = options(a, 2, ['Route', 'Duration', 'Every', 'Doses', 'Times', 'Hours', 'Window', 'Step'], 'pkSimulate'), r = route(o);
  if (!(amount > 0)) throw new LabError('The dose must be positive.');
  const times = o.has('Times') ? nums(o.get('Times'), 'The dose times') : null, every = optNum(o, 'Every', 24), count = Math.round(optNum(o, 'Doses', 1));
  if (!times && !(every > 0 && count >= 1 && count <= 10_000)) throw new LabError("'Every' (h) must be positive and 'Doses' from 1 to 10,000.");
  const doses = times ? times.map((at) => ({ at, amount, ...r })) : pk.schedule(amount, r.route, every, count, r.duration);
  const end = optNum(o, 'Hours', Math.max(...doses.map((d) => d.at)) + 5 * pk.halfLife(m)), step = optNum(o, 'Step', Math.max(end / 1000, 1e-3));
  if (!(end > 0 && end / step <= 200_000)) throw new LabError("'Hours' must be positive and at most 200,000 steps of 'Step'.");
  const t = Array.from({ length: Math.floor(end / step + 1e-9) + 1 }, (_, i) => i * step), c = pk.simulate(m, doses, t);
  if (nout > 0) return [col(t), col(c)];
  call(lab, 'plot', row(t), row(c), str('LineWidth'), num(2));
  const labels = ['Concentration'];
  if (o.has('Window')) {
    const [lo, hi] = nums(o.get('Window'), "The window [lowest highest]");
    call(lab, 'hold', str('on')); call(lab, 'plot', row([0, end]), row([lo, lo]), str('--'), row([0, end]), row([hi, hi]), str('--')); call(lab, 'hold', str('off'));
    labels.push('Lowest that works', 'Highest that is safe');
    call(lab, 'ylim', row([0, 1.12 * Math.max(hi, ...c)]));
  }
  call(lab, 'legend', ...labels.map(str)); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Concentration (mg/L)'));
  call(lab, 'title', str(`${doses.length} × ${amount} mg ${r.route}${doses.length > 1 && !times ? ` every ${every} h` : ''}`)); call(lab, 'grid', str('on'));
  return [];
});

def('pkSteadyState', (a) => {
  const m = model(a[0], 'pkSteadyState'), amount = need(a[1], 'The dose (mg)'), tau = need(a[2], 'The interval τ (h)'), o = options(a, 3, ['Route', 'Duration'], 'pkSteadyState'), r = route(o);
  if (m.vmax) throw new LabError('pkSteadyState sums doses, which a saturating model does not allow: simulate many doses with pkSimulate.');
  if (!(amount > 0 && tau > 0) || (r.duration ?? 0) > tau) throw new LabError('The dose and interval must be positive, an infusion no longer than the interval.');
  const s = pk.steadyState(m, { amount, ...r }, tau);
  return [record([['Cmax', s.max], ['Cmin', s.min], ['Cavg', s.avg], ['Accumulation', s.accumulation], ['TimeTo90', s.to90], ['t', col(s.t)], ['C', col(s.c)]])];
});

def('pkDosingWindow', (a, nout, lab) => {
  const m = model(a[0], 'pkDosingWindow'), mec = need(a[1], 'The lowest level that works (MEC)'), mtc = need(a[2], 'The highest safe level (MTC)'), o = options(a, 3, ['Route', 'Duration'], 'pkDosingWindow'), r = route(o);
  if (m.vmax) throw new LabError('pkDosingWindow needs a linear model (no Vmax).');
  if (!(mec > 0 && mtc > mec)) throw new LabError('The window needs 0 < MEC < MTC.');
  const w = pk.dosingWindow(m, mec, mtc, r.route, r.duration);
  if (!w) throw new LabError('No interval fits: even dosing very often swings wider than the window (try an infusion or a slower release, a smaller ka).');
  const out: Struct = record([['MaxInterval', w.tauMax], ['MaxDose', w.doseMax], ['Interval', w.practical?.tau ?? NaN], ['Dose', w.practical?.dose ?? NaN], ['Peak', w.practical?.max ?? NaN], ['Trough', w.practical?.min ?? NaN]]);
  if (nout > 0) return [out];
  lab.host.out(`Longest interval: ${w.tauMax.toFixed(2)} h with ${w.doseMax.toPrecision(4)} mg.${w.practical ? ` In practice: ${w.practical.dose.toPrecision(3)} mg every ${w.practical.tau} h (steady state ${w.practical.min.toPrecision(3)} to ${w.practical.max.toPrecision(3)} mg/L).` : ''}\n`);
  if (w.practical) {
    const s = pk.steadyState(m, { amount: w.practical.dose, ...r }, w.practical.tau), t = [0, 1, 2, 3].flatMap((k) => s.t.map((x) => x + k * w.practical!.tau)), c = [0, 1, 2, 3].flatMap(() => s.c);
    call(lab, 'plot', row(t), row(c), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
    call(lab, 'plot', row([0, t[t.length - 1]]), row([mec, mec]), str('--'), row([0, t[t.length - 1]]), row([mtc, mtc]), str('--')); call(lab, 'hold', str('off'));
    call(lab, 'ylim', row([0, 1.12 * Math.max(mtc, ...c)])); call(lab, 'legend', str('Steady state'), str('MEC'), str('MTC')); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Concentration (mg/L)'));
    call(lab, 'title', str(`${w.practical.dose.toPrecision(3)} mg every ${w.practical.tau} h`)); call(lab, 'grid', str('on'));
  }
  return [];
});

def('pkNCA', (a) => {
  const t = nums(a[0], 'The times'), c = nums(a[1], 'The concentrations'), dose = need(a[2], 'The dose');
  if (t.length !== c.length || t.length < 4 || t.some((x, i) => i && !(x > t[i - 1]))) throw new LabError('pkNCA needs at least 4 rising times and a concentration for each.');
  const o = options(a, 3, ['Tail'], 'pkNCA'), tail = Math.round(optNum(o, 'Tail', 3));
  if (!(tail >= 2 && tail < t.length)) throw new LabError("'Tail' (the last points used for the slope) is 2 or more and fewer than the samples.");
  const r = pk.nca(t, c, dose, tail);
  return [record([['Cmax', r.cmax], ['Tmax', r.tmax], ['AUClast', r.aucLast], ['AUCinf', r.aucInf], ['LambdaZ', r.lambdaZ], ['HalfLife', r.halfLife], ['CL', r.cl], ['Vz', r.vz], ['MRT', r.mrt]])];
});

def('pkEffect', (a, nout, lab) => {
  const t = nums(a[0], 'The times'), c = nums(a[1], 'The concentrations');
  if (t.length !== c.length || !t.length || t.some((x, i) => i && !(x > t[i - 1]))) throw new LabError('pkEffect(t, c, …) needs rising times and a concentration for each.');
  const o = options(a, 2, ['Emax', 'EC50', 'Hill', 'E0', 'ke0'], 'pkEffect');
  const e = { emax: optNum(o, 'Emax', 100), ec50: optNum(o, 'EC50', NaN), hill: optNum(o, 'Hill', 1), e0: optNum(o, 'E0', 0) }, ke0 = optNum(o, 'ke0', 0);
  if (!(e.ec50 > 0 && e.hill > 0) || !(ke0 >= 0)) throw new LabError("pkEffect needs 'EC50' (the level giving half the effect, > 0); 'Hill' > 0 and 'ke0' (1/h, 0 = no delay) ≥ 0.");
  const ce = ke0 > 0 ? pk.effectSite(t, c, ke0) : c, E = ce.map((x) => pk.emax(x, e));
  if (nout > 0) return [col(E), col(ce)];
  call(lab, 'subplot', num(1), num(2), num(1));
  call(lab, 'plot', row(t), row(E), str('LineWidth'), num(2)); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Effect')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(ke0 > 0 ? `Effect, ke0 = ${ke0} /h (half-time ${(Math.LN2 / ke0).toPrecision(2)} h)` : 'Effect'));
  call(lab, 'subplot', num(1), num(2), num(2));
  call(lab, 'plot', row(c), row(E), str('LineWidth'), num(2)); call(lab, 'xlabel', str('Blood level')); call(lab, 'ylabel', str('Effect')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(ke0 > 0 ? 'The loop: effect lags the level' : 'Effect against level'));
  return [];
});

def('pkFit', (a, nout, lab) => {
  const t = nums(a[0], 'The times'), c = nums(a[1], 'The measured levels'), amount = need(a[2], 'The dose (mg)');
  if (t.length !== c.length || t.length < 4 || t.some((x, i) => i && !(x > t[i - 1])) || c.some((x) => !(x >= 0))) throw new LabError('pkFit needs at least 4 rising times and a level (≥ 0) for each.');
  const o = options(a, 3, ['Route', 'Duration', 'Every', 'Doses', 'Times', 'Compartments', 'F', 'Lag'], 'pkFit'), r = route(o);
  const k = Math.round(optNum(o, 'Compartments', 1)), F = optNum(o, 'F', 1), lag = optNum(o, 'Lag', 0);
  if (k !== 1 && k !== 2) throw new LabError("pkFit's 'Compartments' is 1 or 2.");
  if (!(F > 0 && F <= 1 && lag >= 0)) throw new LabError("'F' is from 0 to 1 and 'Lag' ≥ 0.");
  const times = o.has('Times') ? nums(o.get('Times'), 'The dose times') : null, every = optNum(o, 'Every', 24), count = Math.round(optNum(o, 'Doses', 1));
  if (!times && !(every > 0 && count >= 1 && count <= 1000)) throw new LabError("'Every' (h) must be positive and 'Doses' from 1 to 1,000.");
  const doses = times ? times.map((at) => ({ at, amount, ...r })) : pk.schedule(amount, r.route, every, count, r.duration);
  if (c.filter((x) => x > 0).length < (k === 2 ? 6 : 4)) throw new LabError(`pkFit needs at least ${k === 2 ? 6 : 4} levels above zero for ${k} compartment${k > 1 ? 's' : ''}.`);
  const f = pk.pkFit(t, c, doses, { compartments: k as 1 | 2, f: F, lag });
  const out = modelRecord(f.model);
  out.f.set('RMSE', num(f.rmse)); out.f.set('Fitted', col(f.fitted));
  for (const n of f.names) out.f.set(`${n}CI`, row(f.ci[n]));
  if (nout > 0) return [out];
  const end = Math.max(t[t.length - 1], ...doses.map((d) => d.at)), tt = Array.from({ length: 401 }, (_, i) => (i * end) / 400);
  call(lab, 'plot', row(t), row(c), str('o'), row(tt), row(pk.simulate(f.model, doses, tt)), str('LineWidth'), num(2));
  call(lab, 'legend', str('Measured'), str('Fitted model')); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Concentration (mg/L)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`CL = ${f.model.cl.toPrecision(3)} L/h, V = ${f.model.v.toPrecision(3)} L, half-life ${pk.halfLife(f.model).toPrecision(3)} h`));
  lab.host.out(f.names.map((n) => { const v = n === 'CL' ? f.model.cl : n === 'V' ? f.model.v : n === 'ka' ? f.model.ka! : n === 'Q' ? f.model.q! : f.model.v2!; return `${n} = ${v.toPrecision(4)} (95%: ${f.ci[n].map((x) => x.toPrecision(3)).join(' to ')})`; }).join(', ') + `\n`);
  return [];
});
