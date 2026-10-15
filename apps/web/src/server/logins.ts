import prisma from '@/lib/db';
import { describeDevice } from '@/lib/device-name';
import { requestCf } from './request-cf';
import { extractBearer, signInTime } from './auth';

// Sign-in history: each person can see when and from where their account was used
// (Settings → Privacy), so they notice sign-ins that weren't them.

export type LoginKind = 'SIGN_IN' | 'SIGN_UP' | 'SESSION';
const METHODS = new Set(['google', 'password', 'phone', 'apple', 'demo', 'passkey', 'microsoft', 'sso']);

/**
 * Records a sign-in. App opens ("SESSION") are recorded at most every 30 minutes per person and
 * network, so an open app doesn't fill the history.
 */
export async function recordLogin(userId: string, req: Request, kind: LoginKind, method?: unknown, sessionAt?: number) {
  const ip = req.headers.get('cf-connecting-ip');
  if (kind === 'SESSION') {
    const recent = await prisma.loginEvent.findFirst({
      where: { userId, ip, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
      select: { id: true },
    });
    if (recent) return;
  }
  const cf = requestCf(req);
  const ua = req.headers.get('user-agent');
  await prisma.loginEvent.create({
    data: {
      userId,
      kind,
      method: typeof method === 'string' && METHODS.has(method) ? method : null,
      ip,
      country: req.headers.get('cf-ipcountry') ?? cf?.country ?? null,
      city: cf?.city ?? null,
      userAgent: ua?.slice(0, 300) ?? null,
      device: describeDevice(ua),
      // Which sign-in this is, so the devices list can sign out just this one.
      sessionAt: sessionAt ?? sessionOf(req),
    },
  });
}

/** The sign-in behind the request's token (seconds), or null (demo tokens, none). */
function sessionOf(req: Request): number | null {
  const token = extractBearer(req.headers.get('authorization'));
  return token ? signInTime(token) : null;
}
