import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  computeWebhookSignature,
  verifyWebhookSignature,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
} from './webhooks';

vi.mock('@/lib/db', () => ({
  default: {
    webhookEndpoint: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Webhooks & HMAC Signatures', () => {
  const secret = 'whsec_test_secret_1234567890abcdef';
  const payload = JSON.stringify({ event: 'grade.posted', studentId: 'stu-1' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeWebhookSignature & verifyWebhookSignature', () => {
    it('computes valid HMAC signature and verifies correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeWebhookSignature(payload, secret, now);

      expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(verifyWebhookSignature(payload, sig, secret, 300)).toBe(true);
    });

    it('rejects tampered payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const sig = computeWebhookSignature(payload, secret, now);
      const tampered = JSON.stringify({ event: 'grade.posted', studentId: 'stu-2' });

      expect(verifyWebhookSignature(tampered, sig, secret, 300)).toBe(false);
    });

    it('rejects expired timestamp beyond tolerance', () => {
      const oldTime = Math.floor(Date.now() / 1000) - 400; // 400s ago
      const sig = computeWebhookSignature(payload, secret, oldTime);

      expect(verifyWebhookSignature(payload, sig, secret, 300)).toBe(false);
    });
  });

  describe('createWebhookEndpoint', () => {
    it('creates endpoint with whsec_ secret for valid https url', async () => {
      vi.mocked(prisma.webhookEndpoint.create).mockResolvedValueOnce({
        id: 'ep-1',
        url: 'https://api.partner.edu/webhooks',
        secret: 'whsec_mock',
        events: '["grade.posted"]',
        isActive: true,
      } as never);

      const res = await createWebhookEndpoint({
        orgId: 'org-1',
        url: 'https://api.partner.edu/webhooks',
        events: ['grade.posted'],
      });

      expect(res.id).toBe('ep-1');
      expect(prisma.webhookEndpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: 'https://api.partner.edu/webhooks',
            secret: expect.stringMatching(/^whsec_/),
          }),
        }),
      );
    });

    it('rejects non-https URLs', async () => {
      await expect(
        createWebhookEndpoint({
          orgId: 'org-1',
          url: 'http://insecure.partner.edu/webhook',
          events: ['grade.posted'],
        }),
      ).rejects.toThrow('HTTPS');
    });
  });

  describe('deleteWebhookEndpoint', () => {
    it('removes endpoint', async () => {
      vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValueOnce({ id: 'ep-1' } as never);
      vi.mocked(prisma.webhookEndpoint.delete).mockResolvedValueOnce({ id: 'ep-1' } as never);

      await deleteWebhookEndpoint('ep-1', 'org-1');
      expect(prisma.webhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: 'ep-1' } });
    });
  });
});
