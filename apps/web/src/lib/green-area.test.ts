import { describe, expect, it } from 'vitest';
import { areaName, areaOf, pace } from './green-area';

describe('neighbourhoods', () => {
  it('snaps a place to its 0.1° square', () => {
    expect(areaOf(12.97, 77.59)).toEqual({ lat: 12.9, lng: 77.5 });
    expect(areaOf(-33.87, 151.21)).toEqual({ lat: -33.9, lng: 151.2 });
    expect(areaOf(51.5, -0.12)).toEqual({ lat: 51.5, lng: -0.2 });
    expect(areaName({ lat: -33.9, lng: 151.2 })).toBe('33.9°S 151.2°E');
  });
  it('says whether the area is on pace', () => {
    expect(pace(50, 100, 0, 10, 4)).toEqual({ done: 0.5, time: 0.4, onPace: true });
    expect(pace(20, 100, 0, 10, 6).onPace).toBe(false);
  });
});
