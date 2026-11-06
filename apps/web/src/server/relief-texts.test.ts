import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { guessNeed, textNumber } from '@/lib/relief';
import { notifyMany } from './email';
import { featureOff } from './moderation';
import { inboundText, twilioSignature } from './relief-texts';

vi.mock('@/lib/db', () => ({
  default: {
    reliefOrg: { findUnique: vi.fn() },
    reliefText: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    reliefOrgMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'coord' }]) },
  },
}));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));
vi.mock('./email', () => ({ notifyMany: vi.fn().mockResolvedValue(1) }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn().mockResolvedValue(1) } }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const URL_IN = 'https://universeimpact.com/api/core/relief/texts/inbound';
const TOKEN = 'test-token-not-a-secret';
const form = { From: 'whatsapp:+447700900481', To: 'whatsapp:+447700900123', Body: 'Family of 5, no food since yesterday', MessageSid: 'SM1' };
// Twilio's rule written out separately: URL, then each field's name and value sorted by name.
const theirs = (token: string, params: Record<string, string>) => createHmac('sha1', token).update(URL_IN + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
const request = (signature: string) => new Request(URL_IN, { method: 'POST', headers: { 'x-twilio-signature': signature } });

beforeEach(() => { vi.clearAllMocks(); process.env.TWILIO_AUTH_TOKEN = TOKEN; });

describe('text requests', () => {
  it('signs like Twilio does', async () => {
    expect(await twilioSignature(TOKEN, URL_IN, form)).toBe(theirs(TOKEN, form));
  });

  it('refuses while off or unset, and refuses a wrong signature', async () => {
    vi.mocked(featureOff).mockResolvedValueOnce(true);
    expect((await inboundText(request(theirs(TOKEN, form)), form)).status).toBe(503);
    delete process.env.TWILIO_AUTH_TOKEN;
    expect((await inboundText(request(theirs(TOKEN, form)), form)).status).toBe(503);
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    expect((await inboundText(request(theirs('another-token', form)), form)).status).toBe(403);
    expect((await inboundText(request(theirs(TOKEN, form)), { ...form, Body: 'changed on the way' })).status).toBe(403);
    expect(prisma.reliefText.create).not.toHaveBeenCalled();
  });

  it('files a message for the organisation with that number, tells its coordinators and thanks the sender', async () => {
    vi.mocked(prisma.reliefOrg.findUnique).mockResolvedValue({ id: 'o1', name: 'Riverside Food Bank' } as never);
    const res = await inboundText(request(theirs(TOKEN, form)), form);
    expect(res.status).toBe(200);
    const reply = await res.text();
    expect(reply).toContain('<Message>Thank you. Riverside Food Bank got your message');
    expect(reply).toContain('In danger? Call your emergency number now.');
    expect(prisma.reliefOrg.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { textNumber: '+447700900123' } }));
    expect(prisma.reliefText.create).toHaveBeenCalledWith({ data: { orgId: 'o1', channel: 'WHATSAPP', fromNumber: '+447700900481', body: form.Body } });
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['coord']);
    expect(vi.mocked(notifyMany).mock.calls[0][1]).toMatchObject({ email: false });
  });

  it('answers nothing for an unknown number or a flood from one phone (no paid reply)', async () => {
    vi.mocked(prisma.reliefOrg.findUnique).mockResolvedValueOnce(null);
    expect(await (await inboundText(request(theirs(TOKEN, form)), form)).text()).not.toContain('<Message>');
    vi.mocked(prisma.reliefOrg.findUnique).mockResolvedValueOnce({ id: 'o1', name: 'X' } as never);
    vi.mocked(prisma.reliefText.count).mockResolvedValueOnce(10);
    expect(await (await inboundText(request(theirs(TOKEN, form)), form)).text()).not.toContain('<Message>');
    expect(prisma.reliefText.create).not.toHaveBeenCalled();
  });

  it('reads numbers and makes a first guess at the need', () => {
    expect(textNumber('whatsapp:+44 7700-900123')).toBe('+447700900123');
    expect(textNumber('07700 900123')).toBeNull();
    expect(guessNeed('Family of 5, no food since yesterday')).toMatchObject({ kind: 'FOOD', people: 5, urgency: 'MEDIUM' });
    expect(guessNeed('My mother needs insulin urgently and a ride')).toMatchObject({ kind: 'MEDICAL', people: 1, urgency: 'HIGH' });
    expect(guessNeed('SOS 3 children trapped, house flooded')).toMatchObject({ kind: 'SHELTER', people: 3, urgency: 'CRITICAL' });
    expect(guessNeed('x'.repeat(200)).title.length).toBeLessThanOrEqual(80);
  });
});
