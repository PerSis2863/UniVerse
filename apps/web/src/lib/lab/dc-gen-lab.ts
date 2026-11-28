import { LabError } from './parse';
import { mat, num, str, toMat } from './values';
import * as gn from './dc-gen';
import { call, def, lines, need, nums, options, optNum, optText, record, row, rows } from './sci-kit';

// Hyperion's power on site in the language (M575): gasTurbine, fuelCell, gensetStep, hybridPower. Our own names
// (MathWorks builds these in Simscape Electrical).

def('gasTurbine', (a, nout, lab) => {
  const x = toMat(a[0], 'The load share'), o = options(a, 1, ['Rated', 'Efficiency', 'Ambient', 'Price', 'Shape'], 'gasTurbine');
  const rated = optNum(o, 'Rated', 50), eta = optNum(o, 'Efficiency', 0.4), T = optNum(o, 'Ambient', 15), price = optNum(o, 'Price', 4), k = optNum(o, 'Shape', 0.35);
  if (!(rated > 0 && eta > 0 && eta < 0.7 && k > 0)) throw new LabError("gasTurbine: 'Rated' (MW) above 0, 'Efficiency' a share under 0.7.");
  const r = [...x.d].map((v) => gn.gasTurbine(v, rated, eta, T, price, k)), c = (q: keyof (typeof r)[0]) => mat(x.r, x.c, r.map((v) => v[q]));
  if (nout > 0) return [record([['Power', c('power')], ['Capacity', r[0]?.capacity ?? NaN], ['Efficiency', c('efficiency')], ['HeatRate', c('heatRate')], ['Fuel', c('fuel')], ['Cost', c('cost')], ['CO2', c('co2')]])];
  const s = Array.from({ length: 96 }, (_, i) => 0.05 + (0.95 * i) / 95), e = s.map((v) => 100 * gn.gasTurbine(v, rated, eta, T, price, k).efficiency);
  lines(lab, s.map((v) => 100 * v), [e], [], 'Load (% of capacity)', 'Efficiency (%)', `A ${rated} MW gas turbine in ${T} °C air: ${gn.gasTurbine(1, rated, eta, T).capacity.toFixed(1)} MW available`);
  return [];
});
def('fuelCell', (a, nout, lab) => {
  const i = toMat(a[0], 'The current density (mA/cm²)'), o = options(a, 1, ['Type', 'Cells', 'Area'], 'fuelCell'), kind = optText(o, 'Type', 'pem').toLowerCase();
  if (kind !== 'pem' && kind !== 'sofc') throw new LabError("fuelCell's 'Type' is 'pem' or 'sofc'.");
  const cells = optNum(o, 'Cells', 1), area = optNum(o, 'Area', 100);
  if (!(cells >= 1 && area > 0)) throw new LabError("fuelCell: 'Cells' at least 1, 'Area' (cm²) above 0.");
  const r = [...i.d].map((v) => gn.fuelCell(v, kind, cells, area)), c = (q: keyof (typeof r)[0]) => mat(i.r, i.c, r.map((v) => v[q]));
  if (nout > 0) return [c('V'), c('power'), record([['Efficiency', c('efficiency')], ['H2', c('h2')], ['Current', c('current')]])];
  const im = gn.FUEL_CELLS[kind].imax, xs = Array.from({ length: 120 }, (_, k) => 1 + ((im - 1) * k) / 119), q = xs.map((v) => gn.fuelCell(v, kind, cells, area));
  const best = q.reduce((b, v, k) => (v.power > q[b].power ? k : b), 0);
  const pct = (100 * q[best].efficiency).toFixed(0);
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, xs, [q.map((v) => v.V)], [], '', 'Cell voltage (V)', `${kind.toUpperCase()}: most power ${q[best].power.toFixed(1)} kW at ${xs[best].toFixed(0)} mA/cm² (${pct}% efficient)`);
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, xs, [q.map((v) => v.power)], [], 'Current density (mA/cm²)', 'Stack power (kW)', '');
  return [];
});
def('gensetStep', (a, nout, lab) => {
  const t = nums(a[0], 'The times (s)'), st = toMat(a[1], 'The load steps');
  if (st.c !== 2 || st.r < 1 || t.length < 2 || t.some((v, i) => i && !(v > t[i - 1]))) throw new LabError('gensetStep(t, steps): rising times; steps rows [time, load share].');
  const o = options(a, 2, ['H', 'Gains', 'Tau', 'D', 'F0'], 'gensetStep'), gg = o.has('Gains') ? nums(o.get('Gains')) : [gn.GENSET.kp, gn.GENSET.ki];
  const g: gn.Genset = { H: optNum(o, 'H', gn.GENSET.H), kp: gg[0], ki: gg[1] ?? gn.GENSET.ki, tau: optNum(o, 'Tau', gn.GENSET.tau), D: optNum(o, 'D', 1), f0: optNum(o, 'F0', 60) };
  if (!(g.H > 0 && g.tau > 0) || (t[t.length - 1] - t[0]) > 600) throw new LabError("gensetStep: 'H' and 'Tau' above 0; at most 600 s.");
  const steps = Array.from({ length: st.r }, (_, k) => [st.d[k], st.d[k + st.r]] as [number, number]), r = gn.gensetSteps(t, steps, g);
  if (nout > 0) return [row(r.f), record([['Dip', r.dip], ['Recovery', r.recovery], ['Classes', str(r.classes.join(' ') || 'none')], ['Mechanical', row(r.pm)]])];
  const c = gn.ISO8528.G2;
  call(lab, 'plot', row(t), row(r.f), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([t[0], t[t.length - 1]]), row([g.f0 * (1 - c.dip / 100), g.f0 * (1 - c.dip / 100)]), str('r--')); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Time (s)')); call(lab, 'ylabel', str('Frequency (Hz)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Dip ${r.dip.toFixed(1)}%, back in ${Number.isFinite(r.recovery) ? r.recovery.toFixed(1) + ' s' : 'never'}: ISO 8528-5 ${r.classes.join(', ') || 'no class'}`));
  return [];
});
def('hybridPower', (a, nout, lab) => {
  const load = nums(a[0], 'The load (MW)'), dt = need(a[1], 'hybridPower(load, dt hours, …): the time step');
  const o = options(a, 2, ['Grid', 'Turbines', 'Efficiency', 'Ambient', 'Battery', 'Solar', 'Prices', 'GridCO2'], 'hybridPower');
  const tb = o.has('Turbines') ? nums(o.get('Turbines')) : [4, 50, 0.3, 10], b = o.has('Battery') ? nums(o.get('Battery')) : [0, 0, 0.88], pr = o.has('Prices') ? nums(o.get('Prices')) : [4, 80];
  const solar = o.has('Solar') ? nums(o.get('Solar')) : [];
  if (!(dt > 0) || tb.length < 4 || b.length < 2 || (solar.length && solar.length !== load.length)) throw new LabError("hybridPower: dt above 0; 'Turbines' [count MW min-share ramp MW/min], 'Battery' [MWh MW efficiency], 'Solar' one per load sample.");
  const p: gn.Plant = { grid: optNum(o, 'Grid', 0), turbines: tb[0], cap: tb[1], min: tb[2], ramp: tb[3], eta: optNum(o, 'Efficiency', 0.4), T: optNum(o, 'Ambient', 15), battery: b[0], bpower: b[1], rte: b[2] ?? 0.88, soc0: 0.5, socMin: 0.1, socMax: 0.95, gasPrice: pr[0], gridPrice: pr[1] ?? 80, gridCO2: optNum(o, 'GridCO2', 0.4) };
  const r = gn.dispatch(load, solar, dt, p), T = r.totals;
  if (nout > 0) return [record([['Grid', row(r.grid)], ['Turbines', row(r.gt)], ['Units', row(r.units)], ['Battery', row(r.battery)], ['SoC', row(r.soc)], ['Unserved', row(r.unserved)], ['Curtailed', row(r.curtailed)], ['EnergyMWh', T.load], ['UnservedMWh', T.unserved], ['FuelCost', T.fuelCost], ['GridCost', T.gridCost], ['CO2', T.co2], ['Cycles', T.cycles], ['Starts', T.starts]])];
  const h = load.map((_, i) => i * dt), stack = rows(load.map((_, i) => [r.grid[i], solar[i] ?? 0, r.gt[i], Math.max(0, r.battery[i])]));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'area', row(h), stack); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(h), row(load), str('k-'), str('LineWidth'), num(1.5)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Grid'), str('Solar'), str('Turbines'), str('Battery'), str('Load')); call(lab, 'ylabel', str('MW')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Fuel $${(T.fuelCost / 1e3).toFixed(0)}k, grid $${(T.gridCost / 1e3).toFixed(0)}k, ${T.co2.toFixed(0)} t CO2${T.unserved > 1e-6 ? `, ${T.unserved.toFixed(1)} MWh unserved` : ''}`));
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, h, [r.soc.map((v) => 100 * v)], [], 'Time (h)', 'Battery charge (%)', `${T.cycles.toFixed(2)} full cycles, ${T.starts} turbine starts`);
  return [];
});
