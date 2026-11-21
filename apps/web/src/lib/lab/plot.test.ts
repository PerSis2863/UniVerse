import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics, renderSvg, ticks, toTikz } from './plot';

const run = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return graphics; };

describe('UniVerse Lab: figures and LaTeX (M375)', () => {
  it('makes series from plot’s forms and line specs', () => {
    const g = run("x = 0:0.5:2; plot(x, x.^2, 'r--o', x, x, 'k:'); hold on; plot(x, 2*x, 'LineWidth', 3, 'DisplayName', 'twice'); title('Growth'); xlabel('t'); grid on; legend show");
    const ax = g.current!.axes.get(1)!;
    expect(ax.series.map((s) => [s.color, s.dash, s.marker])).toEqual([['#dc2626', '--', 'o'], ['#111827', ':', null], ['#16a34a', '', null]]);
    expect(ax.series[2].width).toBe(3);
    expect(ax.series[2].label).toBe('twice');
    expect([ax.title, ax.xlabel, ax.grid]).toEqual(['Growth', 't', true]);
  });
  it('plots matrix columns and markers only, and starts afresh without hold', () => {
    const g = run("plot([1 2; 3 4; 5 6]); plot(1:3, 'x')");
    const ax = g.current!.axes.get(1)!;
    expect(ax.series).toHaveLength(1);
    expect([ax.series[0].dash, ax.series[0].marker, ax.series[0].x]).toEqual(['none', 'x', [1, 2, 3]]);
  });
  it('draws an SVG and writes pgfplots code', () => {
    const g = run("x = linspace(0, 1, 5); subplot(1, 2, 1); plot(x, x.^2); title('x^2'); subplot(1, 2, 2); bar([3 5 2]); ylabel('count')");
    const svg = renderSvg(g.current!, 800, 400);
    expect(svg).toContain('<svg');
    expect(svg).toContain('x²');
    const tex = toTikz(g.current!);
    expect(tex).toContain('\\begin{groupplot}[group style={group size=2 by 1');
    expect(tex).toContain('title={$x^2$}');
    expect(tex).toContain('ybar');
    expect(tex).toMatch(/\\addplot\[color=uvcolor1.*\] coordinates \{\n\(0,0\) \(0\.25,0\.0625\)/);
  });
  it('picks nice ticks', () => {
    expect(ticks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(ticks(-3, 7)).toEqual([-2, 0, 2, 4, 6]);
  });
});
