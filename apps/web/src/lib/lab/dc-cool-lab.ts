import { LabError } from './parse';
import { mat, num, str, toMat, type Value } from './values';
import * as cl from './dc-cool';
import { call, col, def, lines, need, nums, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's data-centre cooling in the language (M574): coolingCompare, chillerPower, pumpPower, coolingLoop, hxUA,
// foulingTrend, wetBulb. Our own names (MathWorks builds these in Simscape Fluids).

const series = (v: Value | undefined, n: number, what: string, d: number) => {
  const x = v === undefined ? [d] : nums(v, what);
  if (x.length !== 1 && x.length !== n) throw new LabError(`${what} must be one number or one per sample.`);
  return Array.from({ length: n }, (_, i) => x[x.length === 1 ? 0 : i]);
};
const NAMES = { air: 'Air', liquid: 'Single-phase liquid', twophase: 'Two-phase' };

def('wetBulb', (a) => {
  const T = toMat(a[0], 'The dry bulb (°C)'), RH = series(a[1], T.d.length, 'The humidity (%)', NaN);
  if (RH.some((x) => !(x >= 5 && x <= 99))) throw new LabError('wetBulb(T, RH): RH between 5 and 99%.');
  return [mat(T.r, T.c, [...T.d].map((x, i) => cl.wetBulb(x, RH[i])))];
});
def('coolingCompare', (a, nout, lab) => {
  const it = need(a[0], 'coolingCompare(IT kW, rack kW, …): the IT load (kW)'), rack = need(a[1], 'coolingCompare: the rack (kW)');
  const o = options(a, 2, ['Chip', 'Dry', 'Wet', 'FacilityWater', 'Tower', 'Cycles'], 'coolingCompare');
  const dry = o.has('Dry') ? nums(o.get('Dry')) : [25], wet = o.has('Wet') ? nums(o.get('Wet')) : dry.map((d) => cl.wetBulb(d, 50));
  if (wet.length !== dry.length || !(it > 0 && rack > 0)) throw new LabError("coolingCompare: IT and rack above 0; 'Dry' and 'Wet' (°C) the same length.");
  const cyc = optNum(o, 'Cycles', 4);
  if (!(cyc > 1)) throw new LabError("coolingCompare's 'Cycles' (of concentration) is above 1.");
  const r = cl.compare({ it, rack, chip: optNum(o, 'Chip', 1000), fws: optNum(o, 'FacilityWater', 32), tower: optNum(o, 'Tower', 4), cycles: cyc }, dry, wet);
  const pick = (k: keyof (typeof r)[0]) => col(r.map((x) => x[k] as number));
  if (nout > 0) return [record([['Architecture', str('air, liquid, twophase')], ['Fans', pick('fans')], ['Pumps', pick('pumps')], ['Chiller', pick('chiller')], ['Tower', pick('tower')], ['Cooling', pick('cooling')], ['pPUE', pick('ppue')], ['ChipMax', pick('chipMax')], ['Feasible', col(r.map((x) => +x.feasible))], ['Water', pick('water')], ['WUE', pick('wue')], ['ChillerHours', pick('chillerHours')]])];
  const stack = mat(3, 4, [...r.map((x) => x.fans), ...r.map((x) => x.pumps), ...r.map((x) => x.chiller), ...r.map((x) => x.tower)]);
  call(lab, 'subplot', num(1), num(2), num(1)); call(lab, 'bar', stack, str('stacked'));
  call(lab, 'legend', str('Fans'), str('Pumps'), str('Chiller'), str('Tower')); call(lab, 'ylabel', str('Cooling power (kW)')); call(lab, 'xlabel', str('1 air · 2 single-phase · 3 two-phase'));
  call(lab, 'title', str(r.map((x) => `${NAMES[x.arch]}: pPUE ${x.ppue.toFixed(3)}${x.feasible ? '' : ' (not workable)'}`).join('; ')));
  call(lab, 'subplot', num(1), num(2), num(2)); call(lab, 'bar', row(r.map((x) => x.chipMax))); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([0.5, 3.5]), row([90, 90]), str('r--')); call(lab, 'hold', str('off'));
  call(lab, 'ylabel', str('Hottest chip (°C)')); call(lab, 'title', str(`${rack} kW racks, ${optNum(o, 'Chip', 1000)} W chips`)); call(lab, 'grid', str('on'));
  return [];
});
def('chillerPower', (a) => {
  const cap = need(a[0], 'chillerPower(capacity kW, COP, PLR, Tcond)'), cop = need(a[1], 'chillerPower: the rated COP'), plr = toMat(a[2] ?? num(1), 'The part load'), tc = series(a[3], plr.d.length, 'The condenser water (°C)', 30);
  if (!(cap > 0 && cop > 0)) throw new LabError('chillerPower: capacity and COP above 0.');
  const r = [...plr.d].map((p, i) => cl.chiller(cap, cop, p, tc[i]));
  return [mat(plr.r, plr.c, r.map((x) => x.power)), mat(plr.r, plr.c, r.map((x) => x.cop))];
});
def('pumpPower', (a) => {
  const q = toMat(a[0], 'The flow'), qmax = need(a[1], 'pumpPower(q, qmax, Pfull)'), pf = need(a[2], 'pumpPower: the full power');
  const o = options(a, 3, ['Strategy', 'Static'], 'pumpPower'), s = optText(o, 'Strategy', 'variable').toLowerCase();
  if (!['constant', 'variable', 'dpreset'].includes(s)) throw new LabError("pumpPower's 'Strategy' is 'constant', 'variable' or 'dpreset'.");
  return [mat(q.r, q.c, [...q.d].map((x) => cl.pumpPower(x, qmax, pf, s as cl.Strategy, optNum(o, 'Static', 0.2))))];
});
def('coolingLoop', (a, nout, lab) => {
  const t = nums(a[0], 'The times (s)'), it = series(a[1], t.length, 'The rack heat (W)', NaN);
  const o = options(a, 2, ['FacilityWater', 'R', 'C', 'Mass', 'UA', 'Flow', 'Setpoint', 'Gains', 'Pumps', 'FailAt', 'Fouling', 'PumpPower', 'MinSpeed', 'Control', 'Tmax'], 'coolingLoop');
  const fws = series(o.get('FacilityWater'), t.length, 'The facility water (°C)', 30), g = o.has('Gains') ? nums(o.get('Gains')) : [0.1, 0.01], p = o.has('Pumps') ? nums(o.get('Pumps')) : [2, 1];
  const ctl = optText(o, 'Control', 'pi').toLowerCase();
  if (ctl !== 'pi' && ctl !== 'fixed') throw new LabError("coolingLoop's 'Control' is 'pi' or 'fixed'.");
  const L: cl.Loop = { it, fws, R0: optNum(o, 'R', 2.5e-4), C: optNum(o, 'C', 5e4), M: optNum(o, 'Mass', 200), UA: optNum(o, 'UA', 2e4), mmax: optNum(o, 'Flow', 4.5), set: optNum(o, 'Setpoint', fws[0] + 12), kp: g[0], ki: g[1] ?? 0.01, pumps: p[0], spare: p[1] ?? 0, failAt: optNum(o, 'FailAt', Infinity), fouling: optNum(o, 'Fouling', 0), pfull: optNum(o, 'PumpPower', 1500), nmin: optNum(o, 'MinSpeed', 0.25), fixed: ctl === 'fixed', tmax: optNum(o, 'Tmax', 85) };
  if (!(L.R0 > 0 && L.C > 0 && L.M > 0 && L.UA > 0 && L.mmax > 0 && L.pumps >= 1 && L.fouling >= 0 && L.fouling < 1) || it.some((x) => !Number.isFinite(x)) || t.some((v, i) => i && !(v > t[i - 1]))) throw new LabError('coolingLoop(t, P, …): rising times, the heat a number per time; R, C, Mass, UA, Flow above 0; Fouling a share under 1.');
  if ((t[t.length - 1] - t[0]) / 0.5 > 400000) throw new LabError('coolingLoop runs at most 200,000 s (about 55 hours) at once.');
  const r = cl.loop(t, L);
  if (nout > 0) return [record([['Chip', row(r.Tc)], ['Coolant', row(r.Tl)], ['Speed', row(r.speed)], ['PumpPower', row(r.power)], ['Removed', row(r.removed)], ['Peak', r.peak], ['SecondsOver', r.secondsOver]])];
  const m = t.map((x) => x / 60);
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, m, [r.Tc, r.Tl], ['Chips', 'Coolant'], '', 'Temperature (°C)', `Hottest ${r.peak.toFixed(1)} °C${r.secondsOver ? `, ${r.secondsOver.toFixed(0)} s over ${L.tmax} °C` : ''}`);
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, m, [r.speed, it.map((x) => x / Math.max(...it))], ['Pump speed', 'Load (share of peak)'], 'Time (min)', 'Share', '');
  return [];
});
def('hxUA', (a) => {
  const n = Math.max(...[0, 1, 2, 3, 4].map((i) => toMat(a[i] ?? num(NaN)).d.length));
  const [thi, tho, tci, tco, mh] = [0, 1, 2, 3, 4].map((i) => series(a[i], n, ['Thot in', 'Thot out', 'Tcold in', 'Tcold out', 'The hot flow (kg/s)'][i], NaN));
  return [row(thi.map((_, i) => cl.hxUA(thi[i], tho[i], tci[i], tco[i], mh[i], optNum(options(a, 5, ['cp'], 'hxUA'), 'cp', 4180))))];
});
def('foulingTrend', (a, nout, lab) => {
  const t = nums(a[0], 'The times'), ua = nums(a[1], 'The UA history'), clean = toMat(a[2] ?? num(0.8)).d[0];
  if (t.length !== ua.length || t.length < 3 || !(clean > 0 && clean < 1)) throw new LabError('foulingTrend(t, UA, share): at least 3 points of each; clean when UA falls to that share (0.8 unless given).');
  const r = cl.foulingTrend(t, ua, clean);
  if (nout > 0) return [record([['CleanAt', r.cleanAt], ['UA0', r.ua0], ['UANow', r.uaNow], ['Rate', r.rate], ['Fitted', row(r.fitted)]])];
  call(lab, 'plot', row(t), row(ua), str('o'), row(t), row(r.fitted), str('-'), row([t[0], Math.max(t[t.length - 1], Number.isFinite(r.cleanAt) ? r.cleanAt : 0)]), row([clean * r.ua0, clean * r.ua0]), str('r--'));
  call(lab, 'legend', str('Measured'), str('Fouling trend'), str('Clean here'));
  call(lab, 'xlabel', str('Time')); call(lab, 'ylabel', str('UA (W/K)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(Number.isFinite(r.cleanAt) ? `Clean the exchanger at t = ${r.cleanAt.toFixed(1)}` : 'No fouling trend'));
  return [];
});
