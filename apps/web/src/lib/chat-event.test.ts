import { describe, expect, it } from 'vitest';
import { answer, eventIcs, newEvent, type ChatEvent } from './chat-event';

const now = new Date('2026-11-19T10:00:00Z');
describe('chat events', () => {
  it('makes one from what was typed', () => {
    expect(newEvent({ title: ' Study night ', startsAt: '2026-11-20T18:00:00Z', place: 'Library' }, now)).toEqual({ title: 'Study night', startsAt: '2026-11-20T18:00:00.000Z', endsAt: null, place: 'Library', answers: {} });
    expect(newEvent({ title: '', startsAt: '2026-11-20T18:00:00Z' }, now)).toHaveProperty('error');
    expect(newEvent({ title: 'x', startsAt: 'nope' }, now)).toHaveProperty('error');
    expect(newEvent({ title: 'x', startsAt: '2026-11-01T18:00:00Z' }, now)).toHaveProperty('error');
    expect(newEvent({ title: 'x', startsAt: '2026-11-20T18:00:00Z', endsAt: '2026-11-20T17:00:00Z' }, now)).toHaveProperty('error');
  });
  it('keeps one answer each, and the same answer again takes it back', () => {
    const ev = newEvent({ title: 'x', startsAt: '2026-11-20T18:00:00Z' }, now) as ChatEvent;
    const a = answer(ev, { id: 'u1', name: 'Sam Lee' }, 'yes')!;
    expect(a.answers.u1).toEqual({ a: 'yes', name: 'Sam' });
    expect(answer(a, { id: 'u1', name: 'Sam Lee' }, 'maybe')!.answers.u1.a).toBe('maybe');
    expect(answer(a, { id: 'u1', name: 'Sam Lee' }, 'yes')!.answers.u1).toBeUndefined();
    expect(answer(a, { id: 'u1', name: 'S' }, 'sure')).toBeNull();
  });
  it('writes a calendar file', () => {
    const ics = eventIcs(newEvent({ title: 'Study, night', startsAt: '2026-11-20T18:00:00Z', place: 'Room 4' }, now) as ChatEvent, 'm1');
    expect(ics).toContain('DTSTART:20261120T180000Z');
    expect(ics).toContain('DTEND:20261120T190000Z');
    expect(ics).toContain('SUMMARY:Study\\, night');
  });
});
