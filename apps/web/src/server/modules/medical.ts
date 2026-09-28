import type { Router } from '../router';
import { MedicalService } from '../services/medical.service';

const medical = new MedicalService();

export default function medicalModule(router: Router) {
  const r = router.controller('medical');

  r.get('my', ({ user }) => medical.getMyRecord(user.id));
  r.post('my', ({ user, body }) => medical.upsert(user.id, body));
}
