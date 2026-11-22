import { describe, expect, it } from 'vitest';
import { notebookOf, reportHtml, reportTex, textHtml, textTex } from './notebook';

const SRC = `%% Projectile
% A ball thrown at **speed** $v_0$ lands after
% $$t = \\frac{2 v_0 \\sin\\theta}{g}$$
v0 = 20;   % slider 5 40
t = 2*v0/9.81

%% The path
% * distance
% * height
plot(1:3)
`;

describe('Hyperion notebooks (M397)', () => {
  it('reads sections of text and code', () => {
    const nb = notebookOf(SRC);
    expect(nb.map((s) => s.title)).toEqual(['Projectile', 'The path']);
    expect(nb[0].blocks.map((b) => b.kind)).toEqual(['text', 'code']);
    expect(nb[0].blocks[1]).toMatchObject({ kind: 'code', code: 'v0 = 20;   % slider 5 40\nt = 2*v0/9.81', line: 4 });
    expect(nb[1].code).toContain('plot(1:3)');
    expect(nb[1].line).toBe(7);
  });
  it('keeps a script without sections as one section', () => {
    expect(notebookOf('x = 1\ny = 2').length).toBe(1);
    expect(notebookOf('x = 1\ny = 2')[0].blocks).toEqual([{ kind: 'code', code: 'x = 1\ny = 2', line: 1 }]);
  });
  it('writes text with styles, lists and maths, escaping the rest', () => {
    const m = (tex: string, d: boolean) => `[${d ? 'D' : 'I'}:${tex}]`;
    expect(textHtml('a **b** *c* `d` $x^2$ <script>', m)).toBe('<p>a <strong>b</strong> <em>c</em> <code>d</code> [I:x^2] &lt;script&gt;</p>');
    expect(textHtml('* one\n* two', m)).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(textHtml('lands after $$t = 1$$ and goes', m)).toBe('<p>lands after</p><div class="nb-display">[D:t = 1]</div><p>and goes</p>');
    expect(textTex('50% of **x** is $x/2$')).toBe('50\\% of \\textbf{x} is $x/2$');
  });
  it('publishes a report as HTML and as LaTeX', () => {
    const nb = notebookOf(SRC);
    const outs = [{ text: 't =\n\n    4.0775\n\n', figs: [] }, { text: '', figs: [{ id: 1, light: '<svg xmlns="http://www.w3.org/2000/svg"/>', tex: '\\begin{tikzpicture}\\end{tikzpicture}' }] }];
    const html = reportHtml('demo.m', nb, outs, (t) => `<math>${t}</math>`, '22 Nov 2026');
    expect(html).toContain('<h2>Projectile</h2>');
    expect(html).toContain('<pre class="out">t =');
    expect(html).toContain('<img alt="Figure 1" src="data:image/svg+xml');
    const tex = reportTex('demo.m', nb, outs);
    expect(tex).toContain('\\section*{Projectile}');
    expect(tex).toContain('\\begin{lstlisting}\nv0 = 20;');
    expect(tex).toContain('\\begin{tikzpicture}');
    expect(tex.trim().endsWith('\\end{document}')).toBe(true);
  });
});
