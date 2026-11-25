import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as vd from './vehicle';

describe('Hyperion vehicle dynamics (M486)', () => {
  const car = vd.CAR_DEFAULT;
  it('the steady numbers by hand: understeer gradient, yaw gain, characteristic and critical speeds', () => {
    const h = vd.handling(car), [fzf, fzr] = vd.staticLoads(car);
    expect(fzf + fzr).toBeCloseTo(car.m * vd.G, 6);
    expect(h.K).toBeCloseTo(fzf / vd.G / car.cf - fzr / vd.G / car.cr, 12);
    expect(h.characteristic).toBeCloseTo(Math.sqrt(2.7 / h.K), 9);
    // The yaw gain peaks at the characteristic speed.
    expect(h.yawGain(h.characteristic)).toBeGreaterThan(h.yawGain(h.characteristic * 0.8));
    expect(h.yawGain(h.characteristic)).toBeGreaterThan(h.yawGain(h.characteristic * 1.2));
    expect(vd.handling({ ...car, cr: 50000 }).critical).toBeGreaterThan(20);
  });
  it('the Magic Formula: its slope at zero is the cornering stiffness and it peaks at the grip', () => {
    const [fzf] = vd.staticLoads(car), slope = (vd.sideForce(car, 0, 1e-5, fzf) - vd.sideForce(car, 0, -1e-5, fzf)) / 2e-5;
    expect(slope / car.cf).toBeCloseTo(1, 3);
    const peak = Math.max(...Array.from({ length: 200 }, (_, k) => vd.sideForce(car, 0, k * 0.002, fzf)));
    expect(peak / (car.mu * fzf)).toBeCloseTo(1, 2);
    // Braking hard leaves less grip for cornering (the friction ellipse).
    expect(vd.sideForce(car, 0, 0.1, fzf, 0.8 * car.mu * fzf)).toBeLessThan(0.65 * vd.sideForce(car, 0, 0.1, fzf));
  });
  it('a steady circle: the yaw rate is u / R with the steering the linear model asks', () => {
    const R = 60, u = 14, r = vd.vehicleSim({ ...car, tyre: 'linear' }, () => vd.steerForCircle(car, R, u), 12, { speed: u });
    expect(r.r.at(-1)!).toBeCloseTo(u / R, 2);
    expect(r.ay.at(-1)!).toBeCloseTo((u * u) / R, 0);
  });
  it('the sine with dwell: the understeering car stays straight, the oversteering one spins', () => {
    // As the test is run: foot off the pedal at 100 km/h.
    const ok = vd.vehicleSim(car, vd.sineWithDwell(0.06), 4, { v0: 100 / 3.6, force: () => 0 });
    expect(ok.spun).toBe(false);
    const loose = vd.vehicleSim({ ...car, cr: 40000 }, vd.sineWithDwell(0.06), 4, { v0: 100 / 3.6, force: () => 0 });
    expect(loose.spun).toBe(true);
    // On snow the same test can't reach the same side force.
    const snow = vd.vehicleSim({ ...car, mu: 0.3 }, vd.sineWithDwell(0.02), 4, { speed: 50 / 3.6 });
    expect(Math.max(...snow.ay.map(Math.abs))).toBeLessThan(0.32 * vd.G);
  });
  it('straight lines: 0–100 km/h, top speed where power meets drag, and the shortest stop', () => {
    const a = vd.accelRun(car);
    expect(a.time).toBeGreaterThan(5); expect(a.time).toBeLessThan(9);
    expect((0.5 * vd.RHO * car.cd * car.area * a.top ** 2 + car.crr * car.m * vd.G) * a.top).toBeCloseTo(car.power, -2);
    const b = vd.brakingDistance(car, 100 / 3.6);
    // A little under v²/2μg, the drag helping.
    expect(b.distance).toBeLessThan((100 / 3.6) ** 2 / (2 * vd.G)); expect(b.distance).toBeGreaterThan(35);
    // Front-wheel drive on a slippery road is held back by grip.
    expect(vd.accelRun({ ...car, mu: 0.3, drive: 'front' }).time).toBeGreaterThan(vd.accelRun({ ...car, mu: 0.3, drive: 'all' }).time);
  });
  it('body roll (M486b): the steady lean by hand, the roll stiffness setting the balance, a tall body lifting a wheel', () => {
    const rc = { ...car, roll: vd.ROLL_DEFAULT }, R = 60, u = 14;
    const c = vd.vehicleSim(rc, () => vd.steerForCircle(rc, R, u), 12, { speed: u });
    expect(c.roll.at(-1)! / (vd.rollGradient(rc).gradient * c.ay.at(-1)!)).toBeCloseTo(1, 3);
    // Load moved across an axle costs it grip: less side force at the limit than one tyre per axle.
    const peak = (v: vd.Vehicle) => Math.max(...vd.vehicleSim(v, vd.rampSteer(0.02), 8, { speed: 25 }).ay);
    expect(peak(rc)).toBeLessThan(peak(car));
    // A stiff front anti-roll bar understeers; the same stiffness at the rear spins in the stability test.
    const sine = (kf: number, kr: number) => vd.vehicleSim({ ...car, roll: { ...vd.ROLL_DEFAULT, kf, kr } }, vd.sineWithDwell(0.06), 4, { v0: 100 / 3.6, force: () => 0 }).spun;
    expect(sine(80000, 20000)).toBe(false); expect(sine(20000, 80000)).toBe(true);
    // A van's high centre of mass: past t/2h the inner wheels lift; the saloon's don't.
    expect(vd.vehicleSim({ ...rc, h: 1.1 }, vd.stepSteer(0.12), 3, { speed: 25 }).lift).toBe(true);
    expect(vd.vehicleSim(rc, vd.stepSteer(0.12), 3, { speed: 25 }).lift).toBe(false);
  });
  it('suspension geometry and rollover (M486c): roll steer and camber cost turning, a tall van rolls in the fishhook', () => {
    const rc: vd.Vehicle = { ...vd.CAR_DEFAULT, roll: { ...vd.ROLL_DEFAULT } };
    const yaw = (v: vd.Vehicle) => vd.vehicleSim(v, vd.stepSteer(0.03), 4, { speed: 22 }).r.at(-1)!;
    // Without geometry the run is M486b's exactly; roll understeer and leaning wheels both turn it less.
    expect(yaw({ ...rc, roll: { ...rc.roll!, rollSteer: [0, 0], camber: [0, 0], camberStiff: 0 } })).toBe(yaw(rc));
    expect(yaw({ ...rc, roll: { ...rc.roll!, rollSteer: [0.1, 0.1] } })).toBeLessThan(0.97 * yaw(rc));
    expect(yaw({ ...rc, roll: { ...rc.roll!, rollSteer: [-0.1, -0.1] } })).toBeGreaterThan(yaw(rc));
    // Rear wheels leaning out with the body lose the rear more: less understeer, more yaw.
    expect(yaw({ ...rc, roll: { ...rc.roll!, camber: [0, 0.8], camberStiff: 0.1 } })).toBeGreaterThan(yaw(rc));
    expect(yaw({ ...rc, roll: { ...rc.roll!, camber: [0.8, 0], camberStiff: 0.1 } })).toBeLessThan(yaw(rc));
    // The fishhook: up, hold, over to the other side; ends straight.
    const fh = vd.fishhook(0.1);
    expect(fh(0.4)).toBe(0); expect(fh(0.5 + 0.125 + 0.1)).toBeCloseTo(0.1, 9); expect(fh(0.5 + 0.125 + 0.25 + 0.25 + 1)).toBeCloseTo(-0.1, 9); expect(fh(10)).toBe(0);
    // A tall van (centre of mass 1.2 m up on a 1.6 m track: tips past 0.67 g) rolls over in it; the saloon doesn't; the
    // van on a slippery road (grip 0.55 g) slides instead.
    const van: vd.Vehicle = { ...vd.CAR_DEFAULT, m: 2500, iz: 4500, h: 1.2, cf: 110000, cr: 140000, roll: { ...vd.ROLL_DEFAULT, track: 1.6, ix: 1400 } };
    const go = (v: vd.Vehicle) => vd.vehicleSim(v, vd.fishhook(0.12), 6, { speed: 22 });
    const tall = go(van);
    expect(Number.isFinite(tall.rolled)).toBe(true); expect(Math.max(...tall.tip.map(Math.abs))).toBeGreaterThan(0.3);
    expect(Number.isNaN(go(rc).rolled)).toBe(true); expect(Math.max(...go(rc).tip.map(Math.abs))).toBe(0);
    expect(Number.isNaN(go({ ...van, mu: 0.55 }).rolled)).toBe(true);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("c = vehicle('Cr', 50000); k = c.UndersteerGradient; [r, info] = vehicleSim(c, 'sinedwell', 4, 'Amplitude', 0.1, 'Speed', 28); s = info.Spun; [a, ai] = accelRun(vehicle()); t = ai.Time; d = brakingDistance(vehicle(), 27.78); f = magicFormula([0 0.1], 10, 1.3, 1, -0.6); h = vehicleHandling(vehicle()); figure; vehicleSim(vehicle(), 'step', 3, 'Speed', 20); figure; vehicleHandling(c); v = vehicle('Roll', true, 'CgHeight', 1.1); g = v.RollGradient; [rr, ri] = vehicleSim(v, 'step', 3, 'Amplitude', 0.12, 'Speed', 25); lift = ri.WheelLift; figure; vehicleSim(v, 'step', 3, 'Amplitude', 0.12, 'Speed', 25); v2 = vehicle('RollStiffFront', 80000); g2 = v2.RollGradient;");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('k')[0]).toBeLessThan(0); expect(d('s')).toEqual([1]);
    expect(d('t')[0]).toBeGreaterThan(5); expect(d('d')[0]).toBeGreaterThan(35);
    expect(d('f')[0]).toBe(0); expect(d('f')[1]).toBeGreaterThan(0.5);
    expect(d('g')[0]).toBeGreaterThan(0.01); expect(d('lift')).toEqual([1]); expect(d('g2')[0]).toBeGreaterThan(0);
    lab.run("van = vehicle('Mass', 2500, 'Inertia', 4500, 'CgHeight', 1.2, 'Cf', 110000, 'Cr', 140000, 'Track', 1.6, 'RollInertia', 1400, 'RollSteer', [0.05 0.05], 'CamberRoll', [0.8 0.8], 'CamberStiffness', 0.1); [vr, vi] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'Speed', 22); ro = vi.RolledOver; cr = van.CamberRoll; figure; vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'Speed', 22);");
    expect(d('ro')).toEqual([1]); expect(d('cr')).toEqual([0.8, 0.8]);
  });
  it('tumbling after a rollover and kerb trips (M486d)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, van = { ...vd.CAR_DEFAULT, h: 1.2, m: 2500, roll: { ...vd.ROLL_DEFAULT, track: 1.6, ix: 1400 } };
    // The trip speed by hand: ½·I_edge·ω² = m·g·rise with ω = m·v·(h − kerb) / I_edge.
    const sh = vd.shape(saloon), hh = 0.55 - 0.15, Ie = sh.ix + 1500 * (0.775 ** 2 + hh * hh), v0 = vd.tripSpeed(saloon);
    expect(0.5 * Ie * ((1500 * v0 * hh) / Ie) ** 2).toBeCloseTo(1500 * vd.G * (Math.hypot(0.775, hh) - hh), 6);
    expect(v0).toBeGreaterThan(6); expect(v0).toBeLessThan(11); expect(vd.tripSpeed(van)).toBeLessThan(v0 / 2);
    // Just under it, it rocks back onto its wheels; just over, it goes over; much faster, more turns.
    const under = vd.kerbTrip(saloon, v0 * 0.95), over = vd.kerbTrip(saloon, v0 * 1.1), fast = vd.kerbTrip(saloon, 18);
    expect(under.tripped).toBe(false); expect(under.rests).toBe('wheels');
    expect(over.tripped).toBe(true); expect(over.quarters).toBeGreaterThanOrEqual(1); expect(fast.quarters).toBeGreaterThan(over.quarters);
    // Sliding sideways across tarmac it doesn't trip; soft soil's grip on the wheels trips it.
    expect(vd.kerbTrip(saloon, 15, 0, vd.GROUNDS.tarmac).quarters).toBe(0);
    expect(vd.kerbTrip(saloon, 15, 0, vd.GROUNDS.soil).quarters).toBeGreaterThan(0);
    // The fishhook rollover now tumbles on and comes to rest, off its wheels, metres away.
    const fh = vd.vehicleSim(van, vd.fishhook(0.12), 6, { v0: 22, force: () => 0, points: 600 });
    expect(Number.isFinite(fh.rolled)).toBe(true); expect(fh.tumble!.quarters).toBeGreaterThan(0); expect(fh.tumble!.rests).not.toBe('wheels'); expect(fh.tumble!.slid).toBeGreaterThan(1);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("van = vehicle('CgHeight', 1.2, 'Mass', 2500, 'Roll', true, 'Track', 1.6, 'RollInertia', 1400); [~, i] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'InitialSpeed', 22, 'Force', 0); [~, j] = vehicleTrip(vehicle('Roll', true), 12, 'Kerb', 0.15); figure; vehicleTrip(vehicle('Roll', true), 15, 'Kerb', 0, 'Ground', 'soil');");
    const f = (n: string, k: string) => (lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!;
    expect(toMat(f('i', 'Rolls')).d[0]).toBeGreaterThan(0); expect(toMat(f('j', 'Tripped')).d[0]).toBe(1); expect(toMat(f('j', 'TripSpeed')).d[0]).toBeCloseTo(v0, 6);
  });
  it('the roof crushing and the car turning as it tumbles (M486e)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, van = { ...vd.CAR_DEFAULT, h: 1.2, m: 2500, roll: { ...vd.ROLL_DEFAULT, track: 1.6, ix: 1400 } };
    // A stronger roof crushes less; a car that rocks back onto its wheels isn't crushed at all.
    const c = (swr: number) => vd.kerbTrip(saloon, 18, 0.15, vd.GROUNDS.tarmac, { swr }).crush;
    expect(c(1.5)).toBeGreaterThan(c(3)); expect(c(3)).toBeGreaterThan(c(5)); expect(c(5)).toBeGreaterThan(0);
    expect(vd.kerbTrip(saloon, 6).crush).toBe(0);
    // Yawing as it trips, it turns while it tumbles (slowed by the ground); without yaw it doesn't.
    const still = vd.kerbTrip(saloon, 12, 0.15, vd.GROUNDS.tarmac, { vf: 15 }), spun = vd.kerbTrip(saloon, 12, 0.15, vd.GROUNDS.tarmac, { vf: 15, r: 1 });
    expect(still.spin).toBe(0); expect(Math.abs(spun.spin)).toBeGreaterThan(0.1); expect(Math.abs(spun.spin)).toBeLessThan(1);
    // The fishhook van rolls with its yaw rate: it turns as it tumbles and its roof edge gives.
    const fh = vd.vehicleSim(van, vd.fishhook(0.12), 6, { v0: 22, force: () => 0, points: 600 }).tumble!;
    expect(Math.abs(fh.spin)).toBeGreaterThan(0.01); expect(fh.crush).toBeGreaterThan(0);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, a] = vehicleTrip(vehicle('Roll', true), 18, 'Kerb', 0.15, 'RoofStrength', 1.5); [~, b] = vehicleTrip(vehicle('Roll', true), 12, 'Kerb', 0.15, 'YawRate', 1, 'ForwardSpeed', 15);");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('a', 'RoofCrush')).toBeCloseTo(c(1.5), 9); expect(Math.abs(f('b', 'Spin'))).toBeGreaterThan(5);
  });
  it('the crushed roof drawn, windows breaking and the people inside (M486f)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT };
    const calm = vd.kerbTrip(saloon, 6), hard = vd.kerbTrip(saloon, 18);
    // Rocking back: no glass broken, full headroom; a hard trip breaks both sides' windows and the roof reaches them.
    expect(calm.windows.every(Number.isNaN)).toBe(true); expect(calm.headroom).toBe(vd.HEADROOM); expect(calm.peakG).toBeGreaterThan(1);
    expect(hard.windows.every((x) => x > 0)).toBe(true); expect(hard.headroom).toBeCloseTo(vd.HEADROOM - hard.crush, 12); expect(hard.peakG).toBeGreaterThan(calm.peakG);
    // The crush over time only grows, one entry per sample, ending at the most.
    expect(hard.crushes.length).toBe(hard.t.length);
    expect(hard.crushes.every((c, i) => i === 0 || (c[0] >= hard.crushes[i - 1][0] && c[1] >= hard.crushes[i - 1][1]))).toBe(true);
    expect(Math.max(...hard.crushes.at(-1)!)).toBeCloseTo(hard.crush, 12);
  });
  it('belts, curtain airbags, people thrown out and the windscreen (M486g)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, hard = vd.kerbTrip(saloon, 18), calm = vd.kerbTrip(saloon, 6);
    const loose = vd.inside(saloon, hard, { belt: false }), belted = vd.inside(saloon, hard), both = vd.inside(saloon, hard, { curtains: true });
    const looseCurt = vd.inside(saloon, hard, { belt: false, curtains: true });
    // Unbelted through a broken window; belted only head and arms; curtains over the windows keep them in.
    expect(loose.thrownOut).toBeGreaterThanOrEqual(Math.min(...hard.windows)); expect(loose.risk).toBe('severe');
    expect(Number.isNaN(belted.thrownOut)).toBe(true); expect(belted.partly).toBe(true);
    expect(both.partly).toBe(false); expect(Number.isNaN(looseCurt.thrownOut)).toBe(true);
    // Belts and curtains soften the heads' blows; the windscreen cracks before it comes out.
    expect(belted.headG).toBeLessThan(loose.headG); expect(both.headG).toBeLessThan(belted.headG);
    expect(belted.screenCracked).toBeLessThanOrEqual(belted.screenOut);
    const c = vd.inside(saloon, calm, { belt: false });
    expect(Number.isNaN(c.thrownOut) && Number.isNaN(c.screenCracked)).toBe(true); expect(c.risk).toBe('low');
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, a] = vehicleTrip(vehicle('Roll', true), 18, 'Belts', 0); [~, b] = vehicleTrip(vehicle('Roll', true), 18, 'Curtains', 1);");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('a', 'ThrownOutAt')).toBeCloseTo(loose.thrownOut, 9); expect(f('b', 'HeadG')).toBeCloseTo(both.headG, 9);
  });
});
