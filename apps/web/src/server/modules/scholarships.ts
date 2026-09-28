import type { Router } from '../router';
import { ScholarshipsService } from '../services/scholarships.service';

const scholarships = new ScholarshipsService();

export default function scholarshipsModule(router: Router) {
  const r = router.controller('scholarships');

  r.get('', () => scholarships.findAll());
  r.get('my-applications', ({ user }) => scholarships.getMyApplications(user.id));
  r.post('', { roles: ['ADMIN'] }, ({ body }) => scholarships.create(body));
  r.post<{ id: string }>(':id/apply', ({ params, user, body }) => scholarships.apply(params.id, user.id, body));
  r.patch<{ id: string }>('applications/:id', { roles: ['ADMIN'] }, ({ params, body }) => scholarships.updateApplication(params.id, body));
}
