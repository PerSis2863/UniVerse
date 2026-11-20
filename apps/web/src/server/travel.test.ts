import { describe, expect, it, vi } from 'vitest';
import { countryFacts, fetchJson, weatherDays, weatherNow } from './travel';

// M202: country facts from the table kept in the app; a forecast's hours into days, in the place's time.
describe('Travel facts', () => {
  it('knows a country’s money, languages, driving side and emergency number', () => {
    const jp = countryFacts('JP')!;
    expect(jp).toMatchObject({ name: 'Japan', flag: '🇯🇵', capital: 'Tokyo', callingCode: '+81', drives: 'left' });
    expect(jp.currencies[0]).toEqual({ code: 'JPY', name: 'Japanese Yen' });
    expect(jp.emergency).toContain('110');
    expect(countryFacts('PT')!.emergency[0]).toBe('112');
    expect(countryFacts('ZZ')).toBeNull();
  });
  it('turns hours into days with the low, high, rain and the midday sky', () => {
    const at = (time: string, t: number, sym?: string, rain = 0) => ({ time, data: { instant: { details: { air_temperature: t } }, next_1_hours: { details: { precipitation_amount: rain } }, ...(sym ? { next_6_hours: { summary: { symbol_code: sym }, details: {} } } : {}) } });
    // Kyoto (135° E): 03:00 UTC is midday there.
    const days = weatherDays([at('2026-11-15T00:00:00Z', 9, 'cloudy'), at('2026-11-15T03:00:00Z', 15, 'clearsky_day', 0.4), at('2026-11-15T12:00:00Z', 6, 'clearsky_night')], 135.76);
    expect(days).toEqual([{ date: '2026-11-15', min: 6, max: 15, symbol: 'clearsky_day', rain: 0.4 }]);
    // M336: the hour nearest to now, for the map's weather; nothing when the forecast is old.
    expect(weatherNow([at('2026-11-15T00:00:00Z', 9.4, 'cloudy'), at('2026-11-15T03:00:00Z', 15, 'clearsky_day')], Date.parse('2026-11-15T02:10:00Z'))).toEqual({ at: '2026-11-15T03:00:00Z', temp: 15, symbol: 'clearsky_day' });
    expect(weatherNow([at('2026-11-15T00:00:00Z', 9)], Date.parse('2026-11-16T00:00:00Z'))).toBeNull();
  });
  it('calls a slow or unreachable source busy, not a fault (M231)', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))) as typeof fetch;
    try { await expect(fetchJson('https://example.org/x')).rejects.toMatchObject({ status: 503 }); } finally { globalThis.fetch = real; }
  });
});
