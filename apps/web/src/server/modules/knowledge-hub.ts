import type { Router } from '../router';
import { KnowledgeHubService } from '../services/knowledge-hub.service';
import { CreateKnowledgeHubDto, UpdateKnowledgeHubDto, validate } from '../dto';

const hub = new KnowledgeHubService();
const anyRole = { roles: ['STUDENT', 'TEACHER', 'ADMIN'] as ('STUDENT' | 'TEACHER' | 'ADMIN')[] };

export default function knowledgeHubModule(router: Router) {
  const r = router.controller('knowledge-hub');

  r.post('', anyRole, ({ body, user }) => hub.create(validate<CreateKnowledgeHubDto>(CreateKnowledgeHubDto, body), user.id));
  r.get('', () => hub.findAll());
  r.get('public', () => hub.findPublic());
  r.get<{ id: string }>(':id', ({ params }) => hub.findOne(params.id));
  r.patch<{ id: string }>(':id', anyRole, ({ params, body }) => hub.update(params.id, validate<UpdateKnowledgeHubDto>(UpdateKnowledgeHubDto, body)));
  r.delete<{ id: string }>(':id', anyRole, ({ params }) => hub.remove(params.id));
}
