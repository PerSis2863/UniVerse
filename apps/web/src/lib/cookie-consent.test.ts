import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieChoice, optionalCookiesAllowed, setCookieChoice } from './cookie-consent';

describe('cookie choice', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('allows optional cookies only after "Accept all"', () => {
    expect(cookieChoice()).toBeNull();
    expect(optionalCookiesAllowed()).toBe(false);
    setCookieChoice('essential');
    expect(optionalCookiesAllowed()).toBe(false);
    setCookieChoice('all');
    expect(optionalCookiesAllowed()).toBe(true);
  });

  it('treats the Global Privacy Control signal as no, whatever was chosen', () => {
    setCookieChoice('all');
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    expect(optionalCookiesAllowed()).toBe(false);
  });

  it('ignores a value it did not write, and blocked storage', () => {
    store['uv-cookies'] = 'yes';
    expect(cookieChoice()).toBeNull();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(cookieChoice()).toBeNull();
  });
});
