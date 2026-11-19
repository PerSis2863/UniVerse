// M344 (WhatsApp's events): an event posted into a chat: what, when, where; everyone answers Going, Maybe or Can't, and
// can add it to their calendar. Kept in the message's metadata, changed only through POST /api/chat/messages/:id/rsvp.

export type Answer = 'yes' | 'maybe' | 'no';
export const ANSWERS: Answer[] = ['yes', 'maybe', 'no'];
export interface ChatEvent { title: string; startsAt: string; endsAt: string | null; place: string | null; answers: Record<string, { a: Answer; name: string }> }

/** A new event from what was typed (times as ISO strings), or an error to show. */
export function newEvent(raw: unknown, now = new Date()): ChatEvent | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const title = String(b.title ?? '').trim().slice(0, 120);
  const start = new Date(String(b.startsAt ?? ''));
  const end = b.endsAt ? new Date(String(b.endsAt)) : null;
  if (!title) return { error: 'Give the event a name.' };
  if (Number.isNaN(start.getTime())) return { error: 'Choose when it starts.' };
  if (start.getTime() < now.getTime() - 3600_000) return { error: 'That time has passed.' };
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return { error: 'It has to end after it starts.' };
  const place = String(b.place ?? '').trim().slice(0, 160) || null;
  return { title, startsAt: start.toISOString(), endsAt: end ? end.toISOString() : null, place, answers: {} };
}

/** The event with this person's answer set (the same answer again takes it back). */
export function answer(ev: ChatEvent, who: { id: string; name: string }, a: unknown): ChatEvent | null {
  if (!ANSWERS.includes(a as Answer)) return null;
  const answers = { ...(ev.answers ?? {}) };
  if (answers[who.id]?.a === a) delete answers[who.id];
  else answers[who.id] = { a: a as Answer, name: who.name.split(' ')[0] ?? who.name };
  return { ...ev, answers };
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** A calendar file for it (any calendar app opens it). */
export function eventIcs(ev: ChatEvent, uid: string): string {
  const end = ev.endsAt ?? new Date(new Date(ev.startsAt).getTime() + 3600_000).toISOString();
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Chat event//EN', 'BEGIN:VEVENT', `UID:${uid}@universeimpact.com`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.startsAt)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(ev.title)}`, ...(ev.place ? [`LOCATION:${esc(ev.place)}`] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
