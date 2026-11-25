import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat, type Struct } from './values';
import './sciences';
import * as np from './neuro-plus';
import * as nt from './neuro-tree';
import * as nf from './neuro-files';

const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));

/** A small ABF2 file as Clampex lays it out: header, protocol, ADC, strings and data blocks. */
function abf(channels: number[][], rate: number, sweeps = 1) {
  const nch = channels.length, n = channels[0].length, b = new Uint8Array(512 * 4 + n * nch * 2), dv = new DataView(b.buffer);
  b.set([65, 66, 70, 50]); dv.setUint32(12, sweeps, true); dv.setUint16(30, 0, true);
  const sec = (o: number, block: number, bytes: number, count: number) => { dv.setUint32(o, block, true); dv.setUint32(o + 4, bytes, true); dv.setBigInt64(o + 8, BigInt(count), true); };
  const strs = '\0\0Clampex\0IN 0\0pA\0IN 1\0mV\0', sb = new TextEncoder().encode(strs);
  sec(76, 1, 512, 1); sec(92, 2, 128, nch); sec(220, 3, sb.length, 1); sec(236, 4, 2, n * nch);
  const p = 512; dv.setInt16(p, sweeps > 1 ? 5 : 3, true); dv.setFloat32(p + 2, 1e6 / rate, true); dv.setFloat32(p + 110, 10, true); dv.setInt32(p + 118, 32768, true);
  for (let c = 0; c < nch; c++) {
    const a = 1024 + c * 128;
    dv.setInt16(a, c, true); dv.setFloat32(a + 28, 1, true); dv.setFloat32(a + 40, 0.0005, true); dv.setFloat32(a + 48, 1, true);
    dv.setInt32(a + 74, 1 + 2 * c, true); dv.setInt32(a + 78, 2 + 2 * c, true);
  }
  b.set(sb, 1536);
  const scale = 10 / (32768 * 0.0005);
  for (let k = 0; k < n; k++) for (let c = 0; c < nch; c++) dv.setInt16(2048 + (k * nch + c) * 2, Math.round(channels[c][k] / scale), true);
  return { bytes: b, scale };
}
const swcChain = (L: number[], d: number[]) => ['1 1 0 0 0 1 -1', ...L.map((_, i) => `${i + 2} 3 ${L.slice(0, i + 1).reduce((s, x) => s + x, 0)} 0 0 ${d[i] / 2} ${i + 1}`)].join('\n');
const run = (code: string, files: [string, Uint8Array][] = []) => {
  let out = ''; const graphics = new Graphics(), store = new FileStore();
  for (const [n, b] of files) store.load(n, { bytes: b, type: '' } as never);
  const lab = new Lab({ out: (t) => { out += t; }, graphics, files: store } as never); lab.run(code);
  return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] };
};

describe('Hyperion neuroscience, more left-outs (M517)', () => {
  it('matches the straight cable when the tree has no branches', () => {
    const n = 60, dx = 10, d = 2, Ri = 100, Rm = 1 / 0.3e-3;
    const samples = Array.from({ length: n }, (_, i) => ({ id: i + 1, type: 3, x: i * dx, y: 0, z: 0, r: d / 2, parent: i ? i : -1 }));
    const t = nt.buildTree(samples, dx);
    t.len[0] = dx; // the root as a piece of the same cable
    const r = nt.treeNeuron(t, { ...nt.TREE, Ri, Rm, Cm: 1, rest: -65, T: 20, dt: 0.01, active: () => false, stim: [{ node: 0, I: 0.1, start: 0, stop: Infinity }], synapses: [], record: [0, n - 1] });
    const c = np.cable({ ...np.CABLE, length: n * dx, diam: d, n, Ri, Rm, I: 0.1, T: 20, dt: 0.01 });
    const last = c.V[c.V.length - 1];
    expect(r.final[0]).toBeCloseTo(last[0], 6);
    expect(r.final[n - 1]).toBeCloseTo(last[n - 1], 6);
  });
  it("obeys Rall's 3/2 rule: two daughters that match it look like one cylinder", () => {
    const dd = 2 * 2 ** (-2 / 3), L2 = 300, Ld = L2 * Math.sqrt(dd / 2);
    const branched = ['1 1 0 0 0 1 -1', '2 3 200 0 0 1 1', `3 3 ${200 + Ld} 50 0 ${dd / 2} 2`, `4 3 ${200 + Ld} -50 0 ${dd / 2} 2`].join('\n');
    const fix = (s: string) => nt.parseSWC(s).map((p) => (p.id > 2 ? { ...p, x: 200 + Ld, y: 0 * p.y } : p));
    // Straight daughters (their length is what counts): put them along x from the branch point.
    const mk = (s: ReturnType<typeof nt.parseSWC>) => nt.buildTree(s, 5);
    const opts = { ...nt.TREE, T: 400, dt: 0.1, active: () => false, stim: [{ node: 0, I: 0.05, start: 0, stop: Infinity }], synapses: [], record: [0] };
    const a = nt.treeNeuron(mk(fix(branched)), opts).final[0], b = nt.treeNeuron(mk(nt.parseSWC(swcChain([200, L2], [2, 2]))), opts).final[0];
    expect(Math.abs((a + 65) / (b + 65) - 1)).toBeLessThan(0.01);
  });
  it('carries a spike down an active axon, and an EPSP fades on the way from a far dendrite', () => {
    const swc = ['1 1 0 0 0 10 -1', ...Array.from({ length: 50 }, (_, i) => `${i + 2} 2 ${10 + 20 * (i + 1)} 0 0 0.5 ${i + 1}`), ...Array.from({ length: 30 }, (_, i) => `${i + 52} 3 ${-10 - 20 * (i + 1)} 0 0 1 ${i ? i + 51 : 1}`)].join('\n');
    const t = nt.buildTree(nt.parseSWC(swc), 20), axonEnd = t.id.lastIndexOf(51), dendEnd = t.id.lastIndexOf(81);
    const r = nt.treeNeuron(t, { ...nt.TREE, celsius: 20, T: 15, dt: 0.01, active: (ty) => ty !== 3, stim: [{ node: 0, I: 2, start: 1, stop: 2 }], synapses: [], record: [0, axonEnd] });
    expect(r.peak[axonEnd]).toBeGreaterThan(20);
    expect(r.arrival[axonEnd]).toBeGreaterThan(r.arrival[t.id.lastIndexOf(10)]);
    const s = nt.treeNeuron(t, { ...nt.TREE, T: 30, dt: 0.025, active: () => false, stim: [], synapses: [{ node: dendEnd, times: [5], gmax: 2, rise: 0.5, decay: 3, E: 0 }], record: [dendEnd, 0] });
    const vd = Math.max(...s.V.map((v) => v[0])), vs = Math.max(...s.V.map((v) => v[1]));
    expect(vd).toBeGreaterThan(-60);
    expect(vs - -65).toBeLessThan((vd - -65) / 2);
    expect(vs).toBeGreaterThan(-65);
  });
  it('cleans a raw recording: band-pass, notch, common average', () => {
    const fs = 30000, n = 30000, sine = (f: number) => Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / fs));
    const amp = (x: ArrayLike<number>) => Math.max(...Array.from(x).slice(n / 4, (3 * n) / 4).map(Math.abs));
    expect(amp(nt.cleanRecording(sine(1000), fs, { band: [300, 6000], order: 4 }))).toBeCloseTo(1, 1);
    expect(amp(nt.cleanRecording(sine(50), fs, { band: [300, 6000], order: 4 }))).toBeLessThan(0.001);
    expect(amp(nt.cleanRecording(sine(50), fs, { notch: 50, order: 4 }))).toBeLessThan(0.01);
    expect(amp(nt.cleanRecording(sine(130), fs, { notch: 50, order: 4 }))).toBeGreaterThan(0.95);
    const common = sine(7), ch = [0, 1, 2, 3].map((c) => common.map((v, i) => v + (c === 1 && i === 100 ? 5 : 0)));
    const ca = nt.commonAverage(ch);
    expect(Math.max(...ca[0].map(Math.abs))).toBeLessThan(1e-12);
    expect(ca[1][100]).toBeCloseTo(5, 9);
  });
  it('sorts spikes out of a raw recording once it is filtered', () => {
    const rand = seeded(5), fs = 24000, n = fs * 10, x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = 10 * gauss(rand) + 300 * Math.sin((2 * Math.PI * 4 * i) / fs) + 80 * Math.sin((2 * Math.PI * 50 * i) / fs);
    const shape = (A: number, w: number, B: number) => Array.from({ length: 48 }, (_, j) => { const s = (j - 12) / fs * 1000; return -A * Math.exp(-((s / w) ** 2)) + B * Math.exp(-(((s - 0.5) / (2 * w)) ** 2)); });
    const units = [shape(120, 0.15, 20), shape(70, 0.35, 35)], truth: [number, number][] = [];
    units.forEach((u, k) => { let t = 0; for (;;) { t += Math.floor(-Math.log(1 - rand()) * fs / 8) + 72; if (t + 48 >= n) break; truth.push([t + 12, k + 1]); for (let j = 0; j < 48; j++) x[t + j] += u[j]; } });
    const y = nt.cleanRecording(x, fs, { band: [300, 6000], notch: 50, order: 4 }), r = np.sortSpikes(y, fs, np.SORT, seeded(3));
    let hit = 0, agree = 0;
    for (const [tt, unit] of truth) { const i = r.peaks.findIndex((p) => Math.abs(p - tt) <= 5); if (i < 0) continue; hit++; if (r.cluster[i] === unit) agree++; }
    expect(r.k).toBe(2);
    expect(hit / truth.length).toBeGreaterThan(0.85);
    expect(Math.max(agree, hit - agree) / hit).toBeGreaterThan(0.9);
  });
  it('reads ABF 2 and NWB 2 files', () => {
    const a = Array.from({ length: 300 }, (_, i) => 100 * Math.sin(i / 10)), b = Array.from({ length: 300 }, (_, i) => -50 + i / 10);
    const f = abf([a, b], 20000), r = nf.readAbf(f.bytes);
    expect([r.rate, r.sweeps, r.channels, r.units]).toEqual([20000, 1, ['IN 0', 'IN 1'], ['pA', 'mV']]);
    r.data[0][0].forEach((v, i) => expect(Math.abs(v - a[i])).toBeLessThanOrEqual(f.scale / 2 + 1e-9));
    expect(() => nf.readAbf(new TextEncoder().encode('ABF ' + ' '.repeat(600)))).toThrow(/ABF 1/);
    const s = nf.readNwb(fixture('nwb-small.nwb'));
    expect(s.map((x) => x.name)).toEqual(['ElectricalSeries', 'Position']);
    expect([s[0].rate, s[0].start, s[0].unit, s[0].data.length, s[0].data[0].length]).toEqual([1000, 2, 'volts', 2, 1000]);
    expect(s[0].data[1][999]).toBeCloseTo(999e-3 + 0.5, 9);
    expect(s[0].data[0][50]).toBeCloseTo(Math.round(1000 * Math.sin(2 * Math.PI * 5 * 0.05)) * 1e-3 + 0.5, 9);
    expect([s[1].timestamps, s[1].rate, s[1].data[0]]).toEqual([[0, 0.5, 1], 2, [1, 2, 4]]);
  });
  it('works from the language', () => {
    const swc = ['1 1 0 0 0 8 -1', ...Array.from({ length: 10 }, (_, i) => `${i + 2} 3 ${20 * (i + 1)} ${5 * i} 0 1 ${i + 1}`), '12 3 0 40 0 1 1', '13 3 0 80 0 0.8 12'].join('\n');
    const { bytes } = abf([Array.from({ length: 200 }, (_, i) => i)], 10000);
    const r = run(`m = swcRead(sprintf('${swc.replace(/\n/g, '\\n')}'));\n[t, V, pk, info] = treeNeuron(m, 'Current', 0.2, 'Time', 20, 'Record', [1 11 13]);\nfigure; treeNeuron('cell.swc', 'Active', 'soma', 'Current', 1, 'Time', 10)\nfs = 20000; x = sin(2*pi*50*(0:fs-1)/fs) + 0.1*sin(2*pi*1000*(0:fs-1)/fs);\ny = filterRecording(x, fs, 'Band', [300 6000], 'Notch', 50);\nY = filterRecording([x' x' 2*x' x'], fs, 'CommonAverage', true);\n[ts, wv] = detectSpikes(x, fs, 'Band', [300 6000]);\n[d, si, h] = abfload('rec.abf');\ns = nwbRead('s.nwb'); e = s.ElectricalSeries.Data; rate = s.ElectricalSeries.Rate;`, [['cell.swc', new TextEncoder().encode(swc)], ['rec.abf', bytes], ['s.nwb', fixture('nwb-small.nwb')]]);
    expect(r.d('m')).toHaveLength(13 * 7);
    expect(r.d('V').length).toBe(r.d('t').length * 3);
    expect(Math.max(...r.d('y').slice(5000, 15000).map(Math.abs))).toBeLessThan(0.12);
    expect(r.d('si')[0]).toBeCloseTo(100, 6);
    expect(r.d('d')[150]).toBeCloseTo(150, -1);
    expect(r.d('rate')[0]).toBe(1000);
    expect(r.d('e')).toHaveLength(2000);
    expect(((r.lab.vars.get('info') as Struct).f.get('Compartments') as { d: Float64Array }).d[0]).toBeGreaterThan(13);
    expect(r.graphics.figures.length).toBeGreaterThan(0);
  });
});
