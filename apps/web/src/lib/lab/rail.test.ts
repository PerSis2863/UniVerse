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
  it('single track both ways (M491e): meets at stations, timetable conflicts, delays spreading, deadlock', () => {
    const r = rl.ROUTES.metro(), t = rl.TRAINS.metro;
    // The reversed route is the same line read backwards.
    const b = rl.reversed(r);
    expect(rl.routeLength(b)).toBe(rl.routeLength(r)); expect(b.sections[0].grade).toBe(-r.sections.at(-1)!.grade); expect(b.stations).toEqual([0, 900, 2200, 3100, 4300, 5200]);
    // Both leave their ends at once: they're planned into the same section (a conflict), one waits for the other.
    const both = rl.railSingle(r, [{ train: t, dir: 1, depart: 0 }, { train: t, dir: -1, depart: 0 }]);
    expect(both.conflicts.some((c) => c.meet)).toBe(true); expect(Number.isNaN(both.deadlock)).toBe(true);
    expect(both.trains.every((x) => Number.isFinite(x.arrive))).toBe(true);
    expect(both.trains.flatMap((x) => x.waits).filter((w) => w.for === 'meet').length).toBeGreaterThan(0);
    expect(Math.max(...both.trains.map((x) => x.delay))).toBeGreaterThan(20);
    // Never two trains in one section: at no moment are they between the same two stations.
    const st = both.stations, secOf = (s: number) => st.findIndex((x, j) => j < st.length - 1 && s > x + 1 && s < st[j + 1] - 1);
    both.trains[0].s.forEach((s, i) => { const a = secOf(s); if (a >= 0) expect(secOf(both.trains[1].s[i])).not.toBe(a); });
    // The second leaves after the first has arrived: no conflicts, nobody late (the padding keeps them early or on time).
    const apart = rl.railSingle(r, [{ train: t, dir: 1, depart: 0 }, { train: t, dir: -1, depart: 900 }]);
    expect(apart.conflicts.length).toBe(0); expect(apart.trains.every((x) => x.delay <= 0)).toBe(true);
    // Timetabled to meet cleanly at a station. The first train 2 minutes late: the other waits for it (the delay
    // spreads); 2½ minutes late: the meet moves to an earlier station and the late train waits there on top.
    const first = rl.railSingle(r, [{ train: t, dir: 1, depart: 0 }]).trains[0], other = rl.railSingle(r, [{ train: t, dir: -1, depart: 0 }]).trains[0];
    const dep = first.plan[3] + r.dwell - other.plan[2];
    const go = (late: number) => rl.railSingle(r, [{ train: t, dir: 1, depart: 0, late }, { train: t, dir: -1, depart: dep }]).trains;
    const clean = go(0), two = go(120), more = go(150);
    expect(clean.every((x) => x.waits.length === 0 && x.delay <= 0)).toBe(true);
    expect(two[1].delay).toBeGreaterThan(clean[1].delay + 30); expect(two[1].waits.some((w) => w.for === 'meet')).toBe(true);
    expect(more[0].delay).toBeGreaterThan(150 + 10); expect(more[0].waits.some((w) => w.for === 'meet')).toBe(true);
    // Stations with one track each can't pass trains: facing each other, they lock.
    const lock = rl.railSingle(r, ([1, 1, -1, -1] as const).map((dir, k) => ({ train: t, dir, depart: (k % 2) * 60 })), { tracks: 1 });
    expect(Number.isFinite(lock.deadlock)).toBe(true);    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[st, cl, dl] = railSingle('metro', trainModel('metro'), [1 -1], [0 0]); d = st.Delay; mt = sum(st.Meets); nc = numel(cl.Section); figure; railSingle('metro', trainModel('metro'), [1 -1 1], [0 60 300], 'Late', [0 0 60]); [~, ~, dl2] = railSingle('metro', trainModel('metro'), [1 1 -1 -1], [0 60 0 60], 'Tracks', 1);");
    const v = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(v('mt')[0]).toBeGreaterThan(0); expect(v('nc')[0]).toBeGreaterThan(0); expect(Number.isNaN(v('dl')[0])).toBe(true); expect(v('dl2')[0]).toBeGreaterThan(0);
    expect(Math.max(...v('d'))).toBeGreaterThan(0.3);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("t = trainModel('metro'); r = railRoute('metro'); [x, info] = trainRun(t, r, 'Coast', 0.1); m = info.Minutes; mine = railRoute([1000 0 0 80; 500 10 400 60], [0 1500]); [y, yi] = trainRun(t, mine); [h, n] = railHeadway(trainModel('intercity'), 200, 'Moving', 1); figure; trainRun(trainModel('intercity'), 'intercity'); vmax = t.MaxSpeed; [lt, lruns] = railLine('metro', trainModel('metro'), [0 60 120], 'Signals', 'fixed', 'Block', 400); dl = lt.Delay; nr = numel(lruns); figure; railLine('metro', trainModel('metro'), [0 60 120], 'Signals', 'moving'); lm = railLine('intercity', {trainModel('freight'), trainModel('intercity')}, [0 300]); hm = lm.Held; [st, sr, sinfo] = railLine('metro', trainModel('metro'), [0 60 120], 'Supply', 'metro', 'SubstationSpacing', 2600); mv = sinfo.MinVoltage; figure; railLine('metro', trainModel('metro'), [0 60], 'Supply', struct('Vnom', 750, 'V0', 825, 'Vmin', 500, 'Vmax', 950, 'Rs', 0.02, 'Rline', 0.03, 'Substations', [0 5200]));");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('m')[0]).toBeGreaterThan(7); expect(d('vmax')[0]).toBeCloseTo(80, 9); expect(d('n')[0]).toBeGreaterThan(30);
    expect(d('mv')[0]).toBeGreaterThan(400); expect(d('mv')[0]).toBeLessThan(750);
    expect(d('dl')[0]).toBeCloseTo(0, 5); expect(d('dl')[2]).toBeGreaterThan(0.3); expect(d('nr')).toEqual([3]); expect(d('hm')[1]).toBeGreaterThan(20);
  });
  it('passing loops, non-stop trains, a junction and the dispatcher (M491f)', { timeout: 60_000 }, () => {
    const r = rl.ROUTES.intercity(), t = rl.TRAINS.intercity, loops = [21000, 71000];
    const two = [{ train: t, dir: 1 as const, depart: 0 }, { train: t, dir: -1 as const, depart: 1200, priority: 3 }];
    // Without loops the return train waits ~17 minutes at the far end; loops let them pass in between.
    const plain = rl.railSingle(r, two), looped = rl.railSingle(r, two, { loops });
    expect(plain.trains[1].delay).toBeGreaterThan(900);
    expect(looped.totalDelay).toBeLessThan(plain.totalDelay / 3);
    expect(looped.nodes).toEqual([0, 21000, 42000, 71000, 100000]);
    // A loop isn't a stop: a train alone runs through it without waiting.
    const alone = rl.railSingle(r, [two[0]], { loops }).trains[0];
    expect(alone.stops).toEqual([true, false, true, false, true]); expect(alone.waits).toEqual([]); expect(Math.abs(alone.delay)).toBeLessThan(120);
    // The dispatcher: by priority the important train goes first, and its weighted delay is lower than first come.
    const pr = rl.railSingle(r, two, { dispatch: 'priority' });
    expect(pr.trains[1].delay).toBeLessThan(60);
    expect(pr.trains[0].waits.reduce((s, x) => s + x.seconds, 0)).toBeGreaterThan(600);
    expect(pr.trains.reduce((s, x) => s + x.priority * Math.max(0, x.delay), 0)).toBeLessThan(pr.firstCome);
    // The best order is never worse than first come, first served.
    const m = rl.ROUTES.metro(), mt = rl.TRAINS.metro;
    const many = [0, 1, 2].flatMap((k) => [{ train: mt, dir: 1 as const, depart: k * 300, priority: k === 1 ? 4 : 1 }, { train: mt, dir: -1 as const, depart: k * 300 + 120, late: k === 0 ? 120 : 0 }]);
    const best = rl.railSingle(m, many, { dispatch: 'best' });
    expect(best.trains.reduce((s, x) => s + x.priority * Math.max(0, x.delay), 0)).toBeLessThanOrEqual(best.firstCome + 1e-6);
    // An express that runs through four stations is there sooner.
    const all = rl.railSingle(m, [{ train: mt, dir: 1, depart: 0 }]).trains[0], fast = rl.railSingle(m, [{ train: mt, dir: 1, depart: 0, skip: [1, 2, 3, 4] }]).trains[0];
    expect(fast.arrive).toBeLessThan(all.arrive - 150); expect(fast.stops.filter(Boolean).length).toBe(2);
    // A branch train joins at the junction (station 3) and another leaves there: neither runs on the rest of the line.
    const br = rl.railSingle(m, [{ train: mt, dir: 1, depart: 0, from: 2 }, { train: mt, dir: -1, depart: 0, to: 2 }]);
    expect(br.trains[0].nodes[0]).toBe(2100); expect(Math.min(...br.trains[0].s)).toBeGreaterThan(2099);
    expect(br.trains[1].nodes.at(-1)).toBe(2100); expect(Number.isFinite(br.trains[1].arrive)).toBe(true);
    expect(Number.isFinite(br.deadlock)).toBe(false);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("st = railSingle('intercity', trainModel('intercity'), [1 -1], [0 1200], 'Loops', [21e3 71e3], 'Dispatch', 'priority', 'Priority', [1 3]); d = st.Delay; e = railSingle('metro', trainModel('metro'), 1, 0, 'Skip', {[2 3 4 5]}); b = railSingle('metro', trainModel('metro'), 1, 0, 'From', 3); figure; railSingle('intercity', trainModel('intercity'), [1 -1], [0 1200], 'Loops', [21e3 71e3]);");
    expect((lab.vars.get('d') as { d: Float64Array }).d[1]).toBeLessThan(1);
    expect((lab.vars.get('e') as { d: Float64Array }) ).toBeTruthy();
  });
  it('storage on the line and interference from AC lines (M491g)', { timeout: 60_000 }, () => {
    const r = rl.ROUTES.metro(), t = rl.TRAINS.metro, L = rl.routeLength(r);
    // One moment by hand: a unit midway supports a train drawing 3 MW and soaks up 1 MW of a train braking 2 MW.
    const sup = { ...rl.SUPPLIES.metro(L), subs: [0, L] }, plain = rl.solveSupply(sup, [L / 2], [3e6]);
    const stored = { ...sup, storage: rl.storageFor(sup, [L / 2]) }, help = rl.solveSupply(stored, [L / 2], [3e6], [0.5]);
    expect(help.volts[0]).toBeGreaterThan(plain.volts[0] + 50); expect(help.storePower[0]).toBeCloseTo(-1e6, -4);
    const brake = rl.solveSupply(stored, [L / 2], [-2e6], [0.5]);
    expect(brake.storePower[0]).toBeCloseTo(1e6, -4); expect(brake.given[0]).toBeCloseTo(-1e6, -4);
    // Full, it takes nothing; empty, it gives nothing.
    expect(rl.solveSupply(stored, [L / 2], [-2e6], [1]).storePower[0]).toBe(0);
    expect(rl.solveSupply(stored, [L / 2], [3e6], [0]).storePower[0]).toBe(0);
    // Over a run: less from the substations and more braking reused.
    const go = (s: rl.Supply) => { const f = rl.supplyFor(s, 0.5); rl.railLine(r, [{ train: t, depart: 0 }, { train: t, depart: 150 }], { supply: f.step }); return f.log; };
    const a = go(sup), b = go(stored);
    expect(b.fromSubsKwh).toBeLessThan(0.9 * a.fromSubsKwh); expect(b.regenUsedKwh).toBeGreaterThan(2 * a.regenUsedKwh);
    expect(b.storedKwh).toBeGreaterThan(0); expect(b.returnedKwh).toBeGreaterThan(0); expect(b.returnedKwh).toBeLessThan(b.storedKwh);
    expect(b.soc.every((x) => x.every((q) => q >= 0 && q <= 1))).toBe(true);
    // Carson's mutual impedance at 50 Hz, 30 m, 100 Ω·m: 0.049 + j0.216 Ω/km.
    const zm = rl.mutualZ({ sep: 30, rho: 100 });
    expect(zm[0]).toBeCloseTo(0.0493, 4); expect(zm[1]).toBeCloseTo(0.4 * Math.PI * 0.05 * Math.log(658 * Math.sqrt(2) / 30), 6);
    // A fault at a 50 km section's far end: V0 / |Zs + Zline·25 km| through the cable's 25 km, screened by half.
    const R = rl.ROUTES.intercity(), T = rl.TRAINS.intercity, L2 = rl.routeLength(R), ac = rl.SUPPLIES.ac25(L2);
    const f0 = rl.faultEmf(ac, { sep: 30, rho: 100 })[0], If = 27500 / Math.hypot(0.3 + 0.17 * 25, 3.1 + 0.42 * 25);
    expect(f0.current).toBeCloseTo(If, 3); expect(f0.emf).toBeCloseTo(Math.hypot(...zm) * 0.5 * If * 25, 3);
    // Running trains: rail return far over 60 V, booster transformers and autotransformers far less; farther is less.
    const emf = (k: string, sep = 30) => { const f = rl.supplyFor(rl.SUPPLIES[k](L2), 0.5, { sep, rho: 100 }); rl.railLine(R, [{ train: T, depart: 0 }, { train: T, depart: 300 }], { supply: f.step }); return f.log.maxEmf; };
    const rail = emf('ac25');
    expect(rail).toBeGreaterThan(rl.EMF_LIMIT * 5); expect(emf('ac25bt')).toBeLessThan(rail / 2); expect(emf('ac25at')).toBeLessThan(rail / 3); expect(emf('ac25', 300)).toBeLessThan(rail);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, ~, s1] = railLine('metro', trainModel('metro'), [0 150], 'Supply', 'metro', 'SubstationSpacing', 5200, 'Storage', 2600); [~, ~, s2] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25', 'Cable', [30 100]); e = inducedVoltage(200, 25e3, 30, 100, 0.5); figure; railLine('metro', trainModel('metro'), [0 150], 'Supply', 'metro', 'Storage', struct('At', [1300 3900], 'Power', 2e6, 'Energy', 20));");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('s1', 'StoredKWh')).toBeGreaterThan(0); expect(f('s2', 'MaxInducedVolts')).toBeCloseTo(rail, 6); expect(f('s2', 'FaultInducedVolts')).toBeGreaterThan(1000);
    expect(toMat(lab.vars.get('e')!).d[0]).toBeCloseTo(Math.hypot(...zm) * 0.5 * 200 * 25, 6);
  });
  it("overtaking at loops and stations, and the train's length (M491h)", { timeout: 60_000 }, () => {
    const r = rl.ROUTES.intercity(), loops = [21000, 71000];
    const two = [{ train: rl.TRAINS.freight, dir: 1 as const, depart: 0 }, { train: rl.TRAINS.intercity, dir: 1 as const, depart: 1200, priority: 3 }];
    // First come: the intercity is stuck behind the freight train; by priority the freight waits at 42 km and is overtaken.
    const fc = rl.railSingle(r, two, { loops }), pr = rl.railSingle(r, two, { loops, dispatch: 'priority' });
    expect(fc.trains[1].delay).toBeGreaterThan(900); expect(pr.trains[1].delay).toBeLessThan(60);
    expect(pr.trains[1].arrive).toBeLessThan(pr.trains[0].arrive); expect(pr.trains[0].waits.some((x) => x.at === 42000)).toBe(true);
    // A long train holds the section behind it until its tail is out: a follower waits longer.
    const m = rl.ROUTES.metro(), go = (len: number) => rl.railSingle(m, [0, 90].map((depart) => ({ train: { ...rl.TRAINS.metro, length: len }, dir: 1 as const, depart }))).trains[1];
    expect(go(400).arrive).toBeGreaterThan(go(0).arrive);
  });
  it('rail-to-earth voltage and storage on AC lines (M491i)', { timeout: 60_000 }, () => {
    const R = rl.ROUTES.intercity(), T = rl.TRAINS.intercity, L = rl.routeLength(R);
    // One train by hand: I·Z0/2 times the share returning through the ground.
    const ac = rl.SUPPLIES.ac25(L);
    expect(rl.railVolts(ac, [5000], [300])[0]).toBeCloseTo((Math.sqrt(rl.RAIL_Z * rl.RAIL_RE) / 2) * 0.5 * 300, 9);
    const run = (k: string, ends = false, store = false) => {
      const sup = { ...rl.SUPPLIES[k](L), ...(ends ? { subs: [0, L] } : {}) };
      if (store) sup.storage = rl.storageFor(sup, [L / 4, (3 * L) / 4], 4e6, 200);
      const f = rl.supplyFor(sup, 0.5); rl.railLine(R, [0, 200, 400].map((depart) => ({ train: T, depart })), { supply: f.step }); return f.log;
    };
    const rr = run('ac25'), bt = run('ac25bt'), at = run('ac25at');
    expect(rr.maxRail).toBeGreaterThan(rl.RAIL_LIMIT); expect(bt.maxRail).toBeLessThan(rr.maxRail / 2); expect(at.maxRail).toBeLessThan(bt.maxRail);
    // Fed only from the ends, storage holds the voltage up and trains trip for less time.
    const weak = run('ac25', true), held = run('ac25', true, true);
    expect(Math.min(...held.minVolt)).toBeGreaterThan(Math.min(...weak.minVolt) + 1000); expect(held.tripped).toBeLessThan(weak.tripped);
    expect(held.storedKwh).toBeGreaterThan(0); expect(held.returnedKwh).toBeGreaterThan(0);
  });
  it('loops too short for a long train (M491j)', { timeout: 60_000 }, () => {
    const r = rl.ROUTES.intercity(), loops = [21000, 71000];
    const two = [{ train: rl.TRAINS.freight, dir: 1 as const, depart: 0 }, { train: rl.TRAINS.intercity, dir: -1 as const, depart: 1200 }];
    const long = rl.railSingle(r, two, { loops }), short = rl.railSingle(r, two, { loops, loopLength: 400 });
    // The 600 m freight train can't wait in a 400 m loop: it never stops in one, and the meet moves to the station.
    expect(short.trains[0].waits.every((x) => !loops.includes(x.at))).toBe(true);
    expect(short.trains.some((t) => t.waits.some((x) => x.at === 42000))).toBe(true);
    expect(long.trains[1].waits.some((x) => x.at === 71000)).toBe(true);
    // Loops long enough change nothing.
    expect(rl.railSingle(r, two, { loops, loopLength: 1000 }).trains.map((t) => t.arrive)).toEqual(long.trains.map((t) => t.arrive));
  });
  it('rails bonded to earth at substations, and DC stray currents (M491k)', { timeout: 60_000 }, () => {
    // AC: a train 500 m from its substation; bonding the rails there cuts their voltage by 1 − e^(−2·g·0.5 km), and to 0 at the bond.
    const L = 100000, sup = rl.SUPPLIES.ac25(L), g = Math.sqrt(rl.RAIL_Z / rl.RAIL_RE), free = rl.railVolts(sup, [500], [300])[0];
    sup.ac!.bonded = true;
    expect(rl.railVolts(sup, [500], [300])[0]).toBeCloseTo(free * (1 - Math.exp(-2 * g * 0.5)), 9);
    expect(rl.railVolts(sup, [0, 500], [0, 300])[0]).toBeCloseTo(0, 9);
    // DC: I·r·d/2 under the train, I·r·d²/(8·R) leaking, by hand; leakier track (2 Ω·km) leaks five times as much.
    const m = { ...rl.SUPPLIES.metro(5200), subs: [0, 5200] }, dc = rl.dcStray({ ...m, leak: 10 }, [1000], [2000]), rr = 0.4 * m.rline;
    expect(dc.rail[0]).toBeCloseTo((2000 * rr * 1) / 2, 9); expect(dc.stray).toBeCloseTo((2000 * rr) / 80, 9);
    const run = (leak: number) => { const f = rl.supplyFor({ ...rl.SUPPLIES.metro(rl.routeLength(rl.ROUTES.metro())), leak }, 0.5); rl.railLine(rl.ROUTES.metro(), [0, 90, 180].map((depart) => ({ train: rl.TRAINS.metro, depart })), { supply: f.step }); return f.log; };
    const a = run(10), b = run(2);
    expect(a.maxRail).toBeGreaterThan(5); expect(b.strayAs).toBeCloseTo(5 * a.strayAs, 6);
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, ~, s] = railLine('metro', trainModel('metro'), [0 90 180], 'Supply', 'metro', 'Leakage', 2); [~, ~, q] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25', 'Bonded', 1);");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('s', 'StrayCurrent')).toBeGreaterThan(0); expect(f('s', 'IronLossKgPerYear')).toBeCloseTo(f('s', 'StrayCurrent') * rl.IRON_KG_PER_AYEAR, 9); expect(f('q', 'MaxRailVolts')).toBeGreaterThan(0);
  });
  it('tracks cross-bonded and the ground\'s own resistance (M491l)', { timeout: 60_000 }, () => {
    const m = { ...rl.SUPPLIES.metro(5200), subs: [0, 5200] }, rr = 0.4 * m.rline, one = rl.dcStray({ ...m, leak: 10 }, [1000], [2000]);
    // Cross-bonded: half the rails' voltage, the same stray current (DC); half on AC too.
    const two = rl.dcStray({ ...m, leak: 10, crossBond: true }, [1000], [2000]);
    expect(two.rail[0]).toBeCloseTo(one.rail[0] / 2, 9); expect(two.stray).toBeCloseTo(one.stray, 9);
    const ac = rl.SUPPLIES.ac25(100000);
    expect(rl.railVolts({ ...ac, crossBond: true }, [30000], [300])[0]).toBeCloseTo(rl.railVolts(ac, [30000], [300])[0] / 2, 9);
    // The ground's resistance: 0 gives the exact two-conductor forms, close to the short-section ones over 1 km.
    const ex = rl.dcStray({ ...m, leak: 10, earth: 0 }, [1000], [2000]), gm = Math.sqrt(rr / 10);
    expect(ex.rail[0]).toBeCloseTo((rr * 2000 * Math.tanh(gm / 2)) / gm, 9); expect(ex.stray / one.stray).toBeCloseTo(1, 3);
    // More of it, less stray current; and never more than r/(r + r_g) of the train's current, however leaky.
    const s1 = rl.dcStray({ ...m, leak: 10, earth: 0.01 }, [1000], [2000]).stray, s2 = rl.dcStray({ ...m, leak: 10, earth: 0.1 }, [1000], [2000]).stray;
    expect(s1).toBeLessThan(ex.stray); expect(s2).toBeLessThan(s1);
    expect(rl.dcStray({ ...m, leak: 0.01, earth: 0.01, subs: [0, 52000] }, [26000], [2000]).stray).toBeLessThan((2000 * rr) / (rr + 0.01));
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[~, ~, a] = railLine('metro', trainModel('metro'), [0 90 180], 'Supply', 'metro'); [~, ~, b] = railLine('metro', trainModel('metro'), [0 90 180], 'Supply', 'metro', 'CrossBonded', 1, 'EarthResistance', 0.1);");
    const f = (n: string, k: string) => toMat((lab.vars.get(n) as unknown as { f: Map<string, never> }).f.get(k)!).d[0];
    expect(f('b', 'MaxRailVolts')).toBeLessThan(f('a', 'MaxRailVolts')); expect(f('b', 'StrayCurrent')).toBeLessThan(f('a', 'StrayCurrent'));
  });
  it('the ground\'s own resistance on AC lines (M491m)', () => {
    const ac = rl.SUPPLIES.ac25(100000), plain = rl.railVolts(ac, [30000], [300])[0], gr = rl.railVolts({ ...ac, earth: rl.CARSON_50HZ }, [30000], [300])[0];
    // By hand: |z_r|·√(r_e / |z_r + r_g|)/2 · screening · I; a little lower than without it.
    const zt = Math.hypot(0.15 + rl.CARSON_50HZ, 0.55);
    expect(gr).toBeCloseTo(((rl.RAIL_Z * Math.sqrt(rl.RAIL_RE / zt)) / 2) * 0.5 * 300, 9); expect(gr).toBeLessThan(plain); expect(gr).toBeGreaterThan(0.9 * plain);
    expect(rl.railVolts({ ...ac, earth: 0 }, [30000], [300])[0]).toBeCloseTo(plain, 9);
    // Further from the train it dies away faster (a larger |z|).
    const far = (e?: number) => rl.railVolts({ ...ac, earth: e }, [30000, 32000], [300, 0])[1] / rl.railVolts({ ...ac, earth: e }, [30000, 32000], [300, 0])[0];
    expect(far(rl.CARSON_50HZ)).toBeLessThan(far());
  });
  it('how deep the return current runs in the soil (M491n)', () => {
    // Carson: ~930 m at 100 Ω·m and 50 Hz, giving the rails' usual 0.55 Ω/km; unchanged when the soil isn't given.
    expect(rl.carsonDepth(100)).toBeCloseTo(930.6, 0); expect(rl.railReactance(100)).toBeCloseTo(0.55, 3);
    const ac = rl.SUPPLIES.ac25(100000), at = (soil?: number) => rl.railVolts({ ...ac, soil }, [30000], [300])[0];
    expect(at(100)).toBeCloseTo(at(), 9);
    // Dry rock: deeper, more reactance, higher rail voltage; wet clay lower.
    expect(at(2000)).toBeGreaterThan(at()); expect(at(20)).toBeLessThan(at());
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    expect(() => lab.run("railLine('intercity', trainModel('intercity'), [0], 'Supply', 'ac25', 'Soil', 0)")).toThrow(/Soil/);
  });
});
