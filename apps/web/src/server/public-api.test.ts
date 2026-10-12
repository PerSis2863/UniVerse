import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  generateApiKey,
  verifyApiKey,
  revokeApiKey,
  cleanScopes,
  hashApiKey,
} from './public-api';

vi.mock('@/lib/db', () => ({
  default: {
    apiKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Public API Keys & Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanScopes', () => {
    it('normalizes valid scopes and ignores unknown ones', () => {
      const res = cleanScopes(['courses.read', 'students.read', 'fake.scope']);
      expect(res).toEqual(['courses.read', 'students.read']);
    });

    it('defaults to courses.read if no valid scope given', () => {
      expect(cleanScopes([])).toEqual(['courses.read']);
      expect(cleanScopes('invalid')).toEqual(['courses.read']);
    });
  });

  describe('generateApiKey', () => {
    it('generates raw key starting with uv_live_ and hashes before storing', async () => {
      vi.mocked(prisma.apiKey.create).mockResolvedValueOnce({
        id: 'key-1',
        name: 'SIS Sync',
        keyPrefix: 'uv_live_1234',
        scopes: '["courses.read"]',
        rateLimit: 300,
        expiresAt: null,
        createdAt: new Date(),
      } as never);

      const res = await generateApiKey({
        orgId: 'org-1',
        name: 'SIS Sync',
        scopes: ['courses.read'],
      });

      expect(res.secretKey).toMatch(/^uv_live_[a-f0-9]{48}$/);
      expect(prisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            name: 'SIS Sync',
            keyHash: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('verifyApiKey', () => {
    it('authenticates valid key matching hash', async () => {
      const raw = 'uv_live_abcdef1234567890abcdef1234567890abcdef12';
      const hash = hashApiKey(raw);

      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: 'key-1',
        name: 'SIS Key',
        keyHash: hash,
        scopes: '["courses.read","students.read"]',
        expiresAt: null,
        revokedAt: null,
        organization: { id: 'org-1', name: 'University', slug: 'uni' },
      } as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({} as never);

      const res = await verifyApiKey(`Bearer ${raw}`, 'courses.read');
      expect(res.apiKeyId).toBe('key-1');
      expect(res.organization.id).toBe('org-1');
    });

    it('throws on revoked key', async () => {
      const raw = 'uv_live_abcdef1234567890abcdef1234567890abcdef12';
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: 'key-1',
        keyHash: hashApiKey(raw),
        scopes: '["courses.read"]',
        revokedAt: new Date(),
      } as never);

      await expect(verifyApiKey(`Bearer ${raw}`)).rejects.toThrow('revoked');
    });

    it('throws when missing required scope', async () => {
      const raw = 'uv_live_abcdef1234567890abcdef1234567890abcdef12';
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: 'key-1',
        keyHash: hashApiKey(raw),
        scopes: '["courses.read"]',
        revokedAt: null,
        organization: { id: 'org-1', name: 'Univ', slug: 'u' },
      } as never);

      await expect(verifyApiKey(`Bearer ${raw}`, 'grades.write')).rejects.toThrow('required scope');
    });
  });

  describe('revokeApiKey', () => {
    it('marks key as revoked', async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({ id: 'key-1' } as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({ id: 'key-1', revokedAt: new Date() } as never);

      await revokeApiKey('key-1', 'org-1');
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
