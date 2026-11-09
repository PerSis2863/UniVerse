import { describe, expect, it } from 'vitest';
import { appFor, appHome, isShared, appHeadScript } from './apps';

describe('apps', () => {
  it('finds the app an address belongs to', () => {
    expect(appFor('/student/courses')?.id).toBe('campus');
    expect(appFor('/admin')?.id).toBe('campus');
    expect(appFor('/trace/map')?.id).toBe('trace');
    expect(appFor('/t/ABC')?.id).toBe('trace');
    expect(appFor('/relief')?.id).toBe('relief');
    expect(appFor('/green/teams')?.id).toBe('green');
  });
  it('treats shared tools as no app', () => {
    for (const p of ['/student/inbox', '/admin/settings', '/collab', '/docs/x', '/hub', '/console']) {
      expect(isShared(p)).toBe(true);
      expect(appFor(p)).toBeNull();
    }
    expect(appFor('/traceability')).toBeNull();
  });
  it('opens Campus by role', () => {
    expect(appHome('campus', 'TEACHER')).toBe('/teacher');
    expect(appHome('campus', 'STUDENT')).toBe('/student');
    expect(appHome('trace')).toBe('/trace');
  });
});

// M133: the head script puts the page's app on <html data-app> before the first paint, by the same rules
// as appFor and useChosenApp (the address's app, otherwise ?app=, the app chosen in this tab, UniVersity).
const run = (url: string, chosen: string | null = null) => {
  const u = new URL(url, 'https://x.test');
  const html = { dataset: {} as Record<string, string> };
  new Function('location', 'sessionStorage', 'document', appHeadScript)({ pathname: u.pathname, search: u.search }, { getItem: () => chosen }, { documentElement: html });
  return html.dataset.app;
};

describe('the page’s app before the first paint', () => {
  it('follows the address, then ?app=, then the chosen app', () => {
    expect(run('/trace/brand')).toBe('trace');
    expect(run('/student/courses')).toBe('campus');
    expect(run('/relief', 'green')).toBe('relief');
    expect(run('/?app=play')).toBe('play');
    expect(run('/login?app=relief')).toBe('relief');
    expect(run('/hub', 'green')).toBe('green');
    expect(run('/student/inbox', 'trace')).toBe('trace');
    expect(run('/', 'nonsense')).toBe('campus');
  });
  it('agrees with appFor on every app address', () => {
    for (const path of ['/trace', '/carry/x', '/green/teams', '/play/stormfall', '/teacher', '/parent', '/collab', '/console']) {
      expect(run(path, 'play')).toBe(appFor(path)?.id ?? 'play');
    }
  });
});
