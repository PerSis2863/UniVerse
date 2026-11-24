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
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("c = vehicle('Cr', 50000); k = c.UndersteerGradient; [r, info] = vehicleSim(c, 'sinedwell', 4, 'Amplitude', 0.1, 'Speed', 28); s = info.Spun; [a, ai] = accelRun(vehicle()); t = ai.Time; d = brakingDistance(vehicle(), 27.78); f = magicFormula([0 0.1], 10, 1.3, 1, -0.6); h = vehicleHandling(vehicle()); figure; vehicleSim(vehicle(), 'step', 3, 'Speed', 20); figure; vehicleHandling(c);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('k')[0]).toBeLessThan(0); expect(d('s')).toEqual([1]);
    expect(d('t')[0]).toBeGreaterThan(5); expect(d('d')[0]).toBeGreaterThan(35);
    expect(d('f')[0]).toBe(0); expect(d('f')[1]).toBeGreaterThan(0.5);
  });
});
