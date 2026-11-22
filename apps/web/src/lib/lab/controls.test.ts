import { describe, expect, it } from 'vitest';
import { controlsOf, setControl } from './controls';

describe('Hyperion: live controls (M384)', () => {
  const code = "f = 2.5;   % slider 0 10\nk = 3; % slider 0:0.5:8\nn=4 % slider(1, 20, 1)\ndamped = true; % toggle\nshape = 'sine'; % menu square, triangle\nplain = 7;\n";
  it('finds sliders, toggles and menus in comments', () => {
    const c = controlsOf(code);
    expect(c.map((x) => [x.name, x.kind, x.value, x.min, x.max, x.step])).toEqual([
      ['f', 'slider', 2.5, 0, 10, 0.1], ['k', 'slider', 3, 0, 8, 0.5], ['n', 'slider', 4, 1, 20, 1], ['damped', 'toggle', true, 0, 1, 1], ['shape', 'menu', 'sine', 0, 0, 0],
    ]);
    expect(c[4].options).toEqual(['sine', 'square', 'triangle']);
  });
  it('rewrites only the value', () => {
    const [f, , n, d, s] = controlsOf(code);
    let next = setControl(code, f, 7.3000000001);
    expect(next.split('\n')[0]).toBe('f = 7.3;   % slider 0 10');
    next = setControl(code, n, 12);
    expect(next.split('\n')[2]).toBe('n=12 % slider(1, 20, 1)');
    expect(setControl(code, d, false).split('\n')[3]).toBe('damped = false; % toggle');
    expect(setControl(code, s, 'square').split('\n')[4]).toBe("shape = 'square'; % menu square, triangle");
  });
});
