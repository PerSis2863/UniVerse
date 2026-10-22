import type { Router } from '../router';
import { SafetyService } from '../services/safety.service';
import { audit } from '../audit';

const safety = new SafetyService();

export default function safetyModule(router: Router) {
  const r = router.controller('safety');

  r.get('', { roles: ['ADMIN'] }, ({ user }) => safety.findAll(user));
  r.post('report', ({ user, body }) => safety.create(user, body));
  r.patch<{ id: string }>(':id/resolve', { roles: ['ADMIN'] }, async ({ params, user, req }) => {
    const alert = await safety.resolve(params.id, user);
    audit(user, { action: 'safety.resolved', summary: 'Resolved a safety report', targetType: 'safety_alert', targetId: params.id }, req);
    return alert;
  });
}
