// Hyperion's data-centre power converters (M573, "Power converter developers"): an 800 V DC solid-state transformer.
// Its heart is the dual active bridge (DAB): two full bridges joined by a high-frequency transformer and an inductor,
// the power set by the phase shift between them, P = V1·nV2·φ(π − |φ|) / (2π² fs L). Here: designing it, its inductor
// current over one switching period (and whether each bridge switches at zero voltage), its losses and efficiency from
// the devices' resistance and switching energy, and the whole transformer simulated closed loop: a three-phase PFC
// rectifier holding the medium-voltage DC link, the DAB holding the 800 V bus, each under a PI controller sampled
// digitally with a one-sample delay, against an AI load that swings. Two levels of fidelity: average value (the DAB
// as its power law) and ideal switching (the inductor current itself, square waves at fs). The tuned controller can be
// written out as C or as fixed-point Verilog. Our own code from the standard DAB analysis (Kheraluwala, De Doncker).

/** DAB power (W) at phase shift φ (rad, −π/2 to π/2), n = N1/N2 (V2 referred to the primary is nV2). */
export const dabPower = (V1: number, V2: number, n: number, L: number, fs: number, phi: number) => (V1 * n * V2 * phi * (Math.PI - Math.abs(phi))) / (2 * Math.PI ** 2 * fs * L);
/** The phase shift that carries P (NaN when P is beyond the most at π/2). */
export function dabPhase(V1: number, V2: number, n: number, L: number, fs: number, P: number) {
  const k = (V1 * n * V2) / (2 * Math.PI ** 2 * fs * L), d = Math.PI ** 2 - (4 * Math.abs(P)) / k;
  return d < 0 ? NaN : (Math.sign(P) * (Math.PI - Math.sqrt(d))) / 2;
}
/** A DAB for P at phase φ: n for unity voltage gain and the inductance that carries P there. */
export function dabDesign(V1: number, V2: number, P: number, fs: number, phi = Math.PI / 6) {
  const n = V1 / V2, L = (V1 * n * V2 * phi * (Math.PI - phi)) / (2 * Math.PI ** 2 * fs * P);
  return { n, L, pmax: dabPower(V1, V2, n, L, fs, Math.PI / 2) };
}
/** The inductor current over one period in steady state (`m` samples from the primary's rising edge): v_L = V1·s1(t) −
 * nV2·s1(t − φ/(2π fs)), integrated, its mean removed (half-wave symmetry). The current at each bridge's switching and
 * whether it switches at zero voltage (primary: i < 0 as it rises; secondary: i > 0 as it rises), RMS, and the power
 * read back from the waveform. */
export function dabWaveform(V1: number, V2: number, n: number, L: number, fs: number, phi: number, m = 2000) {
  const T = 1 / fs, dt = T / m, sq = (x: number) => (((x % 1) + 1) % 1 < 0.5 ? 1 : -1), sh = phi / (2 * Math.PI);
  const t: number[] = [], i: number[] = [], v1: number[] = [], v2: number[] = [];
  let x = 0;
  for (let k = 0; k < m; k++) {
    const a = sq(k / m), b = sq(k / m - sh);
    t.push(k * dt); i.push(x); v1.push(a * V1); v2.push(b * n * V2);
    x += ((a * V1 - b * n * V2) / L) * dt;
  }
  const mean = i.reduce((s, v) => s + v, 0) / m;
  for (let k = 0; k < m; k++) i[k] -= mean;
  const at = (frac: number) => i[Math.round((((frac % 1) + 1) % 1) * m) % m];
  const i1 = at(0), i2 = at(sh), rms = Math.sqrt(i.reduce((s, v) => s + v * v, 0) / m), P = i.reduce((s, v, k) => s + v * v1[k], 0) / m;
  return { t, i, v1, v2, iPrimary: i1, iSecondary: i2, zvsPrimary: i1 <= 0, zvsSecondary: i2 >= 0, rms, peak: Math.max(...i.map(Math.abs)), power: P };
}

export interface Devices { rds1: number; rds2: number; eoff: number; eon: number; vref: number; iref: number; core: number; rac: number }
/** Typical SiC MOSFETs (Ω, J at vref/iref), a core loss (W) and the winding resistance (Ω, primary side). */
export const DEVICES: Devices = { rds1: 0.016, rds2: 0.004, eoff: 0.6e-3, eon: 1.5e-3, vref: 1200, iref: 50, core: 150, rac: 0.01 };
/** The DAB's losses at power P: conduction (each bridge 2·I²rms·Rds; the secondary carries n times the current),
 * switching (four transitions a period per bridge, each turn-off energy scaled by current and voltage, plus turn-on
 * when it isn't at zero voltage), the core and the windings. */
export function dabLosses(V1: number, V2: number, n: number, L: number, fs: number, P: number, d: Devices) {
  const phi = dabPhase(V1, V2, n, L, fs, P);
  if (!Number.isFinite(phi)) return null;
  const w = dabWaveform(V1, V2, n, L, fs, phi, 1000);
  const sw = (I: number, V: number, zvs: boolean) => 2 * fs * (Math.abs(I) / d.iref) * (V / d.vref) * (d.eoff + (zvs ? 0 : d.eon));
  const cond = 2 * w.rms ** 2 * d.rds1 + 2 * (n * w.rms) ** 2 * d.rds2, swl = sw(w.iPrimary, V1, w.zvsPrimary) + sw(n * w.iSecondary, V2, w.zvsSecondary);
  const total = cond + swl + d.core + w.rms ** 2 * d.rac;
  return { phi, conduction: cond, switching: swl, core: d.core, copper: w.rms ** 2 * d.rac, total, efficiency: P / (P + total), zvs: w.zvsPrimary && w.zvsSecondary, rms: w.rms };
}

export interface Sst {
  v1: number; v2: number; c1: number; c2: number; fs: number; L: number; n: number; pmax: number;
  ts: number; bw1: number; bw2: number; tauI: number; etaPfc: number; etaDab: number; fidelity: 'average' | 'switching';
}
/** The SST's two PI controllers tuned by loop shaping: the DC link's energy loop (on top of the DAB's power fed
 * forward) at bw1 Hz (Kp in W per V) and the
 * bus's phase loop at bw2 Hz (Kp in rad per V) about the phase that carries half the rating; integral corners a fifth
 * of the crossover. */
export function sstGains(s: Sst) {
  const w1 = 2 * Math.PI * s.bw1, w2 = 2 * Math.PI * s.bw2, phi0 = dabPhase(s.v1, s.v2, s.n, s.L, s.fs, s.pmax / 2) || Math.PI / 6;
  const g = (s.v1 * s.n * (Math.PI - 2 * phi0)) / (2 * Math.PI ** 2 * s.fs * s.L);
  const kp1 = w1 * s.c1 * s.v1, kp2 = (w2 * s.c2) / g;
  return { kp1, ki1: (kp1 * w1) / 5, kp2, ki2: (kp2 * w2) / 5 };
}
/** One SST module closed loop over times t (s) against a load P(t) (W, constant power on the bus), starting in
 * steady state at the first load. The PFC delivers grid power
 * Pg lagging its reference by tauI (its fast current loop), the reference the DAB's power fed forward plus the link's
 * PI; the controllers update every ts with the last sample's
 * reading (a one-sample delay) and hold. Average value: Euler at ts/20; switching: the inductor current itself at
 * 200 steps a switching period. */
export function sstSimulate(t: number[], load: number[], s: Sst) {
  const k = sstGains(s), out = { V1: [] as number[], V2: [] as number[], phi: [] as number[], Pg: [] as number[], Pdab: [] as number[], iL: [] as number[] };
  let V1 = s.v1, V2 = s.v2, Pg = load[0] / (s.etaDab * s.etaPfc), x1 = 0, x2 = dabPhase(s.v1, s.v2, s.n, s.L, s.fs, load[0] / s.etaDab) || 0, iL = dabWaveform(s.v1, s.v2, s.n, s.L, s.fs, x2, 200).iPrimary, pdabAvg = load[0] / s.etaDab;
  let phi = x2, pref = x1, sampled = [V1, V2], nextSample = 0, clock = 0;
  const dt = s.fidelity === 'switching' ? 1 / (s.fs * 200) : Math.min(s.ts / 20, 1e-5), T = 1 / s.fs, sq = (x: number) => (((x % 1) + 1) % 1 < 0.5 ? 1 : -1);
  for (let j = 0; j < t.length; j++) {
    while (j > 0 && clock < t[j] - 1e-15) {
      const h = Math.min(dt, t[j] - clock), P = load[j - 1];
      if (clock >= nextSample) {
        const e1 = s.v1 - sampled[0], e2 = s.v2 - sampled[1];
        x1 += k.ki1 * e1 * s.ts; x2 += k.ki2 * e2 * s.ts;
        x1 = Math.max(-s.pmax, Math.min(s.pmax, x1)); x2 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, x2));
        pref = Math.max(0, Math.min(s.pmax * 1.2, pdabAvg / s.etaPfc + k.kp1 * e1 + x1)); phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, k.kp2 * e2 + x2));
        sampled = [V1, V2]; nextSample += s.ts;
      }
      Pg += ((pref - Pg) / s.tauI) * h;
      let i1: number, i2: number;
      if (s.fidelity === 'switching') {
        const a = sq(clock / T), b = sq(clock / T - phi / (2 * Math.PI));
        iL += ((a * V1 - b * s.n * V2) / s.L) * h;
        i1 = a * iL; i2 = b * s.n * iL * s.etaDab;
        pdabAvg += (V1 * i1 - pdabAvg) * (h / (20 * T));
      } else {
        const pd = dabPower(V1, V2, s.n, s.L, s.fs, phi);
        i1 = pd / V1; i2 = (pd * s.etaDab) / V2; pdabAvg = pd;
      }
      V1 += (((Pg * s.etaPfc) / V1 - i1) / s.c1) * h;
      V2 += ((i2 - P / V2) / s.c2) * h;
      clock += h;
    }
    out.V1.push(V1); out.V2.push(V2); out.phi.push(phi); out.Pg.push(Pg); out.Pdab.push(pdabAvg); out.iL.push(iL);
  }
  return { ...out, gains: k };
}

/** The bus controller written out for a processor (C, floating point) or an FPGA (Verilog, signed fixed point with
 * `frac` fractional bits): a PI with anti-windup clamping, run every ts. */
export function controllerCode(kp: number, ki: number, ts: number, ref: number, lo: number, hi: number, lang: 'c' | 'verilog', frac = 16) {
  if (lang === 'c') {
    return `/* PI controller for the 800 V bus, run every ${ts.toExponential(3)} s (written by Hyperion). */
typedef struct { float integ; } pi_state;
static const float KP = ${kp.toPrecision(9)}f, KI_TS = ${(ki * ts).toPrecision(9)}f, REF = ${ref.toPrecision(9)}f;
static const float OUT_MIN = ${lo.toPrecision(9)}f, OUT_MAX = ${hi.toPrecision(9)}f;

float pi_step(pi_state *s, float measured) {
  float e = REF - measured;
  s->integ += KI_TS * e;
  if (s->integ > OUT_MAX) s->integ = OUT_MAX;
  if (s->integ < OUT_MIN) s->integ = OUT_MIN;
  float u = KP * e + s->integ;
  return u > OUT_MAX ? OUT_MAX : (u < OUT_MIN ? OUT_MIN : u);
}
`;
  }
  const q = (x: number) => Math.round(x * 2 ** frac), w = 32;
  return `// PI controller for the 800 V bus, Q${w - frac - 1}.${frac} fixed point, one step per clock enable (every ${ts.toExponential(3)} s).
// Written by Hyperion.
module pi_bus (
  input  wire                 clk, rst, en,
  input  wire signed [${w - 1}:0] measured,   // volts, Q${w - frac - 1}.${frac}
  output reg  signed [${w - 1}:0] u           // phase shift (rad), Q${w - frac - 1}.${frac}
);
  localparam signed [${w - 1}:0] REF = ${q(ref)}, KP = ${q(kp)}, KITS = ${q(ki * ts)};
  localparam signed [${w - 1}:0] UMIN = ${q(lo)}, UMAX = ${q(hi)};
  reg  signed [${w - 1}:0] integ;
  wire signed [${w - 1}:0] e = REF - measured;
  wire signed [${2 * w - 1}:0] pe = KP * e, ie = KITS * e;
  wire signed [${w - 1}:0] integ_n0 = integ + (ie >>> ${frac});
  wire signed [${w - 1}:0] integ_n = integ_n0 > UMAX ? UMAX : (integ_n0 < UMIN ? UMIN : integ_n0);
  wire signed [${w - 1}:0] u_n0 = (pe >>> ${frac}) + integ_n;
  always @(posedge clk) begin
    if (rst) begin integ <= 0; u <= 0; end
    else if (en) begin
      integ <= integ_n;
      u <= u_n0 > UMAX ? UMAX : (u_n0 < UMIN ? UMIN : u_n0);
    end
  end
endmodule
`;
}
