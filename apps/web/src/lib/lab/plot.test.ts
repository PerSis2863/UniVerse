import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics, renderSvg, ticks, toTikz } from './plot';
import { isolines } from './plot3d';
import { mapOf, png } from './colormap';

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

describe('UniVerse Lab: 3D plots and images (M379)', () => {
  it('draws a surface in 3D, far faces first, and writes \\addplot3', () => {
    const g = run("[X, Y, Z] = peaks(20); surf(X, Y, Z); xlabel('x'); zlabel('height'); colorbar; view(30, 40)");
    const ax = g.current!.axes.get(1)!;
    expect([ax.grids[0].kind, ax.grids[0].r, ax.grids[0].c, ax.view, ax.colorbar]).toEqual(['surf', 20, 20, [30, 40], true]);
    const svg = renderSvg(g.current!, 800, 600);
    expect((svg.match(/<path d="M[^"]+ Z" fill="#/g) ?? []).length).toBeGreaterThanOrEqual(19 * 19);
    expect(svg).toContain('height');
    const tex = toTikz(g.current!);
    expect(tex).toContain('view={30}{40}');
    expect(tex).toContain('\\addplot3[surf, shader=faceted]');
    expect(tex).toContain('colorbar');
  });
  it('turns shading, colour maps and plot3 lines', () => {
    const g = run("t = linspace(0, 6*pi, 50); plot3(cos(t), sin(t), t, 'r'); figure; mesh(peaks(10)); shading flat; colormap hot; c = colormap; v = view;");
    expect(g.figures[0].axes.get(1)!.series[0].z).toHaveLength(50);
    expect(g.figures[1].cmap[255]).toEqual([1, 1, 1]);
    expect(g.figures[1].axes.get(1)!.grids[0].edges).toBe(false);
  });
  it('finds contour lines (a circle on a cone) and fills contours', () => {
    const r = 41, xs = Array.from({ length: r }, (_, k) => -2 + (4 * k) / (r - 1));
    const x: number[] = [], y: number[] = [], z: number[] = [];
    for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) { x.push(xs[j]); y.push(xs[i]); z.push(Math.hypot(xs[j], xs[i])); }
    const lines = isolines({ r, c: r, x, y, z }, 1);
    expect(lines).toHaveLength(1);
    for (let k = 0; k < lines[0].length; k += 2) expect(Math.hypot(lines[0][k], lines[0][k + 1])).toBeCloseTo(1, 1);
    const g = run('contourf(peaks(30), 8); colorbar');
    const ax = g.current!.axes.get(1)!;
    expect(ax.grids[0].levels).toHaveLength(8);
    expect(renderSvg(g.current!, 600, 400)).toContain('data:image/png;base64,');
  });
  it('shows images with y down and writes a matrix plot', () => {
    const g = run('imagesc(magic(4)); colormap(gray(8))');
    const f = g.current!, ax = f.axes.get(1)!;
    expect([ax.revY, ax.tight, f.cmap.length]).toEqual([true, [0.5, 4.5, 0.5, 4.5], 8]);
    const tex = toTikz(f);
    expect(tex).toContain('matrix plot*');
    expect(tex).toContain('y dir=reverse');
  });
  it('writes a valid PNG and our own colour maps', () => {
    const url = png(1, 1, new Uint8Array([255, 0, 0, 255]));
    const bytes = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(mapOf('parula')).toEqual(mapOf('lab'));
    expect(mapOf('nope')).toBeNull();
  });
});
