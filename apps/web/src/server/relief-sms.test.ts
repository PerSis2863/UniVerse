import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { featureOff } from './moderation';
import { PER_DAY, textEmergency } from './relief-sms';

vi.mock('@/lib/db', () => ({
  default: {
    reliefWatch: { findMany: vi.fn() },
    reliefSmsSent: { count: vi.fn(), findMany: vi.fn() },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  },
}));
vi.mock('./moderation', () => ({ featureOff: vi.fn() }));
vi.mock('./email', () => ({ APP_URL: () => 'https://universeimpact.com' }));

const fetchMock = vi.fn();
const incident = { id: 'i1', title: 'River flooding' };
const watches = [{ userId: 'a', smsTo: '+919876543210' }, { userId: 'b', smsTo: '+919876543211' }, { userId: 'c', smsTo: '+919876543212' }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock.mockResolvedValue(new Response('{}', { status: 201 })));
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'placeholder', TWILIO_FROM: '+15550000000' });
  vi.mocked(featureOff).mockResolvedValue(false);
  vi.mocked(prisma.reliefWatch.findMany).mockResolvedValue(watches as never);
  vi.mocked(prisma.reliefSmsSent.count).mockResolvedValue(0);
  vi.mocked(prisma.reliefSmsSent.findMany).mockResolvedValue([{ userId: 'b' }] as never);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM; });

describe('emergency texts (M153)', () => {
  it('sends nothing while the owner’s switch is off', async () => {
    vi.mocked(featureOff).mockResolvedValue(true);
    expect(await textEmergency(incident, ['a', 'b', 'c'])).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing without the Twilio settings', async () => {
    delete process.env.TWILIO_FROM;
    expect(await textEmergency(incident, ['a'])).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('texts each helper once per emergency, recording them first', async () => {
    expect(await textEmergency(incident, ['a', 'b', 'c'])).toBe(2);
    const to = fetchMock.mock.calls.map(([, init]) => new URLSearchParams(init.body).get('To'));
    expect(to).toEqual(['+919876543210', '+919876543212']);
    expect(String(vi.mocked(prisma.$executeRawUnsafe).mock.calls[0][0])).toMatch(/^INSERT OR IGNORE INTO relief_sms_sent/);
  });

  it('stops at the daily cap', async () => {
    vi.mocked(prisma.reliefSmsSent.count).mockResolvedValue(PER_DAY - 1);
    expect(await textEmergency(incident, ['a', 'b', 'c'])).toBe(1);
  });
});
