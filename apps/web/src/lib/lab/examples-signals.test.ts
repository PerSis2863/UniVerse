import { it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './filters-lab';
import { SIGNAL_EXAMPLES } from '@/components/lab/examples-signals';
it('examples run', () => { for (const e of SIGNAL_EXAMPLES) { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(e.code); void out; } });
