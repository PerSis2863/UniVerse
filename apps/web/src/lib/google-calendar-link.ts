// "Add to Google Calendar" for one event (Stage 5 · Q23): Google's own add-an-event page, filled in.
// No Google account link or key is needed; the person checks it and taps Save there.

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** The link: times in UTC, or whole local days for an all-day event (the end day not included). */
export function googleCalendarLink(e: { title: string; start: Date; end: Date; allDay?: boolean; details?: string; location?: string }): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title.slice(0, 200) });
  q.set('dates', e.allDay ? `${day(e.start)}/${day(e.end > e.start ? e.end : new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate() + 1))}` : `${stamp(e.start)}/${stamp(e.end)}`);
  if (e.details) q.set('details', e.details.slice(0, 1000));
  if (e.location) q.set('location', e.location.slice(0, 200));
  return `https://calendar.google.com/calendar/render?${q}`;
}
