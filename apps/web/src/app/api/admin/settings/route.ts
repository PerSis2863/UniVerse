import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { hasR2Storage } from '@/lib/r2';
import { isDemoLoginEnabled } from '@/server/auth';
import { audit } from '@/server/audit';

// Admin → Settings: the organization's name, and a live view of how this server is secured
// (read from its configuration, so it's always accurate).

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const [pendingApplications, suspended] = await Promise.all([
    prisma.roleApplication.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
  ]);
  return NextResponse.json(
    {
      organization: { name: auth.org.name },
      security: {
        demoLogin: isDemoLoginEnabled(),
        email: !!process.env.RESEND_API_KEY,
        credentialSigning: !!process.env.CREDENTIAL_SIGNING_PRIVATE_KEY,
        fileStorage: hasR2Storage(),
        pendingApplications,
        suspendedAccounts: suspended,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return NextResponse.json({ error: 'Enter the organization name.' }, { status: 400 });
  await prisma.organization.update({ where: { id: auth.org.id }, data: { name } });
  audit(auth.user, { action: 'organization.renamed', summary: `Renamed the organization to “${name}”`, targetType: 'organization', targetId: auth.org.id }, req);
  return NextResponse.json({ ok: true, name });
}
