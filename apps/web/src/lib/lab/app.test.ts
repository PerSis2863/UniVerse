import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import { appFigures, appsOut, fireAppEvent } from './app-lab';

const make = () => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); return { lab, graphics, out: () => out }; };

describe('Hyperion apps: uifigure and its parts (M554)', () => {
  it('builds a window with parts, and a slide runs its callback that changes a label', () => {
    const { lab } = make();
    lab.run(`
      fig = uifigure('Name', 'Temperature');
      lbl = uilabel(fig, 'Text', 'Set a temperature', 'Position', [20 400 200 22]);
      s = uislider(fig, 'Limits', [0 100], 'Value', 20, 'ValueChangedFcn', @(src, ev) set(lbl, 'Text', sprintf('%g degrees', ev.Value)));
      b = uibutton(fig, 'Text', 'Reset', 'ButtonPushedFcn', @(src, ev) set(s, 'Value', 0));
      dd = uidropdown(fig, 'Items', {'Celsius', 'Fahrenheit'});`);
    const [w] = appsOut(lab);
    expect(w.name).toBe('Temperature');
    expect(w.parts.map((p) => p.kind)).toEqual(['label', 'slider', 'button', 'dropdown']);
    const slider = w.parts[1], label = w.parts[0], button = w.parts[2];
    expect(slider.value).toBe(20);
    fireAppEvent(lab, { part: slider.id, value: 37.5 });
    expect(appsOut(lab)[0].parts[0].text).toBe('37.5 degrees');
    fireAppEvent(lab, { part: button.id, value: null });
    expect(appsOut(lab)[0].parts[1].value).toBe(0);
    // Out of range is clamped; get reads it back.
    fireAppEvent(lab, { part: slider.id, value: 500 });
    lab.run('v = get(s, \'Value\');');
    expect(toMat(lab.vars.get('v')!).d[0]).toBe(100);
    expect(label.id).toBeGreaterThan(50000);
  });
  it('plot(ax, …) draws in the app’s axes, leaving the current figure alone', () => {
    const { lab, graphics } = make();
    lab.run(`
      plot(1:3, [1 4 9]);
      fig = uifigure; ax = uiaxes(fig);
      plot(ax, 0:0.1:1, sin(0:0.1:1)); title(ax, 'Inside the app');`);
    const axFig = appFigures(lab)[0];
    expect(axFig).not.toBe(1);
    expect(graphics.current?.id).toBe(1);
    expect(graphics.figures.find((f) => f.id === axFig)?.axes.size).toBeGreaterThan(0);
  });
  it('a callback’s error comes back as an error; delete removes a window', () => {
    const { lab } = make();
    lab.run("fig = uifigure; b = uibutton(fig, 'ButtonPushedFcn', @(s, e) error('boom'));");
    expect(() => fireAppEvent(lab, { part: appsOut(lab)[0].parts[0].id, value: null })).toThrow(/boom/);
    lab.run('delete(fig);');
    expect(appsOut(lab)).toHaveLength(0);
  });
});
