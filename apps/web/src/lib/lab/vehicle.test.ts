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
  it('a person\'s size and seat, front airbags, and the people in a steering rollover (M486h)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, hard = vd.kerbTrip(saloon, 18);
    const small = vd.inside(saloon, hard, { size: 'small', seat: 'far' }), tall = vd.inside(saloon, hard, { size: 'tall', seat: 'far' });
    // A tall person has 12 cm less over their head than a small one; the side it tips to is crushed more than the other.
    expect(small.headroom - tall.headroom).toBeCloseTo(0.12, 9);
    const near = vd.inside(saloon, hard, { seat: 'near' }), far = vd.inside(saloon, hard, { seat: 'far' });
    expect(near.headroom).toBeLessThan(far.headroom); expect(vd.inside(saloon, hard).headroom).toBeCloseTo(near.headroom, 9);
    // The far side's head swings across first: a harder side blow.
    expect(far.headSide).toBeGreaterThan(near.headSide);
    // Front airbags need a blow along the car; rolling over gives too little.
    expect(hard.frontG).toBeLessThan(vd.FRONT_G); expect(Number.isNaN(near.frontBags)).toBe(true);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("van = vehicle('Mass', 2500, 'Inertia', 4500, 'CgHeight', 1.2, 'Cf', 110000, 'Cr', 140000, 'Track', 1.6, 'RollInertia', 1400, 'CamberRoll', [0.8 0.8], 'CamberStiffness', 0.1, 'RollSteer', [0.05 0.05]); [~, a] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'InitialSpeed', 22, 'Force', 0, 'Belts', 0); [~, b] = vehicleTrip(vehicle('Roll', true), 18, 'Occupant', 'tall', 'Seat', 'far');");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('a', 'Rolls')).toBeGreaterThan(0); expect(f('a', 'HeadG')).toBeGreaterThan(0); expect(Number.isNaN(f('a', 'FrontAirbags'))).toBe(true);
    expect(f('b', 'HeadG')).toBeCloseTo(tall.headG, 9);
    expect(() => lab.run("vehicleTrip(vehicle('Roll', true), 18, 'Seat', 'roof')")).toThrow(/near/);
  });
  it('front and back rows, and everyone at once (M486i)', { timeout: 60_000 }, () => {
    const saloon = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, hard = vd.kerbTrip(saloon, 18);
    const front = vd.inside(saloon, hard, { seat: 'near' }), back = vd.inside(saloon, hard, { seat: 'near', row: 'rear' });
    // The back: 3 cm less room, 0.7 of the crush; no front airbags.
    expect(back.headroom).toBeCloseTo(vd.HEADROOM - 0.03 - vd.REAR_CRUSH * hard.crushes.at(-1)![0], 9); expect(back.headroom).toBeGreaterThan(front.headroom);
    expect(Number.isNaN(back.frontBags)).toBe(true);
    const all = vd.everyone(saloon, hard, { belt: false });
    expect(all.map((x) => `${x.row} ${x.seat}`)).toEqual(['front near', 'front far', 'rear near', 'rear far']);
    expect(all[0].headG).toBeCloseTo(vd.inside(saloon, hard, { belt: false, seat: 'near' }).headG, 9);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, a] = vehicleTrip(vehicle('Roll', true), 18, 'Row', 'rear', 'Seat', 'near'); s = a.Seats; h = s.HeadG;");
    expect(toMat(lab.vars.get('h')!).d.length).toBe(4);
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('a', 'PersonHeadroom')).toBeCloseTo(back.headroom, 9);
  });
  it('a head-on crash with belts and airbags (M486j)', { timeout: 60_000 }, () => {
    const car = vd.CAR_DEFAULT, ncap = vd.frontalCrash(car, 56 / 3.6);
    // Tuned: 56 km/h into a wall crushes the front 0.65 m; the sensor fires the airbag within ~40 ms, in time.
    expect(ncap.crush).toBeCloseTo(vd.NCAP_CRUSH, 2); expect(ncap.bagAt).toBeLessThan(0.04); expect(ncap.late).toBe(false);
    // Belt and airbag keep the person off the wheel under 60 g; nothing and they hit it.
    expect(ncap.hitWheel).toBe(false); expect(ncap.chestG).toBeLessThan(60); expect(ncap.risk).toBe('low');
    const none = vd.frontalCrash(car, 56 / 3.6, { belt: false, bags: false }), belt = vd.frontalCrash(car, 56 / 3.6, { bags: false });
    expect(none.hitWheel).toBe(true); expect(none.risk).toBe('severe');
    expect(belt.headHit).toBe(true); expect(belt.travelMax).toBeGreaterThan(ncap.travelMax);
    // A car like it head on at the same speed is the same as the wall; a heavier one is worse; slow, no airbag.
    expect(vd.frontalCrash(car, 56 / 3.6, { into: 'car' }).chestG).toBeCloseTo(ncap.chestG, 6);
    expect(vd.frontalCrash(car, 56 / 3.6, { into: 'car', other: 3000 }).vEq).toBeGreaterThan(56 / 3.6);
    expect(Number.isNaN(vd.frontalCrash(car, 10 / 3.6).bagAt)).toBe(true);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[t, i] = vehicleCrash(vehicle(), 56/3.6); figure; vehicleCrash(vehicle(), 15, 'Into', 'car', 'Belts', 0);");
    const f = (k: string) => toMat((lab.vars.get('i') as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('ChestG')).toBeCloseTo(ncap.chestG, 9);
    expect(() => lab.run("vehicleCrash(vehicle(), 15, 'Into', 'tree')")).toThrow(/wall/);
  });
  it('offset crashes, the back seat and someone unbelted behind (M486k)', { timeout: 60_000 }, () => {
    const car = vd.CAR_DEFAULT, full = vd.frontalCrash(car, 56 / 3.6);
    // The full front unchanged: no intrusion, nothing slid off, nobody behind.
    expect(full.crush).toBeCloseTo(vd.NCAP_CRUSH, 2); expect(full.intrusion).toBe(0); expect(full.slidOff).toBe(false); expect(full.backLoad).toBe(0);
    expect(vd.overlapShare(1)).toBe(1); expect(vd.overlapShare(0.4)).toBeLessThan(1); expect(vd.overlapShare(0.25)).toBeLessThan(vd.overlapShare(0.4));
    // 64 km/h with 40%: the front crushes past its room, the footwell comes in; 25%: more, and the head slides off the airbag.
    const off = vd.frontalCrash(car, 64 / 3.6, { overlap: 0.4 }), small = vd.frontalCrash(car, 64 / 3.6, { overlap: 0.25 });
    expect(off.intrusion).toBeGreaterThan(0.05); expect(off.slidOff).toBe(false);
    expect(small.intrusion).toBeGreaterThan(off.intrusion); expect(small.slidOff).toBe(true); expect(small.risk).toBe('severe');
    // The back seat: no airbag; belted the head may reach the seat in front, unbelted they go over its folded back.
    const rb = vd.frontalCrash(car, 56 / 3.6, { seat: 'rear' }), ru = vd.frontalCrash(car, 56 / 3.6, { seat: 'rear', belt: false });
    expect(Number.isNaN(rb.bagAt)).toBe(true); expect(rb.hitWheel).toBe(false); expect(ru.travelMax).toBeGreaterThan(rb.travelMax); expect(ru.risk).toBe('severe');
    // Unbelted behind the driver: the seat's back takes up to 12 kN and pushes the driver onto the wheel.
    const pushed = vd.frontalCrash(car, 56 / 3.6, { behind: 'unbelted' });
    expect(pushed.backLoad).toBeCloseTo(vd.SEATBACK_MAX, 0); expect(pushed.travelMax).toBeGreaterThan(full.travelMax); expect(pushed.hitWheel).toBe(true);
    expect(vd.frontalCrash(car, 56 / 3.6, { behind: 'belted' }).chestG).toBeCloseTo(full.chestG, 9);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, i] = vehicleCrash(vehicle(), 64/3.6, 'Overlap', 0.25); [~, j] = vehicleCrash(vehicle(), 56/3.6, 'Seat', 'rear', 'Behind', 'unbelted');");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('i', 'SlidOffAirbag')).toBe(1); expect(f('i', 'Intrusion')).toBeCloseTo(small.intrusion, 9); expect(f('j', 'HitFrontSeat')).toBe(1);
    expect(() => lab.run("vehicleCrash(vehicle(), 15, 'Overlap', 2)")).toThrow(/Overlap/);
  });
  it('a side crash: a car or a pole, both sides, the person beside (M486l)', { timeout: 60_000 }, () => {
    const car = vd.CAR_DEFAULT, go = (o: Parameters<typeof vd.sideCrash>[2], sp = 50) => vd.sideCrash(car, sp / 3.6, o);
    // A car like it at 50 km/h crushes the side ~0.35 m and shoves the car sideways at half the speed, plus the 10% spring-back.
    const bag = go({}), none = go({ bags: false });
    expect(bag.intrusion).toBeCloseTo(0.35, 1); expect(bag.dv).toBeCloseTo((1.1 * 50) / 3.6 / 2, 1);
    // The side airbags fire within ~10 ms and help both the chest and the head; without a curtain the head hits the window side.
    expect(bag.bagAt).toBeLessThan(0.012); expect(bag.chestG).toBeLessThan(none.chestG); expect(bag.headG).toBeLessThan(none.headG);
    expect(bag.headHit).toBe(false); expect(none.headHit).toBe(true); expect(none.risk).toBe('severe');
    // A pole at 32 km/h without airbags: the head on the pole; with them the risk is low.
    expect(go({ into: 'pole', bags: false }, 32).risk).toBe('severe'); expect(go({ into: 'pole' }, 32).risk).toBe('low');
    // The far side is safer alone; with someone beside, thrown into them (shoulders, then heads).
    const far = go({ seat: 'far' }), beside = go({ seat: 'far', beside: true });
    expect(far.chestG).toBeLessThan(bag.chestG); expect(far.hitPerson).toBe(0);
    expect(beside.hitPerson).toBeGreaterThan(5000); expect(beside.headHit).toBe(true); expect(beside.risk).toBe('severe');
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[t, i] = vehicleSideCrash(vehicle(), 50/3.6, 'Seat', 'far', 'Beside', 1); figure; vehicleSideCrash(vehicle(), 32/3.6, 'Into', 'pole');");
    const f = (k: string) => toMat((lab.vars.get('i') as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('PersonForce')).toBeCloseTo(beside.hitPerson, 6);
    expect(() => lab.run("vehicleSideCrash(vehicle(), 10, 'Into', 'tree')")).toThrow(/pole/);
  });
  it('the middle seat and people knocking into each other in a rollover (M486m)', { timeout: 60_000 }, () => {
    const v = { ...vd.CAR_DEFAULT, roll: vd.ROLL_DEFAULT }, tb = vd.kerbTrip(v, 18, 0.15);
    // The middle seat: the roof edges' mean crush and 2 cm more room; belted, no window of its own.
    const near = vd.inside(v, tb, { seat: 'near', row: 'rear' }), far = vd.inside(v, tb, { seat: 'far', row: 'rear' }), mid = vd.inside(v, tb, { seat: 'middle', row: 'rear' });
    expect(mid.headroom).toBeCloseTo((near.headroom + far.headroom) / 2 + vd.MIDDLE_ROOM, 9); expect(mid.partly).toBe(false);
    expect(mid.headSide).toBeGreaterThan(near.headSide); expect(mid.headSide).toBeLessThan(far.headSide);
    // Everyone: heads knock together, both feel it, at least what each had alone; the middle one meets someone either side.
    const all = vd.everyone(v, tb, { middle: true }), back = all.filter((x) => x.row === 'rear');
    expect(all).toHaveLength(5); expect(back.map((x) => x.seat)).toEqual(['near', 'middle', 'far']);
    for (const x of back) { expect(x.knock).toBeGreaterThan(0); expect(x.headG).toBeGreaterThanOrEqual(vd.inside(v, tb, { seat: x.seat, row: 'rear' }).headG); }
    expect(back[1].knock).toBeCloseTo((far.headSide ** 2 / (2 * vd.HEADS_STOP)) / vd.G, 9);
    // Unbelted, harder knocks.
    expect(Math.max(...vd.everyone(v, tb, { belt: false }).map((x) => x.knock))).toBeGreaterThan(Math.max(...vd.everyone(v, tb).map((x) => x.knock)));
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, i] = vehicleTrip(vehicle('Roll', true), 18, 'Middle', 1, 'Seat', 'middle', 'Row', 'rear');");
    const seats = (lab.vars.get('i') as unknown as { f: Map<string, unknown> }).f.get('Seats');
    expect(seats).toBeTruthy();
    expect(() => lab.run("vehicleTrip(vehicle('Roll', true), 18, 'Middle', 2)")).toThrow(/Middle/);
  });
});
