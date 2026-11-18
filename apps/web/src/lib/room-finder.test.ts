import { describe, expect, it } from 'vitest';
import { freeRooms, overlaps, weekClashes } from './room-finder';

describe('room finder', () => {
  it('treats touching times as free', () => {
    expect(overlaps({ from: 540, to: 600 }, { from: 600, to: 660 })).toBe(false);
    expect(overlaps({ from: 540, to: 601 }, { from: 600, to: 660 })).toBe(true);
  });

  it('finds rooms free for the span with enough seats, the snuggest first', () => {
    const rooms = [{ id: 'big', capacity: 200, busy: [] }, { id: 'lab', capacity: 30, busy: [{ from: 600, to: 720 }] }, { id: 'seminar', capacity: 40, busy: [{ from: 480, to: 540 }] }, { id: 'tiny', capacity: 8, busy: [] }];
    expect(freeRooms(rooms, { from: 540, to: 660 }, 20).map((r) => r.id)).toEqual(['seminar', 'big']);
  });

  it('lists a person’s overlapping classes once', () => {
    const s = (id: string, dayOfWeek: number, startTime: string, endTime: string) => ({ id, dayOfWeek, startTime, endTime });
    const c = weekClashes([s('a', 1, '09:00', '10:30'), s('b', 1, '10:00', '11:00'), s('c', 2, '10:00', '11:00'), s('d', 1, '10:30', '12:00')]);
    expect(c.map(([x, y]) => `${x.id}${y.id}`)).toEqual(['ab', 'bd']);
  });
});
