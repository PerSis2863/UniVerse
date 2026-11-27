import { dft } from './fft';
import { switching, type Wave } from './ibis-sim';

// The IBIS file's analog buffer models for the IBIS-AMI flows (M583, the left-out of M578: "the .ibs file's other
// electrical data isn't used"). An AMI model is only the equaliser; the chip's driver and receiver pads are the
// [Model]'s analog data (IBIS 7.2, chapter 6): C_comp (the pad's capacitance), [Ramp] (the driver's 20–80% edge),
// [Pull-up] / [Pull-down] I-V tables (the driver's strength: its output resistance near the rails), [GND Clamp] /
// [POWER Clamp] (an on-die termination shows as a straight line there) and the component's [Package] R_pkg L_pkg
// C_pkg. Here each end becomes a small linear network around the channel's reference impedance: the transmitter a
// source with its resistance, its pad and package and its edge; the receiver its package, pad and termination; both
// scaled so an ideal matched end changes nothing. These linear forms describe the buffers and smooth the near-end
// coupling edge; the channel itself goes through ibis-sim.ts (M585: the curves as they are, echoes included).

/** pu, pd, gc, pc: the [Pull-up], [Pull-down], [GND Clamp], [POWER Clamp] tables at the corner, rows [V I] (I into the
 * pin; pull-up and power-clamp voltages measured from the supply); vcc the supply; rise, fall the 0–100% edges; kr, kf
 * the rising and falling edges' pull-up and pull-down weights over time from the waveform tables, rows [t ku kd] (M586). */
export interface Analog { type: string; corner: string; rs: number; rt: number; cComp: number; rPkg: number; lPkg: number; cPkg: number; rise: number; fall: number; vcc: number; pu: number[][]; pd: number[][]; gc: number[][]; pc: number[][]; kr?: number[][]; kf?: number[][]; notes: string[] }

const SCALE: Record<string, number> = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
/** An IBIS number: 1.2p, 3.3, 50m, 2e-12 (the scale letter after it; M is mega, m milli); NaN for NA. */
export function ibisNum(s: string | undefined): number {
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([TGMkmunpf]?)/.exec((s ?? '').trim());
  return m ? Number(m[1]) * (SCALE[m[2]] ?? 1) : NaN;
}
const COL: Record<string, number> = { typ: 0, min: 1, max: 2 };
/** The corner's value from a typ / min / max row (NA → typ). */
const pick = (w: string[], corner: string) => { const v = ibisNum(w[COL[corner] ?? 0]); return Number.isFinite(v) ? v : ibisNum(w[0]); };

/** The slope dV/dI of an I-V table at voltage v (the two rows around it), Infinity when flat. */
function slope(rows: number[][], v: number) {
  const r = rows.filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1])).sort((a, b) => a[0] - b[0]);
  if (r.length < 2) return NaN;
  let i = r.findIndex((x) => x[0] >= v);
  if (i <= 0) i = i === 0 ? 1 : r.length - 1;
  const dI = r[i][1] - r[i - 1][1];
  return Math.abs(dI) < 1e-15 ? Infinity : Math.abs((r[i][0] - r[i - 1][0]) / dI);
}

/** A model's analog data at a corner (typ, min or max), or null if the file has no such [Model]. */
export function readAnalog(text: string, model: string, corner = 'typ'): Analog | null {
  let comment = '|', section = '', inModel = false, found = false, type = '', vcc = NaN, cComp = NaN, ramp = NaN, rampF = NaN;
  const pkg = { r: NaN, l: NaN, c: NaN }, tables: Record<string, number[][]> = {}, waves: { rising: boolean; w: Wave }[] = [];
  let wave: Wave | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const cc = /^\s*\[comment char\]\s*(\S)_char/i.exec(raw);
    if (cc) { comment = cc[1]; continue; }
    const at = raw.indexOf(comment), line = (at >= 0 ? raw.slice(0, at) : raw).trim();
    if (!line) continue;
    const kw = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (kw) {
      section = kw[1].trim().toLowerCase().replace(/[\s_-]+/g, ' ');
      if (section === 'model') { inModel = kw[2].split(/\s+/)[0].toLowerCase() === model.toLowerCase(); found ||= inModel; }
      else if (inModel && /^(pull up|pull down|gnd clamp|power clamp)$/.test(section)) tables[section] = [];
      else if (inModel && /^(rising|falling) waveform$/.test(section)) { wave = { r: NaN, v: NaN, rows: [], l: 0, c: 0, rd: 0, ld: 0, cd: 0 }; waves.push({ rising: section[0] === 'r', w: wave }); }
      else if (section === 'voltage range' && inModel) vcc = pick(kw[2].split(/\s+/), corner);
      continue;
    }
    const w = line.split(/\s+/);
    if (section === 'package' && !inModel) {
      const k = w[0].toLowerCase();
      if (k === 'r_pkg') pkg.r = pick(w.slice(1), corner); else if (k === 'l_pkg') pkg.l = pick(w.slice(1), corner); else if (k === 'c_pkg') pkg.c = pick(w.slice(1), corner);
      continue;
    }
    if (!inModel) continue;
    if (section === 'model' || section === 'algorithmic model' || section === 'end algorithmic model') {
      if (/^model_type$/i.test(w[0])) type = w[1] ?? '';
      else if (/^c_comp$/i.test(w[0])) cComp = pick(w.slice(1), corner);
    } else if (section === 'ramp' && /^dv\/dt_[rf]$/i.test(w[0])) {
      const col = w[1 + (COL[corner] ?? 0)], [dv, dt] = (col && !/^na$/i.test(col) ? col : w[1]).split('/');
      if (ibisNum(dv) > 0 && ibisNum(dt) > 0) { if (/r$/i.test(w[0])) ramp = ibisNum(dt); else rampF = ibisNum(dt); }
    } else if (/waveform$/.test(section) && wave) {
      const k = w[0].toLowerCase();
      const pf: Record<string, 'l' | 'c' | 'rd' | 'ld' | 'cd'> = { l_fixture: 'l', c_fixture: 'c', r_dut: 'rd', l_dut: 'ld', c_dut: 'cd' };
      if (k === 'r_fixture') wave.r = ibisNum(w[1]);
      else if (pf[k]) { const x = ibisNum(w[1]); if (Number.isFinite(x) && x > 0) wave[pf[k]] = x; }
      else if (k === 'v_fixture' || k === `v_fixture_${corner}`) { if (k !== 'v_fixture' || !Number.isFinite(wave.v)) wave.v = ibisNum(w[1]); }
      else if (Number.isFinite(ibisNum(w[0]))) { const v = pick(w.slice(1), corner); if (Number.isFinite(v)) wave.rows.push([ibisNum(w[0]), v]); }
    } else if (tables[section]) {
      const v = ibisNum(w[0]), i = pick(w.slice(1), corner);
      if (Number.isFinite(v) && Number.isFinite(i)) tables[section].push([v, i]);
    }
  }
  if (!found) return null;
  const notes: string[] = [], vdd = Number.isFinite(vcc) ? vcc : 1;
  // the driver: the average of its pull-down's slope near 0 V and its pull-up's near its rail (either alone when one is missing)
  const rd = [slope(tables['pull down'] ?? [], 0), slope(tables['pull up'] ?? [], 0)].filter((r) => Number.isFinite(r));
  let rs = rd.length ? rd.reduce((a, b) => a + b, 0) / rd.length : NaN;
  if (!Number.isFinite(rs)) { rs = 50; if (/output|i\/o|3-state/i.test(type)) notes.push('no [Pull-up] / [Pull-down] table: the driver taken as 50 ohms'); }
  // the receiver's termination: the clamps' conductance at mid-supply (a straight line there is an on-die termination)
  const g = [slope(tables['gnd clamp'] ?? [], vdd / 2), slope(tables['power clamp'] ?? [], vdd / 2)].filter((r) => Number.isFinite(r) && r > 0).reduce((a, r) => a + 1 / r, 0);
  let rt = g > 0 ? 1 / g : Infinity;
  if (!(rt < 1e4)) { rt = 50; if (/input|i\/o/i.test(type)) notes.push('no termination in the clamp tables: 50 ohms taken'); }
  const a: Analog = { type, corner, rs, rt, cComp: Number.isFinite(cComp) ? cComp : 0, rPkg: Number.isFinite(pkg.r) ? pkg.r : 0, lPkg: Number.isFinite(pkg.l) ? pkg.l : 0, cPkg: Number.isFinite(pkg.c) ? pkg.c : 0, rise: Number.isFinite(ramp) ? ramp / 0.6 : 0, fall: Number.isFinite(rampF) ? rampF / 0.6 : Number.isFinite(ramp) ? ramp / 0.6 : 0, vcc: vdd, pu: tables['pull up'] ?? [], pd: tables['pull down'] ?? [], gc: tables['gnd clamp'] ?? [], pc: tables['power clamp'] ?? [], notes };
  // the edges from the waveform tables (M586), where both of the driver's tables are there to weigh
  for (const rising of [true, false]) {
    const ws = waves.filter((x) => x.rising === rising).map((x) => x.w), k = a.pu.length && a.pd.length ? switching(a, ws) : null;
    if (k) { if (rising) a.kr = k; else a.kf = k; notes.push(`${rising ? 'rising' : 'falling'} edge from ${Math.min(2, ws.length)} [${rising ? 'Rising' : 'Falling'} Waveform] table${ws.length > 1 ? 's' : ''}`); }
  }
  return a;
}

export type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const par = (a: C, b: C): C => div(mul(a, b), add(a, b));
const OPEN: C = [1e30, 0];
/** A capacitor's impedance at angular frequency w (open at DC or when there is none). */
const zc = (c: number, w: number): C => (c > 0 && w > 0 ? [0, -1 / (w * c)] : OPEN);

/** The transmitter's front end at f: source rs, the pad C_comp, the package's R and L in series and C_pkg at the pin,
 * into the reference impedance z0; its edge (a linear ramp over `rise`) as a sinc delayed by half the ramp. 1 for an ideal matched driver. */
export function txGain(a: Analog, f: number, z0 = 50): C {
  const w = 2 * Math.PI * f, zl = par([z0, 0], zc(a.cPkg, w)), zin = add([a.rPkg, w * a.lPkg], zl), zd = par(zin, zc(a.cComp, w));
  const v = mul(div(mul([2, 0], zd), add([a.rs, 0], zd)), div(zl, zin)), x = Math.PI * f * a.rise;
  return x > 1e-9 ? mul(v, [(Math.sin(x) / x) * Math.cos(x), -(Math.sin(x) / x) * Math.sin(x)]) : v;   // the ramp, causal (delayed by half of it)
}
/** The receiver's front end at f: the line (z0, its wave doubled at the open end) into the pin's C_pkg, the package's
 * R and L, then the pad C_comp beside the termination rt. 1 for an ideal matched receiver. */
export function rxGain(a: Analog, f: number, z0 = 50): C {
  const w = 2 * Math.PI * f, zd = par([a.rt, 0], zc(a.cComp, w)), za = add([a.rPkg, w * a.lPkg], zd), zp = par(za, zc(a.cPkg, w));
  return mul(div(mul([2, 0], zp), add([z0, 0], zp)), div(zd, za));
}

/** An impulse response (every dt) through the linear front ends (used for the near-end coupling edge). */
export function throughFrontEnds(h: number[], dt: number, tx: Analog | null | undefined, rx: Analog | null | undefined, z0 = 50): number[] {
  if (!tx && !rx) return h;
  return filterImpulse(h, dt, (f) => { let g: C = [1, 0]; if (tx) g = mul(g, txGain(tx, f, z0)); if (rx) g = mul(g, rxGain(rx, f, z0)); return g; });
}
/** An impulse response (every dt) times a frequency response: zero-padded, by FFT, the first h.length samples. */
export function filterImpulse(h: number[], dt: number, gain: (f: number) => C): number[] {
  let N = 1; while (N < 2 * h.length) N <<= 1;
  const [Xr, Xi] = dft(Array.from({ length: N }, (_, i) => h[i] ?? 0), new Array(N).fill(0)), re = new Array(N).fill(0), im = new Array(N).fill(0);
  for (let k = 0; k <= N / 2; k++) {
    const y = mul([Xr[k], Xi[k]], gain(k / (N * dt)));
    re[k] = y[0]; im[k] = y[1];
    if (k > 0 && k < N / 2) { re[N - k] = y[0]; im[N - k] = -y[1]; }
  }
  return Array.from(dft(re, im, true)[0].subarray(0, h.length));
}
