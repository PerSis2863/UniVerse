import { describe, expect, it } from 'vitest';
import { greenHome } from './green-home';

describe('old Green addresses', () => {
  it('go to where each part lives now', () => {
    expect(greenHome('/green', '')).toBe('/student/life/green');
    expect(greenHome('/green', '?view=footprint')).toBe('/student/life/green?view=footprint');
    expect(greenHome('/green/teams', '')).toBe('/student/life/green?view=teams');
    expect(greenHome('/green', '?view=trips')).toBe('/travel?view=journeys');
    expect(greenHome('/green', '?view=places')).toBe('/travel?view=green');
    expect(greenHome('/green', '?view=events')).toBe('/relief?view=events');
    expect(greenHome('/green', '?view=swap')).toBe('/trace/swap');
    expect(greenHome('/green', '?view=nonsense')).toBe('/student/life/green');
  });
  it('keep the rest of the address', () => {
    expect(greenHome('/green', '?view=business&b=verify')).toBe('/trace/carbon?b=verify');
    expect(greenHome('/green', '?view=places&at=1,2')).toBe('/travel?view=green&at=1%2C2');
  });
});
