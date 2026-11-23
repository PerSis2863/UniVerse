import { it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import './filters-lab';
import './audio-lab';
import './serial-lab';
import { SIGNAL_EXAMPLES } from '@/components/lab/examples-signals';

// Every worked example of the signals and capabilities toolboxes (M472–) runs without an error.
it('the signals examples run', () => {
  for (const e of SIGNAL_EXAMPLES) new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore(), sound: () => {} }).run(e.code);
});
