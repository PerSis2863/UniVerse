import { LabError } from './parse';
import { random } from './builtins';
import { type Lab } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as ph from './physics';
import * as pp from './physics-plus';
import * as pm from './physics-more';
import { call, col, def, lines, need, nums, one, options, optNum, record, row, rows } from './sci-kit';

// Hyperion's physics in the language (M497): projectile, pendulum, pendulumPeriod, doublePendulum, nbody,
// chargedParticle, stringWave, slitPattern, waveField, efield. Our own names (MATLAB has no physics toolbox functions
// like these). Each drawing takes 'At', t: the state at that moment, so a live slider on t (and Sweep) animates it.
// M518: rigidRotation, lensAberration, spotDiagram, realRayTrace, schwarzschildOrbit, lightBending, perihelionShift,
// wavePacket, schrodinger2D, schrodinger3D. M515: bfield, fieldLines, opticsSystem, rayTrace, lensImage, gaussianBeam, lorentzTransform, velocityAdd,
// relativistic, minkowskiDiagram, chargedParticle's 'Relativistic', schrodinger1D, finiteWell, tunneling,
// transmission, rigidBody, collide1d, diskCollisions.

const grid = (Z: number[][]) => { const m = mat(Z.length, Z[0]?.length ?? 0); Z.forEach((r, i) => r.forEach((v, j) => { m.d[i + j * Z.length] = v; })); return m; };
const marker = (lab: Lab, x: number, y: number) => { call(lab, 'hold', str('on')); call(lab, 'plot', num(x), num(y), str('o'), str('MarkerSize'), num(10), str('MarkerFaceColor'), str('r')); call(lab, 'hold', str('off')); };
const steps = (T: number, n = 600) => Array.from({ length: n + 1 }, (_, i) => (i * T) / n);
const atIndex = (t: number[], at: number) => { let k = 0; while (k < t.length - 1 && t[k + 1] <= at) k++; return k; };

def('projectile', (a, nout, lab) => {
  const v0 = need(a[0], 'The launch speed (m/s)'), ang = need(a[1], 'The launch angle (degrees)'), o = options(a, 2, ['Drag', 'Gravity', 'Height', 'At'], 'projectile');
  const k = optNum(o, 'Drag', 0), g = optNum(o, 'Gravity', 9.81), h0 = optNum(o, 'Height', 0);
  if (!(v0 > 0 && ang > -90 && ang < 90 && k >= 0 && g > 0 && h0 >= 0)) throw new LabError("projectile(speed > 0, angle −90…90°, 'Drag' ≥ 0 (1/m), 'Gravity' > 0, 'Height' ≥ 0).");
  if (ang <= 0 && h0 === 0) throw new LabError('From the ground, the angle must be above 0°.');
  const r = ph.projectile(v0, ang, k, g, h0);
  if (nout > 0) return [col(r.x), col(r.y), col(r.t), record([['Range', r.range], ['MaxHeight', r.top], ['FlightTime', r.flight], ['ImpactSpeed', r.impact]])];
  call(lab, 'plot', row(r.x), row(r.y), str('LineWidth'), num(2));
  const labels = [k ? 'With drag' : 'Path'];
  if (k) { const free = ph.projectile(v0, ang, 0, g, h0); call(lab, 'hold', str('on')); call(lab, 'plot', row(free.x), row(free.y), str('--')); call(lab, 'hold', str('off')); labels.push('Without drag'); }
  if (o.has('At')) { const i = atIndex(r.t, optNum(o, 'At', 0)); marker(lab, r.x[i], r.y[i]); }
  call(lab, 'legend', ...labels.map(str)); call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('Distance (m)')); call(lab, 'ylabel', str('Height (m)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Range ${r.range.toFixed(1)} m, top ${r.top.toFixed(1)} m, ${r.flight.toFixed(2)} s in the air`));
  return [];
});
def('pendulumPeriod', (a) => {
  const L = need(a[0], 'The length (m)'), th = toMat(a[1] ?? num(NaN), 'The starting angle (degrees)'), g = a[2] ? need(a[2], 'g') : 9.81;
  if (!(L > 0 && g > 0)) throw new LabError('The length and g must be positive.');
  return [mat(th.r, th.c, [...th.d].map((x) => (Math.abs(x) < 180 ? ph.pendulumPeriod(L, Math.abs(x), g) : Infinity)))];
});
def('pendulum', (a, nout, lab) => {
  const L = need(a[0], 'The length (m)'), th0 = need(a[1], 'The starting angle (degrees)'), T = need(a[2], 'The time (s)'), o = options(a, 3, ['Damping', 'Spin', 'Gravity', 'At'], 'pendulum');
  if (!(L > 0 && T > 0 && T / Math.sqrt(L / 9.81) < 1e5)) throw new LabError('The length and time must be positive (and not millions of swings).');
  const t = steps(T, 1500), s = ph.pendulum(L, th0, t, { damping: optNum(o, 'Damping', 0), omega0: optNum(o, 'Spin', 0), g: optNum(o, 'Gravity', 9.81) }), deg = s.map((y) => (y[0] * 180) / Math.PI);
  if (nout > 0) return [col(t), col(deg), col(s.map((y) => y[1]))];
  if (o.has('At')) {
    const i = atIndex(t, optNum(o, 'At', 0)), th = s[i][0];
    call(lab, 'subplot', num(1), num(2), num(1));
    call(lab, 'plot', row([0, L * Math.sin(th)]), row([0, -L * Math.cos(th)]), str('LineWidth'), num(3)); marker(lab, L * Math.sin(th), -L * Math.cos(th));
    call(lab, 'axis', str('equal')); call(lab, 'xlim', row([-1.1 * L, 1.1 * L])); call(lab, 'ylim', row([-1.1 * L, 1.1 * L])); call(lab, 'title', str(`t = ${t[i].toFixed(2)} s`)); call(lab, 'grid', str('on'));
    call(lab, 'subplot', num(1), num(2), num(2)); call(lab, 'plot', row(t), row(deg)); marker(lab, t[i], deg[i]);
  } else {
    const w = Math.sqrt(optNum(o, 'Gravity', 9.81) / L);
    call(lab, 'plot', row(t), row(deg), str('LineWidth'), num(2)); call(lab, 'hold', str('on')); call(lab, 'plot', row(t), row(t.map((x) => th0 * Math.cos(w * x))), str('--')); call(lab, 'hold', str('off'));
    call(lab, 'legend', str('Exact'), str('Small-angle shortcut'));
  }
  call(lab, 'xlabel', str('Time (s)')); call(lab, 'ylabel', str('Angle (degrees)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Period ${ph.pendulumPeriod(L, Math.min(179.9, Math.abs(th0)), optNum(o, 'Gravity', 9.81)).toFixed(3)} s (shortcut ${(2 * Math.PI * Math.sqrt(L / optNum(o, 'Gravity', 9.81))).toFixed(3)} s)`));
  return [];
});
def('doublePendulum', (a, nout, lab) => {
  const L1 = need(a[0], 'The first rod (m)'), L2 = need(a[1], 'The second rod (m)'), t1 = need(a[2], 'The first angle (degrees)'), t2 = need(a[3], 'The second angle (degrees)'), T = need(a[4], 'The time (s)');
  const o = options(a, 5, ['Masses', 'At'], 'doublePendulum'), m = o.has('Masses') ? nums(o.get('Masses')) : [1, 1];
  if (!(L1 > 0 && L2 > 0 && T > 0 && T <= 600 && m.length === 2 && m.every((x) => x > 0))) throw new LabError("doublePendulum(L1, L2, θ1, θ2, T ≤ 600 s, 'Masses', [m1 m2]).");
  const t = steps(T, Math.min(20000, Math.ceil(T * 200))), r = ph.doublePendulum(m[0], m[1], L1, L2, t1, t2, t);
  const x1 = r.s.map((y) => L1 * Math.sin(y[0])), y1 = r.s.map((y) => -L1 * Math.cos(y[0])), x2 = r.s.map((y, i) => x1[i] + L2 * Math.sin(y[1])), y2 = r.s.map((y, i) => y1[i] - L2 * Math.cos(y[1]));
  if (nout > 0) return [col(t), rows(r.s.map((y) => [(y[0] * 180) / Math.PI, (y[1] * 180) / Math.PI])), col(r.energy)];
  const i = o.has('At') ? atIndex(t, optNum(o, 'At', 0)) : t.length - 1, R = 1.1 * (L1 + L2);
  call(lab, 'plot', row(x2.slice(0, i + 1)), row(y2.slice(0, i + 1)), str('Color'), str('#a1a1aa')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([0, x1[i], x2[i]]), row([0, y1[i], y2[i]]), str('-o'), str('LineWidth'), num(3)); call(lab, 'hold', str('off'));
  call(lab, 'axis', str('equal')); call(lab, 'xlim', row([-R, R])); call(lab, 'ylim', row([-R, R])); call(lab, 'title', str(`Double pendulum, t = ${t[i].toFixed(2)} s`));
  return [];
});
def('nbody', (a, nout, lab) => {
  const m = nums(a[0], 'The masses (kg)'), P = toMat(a[1] ?? num(NaN), 'The positions'), Vv = toMat(a[2] ?? num(NaN), 'The velocities'), T = need(a[3], 'The time (s)'), dt = need(a[4], 'The time step (s)');
  const n = m.length, D = P.c;
  if (!(n >= 1 && n <= 200 && P.r === n && Vv.r === n && Vv.c === D && (D === 2 || D === 3))) throw new LabError('nbody(m, P, V, T, dt): one mass per body, P and V with a row per body (2 or 3 columns), up to 200 bodies.');
  if (!(T > 0 && dt > 0 && T / dt <= 2e6 && (T / dt) * n * n <= 4e8)) throw new LabError('The time and step must be positive, at most 2 million steps (fewer with many bodies).');
  const o = options(a, 5, ['G', 'Softening', 'At'], 'nbody'), steps2 = Math.round(T / dt), every = Math.max(1, Math.ceil(steps2 / 2000));
  const at = (M: typeof P, i: number) => Array.from({ length: D }, (_, k) => M.d[i + k * n]);
  const r = ph.nbody(m, m.map((_, i) => at(P, i)), m.map((_, i) => at(Vv, i)), T, dt, { G: optNum(o, 'G', ph.G_NEWTON), eps: optNum(o, 'Softening', 0), every });
  if (nout > 0) return [col(r.t), rows(r.x.map((s) => s.flat())), col(r.energy)];
  const i = o.has('At') ? atIndex(r.t, optNum(o, 'At', 0)) : r.t.length - 1;
  m.forEach((_, b) => { call(lab, 'plot', row(r.x.slice(0, i + 1).map((s) => s[b][0])), row(r.x.slice(0, i + 1).map((s) => s[b][1]))); if (b === 0) call(lab, 'hold', str('on')); });
  call(lab, 'plot', row(r.x[i].map((p) => p[0])), row(r.x[i].map((p) => p[1])), str('o'), str('MarkerSize'), num(8), str('MarkerFaceColor'), str('r'));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  const drift = Math.abs((r.energy[i] - r.energy[0]) / (r.energy[0] || 1));
  call(lab, 'title', str(`${n} bodies, t = ${r.t[i].toPrecision(3)} s (energy drift ${(100 * drift).toPrecision(2)}%)`));
  return [];
});
def('chargedParticle', (a, nout, lab) => {
  if (a.length < 8) throw new LabError('chargedParticle(q, m, E, B, r0, v0, T, dt): charge (C), mass (kg), fields E (V/m) and B (T) as [x y z], start and velocity, time and step.');
  const q = need(a[0], 'The charge'), m = need(a[1], 'The mass'), v3 = (v: Value, w: string) => { const x = nums(v, w); if (x.length !== 3) throw new LabError(`${w} is [x y z].`); return x; };
  const E = v3(a[2], 'E'), B = v3(a[3], 'B'), r0 = v3(a[4], 'The start'), v0 = v3(a[5], 'The velocity'), T = need(a[6], 'The time'), dt = need(a[7], 'The step');
  if (!(m > 0 && T > 0 && dt > 0 && T / dt <= 2e6)) throw new LabError('The mass, time and step must be positive, at most 2 million steps.');
  const rel = one(options(a, 8, ['Relativistic'], 'chargedParticle').get('Relativistic'), 0) !== 0;
  let r: { t: number[]; r: number[][] };
  try { r = rel ? pp.relativisticParticle(q, m, E, B, r0, v0, T, dt) : ph.chargedParticle(q, m, E, B, r0, v0, T, dt); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  if (nout > 0) return [col(r.t), rows(r.r)];
  const every = Math.max(1, Math.floor(r.r.length / 4000)), pts = r.r.filter((_, i) => i % every === 0);
  call(lab, 'plot3', row(pts.map((p) => p[0])), row(pts.map((p) => p[1])), row(pts.map((p) => p[2])), str('LineWidth'), num(1.5));
  call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)')); call(lab, 'zlabel', str('z (m)')); call(lab, 'grid', str('on')); call(lab, 'title', str('A charge in electric and magnetic fields'));
  return [];
});
def('stringWave', (a, nout, lab) => {
  const L = need(a[0], 'The length (m)'), c = need(a[1], 'The wave speed (m/s)'), p = need(a[2], 'Where it is plucked (0–1)'), h = need(a[3], 'The height of the pluck (m)'), t = need(a[4], 'The time (s)');
  const o = options(a, 5, ['Modes', 'Damping'], 'stringWave'), modes = Math.round(optNum(o, 'Modes', 200));
  if (!(L > 0 && c > 0 && p > 0 && p < 1 && modes >= 1 && modes <= 5000)) throw new LabError('stringWave(L, c, pluck 0–1, h, t): positive length and speed, the pluck inside the string, 1–5,000 modes.');
  const x = steps(L, 400), y = ph.pluckedString(L, c, p, h, x, t, modes, optNum(o, 'Damping', 0));
  if (nout > 0) return [row(x), row(y)];
  call(lab, 'plot', row(x), row(y), str('LineWidth'), num(2)); call(lab, 'ylim', row([-1.2 * Math.abs(h), 1.2 * Math.abs(h)]));
  call(lab, 'xlabel', str('Along the string (m)')); call(lab, 'ylabel', str('Displacement (m)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`t = ${t.toFixed(4)} s; fundamental ${(c / (2 * L)).toFixed(1)} Hz`));
  return [];
});
def('slitPattern', (a, nout, lab) => {
  const lambda = need(a[0], 'The wavelength (m)'), d = need(a[1], 'The slit spacing (m)'), w = need(a[2], 'The slit width (m)'), N = Math.round(need(a[3], 'The number of slits')), D = need(a[4], 'The screen distance (m)');
  if (!(lambda > 0 && d > 0 && w > 0 && N >= 1 && N <= 10000 && D > 0)) throw new LabError('slitPattern(λ, d, width, N, D): all positive, 1 to 10,000 slits.');
  const x = a[5] ? nums(a[5], 'The screen positions') : steps(8 * (lambda * D) / w, 2000).map((v) => v - (4 * lambda * D) / w), I = ph.slits(lambda, d, w, N, D, x);
  if (nout > 0) return [row(I), row(x)];
  call(lab, 'plot', row(x.map((v) => v * 1000)), row(I), str('LineWidth'), num(1.5)); call(lab, 'xlabel', str('Position on the screen (mm)')); call(lab, 'ylabel', str('Relative intensity')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${N} slit${N > 1 ? 's' : ''}: bright fringes every ${((lambda * D) / d * 1000).toPrecision(3)} mm`));
  return [];
});
def('waveField', (a, nout, lab) => {
  const S = toMat(a[0] ?? num(NaN), 'The sources'), lambda = need(a[1], 'The wavelength'), f = need(a[2], 'The frequency'), X = nums(a[3], 'x'), Y = nums(a[4], 'y'), t = a[5] ? need(a[5], 'The time') : 0;
  if (S.c < 2 || S.r < 1 || !(lambda > 0) || X.length * Y.length > 1e6) throw new LabError('waveField(sources as rows [x y amplitude phase], λ, f, x, y, t): at most a million points.');
  const src = Array.from({ length: S.r }, (_, i) => Array.from({ length: S.c }, (_, j) => S.d[i + j * S.r])), Z = ph.waveField(src, lambda, f, X, Y, t);
  if (nout > 0) return [grid(Z)];
  call(lab, 'imagesc', row(X), row(Y), grid(Z)); call(lab, 'axis', str('xy')); call(lab, 'axis', str('equal')); call(lab, 'colorbar');
  call(lab, 'title', str(`${S.r} source${S.r > 1 ? 's' : ''}, t = ${t.toPrecision(3)} s`));
  return [];
});
def('efield', (a, nout, lab) => {
  const Q = toMat(a[0] ?? num(NaN), 'The charges'), X = nums(a[1], 'x'), Y = nums(a[2], 'y');
  if (Q.c !== 3 || Q.r < 1 || X.length * Y.length > 250_000) throw new LabError('efield(charges as rows [x y q], x, y): at most 250,000 grid points.');
  const ch = Array.from({ length: Q.r }, (_, i) => [Q.d[i], Q.d[i + Q.r], Q.d[i + 2 * Q.r]]), span = Math.max(X[X.length - 1] - X[0], Y[Y.length - 1] - Y[0]);
  const r = ph.pointCharges(ch, X, Y, nout > 0 ? 0 : span / 60);
  if (nout > 0) return [grid(r.Ex), grid(r.Ey), grid(r.V)];
  // The potential's contours clipped to its middle 90%, and arrows of equal length showing the field's direction.
  const vs = r.V.flat().filter(Number.isFinite).sort((p, q) => p - q), lo = vs[Math.floor(vs.length * 0.05)], hi = vs[Math.floor(vs.length * 0.95)];
  call(lab, 'contour', row(X), row(Y), grid(r.V.map((rr) => rr.map((v) => Math.min(hi, Math.max(lo, v))))), num(20)); call(lab, 'hold', str('on'));
  const sx = Math.max(1, Math.floor(X.length / 20)), sy = Math.max(1, Math.floor(Y.length / 20)), qx: number[] = [], qy: number[] = [], qu: number[] = [], qv: number[] = [];
  for (let i = 0; i < Y.length; i += sy) for (let j = 0; j < X.length; j += sx) { const u = r.Ex[i][j], v = r.Ey[i][j], s = Math.hypot(u, v); if (s > 0 && Number.isFinite(s)) { qx.push(X[j]); qy.push(Y[i]); qu.push(u / s); qv.push(v / s); } }
  call(lab, 'quiver', row(qx), row(qy), row(qu), row(qv), num(0.5));
  call(lab, 'plot', row(ch.filter((c) => c[2] > 0).map((c) => c[0])), row(ch.filter((c) => c[2] > 0).map((c) => c[1])), str('ro'), str('MarkerFaceColor'), str('r'));
  call(lab, 'plot', row(ch.filter((c) => c[2] < 0).map((c) => c[0])), row(ch.filter((c) => c[2] < 0).map((c) => c[1])), str('bo'), str('MarkerFaceColor'), str('b'));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'title', str('Field direction and equipotentials (red +, blue −)'));
  return [];
});

// ——— M515 ———
const wrap = <T>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(e instanceof Error ? e.message : String(e)); } };
const rowsOf = (v: Value | undefined, c: number, what: string) => {
  const M = toMat(v ?? mat(0, 0), what);
  if (M.c !== c || M.r < 1) throw new LabError(`${what} is rows of ${c} numbers.`);
  return Array.from({ length: M.r }, (_, i) => Array.from({ length: c }, (_, j) => M.d[i + j * M.r]));
};
const draw3 = (lab: Lab, pts: number[][], spec: string, width = 1) => call(lab, 'plot3', row(pts.map((p) => p[0])), row(pts.map((p) => p[1])), row(pts.map((p) => p[2])), str(spec), str('LineWidth'), num(width));
function linesFrom(lab: Lab, F: (p: number[]) => number[], seeds: number[][], h: number, box: number, stops: number[][], both: boolean) {
  call(lab, 'hold', str('on'));
  for (const s of seeds) draw3(lab, pp.fieldLine(F, s, h, 3000, box, stops, both), 'b-');
}
def('bfield', (a, nout, lab) => {
  const wire = rowsOf(a[0], 3, 'The wire (points [x y z], m)'), I = need(a[1], 'The current (A)');
  if (wire.length < 2 || wire.length > 20000) throw new LabError('The wire has 2 to 20,000 points.');
  if (nout > 0 || a[2]) {
    const P = rowsOf(a[2], 3, 'The points (rows [x y z])');
    if (P.length * wire.length > 2e7) throw new LabError('Too many points for that wire.');
    return [rows(P.map((p) => pp.biotSavart(wire, I, p)))];
  }
  const lo = [0, 1, 2].map((i) => Math.min(...wire.map((p) => p[i]))), hi = [0, 1, 2].map((i) => Math.max(...wire.map((p) => p[i])));
  const c = lo.map((v, i) => (v + hi[i]) / 2), size = Math.max(...hi.map((v, i) => v - lo[i])) || 1;
  // Seeds along a line from the wire's middle, across its width (a loop's lines then thread it; a straight wire's ring it).
  const near = wire.reduce((b, p) => (Math.hypot(...p.map((v, i) => v - c[i])) < Math.hypot(...b.map((v, i) => v - c[i])) ? p : b), wire[0]);
  const seeds = Array.from({ length: 6 }, (_, k) => c.map((v, i) => v + ((near[i] - v) * (k + 0.5)) / 6 + (i === 0 && near[0] === c[0] && near[1] === c[1] ? (size * (k + 1)) / 20 : 0)));
  draw3(lab, wire, 'r-', 3);
  linesFrom(lab, (p) => pp.biotSavart(wire, I, p), seeds, size / 100, 3 * size + Math.max(...c.map(Math.abs)), [], false);
  call(lab, 'hold', str('off')); call(lab, 'grid', str('on')); call(lab, 'axis', str('equal'));
  call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)')); call(lab, 'zlabel', str('z (m)')); call(lab, 'title', str(`Magnetic field lines of ${I} A (Biot–Savart)`));
  return [];
});
def('fieldLines', (a, nout, lab) => {
  const Q = rowsOf(a[0], 4, 'The charges (rows [x y z q])'), o = options(a, 1, ['Seeds', 'Lines'], 'fieldLines');
  const span = Math.max(1e-9, ...Q.flatMap((p) => Q.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])))), core = span / 50;
  const src = Q.filter((q) => q[3] > 0).length ? Q.filter((q) => q[3] > 0) : Q, n = Math.max(4, Math.min(40, Math.round(optNum(o, 'Lines', 14))));
  // Seeds on a small sphere round each source (a golden-angle spiral).
  const seeds = o.has('Seeds') ? rowsOf(o.get('Seeds'), 3, "'Seeds'") : src.flatMap((q) => Array.from({ length: n }, (_, k) => { const z = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - z * z), th = k * 2.399963; return [q[0] + 1.5 * core * r * Math.cos(th), q[1] + 1.5 * core * r * Math.sin(th), q[2] + 1.5 * core * z]; }));
  const F = (p: number[]) => pp.coulomb3(Q, p, core), sinks = Q.filter((q) => q[3] * (src[0]?.[3] ?? 1) < 0);
  const L = seeds.map((s) => pp.fieldLine((p) => (src[0][3] > 0 ? F(p) : F(p).map((x) => -x)), s, span / 100, 3000, 4 * span + Math.max(...Q.flatMap((q) => q.slice(0, 3).map(Math.abs))), sinks, false));
  if (nout > 0) return [{ k: 'cell', r: 1, c: L.length, d: L.map((l) => rows(l)) }];
  call(lab, 'hold', str('on'));
  for (const l of L) draw3(lab, l, 'b-');
  for (const q of Q) call(lab, 'plot3', num(q[0]), num(q[1]), num(q[2]), str(q[3] > 0 ? 'ro' : 'ko'), str('MarkerSize'), num(10), str('MarkerFaceColor'), str(q[3] > 0 ? 'r' : 'k'));
  call(lab, 'hold', str('off')); call(lab, 'grid', str('on')); call(lab, 'axis', str('equal')); call(lab, 'title', str('Electric field lines in 3D (red +, black −)'));
  return [];
});
const optics = (v: Value | undefined) => { if (v?.k !== 'str') throw new LabError("The system is text: 'd 100; f 50; d 100' (d distance, f thin lens, s R n1 n2 a surface, m R a mirror)."); return wrap(() => pp.parseOptics((v as { v: string }).v)); };
def('opticsSystem', (a, nout, lab) => {
  const s = pp.system(optics(a[0]));
  if (nout === 0) { lab.host.out(`ABCD = [${s.M.map((x) => x.toPrecision(6)).join(' ')}]\nFocal length ${s.efl.toPrecision(6)}, back focal distance ${s.bfl.toPrecision(6)}, front ${s.ffl.toPrecision(6)}\n`); return []; }
  return [num(s.efl), num(s.bfl), num(s.ffl), mat(2, 2, [s.M[0], s.M[2], s.M[1], s.M[3]])];
});
def('rayTrace', (a, nout, lab) => {
  const els = optics(a[0]), o = options(a, 1, ['Heights', 'Angles'], 'rayTrace');
  const h = o.has('Heights') ? nums(o.get('Heights')) : [-1, -0.5, 0, 0.5, 1], an = o.has('Angles') ? nums(o.get('Angles')) : [0];
  const rays = h.flatMap((y) => an.map((t) => [y, t] as [number, number]));
  if (rays.length > 400) throw new LabError('At most 400 rays.');
  const r = pp.traceRays(els, rays);
  if (nout > 0) return [row(r.z), rows(r.ys)];
  lines(lab, r.z, r.ys, [], 'Along the axis', 'Height', 'Rays through the system');
  const top = Math.max(1e-9, ...r.ys.flat().map(Math.abs)) * 1.1;
  call(lab, 'hold', str('on'));
  els.forEach((e, i) => { if (e.kind !== 'd') call(lab, 'plot', row([r.z[i], r.z[i]]), row([-top, top]), str('k-'), str('LineWidth'), num(2)); });
  call(lab, 'plot', row([r.z[0], r.z[r.z.length - 1]]), row([0, 0]), str('k:')); call(lab, 'hold', str('off'));
  return [];
});
def('lensImage', (a, nout, lab) => {
  const f = need(a[0], 'The focal length'), so = need(a[1], 'The object distance'), ho = one(a[2], 1);
  if (!(so > 0) || !f) throw new LabError('The object distance is positive and the focal length not zero (negative: a diverging lens).');
  const im = pp.system([{ kind: 'f', a: f }]).image(so);
  if (nout > 0) return [num(im.si), num(im.mag)];
  const hi = ho * im.mag, far = Math.max(Math.abs(im.si), 2 * Math.abs(f), so) * 1.2;
  // The three rays every textbook draws: parallel then through the focus, through the centre, through the near focus.
  call(lab, 'plot', row([-so, 0, far]), row([ho, ho, ho - (ho / f) * far]), str('b-')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([-so, far]), row([ho, ho - (ho / so) * (so + far)]), str('g-'));
  if (Math.abs(so - f) > 1e-9 * Math.abs(f)) call(lab, 'plot', row([-so, 0, far]), row([ho, hi, hi]), str('m-'));
  if (im.si < 0) call(lab, 'plot', row([im.si, 0]), row([hi, hi]), str('m--'));
  call(lab, 'plot', row([-so, -so]), row([0, ho]), str('k-'), str('LineWidth'), num(3));
  if (Number.isFinite(im.si)) call(lab, 'plot', row([im.si, im.si]), row([0, hi]), str(im.si > 0 ? 'r-' : 'r--'), str('LineWidth'), num(3));
  const top = Math.max(Math.abs(ho), Math.abs(hi)) * 1.3;
  call(lab, 'plot', row([0, 0]), row([-top, top]), str('k-'), str('LineWidth'), num(2)); call(lab, 'plot', row([-far, far]), row([0, 0]), str('k:'));
  call(lab, 'plot', row([-f, f]), row([0, 0]), str('ko')); call(lab, 'hold', str('off'));
  call(lab, 'title', str(Number.isFinite(im.si) ? `Image at ${im.si.toPrecision(4)} (${im.si > 0 ? 'real' : 'virtual'}), magnification ${im.mag.toPrecision(3)}` : 'Object at the focus: the image is at infinity'));
  return [];
});
def('gaussianBeam', (a, nout, lab) => {
  const w0 = need(a[0], 'The waist radius'), lam = need(a[1], 'The wavelength (same unit)'), els = optics(a[2]);
  if (!(w0 > 0 && lam > 0)) throw new LabError('The waist and the wavelength are positive.');
  if (els.some((e) => e.kind === 's' && e.n1 !== e.n2)) throw new LabError('gaussianBeam takes d, f and m elements (in air).');
  const r = pp.gaussianBeam(els, w0, lam);
  if (nout > 0) return [col(r.z), col(r.w), num(r.waistAt), num(r.waistRadius)];
  lines(lab, r.z, [r.w, r.w.map((x) => -x)], [], 'Along the axis', 'Beam radius', `After the last element the waist is ${r.waistRadius.toPrecision(3)} at ${r.waistAt.toPrecision(4)} further on`);
  return [];
});
def('lorentzTransform', (a) => {
  const b = need(a[0], 'β = v/c'), ct = toMat(a[1] ?? num(NaN), 'ct'), x = toMat(a[2] ?? num(NaN), 'x');
  if (!(Math.abs(b) < 1)) throw new LabError('β = v/c is between −1 and 1.');
  if (ct.d.length !== x.d.length) throw new LabError('ct and x have the same size.');
  const out = [...ct.d].map((c, i) => pp.lorentz(b, c, x.d[i]));
  return [mat(ct.r, ct.c, out.map((p) => p[0])), mat(ct.r, ct.c, out.map((p) => p[1]))];
});
def('velocityAdd', (a) => { const u = toMat(a[0] ?? num(NaN), 'u'), v = need(a[1], 'v'), c = one(a[2], pp.C_LIGHT); return [mat(u.r, u.c, [...u.d].map((x) => pp.addVelocity(x, v, c)))]; });
def('relativistic', (a) => {
  const m = need(a[0], 'The mass (kg)'), v = need(a[1], 'The speed (m/s)'), c = pp.C_LIGHT;
  if (!(m >= 0 && Math.abs(v) < c)) throw new LabError('The mass is ≥ 0 and the speed below c.');
  const g = pp.gammaOf(v / c);
  return [record([['Beta', v / c], ['Gamma', g], ['Energy', g * m * c * c], ['RestEnergy', m * c * c], ['Kinetic', (g - 1) * m * c * c], ['Momentum', g * m * v]])];
});
def('minkowskiDiagram', (a, _n, lab) => {
  const b = need(a[0], 'β = v/c'), ev = a[1] ? rowsOf(a[1], 2, 'The events (rows [ct x])') : [];
  if (!(Math.abs(b) < 1)) throw new LabError('β is between −1 and 1.');
  const L = Math.max(3, ...ev.flat().map((v) => Math.abs(v) * 1.3));
  call(lab, 'plot', row([-L, L]), row([0, 0]), str('k-'), str('LineWidth'), num(1.5)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([0, 0]), row([-L, L]), str('k-'), str('LineWidth'), num(1.5));
  call(lab, 'plot', row([-L, L]), row([-L, L]), str('y--')); call(lab, 'plot', row([-L, L]), row([L, -L]), str('y--'));
  call(lab, 'plot', row([-L * b, L * b]), row([-L, L]), str('b-'), str('LineWidth'), num(1.5));
  call(lab, 'plot', row([-L, L]), row([-L * b, L * b]), str('b-'), str('LineWidth'), num(1.5));
  for (const [ct, x] of ev) {
    call(lab, 'plot', num(x), num(ct), str('ro'), str('MarkerFaceColor'), str('r'));
    const [c2, x2] = pp.lorentz(b, ct, x);
    lab.host.out(`Event (ct ${ct}, x ${x}) is at ct' = ${c2.toPrecision(4)}, x' = ${x2.toPrecision(4)} in the moving frame\n`);
  }
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal'));
  call(lab, 'xlabel', str('x')); call(lab, 'ylabel', str('ct')); call(lab, 'title', str(`Black: at rest; blue: moving at ${b}c (γ = ${pp.gammaOf(b).toPrecision(4)}); light dashed`));
  return [];
});
const qOpts = (a: Value[], from: number, name: string, more: string[] = []) => { const o = options(a, from, ['Mass', ...more], name), m = optNum(o, 'Mass', 1); if (!(m > 0)) throw new LabError("'Mass' (in electron masses) is positive."); return { o, m }; };
def('schrodinger1D', (a, nout, lab) => {
  const x = nums(a[0], 'x (nm)'), V = nums(a[1], 'V (eV)'), { o, m } = qOpts(a, 2, 'schrodinger1D', ['States']);
  const n = Math.round(optNum(o, 'States', 5));
  if (x.length < 3 || x.length > 50000 || V.length !== x.length) throw new LabError('x (an even grid in nm, 3 to 50,000 points) and V (eV) of the same length.');
  const dx = x[1] - x[0];
  if (!(dx > 0) || x.some((v, i) => i && Math.abs(v - x[i - 1] - dx) > 1e-6 * dx)) throw new LabError('x is an evenly spaced, rising grid.');
  if (!(n >= 1 && n <= 50)) throw new LabError("'States' is 1 to 50.");
  const r = pp.schrodinger(x, V, m, n);
  if (nout > 0) return [col(r.E), rows(x.map((_, i) => r.psi.map((p) => p[i])))];
  const gap = r.E.length > 1 ? (r.E[r.E.length - 1] - r.E[0]) / (r.E.length - 1) : Math.max(...V) - Math.min(...V) || 1;
  const big = Math.max(...r.psi.flat().map(Math.abs)) || 1, k = (0.4 * gap) / big;
  call(lab, 'plot', row(x), row(V), str('k-'), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  r.E.forEach((E, j) => { call(lab, 'plot', row([x[0], x[x.length - 1]]), row([E, E]), str(':')); call(lab, 'plot', row(x), row(r.psi[j].map((p) => E + k * p)), str('LineWidth'), num(1.5)); });
  call(lab, 'hold', str('off'));
  const top = Math.min(Math.max(...V), r.E[r.E.length - 1] + 1.5 * gap);
  call(lab, 'ylim', row([Math.min(...V) - 0.1 * gap, top])); call(lab, 'xlabel', str('x (nm)')); call(lab, 'ylabel', str('Energy (eV)'));
  call(lab, 'title', str(`Lowest ${r.E.length} states: ${r.E.slice(0, 4).map((e) => e.toPrecision(4)).join(', ')}${r.E.length > 4 ? ', …' : ''} eV`));
  return [];
});
def('finiteWell', (a) => {
  const V0 = need(a[0], 'The depth V0 (eV)'), w = need(a[1], 'The width (nm)'), { m } = qOpts(a, 2, 'finiteWell');
  if (!(V0 > 0 && w > 0)) throw new LabError('The depth and the width are positive.');
  return [row(pp.finiteWell(V0, w, m))];
});
def('tunneling', (a, nout, lab) => {
  const E = nums(a[0], 'The energies (eV)'), V0 = need(a[1], 'The barrier height V0 (eV)'), w = need(a[2], 'The width (nm)'), { m } = qOpts(a, 3, 'tunneling');
  if (!(V0 >= 0 && w > 0)) throw new LabError('The barrier height is ≥ 0 and its width positive.');
  const T = E.map((e) => pp.barrier(e, V0, w, m));
  if (nout > 0 || E.length < 2) return [row(T)];
  lines(lab, E, [T], [], 'Energy (eV)', 'Transmission', `A ${V0} eV barrier ${w} nm wide`); call(lab, 'xline', num(V0), str('--'));
  return [];
});
def('transmission', (a, nout, lab) => {
  const x = nums(a[0], 'x (nm)'), V = nums(a[1], 'V (eV)'), { o, m } = qOpts(a, 2, 'transmission', ['Energies']);
  if (x.length < 2 || x.length > 20000 || V.length !== x.length || x.some((v, i) => i && !(v > x[i - 1]))) throw new LabError('x (rising, nm) and V (eV) of the same length, 2 to 20,000 points.');
  const top = Math.max(...V), E = o.has('Energies') ? nums(o.get('Energies')) : Array.from({ length: 400 }, (_, i) => (1.5 * Math.max(top, 0.01) * (i + 1)) / 400);
  const T = E.map((e) => pp.transmission(x, V, e, m));
  if (nout > 0) return [row(E), row(T)];
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, x, [V], [], 'x (nm)', 'V (eV)', 'The potential');
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, E, [T], [], 'Energy (eV)', 'Transmission', 'How much gets through');
  return [];
});
def('rigidBody', (a, nout, lab) => {
  const I = nums(a[0], 'The principal moments [I1 I2 I3]'), w0 = nums(a[1], 'The angular velocity [w1 w2 w3]'), T = need(a[2], 'The time');
  if (I.length !== 3 || I.some((x) => !(x > 0)) || w0.length !== 3 || !(T > 0)) throw new LabError('rigidBody([I1 I2 I3], [w1 w2 w3], T): positive moments and time.');
  const r = pp.eulerSpin(I, w0, steps(T, 1000));
  if (nout > 0) return [col(r.t), rows(r.w)];
  lines(lab, r.t, [0, 1, 2].map((i) => r.w.map((w) => w[i])), ['ω1', 'ω2', 'ω3'], 'Time', 'Angular velocity', 'A body spinning freely (Euler’s equations)');
  const dE = Math.max(...r.energy) - Math.min(...r.energy), dL = Math.max(...r.L) - Math.min(...r.L);
  lab.host.out(`Energy ${r.energy[0].toPrecision(6)} (drift ${dE.toExponential(1)}), |L| ${r.L[0].toPrecision(6)} (drift ${dL.toExponential(1)})\n`);
  return [];
});
def('collide1d', (a) => {
  const m1 = need(a[0], 'm1'), m2 = need(a[1], 'm2'), u1 = need(a[2], 'u1'), u2 = need(a[3], 'u2'), e = one(a[4], 1);
  if (!(m1 > 0 && m2 > 0 && e >= 0 && e <= 1)) throw new LabError('Masses are positive and the restitution between 0 and 1.');
  return [row(pp.collide1d(m1, m2, u1, u2, e))];
});
def('diskCollisions', (a, nout, lab) => {
  const n = Math.round(need(a[0], 'The number of disks')), o = options(a, 1, ['Box', 'Time', 'Radius', 'Speed', 'Restitution', 'At', 'Mass'], 'diskCollisions');
  const box = o.has('Box') ? nums(o.get('Box')) : [10, 10], T = optNum(o, 'Time', 10), r = optNum(o, 'Radius', 0.3), e = optNum(o, 'Restitution', 1), sp = optNum(o, 'Speed', 1);
  if (!(n >= 1 && n <= 300 && box.length === 2 && box[0] > 2 * r && box[1] > 2 * r && T > 0 && r > 0 && e >= 0 && e <= 1)) throw new LabError("diskCollisions(n): 1 to 300 disks; 'Box' [W H], 'Time', 'Radius', 'Restitution' 0 to 1.");
  // A square lattice start (no overlaps), random directions from the engine's random numbers.
  const per = Math.max(1, Math.floor(Math.min(box[0], box[1]) / (2.2 * r))), cols = Math.min(per, Math.ceil(Math.sqrt(n)));
  if (Math.ceil(n / cols) * 2.2 * r > box[1] || cols * 2.2 * r > box[0]) throw new LabError('Those disks don’t fit in the box.');
  const pos = Array.from({ length: n }, (_, i) => [((i % cols) + 0.5) * (box[0] / cols), (Math.floor(i / cols) + 0.5) * (box[1] / Math.ceil(n / cols))]);
  const vel = pos.map(() => { const th = 2 * Math.PI * random(); return [sp * Math.cos(th), sp * Math.sin(th)]; }), ms = o.has('Mass') ? nums(o.get('Mass')) : [1];
  const mass = pos.map((_, i) => ms[i % ms.length]), at = Math.min(T, Math.max(0, optNum(o, 'At', T)));
  const frames = steps(T, 200).filter((t) => t <= at).concat(at > 0 && !steps(T, 200).includes(at) ? [at] : []).sort((p, q) => p - q);
  const res = wrap(() => pp.disks(pos, vel, new Array(n).fill(r), mass, box[0], box[1], frames, e));
  const last = res.frames[res.frames.length - 1];
  if (nout > 0) return [rows(last), rows(res.velocities), record([['Walls', res.hits.walls], ['Pairs', res.hits.pairs]])];
  const ring = Array.from({ length: 25 }, (_, k) => (2 * Math.PI * k) / 24);
  call(lab, 'plot', row([0, box[0], box[0], 0, 0]), row([0, 0, box[1], box[1], 0]), str('k-'), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  for (let i = 0; i < n; i++) {
    call(lab, 'plot', row(res.frames.map((f) => f[i][0])), row(res.frames.map((f) => f[i][1])), str(':'));
    call(lab, 'plot', row(ring.map((t) => last[i][0] + r * Math.cos(t))), row(ring.map((t) => last[i][1] + r * Math.sin(t))), str('k-'));
  }
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal'));
  call(lab, 'title', str(`t = ${at.toPrecision(3)}: ${res.hits.pairs} collisions between disks, ${res.hits.walls} with the walls`));
  return [];
});

// ——— M518: orientation, real lenses, Schwarzschild, wave packets, 2D and 3D wells ———
const wrapP = <T>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(e instanceof Error ? e.message : String(e)); } };
def('rigidRotation', (a, nout, lab) => {
  const I = nums(a[0], 'The principal moments [I1 I2 I3]'), w0 = nums(a[1], 'The body rates [w1 w2 w3]'), T = need(a[2], 'The time');
  const o = options(a, 3, ['Orientation', 'Gravity', 'Points'], 'rigidRotation'), q0 = o.has('Orientation') ? nums(o.get('Orientation')) : [1, 0, 0, 0], mgl = optNum(o, 'Gravity', 0), n = Math.round(optNum(o, 'Points', 1000));
  if (I.length !== 3 || I.some((x) => !(x > 0)) || w0.length !== 3 || !(T > 0)) throw new LabError('rigidRotation([I1 I2 I3], [w1 w2 w3], T): positive moments and time.');
  if (q0.length !== 4 || !(Math.hypot(...q0) > 0)) throw new LabError("'Orientation' is a quaternion [w x y z] (scalar first).");
  if (!(n >= 10 && n <= 20000)) throw new LabError("'Points' is 10 to 20,000.");
  const r = wrapP(() => pm.spinBody(I, w0, q0, steps(T, n), mgl));
  if (nout > 0) return [col(r.t), rows(r.w), rows(r.q), rows(r.axis), rows(r.L)];
  call(lab, 'plot3', row(r.axis.map((v) => v[0])), row(r.axis.map((v) => v[1])), row(r.axis.map((v) => v[2])), str('LineWidth'), num(1.5));
  call(lab, 'xlabel', str('x')); call(lab, 'ylabel', str('y')); call(lab, 'zlabel', str('z')); call(lab, 'grid', str('on')); call(lab, 'axis', str('equal'));
  call(lab, 'title', str(mgl ? 'The tip of a top: precession and nutation' : 'Where the body\'s third axis points'));
  const dE = Math.max(...r.energy) - Math.min(...r.energy);
  lab.host.out(`Energy ${r.energy[0].toPrecision(6)} (drift ${dE.toExponential(1)})${mgl ? '' : `, L in space [${r.L[0].map((v) => v.toPrecision(5)).join(' ')}]`}\n`);
  return [];
});
const lensOf = (v: Value | undefined): pm.Surface[] => {
  const M = toMat(v ?? mat(0, 0), 'The lens');
  if (!M.r || (M.c !== 3 && M.c !== 4)) throw new LabError('A lens is one row per surface: [radius thickness index] or [radius thickness nd Vd] (mm; Inf for flat; the index after the surface; the last thickness unused).');
  const S = Array.from({ length: M.r }, (_, i) => { const g = (j: number) => M.d[i + j * M.r]; return { R: g(0), t: g(1), n: g(2), V: M.c === 4 ? g(3) : undefined }; });
  if (S.some((s) => s.R === 0 || !(s.n >= 1) || !(s.t >= 0))) throw new LabError('Radii are non-zero (Inf for flat), thicknesses ≥ 0 and indices ≥ 1.');
  return S;
};
def('lensAberration', (a, nout, lab) => {
  const S = lensOf(a[0]), ap = need(a[1], 'The aperture radius (mm)');
  if (!(ap > 0)) throw new LabError('The aperture radius is positive.');
  const h = Array.from({ length: 41 }, (_, i) => (ap * (i + 1)) / 41), lams = [486.13, 587.56, 656.27];
  const fp = lams.map((l) => pm.paraxialFocus(S, ap, l)), sa = h.map((x) => pm.axisCrossing(S, x) - fp[1]);
  if (!Number.isFinite(fp[1])) throw new LabError("This lens doesn't bring parallel light to a focus behind it.");
  if (nout > 0) return [col(h), col(sa), row(fp)];
  call(lab, 'plot', row(sa), row(h), str('LineWidth'), num(2)); call(lab, 'xline', num(0), str(':'));
  call(lab, 'xlabel', str('Where the ray crosses the axis, from the paraxial focus (mm)')); call(lab, 'ylabel', str('Ray height (mm)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Spherical aberration: the edge focuses ${Math.abs(sa[sa.length - 1]).toPrecision(3)} mm ${sa[sa.length - 1] < 0 ? 'short' : 'long'}`));
  lab.host.out(`Paraxial focus ${fp[1].toPrecision(6)} mm after the last surface (blue F ${fp[0].toPrecision(6)}, red C ${fp[2].toPrecision(6)}: colour spreads it ${(fp[2] - fp[0]).toPrecision(3)} mm)\n`);
  return [];
});
def('spotDiagram', (a, nout, lab) => {
  const S = lensOf(a[0]), ap = need(a[1], 'The aperture radius (mm)'), ang = one(a[2], 0), o = options(a, 3, ['Defocus', 'Wavelength', 'Rings'], 'spotDiagram');
  const lam = optNum(o, 'Wavelength', 587.56), fp = pm.paraxialFocus(S, ap, 587.56), rings = Math.round(optNum(o, 'Rings', 10));
  if (!(ap > 0 && Math.abs(ang) < 60 && lam > 200 && lam < 2000 && rings >= 1 && rings <= 40)) throw new LabError("The aperture radius is positive, the field angle under 60°, 'Wavelength' in nm and 'Rings' 1 to 40.");
  const r = pm.spot(S, ap, (ang * Math.PI) / 180, fp + optNum(o, 'Defocus', 0), rings, lam);
  if (nout > 0) return [rows(r.pts.length ? r.pts : [[]]), num(r.rms), row(r.centroid)];
  call(lab, 'plot', row(r.pts.map((p) => p[0] * 1000)), row(r.pts.map((p) => p[1] * 1000)), str('.')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'xlabel', str('x (µm)')); call(lab, 'ylabel', str('y (µm)')); call(lab, 'title', str(`Spot at ${ang}°: RMS radius ${(r.rms * 1000).toPrecision(3)} µm${r.lost ? `, ${r.lost} rays lost` : ''}`));
  return [];
});
def('realRayTrace', (a, _n, lab) => {
  const S = lensOf(a[0]), ap = need(a[1], 'The aperture radius (mm)'), ang = one(a[2], 0), th = (ang * Math.PI) / 180, fp = pm.paraxialFocus(S, ap);
  if (!(ap > 0 && Math.abs(ang) < 60)) throw new LabError('The aperture radius is positive and the field angle under 60°.');
  const rays = Array.from({ length: 11 }, (_, i) => ({ p: [0, ap * (i / 5 - 1) - 10 * Math.tan(th), -10], d: [0, Math.sin(th), Math.cos(th)] })), paths: number[][][] = [];
  const tr = pm.traceSurfaces(S, rays, 587.56, ap * 1.0001, paths), zi = tr.zLast + (Number.isFinite(fp) ? fp : 50);
  call(lab, 'hold', str('on'));
  tr.rays.forEach((r, i) => { const p = paths[i]; if (r && r.d[2] > 0) { const t = (zi - r.p[2]) / r.d[2]; p.push([0, r.p[1] + t * r.d[1], zi]); } call(lab, 'plot', row(p.map((v) => v[2])), row(p.map((v) => v[1])), str('Color'), row([0.15, 0.4, 0.9])); });
  let zv = 0;
  S.forEach((s, k) => {
    const ys = Array.from({ length: 41 }, (_, i) => ap * 1.1 * (i / 20 - 1)), zs = ys.map((y) => (Number.isFinite(s.R) ? zv + s.R - Math.sign(s.R) * Math.sqrt(Math.max(0, s.R * s.R - y * y)) : zv));
    call(lab, 'plot', row(zs), row(ys), str('k'), str('LineWidth'), num(1.5));
    if (k < S.length - 1) zv += s.t;
  });
  call(lab, 'hold', str('off')); call(lab, 'xlabel', str('z (mm)')); call(lab, 'ylabel', str('y (mm)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str('Real rays (Snell\'s law at every surface)'));
  return [];
});
def('schwarzschildOrbit', (a, nout, lab) => {
  const rp = need(a[0], 'The closest distance (in units of GM/c²)'), ra = need(a[1], 'The farthest distance'), n = one(a[2], 3);
  if (!(rp > 2 && ra >= rp && n > 0 && n <= 50)) throw new LabError('schwarzschildOrbit(rClosest, rFarthest, orbits): distances in units of GM/c² (the horizon is at 2), up to 50 orbits.');
  const r = wrapP(() => pm.schwarzschildOrbit(rp, ra, n));
  if (nout > 0) return [col(r.x), col(r.y), num(r.shift), num(r.weak)];
  call(lab, 'plot', row(r.x), row(r.y), str('LineWidth'), num(1.2)); call(lab, 'hold', str('on'));
  const c = Array.from({ length: 121 }, (_, i) => (2 * Math.PI * i) / 120);
  call(lab, 'fill', row(c.map((v) => 2 * Math.cos(v))), row(c.map((v) => 2 * Math.sin(v))), str('k')); call(lab, 'hold', str('off')); call(lab, 'axis', str('equal'));
  call(lab, 'title', str(`The orbit turns ${((r.shift * 180) / Math.PI).toPrecision(4)}° an orbit (weak-field formula ${((r.weak * 180) / Math.PI).toPrecision(4)}°)`));
  return [];
});
def('lightBending', (a, nout, lab) => {
  const b = nums(a[0] ?? row([4, 5.2, 6, 8, 12, 20]), 'The impact parameters (in GM/c²)');
  if (!b.length || b.length > 40 || b.some((x) => !(x > 0))) throw new LabError('Impact parameters are positive (in GM/c²), up to 40.');
  const r = b.map((x) => pm.lightRay(x));
  if (nout > 0) return [row(r.map((x) => x.deflection)), row(r.map((x) => (x.captured ? 1 : 0)))];
  call(lab, 'hold', str('on'));
  r.forEach((x) => { const pts = x.x.map((v, j) => [-v, x.y[j]]).filter((p) => Math.hypot(p[0], p[1]) < 60); call(lab, 'plot', row(pts.map((p) => p[0])), row(pts.map((p) => p[1]))); });
  const c = Array.from({ length: 121 }, (_, i) => (2 * Math.PI * i) / 120);
  call(lab, 'fill', row(c.map((v) => 2 * Math.cos(v))), row(c.map((v) => 2 * Math.sin(v))), str('k'));
  call(lab, 'plot', row(c.map((v) => 3 * Math.cos(v))), row(c.map((v) => 3 * Math.sin(v))), str('k:'));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'xlim', row([-40, 40])); call(lab, 'ylim', row([-30, 30]));
  call(lab, 'title', str('Light passing a black hole: caught inside b = 3√3 ≈ 5.2, bent outside'));
  return [];
});
def('perihelionShift', (a) => {
  const A = need(a[0], 'The semi-major axis (m)'), e = need(a[1], 'The eccentricity'), M = need(a[2], 'The central mass (kg)');
  if (!(A > 0 && e >= 0 && e < 1 && M > 0)) throw new LabError('perihelionShift(a, e, M): a in m, 0 ≤ e < 1, M in kg.');
  return [num(pm.perihelionShift(A, e, M))];
});
def('wavePacket', (a, nout, lab) => {
  const x = nums(a[0], 'x (nm)'), V = nums(a[1], 'V (eV)'), { o, m } = qOpts(a, 2, 'wavePacket', ['X0', 'K0', 'Sigma', 'Times', 'Step']);
  if (x.length < 10 || x.length > 50000 || V.length !== x.length) throw new LabError('x (an even grid in nm, 10 to 50,000 points) and V (eV) of the same length.');
  const dx = x[1] - x[0];
  if (!(dx > 0) || x.some((v, i) => i && Math.abs(v - x[i - 1] - dx) > 1e-6 * dx)) throw new LabError('x is an evenly spaced, rising grid.');
  const x0 = optNum(o, 'X0', x[0] + (x[x.length - 1] - x[0]) / 4), k0 = optNum(o, 'K0', 2), s = optNum(o, 'Sigma', (x[x.length - 1] - x[0]) / 40);
  const speed = (2 * pp.HB2M * Math.abs(k0)) / m / pm.HBAR_EVFS, Tdef = (0.5 * (x[x.length - 1] - x[0])) / Math.max(speed, 1e-6);
  const times = o.has('Times') ? nums(o.get('Times')) : Array.from({ length: 101 }, (_, i) => (Tdef * i) / 100), dt = optNum(o, 'Step', Math.min(0.05, Tdef / 2000));
  if (!(s > 0 && dt > 0) || times.some((t, i) => t < 0 || (i && t < times[i - 1]))) throw new LabError("'Sigma' and 'Step' (fs) are positive; 'Times' rise from 0 (fs).");
  if ((times[times.length - 1] / dt) * x.length > 4e8) throw new LabError('Too many steps for that grid: a larger \'Step\', fewer points or a shorter time.');
  const r = pm.wavePacket(x, V, m, x0, k0, s, times, dt);
  if (nout > 0) return [col(r.t), rows(r.prob)];
  call(lab, 'subplot', num(2), num(1), num(1));
  call(lab, 'imagesc', row(x), row(r.t), rows(r.prob)); call(lab, 'xlabel', str('x (nm)')); call(lab, 'ylabel', str('Time (fs)')); call(lab, 'colorbar');
  call(lab, 'title', str(`|ψ|² over time: starting at ${x0} nm, moving at ${speed.toPrecision(3)} nm/fs`));
  call(lab, 'subplot', num(2), num(1), num(2));
  const last = r.prob[r.prob.length - 1], top = Math.max(...last) || 1, vtop = Math.max(...V.map(Math.abs)) || 1;
  lines(lab, x, [last, V.map((v) => (v / vtop) * top)], ['|ψ|² at the end', 'V (scaled)'], 'x (nm)', 'Probability density (1/nm)', `At ${r.t[r.t.length - 1].toPrecision(3)} fs`);
  return [];
});
function gridOf(v: Value | undefined, name: string) {
  const g = nums(v, name);
  if (g.length < 3 || g.length > 400) throw new LabError(`${name} is an even grid of 3 to 400 points (nm).`);
  const h = g[1] - g[0];
  if (!(h > 0) || g.some((x, i) => i && Math.abs(x - g[i - 1] - h) > 1e-6 * h)) throw new LabError(`${name} is evenly spaced and rising.`);
  return { g, h };
}
function wells(a: Value[], nout: number, lab: Lab, dimsN: 2 | 3) {
  const name = dimsN === 2 ? 'schrodinger2D' : 'schrodinger3D', axes = (dimsN === 2 ? ['x', 'y'] : ['x', 'y', 'z']).map((n, i) => gridOf(a[i], `${n} (nm)`));
  const { o, m } = qOpts(a, dimsN + 1, name, ['States']), k = Math.round(optNum(o, 'States', 4)), [nx, ny, nz] = [axes[0].g.length, axes[1].g.length, axes[2]?.g.length ?? 1];
  const n = nx * ny * nz;
  if (n > (dimsN === 2 ? 90000 : 64000)) throw new LabError(dimsN === 2 ? 'Up to 300 × 300 points.' : 'Up to 40 × 40 × 40 points.');
  if (!(k >= 1 && k <= 20)) throw new LabError("'States' is 1 to 20.");
  // Ours runs x fastest; V comes as meshgrid gives it (rows y, columns x, pages z) or as a function of x, y (, z).
  const V = new Float64Array(n), Vv = a[dimsN];
  if (Vv?.k === 'fn') {
    const X: number[] = [], Y: number[] = [], Z: number[] = [];
    for (let kz = 0; kz < nz; kz++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { X.push(axes[0].g[i]); Y.push(axes[1].g[j]); Z.push(axes[2]?.g[kz] ?? 0); }
    const args = [col(X), col(Y), ...(dimsN === 3 ? [col(Z)] : [])], out = toMat(lab.callFn(Vv, args)[0], 'The potential');
    if (out.d.length !== n) throw new LabError(`The potential function gives ${out.d.length} values for ${n} points: write it elementwise (.^, .*).`);
    V.set(out.d);
  } else {
    const M = toMat(Vv ?? mat(0, 0), 'V (eV)');
    if (M.r !== ny || M.c !== nx || (M.p ?? 1) !== nz) throw new LabError(`V is ${ny} × ${nx}${dimsN === 3 ? ` × ${nz}` : ''} (rows follow y, as meshgrid makes it), or a function @(x, y${dimsN === 3 ? ', z' : ''}).`);
    for (let kz = 0; kz < nz; kz++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[i + nx * (j + ny * kz)] = M.d[j + ny * (i + nx * kz)];
  }
  const r = pm.boundStates(dimsN === 2 ? [nx, ny] : [nx, ny, nz], axes.map((x) => x.h), V, m, k);
  // Back to meshgrid's layout: rows y, columns x (pages z), the states one after another.
  const lay = (psi: number[]) => { const out = new Float64Array(n); for (let kz = 0; kz < nz; kz++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out[j + ny * (i + nx * kz)] = psi[i + nx * (j + ny * kz)]; return out; };
  if (nout > 0) { const all = new Float64Array(n * k); r.psi.forEach((p, s) => all.set(lay(p), s * n)); const P = mat(ny, nx, all); if (dimsN === 3) { delete P.p; P.nd = [nz, k]; } return [col(r.E), P]; }
  const cols = Math.min(k, 3), rws = Math.ceil(Math.min(k, 6) / cols);
  r.psi.slice(0, 6).forEach((p, s) => {
    call(lab, 'subplot', num(rws), num(cols), num(s + 1));
    const L = lay(p), mid = Math.floor(nz / 2), slice = Array.from({ length: nx * ny }, (_, q) => L[q + nx * ny * mid] ** 2);
    call(lab, 'imagesc', row(axes[0].g), row(axes[1].g), mat(ny, nx, slice)); call(lab, 'axis', str('equal')); call(lab, 'axis', str('tight'));
    call(lab, 'title', str(`E${s + 1} = ${r.E[s].toPrecision(4)} eV`));
  });
  lab.host.out(`Lowest ${k} energies (eV): ${r.E.map((e) => e.toPrecision(6)).join(', ')}${dimsN === 3 ? '  (pictures: the middle z slice)' : ''}\n`);
  return [];
}
def('schrodinger2D', (a, nout, lab) => wells(a, nout, lab, 2));
def('schrodinger3D', (a, nout, lab) => wells(a, nout, lab, 3));
