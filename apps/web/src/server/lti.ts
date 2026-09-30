import { randomBytes } from 'node:crypto';
import { jwtVerify, type JWTPayload } from 'jose';
import { jwksFor, keysMayHaveRotated } from './jwks-cache';
import prisma from '@/lib/db';
import { publicAppUrl } from './services/credential-signer';
import { issueSessionToken } from './session-token';

// LTI 1.3 (1EdTech) tool: lets a university open UniVerse from Moodle, Canvas, Blackboard, Brightspace…
// with the person already signed in and the course linked.
//
//   1. The LMS calls /api/lti/login (OIDC third-party login). We check the LMS is registered, keep a
//      one-time state + nonce, and send the browser back to the LMS's authorisation endpoint.
//   2. The LMS posts a signed id_token to /api/lti/launch. We verify its signature with the LMS's
//      public keys (JWKS), issuer, audience, expiry, nonce (once only) and deployment.
//   3. We find or create the UniVerse user (by LMS user id, then by email if the LMS is trusted
//      for emails) and the course (created by the first instructor launch), enrol learners,
//      and sign the person in with a short-lived UniVerse session.

export const LTI_VERSION = '1.3.0';
const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const STATE_TTL_MS = 10 * 60_000;

export const toolUrls = () => {
  const base = publicAppUrl();
  return {
    loginUrl: `${base}/api/lti/login`,
    launchUrl: `${base}/api/lti/launch`,
    redirectUris: [`${base}/api/lti/launch`],
    jwksUrl: `${base}/api/lti/jwks`,
    domain: new URL(base).host,
  };
};

export class LtiError extends Error {}

function asString(v: unknown, max = 500) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Step 1: OIDC login initiation. Returns the URL to send the browser to. */
export async function startLogin(params: URLSearchParams) {
  const iss = asString(params.get('iss'));
  const loginHint = asString(params.get('login_hint'), 2000);
  const targetLinkUri = asString(params.get('target_link_uri'), 2000);
  const clientId = asString(params.get('client_id'));
  const messageHint = asString(params.get('lti_message_hint'), 4000);
  if (!iss || !loginHint) throw new LtiError('The LMS didn’t send the expected sign-in details (iss, login_hint).');

  const platforms = await prisma.ltiPlatform.findMany({ where: { issuer: iss, isActive: true, ...(clientId ? { clientId } : {}) } });
  if (platforms.length !== 1) throw new LtiError(platforms.length ? 'Several registrations match this LMS; it must send its client_id.' : 'This LMS isn’t registered with UniVerse. Ask your UniVerse administrator to add it.');
  const platform = platforms[0];

  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  await prisma.ltiNonce.create({ data: { platformId: platform.id, state, nonce, targetLinkUri: targetLinkUri || null } });
  // Housekeeping: forget old, unused states.
  void prisma.ltiNonce.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STATE_TTL_MS * 6) } } }).catch(() => {});

  const url = new URL(platform.authLoginUrl);
  const q = url.searchParams;
  q.set('scope', 'openid');
  q.set('response_type', 'id_token');
  q.set('response_mode', 'form_post');
  q.set('prompt', 'none');
  q.set('client_id', platform.clientId);
  q.set('redirect_uri', toolUrls().launchUrl);
  q.set('login_hint', loginHint);
  q.set('state', state);
  q.set('nonce', nonce);
  if (messageHint) q.set('lti_message_hint', messageHint);
  return { redirect: url.toString(), state };
}

const INSTRUCTOR = /#(Instructor|Administrator|ContentDeveloper|Mentor|TeachingAssistant)$|\/(Instructor|Administrator)$/;

/** Step 2: validates the launch and signs the person in. */
export async function completeLaunch(idToken: string, state: string, cookieState: string | null) {
  if (!idToken || !state) throw new LtiError('The LMS didn’t send a launch token.');
  if (cookieState && cookieState !== state) throw new LtiError('This launch doesn’t match the sign-in that started it. Please open the link again from your course.');
  const pending = await prisma.ltiNonce.findUnique({ where: { state } });
  if (!pending || pending.used || Date.now() - pending.createdAt.getTime() > STATE_TTL_MS) throw new LtiError('This launch has expired or was already used. Please open the link again from your course.');
  await prisma.ltiNonce.update({ where: { id: pending.id }, data: { used: true } });
  const platform = await prisma.ltiPlatform.findUnique({ where: { id: pending.platformId } });
  if (!platform || !platform.isActive) throw new LtiError('This LMS registration is no longer active.');

  let claims: JWTPayload & Record<string, unknown>;
  const verify = async (fresh: boolean) => jwtVerify(idToken, await jwksFor(platform.jwksUrl, fresh), { issuer: platform.issuer, audience: platform.clientId, algorithms: ['RS256', 'RS384', 'RS512', 'ES256'], clockTolerance: 60 });
  try {
    try {
      ({ payload: claims } = await verify(false));
    } catch (e) {
      if (!keysMayHaveRotated(e)) throw e;
      ({ payload: claims } = await verify(true)); // the LMS may have rotated its keys
    }
  } catch (e) {
    throw new LtiError(`The launch token couldn’t be verified (${(e as Error).message}).`);
  }
  if (claims.nonce !== pending.nonce) throw new LtiError('The launch token wasn’t issued for this sign-in (nonce mismatch).');
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== platform.clientId) throw new LtiError('The launch token is for a different tool (azp).');
  if (claims[`${CLAIM}version`] !== LTI_VERSION) throw new LtiError('Only LTI 1.3 launches are supported.');
  const messageType = claims[`${CLAIM}message_type`];
  if (messageType !== 'LtiResourceLinkRequest') throw new LtiError(`This kind of LTI message isn’t supported yet (${String(messageType)}).`);
  const deploymentId = asString(claims[`${CLAIM}deployment_id`]);
  const allowed = Array.isArray(platform.deploymentIds) ? (platform.deploymentIds as unknown[]).map(String) : [];
  if (!deploymentId || (allowed.length && !allowed.includes(deploymentId))) throw new LtiError('This deployment of UniVerse isn’t registered for your LMS.');

  const sub = asString(claims.sub);
  if (!sub) throw new LtiError('The LMS didn’t say who you are (anonymous launches aren’t supported).');
  const roles = (Array.isArray(claims[`${CLAIM}roles`]) ? (claims[`${CLAIM}roles`] as unknown[]) : []).map(String);
  const instructor = roles.some((r) => INSTRUCTOR.test(r));
  const email = asString(claims.email, 200).trim().toLowerCase();
  const name = asString(claims.name, 120) || [asString(claims.given_name, 60), asString(claims.family_name, 60)].filter(Boolean).join(' ') || email.split('@')[0] || 'LMS user';
  const context = (claims[`${CLAIM}context`] ?? {}) as { id?: string; title?: string; label?: string };

  // Person
  const link = await prisma.ltiUser.findUnique({ where: { platformId_sub: { platformId: platform.id, sub } } });
  let user = link ? await prisma.user.findUnique({ where: { id: link.userId } }) : null;
  if (!user && email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Linking to an existing account by email is only safe when the LMS verifies emails, so it's
      // opt-in per LMS — and never for admin accounts.
      if (!platform.trustEmails || existing.role === 'ADMIN') throw new LtiError('A UniVerse account with your email already exists. Sign in to UniVerse directly, or ask your administrator to allow linking accounts by email for this LMS.');
      user = existing;
    }
  }
  if (!user) {
    if (!email) throw new LtiError('The LMS didn’t share an email address. Ask your administrator to enable sharing names and emails with UniVerse.');
    user = await prisma.user.create({ data: { email, name, role: instructor ? 'TEACHER' : 'STUDENT', status: 'ACTIVE', onboardedAt: new Date() } }); // the LMS vouches for them
    if (!instructor) await prisma.studentProfile.create({ data: { userId: user.id } }).catch(() => {});
  }
  if (user.status === 'SUSPENDED') throw new LtiError('Your UniVerse account is suspended. Please contact your administrator.');
  if (!link) await prisma.ltiUser.create({ data: { platformId: platform.id, sub, userId: user.id } }).catch(() => {});

  // Course
  let courseId: string | null = null;
  if (context.id) {
    const ctx = await prisma.ltiContext.findUnique({ where: { platformId_contextId: { platformId: platform.id, contextId: String(context.id).slice(0, 255) } } });
    if (ctx) courseId = ctx.courseId;
    else if (instructor && user.role === 'TEACHER') {
      const label = (context.label || context.title || 'LMS course').slice(0, 30);
      const code = `${label.replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 16) || 'LMS'}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const course = await prisma.course.create({ data: { code, name: (context.title || label).slice(0, 120), teacherId: user.id, status: 'PUBLISHED', description: `Linked from ${platform.name}.` } });
      await prisma.ltiContext.create({ data: { platformId: platform.id, contextId: String(context.id).slice(0, 255), courseId: course.id, title: (context.title || label).slice(0, 200) } });
      courseId = course.id;
    }
    if (courseId && user.role === 'STUDENT') {
      await prisma.enrollment.upsert({ where: { studentId_courseId: { studentId: user.id, courseId } }, update: {}, create: { studentId: user.id, courseId } });
    }
  }

  const home = user.role === 'TEACHER' ? '/teacher' : user.role === 'ADMIN' ? '/admin' : '/student';
  const landing = courseId ? (user.role === 'STUDENT' ? `/student/courses/${courseId}` : user.role === 'TEACHER' ? '/teacher/courses' : '/admin/courses') : home;
  return {
    token: issueSessionToken(user.id, 'lti'),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, avatar: user.avatar, createdAt: user.createdAt },
    landing,
    platformName: platform.name,
  };
}
