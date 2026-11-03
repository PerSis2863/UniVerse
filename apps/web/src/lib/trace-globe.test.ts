import { describe, it, expect } from 'vitest';
import { globeFromShipments, minutesText } from './trace-globe';

describe('globeFromShipments', () => {
  it('makes a point per shipment, a destination point and an arc between them', () => {
    const { places, arcs, at } = globeFromShipments([
      { label: 'B1', product: 'Olive oil', status: 'IN_TRANSIT', position: { lat: 10, lng: 20 }, dest: { lat: 30, lng: 40, place: 'Rome' }, etaMinutes: 90 },
      { label: 'B2', product: 'Honey', status: 'MADE', position: null, dest: { lat: 1, lng: 2, place: 'Pune' } }, // no position: skipped
    ]);
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ label: 'Olive oil', lat: 10, lon: 20, tone: 'pink', value: '1 h 30 min away' });
    expect(places[1]).toMatchObject({ label: 'Rome', tone: 'aqua' });
    expect(arcs).toEqual([[0, 1]]);
    expect(at).toEqual([0, -1]); // each shipment's own point, so the list can turn the globe to it
  });

  it('flags a cold-chain shipment over its limit', () => {
    const { places } = globeFromShipments([
      { label: 'B', product: 'Vaccine', status: 'IN_TRANSIT', position: { lat: 0, lng: 0 }, dest: null, tempC: 9, maxTempC: 8 },
    ]);
    expect(places[0].value).toBe('over temperature');
  });

  it('writes minutes as hours and minutes', () => {
    expect(minutesText(206)).toBe('3 h 26 min');
    expect(minutesText(120)).toBe('2 h');
    expect(minutesText(45)).toBe('45 min');
  });
});
