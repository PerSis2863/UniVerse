import type { Router } from '../router';
import { impactService as impact } from '../services/impact.service';
import { extractBearer, resolveUser } from '../auth';
import { CredentialDecisionDto, IssueCredentialDto, RequestCredentialDto, validate } from '../dto';

export default function impactModule(router: Router) {
  const r = router.controller('impact');

  // Core
  r.get('leaderboard', () => impact.getLeaderboard());
  r.get('dashboard/stats', ({ user }) => impact.getDashboardStats(user.id));
  r.get('my-points', ({ user }) => impact.getMyPoints(user.id));
  r.get('my-level', ({ user }) => impact.getMyLevel(user.id));
  r.post('award-points', { roles: ['ADMIN', 'TEACHER'] }, ({ body }) => impact.awardPoints(body.userId, body));

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
  r.post('blockchain-credentials/issue', { roles: ['ADMIN'] }, ({ user, body }) =>
    impact.issueCredentialDirect({ id: user.id, name: user.name }, validate<IssueCredentialDto>(IssueCredentialDto, body)),
  );
  r.post('blockchain-credentials/legacy/send-to-review', { roles: ['ADMIN'] }, () => impact.sendLegacyCredentialsToReview());
  r.post('blockchain-credentials/anchor/retry', { roles: ['ADMIN'] }, () => impact.anchorOutstandingCredentials());
  r.post<{ id: string }>('blockchain-credentials/:id/approve', { roles: ['ADMIN'] }, ({ params, user }) => impact.approveCredential(params.id, { id: user.id, name: user.name }));
  r.post<{ id: string }>('blockchain-credentials/:id/reject', { roles: ['ADMIN'] }, ({ params, body }) =>
    impact.rejectCredential(params.id, validate<CredentialDecisionDto>(CredentialDecisionDto, body).reason),
  );
  r.post<{ id: string }>('blockchain-credentials/:id/revoke', { roles: ['ADMIN'] }, ({ params, body }) =>
    impact.revokeCredential(params.id, validate<CredentialDecisionDto>(CredentialDecisionDto, body).reason),
  );

  // AI project matching
  r.get('ai-match', ({ user }) => impact.getAIProjectMatches(user.id));

  // Legacy certificates
  r.get('certificates', ({ user }) => impact.getCertificates(user.id));
  r.post('certificates/request', ({ user, body }) => impact.requestCertificate(user.id, body.title));
  r.get('certificates/pending', { roles: ['ADMIN'] }, () => impact.getPendingCertificateRequests());
  r.post<{ id: string }>('certificates/:id/approve', { roles: ['ADMIN'] }, ({ params }) => impact.approveCertificate(params.id));

  // Opened in a new tab (window.open), so the token may come as ?token= instead of a header.
  r.get<{ id: string }>('certificates/:id/pdf', { public: true }, async ({ params, req, query }) => {
    await resolveUser(extractBearer(req.headers.get('authorization')) ?? (typeof query.token === 'string' ? query.token : null));
    try {
      const html = await impact.generateCertificateHtml(params.id);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (error) {
      return new Response((error as Error).message, { status: 404 });
    }
  });

  // Public credential verification (/verify/[id] page, employers).
  const verify = router.controller('verify', { public: true });
  verify.get('public-key', () => impact.getCredentialPublicKey());
  verify.get<{ idOrCode: string }>(':idOrCode', ({ params }) => impact.verifyCredentialPublic(params.idOrCode));
}
