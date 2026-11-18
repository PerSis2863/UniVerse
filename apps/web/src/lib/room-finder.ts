// Clashes and free rooms (M298): what overlaps what in a week's timetable or a room's day, shared by
// the room finder (src/components/campus/RoomFinder.tsx), room bookings (src/server/services/rooms.service.ts)
// and a person's own timetable (their classes that overlap).

export type Span = { from: number; to: number };
export const overlaps = (a: Span, b: Span) => a.from < b.to && b.from < a.to;

/** Rooms free for the whole span with at least `seats` seats, the snuggest fit first. */
export function freeRooms<R extends { capacity: number; busy: Span[] }>(rooms: R[], want: Span, seats = 0): R[] {
  return rooms.filter((r) => r.capacity >= seats && !r.busy.some((b) => overlaps(b, want))).sort((a, b) => a.capacity - b.capacity);
}

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/** Pairs of a person's weekly classes that overlap (same day, times crossing), each pair once. */
export function weekClashes<S extends { id: string; dayOfWeek: number; startTime: string; endTime: string }>(slots: S[]): [S, S][] {
  const out: [S, S][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.dayOfWeek === b.dayOfWeek && overlaps({ from: mins(a.startTime), to: mins(a.endTime) }, { from: mins(b.startTime), to: mins(b.endTime) })) out.push([a, b]);
    }
  }
  return out;
}
