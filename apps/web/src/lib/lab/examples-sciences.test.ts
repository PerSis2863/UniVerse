import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';
import { SCIENCE_EXAMPLES } from './examples-sciences';

describe('the science and industry examples (M492–M505)', () => {
  for (const ex of SCIENCE_EXAMPLES) {
    it(`${ex.name} runs without an error`, () => {
      let out = '';
      const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() });
      expect(() => lab.run(ex.code)).not.toThrow();
      expect(out).not.toMatch(/^Error/m);
    });
  }
});
