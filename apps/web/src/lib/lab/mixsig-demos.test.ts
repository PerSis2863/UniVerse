// M568: the Verification tab's two example scripts (MixedSignalBench's DPI_DEMO and AMI_DEMO) run as written in Code.
import { it, expect } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import './codegen-lab';
import './mixsig-lab';
import './help-commands';
it('the DPI-C and IBIS-AMI examples run', () => {
  let out = ''; const files = new FileStore(); const l = new Lab({ out: (t) => { out += t; }, files });
  l.run(`dpigen('quantise', {[0.12 0.37 -0.51 0.9], 0.25})
type quantise_tb.sv

function [y, err] = quantise(x, step)
  y = round(x / step) * step;
  err = sum(abs(y - x));
end
`);
  l.run(`amigen('hyper_tx', 'Tx', 'FFE', [-0.1 0.8 -0.1], 'Rate', 25e9)
amigen('hyper_rx', 'Rx', 'CTLE', 8, 'DFE', 3, 'Rate', 25e9)
type hyper_rx_ami.c
`);
  expect(out).toContain('module quantise_tb'); expect(out).toContain('AMI_GetWave');
});
