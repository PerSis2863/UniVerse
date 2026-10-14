import prisma from '@/lib/db';
import { describeDevice } from '@/lib/device-name';
import { requestCf } from './request-cf';

// Sign-in history: each person can see when and from where their account was used
// (Settings → Privacy), so they notice sign-ins that weren't them.

export type LoginKind = 'SIGN_IN' | 'SIGN_UP' | 'SESSION';
const METHODS = new Set(['google', 'password', 'phone', 'apple', 'demo']);

/**
 * Records a sign-in. App opens ("SESSION") are recorded at most every 30 minutes per person and
 * network, so an open app doesn't fill the history.
 */
export async function recordLogin(userId: string, req: Request, kind: LoginKind, method?: unknown) {
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
    },
  });
}
