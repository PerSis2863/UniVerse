import type { Router } from '../router';
import { ElectivesService } from '../services/electives.service';

const electives = new ElectivesService();

export default function electivesModule(router: Router) {
  const r = router.controller('electives');

  r.get('available', ({ user }) => electives.getAvailableElectives(user.id));
  r.get('my', ({ user }) => electives.getMyElectives(user.id));
  r.post('select', ({ user, body }) => electives.selectElective(user.id, body));
  r.patch<{ id: string }>(':id/withdraw', ({ params, user }) => electives.withdrawElective(params.id, user.id));
  r.get('major-requests', ({ user }) => electives.getMyMajorRequests(user.id));
  r.post('major-requests', ({ user, body }) => electives.submitMajorRequest(user.id, body));
  r.patch<{ id: string }>('major-requests/:id/review', ({ params, user, body }) => electives.reviewMajorRequest(params.id, user, body));
}
