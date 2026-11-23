import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as rb from './robot';

// Hyperion's robot arms in the language (M482): loadrobot, robotDH, getTransform, geometricJacobian, robotIK,
// massMatrix, gravityTorque, velocityProduct, inverseDynamics, forwardDynamics, manipulability, show,
// robotWorkspace, and the rotation helpers (eul2rotm, rotm2eul, eul2tform, tform2eul, trvec2tform, tform2trvec,
// rotm2tform, tform2rotm, axang2rotm, rotm2axang, rotx, roty, rotz). MATLAB keeps an arm in a rigidBodyTree object;
// here an arm is a plain struct (Type 'robot') holding its DH table, and inverse kinematics is the function robotIK.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
/** A row-major r × c list as a matrix (stored column by column). */
export const fromRows = (d: ArrayLike<number>, r: number, c: number): Mat => { const m = mat(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m.d[i + j * r] = d[i * c + j]; return m; };
export const toRows = (m: Mat): number[] => { const o: number[] = []; for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) o.push(m.d[i + j * m.r]); return o; };
const grid = (A: number[][]) => fromRows(A.flat(), A.length, A[0]?.length ?? 0);
const vec = (v: Value | undefined, what: string) => [...toMat(v ?? mat(0, 0), what).d];
const field = (s: Struct, k: string) => { const v = s.f.get(k); if (!v) throw new LabError(`The robot has no ${k}.`); return toMat(v); };

export function robotStruct(arm: rb.Arm): Struct {
  const n = arm.links.length, l = arm.links;
  return { k: 'struct', f: new Map<string, Value>([
    ['Type', str('robot')], ['Name', str(arm.name)], ['NumJoints', num(n)], ['Joints', str(l.map((x) => x.type).join(''))],
    ['DH', fromRows(l.flatMap((x) => [x.a, x.alpha, x.d, x.theta]), n, 4)],
    ['Mass', row(l.map((x) => x.mass))], ['CoM', fromRows(l.flatMap((x) => x.com), n, 3)], ['Inertia', fromRows(l.flatMap((x) => x.inertia), n, 3)],
    ['Limits', fromRows(l.flatMap((x) => x.limits), n, 2)], ['Gravity', row(arm.gravity)], ['Parent', row(l.map((_, i) => rb.parentOf(arm, i) + 1))],
  ]) };
}
/** The arm a struct describes (as robotDH or loadrobot made it). */
export function armOf(v: Value | undefined): rb.Arm {
  if (!v || v.k !== 'struct' || v.f.get('Type')?.k !== 'str' || textOf(v.f.get('Type')!) !== 'robot') throw new LabError("A robot was expected: loadrobot('sixaxis') or robotDH(dh).");
  const dh = field(v, 'DH'), n = dh.r, rows = toRows(dh), J = textOf(v.f.get('Joints') ?? str('R'.repeat(n)));
  const m = field(v, 'Mass').d, com = toRows(field(v, 'CoM')), I = toRows(field(v, 'Inertia')), lim = toRows(field(v, 'Limits')), g = field(v, 'Gravity').d;
  return { name: v.f.get('Name')?.k === 'str' ? textOf(v.f.get('Name')!) : 'robot', gravity: [g[0], g[1], g[2]], links: Array.from({ length: n }, (_, i) => ({
    a: rows[i * 4], alpha: rows[i * 4 + 1], d: rows[i * 4 + 2], theta: rows[i * 4 + 3], type: J[i] === 'P' ? 'P' : 'R',
    mass: m[i] ?? 0, com: [com[i * 3] ?? 0, com[i * 3 + 1] ?? 0, com[i * 3 + 2] ?? 0], inertia: [I[i * 3] ?? 0, I[i * 3 + 1] ?? 0, I[i * 3 + 2] ?? 0],
    limits: [lim[i * 2] ?? -Math.PI, lim[i * 2 + 1] ?? Math.PI], parent: parentAt(v, i),
  })) };
}
/** Link i's parent from a robot struct's Parent row (1-based, 0 the base), checked to come earlier. */
function parentAt(v: Struct, i: number) {
  const P = v.f.get('Parent');
  if (!P) return i - 1;
  const p = Math.round(toMat(P).d[i] ?? i) - 1;
  if (!(p >= -1 && p < i)) throw new LabError('Each link hangs from an earlier one (its Parent is 0 for the base, or a smaller link number).');
  return p;
}
const joints = (arm: rb.Arm, v: Value | undefined, what = 'The joint positions') => {
  const q = vec(v, what);
  if (q.length !== arm.links.length) throw new LabError(`${what} need ${arm.links.length} values, one a joint.`);
  return q;
};
const pose = (v: Value | undefined): rb.T4 => {
  const T = toMat(v ?? mat(0, 0), 'The pose');
  if (T.r === 4 && T.c === 4) return toRows(T);
  if (T.d.length === 3) return rb.tform([1, 0, 0, 0, 1, 0, 0, 0, 1], [T.d[0], T.d[1], T.d[2]]);
  throw new LabError('A pose is a 4 × 4 transform (trvec2tform([x y z]) * eul2tform([z y x])) or a position [x y z].');
};
/** Name–value pairs, keys lower-cased. */
const pairs = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); }
  return o;
};

def('loadrobot', (a) => {
  const name = a[0] ? textOf(a[0]).toLowerCase() : '';
  if (!rb.ARMS[name]) throw new LabError(`loadrobot knows ${Object.keys(rb.ARMS).map((k) => `'${k}'`).join(', ')}.`);
  return [robotStruct(rb.ARMS[name]())];
});
def('robotDH', (a) => {
  const D = toMat(a[0] ?? mat(0, 0), 'The DH table');
  if (D.c < 4 || D.r < 1 || D.r > 12) throw new LabError('robotDH takes a table of 1 to 12 rows [a alpha d theta] (a fifth column: 1 for a sliding joint).');
  const o = pairs(a, 1), n = D.r, rows = toRows(D);
  const opt = (k: string, len: number, d: number) => { const v = o.get(k); if (!v) return new Array<number>(len).fill(d); const m = toRows(toMat(v)); if (m.length !== len) throw new LabError(`'${k}' needs ${len} numbers.`); return m; };
  const mass = opt('mass', n, 1), com = opt('com', 3 * n, 0), I = opt('inertia', 3 * n, 0), lim = o.get('limits') ? opt('limits', 2 * n, 0) : Array.from({ length: 2 * n }, (_, k) => (k % 2 ? Math.PI : -Math.PI)), g = opt('gravity', 3, 0);
  if (!o.get('gravity')) g[2] = -9.81;
  const types = o.get('joints') ? textOf(o.get('joints')!).toUpperCase() : Array.from({ length: n }, (_, i) => (D.c > 4 && rows[i * D.c + 4] ? 'P' : 'R')).join('');
  if (types.length !== n || /[^RP]/.test(types)) throw new LabError("'Joints' is one letter a joint: R turns, P slides ('RRP').");
  // 'Parent': the link each hangs from (0 the base), so an arm can branch; one after another if left out.
  const par = o.get('parent') ? opt('parent', n, 0).map((p) => Math.round(p) - 1) : Array.from({ length: n }, (_, i) => i - 1);
  if (par.some((p, i) => !(p >= -1 && p < i))) throw new LabError("'Parent' gives each link the number of an earlier link it hangs from, 0 for the base.");
  const arm: rb.Arm = { name: o.get('name') ? textOf(o.get('name')!) : 'robot', gravity: [g[0], g[1], g[2]], links: Array.from({ length: n }, (_, i) => ({
    a: rows[i * D.c], alpha: rows[i * D.c + 1], d: rows[i * D.c + 2], theta: rows[i * D.c + 3], type: types[i] as 'R' | 'P',
    mass: mass[i], com: [com[i * 3], com[i * 3 + 1], com[i * 3 + 2]], inertia: [I[i * 3], I[i * 3 + 1], I[i * 3 + 2]], limits: [lim[i * 2], lim[i * 2 + 1]],
    parent: par[i],
  })) };
  return [robotStruct(arm)];
});
def('getTransform', (a) => {
  const arm = armOf(a[0]), q = joints(arm, a[1]), F = rb.frames(arm, q), k = a[2] ? Math.round(toMat(a[2]).d[0]) : arm.links.length;
  if (!(k >= 0 && k <= arm.links.length)) throw new LabError(`getTransform's frame is 0 (the base) to ${arm.links.length} (the tool).`);
  return [fromRows(F[k], 4, 4)];
});
/** Which link is the tool (1-based in the language): the last unless given. */
const tipOf = (arm: rb.Arm, v: Value | undefined) => { if (!v) return arm.links.length - 1; const k = Math.round(toMat(v).d[0]) - 1; if (!(k >= 0 && k < arm.links.length)) throw new LabError(`The tool is link 1 to ${arm.links.length}.`); return k; };
def('geometricJacobian', (a) => { const arm = armOf(a[0]); return [grid(rb.jacobian(arm, joints(arm, a[1]), tipOf(arm, a[2])))]; });
def('manipulability', (a) => { const arm = armOf(a[0]); return [num(rb.manipulability(arm, joints(arm, a[1]), !!(a[2] && textOf(a[2]).toLowerCase() === 'position')))]; });
def('robotIK', (a) => {
  const arm = armOf(a[0]), T = pose(a[1]), q0 = a[2] && toMat(a[2]).d.length ? joints(arm, a[2], 'The first guess') : arm.links.map(() => 0), o = pairs(a, 3);
  // A position alone: only the position counts.
  const posOnly = toMat(a[1] ?? mat(0, 0)).d.length === 3;
  const w = o.get('weights') ? vec(o.get('weights'), 'The weights') : posOnly ? [0, 0, 0, 1, 1, 1] : [1, 1, 1, 1, 1, 1];
  if (w.length !== 6) throw new LabError("'Weights' are six numbers: [orientation x y z, position x y z].");
  const r = rb.ikine(arm, T, q0, w, { tip: tipOf(arm, o.get('endeffector')) });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Iterations', num(r.iterations)], ['PoseErrorNorm', num(r.error)], ['Status', str(r.success ? 'success' : 'best available')]]) };
  return [row(r.q), info];
});
def('massMatrix', (a) => { const arm = armOf(a[0]); return [grid(rb.massMatrix(arm, joints(arm, a[1])))]; });
def('gravityTorque', (a) => { const arm = armOf(a[0]); return [row(rb.gravityTorque(arm, joints(arm, a[1])))]; });
def('velocityProduct', (a) => { const arm = armOf(a[0]); return [row(rb.velocityProduct(arm, joints(arm, a[1]), joints(arm, a[2], 'The joint speeds')))]; });
def('inverseDynamics', (a) => {
  const arm = armOf(a[0]), n = arm.links.length, z = new Array<number>(n).fill(0);
  const q = joints(arm, a[1]), qd = a[2] && toMat(a[2]).d.length ? joints(arm, a[2], 'The joint speeds') : z, qdd = a[3] && toMat(a[3]).d.length ? joints(arm, a[3], 'The joint accelerations') : z;
  return [row(rb.rne(arm, q, qd, qdd))];
});
def('forwardDynamics', (a) => {
  const arm = armOf(a[0]), z = new Array<number>(arm.links.length).fill(0);
  const q = joints(arm, a[1]), qd = a[2] && toMat(a[2]).d.length ? joints(arm, a[2], 'The joint speeds') : z, tau = a[3] && toMat(a[3]).d.length ? joints(arm, a[3], 'The torques') : z;
  return [row(rb.forwardDynamics(arm, q, qd, tau))];
});

/** Draws the arm: links as thick lines between the joints, the tool's axes in red, green and blue. */
export function drawArm(lab: Lab, arm: rb.Arm, q: number[], keep = false) {
  const F = rb.frames(arm, q), P = F.map(rb.origin), reach = arm.links.reduce((s, l) => s + Math.abs(l.a) + Math.abs(l.d) + (l.type === 'P' ? l.limits[1] : 0), 0) || 1;
  if (!keep) call(lab, 'hold', str('off'));
  // Each link from its parent's end (an arm that branches draws each branch).
  const X: number[] = [], Y: number[] = [], Z: number[] = [];
  arm.links.forEach((_, i) => { const A = P[rb.parentOf(arm, i) + 1], B = P[i + 1]; X.push(A[0], B[0], NaN); Y.push(A[1], B[1], NaN); Z.push(A[2], B[2], NaN); });
  call(lab, 'plot3', row(X), row(Y), row(Z), str('-o'), str('LineWidth'), num(4), str('Color'), row([0.45, 0.45, 0.5]), str('MarkerSize'), num(7));
  call(lab, 'hold', str('on'));
  // Every tip (a link nothing hangs from) shows its axes.
  const s = reach * 0.12;
  arm.links.forEach((_, i) => {
    if (arm.links.some((__, j) => rb.parentOf(arm, j) === i)) return;
    const T = F[i + 1], o = rb.origin(T);
    ['r', 'g', 'b'].forEach((c, k) => call(lab, 'plot3', row([o[0], o[0] + s * T[k]]), row([o[1], o[1] + s * T[4 + k]]), row([o[2], o[2] + s * T[8 + k]]), str(c), str('LineWidth'), num(2)));
  });
  call(lab, 'plot3', row([0]), row([0]), row([0]), str('ks'), str('MarkerSize'), num(10));
  call(lab, 'hold', str('off'));
  call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)')); call(lab, 'zlabel', str('z (m)'));
  if (arm.gravity[2] !== 0) call(lab, 'view', num(-37.5), num(30)); else call(lab, 'view', num(0), num(90));
}
def('show', (a, _n, lab) => {
  const arm = armOf(a[0]), q = a[1] ? joints(arm, a[1]) : arm.links.map(() => 0);
  drawArm(lab, arm, q);
  call(lab, 'title', str(`${arm.name}: tool at [${rb.origin(rb.fkine(arm, q)).map((v) => v.toFixed(3)).join(' ')}] m`));
  return [];
});
def('checkCollision', (a) => {
  const arm = armOf(a[0]), q = joints(arm, a[1]), o = pairs(a, 2);
  const rowsOf = (k: string, c: number) => { const v = o.get(k); if (!v) return []; const m = toMat(v); if (m.d.length && m.c !== c) throw new LabError(`'${k}' are rows of ${c} numbers.`); return Array.from({ length: m.r }, (_, i) => Array.from({ length: c }, (_, j) => m.d[i + j * m.r])); };
  const rad = o.get('radius') ? [...toMat(o.get('radius')!).d] : undefined;
  const r = rb.checkCollision(arm, q, { radius: rad && rad.length === 1 ? rad[0] : rad, spheres: rowsOf('spheres', 4), boxes: rowsOf('boxes', 6), self: o.get('self') ? !!toMat(o.get('self')!).d[0] : true });
  const pairsMat = (p: [number, number][]) => fromRows(p.flatMap(([x, y]) => [x + 1, y + 1]), p.length, 2);
  return [mat(1, 1, [r.colliding ? 1 : 0], true), num(r.minDistance), pairsMat(r.self), pairsMat(r.hits)];
});
def('robotWorkspace', (a, nout, lab) => {
  const arm = armOf(a[0]), N = Math.min(20000, Math.max(10, Math.round(a[1] ? toMat(a[1]).d[0] : 3000)));
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const P = Array.from({ length: N }, () => rb.origin(rb.fkine(arm, arm.links.map((l) => l.limits[0] + rnd() * (l.limits[1] - l.limits[0])))));
  const M = fromRows(P.flat(), N, 3);
  if (nout > 0) return [M];
  call(lab, 'scatter3', row(P.map((p) => p[0])), row(P.map((p) => p[1])), row(P.map((p) => p[2])), num(4), str('filled'));
  call(lab, 'axis', str('equal')); call(lab, 'grid', str('on')); call(lab, 'title', str(`Where ${arm.name}'s tool can reach (${N} random poses)`));
  return [];
});

// ——— Rotations and transforms ———
const R3 = (v: Value | undefined, what = 'The rotation') => { const m = toMat(v ?? mat(0, 0), what); if (m.r !== 3 || m.c !== 3) throw new LabError(`${what} must be 3 × 3.`); return toRows(m); };
const T4m = (v: Value | undefined) => { const m = toMat(v ?? mat(0, 0), 'The transform'); if (m.r !== 4 || m.c !== 4) throw new LabError('The transform must be 4 × 4.'); return toRows(m); };
const seqOf = (v: Value | undefined) => { const s = v ? textOf(v).toUpperCase() : 'ZYX'; if (!['ZYX', 'XYZ', 'ZYZ'].includes(s)) throw new LabError("The sequence is 'ZYX' (the default), 'XYZ' or 'ZYZ'."); return s; };
const three = (v: Value | undefined, what: string): [number, number, number] => { const d = vec(v, what); if (d.length !== 3) throw new LabError(`${what} needs three numbers.`); return [d[0], d[1], d[2]]; };
def('eul2rotm', (a) => [fromRows(rb.eul2rotm(three(a[0], 'The Euler angles'), seqOf(a[1])), 3, 3)]);
def('eul2tform', (a) => [fromRows(rb.tform(rb.eul2rotm(three(a[0], 'The Euler angles'), seqOf(a[1])), [0, 0, 0]), 4, 4)]);
def('rotm2eul', (a) => [row(rb.rotm2eul(R3(a[0]), seqOf(a[1])))]);
def('tform2eul', (a) => [row(rb.rotm2eul(rb.rot(T4m(a[0])), seqOf(a[1])))]);
def('trvec2tform', (a) => [fromRows(rb.tform([1, 0, 0, 0, 1, 0, 0, 0, 1], three(a[0], 'The position')), 4, 4)]);
def('tform2trvec', (a) => [row(rb.origin(T4m(a[0])))]);
def('rotm2tform', (a) => [fromRows(rb.tform(R3(a[0]), [0, 0, 0]), 4, 4)]);
def('tform2rotm', (a) => [fromRows(rb.rot(T4m(a[0])), 3, 3)]);
def('axang2rotm', (a) => { const v = vec(a[0], 'The axis and angle'); if (v.length !== 4) throw new LabError('axang2rotm takes [x y z angle].'); return [fromRows(rb.axang2rotm([v[0], v[1], v[2]], v[3]), 3, 3)]; });
def('rotm2axang', (a) => { const e = rb.axisAngle(R3(a[0])), ang = Math.hypot(...e); return [row(ang ? [e[0] / ang, e[1] / ang, e[2] / ang, ang] : [0, 0, 1, 0])]; });
const rotDeg = (k: 0 | 1 | 2): Builtin => (a) => { const t = (toMat(a[0] ?? num(0)).d[0] * Math.PI) / 180, e: [number, number, number] = [0, 0, 0]; e[2 - k] = t; return [fromRows(rb.eul2rotm(e, 'ZYX'), 3, 3)]; };
def('rotx', rotDeg(0)); def('roty', rotDeg(1)); def('rotz', rotDeg(2));
