import { expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import './optim-lab';
import './filters-lab';
import './audio-lab';
import './serial-lab';
import { runScriptTests } from './verify-lab';
import './parallel-lab';
import './gpu-lab';
import { SIGNAL_EXAMPLES } from '@/components/lab/examples-signals';

// Every worked example of the signals and capabilities toolboxes (M472–) runs without an error; the test script
// (tests.m, made for the Test button) passes all but the test that fails on purpose.
it('the signals examples run', () => {
  for (const e of SIGNAL_EXAMPLES) {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore(), sound: () => {} });
    if (e.name === 'tests.m') expect(runScriptTests(lab, e.code).tests.map((t) => t.passed)).toEqual([true, true, true, true, false, true]);
    else lab.run(e.code);
  }
});
