import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentAppNow } from './current-app';

// M179: a chat starts in the app you're in: the page's own app, else the one last used (shared pages
// such as Messages), else the one chosen on the website, else UniVersity.
const store = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null, setItem: () => {}, removeItem: () => {} });

describe('the app you are in', () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is the page's own app", () => {
    vi.stubGlobal('localStorage', store({ 'uv-last-app': 'green' }));
    expect(currentAppNow('/relief/orgs')).toBe('relief');
    expect(currentAppNow('/play')).toBe('play');
  });
  it('on a shared page, the app last used, then the one chosen, then UniVersity', () => {
    vi.stubGlobal('localStorage', store({ 'uv-last-app': 'green' }));
    expect(currentAppNow('/student/inbox')).toBe('green');
    vi.stubGlobal('localStorage', store({ 'uv-last-app': 'nonsense' }));
    vi.stubGlobal('sessionStorage', store({ 'uv-app': 'trace' }));
    expect(currentAppNow('/teacher/inbox')).toBe('trace');
    vi.stubGlobal('sessionStorage', store({}));
    expect(currentAppNow('/admin/inbox')).toBe('campus');
  });
});
