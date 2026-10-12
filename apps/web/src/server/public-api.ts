import crypto from 'node:crypto';
import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException, UnauthorizedException } from './http';

// Stage 5 · C4: Public REST API & Scoped API Keys (/api/v1/...).
// Provides secure, scoped programmatic access for universities and institutional developers.

export const VALID_API_SCOPES = [
  'courses.read',
  'courses.write',
  'students.read',
  'grades.read',
  'grades.write',
  'attendance.read',
  'attendance.write',
  'webhooks.manage',
] as const;

export type ApiScope = (typeof VALID_API_SCOPES)[number];

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function cleanScopes(raw: unknown): ApiScope[] {
  if (!Array.isArray(raw)) return ['courses.read'];
  const valid = new Set<string>(VALID_API_SCOPES);
  const out = raw.filter((s) => typeof s === 'string' && valid.has(s)) as ApiScope[];
  return out.length > 0 ? out : ['courses.read'];
}

export async function generateApiKey(params: {
  orgId: string;
  name: string;
  scopes: string[];
  expiresInDays?: number | null;
}) {
  const name = params.name.trim();
  if (!name || name.length < 2 || name.length > 60) {
    throw new BadRequestException('API key name must be between 2 and 60 characters.');
  }

  const scopes = cleanScopes(params.scopes);
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `uv_live_${randomBytes}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  let expiresAt: Date | null = null;
  if (params.expiresInDays && params.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + params.expiresInDays * 86_400_000);
  }

  const record = await prisma.apiKey.create({
    data: {
      organizationId: params.orgId,
      name,
      keyHash,
      keyPrefix,
      scopes: JSON.stringify(scopes),
      rateLimit: 300,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      rateLimit: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return {
    ...record,
    scopes: JSON.parse(record.scopes) as ApiScope[],
    secretKey: rawKey, // Returned only once upon creation
  };
}

export async function verifyApiKey(authHeader: string | null | undefined, requiredScope?: ApiScope) {
  if (!authHeader) throw new UnauthorizedException('Missing Authorization header.');

  const match = authHeader.match(/^Bearer\s+(uv_live_[a-zA-Z0-9]+)$/);
  if (!match) throw new UnauthorizedException('Invalid API key format. Expected Bearer uv_live_...');

  const rawKey = match[1];
  const keyHash = hashApiKey(rawKey);

  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });

  if (!key || key.revokedAt) {
    throw new UnauthorizedException('API key is invalid or has been revoked.');
  }

  if (key.expiresAt && key.expiresAt < new Date()) {
    throw new UnauthorizedException('API key has expired.');
  }

  const scopes = JSON.parse(key.scopes || '[]') as string[];
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new ForbiddenException(`API key does not possess required scope: ${requiredScope}`);
  }

  // Record usage
  void prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);

  return {
    apiKeyId: key.id,
    name: key.name,
    organization: key.organization,
    scopes,
  };
}

export async function listApiKeys(orgId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: orgId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      rateLimit: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return keys.map((k) => ({
    ...k,
    scopes: JSON.parse(k.scopes) as ApiScope[],
  }));
}

export async function revokeApiKey(keyId: string, orgId: string) {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId: orgId, revokedAt: null },
  });

  if (!existing) throw new BadRequestException('API key not found or already revoked.');

  return prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
}
