import { describe, expect, it } from 'vitest';
import { watchWorker } from './error-monitor';

// A worker that failed (the owner, 27 Nov: Machine health stuck on "computing…"): the page hears it either way.
describe('watchWorker', () => {
  const fire = (props: Record<string, unknown>) => {
    const w = new EventTarget() as unknown as Worker, got: string[] = [];
    watchWorker(w, 'test', (m) => got.push(m));
    const e = Object.assign(new Event('error', { cancelable: true }), props);
    w.dispatchEvent(e);
    return { got, prevented: e.defaultPrevented };
  };
  it('a worker whose script never loaded: asks for a reload', () => {
    const r = fire({});
    expect(r.got[0]).toMatch(/Reload the page/);
    expect(r.prevented).toBe(true);
  });
  it('a worker that crashed: says why', () => {
    expect(fire({ message: 'out of memory' }).got[0]).toBe('The calculation stopped: out of memory');
  });
});
