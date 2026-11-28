import { describe, expect, it } from 'vitest';
import { CHART_EXAMPLE, ChartError, chartStart, chartStep, chartToC, parseChart } from './chart';
import { EXAMPLES, simulate } from './blocks';

describe('state charts', () => {
  it('reads states, transitions and conditions', () => {
    const c = parseChart(CHART_EXAMPLE);
    expect(c.states.map((s) => s.name)).toEqual(['Off', 'Heat', 'Rest']);
    expect(c.trans).toHaveLength(3);
    let r = chartStart();
    r = chartStep(c, r, 0, [15]);
    expect(c.states[r.active].name).toBe('Heat');
    r = chartStep(c, r, 5, [22]);
    expect(c.states[r.active].name).toBe('Rest');
    expect(chartStep(c, r, 24, [10]).active).toBe(r.active); // after(20) not yet
    expect(c.states[chartStep(c, r, 25, [10]).active].name).toBe('Off');
  });

  it('takes the first transition that holds, with and / or / not and functions', () => {
    const c = parseChart('state A\nstate B\nstate C\nA -> B when not (u1 > 1) and abs(u2) >= 2\nA -> C when u1 > 1 || max(u1, u2) == 9');
    expect(c.inputs).toBe(2);
    expect(chartStep(c, chartStart(), 0, [0, -2]).active).toBe(1);
    expect(chartStep(c, chartStart(), 0, [3, 0]).active).toBe(2);
    expect(chartStep(c, chartStart(), 0, [0, 1]).active).toBe(0);
  });

  it('names the line of a mistake', () => {
    expect(() => parseChart('state A\nA -> Z when u1 > 0')).toThrow(/Line 2: there's no state called Z/);
    expect(() => parseChart('state A\nA -> A when u9 > 0')).toThrow(ChartError);
    expect(() => parseChart('state A\nA -> A when (u1 > 0')).toThrow(/Line 2/);
  });

  it('writes the chart as C with every state and transition', () => {
    const src = chartToC(parseChart(CHART_EXAMPLE), 'thermostat');
    expect(src).toContain('typedef enum { THERMOSTAT_OFF, THERMOSTAT_HEAT, THERMOSTAT_REST } thermostat_mode;');
    expect(src).toContain('if ((u[0] < 19.0)) next = THERMOSTAT_HEAT;');
    expect(src).toContain('(s->timer >= 20.0 - 1e-9)');
    expect(src).not.toMatch(/malloc/);
  });

  it('the thermostat keeps the room between 19 and 21 degrees once warm', () => {
    const r = simulate(EXAMPLES.find((e) => e.id === 'thermostat')!.make());
    const temp = [...r.scopes.values()][0][0], heater = [...r.scopes.values()][0][1];
    const late = temp.filter((_, k) => r.t[k] > 300);
    expect(Math.min(...late)).toBeGreaterThan(18.5);
    expect(Math.max(...late)).toBeLessThan(21.5);
    expect(new Set(heater)).toEqual(new Set([0, 1]));
  });
});
