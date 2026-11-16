import { describe, expect, it } from 'vitest';
import { parseShownApps } from './shown-apps-list';

// M203: the owner's list of apps to show, read safely: unknown ids dropped, the apps' own order kept,
// every app when nothing valid is stored (the website is never left with no app).
describe('the apps the website shows', () => {
  it('keeps only real apps, in their order', () => {
    expect(parseShownApps('["travel","campus","nope"]')).toEqual(['campus', 'travel']);
    expect(parseShownApps(['relief'])).toEqual(['relief']);
  });
  it('shows every app when nothing valid is stored', () => {
    const all = ['campus', 'trace', 'relief', 'green', 'travel'];
    expect(parseShownApps(null)).toEqual(all);
    expect(parseShownApps('not json')).toEqual(all);
    expect(parseShownApps('[]')).toEqual(all);
    expect(parseShownApps(['x'])).toEqual(all);
  });
});

describe('the style that hides the other apps', () => {
  it('matches the head script', async () => {
    const { hideCss } = await import('./shown-apps-list');
    expect(hideCss(['relief'])).toBe('[data-uv-app]:not([data-uv-app="relief"]),[data-uv-many]{display:none!important}');
    expect(hideCss(['campus', 'trace', 'relief', 'green', 'travel'])).toBe('');
  });
});
