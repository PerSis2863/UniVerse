// Hyperion's IBIS buffer tables (M570, the owner, 27 Nov: "do all these": the I-V and V-t tables M568's .ibs left for
// a transistor-level design). A CMOS push-pull output stage from its transistors (level-1 MOSFETs: KP, VTO, LAMBDA, W,
// L, as SPICE's level 1 defines them) with ESD clamp diodes and the pad's capacitance, swept and run at three corners
// (typical; slow: weak transistors, low supply, hot; fast: the opposite), into IBIS 7.1's tables: [Pulldown] and
// [Pullup] (the driver alone, clamps taken out), [GND Clamp] and [POWER Clamp], [Ramp] (20–80% into 50 Ω) and
// [Rising Waveform] / [Falling Waveform] into a 50 Ω fixture to ground and to the supply. Our own code; checked against
// ngspice running the same circuit (ibis.test.ts).

export interface Mos { kp: number; vto: number; lambda: number; w: number; l: number }
export interface BufferSpec {
  vdd: number; n: Mos; p: Mos; is: number; nd: number; ccomp: number; tin: number;
  rload: number;
}
export const BUFFER0: BufferSpec = {
  vdd: 1.8,
  n: { kp: 200e-6, vto: 0.45, lambda: 0.05, w: 40e-6, l: 0.18e-6 },
  p: { kp: 80e-6, vto: 0.45, lambda: 0.05, w: 80e-6, l: 0.18e-6 },
  is: 1e-14, nd: 1.05, ccomp: 1.5e-12, tin: 100e-12, rload: 50,
};
export type Corner = 'typ' | 'min' | 'max';
/** The corner's buffer: slow (min) has 20% weaker transistors, thresholds 10% higher, the supply 10% lower and 100 °C;
 *  fast (max) the opposite and 0 °C; typical as given at 27 °C. */
export function corner(s: BufferSpec, c: Corner): BufferSpec & { temp: number } {
  if (c === 'typ') return { ...s, temp: 27 };
  const k = c === 'min' ? 0.8 : 1.2, v = c === 'min' ? 1.1 : 0.9, sup = c === 'min' ? 0.9 : 1.1, temp = c === 'min' ? 100 : 0;
  const m = (x: Mos): Mos => ({ ...x, kp: x.kp * k, vto: x.vto * v });
  return { ...s, n: m(s.n), p: m(s.p), vdd: s.vdd * sup, temp };
}
const vt = (tempC: number) => 1.380649e-23 * (tempC + 273.15) / 1.602176634e-19;
/** SPICE level-1 drain current (A, drain to source) for an n-channel device; symmetric for vds < 0. */
export function level1(m: Mos, vgs: number, vds: number): number {
  if (vds < 0) return -level1(m, vgs - vds, -vds); // source and drain swap
  const vov = vgs - m.vto, beta = m.kp * m.w / m.l;
  if (vov <= 0) return 0;
  const clm = 1 + m.lambda * vds;
  return vds < vov ? beta * (vov * vds - vds * vds / 2) * clm : beta / 2 * vov * vov * clm;
}
/** Current into the pin (IBIS's sign: into the component is positive) at pin voltage v, for gate voltage g on both
 *  transistors (an inverter's output: g = 0 drives high, g = vdd drives low), clamps included or not. */
export function pinCurrent(s: BufferSpec & { temp: number }, v: number, g: number, clamps = true) {
  const iN = level1(s.n, g, v); // NMOS: drain at the pin, source at ground
  const iP = level1({ ...s.p }, s.vdd - g, s.vdd - v); // PMOS as its mirror: current from the supply into the pin node
  let i = iN - iP;
  if (clamps) {
    const t = vt(s.temp) * s.nd, lim = (x: number) => Math.min(x, 40); // keep exp finite far out
    i += -s.is * (Math.exp(lim(-v / t)) - 1); // ground clamp: forward when the pin is below ground (current out of the pin)
    i += s.is * (Math.exp(lim((v - s.vdd) / t)) - 1); // power clamp: forward when the pin is above the supply
  }
  return i;
}
const sweep = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
/** The I-V tables at a corner, over −Vdd … 2Vdd as IBIS asks (Pullup and POWER Clamp against Vdd − Vpin). */
export function ivTables(s0: BufferSpec, c: Corner, n = 61) {
  const s = corner(s0, c), V = sweep(-s.vdd, 2 * s.vdd, n), t = vt(s.temp) * s.nd, lim = (x: number) => Math.min(x, 40);
  const gnd = (v: number) => -s.is * (Math.exp(lim(-v / t)) - 1), pwr = (v: number) => s.is * (Math.exp(lim((v - s.vdd) / t)) - 1);
  return {
    vdd: s.vdd,
    pulldown: V.map((v) => [v, pinCurrent(s, v, s.vdd, false)] as const),
    pullup: V.map((v) => [s.vdd - v, pinCurrent(s, v, 0, false)] as const), // Vtable = Vdd − Vpin
    gndClamp: sweep(-s.vdd, s.vdd, Math.ceil(n * 2 / 3)).map((v) => [v, gnd(v)] as const),
    powerClamp: sweep(-s.vdd, s.vdd, Math.ceil(n * 2 / 3)).map((vt2) => [vt2, pwr(s.vdd - vt2)] as const), // Vtable = Vdd − Vpin
  };
}
/** The pad's voltage over time as the input switches (a ramp of `tin`), into rload to vfix, with the pad capacitance:
 *  C dV/dt = I_into_pin… here the current the buffer pushes out of the pin minus what the load takes. */
export function transient(s0: BufferSpec, c: Corner, rising: boolean, vfix: number, o: { t?: number; n?: number } = {}) {
  const s = corner(s0, c), T = o.t ?? 2e-9, N = o.n ?? 2000, dt = T / N, t0 = 0.2e-9;
  const g = (t: number) => { const f = Math.min(1, Math.max(0, (t - t0) / s.tin)); return rising ? s.vdd * (1 - f) : s.vdd * f; };
  // start from the DC point before the edge (Newton on the pad's node)
  const dc = (gate: number) => { let v = rising ? 0 : s.vdd; for (let k = 0; k < 60; k++) { const f = -pinCurrent(s, v, gate) - (v - vfix) / s.rload, h = 1e-6, df = (-pinCurrent(s, v + h, gate) - (v + h - vfix) / s.rload - f) / h; v -= f / df; } return v; };
  let v = dc(g(0));
  const ts: number[] = [], vs: number[] = [];
  const f = (t: number, x: number) => (-pinCurrent(s, x, g(t)) - (x - vfix) / s.rload) / s.ccomp;
  for (let k = 0; k <= N; k++) {
    const t = k * dt; ts.push(t); vs.push(v);
    const k1 = f(t, v), k2 = f(t + dt / 2, v + dt / 2 * k1), k3 = f(t + dt / 2, v + dt / 2 * k2), k4 = f(t + dt, v + dt * k3);
    v += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return { t: ts, v: vs, vdd: s.vdd };
}
/** [Ramp]: the 20–80% swing and the time it takes, rising and falling, into rload (to ground rising, to Vdd falling). */
export function ramp(s0: BufferSpec, c: Corner) {
  const edge = (rising: boolean) => {
    const r = transient(s0, c, rising, rising ? 0 : corner(s0, c).vdd);
    const v0 = r.v[0], v1 = r.v[r.v.length - 1], a = v0 + 0.2 * (v1 - v0), b = v0 + 0.8 * (v1 - v0);
    const cross = (x: number) => { for (let i = 1; i < r.v.length; i++) if ((r.v[i - 1] - x) * (r.v[i] - x) <= 0) { const w = (x - r.v[i - 1]) / (r.v[i] - r.v[i - 1] || 1); return r.t[i - 1] + w * (r.t[i] - r.t[i - 1]); } return NaN; };
    return { dv: Math.abs(b - a), dt: cross(b) - cross(a) };
  };
  return { rise: edge(true), fall: edge(false) };
}
const e = (x: number) => (Number.isFinite(x) ? x.toExponential(4) : 'NA');
const col = (vals: (number | undefined)[]) => vals.map((x) => (x === undefined ? 'NA'.padStart(12) : e(x).padStart(12))).join('');
/** One table with typ, min and max columns: rows of the typical corner's x (min and max interpolated onto it). */
function table3(rows: Record<Corner, (readonly [number, number])[]>) {
  const at = (r: (readonly [number, number])[], x: number) => { const s = [...r].sort((p, q) => p[0] - q[0]); if (x < s[0][0] || x > s[s.length - 1][0]) return undefined; for (let i = 1; i < s.length; i++) if (x <= s[i][0]) { const w = (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0] || 1); return s[i - 1][1] + w * (s[i][1] - s[i - 1][1]); } return s[s.length - 1][1]; };
  const xs = [...rows.typ].map((r) => r[0]).sort((a, b) => a - b);
  return `| voltage       I(typ)       I(min)       I(max)\n${xs.map((x) => `${e(x).padStart(12)}${col([at(rows.typ, x), at(rows.min, x), at(rows.max, x)])}`).join('\n')}`;
}
/** A complete IBIS 7.1 model of the buffer: three corners, every table. `ami` names an .ami file for an
 *  [Algorithmic Model] (amigen's), and the component's pin. */
export function ibisFile(name: string, s: BufferSpec, o: { ami?: string; tx?: boolean; date?: string } = {}) {
  const C: Corner[] = ['typ', 'min', 'max'], iv = Object.fromEntries(C.map((c) => [c, ivTables(s, c)])) as Record<Corner, ReturnType<typeof ivTables>>;
  const rp = Object.fromEntries(C.map((c) => [c, ramp(s, c)])) as Record<Corner, ReturnType<typeof ramp>>;
  const wave = (rising: boolean, fixHigh: boolean) => {
    const ws = Object.fromEntries(C.map((c) => [c, transient(s, c, rising, fixHigh ? corner(s, c).vdd : 0, { n: 1000 })])) as Record<Corner, ReturnType<typeof transient>>;
    const idx = Array.from({ length: 51 }, (_, i) => Math.round(i * 1000 / 50));
    return `R_fixture = ${s.rload}\nV_fixture = ${fixHigh ? s.vdd : 0}\nV_fixture_min = ${fixHigh ? corner(s, 'min').vdd : 0}\nV_fixture_max = ${fixHigh ? corner(s, 'max').vdd : 0}\n| time          V(typ)       V(min)       V(max)\n${idx.map((i) => `${e(ws.typ.t[i]).padStart(12)}${col([ws.typ.v[i], ws.min.v[i], ws.max.v[i]])}`).join('\n')}`;
  };
  const r = (k: 'rise' | 'fall') => `${e(rp.typ[k].dv)}/${e(rp.typ[k].dt)}  ${e(rp.min[k].dv)}/${e(rp.min[k].dt)}  ${e(rp.max[k].dv)}/${e(rp.max[k].dt)}`;
  const vmin = corner(s, 'min').vdd, vmax = corner(s, 'max').vdd, mname = `${name}_buf`, file = `${name.toLowerCase()}.ibs`;
  return `[IBIS Ver]   7.1
[File Name]  ${file}
[File Rev]   1.0
[Date]       ${o.date ?? new Date().toISOString().slice(0, 10)}
[Source]     Hyperion ibisbuffer: a level-1 CMOS push-pull stage with ESD clamps, typical, slow and fast corners
[Notes]      The tables come from the transistor sizes given to ibisbuffer, not from a foundry's models.
[Disclaimer] Behavioural model for signal-integrity simulation.
[Component]  ${name}
[Manufacturer] Hyperion
[Package]
| variable   typ      min      max
R_pkg        0.1      0.05     0.2
L_pkg        0.5nH    0.3nH    0.8nH
C_pkg        0.3pF    0.2pF    0.4pF
[Pin] signal_name model_name
1     ${o.tx === false ? 'rx' : 'tx'}       ${mname}
2     VDD      POWER
3     GND      GND
[Model] ${mname}
Model_type   I/O
Polarity     Non-Inverting
Enable       Active-High
Vinl = ${e(0.35 * s.vdd)}
Vinh = ${e(0.65 * s.vdd)}
C_comp       ${e(s.ccomp)}  ${e(s.ccomp * 0.9)}  ${e(s.ccomp * 1.1)}
[Temperature Range]  27  100  0
[Voltage Range]      ${e(s.vdd)}  ${e(vmin)}  ${e(vmax)}
[Pulldown]
${table3({ typ: iv.typ.pulldown, min: iv.min.pulldown, max: iv.max.pulldown })}
[Pullup]
${table3({ typ: iv.typ.pullup, min: iv.min.pullup, max: iv.max.pullup })}
[GND Clamp]
${table3({ typ: iv.typ.gndClamp, min: iv.min.gndClamp, max: iv.max.gndClamp })}
[POWER Clamp]
${table3({ typ: iv.typ.powerClamp, min: iv.min.powerClamp, max: iv.max.powerClamp })}
[Ramp]
| variable  typ                      min                      max
dV/dt_r     ${r('rise')}
dV/dt_f     ${r('fall')}
R_load = ${s.rload}
[Rising Waveform]
${wave(true, false)}
[Rising Waveform]
${wave(true, true)}
[Falling Waveform]
${wave(false, true)}
[Falling Waveform]
${wave(false, false)}
${o.ami ? `[Algorithmic Model]
Executable Windows_VisualStudio_64 ${o.ami.replace(/\.ami$/, '')}_win64.dll ${o.ami}
Executable Linux_gcc_64 ${o.ami.replace(/\.ami$/, '')}_linux64.so ${o.ami}
[End Algorithmic Model]
` : ''}[End]
`;
}
