import { LabError } from './parse';
import { textOf } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as dc from './dc-power';
import { call, col, def, field, isText, lines, nums, options, optNum, optText, record, row, rows } from './sci-kit';

// Hyperion's data-centre power in the language (M571): dcServer, dcServerPower, dcWorkload, dcFacility, dcCampus,
// dcHeatFlow. Our own names (MathWorks builds these as Simscape models).

function chipOf(v: Value | undefined): dc.Chip {
  if (v === undefined) return dc.CHIPS.gpu700;
  if (isText(v)) { const c = dc.CHIPS[v.v.toLowerCase()]; if (!c) throw new LabError(`The chip is one of ${Object.keys(dc.CHIPS).map((k) => `'${k}'`).join(', ')}, or [idle tdp] in W.`); return c; }
  const n = nums(v, 'The chip');
  if (n.length < 2 || !(n[1] > n[0] && n[0] >= 0)) throw new LabError('The chip is [idle tdp] in W, tdp above idle.');
  return { idle: n[0], tdp: n[1], exp: n[2] ?? 1 };
}
function serverOf(v: Value | undefined): dc.Server {
  const w = 'dcServerPower';
  return { chips: field(v, 'Chips', w), chip: { idle: field(v, 'ChipIdle', w), tdp: field(v, 'ChipTDP', w), exp: field(v, 'ChipExp', w) }, cpus: field(v, 'CPUs', w), base: field(v, 'Base', w), fans: field(v, 'Fans', w), psu: field(v, 'PSU', w) };
}

def('dcServer', (a) => {
  const o = options(a, 0, ['Chips', 'Chip', 'CPUs', 'Base', 'Fans', 'PSU'], 'dcServer'), chip = chipOf(o.get('Chip'));
  const chips = optNum(o, 'Chips', 8), cpus = optNum(o, 'CPUs', 2), base = optNum(o, 'Base', 900), fans = optNum(o, 'Fans', 600);
  if (![chips, cpus, base, fans].every((x) => x >= 0)) throw new LabError('dcServer: counts and powers are 0 or more.');
  const full = chips * chip.tdp + cpus * dc.CHIPS.cpu.tdp + base + fans, psu = optNum(o, 'PSU', Math.ceil((full * 1.25) / 100) * 100);
  return [record([['Type', 'dcServer'], ['Chips', chips], ['ChipIdle', chip.idle], ['ChipTDP', chip.tdp], ['ChipExp', chip.exp], ['CPUs', cpus], ['Base', base], ['Fans', fans], ['PSU', psu], ['Peak', dc.serverPower({ chips, chip, cpus, base, fans, psu }, 1, 35).wall]])];
});
def('dcServerPower', (a, nout) => {
  const s = serverOf(a[0]), u = toMat(a[1] ?? num(1), 'The utilisation'), o = options(a, 2, ['Inlet'], 'dcServerPower'), tin = optNum(o, 'Inlet', 25);
  const r = [...u.d].map((x) => dc.serverPower(s, x, tin));
  const P = mat(u.r, u.c, r.map((x) => x.wall));
  if (nout < 2) return [P];
  const pick = (k: keyof (typeof r)[0]) => col(r.map((x) => x[k]));
  return [P, record([['Accelerators', pick('accelerators')], ['CPUs', pick('cpus')], ['Base', pick('base')], ['Fans', pick('fans')], ['PSU', pick('psu')], ['FanSpeed', pick('fanSpeed')]])];
});
def('dcWorkload', (a, nout, lab) => {
  const t = nums(a[0], 'The times (s)'), o = options(a, 1, ['Kind', 'Period', 'Compute', 'High', 'Low', 'Checkpoint', 'Start', 'Ramp', 'Seed'], 'dcWorkload');
  const kind = optText(o, 'Kind', 'training').toLowerCase();
  if (kind !== 'training' && kind !== 'inference') throw new LabError("dcWorkload's 'Kind' is 'training' or 'inference'.");
  const ck = o.has('Checkpoint') ? nums(o.get('Checkpoint')) : [600, 20], d = dc.WORKLOAD;
  const w: dc.Workload = { kind, period: optNum(o, 'Period', d.period), compute: optNum(o, 'Compute', d.compute), high: optNum(o, 'High', d.high), low: optNum(o, 'Low', d.low), checkpointEvery: ck[0] ?? 0, checkpointFor: ck[1] ?? 0, start: optNum(o, 'Start', 0), ramp: optNum(o, 'Ramp', 0), seed: optNum(o, 'Seed', 1) };
  if (!(w.period > 0 && w.compute >= 0 && w.compute <= 1)) throw new LabError("dcWorkload: 'Period' above 0, 'Compute' a share 0 to 1.");
  const u = dc.workload(t, w);
  if (nout > 0) return [mat(1, u.length, u)];
  lines(lab, t, [u], [], 'Time (s)', 'Utilisation', kind === 'training' ? 'A training job: compute, exchange, checkpoints' : 'Inference through the day');
  return [];
});
def('dcFacility', (a, nout, lab) => {
  const P = toMat(a[0], 'The IT power'), T = toMat(a[1] ?? num(20), 'The outside air (°C)');
  if (T.d.length !== 1 && T.d.length !== P.d.length) throw new LabError('dcFacility(P, T): the outside air one number or one per IT power.');
  const o = options(a, 2, ['Rated', 'Supply', 'Approach', 'Carnot', 'FanPump', 'UPS', 'Other'], 'dcFacility'), F = dc.FACILITY;
  const f: dc.Facility = { rated: optNum(o, 'Rated', Math.max(...P.d)), supply: optNum(o, 'Supply', F.supply), approach: optNum(o, 'Approach', F.approach), eta: optNum(o, 'Carnot', F.eta), fanPump: optNum(o, 'FanPump', F.fanPump), ups: optNum(o, 'UPS', 1), other: optNum(o, 'Other', F.other) };
  if (!(f.rated > 0 && f.eta > 0 && f.eta <= 1)) throw new LabError("dcFacility: 'Rated' above 0 and 'Carnot' a share of Carnot's COP (0 to 1).");
  const r = [...P.d].map((p, i) => dc.facilityPower(p, T.d[T.d.length === 1 ? 0 : i], f)), c = (k: keyof (typeof r)[0]) => col(r.map((x) => x[k]));
  if (nout > 0) return [record([['Total', c('total')], ['IT', c('it')], ['UPS', c('ups')], ['Distribution', c('distribution')], ['Cooling', c('cooling')], ['Chiller', c('chiller')], ['Other', c('other')], ['PUE', c('pue')]])];
  const x = r.map((_, i) => i + 1), stack = rows(r.map((q) => [q.it, q.ups + q.distribution, q.cooling, q.other]));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'area', row(x), stack);
  call(lab, 'legend', str('IT'), str('UPS and distribution'), str('Cooling'), str('Other')); call(lab, 'ylabel', str('Power')); call(lab, 'grid', str('on'));
  const mean = r.reduce((s, q) => s + q.total, 0) / r.reduce((s, q) => s + q.it, 0);
  call(lab, 'title', str(`Facility power: PUE ${mean.toFixed(2)} on average`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(x), row(r.map((q) => q.pue)), str('LineWidth'), num(1.5)); call(lab, 'ylabel', str('PUE')); call(lab, 'xlabel', str('Sample')); call(lab, 'grid', str('on'));
  return [];
});
def('dcCampus', (a, nout, lab) => {
  const ph = toMat(a[0], 'The phases'), years = Math.round(toMat(a[1] ?? num(10), 'The years').d[0]);
  if (ph.c !== 2 || ph.r < 1 || !(years >= 1 && years <= 40)) throw new LabError('dcCampus(phases, years): phases rows [year it opens, IT MW]; 1 to 40 years.');
  const o = options(a, 2, ['Fill', 'Utilisation', 'Climate', 'Supply', 'Carnot'], 'dcCampus'), cl = o.has('Climate') ? nums(o.get('Climate')) : [12, 9, 5];
  if (cl.length !== 3) throw new LabError("dcCampus's 'Climate' is [mean seasonal-swing daily-swing] °C.");
  const phases = Array.from({ length: ph.r }, (_, i) => [ph.d[i], ph.d[i + ph.r]] as [number, number]);
  const c = dc.campus({ phases, years, fill: optNum(o, 'Fill', 18), utilisation: optNum(o, 'Utilisation', 0.8), mean: cl[0], season: cl[1], day: cl[2], facility: { ...dc.FACILITY, supply: optNum(o, 'Supply', dc.FACILITY.supply), eta: optNum(o, 'Carnot', dc.FACILITY.eta) } });
  const Y = (k: keyof (typeof c.years)[0]) => col(c.years.map((y) => y[k]));
  if (nout > 0) return [record([['Year', Y('year')], ['CapacityMW', Y('capacity')], ['PeakMW', Y('peak')], ['MeanMW', Y('mean')], ['EnergyGWh', Y('energy')], ['PUE', Y('pue')], ['MonthPeakMW', col(c.monthPeak)], ['MonthMeanMW', col(c.monthMean)]])];
  const m = c.monthPeak.map((_, i) => (i + 0.5) / 12), last = c.years[c.years.length - 1];
  lines(lab, m, [c.monthPeak, c.monthMean], ['Monthly peak', 'Monthly mean'], 'Year', 'Demand (MW)', `Year ${last.year}: peak ${last.peak.toFixed(0)} MW, ${(last.energy / 1000).toFixed(2)} TWh, PUE ${last.pue.toFixed(2)}`);
  return [];
});
def('dcHeatFlow', (a) => {
  const P = toMat(a[0], 'The heat (W)'), dT = toMat(a[1] ?? num(10), 'The temperature rise (K)').d[0], m = a[2] ? textOf(a[2]).toLowerCase() : 'air';
  if (!(dT > 0) || (m !== 'air' && m !== 'water')) throw new LabError("dcHeatFlow(P, dT, 'air' | 'water'): dT above 0.");
  return [mat(P.r, P.c, [...P.d].map((p) => dc.heatFlow(p, dT)[m]))];
});
