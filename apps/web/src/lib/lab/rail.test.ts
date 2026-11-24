import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as rl from './rail';

describe('Hyperion railways (M491)', () => {
  it('a level run: full power, the limit, braking at the service rate into the station', () => {
    const t = rl.TRAINS.metro, r: rl.Route = { name: 't', dwell: 0, stations: [0, 2000], sections: [{ length: 2000, grade: 0, radius: 0, limit: 80 / 3.6 }] };
    const x = rl.railRun(t, r);
    expect(Math.max(...x.v)).toBeCloseTo(80 / 3.6, 1);
    expect(x.v.at(-1)).toBe(0);
    // The last braking stretch: v² = 2·b·d.
    const k = x.s.findIndex((s) => s >= 1900);
    expect(x.v[k] ** 2 / (2 * (2000 - x.s[k]))).toBeCloseTo(t.brake, 1);
    // The time is at least distance over the limit.
    expect(x.time).toBeGreaterThan(2000 / (80 / 3.6));
  });
  it('coasting saves energy for a little time; a climb costs energy; a too-steep hill stalls a heavy train', () => {
    const t = rl.TRAINS.metro, r = rl.ROUTES.metro(), fast = rl.railRun(t, r), eco = rl.railRun(t, r, { coast: 0.1 });
    expect(eco.energyKwh).toBeLessThan(0.85 * fast.energyKwh); expect(eco.time).toBeLessThan(1.15 * fast.time); expect(eco.time).toBeGreaterThan(fast.time);
    expect(fast.arrivals).toHaveLength(r.stations.length - 1);
    const flat: rl.Route = { name: 'f', dwell: 0, stations: [0, 5000], sections: [{ length: 5000, grade: 0, radius: 0, limit: 22 }] }, up = { ...flat, sections: [{ ...flat.sections[0], grade: 15 }] };
    expect(rl.railRun(t, up).energyKwh).toBeGreaterThan(rl.railRun(t, flat).energyKwh);
    const stuck = rl.railRun(rl.TRAINS.freight, rl.ROUTES.mountain());
    expect(Number.isNaN(stuck.stalled)).toBe(false); expect(stuck.time).toBe(Infinity);
    expect(rl.curveRes(400)).toBeCloseTo(650 / 345, 9);
  });
  it('headway: moving block lets trains follow closer than fixed blocks', () => {
    const t = rl.TRAINS.intercity, fixed = rl.headway(t, 200 / 3.6), moving = rl.headway(t, 200 / 3.6, { moving: true });
    expect(moving.headway).toBeLessThan(fixed.headway);
    expect(fixed.brakeDist).toBeCloseTo((200 / 3.6) ** 2 / (2 * t.brake), 6);
  });
  it('several trains on one line (M491b): signals space them, moving block lets them run closer, a slow train holds up a fast one', () => {
    const r = rl.ROUTES.metro(), t = rl.TRAINS.metro, four = (gap: number) => [0, 1, 2, 3].map((k) => ({ train: t, depart: k * gap }));
    const late = (run: rl.LineRun) => run.trains.map((x) => x.arrive - x.depart - x.alone);
    // Far apart nobody waits; a minute apart with 400 m blocks each train loses time to the one before.
    expect(Math.max(...late(rl.railLine(r, four(180), { block: 400 })).map(Math.abs))).toBeLessThan(1);
    const fixed = late(rl.railLine(r, four(60), { block: 400 })), moving = late(rl.railLine(r, four(60), { signals: 'moving' }));
    expect(fixed[0]).toBeCloseTo(0, 5); expect(fixed[3]).toBeGreaterThan(30); expect(moving[3]).toBeLessThan(fixed[3] / 2);
    // Moving block: never closer than the margin behind the tail of the train ahead.
    const mv = rl.railLine(r, four(60), { signals: 'moving', margin: 50 });
    for (let k = 1; k < 4; k++) for (let i = 0; i < mv.trains[k].s.length; i++) {
      const head = mv.trains[k].s[i], tail = mv.trains[k - 1].s[i] - t.length;
      if (head > 0 && mv.trains[k - 1].s[i] < rl.routeLength(r) - 1) expect(tail - head).toBeGreaterThan(49);
    }
    // An intercity five minutes behind a freight train can't pass: it arrives far later than alone.
    const mix = rl.railLine(rl.ROUTES.intercity(), [{ train: rl.TRAINS.freight, depart: 0 }, { train: rl.TRAINS.intercity, depart: 300 }]);
    expect(mix.trains[1].held).toBeGreaterThan(1200); expect(mix.trains[1].arrive).toBeGreaterThan(mix.trains[0].arrive);
  });
  it('the power supply (M491c): the voltage by hand, closer substations, braking reused by other trains, a weak line slowing them', () => {
    const r = rl.ROUTES.metro(), L = rl.routeLength(r), t = rl.TRAINS.metro, sup = rl.SUPPLIES.metro(L);
    // 1 MW midway between two substations 2 km apart: each path 0.02 + 0.03 Ω, both 0.025 Ω: V = 825 − 0.025·P/V.
    const one = rl.solveSupply({ ...sup, subs: [0, 2000] }, [1000], [1e6]), V = one.volts[0];
    expect(V).toBeCloseTo(825 - (0.025 * 1e6) / V, 3); expect(one.subPower[0]).toBeCloseTo(one.subPower[1], 6);
    // A braking train with nobody to take it: the diodes block, the substations give nothing.
    const back = rl.solveSupply({ ...sup, subs: [0, 2000] }, [1000], [-1e6]);
    expect(back.subPower.every((x) => x === 0)).toBe(true); expect(back.volts[0]).toBeLessThanOrEqual(sup.vmax + 30);
    const go = (every: number, n: number) => { const sp = rl.supplyFor({ ...sup, subs: rl.spaced(L, every) }, 0.5); const run = rl.railLine(r, Array.from({ length: n }, (_, k) => ({ train: t, depart: k * 60 })), { block: 400, supply: sp.step }); return { log: sp.log, run }; };
    const near = go(2000, 5), far = go(5200, 5), alone = go(2000, 1);
    expect(Math.min(...near.log.minVolt)).toBeGreaterThan(Math.min(...far.log.minVolt));
    expect(near.log.lossKwh).toBeLessThan(far.log.lossKwh);
    // Alone, almost nothing it gives back is used; with trains around, much of it is.
    expect(alone.log.regenUsedKwh).toBeLessThan(0.05 * alone.log.regenWastedKwh);
    expect(near.log.regenUsedKwh).toBeGreaterThan(0.3 * near.log.regenWastedKwh);
    // Substations only at the ends sag the line under five trains: they trip and arrive later.
    expect(far.log.tripped).toBeGreaterThan(0);
    expect(Math.max(...far.run.trains.map((x) => x.arrive))).toBeGreaterThan(Math.max(...rl.railLine(r, Array.from({ length: 5 }, (_, k) => ({ train: t, depart: k * 60 })), { block: 400 }).trains.map((x) => x.arrive)));
  });
  it('25 kV AC (M491d): the phasor drop by hand, reactance and power factor, single-end feeding, neutral sections', () => {
    const L = 100000, base = rl.SUPPLIES.ac25(L), sup = { ...base, rs: 0, subs: [0, 100000], ac: { ...base.ac!, xs: 0, xline: 0, pf: 1 } };
    // Resistance only, unity power factor, 10 km out: V = 27500 − 1.7·P/V.
    const one = rl.solveSupply(sup, [10000], [5e6]), V = one.volts[0];
    expect(V).toBeCloseTo(27500 - (1.7 * 5e6) / V, 0);
    // Only the near substation feeds it (the far one is past the neutral section).
    expect(one.subPower[1]).toBe(0); expect(one.subPower[0]).toBeCloseTo(5e6 + one.loss, -3);
    // Reactance and a lagging power factor sag it far more than the resistance alone.
    const real = rl.solveSupply(base, [40000], [8e6]).volts[0], noX = rl.solveSupply({ ...base, ac: { ...base.ac!, xline: 0, xs: 0 } }, [40000], [8e6]).volts[0];
    expect(27500 - real).toBeGreaterThan(2 * (27500 - noX));
    expect(rl.solveSupply({ ...base, ac: { ...base.ac!, pf: 0.8 } }, [40000], [8e6]).volts[0]).toBeLessThan(real);
    // Autotransformers hold it higher than plain rail return, booster transformers lower.
    expect(rl.solveSupply(rl.SUPPLIES.ac25at(L), [40000], [8e6]).volts[0]).toBeGreaterThan(real);
    expect(rl.solveSupply(rl.SUPPLIES.ac25bt(L), [40000], [8e6]).volts[0]).toBeLessThan(real);
    // A braking train feeds the grid back (negative substation power, nothing burnt).
    const back = rl.solveSupply(base, [20000], [-3e6]);
    expect(back.subPower[0]).toBeLessThan(0); expect(back.given[0]).toBe(-3e6);
    // On the intercity line: trains coast through the neutral section at 50 km and all braking is taken.
    const r = rl.ROUTES.intercity(), t = rl.TRAINS.intercity, feed = rl.supplyFor(rl.SUPPLIES.ac25(rl.routeLength(r)), 0.5);
    const run = rl.railLine(r, [0, 300, 600].map((d) => ({ train: t, depart: d })), { supply: feed.step });
    expect(feed.log.neutral).toBeGreaterThan(3); expect(feed.log.stuck).toBe(0); expect(feed.log.tripped).toBe(0);
    expect(feed.log.regenWastedKwh).toBeLessThan(0.01 * feed.log.regenUsedKwh);
    expect(Math.min(...feed.log.minVolt)).toBeGreaterThan(19000);
    expect(run.trains.every((x) => Number.isFinite(x.arrive))).toBe(true);    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, ~, a] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25at'); [~, ~, b] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', struct('Xline', 0.42, 'PowerFactor', 0.8, 'Substations', [0 100000])); figure; railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25');");
    const f = (n: string, k: string) => { const v = lab.vars.get(n); return v?.k === 'struct' ? toMat(v.f.get(k)!).d[0] : NaN; };
    expect(f('a', 'MinVoltage')).toBeGreaterThan(f('b', 'MinVoltage')); expect(f('a', 'NeutralSeconds')).toBeGreaterThan(0); expect(f('b', 'NeutralSeconds')).toBeGreaterThan(0);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("t = trainModel('metro'); r = railRoute('metro'); [x, info] = trainRun(t, r, 'Coast', 0.1); m = info.Minutes; mine = railRoute([1000 0 0 80; 500 10 400 60], [0 1500]); [y, yi] = trainRun(t, mine); [h, n] = railHeadway(trainModel('intercity'), 200, 'Moving', 1); figure; trainRun(trainModel('intercity'), 'intercity'); vmax = t.MaxSpeed; [lt, lruns] = railLine('metro', trainModel('metro'), [0 60 120], 'Signals', 'fixed', 'Block', 400); dl = lt.Delay; nr = numel(lruns); figure; railLine('metro', trainModel('metro'), [0 60 120], 'Signals', 'moving'); lm = railLine('intercity', {trainModel('freight'), trainModel('intercity')}, [0 300]); hm = lm.Held; [st, sr, sinfo] = railLine('metro', trainModel('metro'), [0 60 120], 'Supply', 'metro', 'SubstationSpacing', 2600); mv = sinfo.MinVoltage; figure; railLine('metro', trainModel('metro'), [0 60], 'Supply', struct('Vnom', 750, 'V0', 825, 'Vmin', 500, 'Vmax', 950, 'Rs', 0.02, 'Rline', 0.03, 'Substations', [0 5200]));");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('m')[0]).toBeGreaterThan(7); expect(d('vmax')[0]).toBeCloseTo(80, 9); expect(d('n')[0]).toBeGreaterThan(30);
    expect(d('mv')[0]).toBeGreaterThan(400); expect(d('mv')[0]).toBeLessThan(750);
    expect(d('dl')[0]).toBeCloseTo(0, 5); expect(d('dl')[2]).toBeGreaterThan(0.3); expect(d('nr')).toEqual([3]); expect(d('hm')[1]).toBeGreaterThan(20);
  });
});
