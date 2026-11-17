import { describe, expect, it } from 'vitest';
import { docAlerts, dueAlerts } from './travel-docs';

const trip = { start: '2027-04-08', end: '2027-04-20' };
const doc = (kind: string, expires: string | null, reminded = '') => ({ kind, label: '', expires, reminded });

describe('documents and reminders (M245)', () => {
  it('warns of a passport too close to expiring for the trip', () => {
    expect(docAlerts(doc('passport', '2027-08-01'), '2027-01-01', trip).map((a) => a.key)).toEqual(['passport6m']);
    expect(docAlerts(doc('passport', '2028-08-01'), '2027-01-01', trip)).toEqual([]);
    expect(docAlerts(doc('insurance', '2027-04-15'), '2027-01-01', trip).map((a) => a.key)).toEqual(['beforeEnd']);
  });
  it('counts down to an expiry and to the trip', () => {
    expect(docAlerts(doc('visa', '2027-01-20'), '2027-01-01', null)[0]).toMatchObject({ key: 'exp30', title: 'Visa or entry permit expires in 19 days' });
    expect(docAlerts(doc('visa', '2027-01-05'), '2027-01-01', null)[0].key).toBe('exp7');
    expect(docAlerts(doc('visa', '2026-12-01'), '2027-01-01', null)[0].key).toBe('expired');
    expect(docAlerts(doc('booking', null), '2027-03-20', trip).map((a) => a.key)).toEqual(['trip30']);
    expect(docAlerts(doc('booking', null), '2027-04-03', trip).map((a) => a.key)).toEqual(['trip7']);
    expect(docAlerts(doc('booking', null), '2027-04-07', trip)[0]).toMatchObject({ key: 'trip1', title: 'Your trip starts in 1 day' });
    expect(docAlerts(doc('booking', null), '2027-04-09', trip)).toEqual([]);
  });
  it('sends each reminder once', () => {
    expect(dueAlerts(doc('booking', null, 'trip30'), '2027-03-20', trip)).toEqual([]);
    expect(dueAlerts(doc('booking', null, 'trip30'), '2027-04-03', trip)).toHaveLength(1);
  });
});
