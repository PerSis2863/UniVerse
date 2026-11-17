import { describe, expect, it } from 'vitest';
import { flag, travelStats } from './travel-stats';

const s = (name: string, cc: string, lat: number, lon: number, days: number, mode: string | null = null) => ({ name, cc, lat, lon, days, mode });

describe('travel stats (M257)', () => {
  it('counts countries, cities, days, kilometres and CO₂, done apart from to come', () => {
    const trips = [
      { startDate: '2026-04-08', route: [s('Lisbon', 'PT', 38.71, -9.14, 3), s('Porto', 'PT', 41.15, -8.61, 2, 'train'), s('Madrid', 'ES', 40.42, -3.7, 2)] },
      { startDate: '2027-01-10', route: [s('Lisbon', 'PT', 38.71, -9.14, 4)] },
      { startDate: null, route: [s('Tokyo', 'JP', 35.68, 139.69, 5)] },
    ];
    const st = travelStats(trips, '2026-11-17');
    expect(st.done).toMatchObject({ trips: 1, countries: ['ES', 'PT'], cities: 3, days: 7 });
    expect(st.done.km).toBe(696); // 274 + 422 km in straight lines
    expect(st.done.kg).toBeGreaterThan(0);
    expect(st.coming).toMatchObject({ trips: 2, countries: ['JP', 'PT'], cities: 2, days: 9, km: 0, kg: 0 });
    expect(st.all.cities).toBe(4);
    expect(flag('pt')).toBe('🇵🇹');
  });
});
