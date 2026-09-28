import type { Router } from '../router';
import { AssociationsService } from '../services/associations.service';

const associations = new AssociationsService();

export default function associationsModule(router: Router) {
  const r = router.controller('associations');

  r.get('', () => associations.findAll());
  r.get('my-memberships', ({ user }) => associations.getUserMemberships(user.id));
  r.get<{ id: string }>(':id', ({ params }) => associations.findOne(params.id));
  r.post<{ id: string }>(':id/join', ({ params, user }) => associations.join(params.id, user.id));
  r.delete<{ id: string }>(':id/leave', ({ params, user }) => associations.leave(params.id, user.id));
  r.post('', ({ body, user }) => associations.create(body, user.id));
  r.patch<{ id: string }>(':id/status', ({ params, body }) => associations.updateStatus(params.id, body.status));
  r.patch<{ id: string }>(':id', ({ params, body }) => associations.update(params.id, body));
}
