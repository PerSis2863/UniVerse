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
  it('an arm that branches: each tip has its own Jacobian, dynamics stay consistent, the arms mirror', () => {
    const arm = rb.ARMS.dualarm(), q = [0.2, 0.3, -0.5, 0.4, -0.3, 0.5, -0.4];
    for (const tip of [3, 6]) {
      const J = rb.jacobian(arm, q, tip), h = 1e-6, other = tip === 3 ? [4, 5, 6] : [1, 2, 3];
      for (let j = 0; j < 7; j++) {
        const qp = q.slice(); qp[j] += h;
        const a = rb.origin(rb.fkine(arm, q, tip)), b = rb.origin(rb.fkine(arm, qp, tip));
        for (let k = 0; k < 3; k++) expect(J[3 + k][j]).toBeCloseTo((b[k] - a[k]) / h, 4);
      }
      for (const j of other) expect(J.every((r) => r[j] === 0)).toBe(true);
    }
    const qd = [0.3, -0.2, 0.5, 1, -1, 0.4, 0.2], qdd = [1, 2, -1, 0.5, 0.2, -2, 1], tau = rb.rne(arm, q, qd, qdd);
    rb.forwardDynamics(arm, q, qd, tau).forEach((v, i) => expect(v).toBeCloseTo(qdd[i], 8));
    // The waist carries both arms: held level and mirrored, the arms' gravity torques are equal and opposite.
    const g = rb.gravityTorque(arm, [0, 0, 0.3, 0.2, 0, -0.3, -0.2]);
    expect(g[2]).toBeCloseTo(-g[5], 9); expect(g[3]).toBeCloseTo(-g[6], 9);
    // Reaching with the right hand only moves the waist and the right arm.
    const T = rb.fkine(arm, [0.1, 0, 0, 0, 0.4, 0.5, 0.3], 6), r = rb.ikine(arm, T, q, [0, 0, 0, 1, 1, 1], { tip: 6 });
    expect(rb.origin(rb.fkine(arm, r.q, 6)).map((v, k) => v - rb.origin(T)[k]).every((d) => Math.abs(d) < 1e-5)).toBe(true);
  });
  it('collisions: capsules against each other, spheres and boxes', () => {
    expect(rb.segDist([0, 0, 0], [1, 0, 0], [0.5, 1, -1], [0.5, 1, 1])).toBeCloseTo(1, 12);
    expect(rb.segDist([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0])).toBeCloseTo(1, 12);
    const two = rb.ARMS.twolink();
    // Straight out, nothing touches.
    expect(rb.checkCollision(two, [0, 0]).colliding).toBe(false);
    const planar = rb.ARMS.planar3(), folded = rb.checkCollision(planar, [0, 3.0, 3.0]);
    expect(folded.colliding).toBe(true); expect(folded.self).toEqual([[0, 2]]);
    const ball = rb.checkCollision(two, [0, 0], { spheres: [[1.5, 0.2, 0, 0.1]], radius: 0.05 });
    expect(ball.colliding).toBe(false); expect(ball.minDistance).toBeCloseTo(0.05, 9);
    const box = rb.checkCollision(two, [0, 0], { boxes: [[1.8, -0.1, -0.1, 3, 0.1, 0.1]], radius: 0.05 });
    expect(box.hits).toEqual([[1, 0]]);
  });
  it('convex shapes by GJK: segments, cubes, cylinders and meshes (M482c)', () => {
    const cube: rb.V3[] = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);
    expect(rb.convexDist([[3, 0.5, 0.5]], cube)).toBeCloseTo(2, 9);
    expect(rb.convexDist([[2, 2, 2]], cube)).toBeCloseTo(Math.sqrt(3), 9);
    expect(rb.convexDist([[0.5, 0.5, 0.5]], cube)).toBe(0);
    // A segment against a segment agrees with Ericson's closest points.
    for (const [P, Q, R, S] of [[[0, 0, 0], [1, 0, 0], [0.5, 1, -1], [0.5, 1, 1]], [[0, 0, 0], [1, 1, 0], [2, 0, 1], [0, 2, 3]], [[0, 0, 0], [1, 0, 0], [2, 0.5, 0], [3, 0, 0.2]]] as rb.V3[][])
      expect(rb.convexDist([P, Q], [R, S])).toBeCloseTo(rb.segDist(P, Q, R, S), 7);
    // A tetrahedron a segment passes through.
    expect(rb.convexDist([[0.2, 0.2, -1], [0.2, 0.2, 1]], [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])).toBe(0);
    const two = rb.ARMS.twolink(), cyl = rb.checkCollision(two, [0, 0], { cylinders: [[1.5, 0.3, -1, 1, 0.1]], radius: 0.05 });
    expect(cyl.colliding).toBe(false); expect(cyl.minDistance).toBeGreaterThan(0.14); expect(cyl.minDistance).toBeLessThan(0.151);
    const hit = rb.checkCollision(two, [0, 0], { cylinders: [[1.5, 0.12, -1, 1, 0.1]], meshes: [cube.map(([x, y, z]): rb.V3 => [x + 2.5, y - 0.5, z - 0.5])], radius: 0.05 });
    expect(hit.hits).toEqual([[1, 0]]);
    // How deep (EPA): a point 0.3 inside the cube's face, a segment through it 0.4 in from the nearest side.
    expect(rb.convexDepth([[0.5, 0.5, 0.7]], cube)).toBeCloseTo(0.3, 6);
    expect(rb.convexDepth([[0.4, -1, 0.5], [0.4, 2, 0.5]], cube)).toBeCloseTo(0.4, 6);
    expect(rb.convexDepth([[3, 0, 0]], cube)).toBe(0);
    const deep = rb.checkCollision(two, [0, 0], { boxes: [[1.4, -0.1, -0.1, 3, 0.1, 0.1]], radius: 0.05, self: false });
    expect(deep.minDistance).toBeCloseTo(-0.15, 6);
    const touch = rb.checkCollision(two, [0, 0], { meshes: [cube.map(([x, y, z]): rb.V3 => [x + 1.5, y - 0.5, z - 0.5])], radius: 0.05 });
    expect(touch.hits).toEqual([[1, 0]]);
  });
  it('in the language: Parent, the tool link and checkCollision', () => {
    const { d } = run("r = loadrobot('dualarm'); p = r.Parent; J = geometricJacobian(r, zeros(1, 7), 4); [q, info] = robotIK(r, [0.3 0.5 1.2], zeros(1, 7), 'EndEffector', 4); x = tform2trvec(getTransform(r, q, 4)); mine = robotDH([1 0 0 0; 1 0 0 0; 1 0 0 0], 'Parent', [0 1 1]); [hit, sep, selfPairs, hits] = checkCollision(loadrobot('twolink'), [0 0], 'Spheres', [1.5 0 0 0.2]); [h2, g2, s2, o2] = checkCollision(loadrobot('twolink'), [0 0], 'Self', 0, 'Cylinders', [5 0 0 1 0.1], 'Meshes', {[1.5 -0.1 -0.1; 1.7 -0.1 -0.1; 1.6 0.2 -0.1; 1.6 0 0.2]});");
    expect(d('p')).toEqual([0, 1, 2, 3, 1, 5, 6]);
    expect(d('J').slice(5 * 6)).toEqual(new Array(12).fill(0));
    expect(d('x')).toEqual([0.3, 0.5, 1.2].map((v) => expect.closeTo(v, 4)));
    expect(d('hit')).toEqual([1]); expect(d('hits')).toEqual([2, 1]);
    expect(d('h2')).toEqual([1]); expect(d('o2')).toEqual([2, 2]);
  });
});
