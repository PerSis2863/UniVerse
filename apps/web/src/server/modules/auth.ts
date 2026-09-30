import type { Router } from '../router';
import prisma from '@/lib/db';
import { BadRequestException, UnauthorizedException } from '../http';
import { TERMS_VERSION } from '@/lib/terms-version';
import { extractBearer, forgetUser, isDemoAccount, isDemoLoginEnabled, isOwner, verifyFirebaseIdToken } from '../auth';
import { REQUESTABLE_ROLES, approveInvited, currentApplication, startSignupApplication } from './applications';
import { audit } from '../audit';
import { recordLogin } from '../logins';

const userSelect = {
  id: true, name: true, email: true, role: true, status: true, avatar: true,
  phone: true, googleId: true, onboardedAt: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

const getMe = (id: string) => prisma.user.findUnique({ where: { id }, select: userSelect });

export default function auth(router: Router) {
  const r = router.controller('auth');

  r.get('me', async ({ user }) => ({ ...(await getMe(user.id)), application: await currentApplication(user.id), ...(isOwner(user) ? { owner: true } : {}) }));

  // Sign-in history (Settings → Privacy): the app reports sign-ins, sign-ups and app opens.
  r.post('session', async ({ user, body, req }) => {
    const kind = body?.kind === 'SIGN_UP' ? 'SIGN_UP' : body?.kind === 'SIGN_IN' ? 'SIGN_IN' : 'SESSION';
    const token = extractBearer(req.headers.get('authorization'));
    await recordLogin(user.id, req, kind, token?.startsWith('mock-token-') ? 'demo' : body?.method);
    return { ok: true };
  });
  r.get('sessions', ({ user }) =>
    prisma.loginEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, method: true, ip: true, country: true, city: true, device: true, createdAt: true },
    }),
  );

  r.post('login', { public: true }, async ({ body }) => {
    if (isDemoLoginEnabled() && isDemoAccount(body?.email)) {
      const user = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: userSelect });
      if (user) return { accessToken: `mock-token-${user.id}`, refreshToken: `mock-token-${user.id}`, user };
    }
    throw new UnauthorizedException('Invalid credentials');
  });

  // Called right after Firebase sign-up with the name and the role picked on the sign-up page.
  // Picking "teacher" or "NGO representative" does NOT grant that role: it opens an application
  // that an admin must approve (see modules/applications.ts); meanwhile the account has student
  // permissions. Exception: someone an admin invited for that role, signing up with the invited
  // email address after verifying it, gets the role straight away.
  r.post('register', async ({ user, body, req }) => {
    const name = body?.name && String(body.name).trim() ? String(body.name).trim().slice(0, 100) : null;
    // Creating an account requires accepting the current Terms and Privacy Policy (the sign-up
    // form's checkbox); the version and time are recorded.
    const acceptsTerms = body?.acceptTerms === TERMS_VERSION;
    if (!acceptsTerms && user.termsVersion !== TERMS_VERSION) {
      throw new BadRequestException({ message: 'Please accept the Terms and Conditions and the Privacy Policy to create your account.', code: 'TERMS_REQUIRED', error: 'Bad Request' });
    }
    // Registration finished (the person picked a role and name): until now they had only signed in.
    await prisma.user.update({
      where: { id: user.id },
      data: { ...(name && name !== user.name ? { name } : {}), onboardedAt: user.onboardedAt ?? new Date(), ...(acceptsTerms ? { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() } : {}) },
    });
    forgetUser(user.id);
    // What they chose at sign-up. Individuals are either students (verified by an admin, from a
    // student card or enrolment certificate) or independent (freelancers, professionals, lifelong
    // learners: no verification, access straight away).
    const wanted = body?.role;
    const accountType = wanted === 'TEACHER' ? 'STAFF' : wanted === 'ADMIN' ? 'ORGANIZATION' : body?.accountType === 'STUDENT' ? 'STUDENT' : 'INDEPENDENT';
    if (!user.accountType) await prisma.user.update({ where: { id: user.id }, data: { accountType } });
    if (wanted === 'STUDENT' && accountType === 'STUDENT' && user.role === 'STUDENT' && !user.accountType) {
      await startSignupApplication({ ...user, name: name ?? user.name }, 'STUDENT');
    } else if ((REQUESTABLE_ROLES as readonly string[]).includes(wanted) && wanted !== 'STUDENT' && user.role === 'STUDENT') {
      const role = wanted as (typeof REQUESTABLE_ROLES)[number];
      const invitation = await prisma.invitation.findUnique({ where: { email: user.email.toLowerCase() } });
      const invited = invitation && invitation.role === role && invitation.status === 'PENDING' && invitation.expiresAt > new Date();
      if (invited && (await emailVerified(req))) {
        await approveInvited({ ...user, name: name ?? user.name }, role, invitation.id);
        audit(user, { action: 'user.role_changed', summary: `${name ?? user.name} joined as ${role} from an invitation`, targetType: 'user', targetId: user.id, metadata: { from: user.role, to: role, invitationId: invitation.id } }, req);
      } else {
        await startSignupApplication({ ...user, name: name ?? user.name }, role);
      }
    }
    return { ...(await getMe(user.id)), application: await currentApplication(user.id) };
  });
}

/** Whether the sign-in proves the person owns the email address (so an invitation can be trusted). */
async function emailVerified(req: Request) {
  const token = extractBearer(req.headers.get('authorization'));
  if (!token || token.startsWith('mock-token-')) return false;
  try {
    return (await verifyFirebaseIdToken(token)).email_verified === true;
  } catch {
    return false;
  }
}
