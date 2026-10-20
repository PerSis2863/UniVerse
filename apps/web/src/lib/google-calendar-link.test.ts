import { describe, expect, it } from 'vitest';
import { googleCalendarLink } from './google-calendar-link';

describe('Add to Google Calendar link (Q23)', () => {
  it('fills in the title and the times in UTC', () => {
    const url = new URL(googleCalendarLink({ title: 'Maths revision', start: new Date('2026-10-21T09:30:00Z'), end: new Date('2026-10-21T10:15:00Z'), details: 'Chapter 4' }));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Maths revision');
    expect(url.searchParams.get('dates')).toBe('20261021T093000Z/20261021T101500Z');
    expect(url.searchParams.get('details')).toBe('Chapter 4');
  });
  it('gives whole days for an all-day event', () => {
    const url = new URL(googleCalendarLink({ title: 'Sports day', start: new Date(2026, 9, 23), end: new Date(2026, 9, 24), allDay: true }));
    expect(url.searchParams.get('dates')).toBe('20261023/20261024');
    expect(url.searchParams.has('details')).toBe(false);
  });
});
