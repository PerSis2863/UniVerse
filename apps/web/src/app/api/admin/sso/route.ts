import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { cleanSsoProvider, cleanSsoDomain, cleanTenantId, clearSsoCache } from '@/server/sso';

// Admin → Settings: Enterprise SSO (Microsoft Entra ID, Google Workspace, SAML 2.0).

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: auth.org.id },
    select: {
      ssoEnabled: true,
      ssoProvider: true,
      ssoDomain: true,
      ssoTenantId: true,
      ssoEnforced: true,
    },
  });

  return NextResponse.json(
    {
      ssoEnabled: org?.ssoEnabled ?? false,
      ssoProvider: org?.ssoProvider ?? null,
      ssoDomain: org?.ssoDomain ?? null,
      ssoTenantId: org?.ssoTenantId ?? null,
      ssoEnforced: org?.ssoEnforced ?? false,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const data: {
    ssoEnabled?: boolean;
    ssoProvider?: string | null;
    ssoDomain?: string | null;
    ssoTenantId?: string | null;
    ssoEnforced?: boolean;
  } = {};

  if (body.ssoEnabled !== undefined) {
    data.ssoEnabled = Boolean(body.ssoEnabled);
  }

  if (body.ssoProvider !== undefined) {
    try {
      data.ssoProvider = cleanSsoProvider(body.ssoProvider);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid SSO provider' }, { status: 400 });
    }
  }

  if (body.ssoDomain !== undefined) {
    try {
      data.ssoDomain = cleanSsoDomain(body.ssoDomain);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid SSO domain' }, { status: 400 });
    }
  }

  if (body.ssoTenantId !== undefined) {
    try {
      data.ssoTenantId = cleanTenantId(body.ssoTenantId);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid Tenant ID' }, { status: 400 });
    }
  }

  if (body.ssoEnforced !== undefined) {
    data.ssoEnforced = Boolean(body.ssoEnforced);
  }

  // If enabling SSO, require at least a provider and a domain or tenant ID
  if (data.ssoEnabled) {
    const provider = data.ssoProvider !== undefined ? data.ssoProvider : auth.org.ssoProvider;
    if (!provider) {
      return NextResponse.json({ error: 'Select an SSO provider (Microsoft Entra ID, Google Workspace, or SAML).' }, { status: 400 });
    }
  }

  const updated = await prisma.organization.update({
    where: { id: auth.org.id },
    data,
    select: {
      ssoEnabled: true,
      ssoProvider: true,
      ssoDomain: true,
      ssoTenantId: true,
      ssoEnforced: true,
    },
  });

  clearSsoCache();

  audit(
    auth.user,
    {
      action: 'organization.sso_updated',
      summary: "Updated SSO configuration for organization",
      targetType: 'organization',
      targetId: auth.org.id,
      metadata: {
        ssoEnabled: updated.ssoEnabled,
        ssoProvider: updated.ssoProvider,
        ssoDomain: updated.ssoDomain,
        ssoEnforced: updated.ssoEnforced,
      },
    },
    req,
  );

  return NextResponse.json(updated);
}
