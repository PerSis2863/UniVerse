import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { readTicketCode, ticketCode } from './campus-life';
import { scanTicket } from './event-tickets';

// Stage 5 · Q17: signed tickets and the door scan (each ticket works once).
vi.mock('@/lib/db', () => ({ default: { eventRsvp: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-0123';
const admin = { id: 'a1', name: 'Admin', email: 'a@x', role: 'ADMIN' } as never;
const row = (extra: Record<string, unknown> = {}) => ({ id: 'rsvp1', itemId: 'ev1', status: 'GOING', checkedInAt: null, user: { name: 'Alice' }, item: { title: 'Gala' }, ...extra }) as never;

describe('tickets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs a ticket and refuses a changed one', () => {
    const code = ticketCode('rsvp1');
    expect(readTicketCode(code)).toBe('rsvp1');
    expect(readTicketCode(code.replace('rsvp1', 'rsvp2'))).toBe(null);
    expect(readTicketCode('t1.rsvp1.' + 'A'.repeat(22))).toBe(null);
    expect(readTicketCode('hello')).toBe(null);
  });

  it('lets a ticket in once', async () => {
    vi.mocked(prisma.eventRsvp.findUnique).mockResolvedValueOnce(row());
    vi.mocked(prisma.eventRsvp.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    expect(await scanTicket(admin, 'ev1', ticketCode('rsvp1'))).toEqual({ ok: true, name: 'Alice', usedAt: null });
    const used = new Date('2026-10-19T10:02:00Z');
    vi.mocked(prisma.eventRsvp.findUnique).mockResolvedValueOnce(row({ checkedInAt: used }));
    expect(await scanTicket(admin, 'ev1', ticketCode('rsvp1'))).toEqual({ ok: false, name: 'Alice', usedAt: used });
  });

  it('refuses another event’s ticket, a cancelled one, a made-up one and non-admins', async () => {
    vi.mocked(prisma.eventRsvp.findUnique).mockResolvedValueOnce(row({ itemId: 'ev2' }));
    await expect(scanTicket(admin, 'ev1', ticketCode('rsvp1'))).rejects.toThrow('This ticket is for “Gala”.');
    vi.mocked(prisma.eventRsvp.findUnique).mockResolvedValueOnce(row({ status: 'WAITLIST' }));
    await expect(scanTicket(admin, 'ev1', ticketCode('rsvp1'))).rejects.toThrow('no longer valid');
    await expect(scanTicket(admin, 'ev1', 't1.rsvp1.forgedforgedforgedforged')).rejects.toThrow('Not a UniVerse ticket');
    await expect(scanTicket({ ...(admin as object), role: 'STUDENT' } as never, 'ev1', ticketCode('rsvp1'))).rejects.toThrow('Only admins');
  });
});
