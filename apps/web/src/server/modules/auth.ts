import type { Router } from '../router';
import prisma from '@/lib/db';
import { BadRequestException, HttpException, UnauthorizedException } from '../http';
import { TERMS_VERSION } from '@/lib/terms-version';
import { extractBearer, forgetUser, isDemoAccount, isDemoLoginEnabled, isOwner, verifyFirebaseIdToken } from '../auth';
import { REQUESTABLE_ROLES, approveInvited, currentApplication, startSignupApplication } from './applications';
import { audit } from '../audit';
import { recordLogin } from '../logins';
import { sendEmail } from '../email';
import { authTimeOf, codeFor, codeMatches, hasPass, needsTwoStep, passFor, twoStepEnabled } from '../two-step';

const codeFails = new Map<string, { n: number; until: number }>();
const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, '$1•••$2');

const userSelect = {
  id: true, name: true, email: true, role: true, status: true, avatar: true,
  phone: true, googleId: true, onboardedAt: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

const getMe = (id: string) => prisma.user.findUnique({ where: { id }, select: userSelect });

export default function auth(router: Router) {
  const r = router.controller('auth');

  r.get('me', async ({ user }) => ({ ...(await getMe(user.id)), application: await currentApplication(user.id), ...(isOwner(user) ? { owner: true } : {}) }));

  // Two-step sign-in for admins and the owner (src/server/two-step.ts): email a code, then trade
  // the code for the pass the app sends with every request. Five wrong codes lock it for 15 min.
  r.get('two-step', ({ user, req }) => {
    const token = extractBearer(req.headers.get('authorization'));
    return { required: needsTwoStep(user.role, token), passed: hasPass(req, user.id, token) };
  });
  r.post('two-step/send', async ({ user, req }) => {
    const at = authTimeOf(extractBearer(req.headers.get('authorization')));
    if (at === null || !twoStepEnabled()) throw new BadRequestException('Two-step sign-in is not needed for this account.');
    const code = codeFor(user.id, at);
    const sent = await sendEmail(user.email, `UniVerse sign-in code: ${code}`,
      `<p>Your code to finish signing in to UniVerse is <b style="font-size:22px;letter-spacing:2px">${code}</b>.</p><p>It works for about 10 minutes. If you didn't just sign in, someone may know your password: change it now.</p>`,
      `Your code to finish signing in to UniVerse is ${code}. It works for about 10 minutes. If you didn't just sign in, change your password now.`);
    if (!sent) throw new BadRequestException('The code email could not be sent. Try again in a minute.');
    return { sentTo: maskEmail(user.email) };
  });
  r.post('two-step/verify', async ({ user, req, body }) => {
    const at = authTimeOf(extractBearer(req.headers.get('authorization')));
    if (at === null) throw new BadRequestException('Two-step sign-in is not needed for this account.');
    const f = codeFails.get(user.id);
    if (f && f.until > Date.now()) throw new BadRequestException('Too many wrong codes. Try again in 15 minutes.');
    if (!codeMatches(user.id, at, body?.code)) {
      const n = (f && f.until > Date.now() - 15 * 60_000 ? f.n : 0) + 1;
      codeFails.set(user.id, { n, until: n >= 5 ? Date.now() + 15 * 60_000 : 0 });
      throw new BadRequestException('That code is wrong or too old. Check the latest email, or send a new code.');
    }
    codeFails.delete(user.id);
    return { pass: passFor(user.id, at) };
  });

  // "Sign out everywhere" for your own account: every device has to sign in again.
  r.post('sign-out-everywhere', async ({ user }) => {
    await prisma.user.update({ where: { id: user.id }, data: { signedOutAt: new Date() } });
    forgetUser(user.id);
    return { ok: true };
  });

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
    // Spam guard: a burst of new accounts from one network (5+ in an hour), or from everywhere at
    // once (60+ in 10 minutes), is refused for a while. Real people are rarely affected; bots are.
    if (!user.onboardedAt) await refuseSignupBurst(req);
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
      // A student the school invited (Approvals → Invite) is verified at once, when the sign-in
      // proves they own the invited address; everyone else is checked by an admin.
      const invitation = await prisma.invitation.findUnique({ where: { email: user.email.toLowerCase() } });
      if (invitation && invitation.role === 'STUDENT' && invitation.status === 'PENDING' && invitation.expiresAt > new Date() && (await emailVerified(req))) {
        await approveInvited({ ...user, name: name ?? user.name }, 'STUDENT', invitation.id);
        audit(user, { action: 'user.role_changed', summary: `${name ?? user.name} joined as a verified student from an invitation`, targetType: 'user', targetId: user.id, metadata: { invitationId: invitation.id } }, req);
      } else {
        await startSignupApplication({ ...user, name: name ?? user.name }, 'STUDENT');
      }
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

async function refuseSignupBurst(req: Request) {
  const ip = req.headers.get('cf-connecting-ip');
  const [fromHere, everywhere] = await Promise.all([
    ip ? prisma.loginEvent.count({ where: { ip, kind: 'SIGN_UP', createdAt: { gt: new Date(Date.now() - 3_600_000) } } }) : Promise.resolve(0),
    prisma.user.count({ where: { onboardedAt: { gt: new Date(Date.now() - 600_000) } } }),
  ]);
  if (fromHere >= 5 || everywhere >= 60) {
    throw new HttpException({ message: 'Too many new accounts are being created right now. Please try again in an hour.', code: 'SIGNUP_BURST', error: 'Too Many Requests' }, 429);
  }
}
