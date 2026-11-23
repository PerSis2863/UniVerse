import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';
import './image-lab';
import './optim-lab';
import { FileStore } from './files';
import { SCI_APPS, clean, defaults, resultsOf, scriptFor, type Values } from './sci-apps';

// M508: every window of the science toolboxes, in every one of its views, runs with its starting values, prints
// results and (except printed-only views) draws a figure.
const run = (code: string) => {
  let out = '';
  const g = new Graphics(), lab = new Lab({ out: (t) => { out += t; }, graphics: g, files: new FileStore() });
  lab.run(code);
  return { out, figs: g.figures.length };
};

describe('the science windows (M508)', () => {
  for (const app of SCI_APPS) {
    const show = app.fields.find((f) => f.key === 'show');
    const views = show && show.kind === 'menu' ? show.options.map(([o]) => o) : [undefined];
    for (const view of views) {
      it(`${app.title}${view ? ` → ${view}` : ''} runs`, () => {
        const v: Values = { ...defaults(app), ...(view ? { show: view } : {}) };
        const { out, figs } = run(scriptFor(app, v));
        expect(resultsOf(out).length).toBeGreaterThan(0);
        if (view !== 'orfs') expect(figs).toBeGreaterThan(0);
      });
    }
  }
  it('cleans what could break a script', () => {
    const dna = SCI_APPS.find((a) => a.id === 'dna')!;
    const v = clean(dna, { gene: "ATG'); delete('x", pos: 1e9, base: 'Z', show: 'tree' });
    expect(v.gene).toBe('ATGt');
    expect(v.pos).toBe(6000);
    expect(v.base).toBe('T');
  });
  it('reads results from printed lines', () => {
    expect(resultsOf('= Peak | 12 thousand\nother\n= A | b | c')).toEqual([{ label: 'Peak', value: '12 thousand' }, { label: 'A', value: 'b | c' }]);
  });
});
