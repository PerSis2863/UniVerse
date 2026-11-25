import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as ev from './ev';

describe('Hyperion electric vehicles (M488)', () => {
  const e = ev.EV_DEFAULT;
  it('the pack: about 78 kWh, its voltage curve rising, the current for a power by hand', () => {
    expect(ev.packKwh(e)).toBeCloseTo(78.4, 1);
    for (let s = 0.05; s <= 1; s += 0.05) expect(ev.ocv(s)).toBeGreaterThan(ev.ocv(s - 0.05));
    const I = ev.packCurrent(e, 50e3, 0.5), V = ev.ocv(0.5) * e.series, R = (e.cellR * e.series) / e.parallel;
    expect((V - I * R) * I).toBeCloseTo(50e3, 3);
  });
  it('the motor: best in the middle, worse at low speed and high torque; never past its torque or power', () => {
    expect(ev.efficiency(e, 100, 500)).toBeGreaterThan(0.95);
    expect(ev.efficiency(e, 300, 100)).toBeLessThan(ev.efficiency(e, 100, 500));
    expect(ev.torqueLimit(e, 100)).toBe(e.tmax);
    expect(ev.torqueLimit(e, 1000) * 1000).toBeCloseTo(e.pmax, 6);
  });
  it('driving: the motorway costs more per km than town, braking energy comes back, no regen costs more', () => {
    const city = ev.evSim(e, ev.CYCLES.city()), mw = ev.evSim(e, ev.CYCLES.motorway());
    expect(city.whPerKm).toBeGreaterThan(80); expect(city.whPerKm).toBeLessThan(200);
    expect(mw.whPerKm).toBeGreaterThan(city.whPerKm);
    expect(city.regenWh).toBeGreaterThan(0.2 * city.driveWh);
    expect(ev.evSim({ ...e, regen: 0 }, ev.CYCLES.city()).whPerKm).toBeGreaterThan(1.4 * city.whPerKm);
    // The charge falls by the energy used (at the cells' voltage over that stretch, about 4 V).
    const wh = (0.9 - mw.soc.at(-1)!) * e.cellAh * e.parallel * e.series * ev.ocv((0.9 + mw.soc.at(-1)!) / 2);
    expect(Math.abs(wh / (mw.whPerKm * mw.km) - 1)).toBeLessThan(0.02);
    // A heavier car uses more.
    expect(ev.evSim({ ...e, m: 2600 }, ev.CYCLES.city()).whPerKm).toBeGreaterThan(city.whPerKm);
  });
  it('charging: constant current then constant voltage, the last fifth the slowest', () => {
    const c = ev.evCharge(e, 150e3);
    expect(c.to80 / 60).toBeGreaterThan(15); expect(c.to80 / 60).toBeLessThan(40);
    // From 80% to the end takes longer than 10% to 80% would at the same rate.
    expect(c.end - c.to80).toBeGreaterThan((c.to80 * 0.2) / 0.7);
    expect(Math.max(...c.p)).toBeLessThanOrEqual(150e3 * 1.0001);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("e = evModel(); k = e.BatteryKWh; [r, info] = evSim(e, 'city'); w = info.WhPerKm; c = driveCycle('motorway'); [r2, i2] = evSim(e, [0 0; 20 50; 60 50; 70 0]); [M, W, T] = evMotorMap(e); [ch, ci] = evCharge(e, 150); m80 = ci.MinutesTo80; figure; evSim(e, 'mixed'); figure; evMotorMap(e); figure; evCharge(e, 50); figure; driveCycle('city');");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('k')[0]).toBeCloseTo(78.4, 1); expect(d('w')[0]).toBeGreaterThan(80); expect(d('m80')[0]).toBeGreaterThan(15);
  });
});
