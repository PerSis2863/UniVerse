import type { Router } from '../router';
import { InternshipsService } from '../services/internships.service';

const internships = new InternshipsService();

export default function internshipsModule(router: Router) {
  const r = router.controller('internships');

  r.get('', ({ query }) => internships.findAll(query));
  r.get('my-applications', ({ user }) => internships.getMyApplications(user.id));
  r.get<{ id: string }>(':id', ({ params, user }) => internships.findOne(params.id, user));
  r.post('', { roles: ['ADMIN', 'TEACHER', 'INDUSTRY_MENTOR'] }, ({ user, body }) => internships.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, body, user }) => internships.update(params.id, body, user));
  r.delete<{ id: string }>(':id', ({ params, user }) => internships.remove(params.id, user));
  r.post<{ id: string }>(':id/apply', ({ params, user, body }) => internships.apply(params.id, user.id, body));
  r.patch<{ id: string }>('applications/:id', ({ params, body, user }) => internships.updateApplication(params.id, body, user));
}
