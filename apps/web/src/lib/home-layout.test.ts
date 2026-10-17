import { describe, expect, it } from 'vitest';
import { arrange, cleanLayout, hideCard, moveCard, nextChange, showCard, upNext, EMPTY_LAYOUT, type UpNextItem } from './home-layout';
import { dayBounds, localTime, weekdayOf, cleanTimeZone } from './home-time';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('home layout', () => {
  it('cleans what comes from storage or a request', () => {
    expect(cleanLayout('{"order":["goal","goal","x1",3],"hidden":["brief"],"goal":50}')).toEqual({ order: ['goal'], hidden: ['brief'], goal: 3 });
    expect(cleanLayout('not json')).toEqual(EMPTY_LAYOUT);
    expect(cleanLayout({ goal: 5 }).goal).toBe(5);
  });
  it('keeps the default order until the person changes it, and new cards still appear', () => {
    const a = arrange('student', EMPTY_LAYOUT);
    expect(ids(a.top)).toEqual(['upnext', 'brief', 'impact', 'stats']);
    expect(ids(a.side)[0]).toBe('goal');
    // A saved layout from before a card existed: the missing card goes to the end of its zone.
    const old = arrange('student', { ...EMPTY_LAYOUT, order: ['grades', 'deadlines'] });
    expect(ids(old.side)).toEqual(['grades', 'deadlines', 'goal', 'level', 'streak']);
  });
  it('moves within a zone, hides and shows again', () => {
    let l = moveCard('student', EMPTY_LAYOUT, 'goal', 1);
    expect(ids(arrange('student', l).side).slice(0, 2)).toEqual(['level', 'goal']);
    expect(moveCard('student', l, 'upnext', -1)).toBe(l); // already first
    l = hideCard('student', l, 'impact');
    l = hideCard('student', l, 'streak');
    const a = arrange('student', l);
    expect(ids(a.hidden)).toEqual(['impact', 'streak']);
    expect(ids(a.top)).toEqual(['upnext', 'brief', 'stats']);
    l = showCard('student', l, 'impact');
    expect(ids(arrange('student', l).top)).toEqual(['upnext', 'brief', 'stats', 'impact']);
    expect(l.hidden).toEqual(['streak']);
  });
});

describe('up next', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  const min = 60_000;
  const items: UpNextItem[] = [
    { kind: 'quiz', id: 'q', title: 'Quiz 3', due: now + 26 * 60 * min, href: '/q' },
    { kind: 'call', id: 'c', title: 'Physics call', start: now + 8 * min, end: now + 68 * min, href: '/call' },
    { kind: 'class', id: 'old', title: 'Maths', start: now - 90 * min, end: now - 30 * min, href: '/m' },
    { kind: 'class', id: 'on', title: 'History', start: now - 10 * min, end: now + 40 * min, href: '/h' },
    { kind: 'grade', id: 'g', title: 'to grade', count: 12, href: '/g' },
    { kind: 'grade', id: 'g0', title: 'nothing', count: 0, href: '/g' },
    { kind: 'assignment', id: 'late', title: 'Essay', due: now - min, href: '/e' },
  ];
  it('puts what is on now first, then what starts soon, then things to do, then the rest', () => {
    const rows = upNext(items, now);
    expect(rows.map((r) => `${r.item.id}:${r.state}`)).toEqual(['on:live', 'c:soon', 'g:todo', 'q:due']);
    expect(rows[1]).toMatchObject({ minutes: 8, action: 'Join', ready: true });
  });
  it('switches Join on 10 minutes before a call, and drops it when it ends', () => {
    const call = items[1];
    expect(upNext([call], now - 5 * min)[0]).toMatchObject({ state: 'soon', ready: false, minutes: 13 });
    expect(upNext([call], now + 70 * min)).toEqual([]);
    expect(nextChange([call], now - 5 * min)).toBe(now - 2 * min);
  });
});

describe('home time', () => {
  it('turns a school day and HH:MM into the moment, clocks changing or not', () => {
    expect(new Date(localTime('2026-10-16', '09:30', 'Asia/Kolkata')!).toISOString()).toBe('2026-10-16T04:00:00.000Z');
    expect(new Date(localTime('2026-03-29', '09:00', 'Europe/London')!).toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(new Date(localTime('2026-03-28', '09:00', 'Europe/London')!).toISOString()).toBe('2026-03-28T09:00:00.000Z');
    expect(localTime('2026-10-16', '25:00', 'UTC')).toBeNull();
    const d = dayBounds('2026-10-16', 'America/New_York');
    expect(new Date(d.start).toISOString()).toBe('2026-10-16T04:00:00.000Z');
    expect(d.end - d.start).toBe(86_400_000);
    expect(weekdayOf('2026-10-16')).toBe(4); // a Friday
    expect(cleanTimeZone('Not/AZone')).toBeUndefined();
    expect(cleanTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });
});
