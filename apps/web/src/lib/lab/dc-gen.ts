// Hyperion's power on site for data centres (M575, "Power generation equipment and energy storage developers"):
// behind-the-meter supplies that add to what the grid gives. A gas turbine's efficiency at part load and in hot air
// (heat rate, fuel, cost, CO₂); an engine generator set's frequency when a block of load lands on it, judged against
// ISO 8528-5's performance classes; a fuel cell stack's polarisation curve (Larminie and Dicks' form) with its power,
// efficiency and hydrogen; and the whole hybrid plant minute by minute: the grid up to its limit, turbines committed
// and ramped as fast as they can, a battery covering the AI load's fast swings and kept near half full, solar when
// there is some; what it costs, what it emits and any load left unserved. Our own models from the standard relations.

/** A gas turbine at load share x of its rating in air T °C: efficiency ηfull·x/(x + k(1 − x)) (40% → ~30% at half load,
 * ~20% at a quarter: an aeroderivative's shape), capacity −0.7%/K above 15 °C. Heat rate (Btu/kWh), fuel (MMBtu/h),
 * cost ($/h) and CO₂ (t/h, natural gas 53.06 kg/MMBtu) at that load. */
export function gasTurbine(x: number, rated: number, eta: number, T = 15, price = 4, k = 0.35) {
  const cap = rated * Math.min(1.05, 1 - 0.007 * (T - 15)), P = Math.max(0, Math.min(1, x)) * cap, s = P / cap;
  const e = s > 0 ? (eta * s) / (s + k * (1 - s)) : 0, hr = e > 0 ? 3412.14 / e : Infinity, fuel = P > 0 ? (P * hr) / 1000 : 0;
  return { power: P, capacity: cap, efficiency: e, heatRate: hr, fuel, cost: fuel * price, co2: fuel * 0.05306 };
}

export const FUEL_CELLS = {
  pem: { eoc: 1.031, r: 2.45e-4, A: 0.03, m: 2.11e-5, n: 8e-3, imax: 900 },
  sofc: { eoc: 1.01, r: 5e-4, A: 0.012, m: 1e-4, n: 5e-3, imax: 1200 },
};
/** A fuel cell's voltage at current density i (mA/cm²): V = Eoc − r·i − A·ln(i) − m·e^(n·i) (ohmic, activation and
 * mass-transport losses; Larminie and Dicks), at most Eoc. A stack of `cells` of `area` cm²: power (kW), efficiency on
 * hydrogen's lower heating value (V/1.253) and hydrogen used (kg/h). */
export function fuelCell(i: number, kind: keyof typeof FUEL_CELLS, cells: number, area: number) {
  const c = FUEL_CELLS[kind], V = Math.max(0, Math.min(c.eoc, c.eoc - c.r * i - c.A * Math.log(Math.max(i, 1e-6)) - c.m * Math.exp(c.n * i)));
  const I = (i / 1000) * area, P = (V * I * cells) / 1000, h2 = ((I * cells) / (2 * 96485)) * 2.016e-3 * 3600;
  return { V, current: I, power: P, efficiency: V / 1.253, h2 };
}

export interface Genset { H: number; kp: number; ki: number; tau: number; D: number; f0: number }
export const GENSET: Genset = { H: 1.2, kp: 8, ki: 6, tau: 0.6, D: 1, f0: 60 };
/** ISO 8528-5's frequency limits: the largest dip (%) and the time (s) to come back within the steady band, by class. */
export const ISO8528: Record<string, { dip: number; recovery: number; band: number }> = { G1: { dip: 15, recovery: 10, band: 2.5 }, G2: { dip: 10, recovery: 5, band: 1.5 }, G3: { dip: 7, recovery: 3, band: 0.5 } };
/** An engine generator's frequency after load steps (rows [time, load share]): 2H dΔf/dt = Pm − PL − DΔf, the engine's
 * torque lagging the governor's PI by tau (the turbocharger). RK4 at 1 ms. The dip, the time back inside each class's
 * band, and the classes met. */
export function gensetSteps(t: number[], steps: [number, number][], g: Genset) {
  const load = (x: number) => steps.reduce((s, [at, p]) => (x >= at ? p : s), 0);
  const f: number[] = [], pm: number[] = [];
  const p0 = load(t[0]);
  let df = 0, m = p0, integ = p0, clock = t[0];
  const der = (y: number[], pl: number) => { const u = g.kp * -y[0] + y[2]; return [(y[1] - pl - g.D * y[0]) / (2 * g.H), (Math.max(0, Math.min(1.1, u)) - y[1]) / g.tau, -g.ki * y[0]]; };
  for (let j = 0; j < t.length; j++) {
    while (clock < t[j] - 1e-12) {
      const h = Math.min(1e-3, t[j] - clock), pl = load(clock), y = [df, m, integ];
      const k1 = der(y, pl), k2 = der(y.map((v, i) => v + (h / 2) * k1[i]), pl), k3 = der(y.map((v, i) => v + (h / 2) * k2[i]), pl), k4 = der(y.map((v, i) => v + h * k3[i]), pl);
      [df, m, integ] = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      clock += h;
    }
    f.push(g.f0 * (1 + df)); pm.push(m);
  }
  const dev = f.map((x) => (100 * (x - g.f0)) / g.f0), dip = Math.min(0, ...dev);
  const lastStep = Math.max(...steps.map((s) => s[0]).filter((s) => s >= t[0] && s <= t[t.length - 1]), t[0]);
  const back = (band: number) => { let k = dev.length - 1; while (k > 0 && Math.abs(dev[k - 1]) <= band) k--; return Math.abs(dev[dev.length - 1]) > band ? Infinity : Math.max(0, t[k] - lastStep); };
  const classes = Object.entries(ISO8528).filter(([, c]) => -dip <= c.dip && back(c.band) <= c.recovery).map(([k]) => k);
  return { f, pm, dip, recovery: back(ISO8528.G2.band), classes };
}

export interface Plant {
  grid: number; turbines: number; cap: number; min: number; ramp: number; eta: number; T: number;
  battery: number; bpower: number; rte: number; soc0: number; socMin: number; socMax: number;
  gasPrice: number; gridPrice: number; gridCO2: number;
}
/** The hybrid plant over a load series (MW, one sample every dt hours) with optional solar (MW): the grid takes up to
 * its limit; turbines aim at the rest plus what brings the battery back towards half full over two hours, committed as
 * few as can carry it (each at least `min` of its rating) and ramping at most `ramp` MW a minute each; the battery
 * covers the difference within its power and charge (round-trip efficiency split evenly). The plant starts
 * running at the first sample's need (starts counted after it). Whatever is left is unserved
 * (short) or curtailed (spare). Totals in MWh, $, t CO₂. */
export function dispatch(load: number[], solar: number[], dt: number, p: Plant) {
  const n = load.length, out = { grid: [] as number[], gt: [] as number[], units: [] as number[], battery: [] as number[], soc: [] as number[], unserved: [] as number[], curtailed: [] as number[] };
  let soc = p.soc0, gt = 0, unitsOn = 0, starts = 0, fuelCost = 0, co2 = 0, throughput = 0;
  const eff = Math.sqrt(p.rte), cap = gasTurbine(1, p.cap, p.eta, p.T).capacity;
  for (let i = 0; i < n; i++) {
    const net = load[i] - (solar[i] ?? 0), grid = Math.min(p.grid, Math.max(0, net)), rem = net - grid;
    const target = Math.max(0, rem + ((0.5 - soc) * p.battery) / 2);
    let k = target > 1e-9 ? Math.min(p.turbines, Math.ceil(target / cap - 1e-9)) : 0;
    if (k > 0 && target / k < p.min * cap && k > 1) k = Math.max(1, Math.floor(target / (p.min * cap)));
    if (i > 0 && k > unitsOn) starts += k - unitsOn;
    unitsOn = k;
    const want = k ? Math.max(k * p.min * cap, Math.min(k * cap, target)) : 0, step = p.ramp * 60 * dt * Math.max(1, k);
    gt = !k ? 0 : i === 0 ? want : Math.max(k * p.min * cap, Math.min(k * cap, Math.max(gt - step, Math.min(gt + step, want))));
    let b = rem - gt; // + discharge, − charge
    const dmax = Math.min(p.bpower, ((soc - p.socMin) * p.battery * eff) / dt), cmax = Math.min(p.bpower, ((p.socMax - soc) * p.battery) / (eff * dt));
    b = Math.max(-cmax, Math.min(dmax, b));
    if (p.battery > 0) soc -= b > 0 ? (b * dt) / (eff * p.battery) : (b * dt * eff) / p.battery;
    const gap = rem - gt - b;
    if (k) { const x = gasTurbine(gt / (k * cap), k * p.cap, p.eta, p.T, p.gasPrice); fuelCost += x.cost * dt; co2 += x.co2 * dt; }
    co2 += grid * dt * p.gridCO2; throughput += Math.abs(b) * dt;
    out.grid.push(grid); out.gt.push(gt); out.units.push(k); out.battery.push(b); out.soc.push(soc); out.unserved.push(Math.max(0, gap)); out.curtailed.push(Math.max(0, -gap));
  }
  const sum = (x: number[]) => x.reduce((s, v) => s + v, 0) * dt;
  return { ...out, totals: { load: sum(load), grid: sum(out.grid), turbines: sum(out.gt), unserved: sum(out.unserved), curtailed: sum(out.curtailed), fuelCost, gridCost: sum(out.grid) * p.gridPrice, co2, cycles: p.battery > 0 ? throughput / (2 * p.battery) : 0, starts } };
}
