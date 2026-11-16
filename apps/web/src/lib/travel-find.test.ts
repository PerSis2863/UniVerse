import { describe, expect, it } from 'vitest';
import { dailyCost, fromUsd, matchPlace, rankPlaces, toUsd } from './travel-find';
import type { Idea } from './travel-ideas';

// M205: ranking places for days, a budget, a month, interests and a passport.
const climate = (high: number, rain: number) => ({ high: Array(12).fill(high), low: Array(12).fill(high - 8), rain: Array(12).fill(rain) });
const place = (title: string, cc: string, tags: Idea['tags'], c = climate(24, 40)): Idea => ({ title, cc, country: cc, themes: [], tags, blurb: '', climate: c });
const ask = { days: 5, budget: 400, currency: 'EUR', month: 10, interests: ['street', 'history'] as Idea['tags'], passport: 'GB' };

describe('the cost of a day', () => {
  it('is dearer where prices are higher, and converts both ways', () => {
    expect(dailyCost('CH', 'mid').total).toBeGreaterThan(dailyCost('IN', 'mid').total * 3);
    expect(toUsd(fromUsd(100, 'EUR'), 'EUR')).toBeCloseTo(100);
  });
});

describe('matchPlace', () => {
  it('likes mild dry weather, a budget that fits, the interests and an easy visa', () => {
    const m = matchPlace(place('Hanoi', 'VN', ['street', 'history', 'food']), ask, { VN: { s: 'none', d: '45 days' } });
    expect(m.reasons.every((r) => r.good)).toBe(true);
    expect(m.reasons.map((r) => r.text)).toContain('Street food and history');
    expect(m.fit).not.toBe('over');
  });
  it('says why a place fits badly', () => {
    const m = matchPlace(place('Zurich', 'CH', ['art'], climate(4, 80)), { ...ask, budget: 150 }, { CH: { s: 'none', d: '90 days' } });
    expect(m.fit).toBe('over');
    expect(m.reasons.filter((r) => !r.good).map((r) => r.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Cold/), expect.stringMatching(/^Over budget/), expect.stringMatching(/^Not known for/)]));
  });
  it('warns when the stay is longer than the visa allows', () => {
    const m = matchPlace(place('Bangkok', 'TH', ['street']), { ...ask, days: 40 }, { TH: { s: 'none', d: '30 days' } });
    expect(m.reasons.some((r) => /longer than the 30 days/.test(r.text))).toBe(true);
  });
});

describe('rankPlaces', () => {
  it('puts the best first, at most two from a country near the top, and leaves out refused entry', () => {
    const ideas = [place('A', 'IT', ['street', 'history']), place('B', 'IT', ['street', 'history']), place('C', 'IT', ['street', 'history']), place('D', 'PT', ['history']), place('E', 'RU', ['street', 'history'])];
    const r = rankPlaces(ideas, ask, { IT: { s: 'none' }, PT: { s: 'none' }, RU: { s: 'refused' } });
    expect(r.map((m) => m.idea.title)).toEqual(['A', 'B', 'D', 'C']);
  });
});
