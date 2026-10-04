import { createHash } from 'node:crypto';
import type { Router } from '../router';
import { impactService as impact } from '../services/impact.service';
import { extractBearer, resolveUser } from '../auth';
import { CredentialDecisionDto, IssueCredentialDto, RequestCredentialDto, validate } from '../dto';
import prisma from '@/lib/db';
import { BadRequestException, ForbiddenException } from '../http';
import { audit } from '../audit';
import { later, notify } from '../email';

/** Tells the credential's owner about an admin decision (in-app + email). */
const notifyCredential = (id: string, verb: 'approved' | 'rejected' | 'revoked', reason?: string) =>
  later(async () => {
    const c = await prisma.impactCertificate.findUnique({ where: { id }, select: { userId: true, title: true } });
    if (!c) return;
    const title = { approved: 'Your credential was approved', rejected: 'Your credential request was not approved', revoked: 'A credential was revoked' }[verb];
    await notify(c.userId, {
      type: 'credential',
      title,
      body: `“${c.title}”${verb === 'approved' ? ' is now verified and signed. You can share it from your credentials page.' : reason ? `\nReason: ${reason}` : ''}`,
      link: '/student/credentials',
    });
  });

const credentialLabel = async (id: string) => {
  const c = await prisma.impactCertificate.findUnique({ where: { id }, select: { title: true, certificateCode: true, user: { select: { name: true } } } });
  return c ? `“${c.title}” (${c.certificateCode}) for ${c.user.name}` : 'a credential';
};
const userName = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'a user';

export default function impactModule(router: Router) {
  const r = router.controller('impact');

  // Core
  r.get('leaderboard', () => impact.getLeaderboard());
  r.get('dashboard/stats', ({ user }) => impact.getDashboardStats(user.id));
  r.get('my-points', ({ user }) => impact.getMyPoints(user.id));
  r.get('my-level', ({ user }) => impact.getMyLevel(user.id));
  // Teachers can award up to 500 points at a time, only to students in their own courses.
  r.post('award-points', { roles: ['ADMIN', 'TEACHER'] }, async ({ body, user, req }) => {
    const points = Number(body?.points);
    const max = user.role === 'ADMIN' ? 10_000 : 500;
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > max) throw new BadRequestException(`points must be a whole number between -${max} and ${max}`);
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (!reason) throw new BadRequestException('reason is required');
    if (typeof body?.userId !== 'string') throw new BadRequestException('userId is required');
    if (user.role !== 'ADMIN') {
      const teaches = await prisma.enrollment.findFirst({ where: { studentId: body.userId, course: { teacherId: user.id } }, select: { id: true } });
      if (!teaches) throw new ForbiddenException('You can only award points to students in your courses.');
    }
    const result = await impact.awardPoints(body.userId, {
      points,
      reason,
      sourceType: typeof body.sourceType === 'string' ? body.sourceType.slice(0, 40) : 'MANUAL',
      sourceId: typeof body.sourceId === 'string' ? body.sourceId.slice(0, 100) : null,
    });
    audit(user, async () => ({
      action: 'impact.points_awarded',
      summary: `Awarded ${result.points} impact points to ${await userName(result.userId)}${result.reason ? ` (${result.reason})` : ''}`,
      targetType: 'user',
      targetId: result.userId,
      metadata: { points: result.points, reason: result.reason },
    }), req);
    return result;
  });

  // NGOs & projects
  r.get('ngos', ({ query }) => impact.getNGOs(query));
  r.get('ngo-projects', ({ query }) => impact.getNGOProjects(query));
  r.post<{ id: string }>('ngo-projects/:id/apply', ({ params, user, body }) => impact.applyToNGOProject(params.id, user.id, body));

  // Startups
  r.get('startups', () => impact.getStartups());
  r.post<{ id: string }>('startups/:id/apply', ({ params, user, body }) => impact.applyToStartup(params.id, user.id, body));

  // Summits
  r.get('summits', () => impact.getSummits());
  r.post<{ id: string }>('summits/:id/register', ({ params, user }) => impact.registerForSummit(params.id, user.id));
  r.get('summits/my-registrations', ({ user }) => impact.getMyRegistrations(user.id));

  // Verified credentials
  r.get('blockchain-credentials', ({ user }) => impact.getMyBlockchainCredentials(user.id));
  r.post('blockchain-credentials/request', ({ user, body }) => impact.requestCredential(user.id, validate<RequestCredentialDto>(RequestCredentialDto, body)));
  r.get('blockchain-credentials/pending', { roles: ['ADMIN'] }, () => impact.getPendingCredentialRequests());
  r.get('blockchain-credentials/recent', { roles: ['ADMIN'] }, () => impact.getRecentCredentialDecisions());
  r.post('blockchain-credentials/issue', { roles: ['ADMIN'] }, async ({ user, body, req }) => {
    const dto = validate<IssueCredentialDto>(IssueCredentialDto, body);
    const result = await impact.issueCredentialDirect({ id: user.id, name: user.name }, dto);
    const id = (result as { id?: string })?.id;
    audit(user, async () => ({
      action: 'credential.issued',
      summary: `Issued credential ${id ? await credentialLabel(id) : `“${dto.title}”`}`,
      targetType: 'credential',
      targetId: id,
    }), req);
    return result;
  });
  r.post('blockchain-credentials/legacy/send-to-review', { roles: ['ADMIN'] }, () => impact.sendLegacyCredentialsToReview());
  r.post('blockchain-credentials/anchor/retry', { roles: ['ADMIN'] }, () => impact.anchorOutstandingCredentials());
  r.post<{ id: string }>('blockchain-credentials/:id/approve', { roles: ['ADMIN'] }, async ({ params, user, req }) => {
    const result = await impact.approveCredential(params.id, { id: user.id, name: user.name });
    audit(user, async () => ({ action: 'credential.approved', summary: `Approved and signed ${await credentialLabel(params.id)}`, targetType: 'credential', targetId: params.id }), req);
    notifyCredential(params.id, 'approved');
    return result;
  });
  r.post<{ id: string }>('blockchain-credentials/:id/reject', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const { reason } = validate<CredentialDecisionDto>(CredentialDecisionDto, body);
    const result = await impact.rejectCredential(params.id, reason);
    audit(user, async () => ({ action: 'credential.rejected', summary: `Rejected ${await credentialLabel(params.id)}${reason ? `: ${reason}` : ''}`, targetType: 'credential', targetId: params.id }), req);
    notifyCredential(params.id, 'rejected', reason);
    return result;
  });
  r.post<{ id: string }>('blockchain-credentials/:id/revoke', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const { reason } = validate<CredentialDecisionDto>(CredentialDecisionDto, body);
    const result = await impact.revokeCredential(params.id, reason);
    audit(user, async () => ({ action: 'credential.revoked', summary: `Revoked ${await credentialLabel(params.id)}${reason ? `: ${reason}` : ''}`, targetType: 'credential', targetId: params.id }), req);
    notifyCredential(params.id, 'revoked', reason);
    return result;
  });

  // AI project matching
  r.get('ai-match', ({ user }) => impact.getAIProjectMatches(user.id));

  // Legacy certificates
  r.get('certificates', ({ user }) => impact.getCertificates(user.id));
  r.post('certificates/request', ({ user, body }) => impact.requestCertificate(user.id, body.title));
  r.get('certificates/pending', { roles: ['ADMIN'] }, () => impact.getPendingCertificateRequests());
  r.post<{ id: string }>('certificates/:id/approve', { roles: ['ADMIN'] }, async ({ params, user, req }) => {
    const doc = await impact.approveCertificate(params.id);
    audit(user, async () => ({ action: 'certificate.approved', summary: `Approved certificate “${doc.title}” for ${await userName(doc.userId)}`, targetType: 'certificate', targetId: params.id }), req);
    later(() => notify(doc.userId, { title: 'Your certificate is ready', body: `“${doc.title}” was approved. You can download it now.`, link: '/student/impact/certifications', type: 'credential', email: false }));
    return doc;
  });
  r.post<{ id: string }>('certificates/:id/reject', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const doc = await impact.rejectCertificate(params.id);
    audit(user, async () => ({ action: 'certificate.rejected', summary: `Turned down certificate “${doc.title}” for ${await userName(doc.userId)}${reason ? `: ${reason}` : ''}`, targetType: 'certificate', targetId: params.id }), req);
    later(() => notify(doc.userId, { title: 'Your certificate request was not approved', body: `“${doc.title}”${reason ? `\nReason: ${reason}` : ''}\nYou can request it again once the details are in order.`, link: '/student/impact/certifications', type: 'credential', email: false }));
    return { ok: true };
  });

  // Opened in a new tab (window.open), so the token may come as ?token= instead of a header.
  r.get<{ id: string }>('certificates/:id/pdf', { public: true }, async ({ params, req, query }) => {
    const viewer = await resolveUser(extractBearer(req.headers.get('authorization')) ?? (typeof query.token === 'string' ? query.token : null));
    try {
      const html = await impact.generateCertificateHtml(params.id, viewer);
      // Only the page's own print script may run (plus its fonts and styles).
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': `default-src 'none'; script-src ${scripts.join(' ') || "'none'"}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        },
      });
    } catch (error) {
      return new Response((error as Error).message, { status: 404 });
    }
  });

  // Public credential verification (/verify/[id] page, employers).
  const verify = router.controller('verify', { public: true });
  verify.get('public-key', () => impact.getCredentialPublicKey());
  verify.get<{ idOrCode: string }>(':idOrCode', ({ params }) => impact.verifyCredentialPublic(params.idOrCode));
}
