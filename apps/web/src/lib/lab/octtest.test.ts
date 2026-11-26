import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import { ipynbToScript, scriptToIpynb } from './ipynb';
import { notebookOf } from './notebook';
import './octtest-lab';

function make(files: Record<string, string>) {
  const fs = new FileStore(), out: string[] = [];
  for (const [k, v] of Object.entries(files)) fs.putText(k, v);
  const lab = new Lab({ out: (t: string) => out.push(t), graphics: new Graphics(), files: fs });
  return { lab, out };
}
const SQ = `function y = sq(x)
% SQ  The square.
%   >> sq(3)
%   ans = 9
%   >> disp(sq([1 2]))
%      1   4
  y = x.^2;
end
%!assert (sq(2), 4)
%!assert (sq(-1), 1)
%!test
%! z = sq(1:3);
%! assert (z, [1 4 9])
%!error <isn’t a variable|[Uu]ndefined> sq(nothere)
%!shared k
%! k = 5;
%!assert (sq(k), 25)
%!xtest
%! assert (sq(2), 5)
%!demo
%! disp(sq(4))
`;
describe('Octave-style tests, doctests, QR codes and notebooks (M561)', () => {
  it('test runs the %! blocks, with shared values and a known failure', () => {
    const { lab, out } = make({ 'sq.m': SQ });
    lab.run('[ok, n] = test(\'sq\');');
    const text = out.join('');
    expect(text).toContain('PASSES 6 out of 6 tests (1 known failure)');
    expect(toMat(lab.vars.get('n')!).d[0]).toBe(6);
  });
  it('doctest checks the help text\'s examples; a wrong one fails', () => {
    const { lab } = make({ 'sq.m': SQ, 'bad.m': 'function y = bad(x)\n% >> bad(2)\n% ans = 5\n  y = x + 2;\nend\n' });
    lab.run('[p, n] = doctest(\'sq\'); [p2, n2] = doctest(\'bad\');');
    expect([toMat(lab.vars.get('p')!).d[0], toMat(lab.vars.get('n')!).d[0]]).toEqual([2, 2]);
    expect(toMat(lab.vars.get('p2')!).d[0]).toBe(0);
  });
  it('demo runs the demo; qrcode and impixel', () => {
    const { lab, out } = make({ 'sq.m': SQ });
    lab.run('demo(\'sq\'); q = qrcode(\'https://example.com\'); s = size(q); I = cat(3, [1 2; 3 4], [5 6; 7 8], [9 10; 11 12]); v = impixel(I, [2 1], [1 2]);');
    expect(out.join('')).toContain('16');
    const s = [...toMat(lab.vars.get('s')!).d];
    expect(s[0]).toBe(s[1]);
    expect(s[0]).toBe(25 + 8);
    expect([...toMat(lab.vars.get('v')!).d]).toEqual([2, 3, 6, 7, 10, 11]);
  });
  it('a notebook goes to a script and back', () => {
    const nb = JSON.stringify({ cells: [
      { cell_type: 'markdown', source: ['# Squares\n', 'Some **text**.'] },
      { cell_type: 'code', source: 'x = 1:3;\ny = x.^2' },
      { cell_type: 'code', source: ['disp(y)'] },
    ], nbformat: 4 });
    const script = ipynbToScript(nb);
    expect(script).toBe('%% Squares\n% Some **text**.\nx = 1:3;\ny = x.^2\n%%\ndisp(y)\n');
    const back = JSON.parse(scriptToIpynb(notebookOf(script), [{ text: 'y = 1 4 9\n', figs: [] }]));
    expect(back.cells.map((c: { cell_type: string }) => c.cell_type)).toEqual(['markdown', 'code', 'code']);
    expect(back.cells[1].outputs[0].text.join('')).toContain('1 4 9');
    expect(() => ipynbToScript('{}')).toThrow(/no cells/);
  });
});
