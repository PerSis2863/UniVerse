import { describe, expect, it } from 'vitest';
import {
  MAP_H, MAP_W, bookingMinutes, clampBox, clockMinutes, dayWord, freeFor, freeSpot, isStudyRoom, loadLevel, nextClass, roomNow, roomUse, shortName,
  usageGrid, weekdayOf, type Busy,
} from './campus-map';

const at = (s: string) => clockMinutes(s)!;

describe('campus map: buildings', () => {
  it('keeps buildings on the map', () => {
    expect(clampBox({ x: -50, y: 900, w: 20, h: 5000 })).toEqual({ x: 0, y: 0, w: 60, h: MAP_H });
    expect(clampBox({ x: 990.4, y: 10.6, w: 100, h: 80 })).toEqual({ x: MAP_W - 100, y: 11, w: 100, h: 80 });
    expect(clampBox({})).toEqual({ x: 0, y: 0, w: 180, h: 120 });
  });

  it('puts a new building where there is room', () => {
    const first = freeSpot([]);
    expect(first).toEqual({ x: 20, y: 20, w: 180, h: 120 });
    const second = freeSpot([first]);
    expect(second.y).toBe(20);
    expect(second.x).toBeGreaterThanOrEqual(first.x + first.w + 20);
    // A full map: the middle.
    expect(freeSpot([{ x: 0, y: 0, w: MAP_W, h: MAP_H }])).toEqual({ x: 410, y: 260, w: 180, h: 120 });
  });

  it('short names', () => {
    expect(shortName('Science Block', null)).toBe('SB');
    expect(shortName('Library')).toBe('LIBR');
    expect(shortName('Anything', ' CS ')).toBe('CS');
    expect(shortName('The Arts and Media Centre')).toBe('TAA');
  });
});

describe('campus map: a room now', () => {
  it('reads times and booking lengths', () => {
    expect(clockMinutes('10:00 AM')).toBe(600);
    expect(clockMinutes('12:15 am')).toBe(15);
    expect(clockMinutes('14:30')).toBe(870);
    expect(clockMinutes('25:00')).toBeNull();
    expect(bookingMinutes('1')).toBe(60);
    expect(bookingMinutes('1.5')).toBe(90);
    expect(bookingMinutes('2h')).toBe(120);
    expect(bookingMinutes('2 hours')).toBe(120);
    expect(bookingMinutes('45 min')).toBe(45);
    expect(bookingMinutes('90m')).toBe(90);
    expect(bookingMinutes('')).toBe(60);
    expect(bookingMinutes('99')).toBe(720);
    expect(weekdayOf('2026-10-14')).toBe(2); // a Wednesday
  });

  const day: Busy[] = [
    { from: at('09:00'), to: at('10:30'), kind: 'class', label: 'CS101' },
    { from: at('10:30'), to: at('11:30'), kind: 'booking', label: 'Booked' },
    { from: at('10:00'), to: at('11:00'), kind: 'booking', label: 'Your booking', mine: true },
    { from: at('14:00'), to: at('15:00'), kind: 'booking', label: 'Booked' },
  ];

  it('a class first, busy until the end of everything back to back', () => {
    expect(roomNow(day, at('10:15'))).toEqual({ state: 'class', label: 'CS101', until: at('11:30'), next: null, mine: false });
    expect(roomNow(day, at('10:45'))).toMatchObject({ state: 'booked', label: 'Your booking', until: at('11:30'), mine: true });
  });

  it('free until the next thing, or for the rest of the day', () => {
    const r = roomNow(day, at('12:00'));
    expect(r).toEqual({ state: 'free', label: null, until: null, next: at('14:00'), mine: false });
    expect(freeFor(r, at('12:00'))).toBe(120);
    expect(freeFor(roomNow(day, at('16:00')), at('16:00'))).toBe(Infinity);
    expect(freeFor(roomNow(day, at('09:30')), at('09:30'))).toBe(0);
    expect(roomNow([], 600).state).toBe('free');
  });

  it('building colours and study rooms', () => {
    expect([loadLevel(0, 4), loadLevel(1, 4), loadLevel(2, 4), loadLevel(4, 4), loadLevel(1, 0)]).toEqual([0, 1, 2, 3, 0]);
    expect(isStudyRoom('Study room', 'B12')).toBe(true);
    expect(isStudyRoom('CLASSROOM', 'Group pod 3')).toBe(true);
    expect(isStudyRoom('LAB', 'Lab 3')).toBe(false);
  });
});

describe('campus map: your next class', () => {
  const slots = [
    { id: 'mon', dayOfWeek: 0, start: at('09:00'), end: at('10:30') },
    { id: 'wed-am', dayOfWeek: 2, start: at('09:00'), end: at('10:30') },
    { id: 'wed-pm', dayOfWeek: 2, start: at('13:00'), end: at('15:00') },
  ];
  it('the one on now, then later today, then the next day with classes', () => {
    expect(nextClass(slots, 2, at('09:30'))).toEqual({ slot: slots[1], dayOffset: 0, now: true });
    expect(nextClass(slots, 2, at('11:00'))).toEqual({ slot: slots[2], dayOffset: 0, now: false });
    expect(nextClass(slots, 2, at('16:00'))).toEqual({ slot: slots[0], dayOffset: 5, now: false });
    expect(nextClass(slots, 6, at('20:00'))).toEqual({ slot: slots[0], dayOffset: 1, now: false });
    expect(nextClass([], 2, 0)).toBeNull();
    expect(dayWord(0, 2)).toBe('Today');
    expect(dayWord(1, 6)).toBe('Tomorrow');
    expect(dayWord(5, 2)).toBe('Monday');
  });
});

describe('campus map: usage', () => {
  it('fills the hours rooms were in use, counting overlaps once', () => {
    const stretches = [
      { roomId: 'a', day: 'w0-0', dow: 0, from: at('09:00'), to: at('10:30') },
      { roomId: 'a', day: 'w0-0', dow: 0, from: at('10:00'), to: at('11:00') }, // overlaps the first
      { roomId: 'b', day: '2026-10-12', dow: 0, from: at('09:00'), to: at('10:00') },
      { roomId: 'a', day: 'w0-6', dow: 6, from: at('22:00'), to: at('23:00') }, // outside the hours shown
    ];
    const g = usageGrid(stretches, 2, 1);
    expect(g).toHaveLength(7);
    expect(g[0]).toHaveLength(14);
    expect(g[0][2]).toBe(1); // 9:00, both rooms
    expect(g[0][3]).toBe(0.5); // 10:00, room a only
    expect(g[0][4]).toBe(0);
    expect(g[6].every((v) => v === 0)).toBe(true);
    expect(usageGrid(stretches, 0, 1)[0][2]).toBe(0);

    const use = roomUse(stretches, [{ id: 'a', name: 'Room A' }, { id: 'b', name: 'Room B' }, { id: 'c', name: 'Room C' }], 1);
    expect(use.map((r) => [r.id, r.hours])).toEqual([['a', 3], ['b', 1], ['c', 0]]);
    expect(use[0].share).toBe(0.06); // 3 of 50 open hours
  });
});
