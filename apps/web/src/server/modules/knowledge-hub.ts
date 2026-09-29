import type { Router } from '../router';
import { KnowledgeHubService } from '../services/knowledge-hub.service';
import { CreateKnowledgeHubDto, UpdateKnowledgeHubDto, validate } from '../dto';
import { assertOwnerOrAdmin } from '../access';

const hub = new KnowledgeHubService();
const anyRole = { roles: ['STUDENT', 'TEACHER', 'ADMIN'] as ('STUDENT' | 'TEACHER' | 'ADMIN')[] };

export default function knowledgeHubModule(router: Router) {
  const r = router.controller('knowledge-hub');

  r.post('', anyRole, ({ body, user }) => hub.create(validate<CreateKnowledgeHubDto>(CreateKnowledgeHubDto, body), user.id));
  r.get('', ({ user }) => hub.findAll(user));
  r.get('public', () => hub.findPublic());
  r.get<{ id: string }>(':id', ({ params, user }) => hub.findOne(params.id, user));
  // Only the author (or an admin) can change or delete a resource.
  r.patch<{ id: string }>(':id', anyRole, async ({ params, body, user }) => {
    const dto = validate<UpdateKnowledgeHubDto>(UpdateKnowledgeHubDto, body);
    assertOwnerOrAdmin((await hub.findOne(params.id, user)).authorId, user, 'a resource');
    return hub.update(params.id, dto);
  });
  r.delete<{ id: string }>(':id', anyRole, async ({ params, user }) => {
    assertOwnerOrAdmin((await hub.findOne(params.id, user)).authorId, user, 'a resource');
    return hub.remove(params.id);
  });
}
