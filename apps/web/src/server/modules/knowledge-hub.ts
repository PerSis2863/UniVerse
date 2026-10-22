import type { Router } from '../router';
import { KnowledgeHubService } from '../services/knowledge-hub.service';
import { CreateKnowledgeHubDto, UpdateKnowledgeHubDto, validate } from '../dto';

const hub = new KnowledgeHubService();
const anyRole = { roles: ['STUDENT', 'TEACHER', 'ADMIN'] as ('STUDENT' | 'TEACHER' | 'ADMIN')[] };

export default function knowledgeHubModule(router: Router) {
  const r = router.controller('knowledge-hub');

  r.post('', anyRole, ({ body, user }) => hub.create(validate<CreateKnowledgeHubDto>(CreateKnowledgeHubDto, body), user.id));
  r.get('', ({ user }) => hub.findAll(user));
  r.get('public', () => hub.findPublic());
  r.get<{ id: string }>(':id', async ({ params, user }) => (await hub.findOne(params.id, user)).resource);
  // Only the author (or an admin of their school) can change or delete a resource.
  r.patch<{ id: string }>(':id', anyRole, async ({ params, body, user }) => {
    const dto = validate<UpdateKnowledgeHubDto>(UpdateKnowledgeHubDto, body);
    await hub.assertCanChange(params.id, user);
    return hub.update(params.id, dto);
  });
  r.delete<{ id: string }>(':id', anyRole, async ({ params, user }) => {
    await hub.assertCanChange(params.id, user);
    return hub.remove(params.id);
  });
}
