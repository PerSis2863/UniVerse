import prisma from '@/lib/db';

// Sign-in history: each person can see when and from where their account was used
// (Settings → Privacy), so they notice sign-ins that weren't them.

export type LoginKind = 'SIGN_IN' | 'SIGN_UP' | 'SESSION';
const METHODS = new Set(['google', 'password', 'phone', 'apple', 'demo']);

/** "Chrome on Android", "Safari on iPhone", ... from a User-Agent header. */
export function describeDevice(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : null;
  if (!browser && !os) return 'Unknown device';
  return [browser, os].filter(Boolean).join(' on ');
}

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
  const cf = (req as Request & { cf?: { city?: string; country?: string } }).cf;
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
