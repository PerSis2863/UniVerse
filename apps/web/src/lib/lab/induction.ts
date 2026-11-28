// Hyperion's power electronics, part 4 (M566): induction motors and the three-phase rectifier. Plain maths (power-lab.ts
// puts it in the language). Written from the textbook models:
//  • the induction machine's two-axis model in the stator frame (stator and rotor flux linkages as the states, the
//    currents from the inductance matrix), fed by an ideal averaged inverter;
//  • scalar V/f control; indirect rotor-flux-oriented control (slip from the current commands); a sensorless variant
//    whose speed comes from a model-reference adaptive observer (the voltage model against the current model);
//  • a six-pulse diode bridge with a DC choke and capacitor, and its line current's harmonics.

export interface Induction { rs: number; rr: number; lls: number; llr: number; lm: number; pp: number; J: number; B: number; vll: number; f: number }
/** A 4 kW, 400 V, 50 Hz, four-pole machine (two pole pairs), typical textbook values. */
export const IM4KW: Induction = { rs: 1.405, rr: 1.395, lls: 5.839e-3, llr: 5.839e-3, lm: 0.1722, pp: 2, J: 0.0131, B: 0.002985, vll: 400, f: 50 };

export interface ImRun { t: Float64Array; speed: Float64Array; torque: Float64Array; ia: Float64Array; flux: Float64Array; estimate: Float64Array }
export interface ImCtl {
  mode: 'vf' | 'foc' | 'sensorless';
  /** Speed command (rad/s, mechanical) and load torque (N·m) over time. */
  speed: (t: number) => number; load: (t: number) => number;
  tEnd: number; dt: number;
}

/** The machine run under one of three controls. FOC: rotor flux held at its rated value through id, a speed PI asking
 *  iq, current PIs in the synchronous frame; the angle from the speed (measured, or the observer's) plus the slip
 *  Lm·iq/(τr·ψr). V/f: the frequency follows the speed command (with slip ignored) and the voltage follows the frequency,
 *  with a small boost at low speed for the stator's resistance. */
export function inductionRun(m: Induction, c: ImCtl): ImRun {
  const Ls = m.lls + m.lm, Lr = m.llr + m.lm, det = Ls * Lr - m.lm * m.lm, sigma = det / (Ls * Lr), tr = Lr / m.rr;
  const vpk = (m.vll * Math.SQRT2) / Math.sqrt(3), wRated = 2 * Math.PI * m.f, psiR = (vpk / wRated) * (m.lm / Ls) * 0.95;
  const N = Math.round(c.tEnd / c.dt), dt = c.dt;
  const out: ImRun = { t: new Float64Array(N), speed: new Float64Array(N), torque: new Float64Array(N), ia: new Float64Array(N), flux: new Float64Array(N), estimate: new Float64Array(N) };
  // States: stator and rotor flux (α, β), mechanical speed.
  let psa = 0, psb = 0, pra = 0, prb = 0, wm = 0;
  // Control states.
  let th = 0, xd = 0, xq = 0, xw = 0, wHat = 0, xm = 0;
  let pva = 0, pvb = 0, pia = 0, pib = 0, lpa = 0, lpb = 0; // MRAS: voltage- and current-model rotor fluxes
  let isaPrev = 0, isbPrev = 0, va = 0, vb = 0;
  // Gains: current loops at 1 kHz on σLs, speed loop at 10 Hz on J (torque constant 1.5·pp·Lm/Lr·ψr).
  const wcI = 2 * Math.PI * 1000, kpI = sigma * Ls * wcI, kiI = (m.rs + m.rr * (m.lm / Lr) ** 2) * wcI;
  const kt = 1.5 * m.pp * (m.lm / Lr) * psiR, wcW = 2 * Math.PI * 10, kpW = (m.J * wcW) / kt, kiW = (kpW * wcW) / 5;
  const iMax = 3 * (psiR / m.lm) * 4;
  for (let n = 0; n < N; n++) {
    const t = n * dt;
    // Currents from fluxes.
    const isa = (Lr * psa - m.lm * pra) / det, isb = (Lr * psb - m.lm * prb) / det, ira = (Ls * pra - m.lm * psa) / det, irb = (Ls * prb - m.lm * psb) / det;
    const Te = 1.5 * m.pp * (psa * isb - psb * isa);
    const wref = c.speed(t);
    if (c.mode === 'vf') {
      const fe = (m.pp * wref) / (2 * Math.PI), V = Math.min(vpk, vpk * (Math.abs(fe) / m.f) + 0.03 * vpk * Math.sign(fe || 1));
      th += 2 * Math.PI * fe * dt;
      va = V * Math.cos(th); vb = V * Math.sin(th);
    } else {
      // The speed the controller uses: measured, or the observer's.
      const wUse = c.mode === 'foc' ? wm : wHat;
      const ew = wref - wUse;
      xw += kiW * ew * dt;
      let iq = kpW * ew + xw;
      if (Math.abs(iq) > iMax) { xw -= kiW * ew * dt; iq = Math.sign(iq) * iMax; }
      const id = psiR / m.lm;
      const wsl = (m.lm * iq) / (tr * psiR), we = m.pp * wUse + wsl;
      th += we * dt;
      const cs = Math.cos(th), sn = Math.sin(th), isd = cs * isa + sn * isb, isq = -sn * isa + cs * isb;
      const ed = id - isd, eq = iq - isq;
      xd += kiI * ed * dt; xq += kiI * eq * dt;
      let vd = kpI * ed + xd - we * sigma * Ls * isq, vq = kpI * eq + xq + we * sigma * Ls * isd + we * (m.lm / Lr) * psiR;
      const mag = Math.hypot(vd, vq);
      if (mag > vpk) { vd *= vpk / mag; vq *= vpk / mag; }
      va = cs * vd - sn * vq; vb = sn * vd + cs * vq;
    }
    // MRAS observer (run in every mode, so its estimate can be compared): both models through the same 2 Hz low-pass in
    // place of a pure integrator, so the voltage model doesn't drift.
    {
      const wc = 2 * Math.PI * 2, disa = (isa - isaPrev) / dt, disb = (isb - isbPrev) / dt;
      const ea = (Lr / m.lm) * (va - m.rs * isa - sigma * Ls * disa), eb = (Lr / m.lm) * (vb - m.rs * isb - sigma * Ls * disb);
      pva += (ea - wc * pva) * dt; pvb += (eb - wc * pvb) * dt;
      const wr = m.pp * wHat;
      const fa = (m.lm / tr) * isa - pia / tr - wr * pib, fb = (m.lm / tr) * isb - pib / tr + wr * pia;
      // The current model is stable on its own (its pole is the rotor's 1/τr), so it needs no filter.
      pia += fa * dt; pib += fb * dt;
      // The voltage model's low-pass is the true flux through s/(s + ωc): pass the current model through the same.
      lpa += wc * (pia - lpa) * dt; lpb += wc * (pib - lpb) * dt;
      const ha = pia - lpa, hb = pib - lpb;
      const err = pvb * ha - pva * hb, scale = 1 / Math.max(psiR * psiR, 1e-6);
      xm += 3e4 * err * scale * dt;
      wHat = (300 * err * scale + xm) / m.pp;
    }
    isaPrev = isa; isbPrev = isb;
    // The machine.
    psa += (va - m.rs * isa) * dt; psb += (vb - m.rs * isb) * dt;
    const wr = m.pp * wm;
    pra += (-m.rr * ira - wr * prb) * dt; prb += (-m.rr * irb + wr * pra) * dt;
    wm += ((Te - c.load(t) - m.B * wm) / m.J) * dt;
    out.t[n] = t; out.speed[n] = wm; out.torque[n] = Te; out.ia[n] = isa; out.flux[n] = Math.hypot(pra, prb); out.estimate[n] = wHat;
  }
  return out;
}

/** The steady-state torque–speed curve on a sine supply (the equivalent circuit, Thévenin form): torque at each slip. */
export function torqueSpeed(m: Induction, slips: number[], vll = m.vll, f = m.f) {
  const ws = (2 * Math.PI * f) / m.pp, w = 2 * Math.PI * f, xs = w * m.lls, xr = w * m.llr, xm = w * m.lm, vph = vll / Math.sqrt(3);
  // Thévenin of the stator and magnetising branch.
  const zr = m.rs, zi = xs + xm, den = zr * zr + zi * zi;
  const vth = (vph * xm) / Math.hypot(m.rs, xs + xm);
  const rth = (m.rs * xm * xm) / den, xth = (xm * (m.rs * m.rs + xs * (xs + xm))) / den;
  return slips.map((s) => (3 * vth * vth * (m.rr / s)) / (ws * ((rth + m.rr / s) ** 2 + (xth + xr) ** 2)));
}

// ——— The six-pulse rectifier ———
export interface Rect { vll: number; f: number; Ld: number; C: number; R: number; cycles: number }
export const RECT: Rect = { vll: 400, f: 50, Ld: 5e-3, C: 1000e-6, R: 50, cycles: 10 };
/** A three-phase diode bridge feeding a DC choke and capacitor with a resistive load (ideal diodes, no source
 *  inductance: the phase highest takes the current out, the lowest brings it back). Its line current's harmonics
 *  (fundamental = 1), THD and power factor over the last cycle. */
export function rectifier3(p: Rect) {
  const steps = 400, dt = 1 / (p.f * steps), N = steps * p.cycles, vpk = (p.vll * Math.SQRT2) / Math.sqrt(3), w = 2 * Math.PI * p.f;
  if (!(p.Ld > 0 && p.C > 0 && p.R > 0)) throw new Error('The rectifier needs a choke, a capacitor and a load (all above 0).');
  // Each sample is cut into enough steps for the choke and capacitor's own resonance.
  const sub = Math.max(1, Math.ceil((20 * dt) / Math.sqrt(p.Ld * p.C))), h = dt / sub;
  let id = 0, v = 0;
  const ia: number[] = [], vaS: number[] = [], vdc = new Float64Array(N), idS = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let ph: number[] = [0, 0, 0], hi = 0, lo = 0;
    for (let k = 0; k < sub; k++) {
      const t = n * dt + k * h;
      ph = [0, -2 * Math.PI / 3, 2 * Math.PI / 3].map((o) => vpk * Math.sin(w * t + o));
      hi = Math.max(...ph); lo = Math.min(...ph);
      id = Math.max(0, id + ((hi - lo - v) / p.Ld) * h);
      v += ((id - v / p.R) / p.C) * h;
    }
    vdc[n] = v; idS[n] = id;
    if (n >= N - steps) { ia.push(ph[0] === hi ? id : ph[0] === lo ? -id : 0); vaS.push(ph[0]); }
  }
  const harm = (h: number) => { let a = 0, b = 0; ia.forEach((x, i) => { const g = (2 * Math.PI * h * i) / steps; a += x * Math.cos(g); b += x * Math.sin(g); }); return (2 / steps) * Math.hypot(a, b); };
  const i1 = harm(1), hs = Array.from({ length: 25 }, (_, k) => harm(k + 1) / i1);
  const thd = Math.sqrt(hs.slice(1).reduce((s, x) => s + x * x, 0));
  const irms = Math.sqrt(ia.reduce((s, x) => s + x * x, 0) / steps), vrms = vpk / Math.SQRT2;
  const preal = vaS.reduce((s, x, i) => s + x * ia[i], 0) / steps;
  return { vdc, id: idS, ia: Float64Array.from(ia), harmonics: hs, thd, pf: preal / (vrms * irms), vmean: vdc.slice(N - steps).reduce((s, x) => s + x, 0) / steps };
}
