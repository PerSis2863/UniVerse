import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanSsoProvider,
  cleanSsoDomain,
  cleanTenantId,
  matchSsoDomain,
  lookupSso,
  clearSsoCache,
} from './sso';
import prisma from '@/lib/db';

vi.mock('@/lib/db', () => ({
  default: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('sso helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSsoCache();
  });

  describe('cleanSsoProvider', () => {
    it('accepts valid providers', () => {
      expect(cleanSsoProvider('MICROSOFT')).toBe('MICROSOFT');
      expect(cleanSsoProvider('microsoft')).toBe('MICROSOFT');
      expect(cleanSsoProvider('GOOGLE')).toBe('GOOGLE');
      expect(cleanSsoProvider('google')).toBe('GOOGLE');
      expect(cleanSsoProvider('SAML')).toBe('SAML');
      expect(cleanSsoProvider('saml')).toBe('SAML');
    });

    it('returns null on empty values', () => {
      expect(cleanSsoProvider(null)).toBeNull();
      expect(cleanSsoProvider('')).toBeNull();
      expect(cleanSsoProvider(undefined)).toBeNull();
    });

    it('throws on unsupported provider', () => {
      expect(() => cleanSsoProvider('OKTA')).toThrow('SSO provider must be one of: MICROSOFT, GOOGLE, SAML');
      expect(() => cleanSsoProvider('LDAP')).toThrow('SSO provider must be one of: MICROSOFT, GOOGLE, SAML');
    });
  });

  describe('cleanSsoDomain', () => {
    it('normalizes single domain', () => {
      expect(cleanSsoDomain('riverside.edu')).toBe('riverside.edu');
      expect(cleanSsoDomain('@riverside.edu')).toBe('riverside.edu');
    });

    it('normalizes multiple comma-separated domains', () => {
      expect(cleanSsoDomain('riverside.edu, students.riverside.edu')).toBe('riverside.edu, students.riverside.edu');
      expect(cleanSsoDomain('@oxford.ac.uk,  @staff.oxford.ac.uk ')).toBe('oxford.ac.uk, staff.oxford.ac.uk');
    });

    it('returns null on empty', () => {
      expect(cleanSsoDomain(null)).toBeNull();
      expect(cleanSsoDomain('')).toBeNull();
      expect(cleanSsoDomain('  ')).toBeNull();
    });

    it('rejects invalid domain formats', () => {
      expect(() => cleanSsoDomain('not a domain')).toThrow('not a valid domain name');
      expect(() => cleanSsoDomain('https://school.edu')).toThrow('not a valid domain name');
      expect(() => cleanSsoDomain('school..edu')).toThrow('not a valid domain name');
    });
  });

  describe('cleanTenantId', () => {
    it('trims valid tenant ID', () => {
      expect(cleanTenantId('  72f988bf-86f1-41af-91ab-2d7cd011db47  ')).toBe('72f988bf-86f1-41af-91ab-2d7cd011db47');
      expect(cleanTenantId('common')).toBe('common');
      expect(cleanTenantId('urn:mace:incommon:stanford.edu')).toBe('urn:mace:incommon:stanford.edu');
    });

    it('returns null for empty', () => {
      expect(cleanTenantId(null)).toBeNull();
      expect(cleanTenantId('')).toBeNull();
    });

    it('rejects overly long strings', () => {
      expect(() => cleanTenantId('a'.repeat(201))).toThrow('cannot exceed 200 characters');
    });
  });

  describe('matchSsoDomain', () => {
    it('matches exact domain', () => {
      expect(matchSsoDomain('student@riverside.edu', 'riverside.edu')).toBe(true);
      expect(matchSsoDomain('STUDENT@RIVERSIDE.EDU', 'riverside.edu')).toBe(true);
    });

    it('matches subdomains', () => {
      expect(matchSsoDomain('john@math.riverside.edu', 'riverside.edu')).toBe(true);
      expect(matchSsoDomain('jane@alumni.stanford.edu', 'stanford.edu, berkeley.edu')).toBe(true);
    });

    it('rejects mismatched domain', () => {
      expect(matchSsoDomain('user@gmail.com', 'riverside.edu')).toBe(false);
      expect(matchSsoDomain('user@fake-riverside.edu', 'riverside.edu')).toBe(false);
    });

    it('handles malformed inputs safely', () => {
      expect(matchSsoDomain('', 'riverside.edu')).toBe(false);
      expect(matchSsoDomain('notanemail', 'riverside.edu')).toBe(false);
      expect(matchSsoDomain('user@domain.com', null)).toBe(false);
    });
  });

  describe('lookupSso', () => {
    it('looks up SSO by organization slug', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        name: 'Riverside High',
        ssoEnabled: true,
        ssoProvider: 'MICROSOFT',
        ssoDomain: 'riverside.edu',
        ssoTenantId: 'ms-tenant-123',
        ssoEnforced: true,
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>);

      const res = await lookupSso({ slug: 'riverside' });
      expect(res.hasSso).toBe(true);
      expect(res.provider).toBe('MICROSOFT');
      expect(res.providerName).toBe('Microsoft Entra ID (Office 365)');
      expect(res.schoolName).toBe('Riverside High');
      expect(res.tenantId).toBe('ms-tenant-123');
      expect(res.enforced).toBe(true);
    });

    it('looks up SSO by user email domain', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.organization.findMany).mockResolvedValueOnce([
        {
          name: 'Oxford University',
          ssoEnabled: true,
          ssoProvider: 'SAML',
          ssoDomain: 'oxford.ac.uk',
          ssoTenantId: 'https://idp.ox.ac.uk',
          ssoEnforced: false,
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.organization.findMany>>);

      const res = await lookupSso({ email: 'student@oxford.ac.uk' });
      expect(res.hasSso).toBe(true);
      expect(res.provider).toBe('SAML');
      expect(res.providerName).toBe('University SAML 2.0');
      expect(res.schoolName).toBe('Oxford University');
    });

    it('returns hasSso: false when not configured', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.organization.findMany).mockResolvedValueOnce([]);

      const res = await lookupSso({ email: 'user@gmail.com' });
      expect(res.hasSso).toBe(false);
    });
  });
});
