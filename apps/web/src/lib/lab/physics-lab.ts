import { LabError } from './parse';
import { type Lab } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as ph from './physics';
import { call, col, def, need, nums, options, optNum, record, row, rows } from './sci-kit';

// Hyperion's physics in the language (M497): projectile, pendulum, pendulumPeriod, doublePendulum, nbody,
// chargedParticle, stringWave, slitPattern, waveField, efield. Our own names (MATLAB has no physics toolbox functions
// like these). Each drawing takes 'At', t: the state at that moment, so a live slider on t (and Sweep) animates it.

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
  const r = ph.chargedParticle(q, m, E, B, r0, v0, T, dt);
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
