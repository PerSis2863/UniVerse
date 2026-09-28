import type { Router } from '../router';
import { SafetyService } from '../services/safety.service';

const safety = new SafetyService();

export default function safetyModule(router: Router) {
  const r = router.controller('safety');

  r.get('', { roles: ['ADMIN'] }, () => safety.findAll());
  r.post('report', ({ user, body }) => safety.create(user.id, body));
  r.patch<{ id: string }>(':id/resolve', { roles: ['ADMIN'] }, ({ params }) => safety.resolve(params.id));
}
