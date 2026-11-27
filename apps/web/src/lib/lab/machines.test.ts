import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './plot3d';
import './signal';
import './machines-lab';
import { MACHINE_EXAMPLES } from './examples-machines';
import './codegen-lab';

describe('the machines and vehicles examples (M482–M491)', () => {
  for (const ex of MACHINE_EXAMPLES) it(`${ex.name} runs`, { timeout: 60_000 }, () => {
    // A failing line throws, so running it through is the check.
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    expect(() => lab.run(ex.code)).not.toThrow();
  });
});
