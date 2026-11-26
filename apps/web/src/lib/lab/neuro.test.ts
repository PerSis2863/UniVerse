import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as nr from './neuro';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion neuroscience (M496)', () => {
  it('Hodgkin–Huxley rests at −65 mV and fires about 68 times a second at 10 µA/cm²', () => {
    const quiet = nr.hodgkinHuxley(0, 50);
    expect(Math.abs(quiet.V[quiet.V.length - 1] + 65)).toBeLessThan(0.1);
    expect(quiet.spikes.length).toBe(0);
    const r = nr.hodgkinHuxley(10, 500), late = r.spikes.filter((t) => t > 100), s = nr.isiStats(late);
    expect(s.rate).toBeGreaterThan(64);
    expect(s.rate).toBeLessThan(72);
    expect(Math.max(...r.V)).toBeGreaterThan(30);
    // Below the threshold for firing again and again (about 6.2), a single spike at most.
    expect(nr.hodgkinHuxley(2, 300).spikes.length).toBe(0);
  });
  it('integrate-and-fire matches its rate formula', () => {
    for (const I of [1.6, 2, 3, 5]) {
      const r = nr.lif(I, 2000, 0.1), late = r.spikes.filter((t) => t > 200);
      expect(nr.isiStats(late).rate).toBeCloseTo(nr.lifRate(I), 6);
    }
    expect(nr.lifRate(1.4)).toBe(0); // R I = 14 mV < 15 mV to threshold
    // τ = 10, R I = 20: period 2 + 10 ln(20/5) ms.
    expect(nr.lifRate(2)).toBeCloseTo(1000 / (2 + 10 * Math.log(4)), 12);
  });
  it('Izhikevich: regular spiking adapts, fast spiking does not, chattering bursts', () => {
    const rs = nr.izhikevich(10, 1000, nr.IZH_TYPES.RS), fs = nr.izhikevich(10, 1000, nr.IZH_TYPES.FS), ch = nr.izhikevich(10, 1000, nr.IZH_TYPES.CH);
    const isi = (s: number[]) => s.slice(1).map((x, i) => x - s[i]);
    expect(isi(rs.spikes)[0]).toBeLessThan(isi(rs.spikes).at(-1)!);
    expect(fs.spikes.length).toBeGreaterThan(rs.spikes.length);
    const ci = isi(ch.spikes);
    expect(Math.max(...ci) / Math.min(...ci)).toBeGreaterThan(4); // short gaps within a burst, long between
  });
  it('a network and spike-train statistics', () => {
    const s = nr.izhNetwork(80, 20, 300, rand);
    expect(s.length).toBeGreaterThan(100);
    expect(s.every(([t, n]) => t >= 1 && t <= 300 && n >= 1 && n <= 100)).toBe(true);
    const p = nr.poisson(50, 200_000, rand);
    expect(p.length / 200).toBeCloseTo(50, -1);
    expect(nr.isiStats(p).cv).toBeCloseTo(1, 1);
    expect(nr.fano(p, 200_000, 100)).toBeCloseTo(1, 0);
    const clock = Array.from({ length: 100 }, (_, i) => 10 * i + 5);
    expect(nr.isiStats(clock).cv).toBe(0);
    expect(nr.fano(clock, 1000, 100)).toBe(0);
    const h = nr.psth(clock, 1, 1000, 100);
    expect(h.rate.every((r) => r === 100)).toBe(true);
    // b fires 3 ms after a: the correlogram peaks at +3.
    const c = nr.crossCorrelogram(clock, clock.map((t) => t + 3), 5, 1);
    expect(c.lags[c.counts.indexOf(Math.max(...c.counts))]).toBe(3);
    expect(nr.spikeTimes([0, 2, -1, 4], [0, 1, 2, 3], 1)).toEqual([0.5, 2 + 2 / 5]);
  });
  it('two neurons wired together: one drives the other', () => {
    // Neuron 1 fires on its own; each of its spikes lifts neuron 2 (no current) by 20 mV over the threshold gap.
    const r = nr.lifNetwork([[0, 0], [20, 0]], [2, 0], 200, rand);
    const one = r.spikes.filter((s) => s[1] === 1).length, two = r.spikes.filter((s) => s[1] === 2).length;
    expect(one).toBeGreaterThan(5);
    expect(two).toBeGreaterThanOrEqual(one - 1); // the last may land after the end
    expect(two).toBeLessThanOrEqual(one);
  });
  it('in the language', () => {
    const r = run("[t, V, s] = lifNeuron(2, 500); f = lifRate(2); [~, ~, ~, hs] = hodgkinHuxley(10, 100); n = numel(hs);\nrng(1); sp = izhNetwork(40, 10, 200); st = isiStats(poissonSpikes(40, 50000)); cv = st.CV;\nizhikevich(10, 300, 'Type', 'CH')\nfigure; rasterPlot(sp, 200)");
    expect(r.d('f')[0]).toBeCloseTo(1000 / (2 + 10 * Math.log(4)), 9);
    expect(r.d('n')[0]).toBeGreaterThan(5);
    expect(r.d('cv')[0]).toBeCloseTo(1, 0);
    expect(r.graphics.figures.length).toBe(2);
  });
});
