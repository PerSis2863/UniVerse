import { describe, expect, it } from 'vitest';
import { appFor, appHome, isShared, appHeadScript } from './apps';

describe('apps', () => {
  it('finds the app an address belongs to', () => {
    expect(appFor('/student/courses')?.id).toBe('campus');
    expect(appFor('/admin')?.id).toBe('campus');
    expect(appFor('/trace/map')?.id).toBe('trace');
    expect(appFor('/t/ABC')?.id).toBe('trace');
    expect(appFor('/relief')?.id).toBe('relief');
    expect(appFor('/student/life/green')?.id).toBe('campus');
    expect(appFor('/trace/carbon')?.id).toBe('trace');
    expect(appFor('/carbon/ABC')?.id).toBe('trace');
    expect(appFor('/green')).toBeNull();
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
    expect(appHome('lab')).toBe('/hyperion');
    expect(appHome('green' as never)).toBe('/student');
  });
});

// M133: the head script puts the page's app on <html data-app> before the first paint, by the same rules
// as appFor and useChosenApp (the address's app, otherwise ?app=, the app chosen in this tab, UniVersity).
const page = (url: string, chosen: string | null = null, shown?: string[]) => {
  const u = new URL(url, 'https://x.test');
  const html = { dataset: {} as Record<string, string> };
  const styles: { id: string; textContent: string }[] = [];
  const doc = { documentElement: html, createElement: () => ({ id: '', textContent: '' }), head: { appendChild: (el: { id: string; textContent: string }) => styles.push(el) } };
  new Function('location', 'sessionStorage', 'document', 'window', 'localStorage', appHeadScript)({ pathname: u.pathname, search: u.search }, { getItem: () => chosen }, doc, { __uvApps: shown }, { getItem: () => null });
  return { app: html.dataset.app, css: styles[0]?.textContent ?? null };
};
const run = (url: string, chosen: string | null = null) => page(url, chosen).app;

describe('the page’s app before the first paint', () => {
  it('follows the address, then ?app=, then the chosen app', () => {
    expect(run('/trace/brand')).toBe('trace');
    expect(run('/student/courses')).toBe('campus');
    expect(run('/relief', 'green')).toBe('relief');
    expect(run('/?app=travel')).toBe('travel');
    expect(run('/?app=play')).toBe('campus'); // M224: Play is UniVersity's Games now
    expect(run('/login?app=relief')).toBe('relief');
    expect(run('/hub', 'relief')).toBe('relief');
    expect(run('/hub', 'green')).toBe('campus'); // M395: Green was folded into the other apps
    expect(run('/student/inbox', 'trace')).toBe('trace');
    expect(run('/', 'nonsense')).toBe('campus');
  });
  it('agrees with appFor on every app address', () => {
    for (const path of ['/trace', '/carry/x', '/carbon/x', '/green/teams', '/play/stormfall', '/teacher', '/parent', '/collab', '/console']) {
      expect(run(path, 'travel')).toBe(appFor(path)?.id ?? 'travel');
    }
  });
});

// M203: the owner shows only some apps: a hidden chosen app gives way, and hidden apps' parts are hidden.
describe('the apps the website shows, before the first paint', () => {
  it('hides the other apps and picks a shown one', () => {
    expect(page('/', 'trace', ['relief'])).toEqual({ app: 'relief', css: '[data-uv-app]:not([data-uv-app="relief"]),[data-uv-many]{display:none!important}' });
    expect(page('/', 'campus', ['campus', 'travel']).css).toBe('[data-uv-app]:not([data-uv-app="campus"]):not([data-uv-app="travel"]){display:none!important}');
    expect(page('/login', null, ['relief', 'travel']).app).toBe('relief');
    expect(page('/trace/brand', null, ['relief']).app).toBe('trace'); // its own page: the app sends people on
    expect(page('/', 'trace', ['campus', 'trace', 'relief', 'travel', 'lab'])).toEqual({ app: 'trace', css: null });
    expect(page('/', 'trace', ['nonsense'])).toEqual({ app: 'trace', css: null });
  });
});
