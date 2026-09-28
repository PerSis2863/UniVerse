import type { Router } from '../router';
import { ScholarshipsService } from '../services/scholarships.service';
import { audit } from '../audit';

const scholarships = new ScholarshipsService();

export default function scholarshipsModule(router: Router) {
  const r = router.controller('scholarships');

  r.get('', () => scholarships.findAll());
  r.get('my-applications', ({ user }) => scholarships.getMyApplications(user.id));
  r.post('', { roles: ['ADMIN'] }, async ({ body, user, req }) => {
    const s = await scholarships.create(body);
    audit(user, { action: 'scholarship.created', summary: `Created scholarship “${(s as { name?: string; title?: string }).name ?? (s as { title?: string }).title ?? 'untitled'}”`, targetType: 'scholarship', targetId: (s as { id: string }).id }, req);
    return s;
  });
  r.post<{ id: string }>(':id/apply', ({ params, user, body }) => scholarships.apply(params.id, user.id, body));
  r.patch<{ id: string }>('applications/:id', { roles: ['ADMIN'] }, async ({ params, body, user, req }) => {
    const app = await scholarships.updateApplication(params.id, body);
    if (body?.status) {
      audit(user, { action: 'scholarship.application_decided', summary: `Set a scholarship application to ${body.status}`, targetType: 'scholarship_application', targetId: params.id, metadata: { status: body.status } }, req);
    }
    return app;
  });
}
