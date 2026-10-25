import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { recordError } from './errors';

vi.mock('@/lib/db', () => ({ default: { errorReport: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() } } }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./email', () => ({ APP_URL: () => 'https://x', escapeHtml: (s: string) => s, sendEmail: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('recordError', () => {
  it('counts a new problem that many requests met at once instead of failing', async () => {
    vi.mocked(prisma.errorReport.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.errorReport.count).mockResolvedValue(0);
    vi.mocked(prisma.errorReport.create).mockRejectedValue(new Error('Unique constraint failed on the fields: (`fingerprint`)'));
    vi.mocked(prisma.errorReport.update).mockResolvedValue({} as never);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordError({ source: 'SERVER', kind: 'api', message: 'GET failed: boom', path: '/api/core/hub' });
    expect(vi.mocked(prisma.errorReport.update).mock.calls[0][0].data).toMatchObject({ count: { increment: 1 } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
