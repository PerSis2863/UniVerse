import { describe, expect, it } from 'vitest';
import { indoorIdeas, outdoors, wet } from './travel-rain';

describe('rain plan (M249)', () => {
  it('knows a wet day', () => {
    expect(wet({ date: 'd', rain: 4.2, symbol: 'cloudy' })).toBe(true);
    expect(wet({ date: 'd', rain: 0.3, symbol: 'lightrainshowers_day' })).toBe(true);
    expect(wet({ date: 'd', rain: 0, symbol: 'clearsky_day' })).toBe(false);
    expect(wet(null)).toBe(false);
  });
  it('tells outdoor places from indoor ones', () => {
    expect(outdoors({ name: 'São Jorge Castle', kind: 'see' })).toBe(true);
    expect(outdoors({ name: 'Miradouro da Graça', kind: 'see' })).toBe(true);
    expect(outdoors({ name: 'Gulbenkian Museum', kind: 'see', note: 'set in a lovely garden' })).toBe(false);
    expect(outdoors({ name: 'Time Out Market', kind: 'eat' })).toBe(false);
  });
  it('suggests indoor places nearest the day first, not already planned', () => {
    const day = [{ name: 'Belém Tower', kind: 'see', lat: 38.6916, lon: -9.216 }];
    const listings = [
      { name: 'Tile Museum', kind: 'see', lat: 38.7253, lon: -9.1135 },
      { name: 'Coach Museum', kind: 'see', lat: 38.6977, lon: -9.1983 },
      { name: 'Belém Tower', kind: 'see', text: 'a museum inside', lat: 38.6916, lon: -9.216 },
      { name: 'Surf school', kind: 'do' },
    ];
    expect(indoorIdeas(listings, day).map((p) => p.name)).toEqual(['Coach Museum', 'Tile Museum']);
  });
});
