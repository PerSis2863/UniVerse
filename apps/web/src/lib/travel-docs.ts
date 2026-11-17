// M245: a traveller's documents for a trip (passport, visa, insurance, bookings…) and the reminders they bring, pure and
// tested (travel-docs.test.ts). Only names and dates are kept (never a document's number): the page says so.

export const DOC_KINDS = ['passport', 'visa', 'insurance', 'booking', 'licence', 'vaccine', 'other'] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_LABEL: Record<DocKind, string> = { passport: 'Passport', visa: 'Visa or entry permit', insurance: 'Travel insurance', booking: 'Booking', licence: 'Driving licence', vaccine: 'Vaccination', other: 'Other' };

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export interface Doc { kind: string; label: string; expires: string | null; reminded: string }
export interface Alert { key: string; title: string; body: string; level: 'warn' | 'info' }

/** What to tell the traveller about a document today (`trip` its dates when it belongs to one); keys already in
 *  `reminded` (comma-separated) aren't repeated by the daily reminders, the page shows them all. */
export function docAlerts(d: Doc, today: string, trip: { start: string; end: string } | null): Alert[] {
  const out: Alert[] = [];
  const name = d.label || DOC_LABEL[d.kind as DocKind] || 'A document';
  if (d.expires) {
    const left = days(today, d.expires);
    if (left < 0) out.push({ key: 'expired', title: `${name} has expired`, body: `It expired on ${d.expires}. Renew it before you travel.`, level: 'warn' });
    else if (left <= 30) out.push({ key: left <= 7 ? 'exp7' : 'exp30', title: `${name} expires in ${left} ${left === 1 ? 'day' : 'days'}`, body: `On ${d.expires}.`, level: 'warn' });
    if (trip && left >= 0) {
      if (d.expires < trip.end) out.push({ key: 'beforeEnd', title: `${name} expires during the trip`, body: `It ends on ${d.expires}, before the trip does (${trip.end}).`, level: 'warn' });
      else if (d.kind === 'passport' && days(trip.end, d.expires) < 183) out.push({ key: 'passport6m', title: 'Your passport ends soon after the trip', body: `Many countries want a passport valid six months past your stay; yours ends ${d.expires}, under six months after the trip. Check the rules for where you’re going.`, level: 'warn' });
    }
  }
  if (trip) {
    const until = days(today, trip.start);
    const step = until === 1 ? 'trip1' : until > 1 && until <= 7 ? 'trip7' : until > 7 && until <= 30 ? 'trip30' : null;
    if (step) out.push({ key: step, title: `Your trip starts in ${until} ${until === 1 ? 'day' : 'days'}`, body: `Check you have your ${name.toLowerCase()} ready.`, level: 'info' });
  }
  return out;
}

/** The alerts the daily reminder still has to send (not already in `reminded`). */
export const dueAlerts = (d: Doc, today: string, trip: { start: string; end: string } | null) => {
  const sent = new Set(d.reminded.split(',').filter(Boolean));
  return docAlerts(d, today, trip).filter((a) => !sent.has(a.key));
};
