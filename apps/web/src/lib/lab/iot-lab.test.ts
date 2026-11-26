import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lab } from './interp';
import { toMat } from './values';
import { waits } from './wait';
import './iot-lab';

// M522: a channel's readings in a script (asked of the page) and a reading sent with the write key.
const make = () => { const lab = new Lab({ out: () => {} }); return { lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
afterEach(() => { waits.page = null; vi.unstubAllGlobals(); });

describe('Hyperion IoT in scripts (M522)', () => {
  it('iotread gives the readings as rows, NaN where a field was missing, and the chosen fields', () => {
    const asked: unknown[] = [];
    waits.page = (kind, body) => { asked.push([kind, body]); return { fields: ['Temperature', 'Humidity'], entries: [{ at: '2026-11-24T10:00:00Z', values: [21, 40] }, { at: '2026-11-24T10:00:02Z', values: [22, null] }] }; };
    const t = make();
    t.lab.run("[d, t, names] = iotread('Greenhouse', 'NumPoints', 2); h = iotread('Greenhouse', 'Fields', 2);");
    expect(t.d('d').map((x) => (Number.isNaN(x) ? 'NaN' : x))).toEqual([21, 22, 40, 'NaN']);
    expect(t.d('t')).toEqual([Date.parse('2026-11-24T10:00:00Z') / 1000, Date.parse('2026-11-24T10:00:02Z') / 1000]);
    expect(t.d('h').length).toBe(2);
    expect(asked[0]).toEqual(['iot', { channel: 'Greenhouse', n: 2 }]);
  });
  it('iotread says what to do where the engine can’t wait', () => {
    expect(() => make().lab.run("iotread('Greenhouse')")).toThrow(/Chrome, Edge, Firefox/);
  });
  it('iotwrite posts the numbers as field1… with the key, and checks the key', () => {
    const sent: { url?: string; body?: string } = {};
    vi.stubGlobal('XMLHttpRequest', class {
      status = 200; responseText = '{"ok":true,"entry":7}';
      open(_m: string, url: string, async: boolean) { sent.url = url; expect(async).toBe(false); }
      setRequestHeader() {}
      send(b: string) { sent.body = b; }
    });
    const t = make();
    t.lab.run("r = iotwrite('ABCDEFGHJKLMNPQRSTUV', [21.5 NaN 3]);");
    expect(sent).toEqual({ url: '/api/core/iot/write/ABCDEFGHJKLMNPQRSTUV', body: '{"field1":21.5,"field3":3}' });
    expect(t.lab.vars.get('r')).toMatchObject({ k: 'struct' });
    expect(() => t.lab.run("iotwrite('short', 1)")).toThrow(/write key/);
  });
});
