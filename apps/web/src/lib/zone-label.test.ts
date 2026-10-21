import { describe, expect, it } from 'vitest';
import { zoneLabel } from './zone-label';

describe('time zone label (Phase E)', () => {
  it('names the zone the way people say it, and its full name', () => {
    const at = new Date('2026-10-21T10:00:00Z');
    const k = zoneLabel(at, 'Asia/Kolkata');
    expect(k.full).toBe('Asia/Kolkata');
    expect(k.text).toMatch(/Asia\/Kolkata$/);
    expect(k.short).toMatch(/GMT\+5:30|IST/);
    expect(zoneLabel(at, 'America/New_York').text).toMatch(/America\/New York$/);
  });
});
