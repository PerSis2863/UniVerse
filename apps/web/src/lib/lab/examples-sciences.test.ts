import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';
import './image-lab';
import './optim-lab';
import { SCIENCE_EXAMPLES } from './examples-sciences';
import { FileStore } from './files';

describe('the science and industry examples (M492–M505)', () => {
  for (const ex of SCIENCE_EXAMPLES) {
    it(`${ex.name} runs without an error`, () => {
      let out = '';
      const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files: new FileStore() });
      expect(() => lab.run(ex.code)).not.toThrow();
      expect(out).not.toMatch(/^Error/m);
    }, 30_000); // the physics examples simulate for a few seconds on a busy test machine
  }
});

describe("plot(x, y, 'Color', …) (fixed in M504's figure check)", () => {
  it('reads a colour given by name, letter or #hex as a pair, not as a line spec', () => {
    const g = new Graphics(), lab = new Lab({ out: () => {}, graphics: g });
    lab.run("plot(1:3, 1:3, 'Color', '#22c55e'); hold on; plot(1:3, 2:4, 'r--o', 'LineWidth', 2); plot(1:3, 3:5, 'Color', 'k')");
    const s = [...g.figures[0].axes.values()][0].series;
    expect(s.map((x) => [x.color, x.marker])).toEqual([['#22c55e', null], ['#dc2626', 'o'], ['#111827', null]]);
  });
});
