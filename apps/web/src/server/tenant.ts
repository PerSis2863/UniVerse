import prisma from "@/lib/db";
import type { SessionUser } from "@/lib/server-auth";
import { BadRequestException } from "./http";

// Stage 5 · C2: Multi-school SaaS.
// Organizations (schools) get their own subdomain (<slug>.universeimpact.com) or custom domain,
// branding (color, crest, title, tagline), and queries can be scoped by organizationId.

export const RESERVED_SLUGS = new Set([
  "api", "app", "www", "admin", "console", "auth", "login", "signup", "join",
  "static", "assets", "help", "support", "status", "legal", "terms", "privacy",
  "verify", "call", "board", "realtime", "guardian", "reports", "pricing", "impact"
]);

/** Standardizes and validates a school subdomain slug (e.g. "riverside", "stanford"). */
export function cleanSlug(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) throw new BadRequestException("Subdomain slug is required.");
  if (s.length < 3 || s.length > 32) {
    throw new BadRequestException("Subdomain must be between 3 and 32 characters.");
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
    throw new BadRequestException("Subdomain can only contain lowercase letters, numbers, and single hyphens.");
  }
  if (RESERVED_SLUGS.has(s)) {
    throw new BadRequestException(`"${s}" is a reserved system name and cannot be used.`);
  }
  return s;
}

/** Validates custom domain format (e.g. "learn.school.edu"). */
export function cleanCustomDomain(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = String(raw).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (d.length > 120 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) {
    throw new BadRequestException("Enter a valid domain name like learn.yourschool.edu.");
  }
  return d;
}

/** Validates brand color hex (e.g. "#2b3568" or "#2b3568"). */
export function cleanBrandColor(raw: unknown): string | null {
  if (!raw) return null;
  const c = String(raw).trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c)) {
    throw new BadRequestException("Brand color must be a valid hex code like #2b3568.");
  }
  return c;
}

/**
 * Extracts a school subdomain from a request Host header.
 * E.g. "riverside.universeimpact.com" -> "riverside", "oxford.localhost:3100" -> "oxford".
 * Returns null for apex/root domains like "universeimpact.com", "localhost", "www.universeimpact.com".
 */
export function extractHostSlug(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase().split(":")[0].trim();
  if (!host || host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.")) return null;
  if (host === "universeimpact.com" || host === "www.universeimpact.com") return null;
  if (host.endsWith(".pages.dev") || host.endsWith(".workers.dev")) return null;

  // Pattern: <subdomain>.universeimpact.com or <subdomain>.localhost
  const parts = host.split(".");
  if (host.endsWith(".universeimpact.com") && parts.length === 3) {
    const slug = parts[0];
    return RESERVED_SLUGS.has(slug) ? null : slug;
  }
  if (parts.length === 2 && parts[1] === "localhost") {
    const slug = parts[0];
    return RESERVED_SLUGS.has(slug) ? null : slug;
  }
  return null;
}

export type SchoolBranding = {
  isSchool: boolean;
  id: string | null;
  name: string;
  slug: string | null;
  customDomain: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  appTitle: string;
  tagline: string | null;
};

const DEFAULT_BRANDING: SchoolBranding = {
  isSchool: false,
  id: null,
  name: "UniVerse Impact",
  slug: null,
  customDomain: null,
  brandColor: null,
  logoUrl: null,
  appTitle: "UniVerse Impact",
  tagline: "The Campus Operating System"
};

/** In-memory cache for fast host resolution without repeated D1 lookups. */
const cache = new Map<string, { data: SchoolBranding; expiresAt: number }>();

/** Resolves school branding and organization details for an incoming HTTP request. */
export async function resolveTenant(req: Request, forceSlug?: string | null): Promise<SchoolBranding> {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().split(":")[0].trim();
  const slug = forceSlug ? forceSlug.toLowerCase() : extractHostSlug(host);

  const cacheKey = slug ? `slug:${slug}` : `host:${host}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let org = null;
  if (slug) {
    org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, customDomain: true, brandColor: true, logoUrl: true, appTitle: true, tagline: true }
    });
  } else if (host && host !== "universeimpact.com" && host !== "www.universeimpact.com" && !host.endsWith(".pages.dev")) {
    // Check if host matches a customDomain
    org = await prisma.organization.findUnique({
      where: { customDomain: host },
      select: { id: true, name: true, slug: true, customDomain: true, brandColor: true, logoUrl: true, appTitle: true, tagline: true }
    });
  }

  const result: SchoolBranding = org ? {
    isSchool: true,
    id: org.id,
    name: org.name,
    slug: org.slug,
    customDomain: org.customDomain,
    brandColor: org.brandColor,
    logoUrl: org.logoUrl,
    appTitle: org.appTitle || `${org.name} UniVerse`,
    tagline: org.tagline
  } : DEFAULT_BRANDING;

  // Cache for 60 seconds
  cache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
  return result;
}

/** Provides multi-tenant data scoping where applicable. */
export function scopeWhere(user: SessionUser): { organizationId?: string } {
  if (user.owner) return {}; // platform owner reaches all
  if (user.organizationId) return { organizationId: user.organizationId };
  return {};
}
