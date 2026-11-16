import { describe, expect, it } from 'vitest';
import { bestOrder, hop, leg, minutesFor, nightsAt, planDays, readPrice, stopDates, tripBudget, tripIcs, type PlanItem, type PlanStop } from './travel-plan';

// M206: the trip planner's sums.
const stop = (id: string, name: string, lat: number, lon: number, days = 2, cc = 'PT'): PlanStop => ({ id, guide: name, name, cc, lat, lon, days, position: 0 });
const item = (id: string, lat: number | null, lon: number | null, extra: Partial<PlanItem> = {}): PlanItem => ({ id, stopId: 's1', day: null, position: 0, name: id, kind: 'see', lat, lon, hours: null, price: null, minutes: 90, ...extra });

describe('dates and nights', () => {
  it('gives each city its days in order, and a night in each but the last day', () => {
    const s = [stop('a', 'Lisbon', 38.7, -9.1, 3), stop('b', 'Porto', 41.1, -8.6, 2)];
    expect(stopDates('2026-12-30', s)).toEqual([{ offset: 0, from: '2026-12-30', to: '2027-01-01' }, { offset: 3, from: '2027-01-02', to: '2027-01-03' }]);
    expect(nightsAt(s)).toEqual([3, 1]);
  });
});

describe('time and distance', () => {
  it('knows a museum takes longer than a viewpoint', () => {
    expect(minutesFor('see', 'National Museum')).toBe(120);
    expect(minutesFor('see', 'Santa Luzia viewpoint')).toBe(30);
    expect(minutesFor('sleep', 'Hotel')).toBe(0);
  });
  it('walks short hops and rides longer ones', () => {
    expect(hop({ lat: 38.71, lon: -9.14 }, { lat: 38.712, lon: -9.13 })).toMatchObject({ walk: true });
    expect(hop({ lat: 38.71, lon: -9.14 }, { lat: 38.69, lon: -9.21 })).toMatchObject({ walk: false });
    expect(leg({ lat: 38.7, lon: -9.1 }, { lat: 41.1, lon: -8.6 })).toMatchObject({ flight: false });
    expect(leg({ lat: 38.7, lon: -9.1 }, { lat: 52.5, lon: 13.4 })).toMatchObject({ flight: true });
  });
});

describe('planDays', () => {
  it('keeps places that are close together on the same day', () => {
    const west = [item('w1', 38.69, -9.21), item('w2', 38.695, -9.205), item('w3', 38.697, -9.2)];
    const east = [item('e1', 38.712, -9.13), item('e2', 38.714, -9.128), item('e3', 38.71, -9.125)];
    const plan = planDays([...west, ...east, item('loose', null, null)], 2);
    const day = (id: string) => plan.find((p) => p.id === id)!.day;
    expect(new Set(west.map((w) => day(w.id))).size).toBe(1);
    expect(new Set(east.map((e) => day(e.id))).size).toBe(1);
    expect(day('w1')).not.toBe(day('e1'));
    expect(plan).toHaveLength(7);
  });
});

describe('bestOrder', () => {
  it('keeps the first city and finds the short way round', () => {
    const order = bestOrder([stop('lis', 'Lisbon', 38.7, -9.1), stop('mad', 'Madrid', 40.4, -3.7), stop('por', 'Porto', 41.1, -8.6), stop('sev', 'Seville', 37.4, -6.0)]);
    expect(order.map((s) => s.id)).toEqual(['lis', 'por', 'mad', 'sev']);
  });
});

describe('readPrice', () => {
  it('reads the guide’s ways of writing prices', () => {
    expect(readPrice('€8–20', 'EUR')).toEqual({ amount: 8, currency: 'EUR' });
    expect(readPrice('¥1,500', 'JPY')).toEqual({ amount: 1500, currency: 'JPY' });
    expect(readPrice('Rp 50.000', 'IDR')).toEqual({ amount: 50000, currency: 'IDR' });
    expect(readPrice('€1.40 a tart', 'EUR')).toEqual({ amount: 1.4, currency: 'EUR' });
    expect(readPrice('Free', 'EUR')).toEqual({ amount: 0, currency: 'EUR' });
    expect(readPrice('$15', 'AUD')).toEqual({ amount: 15, currency: 'AUD' });
    expect(readPrice('Adults 12', 'EUR')).toEqual({ amount: 12, currency: 'EUR' });
    expect(readPrice('ask at the desk', 'EUR')).toBeNull();
  });
});

describe('tripBudget', () => {
  it('adds up stays, food, getting around, between cities and tickets for everyone', () => {
    const s = [stop('s1', 'Lisbon', 38.7, -9.1, 3), stop('s2', 'Porto', 41.1, -8.6, 2)];
    const items = [item('a', 38.7, -9.1, { price: '€10' }), item('b', 38.7, -9.1)];
    const one = tripBudget({ name: 'T', startDate: null, travellers: 1, style: 'mid', currency: 'EUR' }, s, items);
    const two = tripBudget({ name: 'T', startDate: null, travellers: 2, style: 'mid', currency: 'EUR' }, s, items);
    expect(one.tickets).toBe(10);
    expect(one.unpriced).toBe(1);
    expect(one.between).toBeGreaterThan(0);
    expect(one.total).toBe(one.stay + one.food + one.local + one.between + one.tickets);
    expect(Math.abs(two.total - one.total * 2)).toBeLessThanOrEqual(3);
    expect(two.perPerson).toBe(Math.round(two.total / 2));
  });
});

describe('tripIcs', () => {
  it('writes a day per city day with its plan, and nothing without dates', () => {
    const s = [stop('s1', 'Lisbon', 38.7, -9.1, 2)];
    const ics = tripIcs({ id: 't', name: 'Portugal, at last', startDate: '2026-12-01', travellers: 1, style: 'mid', currency: 'EUR' }, s, [item('Belém Tower', null, null, { day: 0 })], new Date('2026-11-15T00:00:00Z'))!;
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('SUMMARY:Lisbon: day 1 · Portugal\\, at last');
    expect(ics).toContain('DESCRIPTION:1. Belém Tower');
    expect(tripIcs({ id: 't', name: 'x', startDate: null, travellers: 1, style: 'mid', currency: 'EUR' }, s, [])).toBeNull();
  });
});

describe('getting between places (M206, M207)', () => {
  it('links every way, the region’s own trains and buses, flights and ferries where they help', async () => {
    const { betweenLinks, ferryLikely, hostelLink } = await import('./travel-book');
    const eu = betweenLinks({ name: 'Lisbon', cc: 'PT' }, { name: 'Porto', cc: 'PT' }, { date: '2027-04-11', flight: false });
    expect(eu.map((l) => l.partner)).toEqual(['Rome2Rio', 'Google Maps', 'Omio']);
    expect(eu[0].url).toBe('https://www.rome2rio.com/s/Lisbon/Porto');
    expect(eu[1].url).toBe('https://www.google.com/maps/dir/?api=1&origin=Lisbon&destination=Porto&travelmode=transit');
    const asia = betweenLinks({ name: 'Bangkok', cc: 'TH' }, { name: 'Chiang Mai', cc: 'TH' }, { date: '2027-01-05', sea: ferryLikely('TH', 'TH') });
    expect(asia.find((l) => l.partner === '12Go')!.url).toBe('https://12go.asia/en/travel/bangkok/chiang-mai');
    expect(asia.find((l) => l.partner === 'Google Flights')!.url).toContain(encodeURIComponent('Flights from Bangkok to Chiang Mai on 2027-01-05'));
    expect(asia.some((l) => l.partner === 'Direct Ferries')).toBe(true);
    expect(ferryLikely('FR', 'DE')).toBe(false);
    expect(hostelLink('Kyoto/Central')).toBe('https://www.hostelworld.com/hostels/Kyoto/');
  });
});
