import prisma from '@/lib/db';
import { BadRequestException } from './http';
import { extractHostSlug } from './tenant';

// Stage 5 · C3: Enterprise SSO & University Logins.
// Supports Microsoft Entra ID (Office 365), Google Workspace, and University SAML 2.0.

export type SsoProvider = 'MICROSOFT' | 'GOOGLE' | 'SAML';

export const VALID_SSO_PROVIDERS: SsoProvider[] = ['MICROSOFT', 'GOOGLE', 'SAML'];

export function cleanSsoProvider(raw: unknown): SsoProvider | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const p = String(raw).trim().toUpperCase();
  if (p === 'MICROSOFT' || p === 'GOOGLE' || p === 'SAML') return p;
  throw new BadRequestException('SSO provider must be one of: MICROSOFT, GOOGLE, SAML.');
}

/** Parses and normalizes comma-separated domains (e.g. "riverside.edu, students.riverside.edu"). */
export function cleanSsoDomain(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;
  const parts = str.split(',').map((d) => d.trim().replace(/^@/, '')).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(part)) {
      throw new BadRequestException(`"${part}" is not a valid domain name (e.g. school.edu).`);
    }
  }
  return parts.join(', ');
}

export function cleanTenantId(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.length > 200) throw new BadRequestException('Tenant ID / Entity ID cannot exceed 200 characters.');
  return t;
}

/** Checks whether an email matches any of the allowed SSO domains. */
export function matchSsoDomain(email: string, domainList: string | null | undefined): boolean {
  if (!email || !domainList) return false;
  const atIdx = email.indexOf('@');
  if (atIdx === -1) return false;
  const emailDomain = email.slice(atIdx + 1).trim().toLowerCase();
  const allowed = domainList.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return allowed.some((d) => d === emailDomain || emailDomain.endsWith(`.${d}`));
}

export type SsoLookupResult = {
  hasSso: boolean;
  provider?: SsoProvider;
  providerName?: string;
  schoolName?: string;
  tenantId?: string | null;
  enforced?: boolean;
};

const ssoCache = new Map<string, { data: SsoLookupResult; expiresAt: number }>();

/**
 * Finds SSO configuration for an email domain or a school slug/subdomain.
 * Uses in-memory cache to stay extremely fast and well within Cloudflare Free CPU limits.
 */
export async function lookupSso(params: { email?: string | null; slug?: string | null; host?: string | null }): Promise<SsoLookupResult> {
  const email = params.email ? params.email.trim().toLowerCase() : null;
  const slug = params.slug ? params.slug.trim().toLowerCase() : (params.host ? extractHostSlug(params.host) : null);

  const cacheKey = `${email || ''}|${slug || ''}`;
  const cached = ssoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let org = null;

  // 1. If slug is present, lookup by organization slug
  if (slug) {
    org = await prisma.organization.findUnique({
      where: { slug },
      select: { name: true, ssoEnabled: true, ssoProvider: true, ssoDomain: true, ssoTenantId: true, ssoEnforced: true },
    });
  }

  // 2. If no org found yet and email is present, search by matching domain
  if ((!org || !org.ssoEnabled) && email && email.includes('@')) {
    const ssoOrgs = await prisma.organization.findMany({
      where: { ssoEnabled: true },
      select: { name: true, ssoEnabled: true, ssoProvider: true, ssoDomain: true, ssoTenantId: true, ssoEnforced: true },
      take: 20,
    });
    org = ssoOrgs.find((o) => matchSsoDomain(email, o.ssoDomain)) ?? null;
  }

  if (!org || !org.ssoEnabled || !org.ssoProvider) {
    const fallback: SsoLookupResult = { hasSso: false };
    ssoCache.set(cacheKey, { data: fallback, expiresAt: Date.now() + 60_000 });
    return fallback;
  }

  const providerNames: Record<SsoProvider, string> = {
    MICROSOFT: 'Microsoft Entra ID (Office 365)',
    GOOGLE: 'Google Workspace',
    SAML: 'University SAML 2.0',
  };

  const provider = org.ssoProvider as SsoProvider;
  const result: SsoLookupResult = {
    hasSso: true,
    provider,
    providerName: providerNames[provider] || provider,
    schoolName: org.name,
    tenantId: org.ssoTenantId,
    enforced: org.ssoEnforced,
  };

  ssoCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
  return result;
}

export function clearSsoCache() {
  ssoCache.clear();
}
