import type { Router } from '../router';
import { ConsentsService } from '../services/consents.service';

const consents = new ConsentsService();

export default function consentsModule(router: Router) {
  const r = router.controller('consents');

  r.get('my', ({ user }) => consents.getMyConsents(user.id));
  r.post('upsert', ({ user, body }) => consents.upsertConsent(user.id, body.type, body.granted));
}
