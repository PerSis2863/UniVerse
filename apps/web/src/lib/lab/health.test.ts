import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './maint-lab';
import * as h from './health';

describe('Hyperion Learn → Machine health (M465)', () => {
  it('ranks the features that track a bearing’s wear above those that don’t, and predicts its remaining life', () => {
    const fleet = h.lifeFleet(1, 6), ids = h.featuresFor(fleet).map((f) => f.id), table = h.featureTable(fleet, ids);
    const ranked = h.rank(fleet, table, ids), pos = (id: string) => ranked.findIndex((r) => r.id === id);
    expect(pos('bpfo')).toBeLessThan(pos('mean'));
    expect(pos('bpfo')).toBeLessThan(pos('dominant'));
    expect(ranked[0].score).toBeGreaterThan(0.6);
    const j = ids.indexOf('rms'), test = h.lifeTest(fleet, table, j, 5);
    expect(test.t.length).toBeGreaterThan(5);
    // Late in life the prediction is within a third of the machine's life of the truth.
    expect(Math.abs(test.rul[test.rul.length - 2] - test.truth[test.truth.length - 2])).toBeLessThan(test.life / 3);
  });
  it('ranks 2× speed near the top for a pump’s faults, 1× and the bearing’s band above the mean', () => {
    const fleet = h.faultFleet(2, 12), ids = h.featuresFor(fleet).map((f) => f.id), table = h.featureTable(fleet, ids);
    const order = h.rank(fleet, table, ids).map((r) => r.id);
    expect(order.slice(0, 3)).toContain('a2');
    expect(order.indexOf('a1')).toBeLessThan(order.indexOf('mean'));
    expect(order.indexOf('bpfo')).toBeLessThan(order.indexOf('mean'));
  });
  it('reads the person’s recordings, grouped by name', () => {
    const wave = (a: number) => Array.from({ length: 512 }, (_, k) => (a * Math.sin(k / 3)).toFixed(4)).join('\n');
    const f = h.fileFleet([{ name: 'good_1.csv', text: wave(1) }, { name: 'good_2.csv', text: wave(1.1) }, { name: 'worn-1.csv', text: `value\n${wave(3)}` }], 1000, 0);
    expect(f.classes).toEqual(['good', 'worn']);
    expect(f.recs.map((r) => r.label)).toEqual([0, 0, 1]);
    expect(() => h.fileFleet([{ name: 'a.csv', text: '1\n2' }], 1000, 0)).toThrow(/at least 256/);
  });
  it('its scripts run in Hyperion', () => {
    for (const kind of ['life', 'faults'] as const) {
      let out = '';
      const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() });
      lab.run(h.healthScript('rms', kind));
      if (kind === 'life') expect(out).toMatch(/really had/);
    }
  });
});
