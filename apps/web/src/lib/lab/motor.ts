// Hyperion's mechatronics (M485), pure: a DC motor (its transfer functions and a simulation with a load), a
// permanent-magnet synchronous motor (PMSM, also BLDC driven sinusoidally) in the rotor's dq frame under field-oriented
// control (current PIs with decoupling and a speed PI, the voltage held inside what the DC link can give), the
// Clarke and Park transforms, a gearbox reflected to the motor, and a quadrature encoder.

export interface DcMotor { r: number; l: number; k: number; j: number; b: number }
/** A small 24 V motor: no-load speed about 480 rad/s (4,600 rpm), a mechanical time constant of 10 ms. */
export const DC_DEFAULT: DcMotor = { r: 1.2, l: 0.6e-3, k: 0.05, j: 2e-5, b: 1e-5 };
/** Speed over voltage: K / ((L s + R)(J s + b) + K²), as [numerator, denominator]. */
export const dcSpeedTf = (m: DcMotor): [number[], number[]] => [[m.k], [m.l * m.j, m.r * m.j + m.l * m.b, m.r * m.b + m.k * m.k]];
/** Simulates the motor: v(t) volts in, load(t) N·m against it; RK4 with steps well under its time constants. */
export function dcSimulate(m: DcMotor, v: (t: number) => number, T: number, load: (t: number) => number = () => 0, points = 1000) {
  const tau = Math.min(m.l / m.r, (m.j * m.r) / (m.k * m.k + m.r * m.b)), h = Math.min(tau / 20, T / points), n = Math.ceil(T / h), dt = T / n;
  const f = (t: number, [i, w]: number[]) => [(v(t) - m.r * i - m.k * w) / m.l, (m.k * i - m.b * w - load(t)) / m.j, w];
  let x = [0, 0, 0];
  const every = Math.max(1, Math.floor(n / points)), out = { t: [0], i: [0], w: [0], theta: [0], torque: [0] };
  for (let s = 1; s <= n; s++) {
    const t = (s - 1) * dt, k1 = f(t, x), k2 = f(t + dt / 2, x.map((v_, j) => v_ + (dt / 2) * k1[j])), k3 = f(t + dt / 2, x.map((v_, j) => v_ + (dt / 2) * k2[j])), k4 = f(t + dt, x.map((v_, j) => v_ + dt * k3[j]));
    x = x.map((v_, j) => v_ + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (s % every === 0 || s === n) { out.t.push(s * dt); out.i.push(x[0]); out.w.push(x[1]); out.theta.push(x[2]); out.torque.push(m.k * x[0]); }
  }
  return out;
}

// ——— Transforms (amplitude-invariant) ———
export const clarke = (a: number, b: number, c: number): [number, number] => [(2 * a - b - c) / 3, (b - c) / Math.sqrt(3)];
export const invClarke = (al: number, be: number): [number, number, number] => [al, -al / 2 + (Math.sqrt(3) / 2) * be, -al / 2 - (Math.sqrt(3) / 2) * be];
export const park = (al: number, be: number, th: number): [number, number] => [al * Math.cos(th) + be * Math.sin(th), -al * Math.sin(th) + be * Math.cos(th)];
export const invPark = (d: number, q: number, th: number): [number, number] => [d * Math.cos(th) - q * Math.sin(th), d * Math.sin(th) + q * Math.cos(th)];

// ——— PMSM ———
export interface Pmsm { rs: number; ld: number; lq: number; psi: number; p: number; j: number; b: number; vdc: number; imax: number }
/** A 1 kW-class servo: 4 pole pairs, 0.3 N·m/A, 48 V link, 20 A: about 6 N·m and up to ~1,300 rpm. */
export const PMSM_DEFAULT: Pmsm = { rs: 0.2, ld: 0.5e-3, lq: 0.5e-3, psi: 0.05, p: 4, j: 2e-4, b: 1e-4, vdc: 48, imax: 20 };
export const torqueOf = (m: Pmsm, id: number, iq: number) => 1.5 * m.p * (m.psi * iq + (m.ld - m.lq) * id * iq);
export interface FocGains { kpd: number; kid: number; kpq: number; kiq: number; kps: number; kis: number }
/** Pole–zero cancelling current PIs at `currentBw` rad/s (Kp = L ω, Ki = R ω) and a speed PI at `speedBw` rad/s
 * (Kp = J ω / Kt, Ki = Kp ω / 4). */
export function focTune(m: Pmsm, currentBw = 2 * Math.PI * 500, speedBw = 2 * Math.PI * 20): FocGains {
  const kt = 1.5 * m.p * m.psi, kps = (m.j * speedBw) / kt;
  return { kpd: m.ld * currentBw, kid: m.rs * currentBw, kpq: m.lq * currentBw, kiq: m.rs * currentBw, kps, kis: (kps * speedBw) / 4 };
}
/** Field-oriented control of the PMSM: speed reference ω*(t) (mechanical rad/s) and load torque; id* = 0 (no field
 * weakening). Steps of 20 µs (a 50 kHz controller), the plant integrated with the same steps. */
export function focSimulate(m: Pmsm, wRef: (t: number) => number, T: number, load: (t: number) => number = () => 0, g: FocGains = focTune(m), points = 1500) {
  const dt = 2e-5, n = Math.ceil(T / dt), vmax = m.vdc / Math.sqrt(3), every = Math.max(1, Math.floor(n / points));
  let id = 0, iq = 0, w = 0, th = 0, Id = 0, Iq = 0, Is = 0;
  const out = { t: [0], w: [0], wRef: [wRef(0)], id: [0], iq: [0], vd: [0], vq: [0], torque: [0], ia: [0], ib: [0], ic: [0], power: [0] };
  for (let s = 1; s <= n; s++) {
    const t = (s - 1) * dt, we = m.p * w;
    // The speed loop gives the torque current, kept within the limit (the integrator stops while it is held).
    const es = wRef(t) - w, iqRaw = g.kps * es + Is, iqRef = Math.max(-m.imax, Math.min(m.imax, iqRaw));
    if (iqRaw === iqRef || Math.sign(es) !== Math.sign(iqRaw)) Is += g.kis * es * dt;
    // The current loops, with the cross terms fed forward.
    const ed = 0 - id, eq = iqRef - iq;
    let vd = g.kpd * ed + Id - we * m.lq * iq, vq = g.kpq * eq + Iq + we * (m.ld * id + m.psi);
    const mag = Math.hypot(vd, vq), held = mag > vmax;
    if (held) { vd *= vmax / mag; vq *= vmax / mag; } else { Id += g.kid * ed * dt; Iq += g.kiq * eq * dt; }
    // The motor (semi-implicit Euler: the currents, then the speed with the new torque).
    id += (dt * (vd - m.rs * id + we * m.lq * iq)) / m.ld;
    iq += (dt * (vq - m.rs * iq - we * (m.ld * id + m.psi))) / m.lq;
    const te = torqueOf(m, id, iq);
    w += (dt * (te - m.b * w - load(t))) / m.j;
    th += w * dt;
    if (s % every === 0 || s === n) {
      const [al, be] = invPark(id, iq, m.p * th), [ia, ib, ic] = invClarke(al, be);
      out.t.push(s * dt); out.w.push(w); out.wRef.push(wRef(s * dt)); out.id.push(id); out.iq.push(iq); out.vd.push(vd); out.vq.push(vq); out.torque.push(te);
      out.ia.push(ia); out.ib.push(ib); out.ic.push(ic); out.power.push(1.5 * (vd * id + vq * iq));
    }
  }
  return out;
}

// ——— Gears and encoders ———
/** A load behind a gearbox of ratio N (load turns N times slower) as the motor sees it: inertia and damping over N²,
 * torque over N η. */
export const gearReflect = (j: number, b: number, torque: number, N: number, eta = 1) => ({ j: j / (N * N), b: b / (N * N), torque: torque / (N * eta) });
/** A quadrature encoder of `cpr` lines (4 × cpr counts a turn): the counts, the angle they say, and the speed from
 * the counts over a window of `window` samples (the M method). */
export function encoder(t: number[], theta: number[], cpr: number, window = 1) {
  const per = (4 * cpr) / (2 * Math.PI), counts = theta.map((x) => Math.floor(x * per + 1e-9)), angle = counts.map((c) => c / per);
  const speed = counts.map((c, k) => (k < window ? 0 : (c - counts[k - window]) / per / (t[k] - t[k - window])));
  return { counts, angle, speed };
}
