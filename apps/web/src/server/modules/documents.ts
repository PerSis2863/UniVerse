import type { Router } from '../router';
import { DocumentsService } from '../services/documents.service';

const documents = new DocumentsService();

export default function documentsModule(router: Router) {
  const r = router.controller('documents');

  r.get('', { roles: ['ADMIN'] }, () => documents.findAll());
  r.get('my', ({ user }) => documents.findByUser(user.id));
  r.post('', ({ user, body }) => documents.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, user, body }) => documents.update(params.id, user.id, body));
  r.delete<{ id: string }>(':id', ({ params, user }) => documents.remove(params.id, user.id));
}
