import type { Analog } from './ibis-analog';

// The channel driven and received by the chips' own buffers, in time (M585, the owner, 27 Nov: "do all of this" on
// M583's left-outs: the buffers' non-linear behaviour and the echoes between mismatched ends). As IBIS-AMI tools do,
// the analog channel is characterised by its step responses: the transmitter's [Pull-up] / [Pull-down] tables switched
// over its [Ramp] (rising: the pull-up turning on as the pull-down turns off, falling the reverse), its clamps, C_comp
// and package; the channel as its scattering responses (s11, s12, s21, s22 per sample), so whatever an end reflects
// travels back and forth; the receiver's clamps (its termination), C_comp and package; the receiver's pad voltage the
// result. Each step solved implicitly (backward Euler): the line seen from a pin is a conductance and a current from
// what is already travelling; the pad's voltage found by Newton's method on the buffer's curve (bisection if it
// stalls). The impulse response is the average of the rising and the falling edge's (the AMI flows are linear), both
// kept so their difference can be shown.

export interface Ports { s11: number[]; s12: number[]; s21: number[]; s22: number[] }

/** An I-V table read at v (linear between rows, the end segments carried on); 0 for an empty table. */
export function iv(t: number[][], v: number) {
  if (!t.length) return 0;
  if (t.length === 1) return t[0][1];
  let i = 1;
  while (i < t.length - 1 && t[i][0] < v) i++;
  const [v0, i0] = t[i - 1], [v1, i1] = t[i];
  return v1 === v0 ? i0 : i0 + ((i1 - i0) * (v - v0)) / (v1 - v0);
}
const sorted = (t: number[][]) => [...t].sort((a, b) => a[0] - b[0]);

/** An ideal end for the side without an IBIS buffer: a transmitter of z0 switching in one sample, or a receiver
 * terminated in z0 to half the supply; 1 V supplies, no pads or package. */
export function idealEnd(z0: number, role: 'tx' | 'rx'): Analog {
  // currents into the pin: a resistor to ground sinks I = V / r; one to the supply (its tables read from the supply)
  // sources, I = −V / r
  const line = (r: number) => [[-10, -10 / r], [10, 10 / r]], up = (r: number) => line(-r), tx = role === 'tx';
  return { type: 'ideal', corner: 'typ', rs: z0, rt: z0, cComp: 0, rPkg: 0, lPkg: 0, cPkg: 0, rise: 0, fall: 0, vcc: 1, pu: tx ? up(z0) : [], pd: tx ? line(z0) : [], gc: tx ? [] : line(2 * z0), pc: tx ? [] : up(2 * z0), notes: [] };
}

interface End { a: Analog; pu: number[][]; pd: number[][]; gc: number[][]; pc: number[][] }
/** The current the buffer pushes into its pad at pad voltage v (IBIS counts currents into the pin: hence the minus),
 * its driver's pull-up and pull-down weighted ku and kd. */
const push = (e: End, v: number, ku: number, kd: number) => -(ku * iv(e.pu, e.a.vcc - v) + kd * iv(e.pd, v) + iv(e.gc, v) + iv(e.pc, e.a.vcc - v));

/** One pin's state after a step: pad voltage vd, package current il, pin voltage vp. */
interface St { vd: number; il: number; vp: number }
/**
 * One end over one step of dt (dt = Infinity: the steady state): the line at the pin a conductance g and a current j
 * (I into the line = g·vp − j), the package's L and R from pad to pin, C_pkg at the pin, C_comp at the pad.
 */
function solveEnd(e: End, prev: St, dt: number, g: number, j: number, ku: number, kd: number): St {
  const cc = e.a.cComp / dt, cl = e.a.lPkg / dt, cp = e.a.cPkg / dt;
  const p1 = 1 / (cp + g), p0 = (j + cp * prev.vp) * p1;               // vp = p1·il + p0
  const al = 1 / (cl + e.a.rPkg + p1), be = (cl * prev.il - p0) * al;   // il = al·vd + be
  const F = (v: number) => cc * (v - prev.vd) - push(e, v, ku, kd) + al * v + be;
  let v = prev.vd, ok = false;
  for (let it = 0; it < 40; it++) {
    const f = F(v), d = (F(v + 1e-6) - f) / 1e-6;
    if (!(Math.abs(d) > 1e-15)) break;
    const nv = v - f / d;
    if (Math.abs(nv - v) < 1e-12) { v = nv; ok = true; break; }
    v = nv;
  }
  if (!ok || !Number.isFinite(v) || Math.abs(F(v)) > 1e-9) {
    let lo = -10 * (e.a.vcc + 1), hi = 10 * (e.a.vcc + 1);
    for (let it = 0; it < 200 && hi - lo > 1e-13; it++) { const m = (lo + hi) / 2; if (Math.sign(F(m)) === Math.sign(F(lo))) lo = m; else hi = m; }
    v = (lo + hi) / 2;
  }
  const il = al * v + be;
  return { vd: v, il, vp: p1 * il + p0 };
}

/** Index of the last sample worth keeping (the rest under 1e-9 of the peak), so the sums skip dead tails. */
const span = (s: number[]) => { const pk = Math.max(...s.map(Math.abs), 1e-300); let n = s.length; while (n > 1 && Math.abs(s[n - 1]) < 1e-9 * pk) n--; return n; };

/**
 * The receiver's pad voltage over n samples after an edge (rising or falling) of the transmitter, from the steady
 * state before it: the step response, in volts.
 */
function edge(p: Ports, n: number, dt: number, z0: number, tx: End, rx: End, rising: boolean): number[] {
  const s11 = p.s11.slice(0, span(p.s11)), s22 = p.s22.slice(0, span(p.s22)), s12 = p.s12.slice(0, span(p.s12)), s21 = p.s21.slice(0, span(p.s21));
  const tail = (s: number[]) => { const t = new Array(s.length + 1).fill(0); for (let k = s.length - 1; k >= 0; k--) t[k] = t[k + 1] + s[k]; return t; };
  const T11 = tail(s11), T12 = tail(s12), T21 = tail(s21), T22 = tail(s22), sum = (t: number[]) => t[0];
  const norton = (s0: number, K: number) => ({ g: (1 - s0) / ((1 + s0) * z0), j: (2 * K) / ((1 + s0) * z0) });
  // the steady state before the edge: capacitors open, inductors shorted, the line at DC (its responses summed)
  const k0 = rising ? 0 : 1;
  let st1: St = { vd: 0, il: 0, vp: 0 }, st2: St = { vd: rx.a.vcc / 2, il: 0, vp: rx.a.vcc / 2 }, a1 = 0, a2 = 0;
  for (let it = 0; it < 400; it++) {
    const n1 = norton(sum(T11), sum(T12) * a2);
    st1 = solveEnd(tx, st1, Infinity, n1.g, n1.j, k0, 1 - k0);
    const b1 = a1; a1 = (st1.vp - sum(T12) * a2) / (1 + sum(T11));
    const n2 = norton(sum(T22), sum(T21) * a1);
    st2 = solveEnd(rx, st2, Infinity, n2.g, n2.j, 0, 0);
    const b2 = a2; a2 = (st2.vp - sum(T21) * a1) / (1 + sum(T22));
    if (Math.abs(a1 - b1) + Math.abs(a2 - b2) < 1e-14) break;
  }
  const A1 = new Float64Array(n), A2 = new Float64Array(n), out = new Array(n), v0 = st2.vd, tr = rising ? tx.a.rise : tx.a.fall;
  const conv = (s: number[], T: number[], A: Float64Array, at: number, from: number, dc: number) => {
    let acc = 0; const top = Math.min(s.length - 1, at);
    for (let k = from; k <= top; k++) acc += s[k] * A[at - k];
    return acc + (at + 1 < T.length ? T[at + 1] * dc : 0);   // before the edge the waves held their steady values
  };
  const dc1 = a1, dc2 = a2;
  for (let t = 0; t < n; t++) {
    const on = tr > 0 ? Math.min(1, ((t + 1) * dt) / tr) : 1, ku = rising ? on : 1 - on;
    const K1 = conv(s11, T11, A1, t, 1, dc1) + conv(s12, T12, A2, t, 1, dc2) + (s12[0] ?? 0) * (t ? A2[t - 1] : dc2);
    const n1 = norton(s11[0] ?? 0, K1);
    st1 = solveEnd(tx, st1, dt, n1.g, n1.j, ku, 1 - ku);
    A1[t] = (st1.vp - K1) / (1 + (s11[0] ?? 0));
    const K2 = conv(s22, T22, A2, t, 1, dc2) + conv(s21, T21, A1, t, 0, dc1);
    const n2 = norton(s22[0] ?? 0, K2);
    st2 = solveEnd(rx, st2, dt, n2.g, n2.j, 0, 0);
    A2[t] = (st2.vp - K2) / (1 + (s22[0] ?? 0));
    out[t] = st2.vd - v0;
  }
  return out;
}

/**
 * The analog channel's impulse responses (V/s every dt, scaled so an ideal matched pair gives s21 / dt): rising,
 * falling and their average, from the two edges' step responses divided by half the transmitter's supply (what an
 * ideal driver puts on a matched line).
 */
export function analogImpulse(p: Ports, n: number, dt: number, z0: number, txA: Analog, rxA: Analog) {
  const end = (a: Analog): End => ({ a, pu: sorted(a.pu), pd: sorted(a.pd), gc: sorted(a.gc), pc: sorted(a.pc) });
  const tx = end(txA), rx = end(rxA), scale = 1 / ((txA.vcc / 2) * dt);
  const d = (s: number[], sign: number) => s.map((v, k) => sign * (v - (k ? s[k - 1] : 0)) * scale);
  const rise = d(edge(p, n, dt, z0, tx, rx, true), 1), fall = d(edge(p, n, dt, z0, tx, rx, false), -1);
  return { rise, fall, h: rise.map((v, k) => (v + fall[k]) / 2) };
}
