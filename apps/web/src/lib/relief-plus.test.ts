import { describe, expect, it } from 'vitest';
import { matches, readAlerts, readKit, readPlan, triage, walkMinutes, weatherRisks, type TriagePost } from './relief-plus';

// M217: Relief's urgent list, matches, plan, weather risks and alerts.
const now = Date.parse('2026-11-16T12:00:00Z');
const post = (id: string, type: 'NEED' | 'OFFER', o: Partial<TriagePost> = {}): TriagePost => ({ id, type, kind: 'FOOD', urgency: 'MEDIUM', people: 1, status: 'OPEN', createdAt: '2026-11-16T11:00:00Z', lat: 38.71, lng: -9.14, ...o });

describe('most urgent', () => {
  it('puts critical, long-waiting and many people first, open needs only, with the reasons', () => {
    const list = triage([post('a', 'NEED'), post('b', 'NEED', { urgency: 'CRITICAL', people: 6 }), post('c', 'NEED', { createdAt: '2026-11-13T12:00:00Z' }), post('d', 'OFFER'), post('e', 'NEED', { status: 'TAKEN' })], now);
    expect(list.map((x) => x.post.id)).toEqual(['b', 'c', 'a']);
    expect(list[0].why).toEqual(['Critical', '6 people']);
    expect(list[1].why).toEqual(['Waiting 3 days']);
  });
});

describe('matches', () => {
  it('pairs an open need with the nearest open offers of its kind within 15 km', () => {
    const m = matches([post('n', 'NEED'), post('o1', 'OFFER', { lat: 38.75 }), post('o2', 'OFFER', { lat: 38.72 }), post('far', 'OFFER', { lat: 40 }), post('w', 'OFFER', { kind: 'WATER' })]);
    expect(m).toHaveLength(1);
    expect(m[0].offers.map((o) => o.offer.id)).toEqual(['o2', 'o1']);
    expect(walkMinutes(1)).toBe(17);
  });
});

describe('plan and kit', () => {
  it('keeps a plan short and clean, six contacts at most, phones as numbers', () => {
    const p = readPlan({ people: 99, meetNear: 'x'.repeat(500), contacts: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, phone: '+351 21 <b>123</b>' })) });
    expect(p.people).toBe(20);
    expect(p.meetNear).toHaveLength(120);
    expect(p.contacts).toHaveLength(6);
    expect(p.contacts[0].phone).toBe('+351 21 123');
    expect(readKit(['water', 'water', 'nope', 3])).toEqual(['water']);
  });
});

describe('weather risks', () => {
  it('names heat, frost and heavy rain', () => {
    const r = weatherRisks([{ date: 'd1', min: 20, max: 39, rain: 0 }, { date: 'd2', min: -2, max: 5, rain: 30 }, { date: 'd3', min: 10, max: 20, rain: 2 }]);
    expect(r.map((x) => `${x.date} ${x.kind} ${x.level}`)).toEqual(['d1 heat danger', 'd2 cold take care', 'd2 rain take care']);
  });
});

describe('alerts', () => {
  it('reads GDACS and USGS as one list, the worst first, one quake once', () => {
    const gdacs = { features: [
      { geometry: { coordinates: [139.7, 35.6] }, properties: { eventtype: 'EQ', eventid: 1, name: 'Earthquake in Japan', alertlevel: 'Orange', todate: '2026-11-15T10:00:00Z', country: 'Japan', url: { report: 'https://www.gdacs.org/report.aspx?eventid=1' } } },
      { geometry: { coordinates: [-80, 25] }, properties: { eventtype: 'TC', eventid: 2, name: 'Cyclone X in Aruba, , Cuba', alertlevel: 'Red', todate: '2026-11-16T00:00:00Z', url: { report: 'javascript:alert(1)' } } },
      { geometry: { coordinates: [0, 0] }, properties: { eventtype: 'XX', alertlevel: 'Red', todate: '2026-11-16T00:00:00Z' } },
    ] };
    const usgs = { features: [
      { id: 'us1', geometry: { coordinates: [139.8, 35.7, 10] }, properties: { mag: 6.1, place: 'near Tokyo', time: Date.parse('2026-11-15T10:30:00Z'), url: 'https://earthquake.usgs.gov/x' } },
      { id: 'us2', geometry: { coordinates: [-70, -30, 10] }, properties: { mag: 4.8, place: 'Chile', time: Date.parse('2026-11-16T08:00:00Z'), url: 'https://earthquake.usgs.gov/y' } },
    ] };
    const a = readAlerts(gdacs, usgs, now);
    expect(a.map((x) => x.id)).toEqual(['gdacs-TC-2', 'gdacs-EQ-1', 'usgs-us2']);
    expect(a[0].url).toBeNull();
    expect(a[0].title).toBe('Cyclone X in Aruba, Cuba');
    expect(a[2]).toMatchObject({ title: 'M4.8 Chile', level: 'green', magnitude: 4.8 });
  });
});
