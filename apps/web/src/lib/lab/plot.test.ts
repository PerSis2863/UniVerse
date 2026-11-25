import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics, renderSvg, ticks, toTikz } from './plot';
import { isolines } from './plot3d';
import { mapOf, png } from './colormap';

const run = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return graphics; };

describe('Hyperion: figures and LaTeX (M375)', () => {
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

describe('Hyperion: 3D plots and images (M379)', () => {
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

describe('Hyperion: lights, smooth shading, arrows and contour labels (M380)', () => {
  it('lights a surface and blends it smoothly', () => {
    const plain = run('surf(peaks(10))'), litG = run('surf(peaks(10)); shading interp; camlight; lighting gouraud; material shiny');
    const faces = (g: ReturnType<typeof run>) => (renderSvg(g.current!, 600, 400).match(/<path d="M[^"]+ Z" fill="#/g) ?? []).length;
    const ax = litG.current!.axes.get(1)!;
    expect([ax.lights.length, ax.lighting, ax.material[3], ax.grids[0].smooth]).toEqual([1, 'gouraud', 20, true]);
    expect(faces(litG)).toBeGreaterThan(faces(plain) * 4);
  });
  it('draws arrows scaled to the spacing', () => {
    const g = run('[x, y] = meshgrid(-1:0.5:1); quiver(x, y, -y, x)');
    const s = g.current!.axes.get(1)!.series[0];
    expect(s.x).toHaveLength(25 * 7);
    const longest = Math.max(...Array.from({ length: 25 }, (_, i) => Math.hypot(s.x[i * 7 + 1] - s.x[i * 7], s.y[i * 7 + 1] - s.y[i * 7])));
    expect(longest).toBeCloseTo(0.9 * Math.hypot(2 / 5, 2 / 5), 5);
    expect(run('quiver3([0 1], [0 0], [0 0], [1 1], [0 0], [1 1], 0)').current!.axes.get(1)!.series[0].z).toHaveLength(14);
  });
  it('returns the contour matrix and writes the levels on the lines', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run('[X, Y] = meshgrid(-2:0.1:2); [C, h] = contour(X, Y, X.^2 + Y.^2, [1 1]); clabel(C, h)');
    const C = lab.vars.get('C') as { r: number; d: Float64Array };
    expect([C.r, C.d[0]]).toEqual([2, 1]);
    const svg = renderSvg((lab.host.graphics as Graphics).current!, 600, 400);
    expect(svg).toMatch(/paint-order="stroke">1<\/text>/);
    expect(toTikz((lab.host.graphics as Graphics).current!)).toContain('\\node[font=\\scriptsize');
  });
});

describe('Hyperion: gradient and shapes (M380)', () => {
  const val = (code: string, name: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return lab.vars.get(name) as { r: number; c: number; d: Float64Array }; };
  it('takes gradients, the Laplacian, divergence and curl', () => {
    expect([...val('g = gradient([1 4 9 16], 1);', 'g').d]).toEqual([3, 4, 6, 7]);
    const [x2] = [val('[X, Y] = meshgrid(0:4); [fx, fy] = gradient(X.^2 + 3*Y);', 'fy')];
    expect([...x2.d].every((v) => v === 3)).toBe(true);
    expect(val('[X, Y] = meshgrid(0:4); L = del2(X.^2 + Y.^2);', 'L').d[12]).toBeCloseTo(1, 10);
    expect(val('[X, Y] = meshgrid(0:4); d = divergence(X, Y, X, Y);', 'd').d[12]).toBeCloseTo(2, 10);
    expect(val('[X, Y] = meshgrid(0:4); c = curl(X, Y, -Y, X);', 'c').d[12]).toBeCloseTo(2, 10);
  });
  it('makes spheres, ellipsoids and cylinders', () => {
    const X = val('[X, Y, Z] = sphere(10);', 'X');
    expect([X.r, X.c]).toEqual([11, 11]);
    const Z = val('[X, Y, Z] = ellipsoid(0, 0, 1, 1, 1, 2, 8);', 'Z');
    expect(Math.max(...Z.d)).toBeCloseTo(3, 10);
    expect(val('[X, Y, Z] = cylinder([1 2 1]);', 'Z').r).toBe(3);
  });
});

describe('Hyperion: more plot kinds (M381)', () => {
  it('stacks bars and lays them sideways', () => {
    const ax = run("bar([1 -2; 3 4], 'stacked')").current!.axes.get(1)!;
    expect(ax.series.map((s) => s.base)).toEqual([[0, 0], [0, 3]]);
    expect(run('barh([5 3])').current!.axes.get(1)!.series[0].kind).toBe('barh');
  });
  it('keeps text, reference lines, ticks, two y axes and a figure title', () => {
    const g = run("plot(1:3); text(2, 2, 'mid'); xline(2, 'r--', 'here'); yline([1 3]); xticks([1 3]); xticklabels({'a', 'b'}); yyaxis right; plot(1:3, [10 20 30]); ylabel('right'); title('both'); sgtitle('Figure')");
    const ax = g.current!.axes.get(1)!;
    expect([ax.texts[0].s, ax.refs.length, ax.refs[0].label, ax.refs[0].dash, ax.xtl, ax.title, ax.twin?.ylabel, ax.twin?.series.length]).toEqual(['mid', 3, 'here', '--', ['a', 'b'], 'both', 'right', 1]);
    expect(g.current!.title).toBe('Figure');
    const tex = toTikz(g.current!);
    expect(tex).toContain('axis y line*=right');
    expect(tex).toContain('xticklabels={{a},{b}}');
  });
  it('draws pies, polar plots, box plots, filled shapes and errors', () => {
    expect(renderSvg(run("pie([1 1 2], {'a','b','c'})").current!, 500, 400)).toContain('>c</text>');
    expect(toTikz(run('polarplot([0 pi/2], [1 2])').current!)).toContain('\\begin{polaraxis}');
    const box = run('boxplot([1 2 3 4 5 100])').current!.axes.get(1)!;
    expect(box.series.find((s) => s.marker === '+')?.y).toEqual([100]);
    const f = run("fill([0 1 0], [0 0 1], 'r', 'FaceAlpha', 0.5)").current!.axes.get(1)!.series[0];
    expect([f.kind, f.color, f.fa]).toEqual(['fill', '#dc2626', 0.5]);
    expect(toTikz(run('errorbar([1 2], [3 4], [0.5 0.5])').current!)).toContain('(1,3) +- (0,0.5)');
  });
  it('plots straight from a formula', () => {
    expect(run('fsurf(@(x, y) x.^2 - y.^2)').current!.axes.get(1)!.grids[0].r).toBe(35);
    const imp = run('fimplicit(@(x, y) x.^2 + y.^2 - 4)').current!.axes.get(1)!.series[0];
    expect(Math.hypot(imp.x[0], imp.y[0])).toBeCloseTo(2, 1);
    expect(run('fplot3(@(t) cos(t), @(t) sin(t), @(t) t, [0 6])').current!.axes.get(1)!.series[0].z).toHaveLength(300);
  });
});

describe('Hyperion: live drawing while a script runs (M506)', () => {
  const setup = () => {
    const g = new Graphics(), frames: number[] = [], waits: number[] = [];
    const lab = new Lab({ out: () => {}, graphics: g, frame: () => frames.push(g.current?.axes.get(1)?.series[0]?.x.length ?? 0), wait: (s) => waits.push(s) });
    return { g, lab, frames, waits };
  };
  it('drawnow and pause show each frame; pause asks to wait', () => {
    const { lab, frames, waits } = setup();
    lab.run('for k = 1:3, plot(1:k, (1:k).^2); drawnow; end\npause(0.25)');
    expect(frames).toEqual([1, 2, 3, 3]);
    expect(waits).toEqual([0.25]);
  });
  it('animatedline grows with addpoints; clearpoints empties it', () => {
    const { g, lab } = setup();
    lab.run("h = animatedline('Color', 'r', 'LineWidth', 2);\nfor k = 1:5, addpoints(h, k, k^2); drawnow; end");
    const s = g.current!.axes.get(1)!.series[0];
    expect(s.y).toEqual([1, 4, 9, 16, 25]);
    expect(s.width).toBe(2);
    expect(s.color).toBe('#dc2626');
    lab.run('clearpoints(h)');
    expect(s.x).toEqual([]);
  });
  it("h = plot(…) and set(h, 'YData', …) move a line", () => {
    const { g, lab } = setup();
    lab.run("x = 0:0.5:1; h = plot(x, x); set(h, 'YData', 2*x, 'Color', 'k')");
    const s = g.current!.axes.get(1)!.series[0];
    expect(s.y).toEqual([0, 1, 2]);
    expect(s.color).not.toBe('#2563eb');
    expect(() => lab.run('addpoints(3, 1, 1)')).toThrow(/handle/);
  });
  it('pause without a window waits for nothing', () => {
    const g = new Graphics(), lab = new Lab({ out: () => {}, graphics: g });
    expect(() => lab.run("pause(2); pause; pause('off')")).not.toThrow();
  });
});
