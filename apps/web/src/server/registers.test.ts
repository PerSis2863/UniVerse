import { describe, expect, it } from 'vitest';
import { assetFields, roomFields, routeFields } from './registers';
import { guardianBlocked } from './auth';

describe('equipment details', () => {
  it('keeps what’s given, in minor units for the cost', () => {
    const f = assetFields({ name: ' Projector ', status: 'IN_STORE', cost: '12500.5', currency: 'inr', purchasedAt: '2026-01-15' });
    expect(f).toMatchObject({ name: 'Projector', status: 'IN_STORE', cost: 1250050, currency: 'INR', purchasedAt: '2026-01-15' });
  });
  it('defaults the state and ignores bad dates', () => {
    expect(assetFields({ name: 'Chair', status: 'BROKEN', purchasedAt: 'last year' })).toMatchObject({ status: 'IN_USE', purchasedAt: null, cost: null });
  });
  it('needs a name and a sensible cost', () => {
    expect(() => assetFields({ name: '' })).toThrow();
    expect(() => assetFields({ name: 'Laptop', cost: '-5' })).toThrow();
  });
});

describe('bus routes', () => {
  it('keeps named stops in order with valid times only', () => {
    const r = routeFields({ name: 'Route 3', stops: [{ name: 'Gate', time: '07:30' }, { name: '', time: '07:40' }, { name: 'Market', time: '7:45' }] });
    expect(JSON.parse(r.stops)).toEqual([{ name: 'Gate', time: '07:30' }, { name: 'Market', time: null }]);
  });
  it('needs a name and 1–200 seats', () => {
    expect(() => routeFields({ name: '' })).toThrow();
    expect(() => routeFields({ name: 'R', capacity: 0 })).toThrow();
    expect(routeFields({ name: 'R', capacity: '' }).capacity).toBeNull();
  });
});

describe('hostel rooms', () => {
  it('needs a building, a room and 1–20 beds', () => {
    expect(roomFields({ building: 'A', name: '101', beds: 3 })).toMatchObject({ building: 'A', name: '101', beds: 3 });
    expect(() => roomFields({ building: '', name: '101', beds: 2 })).toThrow();
    expect(() => roomFields({ building: 'A', name: '101', beds: 0 })).toThrow();
  });
});

describe('parents and the registers', () => {
  const req = (p: string) => new Request(`https://x.test${p}`);
  it('see their child’s through the parent app only', () => {
    expect(guardianBlocked(req('/api/parent/registers'), { role: 'GUARDIAN' })).toBe(false);
    for (const p of ['/api/registers/me', '/api/registers/assets', '/api/library', '/api/staff/me']) expect(guardianBlocked(req(p), { role: 'GUARDIAN' }), p).toBe(true);
  });
});
