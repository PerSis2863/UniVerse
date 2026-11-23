import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './robot-lab';
import * as rb from './robot';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion robot arms (M482)', () => {
  const two = rb.ARMS.twolink();
  it('forward kinematics of the two-link arm: x = l1 c1 + l2 c12', () => {
    const q = [0.3, 0.7], p = rb.origin(rb.fkine(two, q));
    expect(p[0]).toBeCloseTo(Math.cos(0.3) + Math.cos(1), 12);
    expect(p[1]).toBeCloseTo(Math.sin(0.3) + Math.sin(1), 12);
  });
  it('the mass matrix and gravity torques match the textbook two-link arm (point masses at the tips)', () => {
    const q = [0.4, -1.1], c2 = Math.cos(q[1]), M = rb.massMatrix(two, q), g = rb.gravityTorque(two, q);
    expect(M[0][0]).toBeCloseTo(1 + (1 + 2 * c2 + 1), 10);
    expect(M[0][1]).toBeCloseTo(c2 + 1, 10);
    expect(M[1][0]).toBeCloseTo(c2 + 1, 10);
    expect(M[1][1]).toBeCloseTo(1, 10);
    expect(g[0]).toBeCloseTo(2 * 9.81 * Math.cos(q[0]) + 9.81 * Math.cos(q[0] + q[1]), 10);
    expect(g[1]).toBeCloseTo(9.81 * Math.cos(q[0] + q[1]), 10);
    // Coriolis: h = −m2 l1 l2 s2; τ1 = h(2 q̇1 q̇2 + q̇2²), τ2 = −h q̇1².
    const qd = [0.5, 1.5], h = -Math.sin(q[1]), c = rb.velocityProduct(two, q, qd);
    expect(c[0]).toBeCloseTo(h * (2 * qd[0] * qd[1] + qd[1] ** 2), 10);
    expect(c[1]).toBeCloseTo(-h * qd[0] ** 2, 10);
  });
  it('the Jacobian matches finite differences, and forward dynamics undoes inverse dynamics', () => {
    const arm = rb.ARMS.sixaxis(), q = [0.1, -0.6, 0.9, 0.2, 0.5, -0.3], J = rb.jacobian(arm, q), h = 1e-6;
    for (let j = 0; j < 6; j++) {
      const qp = q.slice(); qp[j] += h;
      const a = rb.origin(rb.fkine(arm, q)), b = rb.origin(rb.fkine(arm, qp));
      for (let k = 0; k < 3; k++) expect(J[3 + k][j]).toBeCloseTo((b[k] - a[k]) / h, 4);
    }
    const qd = [0.3, -0.2, 0.5, 1, -1, 0.4], qdd = [1, 2, -1, 0.5, 0.2, -2], tau = rb.rne(arm, q, qd, qdd);
    rb.forwardDynamics(arm, q, qd, tau).forEach((v, i) => expect(v).toBeCloseTo(qdd[i], 8));
    // The mass matrix is symmetric and positive.
    const M = rb.massMatrix(arm, q);
    for (let i = 0; i < 6; i++) { expect(M[i][i]).toBeGreaterThan(0); for (let j = 0; j < 6; j++) expect(M[i][j]).toBeCloseTo(M[j][i], 9); }
  });
  it('inverse kinematics finds a pose it was given, and a prismatic joint slides', () => {
    const arm = rb.ARMS.sixaxis(), want = [0.4, -0.8, 1.0, 0.3, 0.6, 0.2], T = rb.fkine(arm, want), r = rb.ikine(arm, T, [0, 0, 0, 0, 0, 0]);
    expect(r.success).toBe(true);
    const got = rb.fkine(arm, r.q);
    T.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 5));
    const sc = rb.ARMS.scara(), p0 = rb.origin(rb.fkine(sc, [0, 0, 0, 0])), p1 = rb.origin(rb.fkine(sc, [0, 0, 0.1, 0]));
    expect(p0[2] - p1[2]).toBeCloseTo(0.1, 12); // the quill goes down (frame 2 is flipped)
  });
  it('rotations: ZYX angles round trip, rotz by degrees', () => {
    const e: [number, number, number] = [0.3, -0.4, 1.2], back = rb.rotm2eul(rb.eul2rotm(e));
    back.forEach((v, i) => expect(v).toBeCloseTo(e[i], 12));
    const { d } = run("R = rotz(90); T = trvec2tform([1 2 3])*eul2tform([pi/2 0 0]); p = tform2trvec(T); E = rotm2eul(tform2rotm(T)); ax = rotm2axang(axang2rotm([0 0 1 0.5]));");
    expect(d('R').map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 0, -1, 0, 0, 0, 0, 1]);
    expect(d('p')).toEqual([1, 2, 3]);
    expect(d('E')[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(d('ax')[3]).toBeCloseTo(0.5, 12);
  });
  it('in the language: loadrobot, getTransform, robotIK, the dynamics and show', () => {
    const { d, graphics } = run("r = loadrobot('twolink'); T = getTransform(r, [0 pi/2]); [q, info] = robotIK(r, [1 1 0], [0.2 0.2]); p = tform2trvec(getTransform(r, q)); M = massMatrix(r, [0 0]); g = gravityTorque(r, [0 0]); a = forwardDynamics(r, [0 0], [0 0], g); show(r, q)\nmine = robotDH([1 0 0 0; 1 0 0 0], 'Mass', [1 1], 'Gravity', [0 -9.81 0]); g2 = gravityTorque(mine, [0 0]);");
    expect(d('T')[12]).toBeCloseTo(1, 12); // x of the tool
    expect(d('T')[13]).toBeCloseTo(1, 12);
    expect(d('p')[0]).toBeCloseTo(1, 5); expect(d('p')[1]).toBeCloseTo(1, 5);
    expect(d('M')).toEqual([5, 2, 2, 1].map((v) => expect.closeTo(v, 10)));
    expect(d('a').every((v) => Math.abs(v) < 1e-9)).toBe(true);
    expect(d('g2')).toEqual(d('g'));
    expect(graphics.current).toBeTruthy();
  });
});
