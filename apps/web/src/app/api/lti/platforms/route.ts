import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { audit } from '@/server/audit';
import { toolUrls } from '@/server/lti';
import { sessionTokensEnabled } from '@/server/session-token';

// LMS registrations (admins). GET: registrations + the values to paste into the LMS. POST: register one.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can manage LMS connections.' }, { status: 403 });
  const [platforms, links] = await Promise.all([
    prisma.ltiPlatform.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.ltiContext.groupBy({ by: ['platformId'], _count: { _all: true } }),
  ]);
  const users = await prisma.ltiUser.groupBy({ by: ['platformId'], _count: { _all: true } });
  const tool = toolUrls();
  return NextResponse.json({
    platforms: platforms.map((p) => ({ ...p, courses: links.find((l) => l.platformId === p.id)?._count._all ?? 0, users: users.find((u) => u.platformId === p.id)?._count._all ?? 0 })),
    tool,
    ready: sessionTokensEnabled(),
    canvasConfig: {
      title: 'UniVerse', description: 'UniVerse Impact — courses, verified impact and credentials', oidc_initiation_url: tool.loginUrl, target_link_uri: tool.launchUrl,
      scopes: [], extensions: [{ domain: tool.domain, platform: 'canvas.instructure.com', privacy_level: 'public', settings: { placements: [{ placement: 'course_navigation', message_type: 'LtiResourceLinkRequest', text: 'UniVerse', windowTarget: '_blank' }, { placement: 'link_selection', message_type: 'LtiResourceLinkRequest', text: 'UniVerse' }] } }],
      public_jwk_url: tool.jwksUrl, custom_fields: {},
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

const url = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === 'https:' || u.hostname === 'localhost' ? u.toString() : null; } catch { return null; } };

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can manage LMS connections.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 80);
  const issuer = String(b.issuer ?? '').trim().replace(/\/+$/, '').slice(0, 300);
  const clientId = String(b.clientId ?? '').trim().slice(0, 200);
  const authLoginUrl = url(b.authLoginUrl), jwksUrl = url(b.jwksUrl), authTokenUrl = b.authTokenUrl ? url(b.authTokenUrl) : null;
  const deploymentIds = String(b.deploymentIds ?? '').split(/[\s,]+/).map((d) => d.trim()).filter(Boolean).slice(0, 20);
  if (!name || !issuer || !clientId || !authLoginUrl || !jwksUrl) return NextResponse.json({ error: 'Fill in the name, issuer, client ID, authorisation URL and keyset URL (https).' }, { status: 400 });
  try {
    const p = await prisma.ltiPlatform.create({ data: { name, issuer, clientId, authLoginUrl, authTokenUrl, jwksUrl, deploymentIds, trustEmails: b.trustEmails === true } });
    audit(user, { action: 'lti.platform_added', summary: `Connected LMS “${name}”`, targetType: 'lti_platform', targetId: p.id }, req);
    return NextResponse.json({ id: p.id });
  } catch {
    return NextResponse.json({ error: 'This LMS (issuer + client ID) is already registered.' }, { status: 409 });
  }
}
